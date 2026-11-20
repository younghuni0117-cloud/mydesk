-- Additive migration only; all existing records, photos, revisions and policies stay intact.
alter table public.restaurant_records add column blog_url text not null default ''
 constraint restaurant_blog_url_check check (char_length(blog_url)<=2048 and (blog_url='' or blog_url ~ '^https://[^[:space:]]+$'));
grant update(blog_url) on public.restaurant_records to anon,authenticated;
notify pgrst, 'reload schema';
