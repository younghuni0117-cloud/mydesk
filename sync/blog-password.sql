-- Add password management without modifying any post, calendar or robot data.
-- Bootstrap the existing key hash from the current write policy; no key is committed.
create schema mydesk_blog_private;
revoke all on schema mydesk_blog_private from public;
grant usage on schema mydesk_blog_private to anon, authenticated;
create table mydesk_blog_private.credentials (
 singleton boolean primary key default true check(singleton),
 bootstrap_hash text,
 password_hash text,
 generation bigint not null default 0,
 failures integer not null default 0,
 locked_until timestamptz
);
create table mydesk_blog_private.sessions (
 token_hash text primary key,
 generation bigint not null,
 expires_at timestamptz not null
);
alter table mydesk_blog_private.credentials enable row level security;
alter table mydesk_blog_private.sessions enable row level security;
revoke all on all tables in schema mydesk_blog_private from public, anon, authenticated;
create policy credentials_no_direct_access on mydesk_blog_private.credentials for all to anon,authenticated using(false) with check(false);
create policy sessions_no_direct_access on mydesk_blog_private.sessions for all to anon,authenticated using(false) with check(false);
do $bootstrap$
declare legacy_hash text;
begin
 select (regexp_match(qual, '''([0-9a-f]{64})'''))[1] into legacy_hash
 from pg_catalog.pg_policies where schemaname='public' and tablename='blog_posts' and policyname='blog_owner_update';
 if legacy_hash is null then raise exception 'Existing blog management policy missing'; end if;
 insert into mydesk_blog_private.credentials(singleton,bootstrap_hash) values(true,legacy_hash);
end $bootstrap$;

create function mydesk_blog_private.authorized() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists (
  select 1 from mydesk_blog_private.credentials c
  where (c.password_hash is null and c.bootstrap_hash=encode(extensions.digest(coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-client-info',''),'sha256'),'hex'))
  or exists (select 1 from mydesk_blog_private.sessions s
   where s.generation=c.generation and s.expires_at>now() and s.token_hash=encode(extensions.digest(coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-client-info',''),'sha256'),'hex'))
 );
$$;
create function mydesk_blog_private.issue_session() returns text
language plpgsql security invoker set search_path = '' as $$
declare token text;
begin
 token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into mydesk_blog_private.sessions(token_hash,generation,expires_at) select encode(extensions.digest('mydesk-blog/'||token,'sha256'),'hex'),generation,now()+interval '30 days' from mydesk_blog_private.credentials where singleton;
 return token;
end $$;
create function mydesk_blog_private.management_status() returns jsonb
language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('connected',mydesk_blog_private.authorized(),'password_set',password_hash is not null)
 from mydesk_blog_private.credentials where singleton;
$$;
create function mydesk_blog_private.login(password text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c mydesk_blog_private.credentials; token text;
begin
 select * into c from mydesk_blog_private.credentials where singleton for update;
 if c.locked_until>now() then return jsonb_build_object('ok',false,'message','시도가 많습니다. 30초 후 다시 시도해 주세요.'); end if;
 if c.password_hash is null then return jsonb_build_object('ok',false,'message','아직 비밀번호가 설정되지 않았습니다. 기존 관리 링크 또는 관리 키로 연결해 먼저 설정해 주세요.'); end if;
 if password is null or octet_length(password)>72 or octet_length(password)<8 then
  -- Invalid-length attempts consume the same limit as incorrect passwords.
  token:=null;
 elsif extensions.crypt(password,c.password_hash)=c.password_hash then
  update mydesk_blog_private.credentials set failures=0,locked_until=null where singleton;
  return jsonb_build_object('ok',true,'token',mydesk_blog_private.issue_session());
 end if;
 update mydesk_blog_private.credentials set failures=case when failures>=4 then 0 else failures+1 end,
 locked_until=case when failures>=4 then now()+interval '30 seconds' else null end where singleton;
 return jsonb_build_object('ok',false,'message','비밀번호가 맞지 않습니다.');
end $$;
create function mydesk_blog_private.set_password(new_password text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
 perform 1 from mydesk_blog_private.credentials where singleton for update;
 if not mydesk_blog_private.authorized() then return jsonb_build_object('ok',false,'message','관리 연결이 만료되었습니다. 다시 연결해 주세요.'); end if;
 if new_password is null or char_length(new_password)<8 or octet_length(new_password)>72 then
  return jsonb_build_object('ok',false,'message','비밀번호는 8자 이상, 영문 기준 72자 이내로 입력해 주세요. 한글은 더 짧게 입력해 주세요.');
 end if;
 update mydesk_blog_private.credentials set password_hash=extensions.crypt(new_password,extensions.gen_salt('bf',12)),bootstrap_hash=null,generation=generation+1,failures=0,locked_until=null where singleton;
 return jsonb_build_object('ok',true,'token',mydesk_blog_private.issue_session());
end $$;
create function mydesk_blog_private.logout() returns boolean
language plpgsql security definer set search_path = '' as $$
begin
 update mydesk_blog_private.sessions set expires_at=now() where token_hash=encode(extensions.digest(coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-client-info',''),'sha256'),'hex');
 return true;
end $$;

-- Public RPCs have caller privileges; privileged routines remain outside exposed schemas.
create function public.blog_management_status() returns jsonb language sql stable security invoker set search_path='' as $$ select mydesk_blog_private.management_status(); $$;
create function public.blog_management_login(password text) returns jsonb language sql security invoker set search_path='' as $$ select mydesk_blog_private.login(password); $$;
create function public.blog_management_set_password(new_password text) returns jsonb language sql security invoker set search_path='' as $$ select mydesk_blog_private.set_password(new_password); $$;
create function public.blog_management_logout() returns boolean language sql security invoker set search_path='' as $$ select mydesk_blog_private.logout(); $$;
revoke all on all functions in schema mydesk_blog_private from public,anon,authenticated;
grant execute on function mydesk_blog_private.authorized(),mydesk_blog_private.management_status(),mydesk_blog_private.login(text),mydesk_blog_private.set_password(text),mydesk_blog_private.logout() to anon,authenticated;
revoke all on function public.blog_management_status(),public.blog_management_login(text),public.blog_management_set_password(text),public.blog_management_logout() from public,anon,authenticated;
grant execute on function public.blog_management_status(),public.blog_management_login(text),public.blog_management_set_password(text),public.blog_management_logout() to anon,authenticated;
alter policy blog_owner_insert on public.blog_posts with check ((select mydesk_blog_private.authorized()));
alter policy blog_owner_update on public.blog_posts using ((select mydesk_blog_private.authorized())) with check ((select mydesk_blog_private.authorized()));
alter policy blog_owner_delete on public.blog_posts using ((select mydesk_blog_private.authorized()));
