-- Run in the new Supabase project. No service-role key is used in the browser.
create table if not exists public.robot_models (
 user_id uuid primary key references auth.users(id) on delete cascade,
 revision bigint not null default 1 check (revision > 0),
 model jsonb not null check (jsonb_typeof(model) = 'object' and model->>'version' = '2' and jsonb_array_length(model->'weights') = 32),
 updated_at timestamptz not null default now()
);
alter table public.robot_models enable row level security;
create policy "read own robot" on public.robot_models for select to authenticated using ((select auth.uid()) = user_id);
create policy "create own robot" on public.robot_models for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "update own robot" on public.robot_models for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update on public.robot_models to authenticated;
revoke all on public.robot_models from anon;
