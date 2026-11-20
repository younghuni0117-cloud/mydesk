-- Independent public robotdog checkpoint; intentionally shared without sign-in.
create table public.robotdog_shared_model (
 id text primary key check (id='main'),
 model jsonb not null check (jsonb_typeof(model)='object' and model->>'algorithm'='PPO' and model->>'version'='2' and jsonb_typeof(model->'weights')='array' and jsonb_array_length(model->'weights')=1956 and octet_length(model::text)<=2097152),
 revision bigint not null default 1,
 updated_at timestamptz not null default now()
);
alter table public.robotdog_shared_model enable row level security;
revoke all on public.robotdog_shared_model from anon,authenticated;
grant select,insert,update on public.robotdog_shared_model to anon,authenticated;
create policy robotdog_public_read on public.robotdog_shared_model for select to anon,authenticated using (id='main');
create policy robotdog_public_insert on public.robotdog_shared_model for insert to anon,authenticated with check (id='main');
create policy robotdog_public_update on public.robotdog_shared_model for update to anon,authenticated using (id='main') with check (id='main');
create function public.stamp_robotdog_shared_model() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 new.revision:=case when TG_OP='INSERT' then 1 else old.revision+1 end;
 new.updated_at:=clock_timestamp();
 return new;
end $$;
revoke execute on function public.stamp_robotdog_shared_model() from public;
create trigger stamp_robotdog_checkpoint before insert or update on public.robotdog_shared_model for each row execute function public.stamp_robotdog_shared_model();
