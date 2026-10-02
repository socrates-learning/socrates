-- Official Concept authoring only. Draft receipts contain no authored content.
-- Gate 2/3 functions, tables, privileges and deletion timing remain unchanged.
begin;
do $$ begin
 if current_user <> 'postgres' or to_regclass('public.media_service_operations') is null then
  raise exception '114 requires postgres and the installed 112/113 foundations';
 end if;
end $$;

create table public.concept_media_drafts (
 id uuid primary key default gen_random_uuid(),
 author_id uuid not null references auth.users(id),
 library_id uuid not null references public.libraries(id),
 state text not null default 'open' check(state in ('open','consumed','abandoned')),
 expires_at timestamptz not null default clock_timestamp()+interval '23 hours',
 save_digest text check(save_digest ~ '^[0-9a-f]{64}$'),
 -- Receipts survive approved permanent content deletion; they never recreate it.
 bound_concept_id uuid,
 bound_version_id uuid,
 created_at timestamptz not null default clock_timestamp(),
 closed_at timestamptz,
 check(expires_at>created_at and expires_at<=created_at+interval '24 hours'),
 check((state='open' and closed_at is null and save_digest is null and bound_concept_id is null and bound_version_id is null)
    or (state='abandoned' and closed_at is not null and save_digest is null and bound_concept_id is null and bound_version_id is null)
    or (state='consumed' and closed_at is not null and save_digest is not null and bound_concept_id is not null and bound_version_id is not null))
);
create index concept_media_drafts_author on public.concept_media_drafts(author_id,library_id) where state='open';
alter table public.concept_media_drafts enable row level security;
revoke all on public.concept_media_drafts from public,anon,authenticated,service_role;
comment on table public.concept_media_drafts is 'Fixed-lived official Concept authoring receipts only; no content, personal history or media reference graph.';

