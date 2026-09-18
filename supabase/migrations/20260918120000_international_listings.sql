-- M22 — Canada and UK listing locations, immutable service/booking currency,
-- and country-scoped proximity search. Additive rollout: existing rows and
-- old application insert shapes remain US/USD; the original RPC stays intact.
-- No table grants or RLS policies change (M14 remains the source of truth).

alter table public.trainers
  add column country_code text not null default 'US',
  add column postal_area text,
  add constraint trainers_country_code_check check (country_code in ('US', 'CA', 'GB')),
  add constraint trainers_postal_area_check check (
    postal_area is null or
    (country_code = 'US' and postal_area ~ '^[0-9]{5}$') or
    (country_code = 'CA' and postal_area ~ '^[ABCEGHJ-NPRSTVXY][0-9][ABCEGHJ-NPRSTV-Z]$') or
    (country_code = 'GB' and postal_area ~ '^(GIR|[A-Z]{1,2}[0-9][0-9A-Z]?)$')
  );
comment on column public.trainers.country_code is
  'Listing country: US, CA, or GB (including Northern Ireland). Existing trainers default to US without changing their location.';
comment on column public.trainers.postal_area is
  'Normalized approximate search area: US ZIP, Canadian FSA, or UK outward code. Never a full Canadian/UK postal code. Legacy locations stay NULL until supplied by the trainer.';

create type public.currency_code as enum ('USD', 'CAD', 'GBP');
alter table public.trainer_services
  add column currency public.currency_code not null default 'USD';
alter table public.bookings
  add column currency public.currency_code not null default 'USD';
comment on table public.trainer_services is
  'Bookable services. price_cents is integer minor units in the immutable currency. Retiring a service preserves booking history.';
comment on column public.trainer_services.price_cents is
  'Integer minor units of currency, from 1 to 100000000. All supported currencies have two decimal places.';
comment on column public.trainer_services.currency is
  'Set from trainer country at INSERT (US/USD, CA/CAD, GB/GBP), then immutable. Moving country does not relabel an existing service; create a newly priced service to change currency.';
comment on column public.bookings.price_cents is
  'Immutable integer minor-unit snapshot of the service price at booking INSERT, interpreted in bookings.currency.';
comment on column public.bookings.currency is
  'Immutable snapshot of trainer_services.currency, validated together with price and duration at INSERT. Never inferred from a trainer country or later service edits.';

-- A trainer can see their own listing through existing RLS. This trigger
-- needs no elevated access; its lookup uses the same INVOKER context as DML.
create function public.trainer_services_validate_currency()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_country text;
  v_currency public.currency_code;
begin
  if TG_OP = 'UPDATE' then
    if NEW.currency is distinct from OLD.currency then
      raise exception 'Service currency is immutable';
    end if;
    return NEW;
  end if;

  select country_code into v_country from public.trainers where id = NEW.trainer_id;
  if not found then
    raise exception 'Trainer not found for service' using errcode = 'foreign_key_violation';
  end if;
  v_currency := case v_country
    when 'US' then 'USD'::public.currency_code
    when 'CA' then 'CAD'::public.currency_code
    when 'GB' then 'GBP'::public.currency_code
  end;
  if NEW.currency is distinct from v_currency then
    raise exception 'Service currency % does not match trainer country %', NEW.currency, v_country
      using errcode = 'check_violation';
  end if;
  return NEW;
end;
$$;
comment on function public.trainer_services_validate_currency() is
  'INVOKER integrity guard using the trainer listing already visible to its owner. New service currency matches country; existing currency never changes, including after a move.';
revoke execute on function public.trainer_services_validate_currency()
  from public, anon, authenticated, service_role;
create trigger trg_trainer_services_validate_currency
  before insert or update on public.trainer_services
  for each row execute function public.trainer_services_validate_currency();

-- Preserve the complete M6 INSERT guard and latest M11 UPDATE state machine;
-- only the new currency snapshot check/immutability clause is added.
create or replace function public.bookings_validate_insert()
returns trigger
language plpgsql
as $$
declare
  v_service_trainer_id  uuid;
  v_service_price       integer;
  v_service_duration    integer;
  v_service_currency    public.currency_code;
