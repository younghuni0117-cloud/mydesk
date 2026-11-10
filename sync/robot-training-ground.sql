-- Explicitly authorized clean start for the 36-action PPO training-ground model.
-- Old clients cannot write their retired angle-only policies back into this row.
-- No blog, calendar, navigation, credentials or permission changes.
begin;
alter table public.robot_shared_model drop constraint robot_shared_model_model_check;
delete from public.robot_shared_model where id='main';
alter table public.robot_shared_model add constraint robot_shared_model_model_check check (coalesce(jsonb_typeof(model)='object' and model->>'version'='9' and model->>'physicsVersion'='6' and model->>'policyKind'='joint-target-velocity-residual-pd-12joint-v9' and not (model ? 'controllerArchive') and jsonb_typeof(model->'weights')='array' and jsonb_array_length(model->'weights')=1968 and octet_length(model::text)<=8388608,false));
commit;
notify pgrst,'reload schema';
