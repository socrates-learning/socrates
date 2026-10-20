-- Saved standalone learner Cards only. No browser Storage grants or content conversion.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$begin
 if current_user<>'postgres' or to_regprocedure('public.m127_purging(uuid)') is null
 or not exists(select 1 from pg_policy where polrelid='public.personal_cards'::regclass and polname='personal_cards_admin_insert_restriction')
 then raise exception '136 requires 112-115, 127 and 135';end if;
end$$;

-- Resolve the CURRENT attachment, not the immutable upload-Library provenance.
create function public.m136_card_library(p_card uuid) returns uuid
language sql stable security definer set search_path='' as $$
 with recursive card as(select * from public.personal_cards where id=p_card and concept_id is null), ancestry as(
 select t.id,t.parent_id,t.owner_id,array[t.id] visited from card c join public.personal_topics t on t.id=c.personal_topic_id and t.owner_id=c.owner_id
 union all select t.id,t.parent_id,t.owner_id,a.visited||t.id from ancestry a join public.personal_topics t on t.id=a.parent_id and t.owner_id=a.owner_id where not t.id=any(a.visited)
 ) select coalesce(c.library_id,(select n.library_id from ancestry a join public.personal_topic_official_placements p on p.personal_topic_id=a.id and p.owner_id=a.owner_id join public.library_nodes n on n.id=p.library_node_id where a.parent_id is null)) from card c
