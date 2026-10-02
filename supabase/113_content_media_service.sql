-- Private operational lifecycle only. No content history or normal-user Storage grants.
begin;
do $$ begin
 if current_user <> 'postgres' or to_regclass('public.media_assets') is null then raise exception '113 requires postgres and 112'; end if;
end $$;
create table public.media_service_operations (
 id uuid primary key default gen_random_uuid(),
 parent_id uuid references public.media_service_operations(id),
 asset_id uuid references public.media_assets(id),
 actor_id uuid references auth.users(id),
 library_id uuid not null references public.libraries(id),
 target_kind text,
 target_id uuid,
 idempotency_key uuid,
 asset_scope text not null default 'official' check(asset_scope in ('official','personal')),
 operation_type text not null check(operation_type in ('upload','staging','promotion','delete')),
 state text not null default 'pending' check(state in ('pending','processing','dispatched','confirmed','complete','cancelled','abandoned')),
 object_id uuid unique,
 input_digest text check(input_digest ~ '^[0-9a-f]{64}$'),
 output_digest text check(output_digest ~ '^[0-9a-f]{64}$'),
 mime_type text check(mime_type in ('image/jpeg','image/png','image/webp')),
 byte_size integer check(byte_size between 1 and 3145728),
 width integer check(width between 1 and 4096),
 height integer check(height between 1 and 4096),
 generation bigint not null default 0 check(generation>=0),
 claim_token uuid,
 claim_expires_at timestamptz,
 expires_at timestamptz not null default clock_timestamp()+interval '23 hours',
 dispatched_at timestamptz,
 confirmed_at timestamptz,
 cancelled_at timestamptz,
 completed_at timestamptz,
 error_code text check(error_code in ('storage_failure','processing_failure','uncertain')),
 cleanup_state text not null default 'none' check(cleanup_state in ('none','pending','processing','retry','unresolved','complete')),
 cleanup_token uuid,
 cleanup_expires_at timestamptz,
 cleanup_after timestamptz not null default clock_timestamp(),
 cleanup_attempts integer not null default 0 check(cleanup_attempts>=0),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 check(width::bigint*height<=12000000),
 check((operation_type='upload' and parent_id is null and actor_id is not null and target_kind is not null and target_id is not null and idempotency_key is not null and object_id is null)
    or (operation_type in ('staging','promotion') and parent_id is not null and actor_id is not null and object_id is not null and idempotency_key is null)
    or (operation_type='delete' and parent_id is null and asset_id is not null and actor_id is null and object_id is null))
);
create unique index media_service_idempotency on public.media_service_operations(actor_id,idempotency_key) where operation_type='upload';
create unique index media_service_attempt_generation on public.media_service_operations(parent_id,operation_type,generation) where parent_id is not null;
create unique index media_service_asset_operation on public.media_service_operations(asset_id,operation_type) where asset_id is not null;
create index media_service_pending on public.media_service_operations(state,claim_expires_at);
create index media_service_temporary_cleanup on public.media_service_operations(cleanup_after) where parent_id is not null and asset_id is null;
alter table public.media_service_operations enable row level security;
revoke all on public.media_service_operations from public,anon,authenticated,service_role;

