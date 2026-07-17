-- ============================================================================
-- M17 — trainer payment info (off-platform payments, information display only)
-- ============================================================================
-- The strategy ruling: PawMatch NEVER touches the money. A trainer says "how
-- I accept payment"; the owner sees it AFTER the booking is CONFIRMED (before
-- confirmation there is no payee relationship). This is INFORMATION DISPLAY,
-- not a payment rail — no balances, no transfers, no Stripe.
--
-- WHY A DEDICATED TABLE, NOT COLUMNS ON trainers (the front-door investigation
-- QA'd trainers.payment_instructions; this realizes that ruling's ANTI-HARVEST
-- intent, which columns-on-trainers cannot without collateral damage):
-- trainers has a TABLE-level anon SELECT grant (M7 — the public directory).
-- To keep payment handles off the anon surface (the adopted anti-harvest
-- ruling) while they sat on trainers, anon's grant would have to be converted
-- to column-scoped — which flips has_table_privilege(anon, trainers, SELECT)
-- to false and breaks the M7-1 grant-matrix contract. A dedicated table gets
-- anti-harvest BY CONSTRUCTION (no anon grant at all, like the M5
-- trainer_stripe_accounts sibling — trainer financial-adjacent data in its own
-- table) and leaves the settled M7 layer untouched. The M14 catalog matrix
-- picks it up automatically at {} for service_role.
--
-- READ MODEL — booking-scoped, the M11 counterparty precedent (the DB
-- enforces what the render intends; defense in depth):
--   - the OWNER reads a trainer's payment info IFF they hold a CONFIRMED
--     booking with that trainer (an EXISTS over bookings — pure column
--     comparisons there, so no 42P17 recursion, the M11 §2 lesson);
--   - the TRAINER reads their own row (the settings/onboarding edit UI).
-- Nobody else — anon holds no grant; an authenticated non-client sees ZERO
-- rows. A trainer's Venmo cannot be mass-scraped, from the public page or the
-- PostgREST surface.
--
-- WRITE MODEL — plain own-row RLS (NOT a DEFINER lane). Payment info is the
-- trainer's own editable profile data, like bio — written under RLS with
-- auth.uid() = trainer_id, not a credential that needs the M15/M16
-- impossible-by-construction treatment.
--
-- XSS — the whole app relies on React auto-escaping (zero
-- dangerouslySetInnerHTML anywhere). instructions renders as escaped text.
-- The handles are NOT urls: they are stored as validated slugs (CHECK charset
-- below) and the APP builds the href from a fixed allowlisted host
-- (venmo.com / paypal.me) + the slug — there is never a user-supplied href to
-- sanitize (the argued-correct posture: no url to parse means no javascript:/
-- lookalike-host/@-trick surface).
--
-- Probed rolled-back before this file was written: owner-with-CONFIRMED-
-- booking reads; non-booking owner sees zero; anon/service_role hold nothing;
-- CHECK constraints reject bad handles + over-length instructions; no
-- recursion; rollback clean.
-- ============================================================================

create table public.trainer_payment_info (
  trainer_id    uuid primary key references public.trainers(id) on delete cascade,
  -- "how I take payment", free text, escaped at render. 280 (not bio's 2000):
  -- a pay-me line, not a biography.
  instructions  text constraint tpi_instructions_len
                  check (char_length(instructions) <= 280),
  -- HANDLES, not urls — a strict slug charset. The app builds the href from a
  -- fixed host; a malformed handle can at worst make a dead link, never an
  -- injection. NULL = that rail not offered.
  venmo_handle  text constraint tpi_venmo_handle
                  check (venmo_handle ~ '^[A-Za-z0-9_.-]{1,30}$'),
  paypal_handle text constraint tpi_paypal_handle
                  check (paypal_handle ~ '^[A-Za-z0-9_.-]{1,30}$'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.trainer_payment_info is
  'Off-platform payment info a trainer shows clients (M17). INFORMATION DISPLAY ONLY — PawMatch never touches the money. Row absence = not set. Read: the trainer''s own row + owners with a CONFIRMED booking (booking-scoped, M11 precedent); NO anon grant (anti-harvest by construction, the M5 stripe-accounts sibling). Handles are validated slugs; the app builds the href from a fixed host — no user-supplied url. service_role holds NO privileges here (M14 declared position {}).';

-- ----------------------------------------------------------------------------
-- RLS — booking-scoped read + own-row read; own-row write
-- ----------------------------------------------------------------------------
alter table public.trainer_payment_info enable row level security;

create policy "Trainers read their own payment info"
  on public.trainer_payment_info for select to authenticated
  using (auth.uid() = trainer_id);

create policy "Booking owners read their trainer's payment info"
  on public.trainer_payment_info for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.trainer_id = trainer_payment_info.trainer_id
        and b.owner_id = auth.uid()
        and b.status = 'CONFIRMED'
    )
  );

create policy "Trainers insert their own payment info"
  on public.trainer_payment_info for insert to authenticated
  with check (auth.uid() = trainer_id);

create policy "Trainers update their own payment info"
  on public.trainer_payment_info for update to authenticated
  using (auth.uid() = trainer_id)
  with check (auth.uid() = trainer_id);

-- ----------------------------------------------------------------------------
-- Grants — authenticated only (RLS scopes the rows); anon nothing; the
-- updated_at freeze rides the shared trigger.
-- ----------------------------------------------------------------------------
grant select, insert, update on public.trainer_payment_info to authenticated;
-- No anon grant (anti-harvest). No DELETE (clear a rail via UPDATE to NULL;
-- the row persists). service_role: NOTHING (M14 {}).

create trigger trg_trainer_payment_info_updated_at
  before update on public.trainer_payment_info
  for each row execute function public.update_updated_at_column();
