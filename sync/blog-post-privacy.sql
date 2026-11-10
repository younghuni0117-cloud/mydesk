-- Per-post password protection. Existing posts and credentials are unchanged.
-- Public rows retain titles/dates/placement; private bodies and summaries live only
-- in a non-exposed schema. Privileged entry points explicitly verify management
-- authorization or the individual post password. No password plaintext is stored.
alter table public.blog_posts add column is_private boolean not null default false;
create table mydesk_blog_private.post_content (
 post_id text primary key references public.blog_posts(id) on delete cascade,
 body text not null check(octet_length(body)<=1000000),
 summary text not null check(char_length(summary)<=500),
 password_hash text not null,
 failures integer not null default 0,
 locked_until timestamptz
);
alter table mydesk_blog_private.post_content enable row level security;
revoke all on mydesk_blog_private.post_content from public,anon,authenticated;
create policy post_content_no_direct_access on mydesk_blog_private.post_content
 for all to anon,authenticated using(false) with check(false);
alter table public.blog_posts add constraint private_post_no_public_content
 check(not is_private or (body='' and summary=''));

create function mydesk_blog_private.read_post(post_id text, post_password text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.blog_posts; secret mydesk_blog_private.post_content;
begin
 select * into p from public.blog_posts where id=post_id;
 if not found then return jsonb_build_object('ok',false,'message','삭제되었거나 존재하지 않는 글입니다.'); end if;
 if not p.is_private then return jsonb_build_object('ok',true,'post',to_jsonb(p)); end if;
 select * into secret from mydesk_blog_private.post_content where post_content.post_id=read_post.post_id for update;
 if not found then return jsonb_build_object('ok',false,'message','비공개 글을 불러올 수 없습니다.'); end if;
 if not mydesk_blog_private.authorized() then
  if secret.locked_until>now() then return jsonb_build_object('ok',false,'message','시도가 많습니다. 30초 후 다시 시도해 주세요.'); end if;
  if post_password is null or octet_length(post_password)<8 or octet_length(post_password)>72 then
   return jsonb_build_object('ok',false,'message','비밀번호를 입력해 주세요.');
  end if;
  if extensions.crypt(post_password,secret.password_hash)<>secret.password_hash then
   update mydesk_blog_private.post_content set failures=case when failures>=4 then 0 else failures+1 end,
    locked_until=case when failures>=4 then now()+interval '30 seconds' else null end where post_content.post_id=read_post.post_id;
   return jsonb_build_object('ok',false,'message','비밀번호가 맞지 않습니다.');
  end if;
  update mydesk_blog_private.post_content set failures=0,locked_until=null where post_content.post_id=read_post.post_id;
 end if;
 return jsonb_build_object('ok',true,'post',to_jsonb(p)||jsonb_build_object('body',secret.body,'summary',secret.summary));
end $$;

create function mydesk_blog_private.save_post(payload jsonb, expected_revision bigint, post_password text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare previous public.blog_posts; saved public.blog_posts; secret mydesk_blog_private.post_content;
 v_post_id text:=payload->>'id'; locked boolean:=coalesce((payload->>'is_private')::boolean,false); hashed text;
begin
 if not mydesk_blog_private.authorized() then return jsonb_build_object('ok',false,'message','관리 연결이 만료되었습니다. 글 관리에서 다시 연결해 주세요.'); end if;
 select * into previous from public.blog_posts where id=v_post_id for update;
 if (found and (expected_revision is null or previous.revision<>expected_revision)) or (not found and expected_revision is not null) then
  return jsonb_build_object('ok',false,'message','다른 기기에서 글이 변경되었거나 삭제되었습니다. 작성 내용을 복사한 후 다시 확인해 주세요.');
 end if;
 if octet_length(payload->>'body')>1000000 or char_length(payload->>'summary')>500 then
  return jsonb_build_object('ok',false,'message','소개는 500자, 본문은 1MB 이하로 입력해 주세요.');
 end if;
 if locked then
  select * into secret from mydesk_blog_private.post_content where post_content.post_id=v_post_id;
  hashed:=secret.password_hash;
  if coalesce(post_password,'')<>'' then
   if char_length(post_password)<8 or octet_length(post_password)>72 then
    return jsonb_build_object('ok',false,'message','글 비밀번호는 8자 이상, UTF-8 기준 72바이트 이하로 입력해 주세요.');
   end if;
   hashed:=extensions.crypt(post_password,extensions.gen_salt('bf',12));
  end if;
  if hashed is null then return jsonb_build_object('ok',false,'message','비공개 글의 비밀번호를 설정해 주세요.'); end if;
 end if;
 if previous.id is null then
  insert into public.blog_posts(id,category,topic,menu_id,title,summary,body,is_private)
   values(v_post_id,payload->>'category',payload->>'topic',payload->>'menu_id',payload->>'title',
    case when locked then '' else payload->>'summary' end,case when locked then '' else payload->>'body' end,locked) returning * into saved;
 else
  update public.blog_posts set category=payload->>'category',topic=payload->>'topic',menu_id=payload->>'menu_id',title=payload->>'title',
   summary=case when locked then '' else payload->>'summary' end,body=case when locked then '' else payload->>'body' end,is_private=locked
   where id=v_post_id returning * into saved;
 end if;
 if locked then
  insert into mydesk_blog_private.post_content(post_id,body,summary,password_hash) values(v_post_id,payload->>'body',payload->>'summary',hashed)
   on conflict on constraint post_content_pkey do update set body=excluded.body,summary=excluded.summary,password_hash=excluded.password_hash,failures=0,locked_until=null;
 else
  delete from mydesk_blog_private.post_content where post_content.post_id=v_post_id;
 end if;
 return jsonb_build_object('ok',true,'post',to_jsonb(saved));
end $$;
create function public.blog_post_read(post_id text, post_password text default null) returns jsonb
 language sql security invoker set search_path='' as $$ select mydesk_blog_private.read_post(post_id,post_password); $$;
create function public.blog_post_save(payload jsonb, expected_revision bigint default null, post_password text default null) returns jsonb
 language sql security invoker set search_path='' as $$ select mydesk_blog_private.save_post(payload,expected_revision,post_password); $$;
revoke all on function mydesk_blog_private.read_post(text,text),mydesk_blog_private.save_post(jsonb,bigint,text),public.blog_post_read(text,text),public.blog_post_save(jsonb,bigint,text) from public,anon,authenticated;
grant execute on function mydesk_blog_private.read_post(text,text),mydesk_blog_private.save_post(jsonb,bigint,text),public.blog_post_read(text,text),public.blog_post_save(jsonb,bigint,text) to anon,authenticated;
notify pgrst,'reload schema';
