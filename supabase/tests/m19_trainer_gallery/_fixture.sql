-- ============================================================================
-- M19 trainer-gallery suite fixture
-- ============================================================================
-- da190001 = trainer with photos (the subject), da190002 = a SECOND trainer
-- (foreign-write control), da190003 = an OWNER (role-gate control),
-- da190004 = a SOFT-DELETED trainer with a photo (public-read filter control).
-- ============================================================================
\set QUIET on
\set ON_ERROR_STOP on

delete from public.trainer_gallery_photos where trainer_id in (
  'da190001-0000-0000-0000-000000000001','da190002-0000-0000-0000-000000000002',
  'da190004-0000-0000-0000-000000000004');
delete from public.trainers where id in (
  'da190001-0000-0000-0000-000000000001','da190002-0000-0000-0000-000000000002',
  'da190004-0000-0000-0000-000000000004');
delete from auth.users where id in (
  'da190001-0000-0000-0000-000000000001','da190002-0000-0000-0000-000000000002',
  'da190003-0000-0000-0000-000000000003','da190004-0000-0000-0000-000000000004');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        is_super_admin, confirmation_token, email_change,
                        email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000','da190001-0000-0000-0000-000000000001',
   'authenticated','authenticated','m19-trainer@test.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"trainer"}'::jsonb,false,'','','',''),
  ('00000000-0000-0000-0000-000000000000','da190002-0000-0000-0000-000000000002',
   'authenticated','authenticated','m19-trainer2@test.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"trainer"}'::jsonb,false,'','','',''),
  ('00000000-0000-0000-0000-000000000000','da190003-0000-0000-0000-000000000003',
   'authenticated','authenticated','m19-owner@test.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"owner"}'::jsonb,false,'','','',''),
  ('00000000-0000-0000-0000-000000000000','da190004-0000-0000-0000-000000000004',
   'authenticated','authenticated','m19-deleted@test.local','',
   now(),now(),now(),'{}'::jsonb,'{"role":"trainer"}'::jsonb,false,'','','','');

insert into public.trainers (id, timezone) values
  ('da190001-0000-0000-0000-000000000001','America/Chicago'),
  ('da190002-0000-0000-0000-000000000002','America/Chicago'),
  ('da190004-0000-0000-0000-000000000004','America/Chicago');

-- Subject trainer: two photos in slots 1 and 2.
insert into public.trainer_gallery_photos (trainer_id, file_name, position) values
  ('da190001-0000-0000-0000-000000000001','aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',1),
  ('da190001-0000-0000-0000-000000000001','bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',2);

-- Soft-deleted trainer with a photo (must be invisible to the public read).
insert into public.trainer_gallery_photos (trainer_id, file_name, position) values
  ('da190004-0000-0000-0000-000000000004','cccccccc-3333-4333-8333-cccccccccccc',1);
update public.profiles set deleted_at = now()
  where id = 'da190004-0000-0000-0000-000000000004';

\echo === M19 fixture loaded (trainer da190001 with 2 photos; controls 2/3/4) ===
