alter table public.ai_office_records add column source_model text;
alter table public.ai_office_records drop constraint ai_office_records_kind_check;
alter table public.ai_office_records add constraint ai_office_records_kind_check
 check(kind in ('draft','memory','user','assistant','chatgpt','consultation','gemini'));
alter table public.ai_office_records drop constraint ai_office_consultation_pair;
alter table public.ai_office_records add constraint ai_office_consultation_pair
 check(kind not in ('consultation','gemini') or (question is not null and thread_id is not null));
-- Browser insert policies deliberately omit 'gemini'. Only server responses use that provenance.
create table public.ai_office_gemini_jobs (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 employee_id text not null check(employee_id in ('chief','doctor','advisor','simulation','hr')),
 thread_id uuid not null,
 question text check(question is null or length(question) between 1 and 12000),
 request_hash text not null check(length(request_hash)=64),
 model text not null,
 state text not null check(state in ('running','complete','rate_limited','failed')),
 attempts integer not null default 1,
 attempted_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 retry_at timestamptz,
 error_code text,
 input_tokens integer,
 output_tokens integer,
 record_id uuid
);
alter table public.ai_office_gemini_jobs enable row level security;
revoke all on public.ai_office_gemini_jobs from anon,authenticated;
grant select on public.ai_office_gemini_jobs to authenticated;
grant all on public.ai_office_gemini_jobs to service_role;
create policy office_job_read on public.ai_office_gemini_jobs for select to authenticated
 using ((select auth.uid())=user_id);
create index ai_office_gemini_jobs_user on public.ai_office_gemini_jobs(user_id,attempted_at);
create index ai_office_gemini_jobs_rate on public.ai_office_gemini_jobs(attempted_at);

create table public.ai_office_gemini_limits (
 id boolean primary key default true check(id),
 cooldown_until timestamptz not null default '-infinity'
);
insert into public.ai_office_gemini_limits(id) values(true);
alter table public.ai_office_gemini_limits enable row level security;
revoke all on public.ai_office_gemini_limits from anon,authenticated;
grant all on public.ai_office_gemini_limits to service_role;

create function public.ai_office_gemini_reserve(
 p_id uuid,p_user uuid,p_employee text,p_thread uuid,p_question text,p_hash text,p_model text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare job public.ai_office_gemini_jobs; cooldown timestamptz; recent_count integer; daily_count integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('ai_office_gemini',0));
 update public.ai_office_gemini_jobs set state='failed',error_code='interrupted',question=null
  where state='running' and attempted_at<now()-interval '2 minutes';
 select * into job from public.ai_office_gemini_jobs where id=p_id;
 if found then
  if job.user_id<>p_user or job.request_hash<>p_hash then
   return jsonb_build_object('state','conflict');
  end if;
  if job.state<>'rate_limited' or job.attempts>=3 then
   return to_jsonb(job);
  end if;
  if job.retry_at>now() then return to_jsonb(job); end if;
 end if;
 select cooldown_until into cooldown from public.ai_office_gemini_limits where id;
 if cooldown>now() then return jsonb_build_object('state','rate_limited','retry_at',cooldown); end if;
 if exists(select 1 from public.ai_office_gemini_jobs
   where user_id=p_user and state='running' and attempted_at>now()-interval '2 minutes') then
  return jsonb_build_object('state','busy');
 end if;
 select count(*) into recent_count from public.ai_office_gemini_jobs
  where attempted_at>now()-interval '1 minute';
 if recent_count>=5 then
  return jsonb_build_object('state','rate_limited','retry_at',now()+interval '1 minute');
 end if;
 select coalesce(sum(attempts),0) into daily_count from public.ai_office_gemini_jobs
  where attempted_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
 if daily_count>=50 then
  return jsonb_build_object('state','rate_limited',
   'retry_at',(date_trunc('day',now() at time zone 'UTC')+interval '1 day') at time zone 'UTC');
 end if;
 if job.id is not null then
  update public.ai_office_gemini_jobs set state='running',attempts=attempts+1,
   attempted_at=now(),retry_at=null,error_code=null,question=p_question where id=p_id returning * into job;
 else
  insert into public.ai_office_gemini_jobs(id,user_id,employee_id,thread_id,question,request_hash,model,state)
   values(p_id,p_user,p_employee,p_thread,p_question,p_hash,p_model,'running') returning * into job;
 end if;
 return to_jsonb(job)||'{"new_attempt":true}'::jsonb;
end $$;
revoke all on function public.ai_office_gemini_reserve(uuid,uuid,text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.ai_office_gemini_reserve(uuid,uuid,text,uuid,text,text,text) to service_role;

create function public.ai_office_gemini_finish(p_id uuid,p_answer text,p_input integer,p_output integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare job public.ai_office_gemini_jobs; record public.ai_office_records;
begin
 select * into job from public.ai_office_gemini_jobs where id=p_id for update;
 if not found then raise exception 'Unknown request'; end if;
 if job.state='complete' then
  select * into record from public.ai_office_records where id=job.record_id;
  return to_jsonb(record);
 end if;
 if job.state<>'running' then raise exception 'Request is not running'; end if;
 insert into public.ai_office_records(id,user_id,employee_id,kind,content,question,thread_id,source_model)
 values(job.id,job.user_id,job.employee_id,'gemini',p_answer,job.question,job.thread_id,job.model)
 returning * into record;
 update public.ai_office_gemini_jobs set state='complete',record_id=record.id,question=null,
  input_tokens=p_input,output_tokens=p_output where id=p_id;
 return to_jsonb(record);
end $$;
revoke all on function public.ai_office_gemini_finish(uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.ai_office_gemini_finish(uuid,text,integer,integer) to service_role;

create function public.ai_office_gemini_pause(p_id uuid,p_seconds integer)
returns void language plpgsql security invoker set search_path='' as $$
declare until_time timestamptz;
begin
 until_time := now()+make_interval(secs=>greatest(60,least(p_seconds,86400)));
 update public.ai_office_gemini_jobs set state='rate_limited',retry_at=until_time,error_code='quota'
 where id=p_id and state='running';
 update public.ai_office_gemini_limits set cooldown_until=greatest(cooldown_until,until_time) where id;
end $$;
revoke all on function public.ai_office_gemini_pause(uuid,integer) from public,anon,authenticated;
grant execute on function public.ai_office_gemini_pause(uuid,integer) to service_role;
