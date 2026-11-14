-- A separate collection; existing blogs, calendar events and robot models are untouched.
create table public.restaurant_records (
 id uuid primary key,
 name text not null check(char_length(btrim(name)) between 1 and 100),
 address text not null check(char_length(btrim(address)) between 1 and 250),
 lat double precision not null check(lat between 33 and 39),
 lon double precision not null check(lon between 124 and 132),
 dish text not null default '' check(char_length(dish)<=160),
 price text not null default '' check(char_length(price)<=80),
 menu_text text not null default '' check(char_length(menu_text)<=3000),
 notes text not null default '' check(char_length(notes)<=4000),
 visited_on date,
 visit_state text not null default 'saved' check(visit_state in ('saved','visited')),
 photos text[] not null default '{}' check(cardinality(photos)<=6),
 source_url text not null default '' check(source_url='' or source_url ~ '^https://'),
 revision bigint not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index restaurant_records_created_idx on public.restaurant_records(created_at desc,id);
alter table public.restaurant_records enable row level security;
revoke all on public.restaurant_records from public,anon,authenticated;
grant select,insert on public.restaurant_records to anon,authenticated;
grant update(name,address,lat,lon,dish,price,menu_text,notes,visited_on,visit_state,photos),delete on public.restaurant_records to anon,authenticated;
create policy restaurant_public_read on public.restaurant_records for select to anon,authenticated using(true);
create policy restaurant_public_create on public.restaurant_records for insert to anon,authenticated with check(revision=0);
create policy restaurant_manager_update on public.restaurant_records for update to anon,authenticated using((select mydesk_blog_private.authorized())) with check((select mydesk_blog_private.authorized()));
create policy restaurant_manager_delete on public.restaurant_records for delete to anon,authenticated using((select mydesk_blog_private.authorized()));
create function public.restaurant_record_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare path text;
begin
 foreach path in array new.photos loop
  if path is null or path !~ ('^'||new.id::text||'/[0-9a-f-]{36}\.(jpeg|png|webp)$') then raise exception '메뉴판 사진 경로가 올바르지 않습니다.'; end if;
 end loop;
 if tg_op='UPDATE' then new.id:=old.id;new.created_at:=old.created_at;new.revision:=old.revision+1;new.updated_at:=now(); end if;
 return new;
end $$;
revoke all on function public.restaurant_record_guard() from public,anon,authenticated;
create trigger restaurant_record_validate before insert or update on public.restaurant_records for each row execute function public.restaurant_record_guard();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('restaurant-menus','restaurant-menus',true,8388608,array['image/jpeg','image/png','image/webp']);
-- New files only; public upload cannot replace or delete existing menu images.
create policy restaurant_menu_upload on storage.objects for insert to anon,authenticated with check(bucket_id='restaurant-menus' and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpeg|png|webp)$');