$$;
create function public.m136_card_allowed(p_card uuid,p_library uuid default null,p_write boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and public.account_is_active() and public.has_socrates_role()
 and exists(select 1 from public.personal_cards c where c.id=p_card and c.owner_id=auth.uid() and c.concept_id is null)
 and public.m112_library_access(public.m136_card_library(p_card))
 and (p_library is null or p_library=public.m136_card_library(p_card))
 and (not p_write or (not public.is_editor_or_admin() and exists(select 1 from public.user_roles where user_id=auth.uid() and role='learner')))
$$;
create function public.m136_asset_card(p_asset uuid,p_card uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.media_service_operations root join public.media_service_operations attempt on attempt.parent_id=root.id
 where root.operation_type='upload' and root.target_kind='personal_card' and root.target_id=p_card and root.asset_scope='personal'
 and root.actor_id=auth.uid() and attempt.operation_type='promotion' and attempt.object_id=p_asset)
$$;

-- Add only the owned-Card branch. Official authorization remains unchanged.
create or replace function public.m112_manage_asset(p_asset uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.media_assets a where a.id=p_asset and (
 (a.scope='personal' and a.owner_id=auth.uid() and exists(select 1 from public.media_service_operations root join public.media_service_operations attempt on attempt.parent_id=root.id
 where root.target_kind='personal_card' and root.asset_scope='personal' and attempt.object_id=a.id and public.m136_card_allowed(root.target_id)))
 or (public.m112_library_access(a.library_id) and ((a.scope='official' and public.is_editor_or_admin()) or (a.scope='personal' and a.owner_id=auth.uid()
 and not exists(select 1 from public.media_service_operations attempt join public.media_service_operations root on root.id=attempt.parent_id where attempt.object_id=a.id and root.target_kind='personal_card'))))))
$$;
create or replace function public.m112_target_allowed(p_library uuid,p_owner uuid,p_concept uuid,p_question uuid,p_personal_concept uuid,p_card uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare c uuid;
begin
 if p_card is not null then
  return p_owner=auth.uid() and num_nonnulls(p_concept,p_question,p_personal_concept)=0 and public.m136_card_allowed(p_card,null,true);
 end if;
 if not public.m112_library_access(p_library) then return false; end if;
 if p_concept is not null or p_question is not null then
  if p_owner is not null or not public.is_editor_or_admin() then return false; end if;
  c:=p_concept;
  if p_question is not null then select concept_id into c from public.questions where id=p_question; end if;
  return exists(select 1 from public.concept_placements cp join public.library_nodes n on n.id=cp.library_node_id where cp.concept_id=c and n.library_id=p_library)
    and not exists(select 1 from public.concept_placements cp join public.library_nodes n on n.id=cp.library_node_id where cp.concept_id=c and n.library_id<>p_library);
 end if;
 return false;
end $$;

-- Reuse the verified single-dispatch upload state machine and all of its fencing.
-- Fail closed if its original authorization call has changed.
do $patch$declare definition text;needle text:=' perform public.m113_actor_target(p_actor,p_library,o.target_kind,o.target_id);';begin
 definition:=pg_get_functiondef('public.m113_upload(uuid,uuid,uuid,text,uuid,jsonb)'::regprocedure);
 if position(needle in definition)=0 then raise exception 'Unexpected 113 upload contract';end if;
 execute replace(definition,needle,$replacement$
 if o.target_kind='personal_card' then
  perform set_config('request.jwt.claim.sub',coalesce(p_actor::text,''),true);
  if o.asset_scope<>'personal' or not public.m136_card_allowed(o.target_id,null,true) then raise exception 'Card media denied' using errcode='42501';end if;
 else
  perform public.m113_actor_target(p_actor,p_library,o.target_kind,o.target_id);
 end if;$replacement$);
end $patch$;

create function public.m136_reference_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.personal_card_id is not null and (not public.m136_asset_card(new.asset_id,new.personal_card_id)
 or not public.m136_card_allowed(new.personal_card_id,null,true)) then raise exception 'Card image binding denied' using errcode='42501';end if;
 return new;
end$$;
create trigger m136_card_reference before insert on public.content_media_placements for each row execute function public.m136_reference_guard();

-- Receipts contain no copy of the educational text. Deleting a Card removes its
-- receipts atomically; account purging therefore needs no new bypass or ledger.
create table public.personal_card_media_saves(
 id uuid primary key, card_id uuid not null references public.personal_cards(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete restrict,
 payload_hash text not null, saved_revision timestamptz not null, created_at timestamptz not null default clock_timestamp()
);
alter table public.personal_card_media_saves enable row level security;
revoke all on public.personal_card_media_saves from public,anon,authenticated,service_role;
create trigger a127_write_fence before insert or update or delete on public.personal_card_media_saves for each row execute function public.m127_write_fence('owner_id');

-- Quota includes live assets, pending reservations, and every uncollected or
-- uncertain Storage attempt. An uncertain write never frees its quota early.
create function public.m136_used_bytes(p_actor uuid) returns bigint
language sql stable security definer set search_path='' as $$
 select coalesce((select sum(coalesce(a.byte_size,3145728)) from public.media_assets a where a.owner_id=p_actor and a.scope='personal' and a.state<>'deleted'),0)
 +coalesce((select sum(coalesce(root.byte_size,3145728)) from public.media_service_operations child join public.media_service_operations root on root.id=child.parent_id
 where root.actor_id=p_actor and root.asset_scope='personal' and child.asset_id is null and child.cleanup_state<>'complete'),0)
 +coalesce((select sum(6291456) from public.media_service_operations root where root.actor_id=p_actor and root.asset_scope='personal' and root.operation_type='upload'
 and root.expires_at>clock_timestamp() and ((root.state='pending' and root.error_code is null and root.created_at>clock_timestamp()-interval '60 seconds')
 or (root.state='processing' and root.claim_expires_at>clock_timestamp()))),0)
$$;
create function public.m136_active_uploads(p_actor uuid,p_except uuid default null) returns bigint
language sql stable security definer set search_path='' as $$
 select count(*) from public.media_service_operations where actor_id=p_actor and operation_type='upload' and asset_scope='personal'
 and id is distinct from p_except and expires_at>clock_timestamp()
 and ((state='pending' and error_code is null and created_at>clock_timestamp()-interval '60 seconds') or (state='processing' and claim_expires_at>clock_timestamp()))
$$;
create function public.m136_lock(p_actor uuid,p_library uuid,p_card uuid,p_write boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform set_config('request.jwt.claim.sub',coalesce(p_actor::text,''),true);
 -- Same order as existing Card/Topic mutations: structure, Card, owner, assets.
 perform pg_catalog.pg_advisory_xact_lock(104,20260927);
 perform 1 from public.personal_cards where id=p_card for update;
 if p_actor is null or public.m136_card_allowed(p_card,p_library,p_write) is not true then raise exception 'Card image access denied' using errcode='42501';end if;
 perform public.m127_assert_writable(p_actor);
 perform pg_catalog.pg_advisory_xact_lock(hashtextextended('card-media:'||p_actor::text,136));
end$$;
create function public.m136_reserve(p_actor uuid,p_library uuid,p_card uuid,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.media_service_operations;
begin
 perform public.m136_lock(p_actor,p_library,p_card,true);
 if p_key is null then raise exception 'Reservation identity required';end if;
 select * into o from public.media_service_operations where actor_id=p_actor and idempotency_key=p_key and operation_type='upload';
 if found then
  if o.target_kind<>'personal_card' or o.target_id<>p_card or o.asset_scope<>'personal' then raise exception 'Reservation intent differs' using errcode='40001';end if;
  return jsonb_build_object('reservationId',o.id,'expiresAt',o.expires_at);
 end if;
 if (select count(*) from public.media_service_operations where actor_id=p_actor and operation_type='upload' and asset_scope='personal' and created_at>clock_timestamp()-interval '10 minutes')>=10 then raise exception 'Upload reservation limit reached' using errcode='P0136';end if;
 if public.m136_active_uploads(p_actor)>=2 then raise exception 'Two uploads are already pending' using errcode='P0136';end if;
 if public.m136_used_bytes(p_actor)+6291456>104857600 then raise exception 'Personal media quota reached' using errcode='P0136';end if;
 insert into public.media_service_operations(actor_id,library_id,target_kind,target_id,idempotency_key,asset_scope,operation_type)
 values(p_actor,p_library,'personal_card',p_card,p_key,'personal','upload') returning * into o;
 return jsonb_build_object('reservationId',o.id,'expiresAt',o.expires_at);
end$$;
create function public.m136_upload(p_actor uuid,p_library uuid,p_card uuid,p_reservation uuid,p_action text,p_token uuid default null,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.media_service_operations;
begin
 perform public.m136_lock(p_actor,p_library,p_card,true);
 select * into o from public.media_service_operations where id=p_reservation and operation_type='upload' for update;
 if not found or o.actor_id<>p_actor or o.target_kind<>'personal_card' or o.target_id<>p_card or o.asset_scope<>'personal' then raise exception 'Card upload denied' using errcode='42501';end if;
 -- Each retry reserves room for a fresh immutable pair of object paths.
 if p_action='claim' and o.state<>'complete' then
  if public.m136_active_uploads(p_actor,o.id)>=2 then raise exception 'Two uploads are already pending' using errcode='P0136';end if;
  if public.m136_used_bytes(p_actor)+(case when (o.state='pending' and o.error_code is null and o.created_at>clock_timestamp()-interval '60 seconds') or (o.state='processing' and o.claim_expires_at>clock_timestamp()) then 0 else 6291456 end)>104857600 then raise exception 'Personal media quota reached' using errcode='P0136';end if;
 end if;
 return public.m113_upload(p_actor,o.library_id,p_reservation,p_action,p_token,p_data);
end$$;

create function public.m136_manifest(p_actor uuid,p_library uuid,p_card uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform set_config('request.jwt.claim.sub',coalesce(p_actor::text,''),true);
 if p_actor is null or public.m136_card_allowed(p_card,p_library,false) is not true then raise exception 'Card images denied' using errcode='42501';end if;
 select jsonb_build_object('cardId',c.id,'revision',c.updated_at,'front',c.question,'back',c.answer,'images',coalesce((
 select jsonb_agg(jsonb_build_object('id',p.id,'assetId',a.id,'side',p.surface,'description',p.alt_text,'mime',a.mime_type,'width',a.width,'height',a.height,'sha256',a.sha256) order by p.surface,p.ordinal)
 from public.content_media_placements p join public.media_assets a on a.id=p.asset_id where p.personal_card_id=c.id and a.state='ready' and a.owner_id=p_actor and a.scope='personal'),'[]'::jsonb)) into result
 from public.personal_cards c where c.id=p_card;
 return result;
end$$;
create function public.m136_delivery(p_actor uuid,p_library uuid,p_card uuid,p_reference uuid,p_draft boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.media_assets;
begin
 perform set_config('request.jwt.claim.sub',coalesce(p_actor::text,''),true);
 if p_actor is null or public.m136_card_allowed(p_card,p_library,p_draft) is not true then raise exception 'Card image denied' using errcode='42501';end if;
 if p_draft then
  select asset.* into a from public.media_service_operations o join public.media_assets asset on asset.id=o.asset_id
  where o.id=p_reference and o.actor_id=p_actor and o.target_kind='personal_card' and o.target_id=p_card and o.state='complete' and o.cancelled_at is null and o.expires_at>clock_timestamp();
 else
  select asset.* into a from public.content_media_placements p join public.media_assets asset on asset.id=p.asset_id where p.id=p_reference and p.personal_card_id=p_card;
 end if;
 if a.id is null or a.state<>'ready' or a.owner_id<>p_actor or a.scope<>'personal' or not public.m136_asset_card(a.id,p_card) then raise exception 'Card image unavailable' using errcode='42501';end if;
 return jsonb_build_object('assetId',a.id,'bucket',a.bucket_id,'object',a.object_name,'mime',a.mime_type,'size',a.byte_size,'width',a.width,'height',a.height,'sha256',a.sha256);
end$$;
create function public.m136_save(p_actor uuid,p_library uuid,p_card uuid,p_expected timestamptz,p_key uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.personal_cards;s public.personal_card_media_saves; item jsonb; a public.media_assets; ids uuid[]:='{}'; removed uuid[]; digest text;
begin
 perform public.m136_lock(p_actor,p_library,p_card,true);
 if p_key is null or p_expected is null or jsonb_typeof(p_payload) is distinct from 'object' or jsonb_typeof(p_payload->'images') is distinct from 'array' then raise exception 'Invalid Card save';end if;
 digest:=encode(extensions.digest(p_payload::text,'sha256'),'hex');
 select * into c from public.personal_cards where id=p_card;
 select * into s from public.personal_card_media_saves where id=p_key;
 if found then
  if s.card_id<>p_card or s.owner_id<>p_actor or s.payload_hash<>digest or s.saved_revision<>c.updated_at then raise exception 'Save receipt differs or was superseded' using errcode='40001';end if;
  return to_jsonb(c);
 end if;
 if c.updated_at<>p_expected then raise exception 'Card changed; reload before saving' using errcode='40001';end if;
 if jsonb_typeof(p_payload->'front') is distinct from 'string' or jsonb_typeof(p_payload->'back') is distinct from 'string'
 or length(btrim(p_payload->>'front')) not between 1 and 10000 or length(btrim(p_payload->>'back')) not between 1 and 20000
 or jsonb_array_length(p_payload->'images')>8 then raise exception 'Invalid Card content';end if;
 if exists(select 1 from jsonb_array_elements(p_payload->'images') i group by i->>'side' having count(*)>4) then raise exception 'Four images per Card side';end if;
 for item in select value from jsonb_array_elements(p_payload->'images') loop
  if coalesce(item->>'side','') not in ('front','answer') or length(btrim(coalesce(item->>'description',''))) not between 1 and 2000 or (item->>'id')::uuid=any(ids) then raise exception 'Invalid Card image';end if;
  ids:=array_append(ids,(item->>'id')::uuid);
  select * into a from public.media_assets where id=(item->>'assetId')::uuid for update;
  if a.id is null or a.state<>'ready' or a.owner_id<>p_actor or a.scope<>'personal' or not public.m136_asset_card(a.id,p_card)
  or (not exists(select 1 from public.content_media_placements where personal_card_id=p_card and asset_id=a.id)
   and not exists(select 1 from public.media_service_operations where target_kind='personal_card' and target_id=p_card and asset_id=a.id and operation_type='upload' and cancelled_at is null and expires_at>clock_timestamp()))
  then raise exception 'Card image binding denied' using errcode='42501';end if;
 end loop;
 select array_agg(asset_id) into removed from public.content_media_placements where personal_card_id=p_card;
 delete from public.content_media_placements where personal_card_id=p_card;
 insert into public.content_media_placements(id,asset_id,library_id,personal_card_id,surface,ordinal,alt_text)
 select (i->>'id')::uuid,asset.id,asset.library_id,p_card,i->>'side',(row_number() over(partition by i->>'side' order by ord)-1)::integer,btrim(i->>'description')
 from jsonb_array_elements(p_payload->'images') with ordinality x(i,ord) join public.media_assets asset on asset.id=(i->>'assetId')::uuid;
 update public.personal_cards set question=btrim(p_payload->>'front'),answer=btrim(p_payload->>'back'),source_reference=nullif(btrim(p_payload->>'sourceReference'),'') where id=p_card returning * into c;
 insert into public.personal_card_media_saves(id,card_id,owner_id,payload_hash,saved_revision) values(p_key,p_card,p_actor,digest,c.updated_at);
 perform public.m112_queue_orphan(id) from unnest(coalesce(removed,'{}')) id;
 return to_jsonb(c);
end$$;

-- Reference-only cleanup. Existing m111 history checks/deletion are untouched.
-- No Storage removal here: the existing lease/reference-aware worker decides.
create function public.m136_card_delete() returns trigger
language plpgsql security definer set search_path='' as $$
declare asset uuid;
begin
 -- Free reservation slots, retaining all immutable attempt paths and cleanup
 -- evidence. Dispatched writes remain fenced by the original state machine.
 update public.media_service_operations set state=case when state='complete' then state else 'cancelled' end,
 cancelled_at=coalesce(cancelled_at,clock_timestamp()),claim_token=null,claim_expires_at=null
 where target_kind='personal_card' and target_id=old.id and actor_id=old.owner_id and operation_type='upload';
 update public.media_service_operations child set state='abandoned',cleanup_state='pending',cleanup_after=clock_timestamp()
 where child.asset_id is null and child.parent_id in(select id from public.media_service_operations where target_kind='personal_card' and target_id=old.id and actor_id=old.owner_id);
 if exists(select 1 from public.content_media_placements where personal_card_id=old.id) then
  if not public.m127_purging(old.owner_id) and (old.owner_id is distinct from auth.uid() or not public.has_socrates_role()) then raise exception 'Owned Card required' using errcode='42501';end if;
  for asset in select asset_id from public.content_media_placements where personal_card_id=old.id order by asset_id loop
   perform 1 from public.media_assets where id=asset for update;
   delete from public.content_media_placements where personal_card_id=old.id and asset_id=asset;
   perform public.m112_queue_orphan(asset);
  end loop;
 end if;
 return old;
end$$;
create trigger m136_card_media_delete before delete on public.personal_cards for each row execute function public.m136_card_delete();

do $$declare f record;begin
 for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname like 'm136_%' loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 end loop;
end$$;
grant execute on function public.m136_reserve(uuid,uuid,uuid,uuid),public.m136_upload(uuid,uuid,uuid,uuid,text,uuid,jsonb),
public.m136_manifest(uuid,uuid,uuid),public.m136_delivery(uuid,uuid,uuid,uuid,boolean),public.m136_save(uuid,uuid,uuid,timestamptz,uuid,jsonb) to service_role;
commit;
