alter table public.ai_office_records add column question text
 check(question is null or length(btrim(question)) between 1 and 12000);
alter table public.ai_office_records add column thread_id uuid;
alter table public.ai_office_records drop constraint ai_office_records_kind_check;
alter table public.ai_office_records add constraint ai_office_records_kind_check
 check(kind in ('draft','memory','user','assistant','chatgpt','consultation'));
alter table public.ai_office_records add constraint ai_office_consultation_pair
 check(kind<>'consultation' or (question is not null and thread_id is not null));
create index ai_office_records_thread on public.ai_office_records(user_id,thread_id,created_at);
drop policy office_write on public.ai_office_records;
create policy office_write on public.ai_office_records for insert to authenticated
 with check ((select auth.uid())=user_id and kind in ('draft','memory','chatgpt','consultation'));
revoke update on public.ai_office_records from authenticated;
grant update(content) on public.ai_office_records to authenticated;
create policy office_edit_memory on public.ai_office_records for update to authenticated
 using ((select auth.uid())=user_id and kind='memory')
 with check ((select auth.uid())=user_id and kind='memory');

create table public.ai_office_profiles (
 user_id uuid not null references auth.users(id) on delete cascade,
 employee_id text not null check(employee_id in ('chief','doctor','advisor','simulation','hr')),
 name text not null check(length(btrim(name)) between 1 and 80),
 personality text not null check(length(btrim(personality)) between 1 and 1000),
 tone text not null check(length(btrim(tone)) between 1 and 1000),
 primary key(user_id,employee_id)
);
alter table public.ai_office_profiles enable row level security;
revoke all on public.ai_office_profiles from anon;
grant select,insert,update,delete on public.ai_office_profiles to authenticated;
grant all on public.ai_office_profiles to service_role;
create policy office_profile_read on public.ai_office_profiles for select to authenticated
 using ((select auth.uid())=user_id);
create policy office_profile_insert on public.ai_office_profiles for insert to authenticated
 with check ((select auth.uid())=user_id);
create policy office_profile_update on public.ai_office_profiles for update to authenticated
 using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy office_profile_delete on public.ai_office_profiles for delete to authenticated
 using ((select auth.uid())=user_id);
