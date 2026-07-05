-- ============================================================================
-- M13 — thread counterparty profile read (the messaging arc's enabler)
-- ============================================================================
-- One additive SELECT policy on profiles: trainers read the profiles of
-- owners they share a message_thread with — M11 §2's counterparty read,
-- mirrored with the thread as the relationship table.
--
-- WHY (the app-layer finding, proven live in the messaging Group-1 work):
-- M8 threads are freestanding — any owner may open a conversation with any
-- trainer, no booking required (embraced at arc scoping: pre-booking
-- inquiries are product). But the only path a trainer had to an owner's
-- profile row was M11's BOOKING-scoped policy, so a booking-less inquiry
-- rendered as the "An owner" fallback — a conversation with no counterparty
-- name is broken product. The disclosure reasoning matches M11's: opening a
-- message thread with a trainer IS deliberate contact, the same consent
-- signal as booking them.
--
-- Direction is one-way by data reality: owners already read trainer
-- profiles through the public directory policy; only trainer -> owner was
-- missing.
--
-- THE M11 LESSONS, APPLIED AT DRAFT TIME (not rediscovered):
--
--   (1) TO authenticated is LOAD-BEARING. profiles SELECT policies are OR'd
--       and anon HOLDS SELECT on profiles (the public directory), so a
--       PUBLIC-defaulted policy would make every logged-out profiles read
--       evaluate this qual — which reads message_threads, where anon holds
--       ZERO grants (M8 §9) — detonating the entire public directory with
--       "permission denied for table message_threads" (M11's B4/D1 lesson:
--       a policy mirror needs its grant-context mirror).
--
--   (2) THE RECURSION PAIR, checked before drafting. A profiles policy must
--       not join a table whose policies subquery profiles (42P17 — the M11
--       recursion-partner saga). The message_threads policy quals are, in
--       the live catalog verbatim (all three of SELECT/INSERT/UPDATE):
--           ((auth.uid() = owner_id) OR (auth.uid() = trainer_id))
--       — pure column comparisons, no profiles subquery, so the expansion
--       profiles -> message_threads TERMINATES. (The thread-INSERT
--       owner-role check DOES read profiles, but from the SECURITY DEFINER
--       trigger — a trigger is not a policy and DEFINER bypasses RLS, so it
--       cannot join the policy expansion.) Probed rolled-back before this
--       file was written: party-read works, no-thread trainer excluded,
--       anon intact, profile UPDATE and thread INSERT both survive with the
--       policy live. The suite pins each as a standing trap.
--
--   (3) No grant change: anon/authenticated SELECT on profiles already
--       exist (M7); this only widens which ROWS an authenticated trainer
--       sees. The no-status-filter analog is answered by the schema: like
--       M11's "ANY booking, even cancelled, establishes the relationship",
--       ANY thread does — threads have no lifecycle to filter on (identity
--       immutable, no participant delete path).
--
-- Name kept under 63 chars — Postgres truncates identifiers at NAMEDATALEN,
-- and the first draft's longer name was silently cut mid-word (caught in
-- the rolled-back probe).
-- ============================================================================

create policy "Trainers read profiles of owners they share a thread with"
on public.profiles for select to authenticated using (
  exists (
    select 1 from public.message_threads t
    where t.owner_id = profiles.id and t.trainer_id = auth.uid()
  )
);
