-- LOCAL CANDIDATE. Install only after the reviewed 105/106/107 contracts.
-- Migration 103 compatibility exception, limited to position_library_node_in_library:
-- A specific execution-ownership exception for a guarded operation that mutates
-- pre-existing postgres-owned application structure, not an exemption for future
-- application functions generally. No migration-role or table privilege changes.
-- Lock order: shared transaction advisory lock (104,20260927), then row locks.
-- Canonical order: sort_order ASC NULLS LAST, name COLLATE "C", id.
begin;
create temporary table m104_functions_before on commit drop as
select oid,proowner,proacl,pg_get_functiondef(oid) definition,pg_get_functiondef(oid) expected_definition from pg_proc
where pronamespace='public'::regnamespace;
create temporary table m104_security_before on commit drop as
select 'table' kind,oid::text key,md5(concat_ws('|',c.relowner::text,c.relacl::text,c.relrowsecurity::text,c.relforcerowsecurity::text)) hash from pg_class c where relnamespace='public'::regnamespace
union all select 'policy',oid::text,md5(row_to_json(p)::text) from pg_policy p
union all select 'default',oid::text,md5(row_to_json(d)::text) from pg_default_acl d
union all select 'role',oid::text,md5(row_to_json(r)::text) from pg_roles r
union all select 'membership',oid::text,md5(row_to_json(m)::text) from pg_auth_members m;
do $preflight$
begin
 if session_user <> 'postgres' or current_user <> 'postgres' then raise exception '104 requires postgres installer'; end if;
 if md5(pg_get_functiondef('public.select_next_study_question_hardened(uuid,boolean)'::regprocedure)) <> '5774237a9890e1064d1bed53adfb9d4f'
 or md5(pg_get_functiondef('public.get_home_study_bootstrap(uuid,uuid)'::regprocedure)) <> '95eb3cf6b5baeb775efc9f6ffff9da1b'
 or md5(pg_get_functiondef('public.get_library_official_availability_counts(uuid)'::regprocedure)) <> 'f631afc2c50cd906c5f65bdc08805949'
 then raise exception '104 requires exact post-106/107 contract'; end if;
 if not (select bool_and(prosecdef) from pg_proc where oid in ('public.validate_question_publish()'::regprocedure,'public.validate_question_child_publish()'::regprocedure)) then raise exception '104 requires installed 105'; end if;
 if not exists(select 1 from pg_roles where rolname='socrates_migrator' and not rolcanlogin and not rolsuper and not rolinherit and not rolbypassrls)
 or has_table_privilege('socrates_migrator','public.library_nodes','UPDATE')
 or exists(select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a where d.defaclrole='socrates_migrator'::regrole and a.grantee <> d.defaclrole)
 then raise exception '104 requires fail-closed 103 authority'; end if;
 if exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname in ('position_library_node_in_library','position_personal_topic','lock_topic_structure_before_write','normalize_topic_siblings_after_write')) then raise exception '104 already or partially installed'; end if;
 if md5(pg_get_functiondef('public.get_development_delete_summary(text,uuid)'::regprocedure)) <> 'd84ee9f165fd23720a003deec06c514c' then raise exception '104 unexpected writer: get_development_delete_summary(text,uuid)'; end if;
 if md5(pg_get_functiondef('public._development_delete_group(uuid)'::regprocedure)) <> '8152782b6f7e25bbd87eda168f9683f7' then raise exception '104 unexpected writer: _development_delete_group(uuid)'; end if;
 if md5(pg_get_functiondef('public._development_delete_library(uuid)'::regprocedure)) <> 'bc6d506383850c12e21ce21250ee29de' then raise exception '104 unexpected writer: _development_delete_library(uuid)'; end if;
 if md5(pg_get_functiondef('public.delete_development_content(text,uuid)'::regprocedure)) <> '8f9abd8cc1c79ab286ffe39a6be61ca3' then raise exception '104 unexpected writer: delete_development_content(text,uuid)'; end if;
 if md5(pg_get_functiondef('public.set_library_organizer_status(uuid,text)'::regprocedure)) <> '51a03d82b183a5916c9a36cb7706d45f' then raise exception '104 unexpected writer: set_library_organizer_status(uuid,text)'; end if;
 if md5(pg_get_functiondef('public.delete_empty_library_node_in_library(uuid,uuid)'::regprocedure)) <> 'a8527244b5af632389261da5f939d2d1' then raise exception '104 unexpected writer: delete_empty_library_node_in_library(uuid,uuid)'; end if;
 if md5(pg_get_functiondef('public.rename_library_node_in_library(uuid,uuid,text)'::regprocedure)) <> 'e26e7c91d2ba64a3ac1227f41240258c' then raise exception '104 unexpected writer: rename_library_node_in_library(uuid,uuid,text)'; end if;
 if md5(pg_get_functiondef('public._development_delete_library_node(uuid)'::regprocedure)) <> '9c346b7d1630a7f165597780345bc31b' then raise exception '104 unexpected writer: _development_delete_library_node(uuid)'; end if;
 if md5(pg_get_functiondef('public.archive_library_group(uuid)'::regprocedure)) <> 'a5a5fb7cc563cc9554ff5b655a34bacd' then raise exception '104 unexpected writer: archive_library_group(uuid)'; end if;
 if md5(pg_get_functiondef('public.create_library_node_in_library(uuid,uuid,text,text,integer)'::regprocedure)) <> 'd7ddee5e88da193b8b0bc61203461eb7' then raise exception '104 unexpected writer: create_library_node_in_library(uuid,uuid,text,text,integer)'; end if;
 if md5(pg_get_functiondef('public.create_library_group(uuid,text)'::regprocedure)) <> '1ae17569fc09234298aeb1bc887fa7ae' then raise exception '104 unexpected writer: create_library_group(uuid,text)'; end if;
 if md5(pg_get_functiondef('public.create_library_with_root(uuid,text,text)'::regprocedure)) <> '91c22713ac6d375b738e742363964f6f' then raise exception '104 unexpected writer: create_library_with_root(uuid,text,text)'; end if;
 if md5(pg_get_functiondef('public.create_personal_topic(text,uuid,uuid,integer)'::regprocedure)) <> '6c265d36781b19c8b81c9d79468f4bf6' then raise exception '104 unexpected writer: create_personal_topic(text,uuid,uuid,integer)'; end if;
 if md5(pg_get_functiondef('public.delete_empty_library(uuid)'::regprocedure)) <> 'a60f65ed9ff77b4b40f231d5620c720e' then raise exception '104 unexpected writer: delete_empty_library(uuid)'; end if;
 if md5(pg_get_functiondef('public.delete_empty_library_group(uuid)'::regprocedure)) <> '2da73091de9db2fd961212b470f4b797' then raise exception '104 unexpected writer: delete_empty_library_group(uuid)'; end if;
 if md5(pg_get_functiondef('public.move_library_group(uuid,uuid)'::regprocedure)) <> '4b01f93631cb055c87ee10a5aafeb024' then raise exception '104 unexpected writer: move_library_group(uuid,uuid)'; end if;
 if md5(pg_get_functiondef('public.move_library_node_in_library(uuid,uuid,uuid)'::regprocedure)) <> 'e541e3caeb7aca4679cf2e6d73bb3d89' then raise exception '104 unexpected writer: move_library_node_in_library(uuid,uuid,uuid)'; end if;
 if md5(pg_get_functiondef('public.move_library_to_group(uuid,uuid)'::regprocedure)) <> 'b18c8510f03a90b9f3be7db65c3f5606' then raise exception '104 unexpected writer: move_library_to_group(uuid,uuid)'; end if;
 if md5(pg_get_functiondef('public.rename_library_group(uuid,text)'::regprocedure)) <> 'ac17e4860205c7f234fe4f7b8078b6b5' then raise exception '104 unexpected writer: rename_library_group(uuid,text)'; end if;
 if md5(pg_get_functiondef('public.rename_library_with_root(uuid,text)'::regprocedure)) <> '239f14badeaf74e8ef5cf7d0a197dde2' then raise exception '104 unexpected writer: rename_library_with_root(uuid,text)'; end if;
 if md5(pg_get_functiondef('public.reorder_library_group(uuid,text)'::regprocedure)) <> '5786dde5ad02d0c81a4487fcb274edbb' then raise exception '104 unexpected writer: reorder_library_group(uuid,text)'; end if;
 if md5(pg_get_functiondef('public.set_personal_topic_official_placement(uuid,uuid)'::regprocedure)) <> 'ec9e4238fba8714ee3be715de2cb41d9' then raise exception '104 unexpected writer: set_personal_topic_official_placement(uuid,uuid)'; end if;
