-- Existing rows and timestamps remain untouched. Revision 0 is the pre-update baseline.
alter table public.family_calendar_events
 add column targets text[],
 add column change_revision bigint not null default 0 check(change_revision>=0),
 add column change_kind text check(change_kind in ('new','updated')),
 add column changed_at timestamptz,
 add column previous_values jsonb,
 add constraint family_calendar_targets_valid check(targets is null or (cardinality(targets) between 1 and 4 and targets <@ array['personal','school','medical','other']::text[]));
create index family_calendar_activity_idx on public.family_calendar_events(calendar_id,changed_at desc,id) where change_revision>0;

-- Clients can edit schedule data, but cannot forge revisions, timestamps or before values.
revoke insert,update on public.family_calendar_events from public,anon,authenticated;
grant insert(id,calendar_id,title,person,category,starts_on,ends_on,all_day,start_time,end_time,location,notes,targets),
 update(id,calendar_id,title,person,category,starts_on,ends_on,all_day,start_time,end_time,location,notes,targets)
 on public.family_calendar_events to anon,authenticated;

create or replace function public.stamp_family_calendar_event() returns trigger language plpgsql security invoker set search_path='' as $$
declare people text[]:=array['personal','school','medical','other']; old_targets text[]; requested text[]; different boolean;
begin
 if tg_op='UPDATE' then
  old_targets:=coalesce(old.targets,case when old.category='family' then people else array[old.category] end);
  -- Older browsers still send a single category; keep them compatible without
  -- discarding multi-person targets when they only edit the title or time.
  if new.targets is not distinct from old.targets and new.category is distinct from old.category then
   requested:=case when new.category='family' then people else array[new.category] end;
  else requested:=coalesce(new.targets,old_targets); end if;
 else requested:=coalesce(new.targets,case when new.category='family' then people else array[new.category] end);
 end if;
 if cardinality(requested)<1 or not (requested <@ people) or array_position(requested,null) is not null then raise exception '일정 대상을 한 명 이상 선택해 주세요.'; end if;
 new.targets:=array(select p from unnest(people) p where p=any(requested));
 new.category:=case when cardinality(new.targets)=1 then new.targets[1] else 'family' end;
 if tg_op='INSERT' then
  new.change_revision:=1;new.change_kind:='new';new.changed_at:=clock_timestamp();new.previous_values:=null;new.updated_at:=new.created_at;
 else
  new.id:=old.id;new.calendar_id:=old.calendar_id;new.created_at:=old.created_at;
  different:=row(new.title,new.person,new.starts_on,new.ends_on,new.all_day,new.start_time,new.end_time,new.location,new.notes,new.targets)
   is distinct from row(old.title,old.person,old.starts_on,old.ends_on,old.all_day,old.start_time,old.end_time,old.location,old.notes,old_targets);
  if different then
   new.change_revision:=old.change_revision+1;new.change_kind:='updated';new.changed_at:=clock_timestamp();new.updated_at:=new.changed_at;
   new.previous_values:=(to_jsonb(old)-array['previous_values','change_revision','change_kind','changed_at','created_at','updated_at','calendar_id'])||jsonb_build_object('targets',old_targets);
  else
   new.change_revision:=old.change_revision;new.change_kind:=old.change_kind;new.changed_at:=old.changed_at;new.previous_values:=old.previous_values;new.updated_at:=old.updated_at;
  end if;
 end if;
 return new;
end $$;
revoke all on function public.stamp_family_calendar_event() from public,anon,authenticated;
drop trigger family_calendar_event_stamp on public.family_calendar_events;
create trigger family_calendar_event_stamp before insert or update on public.family_calendar_events for each row execute function public.stamp_family_calendar_event();
notify pgrst,'reload schema';
