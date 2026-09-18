-- Completes the transaction opened by upgrade_before.sql around M22.
do $$ begin
 if not exists (
   select 1 from public.trainers t, m22_upgrade_baseline b
   where t.id = '22b00000-0000-0000-0000-000000000001' and b.kind = 'trainer'
     and t.country_code = 'US' and t.postal_area is null
     and (to_jsonb(t) - 'country_code' - 'postal_area') = b.row_data
 ) then raise exception 'M22 upgrade changed an existing trainer or invented an area'; end if;
 if not exists (
   select 1 from public.trainer_services s, m22_upgrade_baseline b
   where s.id = '22b00000-0000-0000-0001-000000000001' and b.kind = 'service'
     and s.currency = 'USD' and (to_jsonb(s) - 'currency') = b.row_data
 ) then raise exception 'M22 upgrade changed an existing service price or fields'; end if;
 if not exists (
   select 1 from public.bookings t, m22_upgrade_baseline b
   where t.id = '22b00000-0000-0000-0003-000000000001' and b.kind = 'booking'
     and t.currency = 'USD' and (to_jsonb(t) - 'currency') = b.row_data
 ) then raise exception 'M22 upgrade changed an existing booking price or fields'; end if;
 raise notice 'PASS M22 US/USD backfill preserves every existing row field';
end $$;
rollback;
