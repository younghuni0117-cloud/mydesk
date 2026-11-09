-- One versioned navigation document makes reparenting and reordering atomic.
create table public.site_navigation (
 id text primary key check(id='main'),
 menus jsonb not null check(jsonb_typeof(menus)='array' and jsonb_array_length(menus)<=100),
 revision bigint not null default 0,
 updated_at timestamptz not null default now()
);
alter table public.site_navigation enable row level security;
revoke all on public.site_navigation from public,anon,authenticated;
grant select on public.site_navigation to anon,authenticated;
grant update(menus) on public.site_navigation to anon,authenticated;
create policy navigation_public_read on public.site_navigation for select to anon,authenticated using(true);
create policy navigation_owner_update on public.site_navigation for update to anon,authenticated using((select mydesk_blog_private.authorized())) with check((select mydesk_blog_private.authorized()));
insert into public.site_navigation(id,menus) values('main','[{"id":"home","parent_id":null,"label":"홈","kind":"link","href":"index.html"},{"id":"calendar","parent_id":null,"label":"가족 달력","kind":"link","href":"calendar.html"},{"id":"learning","parent_id":null,"label":"학습정보","kind":"folder","href":null},{"id":"ai","parent_id":"learning","label":"AI","kind":"folder","href":null},{"id":"reinforcement-learning","parent_id":"ai","label":"강화학습","kind":"folder","href":null},{"id":"simulation","parent_id":"learning","label":"Simulation","kind":"folder","href":null},{"id":"physicsnemo","parent_id":"simulation","label":"PhysicsNeMo","kind":"folder","href":null},{"id":"experiments","parent_id":null,"label":"강화학습 체험","kind":"folder","href":null},{"id":"maze","parent_id":"experiments","label":"미로 탐험","kind":"link","href":"maze.html"},{"id":"cartpole","parent_id":"experiments","label":"카트폴","kind":"link","href":"cartpole.html"},{"id":"robot","parent_id":"experiments","label":"로봇 강화학습","kind":"link","href":"robot.html"}]'::jsonb);
alter table public.blog_posts add column menu_id text;
grant insert(menu_id),update(menu_id) on public.blog_posts to anon,authenticated;
create index blog_posts_menu_created_idx on public.blog_posts(menu_id,created_at desc);
-- Moving a post does not change its registration date or content modification date.
create or replace function public.blog_post_stamp() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 new.revision:=old.revision+1;
 if (new.title,new.summary,new.body) is distinct from (old.title,old.summary,old.body) then new.updated_at:=now(); else new.updated_at:=old.updated_at; end if;
 return new;
end $$;
update public.blog_posts set menu_id=case when category='ai' then 'reinforcement-learning' else 'physicsnemo' end where menu_id is null;

