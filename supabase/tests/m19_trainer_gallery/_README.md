# M19 trainer gallery — test suite

Tests for migration M19 (`20260826120000_trainer_gallery.sql`): the
`trainer_gallery_photos` table that owns gallery ORDER and the 8-photo CAP
while the `trainer-gallery` storage bucket (M18) owns the bytes.

## Status

| Check | Covers |
|---|---|
| A1–A2 | the cap is structural: a 9th photo and a position-0 photo are both impossible (`position` CHECK 1..8) — no app-side count, nothing to forget |
| A3, A5 | `UNIQUE(trainer_id, position)` rejects a shared slot, and the DEFERRABLE constraint still fires at the commit boundary (deferrable ≠ unenforced) |
| A4 | the reorder mechanic: a two-row swap in ONE statement is legal under the deferrable unique (a non-deferrable index rejects it mid-statement — probed before the migration was written) and leaves each slot occupied exactly once |
| A6 | `file_name` charset is DB-enforced: `../avatars/{victim}/avatar`, uppercase, and garbage are all rejected by CHECK — the untrusted-read rule enforced *below* app code |
| A7 | the slot unique is per-trainer, not global |
| B1–B2 | public read: anon sees a listable trainer's photos and never a soft-deleted trainer's (mirrors the M3/M4 filter, so photos leave the directory with the rest of the listing) |
| B3–B6 | writes are own-row + trainer-role only: own insert works; foreign insert, owner-role insert, and reparenting a row to another trainer are all 42501 |
| B7–B8 | delete scoping: foreign delete silently filters to zero rows (USING), own delete succeeds |
| B9 | grant catalog — anon SELECT; authenticated SELECT/INSERT/UPDATE/DELETE; service_role nothing (M14's matrix independently asserts the `{}`, verified auto-covering this table at 17 tables) |
| B10 | gallery rows cascade with the trainer — the account-deletion path (storage objects still need the manual sweep; see docs/manual-steps.md) |
| C1 | **why `move_gallery_photo` exists**: two SEPARATE transactions cannot swap two positions — the first half raises 23505 at its own commit, because DEFERRABLE defers to *that* transaction's end, where the duplicate still lives. A first cut of the app action used two supabase-js `.update()` calls (two HTTP requests = two autocommit transactions) and every reorder failed. This check pins the failure so nobody "simplifies" the RPC away |
| C2–C4 | the RPC swaps adjacent photos, is a silent no-op at the ends of the list, and finds neighbours by ORDER — so deletion holes (1 and 5, nothing between) swap correctly rather than doing arithmetic on position |
| C5–C6 | a foreign photo raises 42501 explicitly (not a silent no-op — the SELECT inside the function rides the PUBLIC read policy, so the ownership check is load-bearing), and an invalid direction raises 22023 |
| C7 | EXECUTE grants: authenticated only; anon and service_role denied |

Total: 24 checks. Fixture: a trainer with 2 photos plus three controls — a
second trainer (foreign-write), an owner (role-gate), and a soft-deleted
trainer holding a photo (public-read filter).

## Mechanics notes

- **A3/A5 force the deferred check** with `set constraints
  public.tgp_unique_slot immediate` — without it a duplicate slot would
  only raise at COMMIT, which a `BEGIN … ROLLBACK` case never reaches.
- Positive cases (A7, B3) use bare SQL + `\echo`, not DO blocks: under
  `ON_ERROR_STOP` a denial halts the script, so the PASS line prints only
  on success (the m6/m16 convention).
