-- ============================================================================
-- M18 storage-images suite fixture
-- ============================================================================
-- da180001 = a TRAINER (gallery-eligible), da180002 = an OWNER (proves the
-- avatar policies are role-universal and the gallery policies are not).
-- No storage objects are seeded — behavioral cases create their own rows
-- inside BEGIN/ROLLBACK. Cleanup of any leaked objects needs the platform's
-- delete-guard GUC (storage.protect_delete blocks direct SQL DELETE
-- otherwise — the same mechanic category C exercises).
-- ============================================================================
\set QUIET on
\set ON_ERROR_STOP on

select set_config('storage.allow_delete_query','true', false);
delete from storage.objects where bucket_id in ('avatars','trainer-gallery')
  and (storage.foldername(name))[1] in
    ('da180001-0000-0000-0000-000000000001','da180002-0000-0000-0000-000000000002');
select set_config('storage.allow_delete_query','false', false);

delete from public.trainers where id = 'da180001-0000-0000-0000-000000000001';
delete from auth.users where id in (
  'da180001-0000-0000-0000-000000000001','da180002-0000-0000-0000-000000000002');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        is_super_admin, confirmation_token, email_change,
                        email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000','da180001-0000-0000-0000-000000000001',
   'authenticated','authenticated','m18-trainer@test.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"trainer"}'::jsonb,false,'','','',''),
  ('00000000-0000-0000-0000-000000000000','da180002-0000-0000-0000-000000000002',
   'authenticated','authenticated','m18-owner@test.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"owner"}'::jsonb,false,'','','','');

insert into public.trainers (id, timezone) values
  ('da180001-0000-0000-0000-000000000001','America/Chicago');

\echo === M18 fixture loaded (trainer da180001, owner da180002) ===
