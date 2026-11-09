-- Run against the configured test database with an administrative SQL connection.
-- All changes, including the temporary management session, are rolled back.
begin;
select set_config('request.headers',jsonb_build_object('x-client-info','mydesk-blog/'||encode(extensions.gen_random_bytes(32),'hex'))::text,true);
insert into mydesk_blog_private.sessions(token_hash,generation,expires_at)
select encode(extensions.digest(current_setting('request.headers')::jsonb->>'x-client-info','sha256'),'hex'),generation,now()+interval '1 hour' from mydesk_blog_private.credentials;
set local role anon;
do $test$
declare current_row public.site_navigation; result jsonb; after_row public.blog_posts; before_row public.blog_posts; blocked boolean; changed jsonb;
begin
 select * into current_row from public.site_navigation where id='main';
 changed:=current_row.menus||'[ {"id":"test-nav","parent_id":"learning","label":"임시 메뉴","kind":"folder","href":null} ]'::jsonb;
 result:=public.blog_navigation_save(current_row.revision,changed);
 if (result->>'revision')::bigint<>current_row.revision+1 then raise exception 'Revision failed'; end if;
 select * into before_row from public.blog_posts where id='glossary';
 update public.blog_posts set menu_id='test-nav' where id='glossary';
 select * into after_row from public.blog_posts where id='glossary';
 if after_row.body<>before_row.body or after_row.created_at<>before_row.created_at or after_row.updated_at<>before_row.updated_at then raise exception 'Move changed content or dates'; end if;
 result:=public.blog_navigation_save((result->>'revision')::bigint,current_row.menus,'[{"from_id":"test-nav","to_id":"reinforcement-learning"}]');
 if (select menu_id from public.blog_posts where id='glossary')<>'reinforcement-learning' then raise exception 'Atomic transfer failed'; end if;
 blocked:=false;
 begin perform public.blog_navigation_save(current_row.revision,current_row.menus); exception when serialization_failure then blocked:=true; end;
 if not blocked then raise exception 'Stale menu edit allowed'; end if;
 blocked:=false;begin perform public.blog_navigation_save(null,current_row.menus);exception when serialization_failure then blocked:=true;end;
 if not blocked then raise exception 'Missing revision allowed';end if;
 blocked:=false;
 begin update public.blog_posts set menu_id='home' where id='glossary'; exception when raise_exception then blocked:=true; end;
 if not blocked then raise exception 'Post assigned to link menu'; end if;
 blocked:=false;
 begin
  perform public.blog_navigation_save((result->>'revision')::bigint,(select jsonb_agg(m) from jsonb_array_elements(current_row.menus) m where m->>'id'<>'physicsnemo'));
 exception when raise_exception then blocked:=true; end;
 if not blocked then raise exception 'Orphaning delete allowed'; end if;
 blocked:=false;
 begin
  perform public.blog_navigation_save((result->>'revision')::bigint,(select jsonb_agg(case when m->>'id'='learning' then jsonb_set(m,'{parent_id}','"physicsnemo"') else m end) from jsonb_array_elements(current_row.menus) m));
 exception when raise_exception then blocked:=true; end;
 if not blocked then raise exception 'Cycle allowed'; end if;
 perform set_config('request.headers','{}',true);blocked:=false;
 begin perform public.blog_navigation_save((result->>'revision')::bigint,current_row.menus); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'Anonymous save allowed'; end if;
end $test$;
rollback;
select jsonb_build_object('revision',(select revision from public.site_navigation where id='main'),'posts',(select jsonb_agg(jsonb_build_object('id',id,'menu',menu_id,'checksum',md5(body),'created_at',created_at,'updated_at',updated_at) order by id) from public.blog_posts)) as unchanged_after_rollback;
