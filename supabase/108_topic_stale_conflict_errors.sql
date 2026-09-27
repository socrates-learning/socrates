-- Migration 108: non-retryable stale structural conflicts for PostgREST 14.5.
-- Corrective candidate only; do not edit or rerun Migration 104.
-- PT409 means refresh authoritative state and retry intentionally. Never auto-retry.
-- The three READ COMMITTED guards are out of scope and remain unchanged.
BEGIN;
CREATE TEMP TABLE m108_functions_before ON COMMIT DROP AS
SELECT oid,proowner,proacl,pg_get_functiondef(oid) definition FROM pg_proc WHERE pronamespace='public'::regnamespace;
CREATE TEMP TABLE m108_security_before ON COMMIT DROP AS
SELECT 'table' kind,oid::text key,md5(row_to_json(c)::text) hash FROM pg_class c WHERE relnamespace='public'::regnamespace
UNION ALL SELECT 'policy',oid::text,md5(row_to_json(p)::text) FROM pg_policy p
UNION ALL SELECT 'default',oid::text,md5(row_to_json(d)::text) FROM pg_default_acl d
UNION ALL SELECT 'role',oid::text,md5(row_to_json(role_row)::text) FROM pg_roles role_row
UNION ALL SELECT 'membership',oid::text,md5(row_to_json(m)::text) FROM pg_auth_members m
UNION ALL SELECT 'trigger',oid::text,md5(row_to_json(t)::text) FROM pg_trigger t;
DO $preflight$
BEGIN
 IF current_user<>'postgres' OR session_user<>'postgres' THEN RAISE EXCEPTION '108 requires postgres installer'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='socrates_migrator' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolinherit AND NOT rolbypassrls)
 OR has_table_privilege('socrates_migrator','public.library_nodes','UPDATE')
 OR EXISTS(SELECT 1 FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a WHERE d.defaclrole='socrates_migrator'::regrole AND a.grantee<>d.defaclrole)
 THEN RAISE EXCEPTION '108 requires fail-closed 103 authority'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.position_library_node_in_library(uuid,uuid,uuid,uuid,uuid,uuid[],uuid[])') AND md5(pg_get_functiondef(oid))='5d7fad9ac4b32a548e8504a736235b97' AND proowner::regrole::text='postgres' AND proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}') THEN RAISE EXCEPTION '108 prerequisite mismatch: %','position_library_node_in_library(uuid,uuid,uuid,uuid,uuid,uuid[],uuid[])'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.position_personal_topic(uuid,uuid,uuid,uuid,uuid,uuid,uuid[],uuid[])') AND md5(pg_get_functiondef(oid))='a0f5c2355af784a49a12e677e00fc76d' AND proowner::regrole::text='socrates_migrator' AND proacl::text IS NOT DISTINCT FROM '{socrates_migrator=X/socrates_migrator,authenticated=X/socrates_migrator,postgres=X/socrates_migrator}') THEN RAISE EXCEPTION '108 prerequisite mismatch: %','position_personal_topic(uuid,uuid,uuid,uuid,uuid,uuid,uuid[],uuid[])'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.lock_topic_structure_before_write()') AND md5(pg_get_functiondef(oid))='0b85367f25677e16e06fa3ad965fa7f8' AND proowner::regrole::text='socrates_migrator' AND proacl::text IS NOT DISTINCT FROM '{socrates_migrator=X/socrates_migrator,postgres=X/socrates_migrator}') THEN RAISE EXCEPTION '108 prerequisite mismatch: %','lock_topic_structure_before_write()'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.normalize_topic_siblings_after_write()') AND md5(pg_get_functiondef(oid))='5e4ed73996c5629b46bf0194c527d66c' AND proowner::regrole::text='socrates_migrator' AND proacl::text IS NOT DISTINCT FROM '{socrates_migrator=X/socrates_migrator,postgres=X/socrates_migrator}') THEN RAISE EXCEPTION '108 prerequisite mismatch: %','normalize_topic_siblings_after_write()'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.get_development_delete_summary(text,uuid)') AND md5(pg_get_functiondef(oid))='6ddf3bff95a091336f88a91459b9a708' AND proowner::regrole::text='postgres' AND proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}') THEN RAISE EXCEPTION '108 prerequisite mismatch: %','get_development_delete_summary(text,uuid)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public._development_delete_group(uuid)') AND md5(pg_get_functiondef(oid))='e5279c1611274fb537afcb59a4030854' AND proowner::regrole::text='postgres' AND proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres}') THEN RAISE EXCEPTION '108 prerequisite mismatch: %','_development_delete_group(uuid)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public._development_delete_library(uuid)') AND md5(pg_get_functiondef(oid))='fb58caf520cd1e0b1276a913a26425fc' AND proowner::regrole::text='postgres' AND proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres}') THEN RAISE EXCEPTION '108 prerequisite mismatch: %','_development_delete_library(uuid)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.delete_development_content(text,uuid)') AND md5(pg_get_functiondef(oid))='ada3bc310e4335cfa84560b126c7e262' AND proowner::regrole::text='postgres' AND proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}') THEN RAISE EXCEPTION '108 prerequisite mismatch: %','delete_development_content(text,uuid)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.set_library_organizer_status(uuid,text)') AND md5(pg_get_functiondef(oid))='55cf90034a7766c1db2c8bad4bfff7e8' AND proowner::regrole::text='postgres' AND proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}') THEN RAISE EXCEPTION '108 prerequisite mismatch: %','set_library_organizer_status(uuid,text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.delete_empty_library_node_in_library(uuid,uuid)') AND md5(pg_get_functiondef(oid))='0cbbccf70b364bf2fb6f250377d41c36' AND proowner::regrole::text='postgres' AND proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}') THEN RAISE EXCEPTION '108 prerequisite mismatch: %','delete_empty_library_node_in_library(uuid,uuid)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.rename_library_node_in_library(uuid,uuid,text)') AND md5(pg_get_functiondef(oid))='e6fa23551623cf7ec79fecf3e4757b81' AND proowner::regrole::text='postgres' AND proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}') THEN RAISE EXCEPTION '108 prerequisite mismatch: %','rename_library_node_in_library(uuid,uuid,text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public._development_delete_library_node(uuid)') AND md5(pg_get_functiondef(oid))='a4830881f65def490ce9abf7611fc764' AND proowner::regrole::text='postgres' AND proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres}') THEN RAISE EXCEPTION '108 prerequisite mismatch: %','_development_delete_library_node(uuid)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.archive_library_group(uuid)') AND md5(pg_get_functiondef(oid))='819b8ca839f413cc47a9f74719ff7e84' AND proowner::regrole::text='postgres' AND proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}') THEN RAISE EXCEPTION '108 prerequisite mismatch: %','archive_library_group(uuid)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.create_library_node_in_library(uuid,uuid,text,text,integer)') AND md5(pg_get_functiondef(oid))='880e515cb5b9dcc02c7ae63b4957b0b7' AND proowner::regrole::text='postgres' AND proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}') THEN RAISE EXCEPTION '108 prerequisite mismatch: %','create_library_node_in_library(uuid,uuid,text,text,integer)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.create_library_group(uuid,text)') AND md5(pg_get_functiondef(oid))='11c3cb7ecbe084407bb4019abaff3075' AND proowner::regrole::text='postgres' AND proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}') THEN RAISE EXCEPTION '108 prerequisite mismatch: %','create_library_group(uuid,text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.create_library_with_root(uuid,text,text)') AND md5(pg_get_functiondef(oid))='42b832d1525c4065d1a5c644803767cc' AND proowner::regrole::text='postgres' AND proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}') THEN RAISE EXCEPTION '108 prerequisite mismatch: %','create_library_with_root(uuid,text,text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.create_personal_topic(text,uuid,uuid,integer)') AND md5(pg_get_functiondef(oid))='bf057617b3b828d536db526a12c11877' AND proowner::regrole::text='postgres' AND proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}') THEN RAISE EXCEPTION '108 prerequisite mismatch: %','create_personal_topic(text,uuid,uuid,integer)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.delete_empty_library(uuid)') AND md5(pg_get_functiondef(oid))='7cec42d422ac652e77966ceb19a02942' AND proowner::regrole::text='postgres' AND proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}') THEN RAISE EXCEPTION '108 prerequisite mismatch: %','delete_empty_library(uuid)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.delete_empty_library_group(uuid)') AND md5(pg_get_functiondef(oid))='08113384f9c0229d9fd0f91c95246760' AND proowner::regrole::text='postgres' AND proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}') THEN RAISE EXCEPTION '108 prerequisite mismatch: %','delete_empty_library_group(uuid)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.move_library_group(uuid,uuid)') AND md5(pg_get_functiondef(oid))='b4fddc9df2f4c9d85a179d011861a553' AND proowner::regrole::text='postgres' AND proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}') THEN RAISE EXCEPTION '108 prerequisite mismatch: %','move_library_group(uuid,uuid)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.move_library_node_in_library(uuid,uuid,uuid)') AND md5(pg_get_functiondef(oid))='5f268250b6e8296b6641c7f5784277bd' AND proowner::regrole::text='postgres' AND proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}') THEN RAISE EXCEPTION '108 prerequisite mismatch: %','move_library_node_in_library(uuid,uuid,uuid)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.move_library_to_group(uuid,uuid)') AND md5(pg_get_functiondef(oid))='28a4f91fc0a21587ba285a6a54abff7e' AND proowner::regrole::text='postgres' AND proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}') THEN RAISE EXCEPTION '108 prerequisite mismatch: %','move_library_to_group(uuid,uuid)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.rename_library_group(uuid,text)') AND md5(pg_get_functiondef(oid))='7afc636b6c49a91a54b6148f69467a5f' AND proowner::regrole::text='postgres' AND proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}') THEN RAISE EXCEPTION '108 prerequisite mismatch: %','rename_library_group(uuid,text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.rename_library_with_root(uuid,text)') AND md5(pg_get_functiondef(oid))='084c3cd45baa5a0625559e9277cdf1cf' AND proowner::regrole::text='postgres' AND proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}') THEN RAISE EXCEPTION '108 prerequisite mismatch: %','rename_library_with_root(uuid,text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.reorder_library_group(uuid,text)') AND md5(pg_get_functiondef(oid))='a7a7241359072b955275cec3b6acdde0' AND proowner::regrole::text='postgres' AND proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}') THEN RAISE EXCEPTION '108 prerequisite mismatch: %','reorder_library_group(uuid,text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.set_personal_topic_official_placement(uuid,uuid)') AND md5(pg_get_functiondef(oid))='78e63452fe615e36d8fff852d64407d4' AND proowner::regrole::text='postgres' AND proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}') THEN RAISE EXCEPTION '108 prerequisite mismatch: %','set_personal_topic_official_placement(uuid,uuid)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.validate_question_publish()') AND md5(pg_get_functiondef(oid))='293f86c1af5701c6afca7a3e80cd9518' AND proowner::regrole::text='postgres' AND proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres}') THEN RAISE EXCEPTION '108 prerequisite mismatch: %','validate_question_publish()'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.validate_question_child_publish()') AND md5(pg_get_functiondef(oid))='35f5f1461da2f25b8b3a8bd6b2b8ae98' AND proowner::regrole::text='postgres' AND proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres}') THEN RAISE EXCEPTION '108 prerequisite mismatch: %','validate_question_child_publish()'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.select_next_study_question_hardened(uuid,boolean)') AND md5(pg_get_functiondef(oid))='5774237a9890e1064d1bed53adfb9d4f' AND proowner::regrole::text='postgres' AND proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres}') THEN RAISE EXCEPTION '108 prerequisite mismatch: %','select_next_study_question_hardened(uuid,boolean)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.get_home_study_bootstrap(uuid,uuid)') AND md5(pg_get_functiondef(oid))='95eb3cf6b5baeb775efc9f6ffff9da1b' AND proowner::regrole::text='postgres' AND proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}') THEN RAISE EXCEPTION '108 prerequisite mismatch: %','get_home_study_bootstrap(uuid,uuid)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.get_library_official_availability_counts(uuid)') AND md5(pg_get_functiondef(oid))='f631afc2c50cd906c5f65bdc08805949' AND proowner::regrole::text='socrates_migrator' AND proacl::text IS NOT DISTINCT FROM '{socrates_migrator=X/socrates_migrator,authenticated=X/socrates_migrator,postgres=X/socrates_migrator}') THEN RAISE EXCEPTION '108 prerequisite mismatch: %','get_library_official_availability_counts(uuid)'; END IF;
