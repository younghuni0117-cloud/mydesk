create schema if not exists mydesk_sticky_private;
revoke all on schema mydesk_sticky_private from public;
grant usage on schema mydesk_sticky_private to anon,authenticated;
create table if not exists mydesk_sticky_private.notes (
 board_hash text not null,id text not null,data jsonb,revision bigint not null default 1,
 primary key(board_hash,id)
);
alter table mydesk_sticky_private.notes enable row level security;
revoke all on mydesk_sticky_private.notes from public,anon,authenticated;
drop policy if exists sticky_no_direct_access on mydesk_sticky_private.notes;
create policy sticky_no_direct_access on mydesk_sticky_private.notes for all to anon,authenticated using(false) with check(false);
create or replace function mydesk_sticky_private.access_board(board_key text,change jsonb,expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare h text; existing mydesk_sticky_private.notes; note_id text; f text;
begin
 if board_key is null or board_key!~'^[A-Za-z0-9_-]{43}$' then return jsonb_build_object('ok',false,'message','연결 링크를 확인해 주세요.');end if;
 h:=encode(extensions.digest(board_key,'sha256'),'hex');
 if change is null then return jsonb_build_object('ok',true,'notes',coalesce((select jsonb_agg(jsonb_build_object('id',id,'note',data,'revision',revision)) from mydesk_sticky_private.notes where board_hash=h),'[]'::jsonb));end if;
 note_id:=change->>'id';
 if note_id is null or note_id!~'^[a-zA-Z0-9_-]{1,80}$' then return jsonb_build_object('ok',false,'message','메모 ID 오류');end if;
 perform pg_advisory_xact_lock(hashtextextended(h,0));
 select * into existing from mydesk_sticky_private.notes where board_hash=h and id=note_id for update;
 if expected_revision is distinct from coalesce(existing.revision,0) then return jsonb_build_object('ok',false,'conflict',true,'record',jsonb_build_object('id',note_id,'note',existing.data,'revision',coalesce(existing.revision,0)));end if;
 if coalesce((change->>'deleted')::boolean,false) then
  if existing.data is null or existing.data->>'status'<>'trashed' then return jsonb_build_object('ok',false,'message','휴지통 메모만 영구 삭제할 수 있습니다.');end if;
  change:=null;
 else
  if jsonb_typeof(change)<>'object' or octet_length(change::text)>50000 or jsonb_typeof(change->'text') is distinct from 'string' or length(change->>'text')>10000 or (change->>'color') not in ('yellow','pink','blue','green','purple') or (change->>'color') is null or (change->>'status') not in ('active','archived','trashed') or (change->>'status') is null then return jsonb_build_object('ok',false,'message','메모 내용 오류');end if;
  for f in select unnest(array['x','y','width','height','rotation','z']) loop
   if jsonb_typeof(change->f) is distinct from 'number' then return jsonb_build_object('ok',false,'message','메모 좌표 오류');end if;
  end loop;
  if abs((change->>'x')::numeric)>10000 or abs((change->>'y')::numeric)>10000 or (change->>'width')::numeric not between 160 and 600 or (change->>'height')::numeric not between 140 and 700 or abs((change->>'rotation')::numeric)>5 or (change->>'z')::numeric not between 0 and 1000000000 then return jsonb_build_object('ok',false,'message','메모 크기 오류');end if;
  if existing.id is null and (select count(*) from mydesk_sticky_private.notes where board_hash=h)>=2000 then return jsonb_build_object('ok',false,'message','게시판 메모 한도에 도달했습니다.');end if;
  if existing.id is not null and existing.data is null then return jsonb_build_object('ok',false,'message','이미 영구 삭제된 메모입니다.');end if;
  if existing.data is not null then change:=change||jsonb_build_object('createdAt',existing.data->>'createdAt');end if;
  if (change->>'createdAt') is null or (change->>'updatedAt') is null then return jsonb_build_object('ok',false,'message','메모 날짜 오류');end if;
  perform (change->>'createdAt')::timestamptz,(change->>'updatedAt')::timestamptz;
 end if;
 insert into mydesk_sticky_private.notes(board_hash,id,data,revision) values(h,note_id,change,1)
 on conflict(board_hash,id) do update set data=excluded.data,revision=notes.revision+1 returning * into existing;
 return jsonb_build_object('ok',true,'record',jsonb_build_object('id',existing.id,'note',existing.data,'revision',existing.revision));
end $$;
create or replace function public.sticky_board(board_key text,change jsonb default null,expected_revision bigint default null)
returns jsonb language sql security invoker set search_path='' as $$select mydesk_sticky_private.access_board(board_key,change,expected_revision);$$;
revoke all on function mydesk_sticky_private.access_board(text,jsonb,bigint),public.sticky_board(text,jsonb,bigint) from public,anon,authenticated;
grant execute on function mydesk_sticky_private.access_board(text,jsonb,bigint),public.sticky_board(text,jsonb,bigint) to anon,authenticated;
notify pgrst,'reload schema';
