-- ============================================================================
-- M19 — trainer gallery photos (deliverable 2 of the trainer-images arc)
-- ============================================================================
-- The DB row is the source of truth; the storage object is a dumb blob. This
-- is the dogs.photo_url precedent ("path resolution lives in app code")
-- extended one step: the table owns ORDER and the CAP, storage owns bytes.
--
-- THE CAP IS BY CONSTRUCTION, NOT BY APP CODE (gate ruling 2: 8 photos):
--   position smallint CHECK (1..8) + UNIQUE (trainer_id, position)
-- means a 9th row is impossible and two photos can never share a slot — no
-- count(*) race, no app-side guard to forget. Probed rolled-back before this
-- file was written: the 9th INSERT raises check_violation, a duplicate slot
-- raises unique_violation.
--
-- THE UNIQUE IS DEFERRABLE — also probed, and load-bearing: reordering swaps
-- two rows' positions in ONE statement, which a NON-deferrable unique index
-- rejects mid-statement with 23505 (verified). DEFERRABLE INITIALLY DEFERRED
-- moves the check to COMMIT, so the swap is legal and the invariant still
-- holds at every transaction boundary. Cost: no ON CONFLICT against this
-- constraint (we never use it here).
--
-- DEFERRABLE ALONE IS NOT ENOUGH — the reorder MUST be one transaction, and
-- that is why §4's move_gallery_photo() exists. A first cut did the swap as
-- two supabase-js .update() calls: those are two HTTP requests, hence two
-- AUTOCOMMIT transactions, and the deferred check fires at the end of EACH
-- one — where the duplicate still exists. Reproduced against this schema:
-- every half-swap raises 23505 and no reorder ever lands. The RPC puts both
-- rows in one statement in one transaction, which is the only shape that
-- works (there is no scratch position to borrow: the CHECK is 1..8 and all
-- eight slots can be occupied).
--
-- file_name IS A UUID, ENFORCED BY CHECK — the untrusted-read rule (CLAUDE.md,
-- added this arc after the avatar finding). The full object path is NEVER
-- stored: readers rebuild '{trainer_id}/{file_name}' from the row's OWN
-- trainer_id plus this charset-pinned token, so a PostgREST-direct write of
-- '../avatars/{victim}/avatar' cannot become a URL. The CHECK makes the
-- database refuse the smuggle even before app code re-validates.
--
-- No deleted_at: photos hard-delete (the object goes with the row — see the
-- ordering rule in the app action). Soft-delete would strand public bytes.
-- ============================================================================

