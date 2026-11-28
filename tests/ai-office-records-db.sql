-- Test users and records are rolled back with the transaction.
begin;
insert into auth.users(id) values
 ('10000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000002');
set local role authenticated;
set local request.jwt.claims='{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into public.ai_office_records(id,user_id,employee_id,kind,content,question,thread_id) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','chief','consultation','test answer','test question','30000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','chief','memory','test memory',null,null);
insert into public.ai_office_profiles(user_id,employee_id,name,personality,tone) values
 ('10000000-0000-4000-8000-000000000001','chief','test name','test personality','test tone');
update public.ai_office_records set content='edited memory'
 where id='20000000-0000-4000-8000-000000000002' and revision=1;
do $$
declare changed integer;
begin
 if not exists(select 1 from public.ai_office_records
   where id='20000000-0000-4000-8000-000000000002' and revision=2 and content='edited memory')
 then raise exception 'Memory revision update failed'; end if;
 update public.ai_office_records set content='stale overwrite'
 where id='20000000-0000-4000-8000-000000000002' and revision=1;
 get diagnostics changed = row_count;
 if changed<>0 then raise exception 'Stale memory edit succeeded'; end if;
 update public.ai_office_records set content='tampered answer'
 where id='20000000-0000-4000-8000-000000000001';
 get diagnostics changed = row_count;
 if changed<>0 then raise exception 'Consultation edit succeeded'; end if;
 begin
  insert into public.ai_office_records(user_id,employee_id,kind,content)
   values('10000000-0000-4000-8000-000000000001','chief','consultation','incomplete pair');
  raise exception 'Incomplete question/answer pair accepted';
 exception when check_violation then null;
 end;
 begin
  insert into public.ai_office_profiles(user_id,employee_id,name,personality,tone)
   values('10000000-0000-4000-8000-000000000002','chief','wrong owner','personality','tone');
  raise exception 'Cross-account profile insert succeeded';
 exception when insufficient_privilege then null;
 end;
end $$;
set local request.jwt.claims='{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}';
do $$
begin
 if exists(select 1 from public.ai_office_records where user_id='10000000-0000-4000-8000-000000000001')
 then raise exception 'Cross-account records visible'; end if;
 if exists(select 1 from public.ai_office_profiles where user_id='10000000-0000-4000-8000-000000000001')
 then raise exception 'Cross-account profiles visible'; end if;
end $$;
select 'passed paired storage, memory revisions, immutable answers and account isolation' as result;
rollback;
