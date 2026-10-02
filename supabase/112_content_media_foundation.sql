-- Content media foundation only. No bucket provisioning, upload endpoint or existing save changes.
-- Future services must bind placements and append version snapshots in one transaction.
begin;
do $$ begin
 if current_user <> 'postgres' then raise exception '112 requires postgres installer'; end if;
 if to_regclass('storage.objects') is null or to_regclass('storage.buckets') is null
    or to_regclass('public.question_versions') is null or to_regclass('public.personal_cards') is null
 then raise exception '112 requires real Storage and application version/Card foundations'; end if;
end $$;

create table public.media_assets (
 id uuid primary key default gen_random_uuid(),
 library_id uuid not null references public.libraries(id) on delete restrict,
 owner_id uuid references auth.users(id) on delete restrict,
 created_by uuid not null references auth.users(id) on delete restrict,
 scope text not null check(scope in ('official','personal')),
 bucket_id text not null default 'socrates-content-media' check(bucket_id='socrates-content-media'),
 object_name text not null unique check(object_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}$'),
 state text not null default 'pending' check(state in ('pending','ready','deleting','deleted')),
 mime_type text check(mime_type in ('image/jpeg','image/png','image/webp')),
 byte_size integer check(byte_size between 1 and 3145728),
 width integer check(width between 1 and 4096),
 height integer check(height between 1 and 4096),
 frame_count integer check(frame_count=1),
 sha256 text check(sha256 ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default now(),
 ready_at timestamptz,
 unreferenced_since timestamptz,
 deleted_at timestamptz,
 check((scope='official' and owner_id is null) or (scope='personal' and owner_id is not null)),
 check(width::bigint * height::bigint <= 12000000),
 check(state='pending' or (mime_type is not null and byte_size is not null and width is not null and height is not null and frame_count=1 and sha256 is not null) or state in ('deleting','deleted')),
 unique(id,library_id)
);
create table public.media_upload_sessions (
 id uuid primary key default gen_random_uuid(),
 asset_id uuid not null unique references public.media_assets(id) on delete restrict,
 actor_id uuid not null references auth.users(id) on delete restrict,
 idempotency_key uuid not null,
 expires_at timestamptz not null,
 created_at timestamptz not null default now(),
 unique(actor_id,idempotency_key),
 check(expires_at > created_at)
);
-- Unsaved references expire; renewing them is a privileged service operation after authorization.
create table public.media_draft_leases (
 id uuid primary key default gen_random_uuid(),
 asset_id uuid not null references public.media_assets(id) on delete restrict,
 actor_id uuid not null references auth.users(id) on delete restrict,
 expires_at timestamptz not null,
 created_at timestamptz not null default now(),
 check(expires_at>created_at)
);
create table public.content_media_placements (
 id uuid primary key default gen_random_uuid(),
 asset_id uuid not null,
 library_id uuid not null,
 concept_id uuid references public.concepts(id) on delete cascade,
 question_id uuid references public.questions(id) on delete cascade,
 personal_concept_id uuid references public.personal_concepts(id) on delete restrict,
 personal_card_id uuid references public.personal_cards(id) on delete restrict,
 surface text not null,
 ordinal integer not null check(ordinal>=0),
 alt_text text not null check(length(btrim(alt_text)) between 1 and 2000),
 caption text check(length(caption)<=4000),
 created_at timestamptz not null default now(),
 foreign key(asset_id,library_id) references public.media_assets(id,library_id) on delete restrict,
 check(num_nonnulls(concept_id,question_id,personal_concept_id,personal_card_id)=1),
 check((surface='concept' and num_nonnulls(concept_id,personal_concept_id)=1)
    or (surface in ('front','answer') and num_nonnulls(question_id,personal_card_id)=1))
);
create unique index media_placement_order on public.content_media_placements
 (coalesce(concept_id,question_id,personal_concept_id,personal_card_id),surface,ordinal);
create table public.media_version_references (
 id uuid primary key default gen_random_uuid(),
 asset_id uuid not null,
 library_id uuid not null,
 placement_id uuid not null,
 concept_version_id uuid references public.concept_versions(id) on delete cascade,
 question_version_id uuid references public.question_versions(id) on delete cascade,
 surface text not null,
 ordinal integer not null check(ordinal>=0),
 alt_text text not null check(length(btrim(alt_text)) between 1 and 2000),
 caption text check(length(caption)<=4000),
 created_at timestamptz not null default now(),
 foreign key(asset_id,library_id) references public.media_assets(id,library_id) on delete restrict,
 check(num_nonnulls(concept_version_id,question_version_id)=1),
 check((concept_version_id is not null and surface='concept') or (question_version_id is not null and surface in ('front','answer')))
);
create unique index media_version_placement on public.media_version_references
 (coalesce(concept_version_id,question_version_id),placement_id);
create unique index media_version_order on public.media_version_references
 (coalesce(concept_version_id,question_version_id),surface,ordinal);
create table public.media_deletion_jobs (
 asset_id uuid primary key references public.media_assets(id) on delete restrict,
 state text not null default 'queued' check(state in ('queued','retry','complete')),
 attempts integer not null default 0 check(attempts>=0),
 last_error text,
 created_at timestamptz not null default now(),
 completed_at timestamptz
);

create function public.m112_library_access(p_library uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and public.has_socrates_role() and exists(
 select 1 from public.libraries l where l.id=p_library and l.status='active'
 and (public.is_editor_or_admin() or exists(select 1 from public.user_libraries m where m.library_id=l.id and m.user_id=auth.uid())))
$$;
create function public.m112_manage_asset(p_asset uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.media_assets a where a.id=p_asset
 and public.m112_library_access(a.library_id)
 and ((a.scope='official' and public.is_editor_or_admin()) or (a.scope='personal' and a.owner_id=auth.uid())))
$$;
-- This predicate qualifies every real target; no polymorphic unvalidated UUID grants access.
create function public.m112_target_allowed(p_library uuid,p_owner uuid,p_concept uuid,p_question uuid,p_personal_concept uuid,p_card uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare c uuid;
begin
 if not public.m112_library_access(p_library) then return false; end if;
 if p_concept is not null or p_question is not null then
  if p_owner is not null or not public.is_editor_or_admin() then return false; end if;
  c:=p_concept;
  if p_question is not null then select concept_id into c from public.questions where id=p_question; end if;
  -- Shared cross-Library Concepts require a later audience decision. Fail closed now.
  return exists(select 1 from public.concept_placements cp join public.library_nodes n on n.id=cp.library_node_id where cp.concept_id=c and n.library_id=p_library)
    and not exists(select 1 from public.concept_placements cp join public.library_nodes n on n.id=cp.library_node_id where cp.concept_id=c and n.library_id<>p_library);
 end if;
 -- Personal reservations are supported; personal attachment/history is not approved.
 return false;
end $$;

create function public.m112_asset_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Media identity is retained for deletion audit'; end if;
 if tg_op='INSERT' then
  if new.state<>'pending' or new.object_name<>new.library_id::text||'/'||new.id::text then raise exception 'Pending immutable media identity required'; end if;
  return new;
 end if;
 if row(new.id,new.library_id,new.owner_id,new.created_by,new.scope,new.bucket_id,new.object_name,new.created_at)
  is distinct from row(old.id,old.library_id,old.owner_id,old.created_by,old.scope,old.bucket_id,old.object_name,old.created_at)
 then raise exception 'Immutable media identity'; end if;
 if old.state<>'pending' and row(new.mime_type,new.byte_size,new.width,new.height,new.frame_count,new.sha256,new.ready_at)
  is distinct from row(old.mime_type,old.byte_size,old.width,old.height,old.frame_count,old.sha256,old.ready_at)
 then raise exception 'Immutable verified media bytes'; end if;
 if not (new.state=old.state or (old.state='pending' and new.state in ('ready','deleting')) or (old.state='ready' and new.state='deleting') or (old.state='deleting' and new.state='deleted')) then raise exception 'Invalid media lifecycle transition'; end if;
 if new.state='ready' and old.state='pending' then
  if not exists(select 1 from storage.objects o join storage.buckets b on b.id=o.bucket_id
    where o.bucket_id=new.bucket_id and o.name=new.object_name and not b.public)
  then raise exception 'Verified bytes require an existing private Storage object'; end if;
  new.ready_at:=clock_timestamp();
 end if;
 if new.state='deleting' and old.state<>'deleting' then
  if old.unreferenced_since is null or old.unreferenced_since>clock_timestamp()-interval '24 hours'
   or exists(select 1 from public.content_media_placements where asset_id=old.id)
   or exists(select 1 from public.media_version_references where asset_id=old.id)
   or exists(select 1 from public.media_draft_leases where asset_id=old.id and expires_at>clock_timestamp())
   or exists(select 1 from public.media_upload_sessions where asset_id=old.id and expires_at>clock_timestamp())
  then raise exception 'Media still referenced or grace period incomplete'; end if;
 end if;
 if new.state='deleted' and old.state='deleting' then
  if exists(select 1 from storage.objects where bucket_id=old.bucket_id and name=old.object_name) then raise exception 'Storage API deletion not confirmed'; end if;
  new.deleted_at:=clock_timestamp();
 end if;
 return new;
end $$;
create trigger m112_asset_guard before insert or update or delete on public.media_assets for each row execute function public.m112_asset_guard();

create function public.m112_reference_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare a public.media_assets; c uuid; q uuid; version_xid text;
begin
 -- Only a cascade from an actually deleted official version may remove history.
 -- Existing parent-version deletion guards remain authoritative and unchanged.
 if tg_op='DELETE' and tg_table_name='media_version_references' then
  if (old.concept_version_id is not null and not exists(select 1 from public.concept_versions where id=old.concept_version_id))
   or (old.question_version_id is not null and not exists(select 1 from public.question_versions where id=old.question_version_id)) then return old; end if;
 end if;
 if tg_op<>'INSERT' then raise exception 'Replace references by removal and insertion; historical references are immutable'; end if;
 select * into a from public.media_assets where id=new.asset_id for update;
 if a.state<>'ready' or not public.m112_manage_asset(a.id) then raise exception 'Authorized ready asset required' using errcode='42501'; end if;
 if tg_table_name='media_version_references' then
  if new.concept_version_id is not null then select concept_id,xmin::text into c,version_xid from public.concept_versions where id=new.concept_version_id;
  else select question_id,xmin::text into q,version_xid from public.question_versions where id=new.question_version_id; end if;
  if version_xid is distinct from (pg_current_xact_id()::text) then raise exception 'Historical versions cannot acquire new media'; end if;
  if not public.m112_target_allowed(new.library_id,a.owner_id,c,q,null,null) then raise exception 'Version media target denied' using errcode='42501'; end if;
 else
  if not public.m112_target_allowed(new.library_id,a.owner_id,new.concept_id,new.question_id,new.personal_concept_id,new.personal_card_id) then raise exception 'Media content target denied' using errcode='42501'; end if;
 end if;
 update public.media_assets set unreferenced_since=null where id=a.id;
 return new;
end $$;
create trigger m112_placement_insert before insert or update on public.content_media_placements for each row execute function public.m112_reference_guard();
create trigger m112_version_immutable before insert or update or delete on public.media_version_references for each row execute function public.m112_reference_guard();

-- Both cleanup and every new reference serialize on the asset row.
create function public.m112_lease_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare a public.media_assets;
begin
 select * into a from public.media_assets where id=new.asset_id for update;
 if a.state not in ('pending','ready') or not public.m112_manage_asset(a.id) or new.actor_id<>auth.uid() then raise exception 'Draft/upload lease denied' using errcode='42501'; end if;
 if tg_op='UPDATE' and row(new.id,new.asset_id,new.actor_id,new.created_at) is distinct from row(old.id,old.asset_id,old.actor_id,old.created_at) then raise exception 'Immutable lease identity'; end if;
 if new.expires_at>clock_timestamp()+interval '24 hours' then raise exception 'Lease exceeds 24 hours'; end if;
 update public.media_assets set unreferenced_since=null where id=a.id;
 return new;
end $$;
create trigger m112_draft_lease before insert or update on public.media_draft_leases for each row execute function public.m112_lease_guard();
create trigger m112_upload_lease before insert or update on public.media_upload_sessions for each row execute function public.m112_lease_guard();

create function public.reserve_media_upload(p_library uuid,p_scope text,p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare a uuid; s public.media_upload_sessions; existing public.media_assets;
begin
 if not public.m112_library_access(p_library) or p_scope not in ('official','personal') or p_key is null or (p_scope='official' and not public.is_editor_or_admin()) then raise exception 'Media upload reservation denied' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_key::text,112));
 select * into s from public.media_upload_sessions where actor_id=auth.uid() and idempotency_key=p_key;
 if found then
  select * into existing from public.media_assets where id=s.asset_id;
  if s.expires_at<=clock_timestamp() or existing.library_id<>p_library or existing.scope<>p_scope or existing.state not in ('pending','ready') then raise exception 'Reservation expired or request differs'; end if;
  return s.asset_id;
 end if;
 a:=gen_random_uuid();
 insert into public.media_assets(id,library_id,owner_id,created_by,scope,object_name) values(a,p_library,case when p_scope='personal' then auth.uid() end,auth.uid(),p_scope,p_library::text||'/'||a::text);
 insert into public.media_upload_sessions(asset_id,actor_id,idempotency_key,expires_at) values(a,auth.uid(),p_key,clock_timestamp()+interval '23 hours');
 return a;
end $$;

create function public.m112_queue_orphan(p_asset uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare a public.media_assets;
begin
 select * into a from public.media_assets where id=p_asset for update;
 if not found or a.state not in ('pending','ready') then return false; end if;
 if exists(select 1 from public.content_media_placements where asset_id=a.id)
 or exists(select 1 from public.media_version_references where asset_id=a.id)
 or exists(select 1 from public.media_draft_leases where asset_id=a.id and expires_at>clock_timestamp())
 or exists(select 1 from public.media_upload_sessions where asset_id=a.id and expires_at>clock_timestamp()) then
  update public.media_assets set unreferenced_since=null where id=a.id;return false;
 end if;
 if a.unreferenced_since is null then update public.media_assets set unreferenced_since=clock_timestamp() where id=a.id;return false; end if;
 if a.unreferenced_since>clock_timestamp()-interval '24 hours' then return false; end if;
 update public.media_assets set state='deleting' where id=a.id;
 insert into public.media_deletion_jobs(asset_id) values(a.id) on conflict do nothing;
 return true;
end $$;


-- Deferred equality makes partial placement/version writes fail atomically. It does not
-- retrofit old save RPCs: future media-aware saves must explicitly capture the new version.
create function public.m112_version_boundary() returns trigger
language plpgsql security definer set search_path='' as $$
declare c uuid; q uuid; v uuid; vx text; current_rows jsonb; historic_rows jsonb;
begin
 if tg_table_name='concepts' then c:=new.id;
 elsif tg_table_name='questions' then q:=new.id;
 elsif tg_table_name='content_media_placements' then
  if tg_op='DELETE' then c:=old.concept_id;q:=old.question_id;
  else c:=new.concept_id;q:=new.question_id;end if;
 else
  if new.concept_version_id is not null then select concept_id into c from public.concept_versions where id=new.concept_version_id;
  else select question_id into q from public.question_versions where id=new.question_version_id;end if;
 end if;
 if c is null and q is null then return null;end if;
 -- Approved permanent deletion removes the parent and its cascaded media references.
 if (c is not null and not exists(select 1 from public.concepts where id=c))
 or (q is not null and not exists(select 1 from public.questions where id=q)) then return null;end if;
 if tg_table_name in ('concepts','questions') and not exists(select 1 from public.content_media_placements where concept_id=c or question_id=q)
 and not exists(select 1 from public.media_version_references r left join public.concept_versions cv on cv.id=r.concept_version_id left join public.question_versions qv on qv.id=r.question_version_id where cv.concept_id=c or qv.question_id=q)
 then return null;end if;
 if c is not null then
  select cv.id,cv.xmin::text into v,vx from public.concepts co join public.concept_versions cv on cv.id=co.current_version_id where co.id=c;
 else
  select qv.id,qv.xmin::text into v,vx from public.questions qu join public.question_versions qv on qv.id=qu.current_version_id where qu.id=q;
 end if;
 if vx is distinct from pg_current_xact_id()::text then raise exception 'Media edits require a new current content version in the same transaction';end if;
 select coalesce(jsonb_agg(jsonb_build_array(id,asset_id,library_id,surface,ordinal,alt_text,caption) order by id),'[]') into current_rows from public.content_media_placements where (concept_id=c or question_id=q);
 select coalesce(jsonb_agg(jsonb_build_array(placement_id,asset_id,library_id,surface,ordinal,alt_text,caption) order by placement_id),'[]') into historic_rows from public.media_version_references where concept_version_id=v or question_version_id=v;
 if current_rows is distinct from historic_rows then raise exception 'Current media and immutable version snapshot differ';end if;
 return null;
end $$;
create constraint trigger m112_current_version_boundary after insert or update or delete on public.content_media_placements deferrable initially deferred for each row execute function public.m112_version_boundary();
create constraint trigger m112_snapshot_boundary after insert on public.media_version_references deferrable initially deferred for each row execute function public.m112_version_boundary();

-- Preserve media when an unchanged existing text-save RPC appends a version.
-- No-media content is a no-op. Existing historical rows are never backfilled.
create function public.m112_capture_version_media() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='concept_versions' then
  insert into public.media_version_references(asset_id,library_id,placement_id,concept_version_id,surface,ordinal,alt_text,caption)
   select p.asset_id,p.library_id,p.id,new.id,p.surface,p.ordinal,p.alt_text,p.caption from public.content_media_placements p where p.concept_id=new.concept_id order by p.asset_id,p.id;
 else
  insert into public.media_version_references(asset_id,library_id,placement_id,question_version_id,surface,ordinal,alt_text,caption)
   select p.asset_id,p.library_id,p.id,new.id,p.surface,p.ordinal,p.alt_text,p.caption from public.content_media_placements p where p.question_id=new.question_id order by p.asset_id,p.id;
 end if;
 return null;
end $$;
create trigger m112_concept_version_media after insert on public.concept_versions for each row execute function public.m112_capture_version_media();
create trigger m112_question_version_media after insert on public.question_versions for each row execute function public.m112_capture_version_media();
create constraint trigger m112_concept_pointer_boundary after update of current_version_id on public.concepts deferrable initially deferred for each row when (new.current_version_id is distinct from old.current_version_id) execute function public.m112_version_boundary();
create constraint trigger m112_question_pointer_boundary after update of current_version_id on public.questions deferrable initially deferred for each row when (new.current_version_id is distinct from old.current_version_id) execute function public.m112_version_boundary();

-- No content bindings are browser-writable. Later atomic save integration must be separately approved.
-- Metadata read permission is not permission to read or write bytes in Storage.
do $$ declare t text; f record; begin
 foreach t in array array['media_assets','media_upload_sessions','media_draft_leases','content_media_placements','media_version_references','media_deletion_jobs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on table public.%I from public,anon,authenticated,service_role',t);
 end loop;
 for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and (proname like 'm112_%' or proname='reserve_media_upload') loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 end loop;
end $$;
grant execute on function public.m112_library_access(uuid),public.m112_manage_asset(uuid) to authenticated;
grant execute on function public.reserve_media_upload(uuid,text,uuid) to authenticated;
grant select on public.media_assets,public.media_upload_sessions,public.media_draft_leases to authenticated;
create policy media_asset_author_read on public.media_assets for select to authenticated using(public.m112_manage_asset(id));
create policy media_upload_actor_read on public.media_upload_sessions for select to authenticated using(actor_id=auth.uid() and public.m112_manage_asset(asset_id));
create policy media_draft_actor_read on public.media_draft_leases for select to authenticated using(actor_id=auth.uid() and public.m112_manage_asset(asset_id));
-- Restrictive policy also defeats a future permissive policy accidentally covering this bucket.
create policy m112_private_media_boundary on storage.objects as restrictive for all to anon,authenticated
 using(bucket_id<>'socrates-content-media') with check(bucket_id<>'socrates-content-media');
commit;
