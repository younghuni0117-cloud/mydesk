-- Bootstrap only. Applied once through the connected Supabase tool.
-- Seed the mobile library and a random capability hash separately; never commit personal data or the capability.
create table public.mindmap_shared_library (
 id text primary key check(id='main'),
 library jsonb not null check(coalesce(library->>'version'='2' and jsonb_typeof(library->'maps')='array',false)) check(octet_length(library::text)<=2097152),
 key_hash text not null check(length(key_hash)=64),
 revision bigint not null default 1,
 updated_at timestamptz not null default now()
);
alter table public.mindmap_shared_library enable row level security;
revoke all on public.mindmap_shared_library from anon,authenticated;
grant select(id,library,revision,updated_at),update(library) on public.mindmap_shared_library to anon,authenticated;
create policy mindmap_link_read on public.mindmap_shared_library for select to anon,authenticated using (
 id='main' and key_hash=encode(extensions.digest(coalesce(coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-mindmap-key',''),'sha256'),'hex')
);
create policy mindmap_link_update on public.mindmap_shared_library for update to anon,authenticated using (
 id='main' and key_hash=encode(extensions.digest(coalesce(coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-mindmap-key',''),'sha256'),'hex')
) with check (
 id='main' and key_hash=encode(extensions.digest(coalesce(coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-mindmap-key',''),'sha256'),'hex')
);
create function public.mindmap_revision() returns trigger language plpgsql set search_path=public as $$
begin new.revision=old.revision+1; new.updated_at=now(); return new; end$$;
create trigger mindmap_revision before update on public.mindmap_shared_library for each row execute function public.mindmap_revision();
