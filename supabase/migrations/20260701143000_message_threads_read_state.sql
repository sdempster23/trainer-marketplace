-- ============================================================================
-- M9 — message_threads read-state (per-participant unread tracking)
-- ============================================================================
-- The "A" in the A-then-C plan: a small schema close-out that finishes the
-- messaging feature (M8), after which we pivot to the application layer.
--
-- Lightweight read-state: two per-participant "last read" timestamps on
-- message_threads. NOT per-message receipts (a future migration if ever
-- needed). This is exactly what the messaging UI renders — an unread badge and
-- a per-thread unread count:
--
--   unread(me, thread) = any message in the thread with
--                        created_at > my last_read_at
--
-- computed at QUERY time. NULL last_read = never read (everything is unread).
-- There is NO stored counter to keep in sync — the count is always derived
-- from messages.created_at vs. my last_read column, so it cannot drift.
--
-- WHAT M9 CHANGES:
--   (a) Two nullable columns on message_threads (owner_last_read_at,
--       trainer_last_read_at).
--   (b) An IN-PLACE amendment to the M8 §5 immutability trigger function
--       (message_threads_validate_update) — a deliberate one-time edit to
--       prior-migration work, in the same spirit as the M3 PostGIS amendment.
--       It must (i) STILL freeze the four identity columns, (ii) permit the two
--       new columns to change, and (iii) enforce author-as-self on read-state.
--
-- WHAT M9 DELIBERATELY DOES NOT CHANGE (verified, not assumed):
--   - No grant change. M8 already granted `authenticated` SELECT, INSERT,
--     UPDATE on message_threads (for the updated_at bump). Grants are
--     table-level, so that UPDATE privilege already covers the new columns.
--   - No RLS change. The M8 UPDATE policy is participants-only in both USING
--     and WITH CHECK (auth.uid() in (owner_id, trainer_id)). "Mark as read" is
--     a participant UPDATE of the same table — already permitted. (RLS also
--     CANNOT express the column-level author-as-self rule: WITH CHECK sees only
--     NEW, never OLD, so it cannot tell whether trainer_last_read_at *changed*.
--     That comparison needs OLD vs NEW — a trigger's job, not RLS's. This is
--     why (b)(iii) lives in the trigger.)
--   - No new index. The unread query filters messages by (thread_id,
--     created_at), already served by idx_messages_thread_id_created_at. The
--     last_read columns are compared per-row, never searched across rows.
--   - updated_at is NOT bumped on mark-as-read. updated_at means "last activity"
--     for thread-list ordering; reading is not activity and must not reorder the
--     list. The amended trigger ALLOWS updated_at to change but never REQUIRES
--     it, so a mark-as-read UPDATE that touches only *_last_read_at leaves
--     updated_at alone — no conflict.
--
-- TRIGGER GRAPH (mark-as-read UPDATE) — acyclic, confirmed:
--   UPDATE message_threads SET owner_last_read_at = now()
--     -> trg_message_threads_validate_update (BEFORE UPDATE, the amended §5)
--     -> (nothing else). The bump (trg_messages_bump_thread) is AFTER INSERT on
--        *messages*; a thread UPDATE inserts no message, so it does not fire.
--   The M8 bump path is likewise still acyclic: messages INSERT -> bump sets
--   only updated_at -> amended §5 sees no identity/last_read change -> returns.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Read-state columns (nullable, no default -> fast metadata-only ALTER)
-- ----------------------------------------------------------------------------
-- NULL = this participant has never read the thread (all messages unread).
alter table public.message_threads
  add column owner_last_read_at   timestamptz,
  add column trainer_last_read_at timestamptz;


