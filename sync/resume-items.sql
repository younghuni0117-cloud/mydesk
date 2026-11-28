-- Structured resume stays outside the exposed schema. Existing post/password unchanged.
create schema if not exists mydesk_resume_private;
revoke all on schema mydesk_resume_private from public;
grant usage on schema mydesk_resume_private to anon,authenticated;
create table if not exists mydesk_resume_private.profile (
 id boolean primary key default true check(id),
 document jsonb not null,
 revision bigint not null default 1,
 updated_at timestamptz not null default now()
);
alter table mydesk_resume_private.profile enable row level security;
revoke all on mydesk_resume_private.profile from public,anon,authenticated;
drop policy if exists resume_no_direct_access on mydesk_resume_private.profile;
create policy resume_no_direct_access on mydesk_resume_private.profile for all to anon,authenticated using(false) with check(false);
create or replace function mydesk_resume_private.access_profile(password text, payload jsonb, expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare checked jsonb; current_row mydesk_resume_private.profile; category text; items jsonb; item jsonb; value jsonb;
begin
 checked:=mydesk_blog_private.read_post('career-resume-main',password);
 if not coalesce((checked->>'ok')::boolean,false) then return checked; end if;
 if not coalesce((checked->'post'->>'is_private')::boolean,false) then
  return jsonb_build_object('ok',false,'message','이력서 비공개 설정을 확인해 주세요.');
 end if;
 select * into current_row from mydesk_resume_private.profile where id=true for update;
 if payload is null then return jsonb_build_object('ok',true,'document',current_row.document,'revision',coalesce(current_row.revision,0),'legacy_body',checked->'post'->>'body');end if;
 if expected_revision is distinct from coalesce(current_row.revision,0) then return jsonb_build_object('ok',false,'message','다른 기기에서 이력이 변경되었습니다. 새로 열어 최신 내용을 확인해 주세요.');end if;
 if octet_length(payload::text)>500000 or jsonb_typeof(payload)<>'object' or (payload->>'version') is distinct from '1' or jsonb_typeof(payload->'sections') is distinct from 'object' then
  return jsonb_build_object('ok',false,'message','이력 형식이나 용량을 확인해 주세요.');end if;
 for category,items in select * from jsonb_each(payload->'sections') loop
  if category not in ('profile','education','career','projects','papers','patents','certificates','languages','essays','preferences','archive') or jsonb_typeof(items)<>'array' or jsonb_array_length(items)>200 then return jsonb_build_object('ok',false,'message','이력 항목을 확인해 주세요.');end if;
  for item in select * from jsonb_array_elements(items) loop
   if jsonb_typeof(item)<>'object' or coalesce(item->>'id','')!~'^[a-zA-Z0-9_-]{1,100}$' or jsonb_typeof(item->'fields') is distinct from 'object' then return jsonb_build_object('ok',false,'message','이력 항목 형식 오류');end if;
   for value in select v from jsonb_each(item->'fields') as fields(k,v) loop
    if jsonb_typeof(value)<>'string' or length(value#>>'{}')>20000 then return jsonb_build_object('ok',false,'message','입력 항목은 20,000자 이하로 작성해 주세요.');end if;
   end loop;
  end loop;
 end loop;
 insert into mydesk_resume_private.profile(id,document,revision) values(true,payload,1)
 on conflict(id) do update set document=excluded.document,revision=profile.revision+1,updated_at=now() returning * into current_row;
 return jsonb_build_object('ok',true,'document',current_row.document,'revision',current_row.revision);
end $$;
create or replace function public.resume_profile(password text,payload jsonb default null,expected_revision bigint default null)
returns jsonb language sql security invoker set search_path='' as $$select mydesk_resume_private.access_profile(password,payload,expected_revision);$$;
revoke all on function mydesk_resume_private.access_profile(text,jsonb,bigint),public.resume_profile(text,jsonb,bigint) from public,anon,authenticated;
grant execute on function mydesk_resume_private.access_profile(text,jsonb,bigint),public.resume_profile(text,jsonb,bigint) to anon,authenticated;
notify pgrst,'reload schema';
