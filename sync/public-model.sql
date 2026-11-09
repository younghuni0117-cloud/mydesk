create table public.robot_shared_model (
 id text primary key default 'main' check (id = 'main'),
 model jsonb not null check (coalesce(jsonb_typeof(model)='object' and model->>'version'='6' and model->>'physicsVersion'='5' and model->>'policyKind'='direct-torque-12joint-mlp-v6' and jsonb_typeof(model->'weights')='array' and jsonb_array_length(model->'weights')=1020 and octet_length(model::text)<=8388608,false)),
 revision bigint not null default 1 check (revision>0),
 updated_at timestamptz not null default clock_timestamp()
);
alter table public.robot_shared_model enable row level security;
revoke all on public.robot_shared_model from public,anon,authenticated;
grant select,insert,update on public.robot_shared_model to anon,authenticated;
create policy "public robot read" on public.robot_shared_model for select to anon,authenticated using (id='main');
create policy "public robot insert" on public.robot_shared_model for insert to anon,authenticated with check (id='main');
create policy "public robot replace" on public.robot_shared_model for update to anon,authenticated using (id='main') with check (id='main');
create function public.stamp_robot_shared_model() returns trigger language plpgsql security invoker set search_path='' as $$ begin NEW.revision := case when TG_OP='INSERT' then 1 else OLD.revision+1 end; NEW.updated_at := clock_timestamp(); return NEW; end; $$;
revoke all on function public.stamp_robot_shared_model() from public,anon,authenticated;
create trigger robot_shared_model_stamp before insert or update on public.robot_shared_model for each row execute function public.stamp_robot_shared_model();
notify pgrst,'reload schema';
