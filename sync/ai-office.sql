create table public.ai_office_records (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 employee_id text not null check(employee_id in ('chief','doctor','advisor','simulation','hr')),
 kind text not null check(kind in ('draft','memory','user','assistant')),
 content text not null check(length(content) between 1 and 12000),
 created_at timestamptz not null default now()
);
create index ai_office_records_owner_employee on public.ai_office_records(user_id,employee_id,created_at);
alter table public.ai_office_records enable row level security;
revoke all on public.ai_office_records from anon;
grant select,insert,delete on public.ai_office_records to authenticated;
grant all on public.ai_office_records to service_role;
create policy office_read on public.ai_office_records for select to authenticated using ((select auth.uid())=user_id);
create policy office_write on public.ai_office_records for insert to authenticated with check ((select auth.uid())=user_id and kind in ('draft','memory'));
create policy office_delete on public.ai_office_records for delete to authenticated using ((select auth.uid())=user_id);

create table public.ai_office_requests(
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 employee_id text not null,
 content text not null,
 state text not null default 'running' check(state in ('running','complete','failed')),
 response text,
 reserved_usd numeric not null default 0.05,
 input_tokens integer,
 output_tokens integer,
 created_at timestamptz not null default now()
);
alter table public.ai_office_requests enable row level security;
revoke all on public.ai_office_requests from anon,authenticated;
grant all on public.ai_office_requests to service_role;
create function public.ai_office_reserve(p_id uuid,p_user uuid,p_employee text,p_content text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare existing public.ai_office_requests;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into existing from public.ai_office_requests where id=p_id;
 if found then
  if existing.user_id<>p_user or existing.employee_id<>p_employee or existing.content<>p_content then
   raise exception 'Request ID conflict';
  end if;
  return to_jsonb(existing);
 end if;
 if (select coalesce(sum(reserved_usd),0) from public.ai_office_requests
     where user_id=p_user and created_at>=date_trunc('month',now())) + .05 > 5 then
  raise exception 'Monthly reservation limit reached';
 end if;
 insert into public.ai_office_requests(id,user_id,employee_id,content) values(p_id,p_user,p_employee,p_content)
 returning * into existing;
 return to_jsonb(existing)||'{"new_request":true}'::jsonb;
end $$;
revoke all on function public.ai_office_reserve(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.ai_office_reserve(uuid,uuid,text,text) to service_role;
create function public.ai_office_complete(p_id uuid,p_response text,p_input integer,p_output integer)
returns void language plpgsql security invoker set search_path = '' as $$
declare job public.ai_office_requests;
begin
 select * into job from public.ai_office_requests where id=p_id for update;
 if not found or job.state<>'running' then raise exception 'Request unavailable'; end if;
 insert into public.ai_office_records(user_id,employee_id,kind,content)
 values(job.user_id,job.employee_id,'user',job.content),(job.user_id,job.employee_id,'assistant',p_response);
 update public.ai_office_requests set state='complete',response=p_response,input_tokens=p_input,output_tokens=p_output where id=p_id;
end $$;
revoke all on function public.ai_office_complete(uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.ai_office_complete(uuid,text,integer,integer) to service_role;