-- ----------------------------------------------------------------------------
-- 2. AMEND M8 §5 immutability trigger IN PLACE  (deliberate prior-migration edit)
-- ----------------------------------------------------------------------------
-- This function was authored in M8 (20260628143000, §5) to freeze the four
-- identity columns on a thread UPDATE. M9 amends it — a one-time, intentional
-- edit to prior-migration work (like the M3 PostGIS amendment) — to add the
-- read-state author-as-self rule. The function's single responsibility is
-- unchanged in spirit: "validate a thread UPDATE — what may change, and by
-- whom." Both the identity freeze and the read-state authorship are exactly
-- that, so they belong in one auditable BEFORE UPDATE function rather than two.
--
-- Amendment (M9): added the two author-as-self checks below. The identity
-- freeze is byte-for-byte the M8 logic. The two new last_read columns are NOT
-- frozen — this is a denylist trigger, so anything it does not explicitly
-- reject is permitted (exactly how updated_at has always been allowed).
create or replace function public.message_threads_validate_update()
returns trigger
language plpgsql
as $$
begin
  -- Identity freeze (M8 §5, unchanged) — the four identity columns are
  -- immutable post-INSERT. Prevents thread reassignment, which would silently
  -- expose the entire message history to a new party.
  if NEW.owner_id   is distinct from OLD.owner_id   then raise exception 'owner_id is immutable';   end if;
  if NEW.trainer_id is distinct from OLD.trainer_id then raise exception 'trainer_id is immutable'; end if;
  if NEW.booking_id is distinct from OLD.booking_id then raise exception 'booking_id is immutable'; end if;
  if NEW.created_at is distinct from OLD.created_at then raise exception 'created_at is immutable'; end if;

  -- Read-state author-as-self (M9) — the read-state analog of the M8 messages
  -- rule "sender_id = auth.uid()". A participant may update ONLY their own
  -- last_read column: an owner writes owner_last_read_at but NOT
  -- trainer_last_read_at, and vice versa. Without this, a participant could
  -- mark the OTHER party's messages as read. RLS already guarantees the caller
  -- is a participant, so auth.uid() is owner_id or trainer_id here; identifying
  -- the caller by that identity is sufficient. `is distinct from` is NULL-safe,
  -- so a no-op (unchanged) column never trips these. Plain raise => SQLSTATE
  -- P0001, matching the identity-freeze checks above.
  if auth.uid() = OLD.owner_id
     and NEW.trainer_last_read_at is distinct from OLD.trainer_last_read_at then
    raise exception 'owner may not modify trainer_last_read_at (read-state is author-as-self)';
  end if;
  if auth.uid() = OLD.trainer_id
     and NEW.owner_last_read_at is distinct from OLD.owner_last_read_at then
    raise exception 'trainer may not modify owner_last_read_at (read-state is author-as-self)';
  end if;

  return NEW;
end;
$$;

-- The M8 trigger binding (trg_message_threads_validate_update, BEFORE UPDATE)
-- is unchanged and still in force — CREATE OR REPLACE FUNCTION swaps only the
-- body, so no CREATE TRIGGER is needed here.


-- ----------------------------------------------------------------------------
-- 3. Documentation
-- ----------------------------------------------------------------------------
-- M8 shipped no COMMENT on this function; M9 adds one that records both the
-- original concern and this amendment.
comment on function public.message_threads_validate_update() is
  'INVOKER BEFORE UPDATE on message_threads. Two concerns, both "what may change on a thread UPDATE, and by whom": (1) M8 §5 identity freeze — owner_id/trainer_id/booking_id/created_at are immutable post-INSERT (prevents thread reassignment / history exposure). (2) M9 read-state author-as-self — a participant may update only their own last_read column (owner cannot write trainer_last_read_at, and vice versa), the read-state analog of the messages sender=auth.uid() rule. AMENDED in M9 (20260701143000): the author-as-self checks were added to this M8 function in place — a deliberate one-time edit to prior-migration work. Denylist semantics: owner_last_read_at/trainer_last_read_at and updated_at are permitted precisely because they are not rejected.';

comment on column public.message_threads.owner_last_read_at is
  'When the owner last read this thread (UTC). NULL = never read. Unread = any message with created_at > this value, computed at query time. Writable only by the owner (author-as-self, enforced by message_threads_validate_update).';

comment on column public.message_threads.trainer_last_read_at is
  'When the trainer last read this thread (UTC). NULL = never read. Unread = any message with created_at > this value, computed at query time. Writable only by the trainer (author-as-self, enforced by message_threads_validate_update).';

-- Refresh the table comment to record that read-state now lives here alongside
-- the identity/updated_at story from M8.
comment on table public.message_threads is
  'One canonical conversation per owner↔trainer pair (UNIQUE owner_id, trainer_id). Freestanding — not booking-gated; booking_id is an optional context link. Participants-only RLS. Identity columns are immutable post-INSERT (§5); updated_at changes only via the message-arrival bump (thread-list ordering). Read-state (M9): owner_last_read_at / trainer_last_read_at are per-participant last-read timestamps, each writable only by its own participant; unread counts are derived at query time (no stored counter).';
