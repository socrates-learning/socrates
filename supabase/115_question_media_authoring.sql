-- Official Question authoring only. Draft receipts contain no authored content.
-- Gate 2/3 functions, tables, privileges and deletion timing remain unchanged.
begin;
do $$ begin
 if current_user <> 'postgres' or to_regclass('public.concept_media_drafts') is null then
  raise exception '115 requires postgres and the installed 112/113/114 foundations';
 end if;
end $$;

create table public.question_media_drafts (
 id uuid primary key default gen_random_uuid(),
 author_id uuid not null references auth.users(id),
 library_id uuid not null references public.libraries(id),
 question_id uuid,
 expected_version_id uuid,
 state text not null default 'open' check(state in ('open','consumed','abandoned')),
 expires_at timestamptz not null default clock_timestamp()+interval '23 hours',
 save_digest text check(save_digest ~ '^[0-9a-f]{64}$'),
 -- Receipts survive approved permanent content deletion; they never recreate it.
 bound_question_id uuid,
 bound_version_id uuid,
 created_at timestamptz not null default clock_timestamp(),
 closed_at timestamptz,
 check(expires_at>created_at and expires_at<=created_at+interval '24 hours'),
 check((state='open' and closed_at is null and save_digest is null and bound_question_id is null and bound_version_id is null)
    or (state='abandoned' and closed_at is not null and save_digest is null and bound_question_id is null and bound_version_id is null)
    or (state='consumed' and closed_at is not null and save_digest is not null and bound_question_id is not null and bound_version_id is not null))
);
create index question_media_drafts_author on public.question_media_drafts(author_id,library_id) where state='open';
alter table public.question_media_drafts enable row level security;
revoke all on public.question_media_drafts from public,anon,authenticated,service_role;
comment on table public.question_media_drafts is 'Fixed-lived official Question authoring receipts only; no content, personal history or media reference graph.';

