begin;
insert into auth.users(id) values
 ('10000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000002');
set local role service_role;
do $$
declare reserved jsonb; saved jsonb;
begin
 reserved := public.ai_office_gemini_reserve(
 '20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
 'chief','30000000-0000-4000-8000-000000000001','test question',repeat('a',64),'test-model');
 if not (reserved->>'new_attempt')::boolean then raise exception 'Reservation failed'; end if;
 reserved := public.ai_office_gemini_reserve(
 '20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
 'chief','30000000-0000-4000-8000-000000000001','test question',repeat('a',64),'test-model');
 if reserved ? 'new_attempt' then raise exception 'Duplicate reservation executed'; end if;
 saved := public.ai_office_gemini_finish('20000000-0000-4000-8000-000000000001','test Gemini answer',30,20);
 if saved->>'kind'<>'gemini' or saved->>'question'<>'test question' then raise exception 'Wrong response provenance'; end if;
 perform public.ai_office_gemini_finish('20000000-0000-4000-8000-000000000001','duplicate',30,20);
 if (select count(*) from public.ai_office_records where id='20000000-0000-4000-8000-000000000001')<>1
 then raise exception 'Duplicate response'; end if;
 if (select question is not null from public.ai_office_gemini_jobs where id='20000000-0000-4000-8000-000000000001')
 then raise exception 'Completed job retained duplicate question'; end if;
end $$;
savepoint quota_test;
do $$
declare reserved jsonb;
begin
 perform public.ai_office_gemini_reserve(
 '20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',
 'chief','30000000-0000-4000-8000-000000000001','quota test',repeat('b',64),'test-model');
 perform public.ai_office_gemini_pause('20000000-0000-4000-8000-000000000002',120);
 reserved := public.ai_office_gemini_reserve(
 '20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002',
 'chief','30000000-0000-4000-8000-000000000002','wait test',repeat('c',64),'test-model');
 if reserved->>'state'<>'rate_limited' or reserved ? 'new_attempt' then raise exception 'Global quota pause bypassed'; end if;
end $$;
rollback to quota_test;
do $$
declare reserved jsonb; rid uuid; i integer;
begin
 for i in 2..5 loop
  rid := ('20000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
  reserved := public.ai_office_gemini_reserve(rid,'10000000-0000-4000-8000-000000000001',
   'chief','30000000-0000-4000-8000-000000000001','rate test',repeat('d',64),'test-model');
  if not coalesce((reserved->>'new_attempt')::boolean,false) then raise exception 'Unexpected early limit'; end if;
  perform public.ai_office_gemini_finish(rid,'rate test answer',10,10);
 end loop;
 reserved := public.ai_office_gemini_reserve(
 '20000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001',
 'chief','30000000-0000-4000-8000-000000000001','rate wait',repeat('e',64),'test-model');
 if reserved->>'state'<>'rate_limited' then raise exception 'Per-minute gate bypassed'; end if;
end $$;
set local role authenticated;
set local request.jwt.claims='{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
do $$
begin
 if (select count(*) from public.ai_office_gemini_jobs)<>5 then raise exception 'Owner cannot read jobs'; end if;
 begin
  insert into public.ai_office_records(user_id,employee_id,kind,question,thread_id,content)
   values('10000000-0000-4000-8000-000000000001','chief','gemini','forged question',
   '30000000-0000-4000-8000-000000000001','forged Gemini response');
  raise exception 'Client forged model response';
 exception when insufficient_privilege then null;
 end;
 if has_function_privilege('authenticated','public.ai_office_gemini_reserve(uuid,uuid,text,uuid,text,text,text)','execute')
 then raise exception 'Browser can reserve server execution'; end if;
end $$;
set local request.jwt.claims='{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}';
do $$
begin
 if exists(select 1 from public.ai_office_gemini_jobs) then raise exception 'Foreign jobs visible'; end if;
 if exists(select 1 from public.ai_office_records where user_id='10000000-0000-4000-8000-000000000001')
 then raise exception 'Foreign model responses visible'; end if;
end $$;
select 'passed Gemini provenance, atomic completion, duplicate prevention, quota gates and isolation' as result;
rollback;
