-- ============================================================================
-- M18 — trainer images storage (avatars + trainer gallery buckets, policies)
-- ============================================================================
-- The repo's FIRST binary storage. Arc ruling set (trainer-images gate,
-- 2026-08-25): avatars are ROLE-UNIVERSAL (owners' avatars render in
-- trainers' thread headers); the gallery is trainer-only; both buckets are
-- PUBLIC (this is public directory content by design — the honesty is in the
-- privacy page saying so, not in access control that would fight next/image
-- caching for zero privacy gain).
--
-- STORAGE IS A DIFFERENT RLS REGIME THAN OUR TABLES — probed 2026-08-25
-- (docs/scratch/trainer-images-investigation-2026-08-25.md §2):
--   * The platform grants ALL API roles full DML on storage.objects and
--     gates purely by policy (zero policies = deny-by-default). We do NOT
--     pin storage grants — that would couple us to a platform-owned ACL,
--     the exact drift class the M14 contract refuses. We declare BUCKET
--     CONFIG and POLICIES; the m18 suite asserts exactly those.
--   * HOSTED CONSTRAINT (April 2025 platform change, github.com/orgs/
--     supabase/discussions/34270): CREATE POLICY and triggers on
--     storage.objects are permitted from migrations; ALTER TABLE against
--     the storage schema is NOT. This file therefore contains no ALTER
--     TABLE / ENABLE RLS (RLS is already on, platform-managed). If this
--     migration fails on `db push`, the platform rules changed again —
--     stop and re-probe, don't work around.
--   * Direct SQL DELETE on storage.objects is trigger-blocked by the
--     platform unless the storage.allow_delete_query GUC is set — file
--     deletion MUST go through the Storage API or the backing file
--     orphans. All cleanup is app-level by design (investigation §5).
--
-- BUCKET CONFIG — what each knob actually enforces (get the layer right):
--   * file_size_limit is a hard per-object byte cap a hostile client cannot
--     bypass. It bounds EACH object, not the aggregate (see path law below).
--   * allowed_mime_types validates the DECLARED Content-Type header only —
--     storage-api does no magic-byte sniffing. It guarantees an object is
--     never STORED-AND-SERVED with an svg/html content-type; it does NOT
--     guarantee the bytes match the label. Byte-level truth is the upload
--     flow's job: the server action magic-byte-sniffs the object BEFORE
--     committing any pointer to it (investigation §3's defense table).
--     A future session must not read this list as "the bucket already
--     blocks SVG bytes" and skip that check.
--   * Client-side re-encode is UX + privacy (EXIF strip), never security.
--
-- ALLOWED MIME TYPES — jpeg/png/webp ONLY. DO NOT ADD image/svg+xml:
-- SVG is a script container (inline <script>, event handlers, foreignObject)
-- and these are PUBLIC buckets — an SVG served with an image/svg+xml
-- content-type renders inline, so an uploaded one is stored XSS. GIF is
-- also deliberately absent (no animation need; smaller decode surface). A
-- future format request should extend the client re-encode TARGET (webp),
-- not this accept list. (Gate ruling 3 pins this here so a future session
-- doesn't "helpfully" re-add either.)
--
-- PATH LAW (enforced by the policies below, not by convention):
--   avatars:         exactly '{auth.uid()}/avatar' — ONE object per user,
--                    replace = upsert of the same path, orphan-free by
--                    construction. Extension-less on purpose: the client
--                    re-encode targets webp but older Safari falls back to
--                    jpeg, and a format change must not strand the old file
--                    under a different name. Content-Type rides the object
--                    metadata; serving doesn't need the extension.
--   trainer-gallery: '{auth.uid()}/<anything>' — own folder only, trainer
--                    role required (the trainers row IS the role evidence,
--                    the M6 pattern). The AGGREGATE (object count × 5MB) is
--                    CONSCIOUSLY UNBOUNDED at this layer: no storage-side
--                    mechanism caps a folder, and the deliverable-2 table's
--                    position CHECK caps what RENDERS (8), never what the
--                    bucket holds. A hostile trainer scripting uploads into
--                    their own folder can burn storage quota — accepted at
--                    the hand-invited cohort size (investigation §3),
--                    flagged to the Phase 13 rate-limiting item. Don't
--                    mistake file_size_limit (per-object) for a folder cap.
--
-- Upsert mechanics (supabase docs, storage/security/access-control):
-- upload = INSERT; overwrite/upsert = SELECT + UPDATE; delete = DELETE.
-- Public buckets serve reads without a SELECT policy — the SELECT policies
-- below exist for the upsert path and owner-side listing, not for serving.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Buckets — INSERT is DML (allowed on hosted); ON CONFLICT DO UPDATE makes
--    this migration authoritative over any dashboard drift in the config
--    values. 2MB avatars / 5MB gallery: generous headroom over the ~500KB the
--    client re-encode actually produces, small enough that a hostile client
--    can't meaningfully burn the 1GB free-tier storage quota per object.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars',         'avatars',         true, 2097152, array['image/jpeg','image/png','image/webp']),
  ('trainer-gallery', 'trainer-gallery', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ----------------------------------------------------------------------------
-- 2. Avatar policies — role-universal, exact-path law.
--    The predicate pins the full object name, not just the folder: there is
--    exactly one legal object per user in this bucket.
--
--    (select auth.uid()) rather than bare auth.uid() — DELIBERATE deviation
--    from the older public-schema migrations: the scalar subselect becomes a
--    per-statement InitPlan instead of a per-row call, and storage.objects
--    is the one table where RLS predicates run against SCANS whose size
--    grows with everyone's objects (list/search), not just the caller's
--    rows. Behavior is identical; m18 category C asserts it.
--
--    avatars_update_own carries no WITH CHECK on purpose: Postgres applies
--    the USING expression to new rows when WITH CHECK is omitted, so the
--    exact-path law governs both halves from ONE copy of the predicate
--    (rename-to-foreign-path is denied — asserted behaviorally by C5b).
-- ----------------------------------------------------------------------------
create policy "avatars_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and name = (select auth.uid()::text) || '/avatar'
  );

-- SELECT exists for the upsert path (and lets the owner HEAD their own
-- object); public serving does not consult it.
create policy "avatars_select_own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'avatars'
    and name = (select auth.uid()::text) || '/avatar'
  );

create policy "avatars_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and name = (select auth.uid()::text) || '/avatar'
  );

create policy "avatars_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and name = (select auth.uid()::text) || '/avatar'
  );

-- ----------------------------------------------------------------------------
-- 3. Gallery policies — trainer-only, own-folder law. No UPDATE policy on
--    purpose: gallery objects are immutable (replace = upload new + delete
--    old, mirroring messages' immutability posture — the minimal surface).
--    The trainers EXISTS is pure PK comparison — no recursion risk (M11 §2).
-- ----------------------------------------------------------------------------
create policy "gallery_insert_own_trainer"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'trainer-gallery'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and exists (select 1 from public.trainers t where t.id = (select auth.uid()))
  );

create policy "gallery_select_own_trainer"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'trainer-gallery'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and exists (select 1 from public.trainers t where t.id = (select auth.uid()))
  );

create policy "gallery_delete_own_trainer"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'trainer-gallery'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and exists (select 1 from public.trainers t where t.id = (select auth.uid()))
  );
