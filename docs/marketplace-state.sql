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
--
-- PARKED (backlog, deliberately not now): a custom admin dashboard
-- (build-plan.md Phase 12) would render these numbers in the app. At the
-- current scale the raw rows are readable here and in the Supabase table
-- editor, so this saved query IS the admin dashboard until real traffic
-- makes it insufficient.
-- ============================================================================

with active_profiles as (
  select id, role, display_name, created_at
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
) as report
order by section_sort, metric_sort, metric;