END $preflight$;
SET LOCAL ROLE postgres;
CREATE OR REPLACE FUNCTION public.position_library_node_in_library(p_library_id uuid, p_topic_id uuid, p_expected_parent_id uuid, p_destination_parent_id uuid, p_before_sibling_id uuid, p_expected_source_ids uuid[], p_expected_destination_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare moving public.library_nodes%rowtype; source_ids uuid[]; destination_ids uuid[]; ordered_ids uuid[]; anchor integer; changed integer;
begin
 if auth.uid() is null or not public.is_editor_or_admin() then raise exception 'Official positioning requires editor or admin' using errcode='42501'; end if;
 if current_setting('transaction_isolation') <> 'read committed' then raise exception 'Positioning requires READ COMMITTED' using errcode='40001'; end if;
 perform pg_catalog.pg_advisory_xact_lock(104,20260927);
 select * into moving from public.library_nodes where id=p_topic_id for update;
 if moving.id is null or moving.library_id is distinct from p_library_id then raise exception 'Topic not found in requested Library' using errcode='22023'; end if;
 if moving.parent_id is null then raise exception 'Library root cannot be positioned' using errcode='22023'; end if;
 if moving.parent_id is distinct from p_expected_parent_id then raise exception 'Stale Topic parent' using errcode='PT409'; end if;
 if not exists(select 1 from public.library_nodes where id=p_destination_parent_id and library_id=p_library_id) then raise exception 'Destination not in requested Library' using errcode='22023'; end if;
 if p_destination_parent_id=p_topic_id or exists(with recursive descendants as (
 select id from public.library_nodes where parent_id=p_topic_id
 union all select n.id from public.library_nodes n join descendants d on n.parent_id=d.id
 ) select 1 from descendants where id=p_destination_parent_id) then raise exception 'Topic cycle rejected' using errcode='22023'; end if;
 if exists(select 1 from public.library_nodes where library_id=p_library_id and parent_id=p_destination_parent_id and id<>p_topic_id and lower(btrim(name))=lower(btrim(moving.name))) then raise exception 'Duplicate sibling name' using errcode='23505'; end if;
 select coalesce(array_agg(id order by sort_order asc nulls last,name collate "C",id),'{}'::uuid[]) into source_ids from public.library_nodes where library_id=p_library_id and parent_id=p_expected_parent_id;
 select coalesce(array_agg(id order by sort_order asc nulls last,name collate "C",id),'{}'::uuid[]) into destination_ids from public.library_nodes where library_id=p_library_id and parent_id=p_destination_parent_id;
 if source_ids is distinct from p_expected_source_ids then raise exception 'Stale source sibling sequence' using errcode='PT409'; end if;
 if destination_ids is distinct from p_expected_destination_ids then raise exception 'Stale destination sibling sequence' using errcode='PT409'; end if;
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
end $function$
;
RESET ROLE;
SET LOCAL ROLE socrates_migrator;
CREATE OR REPLACE FUNCTION public.position_personal_topic(p_topic_id uuid, p_expected_parent_id uuid, p_destination_parent_id uuid, p_expected_official_node_id uuid, p_destination_official_node_id uuid, p_before_sibling_id uuid, p_expected_source_ids uuid[], p_expected_destination_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare owner_id_value uuid:=auth.uid(); moving public.personal_topics%rowtype; current_placement uuid; source_ids uuid[]; destination_ids uuid[]; ordered_ids uuid[]; anchor integer; changed integer;
begin
 if owner_id_value is null or not public.has_socrates_role() then raise exception 'Approved owner required' using errcode='42501'; end if;
 if current_setting('transaction_isolation') <> 'read committed' then raise exception 'Positioning requires READ COMMITTED' using errcode='40001'; end if;
 perform pg_catalog.pg_advisory_xact_lock(104,20260927);
 select * into moving from public.personal_topics where id=p_topic_id and owner_id=owner_id_value for update;
 if moving.id is null then raise exception 'Personal Topic not found for owner' using errcode='42501'; end if;
 if moving.parent_id is distinct from p_expected_parent_id then raise exception 'Stale personal parent' using errcode='PT409'; end if;
 if (moving.parent_id is null) <> (p_destination_parent_id is null) then raise exception 'Root-child conversion is not supported' using errcode='22023'; end if;
 if moving.parent_id is not null then
  if p_expected_official_node_id is not null or p_destination_official_node_id is not null then raise exception 'Child placement arguments must be null' using errcode='22023'; end if;
  if not exists(select 1 from public.personal_topics where id=p_destination_parent_id and owner_id=owner_id_value) then raise exception 'Destination not owned' using errcode='42501'; end if;
 else
  select library_node_id into current_placement from public.personal_topic_official_placements where personal_topic_id=p_topic_id and owner_id=owner_id_value;
  if current_placement is distinct from p_expected_official_node_id then raise exception 'Stale personal placement' using errcode='PT409'; end if;
 end if;
 select coalesce(array_agg(t.id order by t.sort_order asc nulls last,t.name collate "C",t.id),'{}'::uuid[]) into source_ids
 from public.personal_topics t left join public.personal_topic_official_placements p on p.personal_topic_id=t.id and p.owner_id=t.owner_id
 where t.owner_id=owner_id_value and t.parent_id is not distinct from p_expected_parent_id and (t.parent_id is not null or p.library_node_id is not distinct from p_expected_official_node_id);
 select coalesce(array_agg(t.id order by t.sort_order asc nulls last,t.name collate "C",t.id),'{}'::uuid[]) into destination_ids
 from public.personal_topics t left join public.personal_topic_official_placements p on p.personal_topic_id=t.id and p.owner_id=t.owner_id
 where t.owner_id=owner_id_value and t.parent_id is not distinct from p_destination_parent_id and (t.parent_id is not null or p.library_node_id is not distinct from p_destination_official_node_id);
 if source_ids is distinct from p_expected_source_ids then raise exception 'Stale personal source sequence' using errcode='PT409'; end if;
 if destination_ids is distinct from p_expected_destination_ids then raise exception 'Stale personal destination sequence' using errcode='PT409'; end if;
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
end $function$
;
RESET ROLE;
DO $verify$
DECLARE r record; expected text;
BEGIN
 FOR r IN SELECT b.*,p.proowner owner_after,p.proacl acl_after,pg_get_functiondef(p.oid) after_definition FROM m108_functions_before b JOIN pg_proc p USING(oid) LOOP
  expected:=regexp_replace(r.definition,'(raise exception ''Stale[^'']*'' using errcode=)''40001''','\1''PT409''','g');
  IF r.oid NOT IN ('public.position_library_node_in_library(uuid,uuid,uuid,uuid,uuid,uuid[],uuid[])'::regprocedure,'public.position_personal_topic(uuid,uuid,uuid,uuid,uuid,uuid,uuid[],uuid[])'::regprocedure) THEN expected:=r.definition; END IF;
  IF r.after_definition<>expected OR r.proowner<>r.owner_after OR r.proacl IS DISTINCT FROM r.acl_after THEN RAISE EXCEPTION '108 unexpected function change: %',r.oid::regprocedure; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM m108_security_before b FULL JOIN (
 SELECT 'table' kind,oid::text key,md5(row_to_json(c)::text) hash FROM pg_class c WHERE relnamespace='public'::regnamespace
 UNION ALL SELECT 'policy',oid::text,md5(row_to_json(p)::text) FROM pg_policy p
 UNION ALL SELECT 'default',oid::text,md5(row_to_json(d)::text) FROM pg_default_acl d
 UNION ALL SELECT 'role',oid::text,md5(row_to_json(role_row)::text) FROM pg_roles role_row
 UNION ALL SELECT 'membership',oid::text,md5(row_to_json(m)::text) FROM pg_auth_members m
 UNION ALL SELECT 'trigger',oid::text,md5(row_to_json(t)::text) FROM pg_trigger t
 ) a USING(kind,key) WHERE a.hash IS DISTINCT FROM b.hash) THEN RAISE EXCEPTION '108 security contract changed'; END IF;
END $verify$;
COMMIT;
