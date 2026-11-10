-- User-requested clean start. Deletes the previous public robot model.
-- Only v8 target-angle models may be saved after this reset.
-- Permissions, RLS and other application data remain unchanged.
begin;
alter table public.robot_shared_model drop constraint robot_shared_model_model_check;
delete from public.robot_shared_model where id='main';
alter table public.robot_shared_model add constraint robot_shared_model_model_check check (coalesce(jsonb_typeof(model)='object' and model->>'version'='8' and model->>'physicsVersion'='6' and model->>'policyKind'='joint-target-pd-12joint-mlp-v8' and not (model ? 'controllerArchive') and jsonb_typeof(model->'weights')='array' and jsonb_array_length(model->'weights')=1020 and octet_length(model::text)<=8388608,false));
commit;