begin
  -- Entry-state gates
  if NEW.status is distinct from 'PENDING' then
    raise exception 'Bookings must enter at status=PENDING (got %)', NEW.status
      using errcode = 'check_violation';
  end if;

  if NEW.cancelled_at is not null
     or NEW.cancelled_by is not null
     or NEW.completed_at is not null then
    raise exception 'cancelled_at/cancelled_by/completed_at must be NULL at INSERT'
      using errcode = 'check_violation';
  end if;

  -- Owner role gate (FK target asymmetry — see header).
  if not exists (
    select 1 from public.profiles
    where id = NEW.owner_id and role = 'owner'
  ) then
    raise exception 'owner_id % is not a profile with role=owner', NEW.owner_id
      using errcode = 'foreign_key_violation';
  end if;

  -- G1: dog ownership gate + soft-delete filter.
  if not exists (
    select 1 from public.dogs
    where id = NEW.dog_id
      and owner_id = NEW.owner_id
      and deleted_at is null
  ) then
    raise exception 'Booking dog_id % does not belong to owner_id % or dog is not active',
      NEW.dog_id, NEW.owner_id
      using errcode = 'foreign_key_violation';
  end if;

  -- G2 + G3: service-trainer alignment + denormalization fidelity
  -- (single SELECT, soft-delete filtered).
  select trainer_id, price_cents, duration_minutes, currency
    into v_service_trainer_id, v_service_price, v_service_duration, v_service_currency
    from public.trainer_services
    where id = NEW.service_id
      and deleted_at is null;

  if not found then
    raise exception 'service_id % not found or not active', NEW.service_id
      using errcode = 'foreign_key_violation';
  end if;
  if v_service_trainer_id is distinct from NEW.trainer_id then
    raise exception 'service_id % is not offered by trainer_id %',
      NEW.service_id, NEW.trainer_id
      using errcode = 'foreign_key_violation';
  end if;
  if NEW.price_cents is distinct from v_service_price then
    raise exception 'price_cents % does not match service price %',
      NEW.price_cents, v_service_price
      using errcode = 'check_violation';
  end if;
  if NEW.duration_minutes is distinct from v_service_duration then
    raise exception 'duration_minutes % does not match service duration %',
      NEW.duration_minutes, v_service_duration
      using errcode = 'check_violation';
  end if;

  if NEW.currency is distinct from v_service_currency then
    raise exception 'currency % does not match service currency %',
      NEW.currency, v_service_currency
      using errcode = 'check_violation';
  end if;

  -- Time gate
  if NEW.starts_at <= now() + interval '15 minutes' then
    raise exception 'starts_at must be at least 15 minutes in the future (got %)', NEW.starts_at
      using errcode = 'check_violation';
  end if;

  return NEW;
end;
$$;

CREATE OR REPLACE FUNCTION public.bookings_validate_update()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_is_system        boolean;
  v_actor_is_owner   boolean;
  v_actor_is_trainer boolean;
