-- 134: Remove official Topic locations from the active tree, never educational
-- identities or learning evidence. Requires the released 132 + 133 contracts.
begin;
set local lock_timeout = '5s';
do $$ begin
 if current_user <> 'postgres' then raise exception 'Authorized postgres migration role required'; end if;
 if to_regprocedure('public.m133_admin_topic_write_guard()') is null then raise exception 'Migration 133 required'; end if;
end $$;

alter table public.official_topic_locations add column detached_at timestamptz;
alter table public.official_topic_locations add column detachment_id uuid;
alter table public.official_topic_locations add constraint m134_detachment_pair
 check ((detached_at is null) = (detachment_id is null));
alter table public.official_topic_locations drop constraint official_topic_locations_parent_location_id_topic_id_key;
create unique index m134_active_location_pair on public.official_topic_locations(parent_location_id,topic_id) where detached_at is null;

-- This internal view gives the existing readers one consistent active-only
-- boundary. It has no browser/API grants and uses the existing table RLS.
create view public.m134_active_topic_locations with (security_invoker=true) as
 select * from public.official_topic_locations where detached_at is null;
revoke all on public.m134_active_topic_locations from public,anon,authenticated,service_role;
grant select on public.m134_active_topic_locations to postgres,socrates_migrator;
alter policy official_topic_locations_read on public.official_topic_locations using (
 detached_at is null and public.has_socrates_role() and (public.is_editor_or_admin() or exists(
 select 1 from public.user_libraries m where m.user_id=(select auth.uid()) and m.library_id=official_topic_locations.library_id)));

