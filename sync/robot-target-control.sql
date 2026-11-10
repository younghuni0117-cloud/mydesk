-- Accept old torque and new target-angle models during deployment.
-- No model rows, permissions, triggers or other tables are changed.
begin;
alter table public.robot_shared_model drop constraint robot_shared_model_model_check;
alter table public.robot_shared_model add constraint robot_shared_model_model_check check (coalesce(jsonb_typeof(model)='object' and ((model->>'version'='6' and model->>'physicsVersion'='5' and model->>'policyKind'='direct-torque-12joint-mlp-v6') or (model->>'version'='7' and model->>'physicsVersion'='6' and model->>'policyKind'='joint-target-pd-12joint-mlp-v7')) and jsonb_typeof(model->'weights')='array' and jsonb_array_length(model->'weights')=1020 and octet_length(model::text)<=8388608,false));
commit;
