-- Address lookup must not block saving a restaurant. No existing rows are updated.
alter table public.restaurant_records alter column lat drop not null;
alter table public.restaurant_records alter column lon drop not null;
alter table public.restaurant_records add constraint restaurant_position_pair_check
 check ((lat is null and lon is null) or (lat is not null and lon is not null));
notify pgrst, 'reload schema';