-- Exact released definitions are checked before bounded source substitutions.
-- Only FROM/JOIN placement reads become active-only; mutation targets, function
-- ownership, grants, RLS, formulas and argument/return contracts are unchanged.
do $contracts$ declare f record; definition text; changed text; begin
 for f in select * from jsonb_to_recordset($json$[{"signature":"public.change_official_topic_location(uuid,uuid,uuid,text,text,boolean,uuid,text)","hash":"15caa3cd1005e6d9a5a383c97ac660d0","rewrite":true},{"signature":"public.create_library_node_in_library(uuid,uuid,text,text,integer)","hash":"0f8b825052550857edb3ccb543f5b07b","rewrite":true},{"signature":"public.create_official_topic_at_location(uuid,uuid,text,text,text)","hash":"d65d4db6a08a31224a8e6313fa9fc0e8","rewrite":true},{"signature":"public.get_library_learner_progress(uuid)","hash":"e70a12d7aafed9d8b94783e6fefcd530","rewrite":true},{"signature":"public.get_official_topic_graph(uuid)","hash":"c53db0f5a815271eaf3fc0a08f3cf55f","rewrite":false},{"signature":"public.m122_check_graph(uuid)","hash":"926bc25f17b67b237a5935a8d04c7b01","rewrite":true},{"signature":"public.m122_effective_nodes(uuid)","hash":"68d241b208dcbca0fd1c33e8d70f20e6","rewrite":true},{"signature":"public.m123_goal_items(uuid)","hash":"2ee3fbf10e4b7f12a49a9432d18aac97","rewrite":true},{"signature":"public.m132_check_locations(uuid)","hash":"3a189f829d90444034bfafcebb6f4e91","rewrite":false},{"signature":"public.m132_goal_topics(uuid)","hash":"970cdd1a27c676d215d9ec78a75659ca","rewrite":true},{"signature":"public.m132_initialize_selection()","hash":"db37a40d51ef72cea51b71fc957d382b","rewrite":true},{"signature":"public.m132_insert_canonical_location()","hash":"2f4af16a3a439edd351dd860e2315359","rewrite":true},{"signature":"public.m132_legacy_goal_locations()","hash":"4341a2e95709f822ab223d42c616aca7","rewrite":true},{"signature":"public.m132_location_closure(uuid)","hash":"9c7c778bc9dae9cb004a9f30198ceb03","rewrite":true},{"signature":"public.m132_location_states(uuid)","hash":"3c83d23fd4f0f8dab761e8cb6310d7b8","rewrite":true},{"signature":"public.m132_topic_closure(uuid)","hash":"80874baeb4bb1e004163c3711ef7631f","rewrite":true},{"signature":"public.save_placement_study_goal(uuid,text,date,text,uuid[],uuid[],uuid,bigint)","hash":"b15756e666eae6889d1383292c8e4327","rewrite":true},{"signature":"public.set_study_deck_location_preference(uuid,uuid,uuid,integer,text)","hash":"4b38f833cd0a59582a48aa059c8bc448","rewrite":true},{"signature":"public.set_study_deck_location_selection(uuid,uuid,boolean,text)","hash":"c9343f2973f8651bb7dc6935dee3a30a","rewrite":true},{"signature":"public.set_study_deck_node_selection(uuid,uuid,boolean)","hash":"f4a6527dde0ed928578a57d1cc32c271","rewrite":true},{"signature":"public.set_study_deck_topic_subtree_preference(uuid,uuid,text,integer,text)","hash":"1bf3a7d904c7d793daca142c41e33864","rewrite":true}]$json$::jsonb) as x(signature text,hash text,rewrite boolean) loop
  definition:=pg_get_functiondef(f.signature::regprocedure);
  if md5(definition)<>f.hash then raise exception '134 prerequisite changed: %',f.signature; end if;
  if f.rewrite then
   changed:=regexp_replace(definition,'\m(from|join)\s+public\.official_topic_locations\M','\1 public.m134_active_topic_locations','gi');
   if changed=definition then raise exception '134 expected active-read replacement: %',f.signature; end if;
   if f.signature like 'public.change_official_topic_location(%' then
    changed:=replace(changed,'perform public.m132_require_revision(p_library_id,p_expected_revision);',
     'perform public.m132_require_revision(p_library_id,p_expected_revision); if p_action=''remove'' then raise exception ''Review removal in Creator Studio before removing a Topic location.'' using errcode=''22023''; end if;');
   end if;
   if f.signature='public.m132_insert_canonical_location()' then
    changed:=replace(changed,'where topic_id=new.parent_id and is_original;',
     'where topic_id=new.parent_id order by is_original desc,id limit 1; if new.parent_id is not null and parent_id is null then raise exception ''An active parent location is required.'' using errcode=''23514''; end if;');
   end if;
   execute format('set local role %I',pg_get_userbyid((select proowner from pg_proc where oid=f.signature::regprocedure)));
   execute changed;
   set local role postgres;
  end if;
 end loop;
end $contracts$;

create or replace function public.m132_check_locations(p_library uuid) returns void
 language plpgsql security definer set search_path='' as $$
begin
 -- Every canonical identity still has exactly one retained original anchor.
 -- An inactive original is never silently promoted to another shared branch.
 if exists(select 1 from public.library_nodes n where n.library_id=p_library and not exists(
  select 1 from public.official_topic_locations l where l.topic_id=n.id and l.is_original)) then
  raise exception 'Every canonical Topic must retain its original location record.' using errcode='23514'; end if;
 if exists(select 1 from public.official_topic_locations l join public.library_nodes n on n.id=l.topic_id
  where l.library_id=p_library and ((l.parent_location_id is null) is distinct from (n.parent_id is null)
   or (n.parent_id is null and l.detached_at is not null))) then
  raise exception 'The Library root cannot be removed, duplicated or reparented.' using errcode='23514'; end if;
 if exists(select 1 from public.m134_active_topic_locations l join public.library_nodes n on n.id=l.topic_id
  where l.library_id=p_library group by l.parent_location_id,lower(btrim(n.name)) having count(*)>1) then
  raise exception 'A location already has a child with this name.' using errcode='23505'; end if;
 if exists(with recursive walk as (
  select l.id,array[l.id] ids,array[l.topic_id] topics,false cycle from public.m134_active_topic_locations l where l.library_id=p_library and l.parent_location_id is null
  union all select c.id,w.ids||c.id,w.topics||c.topic_id,c.id=any(w.ids) or c.topic_id=any(w.topics)
  from walk w join public.m134_active_topic_locations c on c.parent_location_id=w.id where not w.cycle
 ) select 1 from public.m134_active_topic_locations l where l.library_id=p_library
  and not exists(select 1 from walk w where w.id=l.id and not w.cycle)) then
  raise exception 'Active Topic locations must be reachable without cycles.' using errcode='23514'; end if;
