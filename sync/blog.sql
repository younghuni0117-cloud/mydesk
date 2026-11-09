create table public.blog_posts (
 id text primary key check (id ~ '^[a-zA-Z0-9-]{1,80}$'),
 category text not null check (category in ('ai','structural')),
 topic text not null check (char_length(topic) between 1 and 80),
 title text not null check (char_length(title) between 1 and 160),
 summary text not null default '' check (char_length(summary) <= 500),
 body text not null check (octet_length(body) <= 1000000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 revision bigint not null default 0
);
alter table public.blog_posts enable row level security;
revoke all on public.blog_posts from anon, authenticated;
grant select, delete on public.blog_posts to anon, authenticated;
grant insert (id,category,topic,title,summary,body) on public.blog_posts to anon, authenticated;
grant update (category,topic,title,summary,body) on public.blog_posts to anon, authenticated;
create policy blog_public_read on public.blog_posts for select to anon, authenticated using (true);
create policy blog_owner_insert on public.blog_posts for insert to anon, authenticated with check (encode(extensions.digest(coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-client-info', ''), 'sha256'), 'hex') = 'REPLACE_WITH_SHA256_OF_MANAGEMENT_HEADER');
create policy blog_owner_update on public.blog_posts for update to anon, authenticated using (encode(extensions.digest(coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-client-info', ''), 'sha256'), 'hex') = 'REPLACE_WITH_SHA256_OF_MANAGEMENT_HEADER') with check (encode(extensions.digest(coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-client-info', ''), 'sha256'), 'hex') = 'REPLACE_WITH_SHA256_OF_MANAGEMENT_HEADER');
create policy blog_owner_delete on public.blog_posts for delete to anon, authenticated using (encode(extensions.digest(coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-client-info', ''), 'sha256'), 'hex') = 'REPLACE_WITH_SHA256_OF_MANAGEMENT_HEADER');
create function public.blog_post_stamp() returns trigger language plpgsql security invoker set search_path = '' as $$
begin new.updated_at := now(); new.revision := old.revision + 1; return new; end; $$;
revoke all on function public.blog_post_stamp() from public, anon, authenticated;
create trigger blog_stamp before update on public.blog_posts for each row execute function public.blog_post_stamp();
create index blog_posts_category_created_idx on public.blog_posts (category, created_at desc);