create function public.m114_author(p_actor uuid,p_library uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform set_config('request.jwt.claim.sub',coalesce(p_actor::text,''),true);
 if p_actor is null or not public.is_editor_or_admin() or not public.m112_library_access(p_library) then
  raise exception 'Concept image authoring denied' using errcode='42501';
 end if;
end $$;

-- Lock order is draft, operations in UUID order, assets in UUID order.
create function public.m114_close_operations(p_draft uuid) returns void
language plpgsql security definer set search_path='' as $$
declare o public.media_service_operations;
begin
 for o in select * from public.media_service_operations where target_kind='concept-draft' and target_id=p_draft and operation_type='upload' order by id for update loop
  if o.state='complete' then
   perform 1 from public.media_assets where id=o.asset_id for update;
   update public.media_upload_sessions set expires_at=greatest(created_at+interval '1 microsecond',clock_timestamp())
    where asset_id=o.asset_id and expires_at>clock_timestamp()
      and exists(select 1 from public.media_assets where id=o.asset_id and state in ('pending','ready'));
   update public.media_service_operations set cancelled_at=coalesce(cancelled_at,clock_timestamp()) where id=o.id;
  else
   update public.media_service_operations set state='cancelled',cancelled_at=coalesce(cancelled_at,clock_timestamp()),claim_token=null,claim_expires_at=null where id=o.id;
   update public.media_service_operations set state='abandoned',cleanup_state='pending',cleanup_after=clock_timestamp() where parent_id=o.id and asset_id is null;
  end if;
 end loop;
end $$;

create function public.m114_draft(p_actor uuid,p_library uuid,p_draft uuid,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.concept_media_drafts;
begin
 perform public.m114_author(p_actor,p_library);
 if p_draft is null then raise exception 'Draft identity required'; end if;
 if p_action='create' then
  insert into public.concept_media_drafts(id,author_id,library_id) values(p_draft,p_actor,p_library) on conflict(id) do nothing;
 end if;
 select * into d from public.concept_media_drafts where id=p_draft for update;
 if not found or d.author_id is distinct from p_actor or d.library_id is distinct from p_library then raise exception 'Draft denied' using errcode='42501'; end if;
 if p_action='abandon' and d.state='open' then
  perform public.m114_close_operations(d.id);
  update public.concept_media_drafts set state='abandoned',closed_at=clock_timestamp() where id=d.id returning * into d;
 elsif p_action not in ('create','read','abandon') then raise exception 'Unsupported draft action'; end if;
 if p_action='create' and (d.state<>'open' or d.expires_at<=clock_timestamp()) then raise exception 'Draft is closed' using errcode='40001'; end if;
 return jsonb_build_object('draftId',d.id,'state',d.state,'expiresAt',d.expires_at,'conceptId',d.bound_concept_id,'versionId',d.bound_version_id);
end $$;

create function public.m114_reserve(p_actor uuid,p_library uuid,p_draft uuid,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.concept_media_drafts; o public.media_service_operations;
begin
 perform public.m114_author(p_actor,p_library);
 select * into d from public.concept_media_drafts where id=p_draft for update;
 if not found or d.author_id is distinct from p_actor or d.library_id is distinct from p_library then raise exception 'Draft denied' using errcode='42501'; end if;
 if d.state<>'open' or d.expires_at<=clock_timestamp() or p_key is null then raise exception 'Draft is closed' using errcode='40001'; end if;
 insert into public.media_service_operations(actor_id,library_id,target_kind,target_id,idempotency_key,operation_type,expires_at)
 values(p_actor,p_library,'concept-draft',d.id,p_key,'upload',d.expires_at) on conflict(actor_id,idempotency_key) where operation_type='upload' do nothing;
 select * into o from public.media_service_operations where actor_id=p_actor and idempotency_key=p_key and operation_type='upload' for update;
 if row(o.library_id,o.target_kind,o.target_id) is distinct from row(p_library,'concept-draft'::text,p_draft) then raise exception 'Reservation intent differs'; end if;
 return jsonb_build_object('reservationId',o.id,'expiresAt',o.expires_at);
end $$;

-- Same single-use lifecycle as 113, with real draft authorization and draft-first locking.
create function public.m114_upload(p_actor uuid,p_library uuid,p_reservation uuid,p_action text,p_token uuid default null,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.media_service_operations; t public.media_service_operations; s public.media_service_operations; a public.media_assets; attempt uuid; d public.concept_media_drafts;
begin
 perform public.m114_author(p_actor,p_library);
 select d0.* into d from public.concept_media_drafts d0 join public.media_service_operations op on op.target_id=d0.id and op.target_kind='concept-draft'
  where op.id=p_reservation and op.operation_type='upload' and op.actor_id=p_actor and op.library_id=p_library for update of d0;
 if not found or d.author_id is distinct from p_actor or d.library_id is distinct from p_library then raise exception 'Draft denied' using errcode='42501'; end if;
 select * into o from public.media_service_operations where id=p_reservation and operation_type='upload' for update;
 if not found or o.actor_id is distinct from p_actor or o.library_id is distinct from p_library then raise exception 'Media operation denied' using errcode='42501'; end if;
 if o.target_kind<>'concept-draft' or o.target_id<>d.id then raise exception 'Draft operation denied' using errcode='42501'; end if;
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
 if d.state<>'open' or d.expires_at<=clock_timestamp() or o.state='cancelled' or o.expires_at<=clock_timestamp() then raise exception 'Media operation expired or unavailable'; end if;
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

-- Parse only whole, blank-separated token lines. Other Markdown stays literal.
create function public.m114_tokens(p_body text) returns uuid[]
language plpgsql immutable set search_path='' as $$
declare lines text[]; ids uuid[]:='{}'; hit text[]; i integer;
begin
 if length(p_body)>1048576 then raise exception 'Concept image source too large'; end if;
 lines:=string_to_array(replace(coalesce(p_body,''),E'\r\n',E'\n'),E'\n');
 for i in 1..coalesce(cardinality(lines),0) loop
  hit:=regexp_match(lines[i],'^\[\[socrates-media:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]\]$');
  if hit is null then continue; end if;
  if (i>1 and lines[i-1] !~ '^\s*$') or (i<cardinality(lines) and lines[i+1] !~ '^\s*$') then raise exception 'Image token must occupy a separate block'; end if;
  if hit[1]::uuid=any(ids) then raise exception 'Duplicate image token'; end if;
  ids:=array_append(ids,hit[1]::uuid);
 end loop;
 return ids;
end $$;

create function public.m114_token_boundary() returns trigger
language plpgsql security definer set search_path='' as $$
declare c uuid; body text; ids uuid[]; current_ids uuid[]; v uuid;
begin
 if tg_table_name='concepts' then c:=new.id;
 elsif tg_op='DELETE' then c:=old.concept_id;
 else c:=new.concept_id; end if;
 if c is null then return null; end if;
 select body_markdown,current_version_id into body,v from public.concepts where id=c;
 if not found then return null; end if;
 -- No-media Concepts do not acquire a new source limit or parsing behavior.
 if position('[[socrates-media:' in coalesce(body,''))=0 and not exists(select 1 from public.concept_versions where concept_id=c and position('[[socrates-media:' in coalesce(body_markdown,''))>0) then return null; end if;
 ids:=public.m114_tokens(body);
 select coalesce(array_agg(id order by ordinal),'{}'::uuid[]) into current_ids from public.content_media_placements where concept_id=c;
 if ids is distinct from current_ids then raise exception 'Concept tokens and media placements differ'; end if;
 if cardinality(ids)>0 and not exists(select 1 from public.concept_versions where id=v and concept_id=c and body_markdown=body) then raise exception 'Concept image source must have a matching current version'; end if;
 return null;
end $$;
create constraint trigger m114_concept_tokens after insert or update on public.concepts deferrable initially deferred for each row execute function public.m114_token_boundary();
create constraint trigger m114_placement_tokens after insert or update or delete on public.content_media_placements deferrable initially deferred for each row execute function public.m114_token_boundary();

create function public.m114_manifest(p_actor uuid,p_library uuid,p_concept uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.concepts; media jsonb;
begin
 perform set_config('request.jwt.claim.sub',coalesce(p_actor::text,''),true);
 select * into c from public.concepts where id=p_concept;
 if c.id is null or not public.m112_library_access(p_library)
 or (not public.is_editor_or_admin() and c.status<>'published')
 or not exists(select 1 from public.concept_placements cp join public.library_nodes n on n.id=cp.library_node_id where cp.concept_id=c.id and n.library_id=p_library)
 or exists(select 1 from public.concept_placements cp join public.library_nodes n on n.id=cp.library_node_id where cp.concept_id=c.id and n.library_id<>p_library)
 then raise exception 'Concept media read denied' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('placementId',p.id,'assetId',p.asset_id,'ordinal',p.ordinal,'altText',p.alt_text,'caption',coalesce(p.caption,''),'mime',a.mime_type,'width',a.width,'height',a.height,'sha256',a.sha256) order by p.ordinal),'[]') into media
 from public.content_media_placements p join public.media_assets a on a.id=p.asset_id where p.concept_id=c.id and p.library_id=p_library and a.state='ready' and a.scope='official';
 return jsonb_build_object('conceptId',c.id,'versionId',c.current_version_id,'bodyMarkdown',c.body_markdown,'placements',media);
end $$;

create function public.m114_preview(p_actor uuid,p_library uuid,p_concept uuid,p_draft uuid,p_reservation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.media_service_operations; d public.concept_media_drafts; a public.media_assets;
begin
 perform public.m114_author(p_actor,p_library);
 select * into o from public.media_service_operations where id=p_reservation and operation_type='upload' and actor_id=p_actor and library_id=p_library;
 if not found or o.state<>'complete' or o.cancelled_at is not null or o.expires_at<=clock_timestamp() then raise exception 'Preview denied' using errcode='42501'; end if;
 if p_concept is null then
  select * into d from public.concept_media_drafts where id=p_draft and author_id=p_actor and library_id=p_library and state='open' and expires_at>clock_timestamp();
  if not found or o.target_kind<>'concept-draft' or o.target_id<>d.id then raise exception 'Draft preview denied' using errcode='42501'; end if;
 else
  if p_draft is not null or o.target_kind<>'concept' or o.target_id<>p_concept then raise exception 'Concept preview denied' using errcode='42501'; end if;
  perform public.m113_actor_target(p_actor,p_library,'concept',p_concept);
 end if;
 select * into a from public.media_assets where id=o.asset_id and library_id=p_library and scope='official' and state='ready';
 if not found or not exists(select 1 from public.media_upload_sessions where asset_id=a.id and actor_id=p_actor and expires_at>clock_timestamp()) then raise exception 'Preview unavailable' using errcode='42501'; end if;
 return jsonb_build_object('assetId',a.id,'bucket',a.bucket_id,'object',a.object_name,'mime',a.mime_type,'size',a.byte_size,'width',a.width,'height',a.height,'sha256',a.sha256);
end $$;

-- Reconstruct a first-save receipt from its immutable version, not hidden draft content.
create function public.m114_receipt(p_concept uuid,p_version uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v public.concept_versions; refs jsonb; media jsonb;
begin
 select * into v from public.concept_versions where id=p_version and concept_id=p_concept;
 if not found or not exists(select 1 from public.concepts where id=p_concept) then return jsonb_build_object('terminal',true,'concept_id',p_concept,'version_id',p_version); end if;
 select coalesce(jsonb_agg(jsonb_build_object('client_id',r->>'client_id','source_id',s->>'source_id','attribution_id',s->>'attribution_id')),'[]') into refs
 from jsonb_array_elements(coalesce(p_payload->'p_references','[]')) r
 join lateral jsonb_array_elements(v.sources_snapshot) s on
  (nullif(r->>'source_id','') is not null and s->>'source_id'=r->>'source_id') or
  (nullif(r->>'source_id','') is null and s->>'source_key'='concept-reference:'||p_concept::text||':'||btrim(r->>'client_id'));
 if jsonb_array_length(refs)<>jsonb_array_length(coalesce(p_payload->'p_references','[]')) then raise exception 'Reference receipt unavailable'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('placementId',r.placement_id,'assetId',r.asset_id,'ordinal',r.ordinal,'altText',r.alt_text,'caption',coalesce(r.caption,''),'mime',a.mime_type,'width',a.width,'height',a.height,'sha256',a.sha256) order by r.ordinal),'[]') into media
 from public.media_version_references r join public.media_assets a on a.id=r.asset_id where r.concept_version_id=p_version;
 return jsonb_build_object('concept_id',p_concept,'version_id',p_version,'references',refs,'placements',media,'bodyMarkdown',v.body_markdown);
end $$;

-- Authenticated caller identity is never supplied in the authoring payload.
create function public.m114_save(p_library uuid,p_concept uuid,p_draft uuid,p_expected_version uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); d public.concept_media_drafts; c public.concepts; a public.media_assets;
 item jsonb; manifest jsonb; ids uuid[]; manifest_ids uuid[]; asset_ids uuid[]; asset uuid; op public.media_service_operations;
 digest text; result jsonb; target uuid; version uuid; requested_reservation uuid;
begin
 perform public.m114_author(actor,p_library);
 if jsonb_typeof(p_payload)<>'object' or (p_payload->>'p_active_library_id')::uuid is distinct from p_library then raise exception 'Invalid Concept save context'; end if;
 manifest:=p_payload->'placements';
 if jsonb_typeof(manifest) is distinct from 'array' then raise exception 'Complete image manifest required'; end if;
 ids:=public.m114_tokens(p_payload->>'p_body_markdown');
 select coalesce(array_agg((value->>'placementId')::uuid order by ord),'{}'::uuid[]) into manifest_ids from jsonb_array_elements(manifest) with ordinality entries(value,ord);
 if ids is distinct from manifest_ids then raise exception 'Image token order differs from manifest'; end if;
 digest:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
 if p_concept is null then
  select * into d from public.concept_media_drafts where id=p_draft for update;
  if not found or d.author_id is distinct from actor or d.library_id is distinct from p_library then raise exception 'Draft denied' using errcode='42501'; end if;
  if d.state='consumed' then
   if d.save_digest is distinct from digest then raise exception 'Consumed draft payload differs' using errcode='40001'; end if;
   return public.m114_receipt(d.bound_concept_id,d.bound_version_id,p_payload);
  end if;
  if d.state<>'open' or d.expires_at<=clock_timestamp() or p_expected_version is not null then raise exception 'Draft expired or closed' using errcode='40001'; end if;
  perform 1 from public.media_service_operations where target_kind='concept-draft' and target_id=d.id and operation_type='upload' order by id for update;
  if exists(select 1 from public.media_service_operations where target_kind='concept-draft' and target_id=d.id and operation_type='upload' and state not in ('complete','cancelled')) then raise exception 'Finish or cancel pending image uploads'; end if;
 else
  if p_draft is not null then raise exception 'Existing Concept cannot consume a new draft'; end if;
  perform public.m113_actor_target(actor,p_library,'concept',p_concept);
  select * into c from public.concepts where id=p_concept for update;
  if not found or c.current_version_id is distinct from p_expected_version then raise exception 'Concept changed; reload before saving' using errcode='40001'; end if;
  perform 1 from public.media_service_operations where id in (select (value->>'reservationId')::uuid from jsonb_array_elements(manifest) where value->>'reservationId' is not null) order by id for update;
 end if;
 select coalesce(array_agg(distinct (value->>'assetId')::uuid order by (value->>'assetId')::uuid),'{}'::uuid[]) into asset_ids from jsonb_array_elements(manifest);
 foreach asset in array asset_ids loop
  select * into a from public.media_assets where id=asset for update;
  if not found or a.library_id<>p_library or a.scope<>'official' or a.state<>'ready' then raise exception 'Ready authorized asset required' using errcode='42501'; end if;
 end loop;
 for item in select value from jsonb_array_elements(manifest) with ordinality e(value,ord) order by ord loop
  if coalesce(length(btrim(item->>'altText')),0) not between 1 and 2000 or length(coalesce(item->>'caption',''))>4000 then raise exception 'Required image text is invalid'; end if;
  if exists(select 1 from public.content_media_placements where id=(item->>'placementId')::uuid and concept_id is distinct from p_concept) then raise exception 'Placement identity belongs to other content' using errcode='42501'; end if;
  -- Retained placements are authorized by the actual saved Concept. New assets
  -- require this author's exact reservation, never a guessed ready asset UUID.
  if p_concept is not null and exists(select 1 from public.content_media_placements where id=(item->>'placementId')::uuid and concept_id=p_concept and asset_id=(item->>'assetId')::uuid) then continue; end if;
  requested_reservation:=nullif(item->>'reservationId','')::uuid;
  select * into op from public.media_service_operations where id=requested_reservation and operation_type='upload' and actor_id=actor and library_id=p_library and asset_id=(item->>'assetId')::uuid and state='complete' and cancelled_at is null and expires_at>clock_timestamp();
  if not found or (p_concept is null and (op.target_kind<>'concept-draft' or op.target_id<>d.id)) or (p_concept is not null and (op.target_kind<>'concept' or op.target_id<>p_concept)) then raise exception 'Image reservation denied' using errcode='42501'; end if;
  if not exists(select 1 from public.media_upload_sessions where asset_id=op.asset_id and actor_id=actor and expires_at>clock_timestamp()) then raise exception 'Image reservation expired'; end if;
 end loop;
 if p_concept is null then
  result:=public.save_concept_draft(null,p_payload->>'p_name',p_payload->>'p_body_markdown',p_library,array(select value::uuid from jsonb_array_elements_text(p_payload->'p_library_node_ids')),array[]::text[]);
  target:=(result->>'concept_id')::uuid;
 else target:=p_concept; end if;
 delete from public.content_media_placements where concept_id=target;
 insert into public.content_media_placements(id,asset_id,library_id,concept_id,surface,ordinal,alt_text,caption)
 select (value->>'placementId')::uuid,(value->>'assetId')::uuid,p_library,target,'concept',(ord-1)::integer,value->>'altText',nullif(value->>'caption','')
 from jsonb_array_elements(manifest) with ordinality e(value,ord) order by (value->>'assetId')::uuid,(value->>'placementId')::uuid;
 result:=public.save_concept_with_prerequisites(target,p_payload->>'p_name',p_payload->>'p_body_markdown',p_library,
  array(select value::uuid from jsonb_array_elements_text(p_payload->'p_library_node_ids')),
  array(select value::uuid from jsonb_array_elements_text(p_payload->'p_tag_ids')),p_payload->>'p_status',p_payload->'p_references',p_payload->'p_prerequisites');
 version:=(result->>'version_id')::uuid;
 if not exists(select 1 from public.concepts where id=target and current_version_id=version and body_markdown=p_payload->>'p_body_markdown') then raise exception 'Concept save readback differs'; end if;
 if p_concept is null then
  if (select count(*) from public.concept_versions where concept_id=target)<>1 then raise exception 'First save must create exactly one version'; end if;
  update public.concept_media_drafts set state='consumed',save_digest=digest,bound_concept_id=target,bound_version_id=version,closed_at=clock_timestamp() where id=d.id;
  perform public.m114_close_operations(d.id);
 end if;
 return result||public.m114_receipt(target,version,p_payload);
end $$;

-- Explicit per-function grants. Helpers and triggers are not browser/service APIs.
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'm114\_%' escape '\' loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 end loop;
end $$;
grant execute on function public.m114_draft(uuid,uuid,uuid,text),public.m114_reserve(uuid,uuid,uuid,uuid),public.m114_upload(uuid,uuid,uuid,text,uuid,jsonb),public.m114_manifest(uuid,uuid,uuid),public.m114_preview(uuid,uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.m114_save(uuid,uuid,uuid,uuid,jsonb) to authenticated;
commit;
