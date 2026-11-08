create table public.family_calendar_events (
 id uuid primary key,
 calendar_id uuid not null,
 title text not null check (char_length(btrim(title)) between 1 and 120),
 person text not null default '' check (char_length(person)<=40),
 category text not null default 'family' check (category in ('family','personal','school','medical','other')),
 starts_on date not null check (starts_on between date '1900-01-01' and date '2199-12-31'),
 ends_on date not null check (ends_on between starts_on and date '2199-12-31'),
 all_day boolean not null default true,
 start_time time, end_time time,
 location text not null default '' check (char_length(location)<=200),
 notes text not null default '' check (char_length(notes)<=2000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check ((all_day and start_time is null and end_time is null) or (not all_day and start_time is not null and end_time is not null and ends_on+end_time>starts_on+start_time))
);
create index family_calendar_dates on public.family_calendar_events(calendar_id,ends_on,starts_on);
alter table public.family_calendar_events enable row level security;
revoke all on public.family_calendar_events from public,anon,authenticated;
grant select,insert,update,delete on public.family_calendar_events to anon,authenticated;
create policy "shared calendar read" on public.family_calendar_events for select to anon,authenticated using ((current_setting('request.headers',true)::jsonb->>'x-client-info')='mydesk-calendar/'||calendar_id::text);
create policy "shared calendar create" on public.family_calendar_events for insert to anon,authenticated with check ((current_setting('request.headers',true)::jsonb->>'x-client-info')='mydesk-calendar/'||calendar_id::text);
create policy "shared calendar edit" on public.family_calendar_events for update to anon,authenticated using ((current_setting('request.headers',true)::jsonb->>'x-client-info')='mydesk-calendar/'||calendar_id::text) with check ((current_setting('request.headers',true)::jsonb->>'x-client-info')='mydesk-calendar/'||calendar_id::text);
create policy "shared calendar remove" on public.family_calendar_events for delete to anon,authenticated using ((current_setting('request.headers',true)::jsonb->>'x-client-info')='mydesk-calendar/'||calendar_id::text);
notify pgrst,'reload schema';
create function public.stamp_family_calendar_event() returns trigger language plpgsql security invoker set search_path='' as $$ begin NEW.updated_at:=clock_timestamp(); return NEW; end; $$;
revoke all on function public.stamp_family_calendar_event() from public,anon,authenticated;
create trigger family_calendar_event_stamp before update on public.family_calendar_events for each row execute function public.stamp_family_calendar_event();
