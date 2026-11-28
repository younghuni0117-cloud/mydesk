alter table public.ai_office_records drop constraint ai_office_records_kind_check;
alter table public.ai_office_records add constraint ai_office_records_kind_check
 check(kind in ('draft','memory','user','assistant','chatgpt'));
drop policy office_write on public.ai_office_records;
create policy office_write on public.ai_office_records for insert to authenticated
 with check ((select auth.uid())=user_id and kind in ('draft','memory','chatgpt'));
