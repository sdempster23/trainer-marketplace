-- Read-only baseline for the verified PawMatch production project immediately
-- before M22. Output contains counts and fingerprints, not personal row data.
-- Save the result for comparison with m22-production-after.sql.
begin read only;
set local statement_timeout = '15s';

select version from supabase_migrations.schema_migrations order by version;

select 'trainers' as relation, count(*) as rows,
       md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by id), '')) as old_fields_fingerprint
from public.trainers t
union all
select 'trainer_services', count(*),
       md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by id), ''))
from public.trainer_services t
union all
select 'bookings', count(*),
       md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by id), ''))
from public.bookings t;

commit;