end $$;

create or replace function public.get_official_topic_graph(p_library_id uuid) returns jsonb
 language plpgsql stable security definer set search_path='' as $$
begin
 perform public.m122_require_library(p_library_id);
 return jsonb_build_object('version',132,'detachment_version',134,'library_id',p_library_id,
 'revision',public.m132_graph_revision(p_library_id),
 'root_id',(select id from public.library_nodes where library_id=p_library_id and parent_id is null),
 'nodes',coalesce((select jsonb_agg(to_jsonb(n) order by n.id) from public.library_nodes n where n.library_id=p_library_id),'[]'),
 'edges',coalesce((select jsonb_agg(to_jsonb(e) order by e.edge_key) from public.m122_edges(p_library_id) e),'[]'),
 'locations',coalesce((select jsonb_agg(to_jsonb(l) order by l.id) from public.m134_active_topic_locations l where l.library_id=p_library_id),'[]'),
 'unassigned_topic_ids',coalesce((select jsonb_agg(n.id order by n.id) from public.library_nodes n where n.library_id=p_library_id
  and not exists(select 1 from public.m134_active_topic_locations l where l.topic_id=n.id)),'[]'),
 'detached_original_topic_ids',coalesce((select jsonb_agg(l.topic_id order by l.topic_id) from public.official_topic_locations l
  where l.library_id=p_library_id and l.is_original and l.detached_at is not null),'[]'));
end $$;

create function public.m134_require_admin(p_library uuid) returns void
 language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Active Administrator access required.' using errcode='42501'; end if;
 perform public.m122_require_library(p_library,true);
end $$;

create function public.m134_detachment_review(p_library uuid,p_location uuid) returns jsonb
 language plpgsql stable security definer set search_path='' as $$
declare src public.official_topic_locations; affected uuid[]; impact jsonb; blocked boolean;
begin
 select * into src from public.m134_active_topic_locations where id=p_location and library_id=p_library;
 if src.id is null or src.parent_location_id is null then raise exception 'Select an active non-root Topic location.' using errcode='22023'; end if;
 select array_agg(location_id order by location_id) into affected from public.m132_location_closure(p_library) where ancestor_id=src.id;
 -- Owner material is never silently hidden or moved to a surviving alias.
 select exists(select 1 from public.official_topic_locations l where l.id=any(affected) and l.is_original and (
  exists(select 1 from public.personal_topic_official_placements p where p.library_node_id=l.topic_id)
  or exists(select 1 from public.personal_concept_official_placements p where p.library_node_id=l.topic_id)
  or exists(select 1 from public.personal_cards p where p.library_node_id=l.topic_id))) into blocked;
 select jsonb_build_object('library_id',p_library,'location_id',src.id,'topic_id',src.topic_id,
 'name',(select name from public.library_nodes where id=src.topic_id),
 'path',(with recursive path as (
  select l.id,l.parent_location_id,n.name,0 depth from public.m134_active_topic_locations l join public.library_nodes n on n.id=l.topic_id where l.id=src.id
  union all select l.id,l.parent_location_id,n.name,p.depth+1 from path p join public.m134_active_topic_locations l on l.id=p.parent_location_id join public.library_nodes n on n.id=l.topic_id
 ) select string_agg(name,' › ' order by depth desc) from path),
 'affected_location_ids',to_jsonb(affected),'descendant_count',cardinality(affected)-1,
 'other_placements',(select count(*) from public.m134_active_topic_locations l where l.topic_id=src.topic_id and not l.id=any(affected)),
 'unassigned_topics',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'name',n.name) order by n.name,n.id)
 from public.library_nodes n where n.library_id=p_library and exists(select 1 from public.official_topic_locations l where l.id=any(affected) and l.topic_id=n.id)
 and not exists(select 1 from public.m134_active_topic_locations l where l.topic_id=n.id and not l.id=any(affected))),'[]'),
 'blocked_by_personal_anchor',blocked,'content_preserved',true,'graph_revision',public.m132_graph_revision(p_library)) into impact;
 return impact||jsonb_build_object('review_revision',md5(impact::text));