create function public.m113_actor_target(p_actor uuid,p_library uuid,p_kind text,p_target uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_actor is null or p_library is null or p_target is null or p_kind not in ('concept','question') then raise exception 'Media target denied' using errcode='42501'; end if;
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 if not public.m112_target_allowed(p_library,null,case when p_kind='concept' then p_target end,case when p_kind='question' then p_target end,null,null) then raise exception 'Media target denied' using errcode='42501'; end if;
end $$;

-- Reservation identity is logical; no durable asset or Storage path is promised.
create function public.m113_reserve(p_actor uuid,p_library uuid,p_kind text,p_target uuid,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.media_service_operations;
begin
 perform public.m113_actor_target(p_actor,p_library,p_kind,p_target);
 if p_key is null then raise exception 'Idempotency identity required'; end if;
 insert into public.media_service_operations(actor_id,library_id,target_kind,target_id,idempotency_key,operation_type)
 values(p_actor,p_library,p_kind,p_target,p_key,'upload') on conflict(actor_id,idempotency_key) where operation_type='upload' do nothing;
 select * into o from public.media_service_operations where actor_id=p_actor and idempotency_key=p_key and operation_type='upload' for update;
 if row(o.library_id,o.target_kind,o.target_id) is distinct from row(p_library,p_kind,p_target) then raise exception 'Reservation intent differs'; end if;
 return jsonb_build_object('reservationId',o.id,'expiresAt',o.expires_at);
end $$;

-- Parent locks serialize claims/publication with cancellation and temporary cleanup.
-- Dispatch consumption never resets. Every new generation has new attempt identities.
create function public.m113_upload(p_actor uuid,p_library uuid,p_reservation uuid,p_action text,p_token uuid default null,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.media_service_operations; t public.media_service_operations; s public.media_service_operations; a public.media_assets; attempt uuid;
begin
 select * into o from public.media_service_operations where id=p_reservation and operation_type='upload' for update;
 if not found or o.actor_id is distinct from p_actor or o.library_id is distinct from p_library then raise exception 'Media operation denied' using errcode='42501'; end if;
 perform public.m113_actor_target(p_actor,p_library,o.target_kind,o.target_id);
 if o.state='complete' then
  select * into a from public.media_assets where id=o.asset_id;
  if p_action='cancel' then
   update public.media_upload_sessions set expires_at=greatest(created_at+interval '1 microsecond',clock_timestamp()) where asset_id=o.asset_id and a.state in ('pending','ready') and expires_at>clock_timestamp();
   update public.media_service_operations set cancelled_at=coalesce(cancelled_at,clock_timestamp()) where id=o.id;
   return jsonb_build_object('cancelled',true);
  end if;
  if p_action in ('claim','publish') then return jsonb_build_object('complete',true,'assetId',o.asset_id,'inputDigest',o.input_digest,'terminal',a.state in ('deleting','deleted'),'state',a.state); end if;
  raise exception 'Published operation is terminal';
 end if;
 if p_action='cancel' then
  update public.media_service_operations set state='cancelled',cancelled_at=coalesce(cancelled_at,clock_timestamp()),claim_token=null,claim_expires_at=null,updated_at=clock_timestamp() where id=o.id;
  update public.media_service_operations set state='abandoned',cleanup_state='pending',cleanup_after=clock_timestamp() where parent_id=o.id and asset_id is null;
  return jsonb_build_object('cancelled',true);
 end if;
 if o.state='cancelled' or o.expires_at<=clock_timestamp() then raise exception 'Media operation expired or unavailable'; end if;
 if p_action='claim' then
  if o.state='processing' and o.claim_expires_at>clock_timestamp() then raise exception 'Media operation busy' using errcode='55P03'; end if;
  update public.media_service_operations set state='abandoned',cleanup_state='pending',cleanup_after=clock_timestamp() where parent_id=o.id and asset_id is null;
  update public.media_service_operations set state='processing',generation=generation+1,claim_token=gen_random_uuid(),claim_expires_at=clock_timestamp()+interval '60 seconds',error_code=null,updated_at=clock_timestamp() where id=o.id returning * into o;
  return jsonb_build_object('token',o.claim_token,'generation',o.generation);
 end if;
 if o.state<>'processing' or p_token is null or o.claim_token is distinct from p_token or o.claim_expires_at<=clock_timestamp() then raise exception 'Stale media claim' using errcode='40001'; end if;
 if p_action='fail' then
  update public.media_service_operations set state='abandoned',error_code='uncertain',cleanup_state='pending',cleanup_after=clock_timestamp() where parent_id=o.id and generation=o.generation and asset_id is null;
  update public.media_service_operations set state='pending',claim_token=null,claim_expires_at=null,error_code='processing_failure',updated_at=clock_timestamp() where id=o.id;
  return jsonb_build_object('retryable',true);
 end if;
 if p_action='commit-bytes' then
  if coalesce(p_data->>'inputDigest','') !~ '^[0-9a-f]{64}$' or coalesce(p_data->>'outputDigest','') !~ '^[0-9a-f]{64}$'
   or coalesce(p_data->>'mime','') not in ('image/jpeg','image/png','image/webp') or p_data->>'size' is null or p_data->>'width' is null or p_data->>'height' is null then raise exception 'Invalid normalized identity'; end if;
  if o.input_digest is not null and row(o.input_digest,o.output_digest,o.mime_type,o.byte_size,o.width,o.height) is distinct from row(p_data->>'inputDigest',p_data->>'outputDigest',p_data->>'mime',(p_data->>'size')::integer,(p_data->>'width')::integer,(p_data->>'height')::integer) then raise exception 'Immutable operation bytes differ'; end if;
  update public.media_service_operations set input_digest=p_data->>'inputDigest',output_digest=p_data->>'outputDigest',mime_type=p_data->>'mime',byte_size=(p_data->>'size')::integer,width=(p_data->>'width')::integer,height=(p_data->>'height')::integer where id=o.id;
  insert into public.media_service_operations(parent_id,actor_id,library_id,asset_scope,operation_type,object_id,generation,expires_at)
  values(o.id,o.actor_id,o.library_id,o.asset_scope,'staging',gen_random_uuid(),o.generation,o.expires_at) on conflict(parent_id,operation_type,generation) where parent_id is not null do nothing;
  select id into attempt from public.media_service_operations where parent_id=o.id and operation_type='staging' and generation=o.generation;
  return jsonb_build_object('attemptId',attempt);
 end if;
 select * into t from public.media_service_operations where id=(p_data->>'attemptId')::uuid and parent_id=o.id and generation=o.generation for update;
 if not found or t.asset_id is not null then raise exception 'Attempt unavailable'; end if;
 if p_action='dispatch-stage' and t.operation_type='staging' then
  if t.state<>'pending' or t.dispatched_at is not null then raise exception 'Dispatch already consumed'; end if;
  update public.media_service_operations set state='dispatched',dispatched_at=clock_timestamp() where id=t.id;
  return jsonb_build_object('bucket','socrates-content-media','object','_staging/'||o.library_id::text||'/'||o.id::text||'/'||t.object_id::text);
 elsif p_action='stage-verified' and t.operation_type='staging' then
  if t.state not in ('dispatched','confirmed') then raise exception 'Staging dispatch required'; end if;
  update public.media_service_operations set state='confirmed',confirmed_at=coalesce(confirmed_at,clock_timestamp()) where id=t.id;
  insert into public.media_service_operations(parent_id,actor_id,library_id,asset_scope,operation_type,object_id,generation,expires_at)
  values(o.id,o.actor_id,o.library_id,o.asset_scope,'promotion',gen_random_uuid(),o.generation,o.expires_at) on conflict(parent_id,operation_type,generation) where parent_id is not null do nothing;
  select id into attempt from public.media_service_operations where parent_id=o.id and operation_type='promotion' and generation=o.generation;
  return jsonb_build_object('attemptId',attempt);
 elsif p_action='dispatch-promotion' and t.operation_type='promotion' then
  select * into s from public.media_service_operations where parent_id=o.id and operation_type='staging' and generation=o.generation and state='confirmed';
  if not found or t.state<>'pending' or t.dispatched_at is not null then raise exception 'Promotion dispatch unavailable'; end if;
  update public.media_service_operations set state='dispatched',dispatched_at=clock_timestamp() where id=t.id;
  return jsonb_build_object('bucket','socrates-content-media','object',o.library_id::text||'/'||t.object_id::text,'source','_staging/'||o.library_id::text||'/'||o.id::text||'/'||s.object_id::text);
 elsif p_action='publish' and t.operation_type='promotion' then
  if t.state<>'dispatched' or t.dispatched_at is null or o.output_digest is null then raise exception 'Confirmed promotion required'; end if;
  -- The parent invokes publication only after its one copy has completed and exact readback.
  -- No media_assets record exists for an uncertain/abandoned promotion destination.
  insert into public.media_assets(id,library_id,owner_id,created_by,scope,object_name)
  values(t.object_id,o.library_id,case when o.asset_scope='personal' then o.actor_id end,o.actor_id,o.asset_scope,o.library_id::text||'/'||t.object_id::text);
  update public.media_assets set state='ready',mime_type=o.mime_type,byte_size=o.byte_size,width=o.width,height=o.height,frame_count=1,sha256=o.output_digest where id=t.object_id;
  insert into public.media_upload_sessions(asset_id,actor_id,idempotency_key,expires_at) values(t.object_id,o.actor_id,gen_random_uuid(),o.expires_at);
  update public.media_service_operations set state='confirmed',asset_id=t.object_id,confirmed_at=clock_timestamp(),completed_at=clock_timestamp() where id=t.id;
  update public.media_service_operations set state='complete',asset_id=t.object_id,completed_at=clock_timestamp(),claim_token=null,claim_expires_at=null where id=o.id;
  update public.media_service_operations set cleanup_state='pending',cleanup_after=clock_timestamp() where parent_id=o.id and operation_type='staging';
  return jsonb_build_object('assetId',t.object_id,'ready',true);
 end if;
 raise exception 'Unsupported media transition';
end $$;

create function public.m113_delivery(p_actor uuid,p_library uuid,p_reference uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.content_media_placements; a public.media_assets; c public.concepts; q public.questions;
begin
 perform set_config('request.jwt.claim.sub',coalesce(p_actor::text,''),true);
 if not public.m112_library_access(p_library) then raise exception 'Media read denied' using errcode='42501'; end if;
 select * into p from public.content_media_placements where id=p_reference and library_id=p_library;
 if not found or p.personal_concept_id is not null or p.personal_card_id is not null then raise exception 'Media read denied' using errcode='42501'; end if;
 if p.question_id is not null then
  select * into q from public.questions where id=p.question_id;
  select * into c from public.concepts where id=q.concept_id;
 else select * into c from public.concepts where id=p.concept_id; end if;
 if c.id is null or not exists(select 1 from public.concept_placements cp join public.library_nodes n on n.id=cp.library_node_id where cp.concept_id=c.id and n.library_id=p_library)
 or exists(select 1 from public.concept_placements cp join public.library_nodes n on n.id=cp.library_node_id where cp.concept_id=c.id and n.library_id<>p_library)
 or (not public.is_editor_or_admin() and (c.status<>'published' or (p.question_id is not null and q.status<>'published'))) then raise exception 'Media read denied' using errcode='42501'; end if;
 select * into a from public.media_assets where id=p.asset_id and library_id=p_library and state='ready' and scope='official';
 if not found then raise exception 'Media unavailable' using errcode='42501'; end if;
 return jsonb_build_object('bucket',a.bucket_id,'object',a.object_name,'mime',a.mime_type,'size',a.byte_size,'sha256',a.sha256);
end $$;

-- Temporary attempts never become references. Unknown transfer outcomes remain
-- unresolved after an observed absence and are revisited; expiry is not physical closure.
create function public.m113_cleanup(p_asset uuid,p_action text,p_token uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.media_assets; o public.media_service_operations; t public.media_service_operations; parent public.media_service_operations; ids jsonb; terminal boolean;
begin
 if p_action='temporary-list' then
  select coalesce(jsonb_agg(id),'[]'::jsonb) into ids from (
   select c.id from public.media_service_operations c join public.media_service_operations p on p.id=c.parent_id
   where c.asset_id is null and c.cleanup_state<>'complete' and c.cleanup_after<=clock_timestamp()
    and (p.state in ('complete','cancelled') or p.expires_at<=clock_timestamp() or c.generation<p.generation or c.state='abandoned')
   order by c.cleanup_after,c.id limit 20
  ) pending;
  return ids;
 end if;
 if p_action like 'temporary-%' then
  select * into t from public.media_service_operations where id=p_asset and operation_type in ('staging','promotion');
  if not found then return jsonb_build_object('eligible',false); end if;
  select * into parent from public.media_service_operations where id=t.parent_id for update;
  select * into t from public.media_service_operations where id=p_asset for update;
  if t.asset_id is not null or t.cleanup_state='complete' or not (parent.state in ('complete','cancelled') or parent.expires_at<=clock_timestamp() or t.generation<parent.generation or t.state='abandoned') then return jsonb_build_object('eligible',false); end if;
  if p_action='temporary-claim' then
   if t.cleanup_state='processing' and t.cleanup_expires_at>clock_timestamp() then return jsonb_build_object('eligible',false); end if;
   update public.media_service_operations set state='abandoned',cleanup_state='processing',cleanup_token=gen_random_uuid(),cleanup_expires_at=clock_timestamp()+interval '60 seconds',cleanup_attempts=cleanup_attempts+1 where id=t.id returning * into t;
   return jsonb_build_object('eligible',true,'token',t.cleanup_token,'bucket','socrates-content-media','object',case when t.operation_type='staging' then '_staging/'||t.library_id::text||'/'||t.parent_id::text||'/'||t.object_id::text else t.library_id::text||'/'||t.object_id::text end);
  end if;
  if t.cleanup_state<>'processing' or p_token is null or t.cleanup_token is distinct from p_token or t.cleanup_expires_at<=clock_timestamp() then raise exception 'Stale temporary cleanup claim'; end if;
  terminal:=t.dispatched_at is null or t.confirmed_at is not null;
  if p_action='temporary-observe' then
   update public.media_service_operations set cleanup_state=case when terminal then 'complete' else 'unresolved' end,cleanup_after=clock_timestamp()+interval '1 hour',cleanup_token=null,cleanup_expires_at=null where id=t.id;
   return jsonb_build_object('cleaned',terminal,'observedAbsent',true,'unresolved',not terminal);
  elsif p_action='temporary-retry' then
   update public.media_service_operations set cleanup_state='retry',cleanup_after=clock_timestamp()+interval '1 hour',cleanup_token=null,cleanup_expires_at=null where id=t.id;
   return jsonb_build_object('retry',true);
  end if;
  raise exception 'Unsupported temporary cleanup transition';
 end if;
 select * into a from public.media_assets where id=p_asset for update;
 if not found then return jsonb_build_object('eligible',false); end if;
 if p_action='claim' then
  perform public.m112_queue_orphan(p_asset);
  select * into a from public.media_assets where id=p_asset;
  if a.state<>'deleting' then return jsonb_build_object('eligible',false); end if;
  insert into public.media_service_operations(asset_id,library_id,operation_type) values(a.id,a.library_id,'delete') on conflict(asset_id,operation_type) where asset_id is not null do nothing;
  select * into o from public.media_service_operations where asset_id=a.id and operation_type='delete' for update;
  if o.state='processing' and o.claim_expires_at>clock_timestamp() then return jsonb_build_object('eligible',false); end if;
  update public.media_service_operations set state='processing',generation=generation+1,claim_token=gen_random_uuid(),claim_expires_at=clock_timestamp()+interval '60 seconds',updated_at=clock_timestamp() where id=o.id returning * into o;
  update public.media_deletion_jobs set attempts=attempts+1 where asset_id=a.id;
  return jsonb_build_object('eligible',true,'token',o.claim_token,'bucket',a.bucket_id,'object',a.object_name);
 end if;
 select * into o from public.media_service_operations where asset_id=a.id and operation_type='delete' for update;
 if a.state<>'deleting' or o.state is distinct from 'processing' or p_token is null or o.claim_token is distinct from p_token or o.claim_expires_at<=clock_timestamp() then raise exception 'Stale cleanup claim'; end if;
 if p_action='complete' then
  update public.media_assets set state='deleted' where id=a.id;
  update public.media_deletion_jobs set state='complete',completed_at=clock_timestamp(),last_error=null where asset_id=a.id;
  update public.media_service_operations set state='complete',completed_at=clock_timestamp(),claim_token=null,claim_expires_at=null where id=o.id;
 elsif p_action='retry' then
  update public.media_deletion_jobs set state='retry',last_error='storage_failure' where asset_id=a.id;
  update public.media_service_operations set state='pending',error_code='storage_failure',claim_token=null,claim_expires_at=null,updated_at=clock_timestamp() where id=o.id;
 else raise exception 'Unsupported cleanup transition'; end if;
 return jsonb_build_object('complete',p_action='complete');
end $$;
revoke all on function public.m113_actor_target(uuid,uuid,text,uuid),public.m113_reserve(uuid,uuid,text,uuid,uuid),public.m113_upload(uuid,uuid,uuid,text,uuid,jsonb),public.m113_delivery(uuid,uuid,uuid),public.m113_cleanup(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.m113_reserve(uuid,uuid,text,uuid,uuid),public.m113_upload(uuid,uuid,uuid,text,uuid,jsonb),public.m113_delivery(uuid,uuid,uuid),public.m113_cleanup(uuid,text,uuid) to service_role;
commit;
