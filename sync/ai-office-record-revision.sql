alter table public.ai_office_records add column revision bigint not null default 1;
create function public.ai_office_record_revision() returns trigger
 language plpgsql security invoker set search_path='' as $$
begin
 new.revision := old.revision + 1;
 return new;
end $$;
revoke execute on function public.ai_office_record_revision() from public,anon,authenticated;
create trigger ai_office_record_revision before update on public.ai_office_records
 for each row execute function public.ai_office_record_revision();
