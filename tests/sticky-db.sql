begin;
set local role anon;
do $$
declare k text:=repeat('s',43); other text:=repeat('t',43); n jsonb; r jsonb;
begin
 r:=public.sticky_board(null);if (r->>'ok')::boolean then raise exception 'Missing key allowed';end if;
 n:=jsonb_build_object('id','synthetic-note','text','Synthetic memo','color','yellow','createdAt','2026-11-28T00:00:00Z','updatedAt','2026-11-28T00:00:00Z','x',10,'y',20,'width',230,'height',220,'rotation',0,'z',1,'status','active');
 r:=public.sticky_board(k,n,0);if not (r->>'ok')::boolean then raise exception 'Create failed: %',r;end if;
 r:=public.sticky_board(other);if jsonb_array_length(r->'notes')<>0 then raise exception 'Cross-board leak';end if;
 r:=public.sticky_board(k,n,0);if not (r->>'conflict')::boolean then raise exception 'Stale save accepted';end if;
 n:=n||'{"status":"archived","createdAt":"2020-01-01T00:00:00Z"}'::jsonb;r:=public.sticky_board(k,n,1);if r->'record'->'note'->>'createdAt'<>'2026-11-28T00:00:00Z' then raise exception 'Creation date changed';end if;
 r:=public.sticky_board(k,'{"id":"synthetic-note","deleted":true}',2);if (r->>'ok')::boolean then raise exception 'Purge outside trash allowed';end if;
 n:=n||'{"status":"trashed"}'::jsonb;r:=public.sticky_board(k,n,2);if not (r->>'ok')::boolean then raise exception 'Trash failed';end if;
 r:=public.sticky_board(k,'{"id":"synthetic-note","deleted":true}',3);if not (r->>'ok')::boolean or r->'record'->'note'<>'null'::jsonb then raise exception 'Purge failed';end if;
 r:=public.sticky_board(k,n,4);if (r->>'ok')::boolean then raise exception 'Tombstone revived';end if;
 begin perform data from mydesk_sticky_private.notes;raise exception 'Direct access allowed';exception when insufficient_privilege then null;end;
end $$;
rollback;