end $$;

create function public.review_official_topic_detachment(p_library_id uuid,p_location_id uuid) returns jsonb
 language plpgsql security definer set search_path='' as $$
begin
 perform public.m134_require_admin(p_library_id);
 perform pg_catalog.pg_advisory_xact_lock_shared(104,20260927);
 return public.m134_detachment_review(p_library_id,p_location_id);
end $$;

create function public.detach_official_topic_location(p_library_id uuid,p_location_id uuid,p_review_revision text) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare impact jsonb; operation uuid:=gen_random_uuid();
begin
 perform public.m134_require_admin(p_library_id);
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'READ COMMITTED required' using errcode='40001'; end if;
 perform pg_catalog.pg_advisory_xact_lock(104,20260927);
 impact:=public.m134_detachment_review(p_library_id,p_location_id);
 if p_review_revision is null or impact->>'review_revision' is distinct from p_review_revision then
  raise exception 'This Topic or its dependencies changed. Review the removal again.' using errcode='PT409'; end if;
 if (impact->>'blocked_by_personal_anchor')::boolean then
  raise exception 'This location anchors personal material. Removal is blocked to preserve its owner’s access. No content has changed.' using errcode='23514'; end if;
 update public.official_topic_locations set detached_at=statement_timestamp(),detachment_id=operation
 where id in (select value::uuid from jsonb_array_elements_text(impact->'affected_location_ids'));
 perform public.m132_check_locations(p_library_id);
 return jsonb_build_object('removed_location_id',p_location_id,'unassigned_topics',impact->'unassigned_topics',
 'content_preserved',true,'graph',public.get_official_topic_graph(p_library_id));
end $$;

create function public.list_unassigned_official_topics(p_library_id uuid,p_search text default '',p_offset integer default 0) returns jsonb
 language plpgsql stable security definer set search_path='' as $$
begin
 perform public.m134_require_admin(p_library_id);
 if p_offset is null or p_offset<0 or length(coalesce(p_search,''))>200 then raise exception 'Invalid Topic search.' using errcode='22023'; end if;
 return (with matches as (
  select n.id,n.name,
   (select count(distinct p.concept_id) from public.concept_placements p where p.library_node_id=n.id) concept_count,
   (select count(distinct q.id) from public.questions q join public.concept_placements p on p.concept_id=q.concept_id where p.library_node_id=n.id) question_count
  from public.library_nodes n where n.library_id=p_library_id and position(lower(coalesce(p_search,'')) in lower(n.name))>0
  and not exists(select 1 from public.m134_active_topic_locations l where l.topic_id=n.id)
 ), page as (select * from matches order by name,id limit 50 offset p_offset)
 select jsonb_build_object('library_id',p_library_id,'revision',public.m132_graph_revision(p_library_id),
 'total',(select count(*) from matches),'topics',coalesce((select jsonb_agg(to_jsonb(p) order by p.name,p.id) from page p),'[]')));
end $$;

