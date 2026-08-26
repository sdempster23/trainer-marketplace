# M18 storage images — test suite

Tests for migration M18 (`20260825190000_trainer_images_storage.sql`): the
repo's first binary storage — the `avatars` and `trainer-gallery` buckets
and the seven policies on `storage.objects` that are their entire access
model.

## THE CONTRACT (storage-flavored declared-set discipline)

**Assert what we DECLARE — bucket config and our policies, in both
directions; never pin storage GRANTS.** The platform grants all API roles
full DML on `storage.objects` and gates purely by policy (probed
2026-08-25, investigation §2). Pinning those grants would couple this
suite to a platform-owned ACL — the drift class the M14 contract refuses.
So M14 stays `nspname='public'`-scoped, and this suite is the storage
analog: config + policies + behavior.

## Status

| Check | Covers |
|---|---|
| A1/A2 | bucket declaration matrix: both declared buckets exist with EXACT config (public, file_size_limit, allowed_mime_types, order-insensitive) AND no undeclared bucket exists |
| B1/B2 | policy declaration matrix: all 7 declared (policyname, cmd, roles=authenticated) present on storage.objects AND nothing undeclared on storage.objects OR storage.buckets (buckets is policy-gated the same way — a stray policy there would let users mint buckets with self-chosen caps; we declare zero). Predicate text deliberately unasserted (pg_policies pretty-printing is version-sensitive) — category C asserts predicates behaviorally |
| C1-C10 (+C5b) | behavioral RLS via direct DML under JWT-scoped roles: avatar exact-path law (one legal object, `{uid}/avatar`), role-universality (owner-role writes avatars, C1), foreign-path/foreign-folder denial, anon denial, upsert's UPDATE half (C5) AND its negative direction (C5b: rename-to-foreign-path denied — the avatar-hijack shape UPDATE-policy drift would open), gallery trainer-gating (trainers row = role evidence), DELETE scoping under the platform GUC, and C10 pinning the platform's protect_delete guard itself (direct SQL delete without the GUC = 42501 — cleanup must use the Storage API) |

Total: 15 checks. Fixture: two auth users (trainer `da180001`, owner
`da180002`) — no storage objects are seeded; behavioral cases mint their
own rows inside BEGIN/ROLLBACK.

## Mechanics notes

- Storage RLS fires on direct DML exactly as on Storage-API writes, so the
  M6 conventions (BEGIN/ROLLBACK per case, JWT-clearing prelude, 42501 via
  `insufficient_privilege`, silent-filter via ROW_COUNT) transfer whole.
- DELETE cases must `set_config('storage.allow_delete_query','true', true)`
  first: the platform's `protect_delete` STATEMENT trigger fires before RLS
  is consulted. The fixture's cleanup does the same at session level.
- The fixture inserts `auth.users` directly (the M10/M17 GoTrue-gotcha
  pattern: `''` not NULL for token/string columns; `handle_new_user` mints
  the profiles rows).