end $preflight$;
-- Sole approved exception is created as postgres, then explicitly ACL-restricted.
create function public.position_library_node_in_library(
 p_library_id uuid,p_topic_id uuid,p_expected_parent_id uuid,p_destination_parent_id uuid,
 p_before_sibling_id uuid,p_expected_source_ids uuid[],p_expected_destination_ids uuid[]
) returns jsonb language plpgsql security definer set search_path='' as $official$
declare moving public.library_nodes%rowtype; source_ids uuid[]; destination_ids uuid[]; ordered_ids uuid[]; anchor integer; changed integer;
begin
 if auth.uid() is null or not public.is_editor_or_admin() then raise exception 'Official positioning requires editor or admin' using errcode='42501'; end if;
 if current_setting('transaction_isolation') <> 'read committed' then raise exception 'Positioning requires READ COMMITTED' using errcode='40001'; end if;
 perform pg_catalog.pg_advisory_xact_lock(104,20260927);
 select * into moving from public.library_nodes where id=p_topic_id for update;
 if moving.id is null or moving.library_id is distinct from p_library_id then raise exception 'Topic not found in requested Library' using errcode='22023'; end if;
 if moving.parent_id is null then raise exception 'Library root cannot be positioned' using errcode='22023'; end if;
 if moving.parent_id is distinct from p_expected_parent_id then raise exception 'Stale Topic parent' using errcode='40001'; end if;
 if not exists(select 1 from public.library_nodes where id=p_destination_parent_id and library_id=p_library_id) then raise exception 'Destination not in requested Library' using errcode='22023'; end if;
 if p_destination_parent_id=p_topic_id or exists(with recursive descendants as (
 select id from public.library_nodes where parent_id=p_topic_id
 union all select n.id from public.library_nodes n join descendants d on n.parent_id=d.id
 ) select 1 from descendants where id=p_destination_parent_id) then raise exception 'Topic cycle rejected' using errcode='22023'; end if;
 if exists(select 1 from public.library_nodes where library_id=p_library_id and parent_id=p_destination_parent_id and id<>p_topic_id and lower(btrim(name))=lower(btrim(moving.name))) then raise exception 'Duplicate sibling name' using errcode='23505'; end if;
 select coalesce(array_agg(id order by sort_order asc nulls last,name collate "C",id),'{}'::uuid[]) into source_ids from public.library_nodes where library_id=p_library_id and parent_id=p_expected_parent_id;
 select coalesce(array_agg(id order by sort_order asc nulls last,name collate "C",id),'{}'::uuid[]) into destination_ids from public.library_nodes where library_id=p_library_id and parent_id=p_destination_parent_id;
 if source_ids is distinct from p_expected_source_ids then raise exception 'Stale source sibling sequence' using errcode='40001'; end if;
 if destination_ids is distinct from p_expected_destination_ids then raise exception 'Stale destination sibling sequence' using errcode='40001'; end if;
 ordered_ids:=array_remove(destination_ids,p_topic_id);
 if p_before_sibling_id is null then anchor:=cardinality(ordered_ids)+1;
 else anchor:=array_position(ordered_ids,p_before_sibling_id); if anchor is null then raise exception 'Invalid before-sibling anchor' using errcode='22023'; end if; end if;
 ordered_ids:=coalesce(ordered_ids[1:anchor-1],'{}'::uuid[])||array[p_topic_id]||coalesce(ordered_ids[anchor:cardinality(ordered_ids)],'{}'::uuid[]);
 -- One UPDATE assigns the entire destination sequence, including reparenting.
 update public.library_nodes n set parent_id=p_destination_parent_id,sort_order=(o.ordinality-1)::integer
 from unnest(ordered_ids) with ordinality o(id,ordinality)
 where n.id=o.id and (n.parent_id is distinct from p_destination_parent_id or n.sort_order is distinct from (o.ordinality-1)::integer);
 get diagnostics changed=row_count;
 -- Statement trigger compacts the old group and preserves the explicit destination order.
 select coalesce(array_agg(id order by sort_order,name collate "C",id),'{}'::uuid[]) into source_ids from public.library_nodes where library_id=p_library_id and parent_id=p_expected_parent_id;
 return jsonb_build_object('topic_id',p_topic_id,'source_ids',source_ids,'destination_ids',ordered_ids,'destination_rows_updated',changed);