create function public.navigation_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare m jsonb; p jsonb; ids text[]:=array[]::text[]; chain text[]; depth integer;
begin
 if jsonb_typeof(new.menus)<>'array' or jsonb_array_length(new.menus)>100 then raise exception '메뉴는 최대 100개까지 만들 수 있습니다.'; end if;
 for m in select value from jsonb_array_elements(new.menus) loop
  if jsonb_typeof(m)<>'object' or jsonb_typeof(m->'id') is distinct from 'string' or (m->>'id')!~'^[-a-zA-Z0-9]{1,80}$' or (m->>'id')=any(ids) then raise exception '메뉴 ID가 올바르지 않거나 중복되었습니다.'; end if;
  ids:=array_append(ids,m->>'id');
  if jsonb_typeof(m->'label') is distinct from 'string' or char_length(btrim(m->>'label')) not between 1 and 80 then raise exception '메뉴 이름을 확인해 주세요.'; end if;
  if coalesce(m->>'kind','') not in ('folder','link') then raise exception '메뉴 종류를 확인해 주세요.'; end if;
  if not (m ? 'parent_id') or jsonb_typeof(m->'parent_id') not in ('string','null') then raise exception '상위 메뉴를 확인해 주세요.'; end if;
  if m->>'kind'='link' and (jsonb_typeof(m->'href') is distinct from 'string' or not ((m->>'href')~'^[a-zA-Z0-9_-]+\.html([?#][^[:space:]]*)?$' or (m->>'href')~'^https://[^[:space:]@]+$')) then raise exception '페이지 주소는 .html 경로나 https 주소여야 합니다.'; end if;
 end loop;
 for m in select value from jsonb_array_elements(new.menus) loop
  p:=m;chain:=array[]::text[];depth:=0;
  loop
   if (p->>'id')=any(chain) then raise exception '자기 자신이나 하위 메뉴 안으로 이동할 수 없습니다.'; end if;
   chain:=array_append(chain,p->>'id');depth:=depth+1;
   if depth>8 then raise exception '메뉴는 8단계까지 만들 수 있습니다.'; end if;
   exit when p->>'parent_id' is null;
   select value into p from jsonb_array_elements(new.menus) where value->>'id'=p->>'parent_id';
   if p is null or p->>'kind'<>'folder' then raise exception '상위 메뉴가 없거나 글 메뉴가 아닙니다.'; end if;
  end loop;
 end loop;
 if exists(select 1 from public.blog_posts b where not exists(select 1 from jsonb_array_elements(new.menus) entry where entry->>'id'=b.menu_id and entry->>'kind'='folder')) then raise exception '남아 있는 글을 다른 메뉴로 이동한 뒤 삭제해 주세요.'; end if;
 new.revision:=old.revision+1;new.updated_at:=now();return new;
end $$;
revoke all on function public.navigation_guard() from public,anon,authenticated;
create trigger navigation_validate before update on public.site_navigation for each row execute function public.navigation_guard();
create function public.blog_menu_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare items jsonb;
begin
 -- Serialize menu assignment against menu edits so a concurrent move cannot orphan a post.
 select menus into items from public.site_navigation where id='main' for share;
 if new.menu_id is null then
  new.menu_id:=case when new.category='ai' then 'reinforcement-learning' else 'physicsnemo' end;
 end if;
 if not exists(select 1 from jsonb_array_elements(items) m where m->>'id'=new.menu_id and m->>'kind'='folder') then raise exception '글을 저장할 메뉴가 없습니다. 메뉴를 다시 선택해 주세요.'; end if;
 return new;
end $$;
revoke all on function public.blog_menu_guard() from public,anon,authenticated;
create trigger blog_menu_validate before insert or update on public.blog_posts for each row execute function public.blog_menu_guard();

create function public.blog_navigation_save(expected_revision bigint,new_menus jsonb,post_moves jsonb default '[]'::jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare current_row public.site_navigation; movement jsonb;
begin
 if not mydesk_blog_private.authorized() then raise exception '관리 비밀번호로 먼저 연결해 주세요.' using errcode='42501'; end if;
 select * into current_row from public.site_navigation where id='main' for update;
 if current_row.revision is distinct from expected_revision then raise exception '다른 기기에서 메뉴가 변경되었습니다. 새로고침 후 다시 시도해 주세요.' using errcode='40001'; end if;
 if jsonb_typeof(post_moves)<>'array' or jsonb_array_length(post_moves)>100 then raise exception '글 이동 정보가 올바르지 않습니다.'; end if;
 for movement in select value from jsonb_array_elements(post_moves) loop
  if not exists(select 1 from jsonb_array_elements(new_menus) m where m->>'id'=movement->>'to_id' and m->>'kind'='folder') then raise exception '글을 옮길 대상 메뉴를 선택해 주세요.'; end if;
  update public.blog_posts set menu_id=movement->>'to_id' where menu_id=movement->>'from_id';
 end loop;
 update public.site_navigation set menus=new_menus where id='main' returning * into current_row;
 return to_jsonb(current_row);
end $$;
revoke all on function public.blog_navigation_save(bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.blog_navigation_save(bigint,jsonb,jsonb) to anon,authenticated;