create function public.reassign_official_topic(p_library_id uuid,p_topic_id uuid,p_parent_location_id uuid,p_expected_revision text) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare destination public.official_topic_locations; new_location uuid:=gen_random_uuid();
begin
 perform public.m132_require_revision(p_library_id,p_expected_revision);
 if not exists(select 1 from public.library_nodes where id=p_topic_id and library_id=p_library_id and parent_id is not null)
 or exists(select 1 from public.m134_active_topic_locations where topic_id=p_topic_id) then
  raise exception 'Select an unassigned Topic in this Library.' using errcode='22023'; end if;
 select * into destination from public.m134_active_topic_locations where id=p_parent_location_id and library_id=p_library_id;
 if destination.id is null then raise exception 'Authorized active destination required.' using errcode='42501'; end if;
 -- A new location does not revive old Study selections or Goal scope. Canonical
 -- preferences/history remain stored; selection follows the new parent normally.
 update public.official_topic_locations set is_original=false where topic_id=p_topic_id and is_original;
 insert into public.official_topic_locations(id,library_id,topic_id,parent_location_id,sort_order,is_original)
 values(new_location,p_library_id,p_topic_id,destination.id,
  (select coalesce(max(sort_order)+1,0) from public.m134_active_topic_locations where parent_location_id=destination.id),true);
 perform public.m132_check_locations(p_library_id);
 return jsonb_build_object('topic_id',p_topic_id,'location_id',new_location,'graph',public.get_official_topic_graph(p_library_id));
end $$;

-- Prevent old authenticated canonical-delete and physical-location-delete paths
-- from bypassing retained records. The existing trusted maintenance model stays.
create function public.m134_preserve_topic_records() returns trigger
 language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null
 and coalesce(nullif(current_setting('role',true),''),'none') in ('none','postgres','socrates_migrator','supabase_admin')
 and (session_user in ('postgres','supabase_admin') or pg_catalog.pg_has_role(session_user,'postgres','MEMBER')
  or pg_catalog.pg_has_role(session_user,'socrates_migrator','MEMBER')) then return null; end if;
 raise exception 'Use reviewed Topic removal. Canonical Topics and retained locations cannot be deleted.' using errcode='42501';
end $$;
create trigger a134_preserve_topics before delete or truncate on public.library_nodes for each statement execute function public.m134_preserve_topic_records();
create trigger a134_preserve_locations before delete or truncate on public.official_topic_locations for each statement execute function public.m134_preserve_topic_records();

-- Serialize owner-anchor creation with detachment, including a stale browser
-- creating personal material after an Admin inspected the removal dialog.
create function public.m134_require_personal_anchor() returns trigger
 language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null
 and coalesce(nullif(current_setting('role',true),''),'none') in ('none','postgres','socrates_migrator','supabase_admin')
 and (session_user in ('postgres','supabase_admin') or pg_catalog.pg_has_role(session_user,'postgres','MEMBER')
  or pg_catalog.pg_has_role(session_user,'socrates_migrator','MEMBER')) then return new; end if;
 if new.library_node_id is null or (tg_op='UPDATE' and new.library_node_id is not distinct from old.library_node_id) then return new; end if;
 perform pg_catalog.pg_advisory_xact_lock_shared(104,20260927);
 if not exists(select 1 from public.m134_active_topic_locations where topic_id=new.library_node_id and is_original) then
  raise exception 'The personal material’s original Topic location is unavailable. Choose an active Topic.' using errcode='23514'; end if;
 return new;
end $$;
create trigger a134_personal_anchor before insert or update of library_node_id on public.personal_topic_official_placements for each row execute function public.m134_require_personal_anchor();
create trigger a134_personal_anchor before insert or update of library_node_id on public.personal_concept_official_placements for each row execute function public.m134_require_personal_anchor();
create trigger a134_personal_anchor before insert or update of library_node_id on public.personal_cards for each row execute function public.m134_require_personal_anchor();

do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and (p.proname like 'm134_%' or p.proname in ('review_official_topic_detachment','detach_official_topic_location','list_unassigned_official_topics','reassign_official_topic')) loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  execute format('grant execute on function %s to postgres,socrates_migrator',f.signature);
 end loop;
end $$;
grant execute on function public.review_official_topic_detachment(uuid,uuid),public.detach_official_topic_location(uuid,uuid,text),
 public.list_unassigned_official_topics(uuid,text,integer),public.reassign_official_topic(uuid,uuid,uuid,text) to authenticated;
comment on column public.official_topic_locations.detached_at is 'Excluded from all active placement readers. Retains identity, hierarchy and historical selections; never deletes canonical learning data.';
select public.m132_check_locations(id) from public.libraries;
notify pgrst,'reload schema';
commit;