end $official$;
revoke all on function public.position_library_node_in_library(uuid,uuid,uuid,uuid,uuid,uuid[],uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.position_library_node_in_library(uuid,uuid,uuid,uuid,uuid,uuid[],uuid[]) to authenticated,postgres;

set local role socrates_migrator;

-- Child mode: both parents non-null and placement arguments null.
-- Root mode: both parents null; placement arguments identify presentation groups.
create function public.position_personal_topic(
 p_topic_id uuid,p_expected_parent_id uuid,p_destination_parent_id uuid,
 p_expected_official_node_id uuid,p_destination_official_node_id uuid,
 p_before_sibling_id uuid,p_expected_source_ids uuid[],p_expected_destination_ids uuid[]
) returns jsonb language plpgsql security invoker set search_path='' as $personal$
declare owner_id_value uuid:=auth.uid(); moving public.personal_topics%rowtype; current_placement uuid; source_ids uuid[]; destination_ids uuid[]; ordered_ids uuid[]; anchor integer; changed integer;
begin
 if owner_id_value is null or not public.has_socrates_role() then raise exception 'Approved owner required' using errcode='42501'; end if;
 if current_setting('transaction_isolation') <> 'read committed' then raise exception 'Positioning requires READ COMMITTED' using errcode='40001'; end if;
 perform pg_catalog.pg_advisory_xact_lock(104,20260927);
 select * into moving from public.personal_topics where id=p_topic_id and owner_id=owner_id_value for update;
 if moving.id is null then raise exception 'Personal Topic not found for owner' using errcode='42501'; end if;
 if moving.parent_id is distinct from p_expected_parent_id then raise exception 'Stale personal parent' using errcode='40001'; end if;
 if (moving.parent_id is null) <> (p_destination_parent_id is null) then raise exception 'Root-child conversion is not supported' using errcode='22023'; end if;
 if moving.parent_id is not null then
  if p_expected_official_node_id is not null or p_destination_official_node_id is not null then raise exception 'Child placement arguments must be null' using errcode='22023'; end if;
  if not exists(select 1 from public.personal_topics where id=p_destination_parent_id and owner_id=owner_id_value) then raise exception 'Destination not owned' using errcode='42501'; end if;
 else
  select library_node_id into current_placement from public.personal_topic_official_placements where personal_topic_id=p_topic_id and owner_id=owner_id_value;
  if current_placement is distinct from p_expected_official_node_id then raise exception 'Stale personal placement' using errcode='40001'; end if;
 end if;
 select coalesce(array_agg(t.id order by t.sort_order asc nulls last,t.name collate "C",t.id),'{}'::uuid[]) into source_ids
 from public.personal_topics t left join public.personal_topic_official_placements p on p.personal_topic_id=t.id and p.owner_id=t.owner_id
 where t.owner_id=owner_id_value and t.parent_id is not distinct from p_expected_parent_id and (t.parent_id is not null or p.library_node_id is not distinct from p_expected_official_node_id);
 select coalesce(array_agg(t.id order by t.sort_order asc nulls last,t.name collate "C",t.id),'{}'::uuid[]) into destination_ids
 from public.personal_topics t left join public.personal_topic_official_placements p on p.personal_topic_id=t.id and p.owner_id=t.owner_id
 where t.owner_id=owner_id_value and t.parent_id is not distinct from p_destination_parent_id and (t.parent_id is not null or p.library_node_id is not distinct from p_destination_official_node_id);
 if source_ids is distinct from p_expected_source_ids then raise exception 'Stale personal source sequence' using errcode='40001'; end if;
 if destination_ids is distinct from p_expected_destination_ids then raise exception 'Stale personal destination sequence' using errcode='40001'; end if;
 ordered_ids:=array_remove(destination_ids,p_topic_id);
 if p_before_sibling_id is null then anchor:=cardinality(ordered_ids)+1;
 else anchor:=array_position(ordered_ids,p_before_sibling_id);if anchor is null then raise exception 'Invalid personal anchor' using errcode='22023';end if;end if;
 ordered_ids:=coalesce(ordered_ids[1:anchor-1],'{}'::uuid[])||array[p_topic_id]||coalesce(ordered_ids[anchor:cardinality(ordered_ids)],'{}'::uuid[]);
 if moving.parent_id is null and p_expected_official_node_id is distinct from p_destination_official_node_id then
  -- Existing RPC performs active-Library/membership and root/owner checks.
  perform public.set_personal_topic_official_placement(p_topic_id,p_destination_official_node_id);
 end if;
 update public.personal_topics t set parent_id=p_destination_parent_id,sort_order=(o.ordinality-1)::integer
 from unnest(ordered_ids) with ordinality o(id,ordinality)
 where t.id=o.id and t.owner_id=owner_id_value and (t.parent_id is distinct from p_destination_parent_id or t.sort_order is distinct from (o.ordinality-1)::integer);
 get diagnostics changed=row_count;
 -- Existing constraints/parent trigger enforce cycles and duplicate owner names.
 return jsonb_build_object('topic_id',p_topic_id,'destination_ids',ordered_ids,'destination_rows_updated',changed);
end $personal$;
revoke all on function public.position_personal_topic(uuid,uuid,uuid,uuid,uuid,uuid,uuid[],uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.position_personal_topic(uuid,uuid,uuid,uuid,uuid,uuid,uuid[],uuid[]) to authenticated,postgres;

create function public.lock_topic_structure_before_write() returns trigger language plpgsql security invoker set search_path='' as $lock$
begin
 if current_setting('transaction_isolation') <> 'read committed' then raise exception 'Structural writes require READ COMMITTED' using errcode='40001'; end if;
 perform pg_catalog.pg_advisory_xact_lock(104,20260927);
 return null;
end $lock$;
revoke all on function public.lock_topic_structure_before_write() from public,anon,authenticated,service_role;
grant execute on function public.lock_topic_structure_before_write() to postgres;

create function public.normalize_topic_siblings_after_write() returns trigger language plpgsql security invoker set search_path='' as $normalize$
declare changes text; g record;
begin
 -- Transition relations are supplied by the fixed triggers, never browser SQL.
 -- Idempotent UPDATE ... IS DISTINCT FROM terminates recursion without a
 -- caller-settable bypass or skipping legitimate FK-cascade triggers.
 if tg_table_name='library_nodes' then
  changes:=case tg_op when 'INSERT' then 'select library_id,parent_id from new_rows' when 'DELETE' then 'select library_id,parent_id from old_rows' else 'select library_id,parent_id from new_rows union select library_id,parent_id from old_rows' end;
  for g in execute 'select distinct library_id,parent_id from ('||changes||') groups' loop
   with ranks as (select id,(row_number() over(order by sort_order asc nulls last,name collate "C",id)-1)::integer rank from public.library_nodes where library_id=g.library_id and parent_id is not distinct from g.parent_id)
   update public.library_nodes n set sort_order=r.rank from ranks r where n.id=r.id and n.sort_order is distinct from r.rank;
  end loop;
 elsif tg_table_name='personal_topics' then
  changes:=case tg_op when 'INSERT' then 'select owner_id,parent_id,id from new_rows' when 'DELETE' then 'select owner_id,parent_id,id from old_rows' else 'select owner_id,parent_id,id from new_rows union select owner_id,parent_id,id from old_rows' end;
  for g in execute 'select distinct c.owner_id,c.parent_id,p.library_node_id from ('||changes||') c left join public.personal_topic_official_placements p on c.parent_id is null and p.personal_topic_id=c.id and p.owner_id=c.owner_id' loop
   with ranks as (select t.id,(row_number() over(order by t.sort_order asc nulls last,t.name collate "C",t.id)-1)::integer rank from public.personal_topics t left join public.personal_topic_official_placements p on p.personal_topic_id=t.id and p.owner_id=t.owner_id where t.owner_id=g.owner_id and t.parent_id is not distinct from g.parent_id and (t.parent_id is not null or p.library_node_id is not distinct from g.library_node_id))
   update public.personal_topics t set sort_order=r.rank from ranks r where t.id=r.id and t.sort_order is distinct from r.rank;
  end loop;
 elsif tg_table_name='personal_topic_official_placements' then
  changes:=case tg_op when 'INSERT' then 'select owner_id,library_node_id from new_rows' when 'DELETE' then 'select owner_id,library_node_id from old_rows' else 'select owner_id,library_node_id from new_rows union select owner_id,library_node_id from old_rows' end;
  for g in execute 'select distinct owner_id,library_node_id from ('||changes||') c union select distinct owner_id,null::uuid from ('||changes||') c' loop
   with ranks as (select t.id,(row_number() over(order by t.sort_order asc nulls last,t.name collate "C",t.id)-1)::integer rank from public.personal_topics t left join public.personal_topic_official_placements p on p.personal_topic_id=t.id and p.owner_id=t.owner_id where t.owner_id=g.owner_id and t.parent_id is null and p.library_node_id is not distinct from g.library_node_id)
   update public.personal_topics t set sort_order=r.rank from ranks r where t.id=r.id and t.sort_order is distinct from r.rank;
  end loop;
 else raise exception 'Unexpected normalization relation';
 end if;
 return null;
end $normalize$;
revoke all on function public.normalize_topic_siblings_after_write() from public,anon,authenticated,service_role;
grant execute on function public.normalize_topic_siblings_after_write() to postgres;
reset role;

-- Preserve legacy contracts; add entry locking and refresh surviving Topic returns.
do $writers$
declare signature text; original text; changed text;
begin
 foreach signature in array array[
  'public.get_development_delete_summary(text,uuid)',
  'public._development_delete_group(uuid)',
  'public._development_delete_library(uuid)',
  'public.delete_development_content(text,uuid)',
  'public.set_library_organizer_status(uuid,text)',
  'public.delete_empty_library_node_in_library(uuid,uuid)',
  'public.rename_library_node_in_library(uuid,uuid,text)',
  'public._development_delete_library_node(uuid)',
  'public.archive_library_group(uuid)',
  'public.create_library_node_in_library(uuid,uuid,text,text,integer)',
  'public.create_library_group(uuid,text)',
  'public.create_library_with_root(uuid,text,text)',
  'public.create_personal_topic(text,uuid,uuid,integer)',
  'public.delete_empty_library(uuid)',
  'public.delete_empty_library_group(uuid)',
  'public.move_library_group(uuid,uuid)',
  'public.move_library_node_in_library(uuid,uuid,uuid)',
  'public.move_library_to_group(uuid,uuid)',
  'public.rename_library_group(uuid,text)',
  'public.rename_library_with_root(uuid,text)',
  'public.reorder_library_group(uuid,text)',
  'public.set_personal_topic_official_placement(uuid,uuid)'] loop
  original:=pg_get_functiondef(signature::regprocedure);
  changed:=regexp_replace(original,E'\nbegin\n',E'\nbegin\n  perform pg_catalog.pg_advisory_xact_lock(104,20260927);\n');
  if changed=original then raise exception 'Missing writer entry: %',signature;end if;
  case signature
   when 'public.create_library_node_in_library(uuid,uuid,text,text,integer)' then
    changed:=replace(changed,'  return created_node;',E'  select n.* into created_node from public.library_nodes n where n.id=created_node.id;\n  return created_node;');
   when 'public.move_library_node_in_library(uuid,uuid,uuid)' then
    changed:=replace(changed,'  return moved_node;',E'  select n.* into moved_node from public.library_nodes n where n.id=moved_node.id;\n  return moved_node;');
   when 'public.rename_library_node_in_library(uuid,uuid,text)' then
    changed:=replace(changed,'  return renamed_node;',E'  select n.* into renamed_node from public.library_nodes n where n.id=renamed_node.id;\n  return renamed_node;');
   when 'public.create_personal_topic(text,uuid,uuid,integer)' then
    changed:=replace(changed,E'  return query\n',E'  select t.* into saved_topic from public.personal_topics t where t.id=saved_topic.id and t.owner_id=caller_id;\n  return query\n');
   else null;
  end case;
  update m104_functions_before set expected_definition=changed where oid=signature::regprocedure;
  execute changed;
 end loop;
end $writers$;
create trigger m104_structure_lock before insert or update or delete on public.library_nodes for each statement execute function public.lock_topic_structure_before_write();
create trigger m104_structure_lock before insert or update or delete on public.personal_topics for each statement execute function public.lock_topic_structure_before_write();
create trigger m104_structure_lock before insert or update or delete on public.personal_topic_official_placements for each statement execute function public.lock_topic_structure_before_write();
create trigger m104_structure_lock before insert or update or delete on public.libraries for each statement execute function public.lock_topic_structure_before_write();
create trigger m104_structure_lock before insert or update or delete on public.library_groups for each statement execute function public.lock_topic_structure_before_write();
create trigger m104_structure_lock before insert or update or delete on public.library_group_libraries for each statement execute function public.lock_topic_structure_before_write();
create trigger m104_normalize_insert after insert on public.library_nodes referencing new table as new_rows for each statement execute function public.normalize_topic_siblings_after_write();
create trigger m104_normalize_update after update on public.library_nodes referencing old table as old_rows new table as new_rows for each statement execute function public.normalize_topic_siblings_after_write();
create trigger m104_normalize_delete after delete on public.library_nodes referencing old table as old_rows for each statement execute function public.normalize_topic_siblings_after_write();
create trigger m104_normalize_insert after insert on public.personal_topics referencing new table as new_rows for each statement execute function public.normalize_topic_siblings_after_write();
create trigger m104_normalize_update after update on public.personal_topics referencing old table as old_rows new table as new_rows for each statement execute function public.normalize_topic_siblings_after_write();
create trigger m104_normalize_delete after delete on public.personal_topics referencing old table as old_rows for each statement execute function public.normalize_topic_siblings_after_write();
create trigger m104_normalize_insert after insert on public.personal_topic_official_placements referencing new table as new_rows for each statement execute function public.normalize_topic_siblings_after_write();
create trigger m104_normalize_update after update on public.personal_topic_official_placements referencing old table as old_rows new table as new_rows for each statement execute function public.normalize_topic_siblings_after_write();
create trigger m104_normalize_delete after delete on public.personal_topic_official_placements referencing old table as old_rows for each statement execute function public.normalize_topic_siblings_after_write();

do $postflight$
declare item record;
begin
 for item in select b.*,p.proowner owner_after,p.proacl acl_after,pg_get_functiondef(p.oid) after_definition
 from m104_functions_before b join pg_proc p on p.oid=b.oid loop
  if item.proowner<>item.owner_after or item.proacl is distinct from item.acl_after then raise exception '104 changed existing function owner/ACL: %',item.oid::regprocedure; end if;
  if item.expected_definition<>item.after_definition then raise exception '104 unexpected writer definition: %',item.oid::regprocedure;end if;
 end loop;
 if exists(select 1 from m104_security_before b left join (
 select 'table' kind,oid::text key,md5(concat_ws('|',c.relowner::text,c.relacl::text,c.relrowsecurity::text,c.relforcerowsecurity::text)) hash from pg_class c where relnamespace='public'::regnamespace
 union all select 'policy',oid::text,md5(row_to_json(p)::text) from pg_policy p
 union all select 'default',oid::text,md5(row_to_json(d)::text) from pg_default_acl d
 union all select 'role',oid::text,md5(row_to_json(r)::text) from pg_roles r
 union all select 'membership',oid::text,md5(row_to_json(m)::text) from pg_auth_members m
 ) a using(kind,key) where a.hash is distinct from b.hash) then raise exception '104 changed protected security catalog';end if;
 for item in select * from pg_proc where pronamespace='public'::regnamespace and proname in ('position_library_node_in_library','position_personal_topic','lock_topic_structure_before_write','normalize_topic_siblings_after_write') loop
  if item.proconfig is distinct from array['search_path=""']::text[]
   or item.proowner <> (case when item.proname='position_library_node_in_library' then 'postgres'::regrole else 'socrates_migrator'::regrole end)
   or item.prosecdef <> (item.proname='position_library_node_in_library')
   or has_function_privilege('anon',item.oid,'EXECUTE') or has_function_privilege('service_role',item.oid,'EXECUTE')
   or has_function_privilege('authenticated',item.oid,'EXECUTE') <> (item.proname in ('position_library_node_in_library','position_personal_topic'))
   or exists(select 1 from aclexplode(item.proacl) a where a.grantee=0)
   then raise exception '104 new function security mismatch: %',item.oid::regprocedure;end if;
 end loop;
end $postflight$;
commit;
