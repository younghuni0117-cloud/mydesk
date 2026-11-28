-- Synthetic, rollback-only credential: never returns real content or verifier.
begin;
set local request.headers='{"x-client-info":"mydesk-blog-reader"}';
select set_config('mydesk.resume_test_password',extensions.gen_random_uuid()::text,true) is not null as generated;
update mydesk_blog_private.post_content set password_hash=extensions.crypt(current_setting('mydesk.resume_test_password'),extensions.gen_salt('bf',4)),failures=0,locked_until=null where post_id='career-resume-main';
set local role anon;
do $$
declare pwd text:=current_setting('mydesk.resume_test_password'); r jsonb; d jsonb; v bigint;
begin
 r:=public.resume_profile(null);if coalesce((r->>'ok')::boolean,false) then raise exception 'Anonymous read allowed';end if;
 r:=public.resume_profile('synthetic-wrong-password');if coalesce((r->>'ok')::boolean,false) then raise exception 'Wrong-password read allowed';end if;
 r:=public.resume_profile(pwd);if not (r->>'ok')::boolean then raise exception 'Correct password failed';end if;v:=(r->>'revision')::bigint;
 d:='{"version":1,"sections":{"profile":[],"education":[],"career":[],"projects":[],"papers":[{"id":"test-paper","fields":{"title":"Synthetic paper"}}],"patents":[],"certificates":[],"languages":[],"essays":[],"preferences":[],"archive":[]}}'::jsonb;
 r:=public.resume_profile(pwd,d,v);if not (r->>'ok')::boolean then raise exception 'Save failed: %',r->>'message';end if;
 r:=public.resume_profile(pwd);if r->'document'<>d then raise exception 'Restore differs';end if;
 r:=public.resume_profile(pwd,d,v);if (r->>'ok')::boolean then raise exception 'Stale write accepted';end if;
 d:=jsonb_set(d,'{sections,papers,0,fields,title}','123'::jsonb);r:=public.resume_profile(pwd,d,v+1);if (r->>'ok')::boolean then raise exception 'Invalid field accepted';end if;
 begin perform document from mydesk_resume_private.profile;raise exception 'Direct table access allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
