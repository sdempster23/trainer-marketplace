-- ============================================================================
-- State of the marketplace — one query, readable output.
--
-- HOW TO USE: paste the whole file into the Supabase SQL editor (SQL Editor →
-- New query) and run it. Save it there as "State of the marketplace" so it's
-- one click next time. Output is three columns (section | metric | count),
-- grouped and ordered so it reads top-to-bottom like a dashboard.
--
-- Definitions (kept in sync with app code — update BOTH if these change):
--   * "listed" trainer = display_name + service location — THE LISTABLE FLOOR
--     from app/(app)/trainers/page.tsx, applied there in both browse and
--     proximity modes. Zero-specialty trainers deliberately PASS the floor
--     (they render as a no-pills card), so they count as listed here too,
--     on their own row so the mid-onboarding state stays visible.
--   * "partial" trainer = trainers row exists but fails the floor (missing
--     display name and/or location) — never renders in /trainers.
--   * User, trainer, and signup counts exclude soft-deleted profiles
--     (deleted_at IS NULL); a "deleted (soft)" row appears under users only
--     when any exist. Bookings and messaging count ALL rows — those records
--     deliberately survive account soft-deletion, so their totals can exceed
--     what active users alone explain.
--   * The bookings and signups sections always show a total row, even at 0.
--   * Section 6 (images) is also the MODERATION visibility surface (gate
--     ruling 4: manual-with-visibility) and the deletion-runbook verifier:
--     avatar/gallery object counts always show; MISMATCH rows (an
--     avatar pointer with no object, or an avatars-bucket object with no
--     pointer) appear ONLY when nonzero — any MISMATCH row is a cleanup
--     item (see docs/manual-steps.md, account deletion runbook).
--
-- PARKED (backlog, deliberately not now): a custom admin dashboard
-- (build-plan.md Phase 12) would render these numbers in the app. At the
-- current scale the raw rows are readable here and in the Supabase table
-- editor, so this saved query IS the admin dashboard until real traffic
-- makes it insufficient.
-- ============================================================================

with active_profiles as (
  select id, role, display_name, avatar_url, created_at
  from public.profiles
  where deleted_at is null
),

-- Every active trainer-role profile bucketed by how far their listing got.
trainer_pipeline as (
  select
    case
      when t.id is null
        then 'signed up, listing not started'
      when p.display_name is null or t.service_point is null
        then 'partial (missing '
             || concat_ws(
                  ' + ',
                  case when p.display_name is null then 'display name' end,
                  case when t.service_point is null then 'location' end
                )
             || ')'
      when coalesce(s.specialty_count, 0) = 0
        then 'listed, zero specialties (visible, no specialty pills)'
      else 'listed (visible in /trainers)'
    end as status
  from active_profiles p
  left join public.trainers t on t.id = p.id
  left join lateral (
    select count(*) as specialty_count
    from public.trainer_specialty_assignments a
    where a.trainer_id = t.id
  ) s on true
  where p.role = 'trainer'
)

select section, metric, count
from (
  -- 1. Users by role -------------------------------------------------------
  select 1 as section_sort, 1 as metric_sort,
         '1. users by role' as section, role::text as metric, count(*) as count
  from active_profiles
  group by role

  union all
  select 1, 9, '1. users by role', 'deleted (soft)', count(*)
  from public.profiles
  where deleted_at is not null
  having count(*) > 0

  -- 2. Trainer listings ----------------------------------------------------
  union all
  select 2, 1, '2. trainer listings', status, count(*)
  from trainer_pipeline
  group by status

  -- 3. Bookings by status --------------------------------------------------
  -- ROLLUP emits the per-status rows AND a grand-total row (status NULL)
  -- from one scan, so total and breakdown can never drift apart; on an
  -- empty table the total row still appears at 0. metric_sort derives the
  -- enum's own declared order, so a future ALTER TYPE can't leave a
  -- hand-copied CASE stale.
  union all
  select 3,
         coalesce(array_position(enum_range(null::public.booking_status), status), 0),
         '3. bookings by status',
         coalesce(status::text, 'total'),
         count(*)
  from public.bookings
  group by rollup (status)

  -- 4. Messaging -----------------------------------------------------------
  union all
  select 4, 1, '4. messaging', 'threads', count(*)
  from public.message_threads

  union all
  select 4, 2, '4. messaging', 'messages', count(*)
  from public.messages

  -- 5. Signups in the last 7 days (total row via ROLLUP, as above) ---------
  union all
  select 5,
         case when role is null then 0 else 1 end,
         '5. signups, last 7 days',
         coalesce(role::text, 'total'),
         count(*)
  from active_profiles
  where created_at >= now() - interval '7 days'
  group by rollup (role)

  -- 6. Images — moderation visibility + pointer/object reconciliation ------
  -- split_part(avatar_url,'?',1) strips the ?v= cache-buster: the object
  -- name in storage carries no query string.
  union all
  select 6, 1, '6. images', 'profiles with an avatar', count(*)
  from active_profiles
  where avatar_url is not null

  union all
  select 6, 2, '6. images', 'avatar objects (storage)', count(*)
  from storage.objects
  where bucket_id = 'avatars'

  union all
  select 6, 3, '6. images', 'gallery objects (storage)', count(*)
  from storage.objects
  where bucket_id = 'trainer-gallery'

  -- MISMATCH semantics (review-hardened, both blind spots closed):
  --   * A pointer is VALID only when it matches the profile's OWN rebuilt
  --     shape ('{p.id}/avatar?v=<digits>') — the same rule the app's
  --     publicAvatarUrl enforces at render. A tampered/foreign/malformed
  --     pointer flags as 6.7, and can never "claim" someone else's object.
  --   * Objects are claimed only by their OWN ACTIVE profile: a
  --     soft-deleted user's still-served avatar object flags as 6.9
  --     (it's a runbook sweep item, not silently accounted for).
  union all
  select 6, 7, '6. images', 'MISMATCH: malformed or foreign avatar pointer', count(*)
  from active_profiles p
  where p.avatar_url is not null
    and p.avatar_url !~ ('^' || p.id::text || '/avatar\?v=[0-9]+$')
  having count(*) > 0

  union all
  select 6, 8, '6. images', 'MISMATCH: avatar pointer without object', count(*)
  from active_profiles p
  where p.avatar_url is not null
    and p.avatar_url ~ ('^' || p.id::text || '/avatar\?v=[0-9]+$')
    and not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'avatars'
        and o.name = p.id::text || '/avatar'
    )
  having count(*) > 0

  union all
  select 6, 9, '6. images', 'MISMATCH: avatar object without pointer', count(*)
  from storage.objects o
  where o.bucket_id = 'avatars'
    and not exists (
      select 1 from active_profiles p
      where p.id::text || '/avatar' = o.name
        and p.avatar_url is not null
    )
  having count(*) > 0
) as report
order by section_sort, metric_sort, metric;