create function public.m115_author(p_actor uuid,p_library uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform set_config('request.jwt.claim.sub',coalesce(p_actor::text,''),true);
 if p_actor is null or not public.is_editor_or_admin() or not public.m112_library_access(p_library) then
  raise exception 'Question image authoring denied' using errcode='42501';
 end if;
end $$;

-- Lock order is draft, operations in UUID order, assets in UUID order.
create function public.m115_close_operations(p_draft uuid) returns void
language plpgsql security definer set search_path='' as $$
declare o public.media_service_operations;
begin
 for o in select * from public.media_service_operations where target_kind='question-draft' and target_id=p_draft and operation_type='upload' order by id for update loop
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

create function public.m115_draft(p_actor uuid,p_library uuid,p_draft uuid,p_question uuid,p_expected_version uuid,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.question_media_drafts;
begin
 perform public.m115_author(p_actor,p_library);
 if p_draft is null then raise exception 'Draft identity required'; end if;
 if p_action='create' then
  if p_question is not null then
   perform public.m113_actor_target(p_actor,p_library,'question',p_question);
   if not exists(select 1 from public.questions where id=p_question and current_version_id is not distinct from p_expected_version) then raise exception 'Question changed; reload before editing images' using errcode='40001'; end if;
  elsif p_expected_version is not null then raise exception 'New Question cannot have a version'; end if;
  insert into public.question_media_drafts(id,author_id,library_id,question_id,expected_version_id) values(p_draft,p_actor,p_library,p_question,p_expected_version) on conflict(id) do nothing;
 end if;
 select * into d from public.question_media_drafts where id=p_draft for update;
 if not found or row(d.author_id,d.library_id,d.question_id,d.expected_version_id) is distinct from row(p_actor,p_library,p_question,p_expected_version) then raise exception 'Draft denied' using errcode='42501'; end if;
 if p_action='abandon' and d.state='open' then
  perform public.m115_close_operations(d.id);
  update public.question_media_drafts set state='abandoned',closed_at=clock_timestamp() where id=d.id returning * into d;
 elsif p_action not in ('create','read','abandon') then raise exception 'Unsupported draft action'; end if;
 if p_action='create' and (d.state<>'open' or d.expires_at<=clock_timestamp()) then raise exception 'Draft is closed' using errcode='40001'; end if;
 return jsonb_build_object('draftId',d.id,'state',d.state,'expiresAt',d.expires_at,'questionId',d.bound_question_id,'versionId',d.bound_version_id);
end $$;

create function public.m115_reserve(p_actor uuid,p_library uuid,p_draft uuid,p_question uuid,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.question_media_drafts; o public.media_service_operations;
begin
 perform public.m115_author(p_actor,p_library);
 select * into d from public.question_media_drafts where id=p_draft for update;
 if not found or row(d.author_id,d.library_id,d.question_id) is distinct from row(p_actor,p_library,p_question) then raise exception 'Draft denied' using errcode='42501'; end if;
 if d.question_id is not null then perform public.m113_actor_target(p_actor,p_library,'question',d.question_id); end if;
 if d.state<>'open' or d.expires_at<=clock_timestamp() or p_key is null then raise exception 'Draft is closed' using errcode='40001'; end if;
 insert into public.media_service_operations(actor_id,library_id,target_kind,target_id,idempotency_key,operation_type,expires_at)
 values(p_actor,p_library,'question-draft',d.id,p_key,'upload',d.expires_at) on conflict(actor_id,idempotency_key) where operation_type='upload' do nothing;
 select * into o from public.media_service_operations where actor_id=p_actor and idempotency_key=p_key and operation_type='upload' for update;
 if row(o.library_id,o.target_kind,o.target_id) is distinct from row(p_library,'question-draft'::text,p_draft) then raise exception 'Reservation intent differs'; end if;
 return jsonb_build_object('reservationId',o.id,'expiresAt',o.expires_at);
end $$;

-- Same single-use lifecycle as 113, with real draft authorization and draft-first locking.
create function public.m115_upload(p_actor uuid,p_library uuid,p_reservation uuid,p_action text,p_token uuid default null,p_data jsonb default '{}'::jsonb,p_question uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.media_service_operations; t public.media_service_operations; s public.media_service_operations; a public.media_assets; attempt uuid; d public.question_media_drafts;
begin
 perform public.m115_author(p_actor,p_library);
 select d0.* into d from public.question_media_drafts d0 join public.media_service_operations op on op.target_id=d0.id and op.target_kind='question-draft'
  where op.id=p_reservation and op.operation_type='upload' and op.actor_id=p_actor and op.library_id=p_library for update of d0;
 if not found or d.author_id is distinct from p_actor or d.library_id is distinct from p_library then raise exception 'Draft denied' using errcode='42501'; end if;
 select * into o from public.media_service_operations where id=p_reservation and operation_type='upload' for update;
 if not found or o.actor_id is distinct from p_actor or o.library_id is distinct from p_library then raise exception 'Media operation denied' using errcode='42501'; end if;
 if o.target_kind<>'question-draft' or o.target_id<>d.id or d.question_id is distinct from p_question then raise exception 'Draft operation denied' using errcode='42501'; end if;
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
 if d.question_id is not null then perform public.m113_actor_target(p_actor,p_library,'question',d.question_id); end if;
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

-- Current content authorization is independent of possession of an image UUID.
create function public.m115_read_target(p_actor uuid,p_library uuid,p_question uuid) returns public.questions
language plpgsql security definer set search_path='' as $$
declare q public.questions;
begin
 perform set_config('request.jwt.claim.sub',coalesce(p_actor::text,''),true);
 select * into q from public.questions where id=p_question;
 if q.id is null or not public.m112_library_access(p_library)
 or (not public.is_editor_or_admin() and (q.status<>'published' or not exists(select 1 from public.concepts where id=q.concept_id and status='published')))
 or not exists(select 1 from public.concept_placements cp join public.library_nodes n on n.id=cp.library_node_id where cp.concept_id=q.concept_id and n.library_id=p_library)
 or exists(select 1 from public.concept_placements cp join public.library_nodes n on n.id=cp.library_node_id where cp.concept_id=q.concept_id and n.library_id<>p_library)
 then raise exception 'Question media read denied' using errcode='42501'; end if;
 return q;
end $$;

create function public.m115_manifest(p_actor uuid,p_library uuid,p_question uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q public.questions; media jsonb; answer text;
begin
 q:=public.m115_read_target(p_actor,p_library,p_question);
 select answer_text into answer from public.question_accepted_answers where question_id=q.id order by sort_order,id limit 1;
 select coalesce(jsonb_agg(jsonb_build_object('placementId',p.id,'assetId',p.asset_id,'surface',p.surface,'ordinal',p.ordinal,'altText',p.alt_text,'caption',coalesce(p.caption,''),'mime',a.mime_type,'width',a.width,'height',a.height,'sha256',a.sha256) order by p.surface,p.ordinal),'[]') into media
 from public.content_media_placements p join public.media_assets a on a.id=p.asset_id where p.question_id=q.id and p.library_id=p_library and a.state='ready' and a.scope='official';
 return jsonb_build_object('questionId',q.id,'versionId',q.current_version_id,'libraryId',p_library,'prompt',q.prompt,'answer',coalesce(answer,''),'placements',media);
end $$;

create function public.m115_preview(p_actor uuid,p_library uuid,p_question uuid,p_draft uuid,p_reservation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.media_service_operations; d public.question_media_drafts; a public.media_assets;
begin
 perform public.m115_author(p_actor,p_library);
 select * into d from public.question_media_drafts where id=p_draft and author_id=p_actor and library_id=p_library and question_id is not distinct from p_question and state='open' and expires_at>clock_timestamp();
 if not found then raise exception 'Draft preview denied' using errcode='42501'; end if;
 if d.question_id is not null then perform public.m113_actor_target(p_actor,p_library,'question',d.question_id); end if;
 select * into o from public.media_service_operations where id=p_reservation and operation_type='upload' and actor_id=p_actor and library_id=p_library and target_kind='question-draft' and target_id=d.id;
 if not found or o.state<>'complete' or o.cancelled_at is not null or o.expires_at<=clock_timestamp() then raise exception 'Preview denied' using errcode='42501'; end if;
 select * into a from public.media_assets where id=o.asset_id and library_id=p_library and scope='official' and state='ready';
 if not found or not exists(select 1 from public.media_upload_sessions where asset_id=a.id and actor_id=p_actor and expires_at>clock_timestamp()) then raise exception 'Preview unavailable' using errcode='42501'; end if;
 return jsonb_build_object('assetId',a.id,'bucket',a.bucket_id,'object',a.object_name,'mime',a.mime_type,'size',a.byte_size,'width',a.width,'height',a.height,'sha256',a.sha256);
end $$;

-- A receipt reconstructs the committed version; it never stores authored payloads.
create function public.m115_receipt(p_question uuid,p_version uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v public.question_versions; media jsonb; current_version uuid; answer text;
begin
 select * into v from public.question_versions where id=p_version and question_id=p_question;
 if not found or not exists(select 1 from public.questions where id=p_question) then return jsonb_build_object('terminal',true,'id',p_question,'current_version_id',p_version); end if;
 select current_version_id into current_version from public.questions where id=p_question;
 select a->>'answer_text' into answer from jsonb_array_elements(v.accepted_answers_snapshot) a order by (a->>'sort_order')::integer,a->>'id' limit 1;
 select coalesce(jsonb_agg(jsonb_build_object('placementId',r.placement_id,'assetId',r.asset_id,'surface',r.surface,'ordinal',r.ordinal,'altText',r.alt_text,'caption',coalesce(r.caption,''),'mime',a.mime_type,'width',a.width,'height',a.height,'sha256',a.sha256) order by r.surface,r.ordinal),'[]') into media
 from public.media_version_references r join public.media_assets a on a.id=r.asset_id where r.question_version_id=p_version;
 return jsonb_build_object('id',p_question,'current_version_id',p_version,'superseded',current_version is distinct from p_version,'prompt',v.prompt,'answer',coalesce(answer,''),'placements',media);
end $$;

-- Lock receipt -> Question -> operations -> assets. Both surfaces commit with text/version.
create function public.m115_save(p_library uuid,p_question uuid,p_draft uuid,p_expected_version uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); d public.question_media_drafts; q public.questions; a public.media_assets;
 item jsonb; manifest jsonb; asset uuid; op public.media_service_operations; digest text; target uuid; version uuid; surface_name text; ord integer;
begin
 perform public.m115_author(actor,p_library);
 if jsonb_typeof(p_payload) is distinct from 'object' or (p_payload->>'p_active_library_id')::uuid is distinct from p_library or nullif(p_payload->>'p_question_id','')::uuid is distinct from p_question then raise exception 'Invalid Question save context'; end if;
 if jsonb_typeof(p_payload->'front') is distinct from 'array' or jsonb_typeof(p_payload->'answer') is distinct from 'array' then raise exception 'Complete Front and Answer manifests required'; end if;
 digest:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
 select * into d from public.question_media_drafts where id=p_draft for update;
 if not found or row(d.author_id,d.library_id,d.question_id,d.expected_version_id) is distinct from row(actor,p_library,p_question,p_expected_version) then raise exception 'Draft denied' using errcode='42501'; end if;
 if d.state='consumed' then
  if d.save_digest is distinct from digest then raise exception 'Consumed draft payload differs' using errcode='40001'; end if;
  if exists(select 1 from public.questions where id=d.bound_question_id) then perform public.m113_actor_target(actor,p_library,'question',d.bound_question_id); end if;
  return public.m115_receipt(d.bound_question_id,d.bound_version_id);
 end if;
 if d.state<>'open' or d.expires_at<=clock_timestamp() then raise exception 'Draft expired or closed' using errcode='40001'; end if;
 if p_question is not null then
  select * into q from public.questions where id=p_question for update;
  if not found then return jsonb_build_object('terminal',true,'id',p_question); end if;
  perform public.m113_actor_target(actor,p_library,'question',p_question);
  if q.current_version_id is distinct from p_expected_version then raise exception 'Question changed; reload before saving' using errcode='40001'; end if;
  if row(q.difficulty,q.status) is distinct from row(p_payload->>'p_difficulty',p_payload->>'p_status') then raise exception 'Loaded compatibility metadata must be preserved'; end if;
 else
  if p_expected_version is not null or p_payload->>'p_difficulty' is distinct from 'medium' or p_payload->>'p_status' is distinct from 'published' then raise exception 'Invalid new Question defaults'; end if;
  perform public.m113_actor_target(actor,p_library,'concept',(p_payload->>'p_concept_id')::uuid);
 end if;
 if p_payload->>'p_question_type' is distinct from 'short_answer' or coalesce(length(btrim(p_payload->>'p_prompt')),0)=0 or jsonb_typeof(p_payload->'p_accepted_answers') is distinct from 'array' or jsonb_array_length(p_payload->'p_accepted_answers')<>1 or coalesce(length(btrim(p_payload->'p_accepted_answers'->0->>'answer_text')),0)=0 then raise exception 'Question and Answer are required'; end if;
 manifest:=(p_payload->'front')||(p_payload->'answer');
 if (select count(distinct value->>'placementId') from jsonb_array_elements(manifest))<>jsonb_array_length(manifest) then raise exception 'Duplicate image placement'; end if;
 foreach surface_name in array array['front','answer'] loop
  ord:=0;
  for item in select value from jsonb_array_elements(p_payload->surface_name) loop
   if item->>'surface' is distinct from surface_name or (item->>'ordinal')::integer is distinct from ord or item->>'placementId' is null or item->>'assetId' is null then raise exception 'Invalid image surface/order/identity'; end if;
   if jsonb_typeof(item->'altText') is distinct from 'string' or length(btrim(item->>'altText')) not between 1 and 2000 or jsonb_typeof(item->'caption') is distinct from 'string' or length(item->>'caption')>4000 then raise exception 'Required image text is invalid'; end if;
   ord:=ord+1;
  end loop;
 end loop;
 perform 1 from public.media_service_operations where target_kind='question-draft' and target_id=d.id and operation_type='upload' order by id for update;
 if exists(select 1 from public.media_service_operations where target_kind='question-draft' and target_id=d.id and operation_type='upload' and state not in ('complete','cancelled')) then raise exception 'Finish or cancel pending image uploads'; end if;
 for asset in select distinct (value->>'assetId')::uuid from jsonb_array_elements(manifest) order by 1 loop
  select * into a from public.media_assets where id=asset for update;
  if not found or a.library_id<>p_library or a.scope<>'official' or a.state<>'ready' then raise exception 'Ready authorized asset required' using errcode='42501'; end if;
 end loop;
 for item in select value from jsonb_array_elements(manifest) loop
  if exists(select 1 from public.content_media_placements where id=(item->>'placementId')::uuid and (question_id is distinct from p_question or surface<>item->>'surface')) then raise exception 'Placement belongs to another target/surface' using errcode='42501'; end if;
  if p_question is not null and exists(select 1 from public.content_media_placements where id=(item->>'placementId')::uuid and question_id=p_question and surface=item->>'surface' and asset_id=(item->>'assetId')::uuid) then continue; end if;
  select * into op from public.media_service_operations where id=nullif(item->>'reservationId','')::uuid and operation_type='upload' and actor_id=actor and library_id=p_library and target_kind='question-draft' and target_id=d.id and asset_id=(item->>'assetId')::uuid and state='complete' and cancelled_at is null and expires_at>clock_timestamp();
  if not found or not exists(select 1 from public.media_upload_sessions where asset_id=op.asset_id and actor_id=actor and expires_at>clock_timestamp()) then raise exception 'Image reservation denied' using errcode='42501'; end if;
 end loop;
 if p_question is null then
  q:=public.create_question((p_payload->>'p_concept_id')::uuid,p_payload->>'p_question_type',p_payload->>'p_prompt',p_payload->>'p_explanation',nullif(p_payload->>'p_review_article_concept_id','')::uuid,(p_payload->>'p_sort_order')::integer,p_payload->>'p_difficulty',p_payload->>'p_testing_angle');
  target:=q.id;
 else target:=p_question; end if;
 delete from public.content_media_placements where question_id=target;
 insert into public.content_media_placements(id,asset_id,library_id,question_id,surface,ordinal,alt_text,caption)
 select (value->>'placementId')::uuid,(value->>'assetId')::uuid,p_library,target,value->>'surface',(value->>'ordinal')::integer,value->>'altText',nullif(value->>'caption','')
 from jsonb_array_elements(manifest) order by (value->>'assetId')::uuid,(value->>'placementId')::uuid;
 q:=public.save_question_with_relationships_v2(target,(p_payload->>'p_concept_id')::uuid,p_payload->>'p_question_type',p_payload->>'p_prompt',p_payload->>'p_explanation',p_payload->>'p_status',nullif(p_payload->>'p_review_article_concept_id','')::uuid,(p_payload->>'p_sort_order')::integer,p_payload->>'p_difficulty',p_payload->>'p_testing_angle',p_payload->'p_accepted_answers',nullif(p_payload->'p_options','null'::jsonb),
  case when jsonb_typeof(p_payload->'p_source_ids')='array' then array(select value::uuid from jsonb_array_elements_text(p_payload->'p_source_ids')) end,
  array(select value::uuid from jsonb_array_elements_text(p_payload->'p_tag_ids')),p_library,
  case when jsonb_typeof(p_payload->'p_related_concept_ids')='array' then array(select value::uuid from jsonb_array_elements_text(p_payload->'p_related_concept_ids')) end,
  case when jsonb_typeof(p_payload->'p_additional_testing_angles')='array' then array(select value from jsonb_array_elements_text(p_payload->'p_additional_testing_angles')) end);
 version:=q.current_version_id;
 if version is null or q.prompt is distinct from p_payload->>'p_prompt' or not exists(select 1 from public.question_accepted_answers where question_id=target and answer_text=p_payload->'p_accepted_answers'->0->>'answer_text') then raise exception 'Question save readback differs'; end if;
 if p_question is null and (select count(*) from public.question_versions where question_id=target)<>1 then raise exception 'First save must create exactly one version'; end if;
 if (select count(*) from public.media_version_references where question_version_id=version)<>jsonb_array_length(manifest) then raise exception 'Version media differs'; end if;
 update public.question_media_drafts set state='consumed',save_digest=digest,bound_question_id=target,bound_version_id=version,closed_at=clock_timestamp() where id=d.id;
 perform public.m115_close_operations(d.id);
 return public.m115_receipt(target,version);
end $$;

-- Computed field, not a stored column. Forged row values never supply authority.
create function public.question_media_hint(public.questions) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare q public.questions; libraries uuid[]; hint jsonb;
begin
 if auth.uid() is null then return null; end if;
 select * into q from public.questions where id=$1.id;
 if not found then return null; end if;
 select array_agg(distinct n.library_id) into libraries from public.concept_placements cp join public.library_nodes n on n.id=cp.library_node_id where cp.concept_id=q.concept_id;
 if cardinality(libraries) is distinct from 1 or not public.m112_library_access(libraries[1]) then return null; end if;
 if not public.is_editor_or_admin() and (q.status<>'published' or not exists(select 1 from public.concepts where id=q.concept_id and status='published')) then return null; end if;
 select jsonb_build_object('questionId',q.id,'versionId',q.current_version_id,'libraryId',libraries[1],
  'front',exists(select 1 from public.content_media_placements where question_id=q.id and surface='front'),
  'answer',exists(select 1 from public.content_media_placements where question_id=q.id and surface='answer'),
  'unavailable',q.current_version_id is distinct from $1.current_version_id or q.prompt is distinct from $1.prompt) into hint;
 return hint;
end $$;

-- Add presentation metadata only after the existing selector has returned once.
create function public.m115_candidate_hint(p_candidate jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q public.questions; hint jsonb; answer text;
begin
 if p_candidate is null or p_candidate->>'candidate_type' is distinct from 'official' then return p_candidate; end if;
 select * into q from public.questions where id=(p_candidate->>'official_question_id')::uuid;
 if not found then return p_candidate||jsonb_build_object('question_media_hint',jsonb_build_object('unavailable',true)); end if;
 hint:=public.question_media_hint(q);
 select answer_text into answer from public.question_accepted_answers where question_id=q.id order by sort_order,id limit 1;
 if q.prompt is distinct from p_candidate->>'prompt' or answer is distinct from p_candidate->>'answer' then hint:=coalesce(hint,'{}')||jsonb_build_object('unavailable',true); end if;
 return p_candidate||jsonb_build_object('question_media_hint',hint);
end $$;

create function public.get_creator_questions_with_media(p_active_library_id uuid,p_concept_id uuid) returns setof jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; q public.questions;
begin
 for result in select * from public.get_creator_questions(p_active_library_id,p_concept_id) loop
  q:=jsonb_populate_record(null::public.questions,result);
  return next result||jsonb_build_object('question_media_hint',public.question_media_hint(q));
 end loop;
end $$;
create function public.search_creator_questions_with_media(p_active_library_id uuid,p_search_text text default null,p_difficulty text default null,p_primary_testing_angle text default null,p_additional_testing_angle text default null,p_primary_concept_id uuid default null,p_related_concept_id uuid default null,p_status text default null,p_tag_id uuid default null,p_page_size integer default 50,p_before_created_at timestamptz default null,p_before_id uuid default null) returns setof jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; q public.questions;
begin
 for result in select * from public.search_creator_questions(p_active_library_id,p_search_text,p_difficulty,p_primary_testing_angle,p_additional_testing_angle,p_primary_concept_id,p_related_concept_id,p_status,p_tag_id,p_page_size,p_before_created_at,p_before_id) loop
  q:=jsonb_populate_record(null::public.questions,result);
  return next result||jsonb_build_object('question_media_hint',public.question_media_hint(q));
 end loop;
end $$;
create function public.select_next_study_candidate_with_media(p_study_session_id uuid,p_include_debug boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 return public.m115_candidate_hint(public.select_next_study_candidate(p_study_session_id,p_include_debug));
end $$;
create function public.start_study_session_with_candidate_and_media(p_study_deck_id uuid,p_new_mastery_balance integer,p_session_id uuid,p_include_debug boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 result:=public.start_study_session_with_candidate(p_study_deck_id,p_new_mastery_balance,p_session_id,p_include_debug);
 if result is null or result->'candidate' is null then return result; end if;
 return jsonb_set(result,'{candidate}',public.m115_candidate_hint(result->'candidate'));
end $$;

do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p where p.pronamespace='public'::regnamespace and (p.proname like 'm115\_%' escape '\' or p.proname in ('question_media_hint','get_creator_questions_with_media','search_creator_questions_with_media','select_next_study_candidate_with_media','start_study_session_with_candidate_and_media')) loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 end loop;
end $$;
grant execute on function public.m115_draft(uuid,uuid,uuid,uuid,uuid,text),public.m115_reserve(uuid,uuid,uuid,uuid,uuid),public.m115_upload(uuid,uuid,uuid,text,uuid,jsonb,uuid),public.m115_manifest(uuid,uuid,uuid),public.m115_preview(uuid,uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.m115_save(uuid,uuid,uuid,uuid,jsonb),public.question_media_hint(public.questions),public.get_creator_questions_with_media(uuid,uuid),public.search_creator_questions_with_media(uuid,text,text,text,text,uuid,uuid,text,uuid,integer,timestamptz,uuid),public.select_next_study_candidate_with_media(uuid,boolean),public.start_study_session_with_candidate_and_media(uuid,integer,uuid,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