begin
  -- (a) Immutability (I1)
  if NEW.owner_id                  is distinct from OLD.owner_id                  then raise exception 'owner_id is immutable';                  end if;
  if NEW.trainer_id                is distinct from OLD.trainer_id                then raise exception 'trainer_id is immutable';                end if;
  if NEW.dog_id                    is distinct from OLD.dog_id                    then raise exception 'dog_id is immutable';                    end if;
  if NEW.service_id                is distinct from OLD.service_id                then raise exception 'service_id is immutable';                end if;
  if NEW.starts_at                 is distinct from OLD.starts_at                 then raise exception 'starts_at is immutable';                 end if;
  if NEW.duration_minutes          is distinct from OLD.duration_minutes          then raise exception 'duration_minutes is immutable';          end if;
  if NEW.price_cents               is distinct from OLD.price_cents               then raise exception 'price_cents is immutable';               end if;
  if NEW.currency                  is distinct from OLD.currency                  then raise exception 'currency is immutable';                  end if;
  if NEW.stripe_payment_intent_id  is distinct from OLD.stripe_payment_intent_id  then
    -- M11 amendment (in-place, the M9 precedent): IMMUTABLE ONCE SET. The
    -- single permitted transition is NULL -> value, and ONLY via the system
    -- path (auth.uid() is null = service_role/postgres — the Phase-8 payment
    -- attach). Parties may never set it: an owner/trainer squatting a value
    -- pre-payment would permanently BLOCK the real attach (immutability
    -- would then protect the squat). value -> NULL and value -> different
    -- still reject unconditionally, for every actor.
    if OLD.stripe_payment_intent_id is not null then
      raise exception 'stripe_payment_intent_id is immutable once set';
    end if;
    if auth.uid() is not null then
      raise exception 'Only the system path may attach a payment intent';
    end if;
  end if;
  if NEW.created_at                is distinct from OLD.created_at                then raise exception 'created_at is immutable';                end if;

  -- (b) Actor classification
  v_is_system        := auth.uid() is null;
  v_actor_is_owner   := (not v_is_system) and (auth.uid() = OLD.owner_id);
  v_actor_is_trainer := (not v_is_system) and (auth.uid() = OLD.trainer_id);

  if NEW.status = OLD.status then
    if NEW.cancelled_at is distinct from OLD.cancelled_at
       or NEW.cancelled_by is distinct from OLD.cancelled_by
       or NEW.completed_at is distinct from OLD.completed_at then
      raise exception 'Snapshot columns only mutate via status transitions';
    end if;
    return NEW;
  end if;

  -- (c) Transition validation
  if v_is_system then
    if not (
      (OLD.status = 'PENDING'   and NEW.status = 'CANCELLED')
      or
      (OLD.status = 'CONFIRMED' and NEW.status = 'COMPLETED')
    ) then
      raise exception 'System path: illegal transition % → %', OLD.status, NEW.status;
    end if;
    if NEW.status = 'CANCELLED' and NEW.cancelled_by is distinct from 'system' then
      raise exception 'System cancellation must set cancelled_by=system';
    end if;

    -- System path defense-in-depth: same time floor as trainer T2 gate.
    -- Cron should only fire CONFIRMED → COMPLETED after starts_at + duration
    -- + grace, but trigger guards against buggy cron firing before session
    -- even starts. Mirrors the trainer-path Q3 (loose-with-starts_at-floor)
    -- decision.
    if NEW.status = 'COMPLETED' and now() < OLD.starts_at then
      raise exception 'System: cannot complete before session start (starts_at=%, now=%)',
        OLD.starts_at, now();
    end if;

  elsif v_actor_is_owner then
    if (OLD.status = 'PENDING'   and NEW.status = 'CANCELLED')
       or
       (OLD.status = 'CONFIRMED' and NEW.status = 'CANCELLED')
    then
      if NEW.cancelled_by is distinct from 'owner' then
        raise exception 'Owner cancellation must set cancelled_by=owner';
      end if;
    else
      raise exception 'Owner: illegal transition % → %', OLD.status, NEW.status;
    end if;

  elsif v_actor_is_trainer then
    if OLD.status = 'PENDING' and NEW.status = 'CONFIRMED' then
      if OLD.starts_at <= now() then
        raise exception 'Cannot confirm a booking whose start time has passed (starts_at=%)', OLD.starts_at;
      end if;

    elsif (OLD.status = 'PENDING'   and NEW.status = 'CANCELLED')
          or
          (OLD.status = 'CONFIRMED' and NEW.status = 'CANCELLED') then
      if NEW.cancelled_by is distinct from 'trainer' then
        raise exception 'Trainer cancellation must set cancelled_by=trainer';
      end if;

    elsif OLD.status = 'CONFIRMED' and NEW.status = 'COMPLETED' then
      if now() < OLD.starts_at then
        raise exception 'Cannot complete before session start (starts_at=%, now=%)', OLD.starts_at, now();
      end if;

    else
      raise exception 'Trainer: illegal transition % → %', OLD.status, NEW.status;
    end if;

  else
    raise exception 'Caller is not a party to this booking';
  end if;

  -- (d) Snapshot writes
  if NEW.status = 'CANCELLED' and NEW.cancelled_at is null then
    NEW.cancelled_at := now();
  end if;
  if NEW.status = 'COMPLETED' and NEW.completed_at is null then
    NEW.completed_at := now();
  end if;

  return NEW;
end;
$function$
;

-- Version the API so a schema-first deployment keeps the old app functioning.
-- Country is evaluated before LIMIT, including at the US/Canada border.
create function public.nearby_trainers_v2(
  search_lat double precision,
  search_lng double precision,
  radius_meters integer,
  search_country text default 'US'
)
returns table (
  id uuid,
  display_name text,
  bio text,
  years_experience integer,
  service_radius_meters integer,
  timezone text,
  specialties public.trainer_specialty[],
  lat double precision,
  lng double precision,
  distance_meters double precision,
  country_code text,
  postal_area text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    t.id, p.display_name, t.bio, t.years_experience,
    t.service_radius_meters, t.timezone,
    coalesce((
      select array_agg(a.specialty order by a.specialty)
      from public.trainer_specialty_assignments a where a.trainer_id = t.id
    ), '{}'::public.trainer_specialty[]) as specialties,
    extensions.st_y(t.service_point::extensions.geometry) as lat,
    extensions.st_x(t.service_point::extensions.geometry) as lng,
    extensions.st_distance(t.service_point, extensions.st_setsrid(
      extensions.st_makepoint(search_lng, search_lat), 4326
    )::extensions.geography) as distance_meters,
    t.country_code, t.postal_area
  from public.trainers t
  join public.profiles p on p.id = t.id
  where t.country_code = search_country
    and t.service_point is not null
    and search_lat between -90 and 90 and search_lng between -180 and 180
    and radius_meters >= 0
    and extensions.st_dwithin(t.service_point, extensions.st_setsrid(
      extensions.st_makepoint(search_lng, search_lat), 4326
    )::extensions.geography, radius_meters)
  order by distance_meters asc, t.id asc
  limit 50
$$;
comment on function public.nearby_trainers_v2(double precision, double precision, integer, text) is
  'Country-scoped directory search, nearest-first in meters, up to 50 results. Country filtering occurs before LIMIT. SECURITY INVOKER deliberately preserves public-read RLS; old nearby_trainers remains available during rollout.';
revoke execute on function public.nearby_trainers_v2(double precision, double precision, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.nearby_trainers_v2(double precision, double precision, integer, text)
  to anon, authenticated, service_role;
