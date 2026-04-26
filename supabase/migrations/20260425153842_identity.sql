-- ============================================================================
-- Migration 1 — Identity foundation
-- ============================================================================
-- Adds:
--   1. Shared infrastructure: update_updated_at_column() trigger function
--      (used by every table from this migration onward to maintain
--      updated_at).
--   2. user_role enum (owner | trainer | admin).
--   3. profiles table — our user-facing extension of auth.users.
--   4. handle_new_user() trigger that auto-creates a profiles row whenever
--      a new auth.users row is inserted.
--   5. RLS policies + index for profiles.
--
-- Author note: this is the foundation. Most subsequent migrations attach
-- to this in some way (FK to profiles.id, RLS that references auth.uid(),
-- shared updated_at trigger).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Shared updated_at trigger function
-- ----------------------------------------------------------------------------
-- Every table in this app has an `updated_at timestamptz` column that should
-- be set to now() on every UPDATE. This function is the trigger body. We
-- attach it once per table via a BEFORE UPDATE FOR EACH ROW trigger.
-- Defined once here, reused by every migration that creates a table.
-- ----------------------------------------------------------------------------
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.update_updated_at_column() is
  'BEFORE UPDATE trigger that sets NEW.updated_at = now(). Attach to every table.';


-- ----------------------------------------------------------------------------
-- 2. user_role enum
-- ----------------------------------------------------------------------------
-- Three roles for V1:
--   owner   — pet owner booking sessions
--   trainer — trainer offering services
--   admin   — Shane (and trusted operators) for moderation
--
-- Adding new values later: `alter type user_role add value 'newrole';`
-- Postgres enums do NOT support drop value — pick deliberately.
-- ----------------------------------------------------------------------------
create type public.user_role as enum ('owner', 'trainer', 'admin');


-- ----------------------------------------------------------------------------
-- 3. profiles table
-- ----------------------------------------------------------------------------
-- 1:1 with auth.users. Same id (uuid). The profile *is* the user from the
-- app's perspective; auth.users is Supabase's internal auth state we don't
-- touch directly.
--
-- ON DELETE CASCADE: if an auth.users row is hard-deleted (dev cleanup or
-- a future bug), the profile vanishes with it rather than dangling. This
-- decision is documented in architecture.md and was made deliberately —
-- production user deletion is anonymization (Phase 13), not hard delete,
-- so cascade is the safety net for the unexpected case, not the normal flow.
-- ----------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  role          user_role not null,
  display_name  text,
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

comment on table public.profiles is
  '1:1 extension of auth.users. Role determines which feature surfaces apply.';
comment on column public.profiles.deleted_at is
  'Soft-delete marker. NULL = active. Set by the account-deletion flow (Phase 13).';


-- ----------------------------------------------------------------------------
-- 4. updated_at trigger on profiles
-- ----------------------------------------------------------------------------
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.update_updated_at_column();


-- ----------------------------------------------------------------------------
-- 5. Index on role
-- ----------------------------------------------------------------------------
-- Trainer search will filter `where role = 'trainer'` constantly. Btree
-- index makes that filter instant. No other indexes yet — add as queries
-- demand them.
-- ----------------------------------------------------------------------------
create index idx_profiles_role on public.profiles(role);


-- ----------------------------------------------------------------------------
-- 6. Auto-create profile when an auth.users row is inserted
-- ----------------------------------------------------------------------------
-- Supabase Auth handles signup → inserts into auth.users. We need a matching
-- profiles row created in the same transaction with the right role. The
-- signup code (Phase 2) passes the chosen role via raw_user_meta_data:
--     supabase.auth.signUp({ ..., options: { data: { role: 'owner' } } })
--
-- The trigger reads that metadata. If the metadata role is not in
-- {'owner', 'trainer'} it silently downgrades to 'owner' — this prevents
-- a user from claiming role='admin' via signup metadata. Admin promotion
-- happens via a separate admin-only path (Phase 12).
--
-- SECURITY DEFINER: required because the function runs in the context of
-- the auth role (which can't insert into public.profiles). DEFINER runs
-- the function as its owner (postgres), bypassing the caller's privileges.
-- The `set search_path = public, auth` is a hardening step against
-- search_path injection on SECURITY DEFINER functions.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (id, role)
  values (
    new.id,
    case
      when (new.raw_user_meta_data->>'role') in ('owner', 'trainer')
        then (new.raw_user_meta_data->>'role')::user_role
      else 'owner'::user_role
    end
  );
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'AFTER INSERT trigger on auth.users. Creates the matching profiles row, reading role from raw_user_meta_data. Silently downgrades non-{owner,trainer} roles to owner. Runs as SECURITY DEFINER.';

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();


-- ----------------------------------------------------------------------------
-- 7. Row Level Security
-- ----------------------------------------------------------------------------
-- Non-negotiable: enable RLS, then add policies. With RLS enabled and no
-- policies, the table is effectively unreadable — that's the safe default.
-- We're explicit about WHO can do WHAT.
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;


-- Policy 1: a logged-in user can read their own profile row.
create policy "Users read their own profile"
  on public.profiles
  for select
  using (auth.uid() = id);


-- Policy 2: trainer profiles are publicly readable, even for logged-out
-- visitors. Powers the public trainer search and trainer profile pages.
-- Soft-deleted trainers are NOT publicly visible.
create policy "Trainer profiles are publicly readable"
  on public.profiles
  for select
  using (role = 'trainer' and deleted_at is null);


-- Policy 3: a user can update their own profile.
-- WITH CHECK enforces that the row AFTER update still satisfies the rule
-- AND the role hasn't changed. Role changes are admin-only (Phase 12).
-- The subquery reads the current committed role for the same user; the
-- new role must equal it.
--
-- Note: this policy currently lets a user update their own deleted_at,
-- which would soft-delete themselves. Phase 13 will introduce a deliberate
-- account-deletion flow via a server-side function and tighten this
-- (or replace it). Until then, the UI doesn't expose deleted_at and the
-- data is recoverable, so the gap is acceptable.
create policy "Users update their own profile"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select role from public.profiles where id = auth.uid())
  );


-- No INSERT policy: profiles are created exclusively by the
-- on_auth_user_created trigger, which runs as SECURITY DEFINER and
-- bypasses RLS. Application code never inserts into profiles directly.

-- No DELETE policy: profiles are never deleted via the API. The CASCADE
-- from auth.users handles dev cleanup; production uses soft-delete.