create table public.trainer_gallery_photos (
  id          uuid        primary key default gen_random_uuid(),
  trainer_id  uuid        not null references public.trainers(id) on delete cascade,
  -- The object's name WITHIN the trainer's own folder in `trainer-gallery`.
  -- Lowercase uuid, nothing else — see the header.
  file_name   text        not null
                constraint tgp_file_name_uuid
                check (file_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  -- Display order, 1 = first. The CHECK is the cap.
  position    smallint    not null
                constraint tgp_position_range check (position between 1 and 8),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint tgp_unique_slot unique (trainer_id, position)
    deferrable initially deferred,
  constraint tgp_unique_file unique (trainer_id, file_name)
);

comment on table public.trainer_gallery_photos is
  'Trainer profile gallery, max 8 per trainer BY CONSTRUCTION (position CHECK 1..8 + UNIQUE(trainer_id, position)). One row per object in the public trainer-gallery bucket. Hard-delete only: the row and its storage object die together (app action deletes the row first, then the object).';

comment on column public.trainer_gallery_photos.file_name is
  'Object name inside the trainer''s own storage folder — a lowercase uuid, CHECK-pinned. The full path is rebuilt as {trainer_id}/{file_name} by readers; never store or trust a full path (CLAUDE.md: user-writable values are untrusted at every READ site).';

comment on constraint tgp_unique_slot on public.trainer_gallery_photos is
  'DEFERRABLE INITIALLY DEFERRED so a two-row position swap can happen in one UPDATE (a non-deferrable index rejects it mid-statement). The invariant still holds at every commit.';


-- ----------------------------------------------------------------------------
-- updated_at trigger (the M1 shared function)
-- ----------------------------------------------------------------------------
create trigger trg_trainer_gallery_photos_updated_at
  before update on public.trainer_gallery_photos
  for each row
  execute function public.update_updated_at_column();


-- ----------------------------------------------------------------------------
-- RLS — public directory content, own-row writes (the trainer_services shape)
-- ----------------------------------------------------------------------------
alter table public.trainer_gallery_photos enable row level security;

-- Read: anyone, for trainers whose profile is not soft-deleted. Mirrors the
-- M3/M4 public-read filter exactly so a soft-deleted trainer's photos leave
-- the directory with the rest of their listing.
create policy "Trainer gallery photos are publicly readable"
  on public.trainer_gallery_photos
  for select
  using (
    exists (
      select 1 from public.profiles
      where id = trainer_gallery_photos.trainer_id and deleted_at is null
    )
  );

-- Writes: own rows only, trainer role required (the trainers row IS the role
-- evidence — the M6 pattern; pure PK comparison, no recursion).
create policy "Trainers add their own gallery photos"
  on public.trainer_gallery_photos
  for insert
  with check (
    (select auth.uid()) = trainer_id
    and exists (select 1 from public.trainers t where t.id = (select auth.uid()))
  );

-- UPDATE is the reorder lane (position only in practice; trainer_id is frozen
-- by the WITH CHECK, so a row can never be moved to another trainer).
create policy "Trainers reorder their own gallery photos"
  on public.trainer_gallery_photos
  for update
  using ((select auth.uid()) = trainer_id)
  with check ((select auth.uid()) = trainer_id);

-- DELETE exists here (unlike trainer_services' retire-by-soft-delete): a photo
-- is bytes, and removing it must actually remove it.
create policy "Trainers delete their own gallery photos"
  on public.trainer_gallery_photos
  for delete
  using ((select auth.uid()) = trainer_id);


-- ----------------------------------------------------------------------------
-- Grants — anon reads the public directory; authenticated does the rest.
-- service_role gets NOTHING (M14's catalog matrix asserts {} for every
-- undeclared public table and will pick this one up automatically).
-- M7 §2's altered default privileges mean new tables grant nothing until
-- stated, so these lines are the whole story.
-- ----------------------------------------------------------------------------
grant select on public.trainer_gallery_photos to anon;
grant select, insert, update, delete on public.trainer_gallery_photos to authenticated;


-- ----------------------------------------------------------------------------
-- 4. move_gallery_photo — the ONLY correct reorder path
-- ----------------------------------------------------------------------------
-- Swaps a photo with its neighbour IN ONE STATEMENT INSIDE ONE TRANSACTION.
-- See the header: two client-side updates are two transactions and always
-- fail the deferred check. Neighbours are found by ORDER, never by
-- arithmetic on position — deletions leave holes (positions are an order,
-- not a sequence).
--
-- SECURITY INVOKER (the M10 nearby_trainers precedent): RLS applies to the
-- caller, so the UPDATE can only touch their own rows. The explicit
-- ownership check is still here because the SELECT above it rides the
-- PUBLIC read policy — without it, a caller passing someone else's photo id
-- would get a silent no-op instead of a clear denial.
-- ----------------------------------------------------------------------------
create or replace function public.move_gallery_photo(
  p_photo_id  uuid,
  p_direction text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_trainer   uuid;
  v_position  smallint;
  v_other_id  uuid;
  v_other_pos smallint;
begin
  if p_direction not in ('up', 'down') then
    raise exception 'direction must be up or down' using errcode = '22023';
  end if;

  select trainer_id, position into v_trainer, v_position
  from public.trainer_gallery_photos
  where id = p_photo_id;
  if not found then
    return;  -- gone or RLS-invisible: a no-op; the caller reports it
  end if;

  if v_trainer is distinct from (select auth.uid()) then
    raise exception 'not your photo' using errcode = '42501';
  end if;

  if p_direction = 'up' then
    select id, position into v_other_id, v_other_pos
    from public.trainer_gallery_photos
    where trainer_id = v_trainer and position < v_position
    order by position desc
    limit 1;
  else
    select id, position into v_other_id, v_other_pos
    from public.trainer_gallery_photos
    where trainer_id = v_trainer and position > v_position
    order by position asc
    limit 1;
  end if;
  if not found then
    return;  -- already first/last: a no-op, not an error
  end if;

  update public.trainer_gallery_photos
  set position = case id when p_photo_id then v_other_pos else v_position end
  where id in (p_photo_id, v_other_id);
end;
$$;

comment on function public.move_gallery_photo(uuid, text) is
  'Reorder one gallery photo by one place. The swap MUST be a single statement in a single transaction — two client-side updates are two autocommit transactions and each fails the deferred unique (reproduced). SECURITY INVOKER: RLS scopes the write to the caller''s own rows.';

-- EXECUTE to authenticated only. anon has no business reordering;
-- service_role is not granted anything on this feature (M14 covers tables;
-- this is the function-level equivalent of that discipline).
revoke execute on function public.move_gallery_photo(uuid, text) from public;
grant execute on function public.move_gallery_photo(uuid, text) to authenticated;
