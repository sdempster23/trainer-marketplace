-- ============================================================================
-- M8 — message_threads + messages (owner↔trainer in-app messaging)
-- ============================================================================
-- First feature table since bookings, and the first table built under the M7
-- grant convention (the platform default no longer auto-grants anon/
-- authenticated, so every grant below is explicit and load-bearing — a
-- forgotten grant would make the table inaccessible, failing loud).
--
-- Two tables. Freestanding messaging: any owner↔trainer pair may converse,
-- NOT gated on an existing booking, with an optional booking association for
-- context. Messages are an immutable permanent record (no UPDATE/DELETE).
-- Read-state (unread counts) is deferred to a later migration.
--
-- DESIGN DECISIONS (resolved before drafting):
--
--   (4a) updated_at bump — an AFTER INSERT trigger on messages bumps the
--        parent thread's updated_at (for thread-list ordering). Reliable: app
--        code cannot forget it. INVOKER — the inserting caller is, by the
--        messages INSERT RLS, already a thread participant, so it holds the
--        UPDATE grant and passes the threads UPDATE policy. Trigger graph is
--        acyclic: messages INSERT -> bump -> message_threads UPDATE ->
--        message_threads immutability trigger (no write back to messages).
--
--   (4b) sender authenticity — the messages trigger validates
--        sender_id = auth.uid() (you can only author as yourself). This has
--        NO cross-table read, so there is no SECURITY INVOKER concern for it.
--        Combined with the messages INSERT RLS (caller must be a participant),
--        sender is necessarily a participant — derived, not separately checked.
--        Rejected the weaker "sender ∈ participants" check: it would let one
--        participant forge a message as the other (trainer_id ∈ {owner,trainer}
--        passes), corrupting the permanent record.
--
--   (4c) thread initiation — EITHER party may open a thread. The owner-role
--        gate (owner_id must be role=owner) is an INTEGRITY check about global
--        truth, not an access check, so its function is SECURITY DEFINER (sees
--        true global profile state). An INVOKER check would wrongly reject
--        trainer-initiated threads: profiles RLS hides other owners from
--        trainers, so a trainer cannot see the owner's profile under their own
--        RLS. Distinction established here: integrity-validating triggers
--        ("does this reference a valid X?") use DEFINER; access-gating logic
--        uses INVOKER + RLS. See COMMENT ON the DEFINER function.
--
--   (4d) thread immutability — message_threads identity columns (owner_id,
--        trainer_id, booking_id, created_at) are immutable post-INSERT. Without
--        this, a participant could UPDATE owner_id to a different owner (RLS
--        WITH CHECK only keeps the mutator a participant), silently reassigning
--        the thread and exposing its entire message history to a stranger. The
--        bump only ever changes updated_at. M6 F-category immutability pattern.
--
-- Grants (M7 convention — explicit REVOKE-then-GRANT):
--   message_threads : anon (none) | authenticated SELECT, INSERT, UPDATE
--   messages        : anon (none) | authenticated SELECT, INSERT
--   (no authenticated UPDATE/DELETE on messages — immutable record)
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. message_threads — one canonical thread per owner↔trainer pair
-- ----------------------------------------------------------------------------
create table public.message_threads (
  id          uuid        primary key default gen_random_uuid(),
  owner_id    uuid        not null references public.profiles(id) on delete restrict,
  trainer_id  uuid        not null references public.trainers(id) on delete restrict,
  booking_id  uuid        references public.bookings(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (owner_id, trainer_id)
);

-- owner_id -> profiles + DEFINER role trigger (§4); trainer_id -> trainers is
-- itself the role evidence (mirrors M6). booking_id is an OPTIONAL context
-- link: ON DELETE SET NULL so the thread survives if its booking is ever
-- removed (the thread is freestanding; the link is contextual).


-- ----------------------------------------------------------------------------
-- 2. messages — immutable permanent record
-- ----------------------------------------------------------------------------
create table public.messages (
  id         uuid        primary key default gen_random_uuid(),
  thread_id  uuid        not null references public.message_threads(id) on delete cascade,
  sender_id  uuid        not null references public.profiles(id) on delete restrict,
  body       text        not null,
  created_at timestamptz not null default now(),
  constraint messages_body_nonempty_bounded
    check (length(trim(body)) > 0 and length(body) <= 4000)
);

-- thread_id ON DELETE CASCADE: messages live and die with their thread.
-- sender_id ON DELETE RESTRICT: preserve the record (account deletion handling
-- is a future concern, consistent with M6's restrict-everywhere).
-- No updated_at, no UPDATE/DELETE policy — messages are immutable (§8).


-- ----------------------------------------------------------------------------
-- 3. Indexes
-- ----------------------------------------------------------------------------
-- owner_id is covered by the unique (owner_id, trainer_id) prefix; trainer_id
-- needs its own index for a trainer's thread-list lookup.
create index idx_message_threads_trainer_id on public.message_threads (trainer_id);
-- booking->thread context lookups (only threads that have a booking link).
create index idx_message_threads_booking_id on public.message_threads (booking_id)
  where booking_id is not null;
-- thread message fetch, in chronological order.
create index idx_messages_thread_id_created_at on public.messages (thread_id, created_at);


-- ----------------------------------------------------------------------------
-- 4. owner-role integrity gate (SECURITY DEFINER) — BEFORE INSERT on threads
-- ----------------------------------------------------------------------------
create or replace function public.message_threads_validate_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Integrity check (global truth), NOT access control. Either party may open
  -- a thread; DEFINER lets this see true global profile state so a trainer-
  -- initiated thread is validated even though the trainer cannot see the
  -- owner's profile under their own RLS. See COMMENT ON FUNCTION.
  if not exists (
    select 1 from public.profiles
    where id = NEW.owner_id and role = 'owner'::public.user_role
  ) then
    raise exception 'owner_id % is not a profile with role=owner', NEW.owner_id
      using errcode = 'foreign_key_violation';
  end if;
  return NEW;
end;
$$;

create trigger trg_message_threads_validate_insert
  before insert on public.message_threads
  for each row
  execute function public.message_threads_validate_insert();


-- ----------------------------------------------------------------------------
-- 5. thread immutability (INVOKER) — BEFORE UPDATE on threads
-- ----------------------------------------------------------------------------
-- Only updated_at may change (the bump). Freezing owner_id/trainer_id prevents
-- thread reassignment, which would expose the message history to a new party.
create or replace function public.message_threads_validate_update()
returns trigger
language plpgsql
as $$
begin
  if NEW.owner_id   is distinct from OLD.owner_id   then raise exception 'owner_id is immutable';   end if;
  if NEW.trainer_id is distinct from OLD.trainer_id then raise exception 'trainer_id is immutable'; end if;
  if NEW.booking_id is distinct from OLD.booking_id then raise exception 'booking_id is immutable'; end if;
  if NEW.created_at is distinct from OLD.created_at then raise exception 'created_at is immutable'; end if;
  return NEW;
end;
$$;

create trigger trg_message_threads_validate_update
  before update on public.message_threads
  for each row
  execute function public.message_threads_validate_update();


-- ----------------------------------------------------------------------------
-- 6. sender authenticity (INVOKER) — BEFORE INSERT on messages
-- ----------------------------------------------------------------------------
-- You may only author messages as yourself. No cross-table read -> no SECURITY
-- INVOKER concern. Participation is enforced by the messages INSERT RLS (§8);
-- sender = auth.uid() + caller-is-participant => sender is a participant.
create or replace function public.messages_validate_insert()
returns trigger
language plpgsql
as $$
begin
  if NEW.sender_id is distinct from auth.uid() then
    raise exception 'sender_id must be the authenticated user (no third-party authorship)';
  end if;
  return NEW;
end;
$$;

create trigger trg_messages_validate_insert
  before insert on public.messages
  for each row
  execute function public.messages_validate_insert();


-- ----------------------------------------------------------------------------
-- 7. thread updated_at bump (INVOKER) — AFTER INSERT on messages
-- ----------------------------------------------------------------------------
-- Bumps the parent thread so thread lists order by most-recent activity. The
-- caller is a participant (messages INSERT RLS), so the INVOKER UPDATE passes
-- the threads UPDATE grant + policy. Only updated_at changes -> the §5
-- immutability trigger allows it. Acyclic: nothing here writes back to messages.
create or replace function public.messages_bump_thread()
returns trigger
language plpgsql
as $$
begin
  update public.message_threads
    set updated_at = now()
    where id = NEW.thread_id;
  return null;  -- AFTER trigger: return value is ignored
end;
$$;

create trigger trg_messages_bump_thread
  after insert on public.messages
  for each row
  execute function public.messages_bump_thread();


-- ----------------------------------------------------------------------------
-- 8. RLS — participants only
-- ----------------------------------------------------------------------------
alter table public.message_threads enable row level security;

create policy "Participants read their own threads"
  on public.message_threads
  for select
  to authenticated
  using (auth.uid() in (owner_id, trainer_id));

create policy "Participants create their own threads"
  on public.message_threads
  for insert
  to authenticated
  with check (auth.uid() in (owner_id, trainer_id));

create policy "Participants update their own threads"
  on public.message_threads
  for update
  to authenticated
  using (auth.uid() in (owner_id, trainer_id))
  with check (auth.uid() in (owner_id, trainer_id));

alter table public.messages enable row level security;

-- Participation is derived from the parent thread (the one cross-table join,
-- mirroring M6's dog-visibility-via-bookings). The caller is a participant, so
-- the EXISTS resolves under their own RLS on message_threads (the working
-- direction proven in M6 category I).
create policy "Participants read thread messages"
  on public.messages
  for select
  to authenticated
  using (
    exists (
      select 1 from public.message_threads t
      where t.id = messages.thread_id
        and auth.uid() in (t.owner_id, t.trainer_id)
    )
  );

create policy "Participants send messages"
  on public.messages
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.message_threads t
      where t.id = messages.thread_id
        and auth.uid() in (t.owner_id, t.trainer_id)
    )
  );

-- No UPDATE or DELETE policy on messages — immutable permanent record.


-- ----------------------------------------------------------------------------
-- 9. GRANTs (M7 convention — explicit REVOKE-then-GRANT)
-- ----------------------------------------------------------------------------
-- The M7 ALTER DEFAULT PRIVILEGES already strips anon/authenticated from new
-- tables, so the REVOKEs are defensive no-ops; the GRANTs are what make the
-- tables reachable. Both stated explicitly per convention.
revoke all on public.message_threads from anon, authenticated;
grant select, insert, update on public.message_threads to authenticated;

revoke all on public.messages from anon, authenticated;
grant select, insert on public.messages to authenticated;


-- ----------------------------------------------------------------------------
-- 10. Documentation
-- ----------------------------------------------------------------------------
comment on table public.message_threads is
  'One canonical conversation per owner↔trainer pair (UNIQUE owner_id, trainer_id). Freestanding — not booking-gated; booking_id is an optional context link. Participants-only RLS. Identity columns are immutable post-INSERT (§5); only updated_at changes, bumped by message arrival for thread-list ordering.';

comment on table public.messages is
  'Immutable permanent record of a conversation. INSERT + SELECT only — no UPDATE/DELETE policy or grant. sender_id is forced to auth.uid() (no third-party authorship). Visibility derives from the parent thread''s participants.';

comment on column public.message_threads.booking_id is
  'Optional association to a booking for context. ON DELETE SET NULL — the thread is freestanding and survives removal of the linked booking.';

comment on function public.message_threads_validate_insert() is
  'SECURITY DEFINER — INTENTIONAL. Validates the global integrity fact "owner_id is a profile with role=owner". This is an integrity check, not access control: either party may open a thread, and a trainer initiating one cannot see the owner''s profile under their own RLS (profiles RLS hides other owners), so an INVOKER check would wrongly reject trainer-initiated threads. DEFINER lets the check see true global state. Convention (M8): integrity-validating triggers use DEFINER (documented here); access-gating logic uses INVOKER + RLS. search_path is pinned empty and all refs are schema-qualified to prevent search-path hijacking.';

comment on function public.messages_validate_insert() is
  'INVOKER. Forces sender_id = auth.uid() — you may only author messages as yourself. No cross-table read, so no SECURITY INVOKER cross-tenant concern; participation is enforced by the messages INSERT RLS policy.';

comment on function public.messages_bump_thread() is
  'INVOKER AFTER INSERT. Bumps the parent thread''s updated_at for thread-list ordering. The caller is a participant (messages INSERT RLS), so it holds the threads UPDATE grant + policy. Only updated_at changes, permitted by the threads immutability trigger. Acyclic — does not write back to messages.';
