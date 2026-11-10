begin;
-- The temporary session and test post disappear on rollback. Existing credentials
-- and posts are not edited. Only assertions (never the session value) are returned.
do $$
declare test_header text:='mydesk-blog/'||encode(extensions.gen_random_bytes(32),'hex');
begin
 insert into mydesk_blog_private.sessions(token_hash,generation,expires_at)
 select encode(extensions.digest(test_header,'sha256'),'hex'),generation,now()+interval '2 minutes' from mydesk_blog_private.credentials where singleton;
 perform set_config('request.headers',jsonb_build_object('x-client-info',test_header)::text,true);
end $$;
set local role anon;
do $$
declare r jsonb; rev bigint; place text; payload jsonb; denied boolean:=false;
begin
 select menu_id into place from public.blog_posts limit 1;
 payload:=jsonb_build_object('id','privacy-transaction-test','category','structural','topic','test','menu_id',place,'title','privacy test','summary','PRIVATE SUMMARY','body','<p>PRIVATE BODY</p>','is_private',true);
 r:=public.blog_post_save(payload,null,'test-password-one');
 if not (r->>'ok')::boolean then raise exception 'Private save failed: %',r; end if;
 if exists(select 1 from public.blog_posts where id='privacy-transaction-test' and (body<>'' or summary<>'' or not is_private)) then raise exception 'Content exposed'; end if;
 r:=public.blog_post_read('privacy-transaction-test');
 if r->'post'->>'body'<>'<p>PRIVATE BODY</p>' then raise exception 'Admin read failed'; end if;
 rev:=(r->'post'->>'revision')::bigint;
 -- No password replacement retains the old hash.
 r:=public.blog_post_save(payload,rev,null);
 if not (r->>'ok')::boolean then raise exception 'Keep password failed: %',r; end if;
 rev:=(r->'post'->>'revision')::bigint;
 r:=public.blog_post_save(payload,rev-1,null);
 if (r->>'ok')::boolean then raise exception 'Revision conflict ignored'; end if;
 perform set_config('request.headers','{}',true);
 r:=public.blog_post_read('privacy-transaction-test');
 if (r->>'ok')::boolean or r ? 'post' then raise exception 'Anonymous read leaked'; end if;
 r:=public.blog_post_read('privacy-transaction-test','wrong-password');
 if (r->>'ok')::boolean or r ? 'post' then raise exception 'Wrong password leaked'; end if;
 r:=public.blog_post_read('privacy-transaction-test','test-password-one');
 if not (r->>'ok')::boolean or r->'post'->>'body'<>'<p>PRIVATE BODY</p>' then raise exception 'Password read failed: %',r; end if;
 r:=public.blog_post_save(payload,rev,'test-password-two');
 if (r->>'ok')::boolean then raise exception 'Unauthorized save allowed'; end if;
 begin perform 1 from mydesk_blog_private.post_content; exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Secrets readable'; end if;
 -- Management header is recovered only within this rollback transaction.
end $$;
reset role;
do $$
declare test_header text:='mydesk-blog/'||encode(extensions.gen_random_bytes(32),'hex');r jsonb;p public.blog_posts;payload jsonb;
begin
 insert into mydesk_blog_private.sessions(token_hash,generation,expires_at)
 select encode(extensions.digest(test_header,'sha256'),'hex'),generation,now()+interval '2 minutes' from mydesk_blog_private.credentials where singleton;
 perform set_config('request.headers',jsonb_build_object('x-client-info',test_header)::text,true);
 select * into p from public.blog_posts where id='privacy-transaction-test';
 payload:=to_jsonb(p)||jsonb_build_object('body','<p>UPDATED BODY</p>','summary','UPDATED SUMMARY');
 r:=public.blog_post_save(payload,p.revision,'test-password-two');
 if not (r->>'ok')::boolean then raise exception 'Password rotation failed: %',r; end if;
 perform set_config('request.headers','{}',true);
 r:=public.blog_post_read(p.id,'test-password-one');
 if (r->>'ok')::boolean then raise exception 'Old password still accepted'; end if;
 r:=public.blog_post_read(p.id,'test-password-two');
 if r->'post'->>'body'<>'<p>UPDATED BODY</p>' then raise exception 'New password failed'; end if;
 perform set_config('request.headers',jsonb_build_object('x-client-info',test_header)::text,true);
 r:=public.blog_post_save(payload||jsonb_build_object('is_private',false),(r->'post'->>'revision')::bigint,null);
 if not (r->>'ok')::boolean then raise exception 'Unlock failed: %',r; end if;
 if exists(select 1 from mydesk_blog_private.post_content where post_id=p.id) then raise exception 'Password remains after publishing'; end if;
 perform set_config('request.headers','{}',true);
 r:=public.blog_post_read(p.id);
 if r->'post'->>'body'<>'<p>UPDATED BODY</p>' then raise exception 'Public restore failed'; end if;
end $$;
rollback;
select count(*) as posts,md5(string_agg(id||body||summary||revision::text||created_at::text,'|' order by id)) as fingerprint from public.blog_posts;
