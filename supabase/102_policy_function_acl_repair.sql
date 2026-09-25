-- Restore the one authenticated function privilege required by an active RLS
-- policy after Migration 101. This migration changes one ACL only. It does not
-- alter tables, RLS, policies, function definitions, triggers, or data.

begin;

create temporary table m102_table_contract (
  table_name text primary key,
  authenticated_operations text[] not null
) on commit drop;

insert into m102_table_contract (table_name, authenticated_operations) values
  ('approved_domains', '{}'::text[]),
  ('article_category_placements', '{SELECT}'::text[]),
  ('article_concepts', '{SELECT}'::text[]),
  ('article_sources', '{SELECT}'::text[]),
  ('article_tags', '{SELECT}'::text[]),
  ('article_versions', '{SELECT}'::text[]),
  ('articles', '{SELECT}'::text[]),
  ('concept_aliases', '{}'::text[]),
  ('concept_distinctions', '{SELECT}'::text[]),
  ('concept_placements', '{SELECT}'::text[]),
  ('concept_prerequisites', '{SELECT}'::text[]),
  ('concept_relationships', '{SELECT}'::text[]),
  ('concept_tags', '{SELECT}'::text[]),
  ('concept_versions', '{}'::text[]),
  ('concepts', '{SELECT}'::text[]),
  ('content_flags', '{}'::text[]),
  ('content_source_notes', '{SELECT}'::text[]),
  ('learn_sections', '{SELECT}'::text[]),
  ('learner_account_defaults', '{}'::text[]),
  ('learning_object_concepts', '{}'::text[]),
  ('learning_objects', '{}'::text[]),
  ('libraries', '{SELECT}'::text[]),
  ('library_group_libraries', '{SELECT}'::text[]),
  ('library_groups', '{SELECT}'::text[]),
  ('library_nodes', '{SELECT}'::text[]),
  ('personal_cards', '{SELECT,INSERT,UPDATE,DELETE}'::text[]),
  ('personal_collection_cards', '{SELECT,INSERT,DELETE}'::text[]),
  ('personal_collections', '{SELECT,INSERT,UPDATE,DELETE}'::text[]),
  ('personal_concept_official_placements', '{SELECT,INSERT,UPDATE,DELETE}'::text[]),
  ('personal_concepts', '{SELECT,INSERT,UPDATE,DELETE}'::text[]),
  ('personal_review_attempts', '{SELECT}'::text[]),
  ('personal_topic_official_placements', '{SELECT,INSERT,UPDATE,DELETE}'::text[]),
  ('personal_topics', '{SELECT,INSERT,UPDATE,DELETE}'::text[]),
  ('question_accepted_answers', '{SELECT}'::text[]),
  ('question_additional_testing_angles', '{SELECT}'::text[]),
  ('question_options', '{SELECT}'::text[]),
  ('question_related_concepts', '{SELECT}'::text[]),
  ('question_sources', '{SELECT}'::text[]),
  ('question_tags', '{SELECT}'::text[]),
  ('question_versions', '{}'::text[]),
  ('questions', '{SELECT}'::text[]),
  ('review_attempts', '{SELECT,INSERT}'::text[]),
  ('sources', '{SELECT}'::text[]),
  ('study_candidate_flags', '{SELECT,INSERT,UPDATE,DELETE}'::text[]),
  ('study_card_feedback', '{SELECT}'::text[]),
  ('study_deck_node_exclusions', '{SELECT,DELETE}'::text[]),
  ('study_deck_node_preferences', '{SELECT,INSERT,UPDATE,DELETE}'::text[]),
  ('study_deck_personal_collection_selections', '{SELECT,INSERT,DELETE}'::text[]),
  ('study_deck_personal_topic_selections', '{SELECT,INSERT,UPDATE,DELETE}'::text[]),
  ('study_decks', '{SELECT,UPDATE}'::text[]),
  ('study_priority_source_policy', '{}'::text[]),
  ('study_progress_reset_concepts', '{SELECT}'::text[]),
  ('study_progress_resets', '{SELECT}'::text[]),
  ('study_response_submissions', '{}'::text[]),
  ('study_sessions', '{SELECT}'::text[]),
  ('tags', '{SELECT}'::text[]),
  ('user_concept_mastery', '{SELECT}'::text[]),
  ('user_concept_testing_angle_state', '{SELECT}'::text[]),
  ('user_libraries', '{SELECT}'::text[]),
  ('user_notes', '{SELECT,INSERT,UPDATE}'::text[]),
  ('user_personal_concept_state', '{SELECT}'::text[]),
  ('user_roles', '{SELECT}'::text[]),
  ('user_study_concept_overrides', '{SELECT,INSERT,UPDATE,DELETE}'::text[]),
  ('user_study_node_selections', '{SELECT,DELETE}'::text[]),
  ('user_submastery', '{SELECT}'::text[]);

create temporary table m102_function_contract (
  function_signature text primary key,
  authenticated_execute boolean not null,
  function_class text not null check (
    function_class in ('direct_application_rpc', 'policy_dependency', 'internal')
  )
) on commit drop;

insert into m102_function_contract values
  ('archive_catalog_tag(uuid)', true, 'direct_application_rpc'),
  ('archive_library_group(uuid)', true, 'direct_application_rpc'),
  ('archive_question(uuid)', true, 'direct_application_rpc'),
  ('create_article_core_concept(uuid,text,text,uuid,uuid[],text)', true, 'direct_application_rpc'),
  ('create_catalog_tag(text)', true, 'direct_application_rpc'),
  ('create_library_group(uuid,text)', true, 'direct_application_rpc'),
  ('create_library_node_in_library(uuid,uuid,text,text,integer)', true, 'direct_application_rpc'),
  ('create_library_with_root(uuid,text,text)', true, 'direct_application_rpc'),
  ('create_personal_concept_overlay(uuid,text,text,uuid,uuid,text)', true, 'direct_application_rpc'),
  ('create_personal_topic(text,uuid,uuid,integer)', true, 'direct_application_rpc'),
  ('delete_development_content(text,uuid)', true, 'direct_application_rpc'),
  ('end_study_session(uuid)', true, 'direct_application_rpc'),
  ('get_concept_prerequisites(uuid)', true, 'direct_application_rpc'),
  ('get_concept_tags(uuid)', true, 'direct_application_rpc'),
  ('get_creator_algorithm_diagnostics(uuid)', true, 'direct_application_rpc'),
  ('get_creator_questions(uuid,uuid)', true, 'direct_application_rpc'),
  ('get_development_delete_summary(text,uuid)', true, 'direct_application_rpc'),
  ('get_existing_home_study_bootstrap(uuid)', true, 'direct_application_rpc'),
  ('get_home_study_bootstrap(uuid,uuid)', true, 'direct_application_rpc'),
  ('get_library_learner_progress(uuid)', true, 'direct_application_rpc'),
  ('get_or_create_active_study_deck(uuid)', true, 'direct_application_rpc'),
  ('link_article_core_concept(uuid,uuid,text,text)', true, 'direct_application_rpc'),
  ('list_users_with_roles()', true, 'direct_application_rpc'),
  ('move_library_group(uuid,uuid)', true, 'direct_application_rpc'),
  ('move_library_node_in_library(uuid,uuid,uuid)', true, 'direct_application_rpc'),
  ('move_library_to_group(uuid,uuid)', true, 'direct_application_rpc'),
  ('provision_invited_learner(text)', true, 'direct_application_rpc'),
  ('reactivate_catalog_tag(uuid)', true, 'direct_application_rpc'),
  ('record_personal_study_attempt(uuid,uuid,uuid,uuid,text,uuid)', true, 'direct_application_rpc'),
  ('record_personal_study_attempt(uuid,uuid,uuid,uuid,text)', true, 'direct_application_rpc'),
  ('record_study_session_attempt(uuid,uuid,uuid,text,uuid)', true, 'direct_application_rpc'),
  ('record_study_session_attempt(uuid,uuid,uuid,text)', true, 'direct_application_rpc'),
  ('rename_catalog_tag(uuid,text)', true, 'direct_application_rpc'),
  ('rename_library_group(uuid,text)', true, 'direct_application_rpc'),
  ('rename_library_node_in_library(uuid,uuid,text)', true, 'direct_application_rpc'),
  ('rename_library_with_root(uuid,text)', true, 'direct_application_rpc'),
  ('reorder_library_group(uuid,text)', true, 'direct_application_rpc'),
  ('reset_study_progress(uuid,text,uuid,uuid)', true, 'direct_application_rpc'),
  ('resolve_study_candidates(uuid)', true, 'direct_application_rpc'),
  ('resolve_study_deck(uuid)', true, 'direct_application_rpc'),
  ('save_article_draft(uuid,text,text,text,uuid,uuid[],uuid,uuid[],boolean)', true, 'direct_application_rpc'),
  ('save_concept_with_prerequisites(uuid,text,text,uuid,uuid[],uuid[],text,jsonb,jsonb)', true, 'direct_application_rpc'),
  ('save_personal_concept_with_overlay(uuid,uuid,text,text,text,uuid,uuid)', true, 'direct_application_rpc'),
  ('save_question_with_relationships_v2(uuid,uuid,text,text,text,text,uuid,integer,text,text,jsonb,jsonb,uuid[],uuid[],uuid,uuid[],text[])', true, 'direct_application_rpc'),
  ('save_question_with_version(uuid,uuid,text,text,text,text,uuid,integer,text,text,jsonb,jsonb,uuid[],uuid[])', true, 'direct_application_rpc'),
  ('search_creator_questions(uuid,text,text,text,text,uuid,uuid,text,uuid,integer,timestamp with time zone,uuid)', true, 'direct_application_rpc'),
  ('select_next_study_candidate(uuid,boolean)', true, 'direct_application_rpc'),
  ('set_library_organizer_status(uuid,text)', true, 'direct_application_rpc'),
  ('set_personal_topic_official_placement(uuid,uuid)', true, 'direct_application_rpc'),
  ('set_study_deck_node_selection(uuid,uuid,boolean)', true, 'direct_application_rpc'),
  ('set_user_role_by_email(text,text)', true, 'direct_application_rpc'),
  ('start_study_session_with_candidate(uuid,integer,uuid,boolean)', true, 'direct_application_rpc'),
  ('submit_study_card_feedback(uuid,uuid,uuid,text,text)', true, 'direct_application_rpc'),
  ('unlink_article_core_concept(uuid)', true, 'direct_application_rpc'),
  ('has_socrates_role()', true, 'policy_dependency'),
  ('is_admin()', true, 'policy_dependency'),
  ('is_editor()', true, 'policy_dependency'),
  ('is_editor_or_admin()', true, 'policy_dependency'),
  ('article_slug_from_title(text)', false, 'internal'),
  ('assert_question_publishable(uuid)', false, 'internal'),
  ('tag_slug_from_name(text)', false, 'internal'),
  ('delete_unused_source(uuid)', false, 'internal'),
  ('list_user_library_memberships()', false, 'internal'),
  ('resolve_user_study_plan(uuid)', false, 'internal'),
  ('set_user_primary_library(uuid,uuid)', false, 'internal'),
  ('get_my_role()', false, 'internal'),
  ('save_article_draft(uuid,text,text,text,uuid,uuid[],uuid,text[],boolean)', false, 'internal'),
  ('save_question_with_version(uuid,uuid,text,text,text,text,uuid,integer,text,text,jsonb,jsonb,uuid[])', false, 'internal'),
  ('set_source_key()', false, 'internal');

create temporary table m102_expected_direct_policy_helpers (
  function_signature text primary key
) on commit drop;

insert into m102_expected_direct_policy_helpers values
  ('public.has_socrates_role()'),
  ('public.is_admin()'),
  ('public.is_editor()'),
  ('public.is_editor_or_admin()');

create temporary table m102_actual_direct_policy_helpers on commit drop as
select distinct format(
  '%I.%I(%s)',
  function_namespace.nspname,
  function_record.proname,
  pg_get_function_identity_arguments(function_record.oid)
) as function_signature
from pg_catalog.pg_policy policy_record
join pg_catalog.pg_class relation
  on relation.oid = policy_record.polrelid
join pg_catalog.pg_namespace relation_namespace
  on relation_namespace.oid = relation.relnamespace
join m102_table_contract contract
  on contract.table_name = relation.relname
join pg_catalog.pg_depend dependency
  on dependency.classid = 'pg_catalog.pg_policy'::regclass
 and dependency.objid = policy_record.oid
 and dependency.refclassid = 'pg_catalog.pg_proc'::regclass
join pg_catalog.pg_proc function_record
  on function_record.oid = dependency.refobjid
join pg_catalog.pg_namespace function_namespace
  on function_namespace.oid = function_record.pronamespace
where relation_namespace.nspname = 'public'
  and function_namespace.nspname = 'public';

create temporary table m102_actual_nested_policy_helpers on commit drop as
with direct_helpers as (
  select
    function_record.oid,
    function_record.proname,
    format(
      '%I.%I(%s)',
      function_namespace.nspname,
      function_record.proname,
      pg_get_function_identity_arguments(function_record.oid)
    ) as root_signature,
    pg_get_functiondef(function_record.oid) as definition
  from m102_actual_direct_policy_helpers direct_helper
  join pg_catalog.pg_proc function_record
    on function_record.oid = to_regprocedure(direct_helper.function_signature)
  join pg_catalog.pg_namespace function_namespace
    on function_namespace.oid = function_record.pronamespace
), referenced_names as (
  select
    direct_helper.root_signature,
    direct_helper.proname as root_name,
    match_record[1] as referenced_name
  from direct_helpers direct_helper
  cross join lateral regexp_matches(
    direct_helper.definition,
    'public\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\(',
    'g'
  ) match_record
)
select distinct
  referenced.root_signature,
  format(
    '%I.%I(%s)',
    nested_namespace.nspname,
    nested_function.proname,
    pg_get_function_identity_arguments(nested_function.oid)
  ) as nested_signature
from referenced_names referenced
join pg_catalog.pg_proc nested_function
  on nested_function.proname = referenced.referenced_name
join pg_catalog.pg_namespace nested_namespace
  on nested_namespace.oid = nested_function.pronamespace
where nested_namespace.nspname = 'public'
  and referenced.referenced_name <> referenced.root_name;

do $preflight$
declare
  mismatch_count bigint;
  observed_count bigint;
  authenticated_cells bigint;
  editor_record record;
  editor_body text;
begin
  if (select count(*) from m102_table_contract) <> 65 then
    raise exception 'Migration 102 requires the exact 65-table Migration 101 contract';
  end if;

  if (select count(*) from m102_function_contract) <> 69
     or (select count(*) from m102_function_contract where function_class = 'direct_application_rpc') <> 54
     or (select count(*) from m102_function_contract where function_class = 'policy_dependency') <> 4
     or (select count(*) from m102_function_contract where authenticated_execute) <> 58 then
    raise exception 'Migration 102 canonical function accounting must be 69 total, 54 direct RPCs, 4 policy helpers, and 58 authenticated-executable signatures';
  end if;

  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'postgres') then
    raise exception 'Migration 102 requires anon, authenticated, service_role, and postgres roles';
  end if;

  select count(*) into mismatch_count
  from m102_table_contract contract
  where to_regclass(format('public.%I', contract.table_name)) is null;
  if mismatch_count <> 0 then
    raise exception 'Migration 102 is missing % canonical tables', mismatch_count;
  end if;

  select count(*) into mismatch_count
  from m102_function_contract contract
  where to_regprocedure('public.' || contract.function_signature) is null;
  if mismatch_count <> 0 then
    raise exception 'Migration 102 is missing % canonical function signatures', mismatch_count;
  end if;

  select count(*) into mismatch_count
  from m102_table_contract contract
  cross join unnest(array[
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
  ]) privilege_name
  where has_table_privilege(
    'authenticated', format('public.%I', contract.table_name), privilege_name
  ) is distinct from (privilege_name = any(contract.authenticated_operations));
  if mismatch_count <> 0 then
    raise exception 'Migration 102 preflight found % authenticated table ACL mismatches', mismatch_count;
  end if;

  select count(*) into authenticated_cells
  from m102_table_contract contract
  cross join unnest(array[
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
  ]) privilege_name
  where has_table_privilege(
    'authenticated', format('public.%I', contract.table_name), privilege_name
  );
  if authenticated_cells <> 95 then
    raise exception 'Migration 102 requires exactly 95 authenticated table privilege cells, found %', authenticated_cells;
  end if;

  select count(*) into mismatch_count
  from m102_table_contract contract
  join pg_catalog.pg_class relation
    on relation.oid = format('public.%I', contract.table_name)::regclass
  where exists (
    select 1
    from aclexplode(coalesce(relation.relacl, acldefault('r', relation.relowner))) acl
    where acl.grantee = 0
  );
  if mismatch_count <> 0 then
    raise exception 'Migration 102 requires zero PUBLIC canonical table ACLs, found %', mismatch_count;
  end if;

  select count(*) into mismatch_count
  from m102_table_contract contract
  cross join unnest(array[
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
  ]) privilege_name
  where has_table_privilege(
    'anon', format('public.%I', contract.table_name), privilege_name
  );
  if mismatch_count <> 0 then
    raise exception 'Migration 102 requires zero anon canonical table privileges, found %', mismatch_count;
  end if;

  select count(*) into observed_count
  from m102_table_contract contract
  join pg_catalog.pg_class relation
    on relation.oid = format('public.%I', contract.table_name)::regclass
  where relation.relrowsecurity;
  if observed_count <> 65 then
    raise exception 'Migration 102 requires RLS on 65/65 canonical tables, found %', observed_count;
  end if;

  select count(*) into observed_count
  from pg_catalog.pg_policies policy_record
  join m102_table_contract contract
    on contract.table_name = policy_record.tablename
  where policy_record.schemaname = 'public';
  if observed_count <> 126 then
    raise exception 'Migration 102 requires exactly 126 canonical policies, found %', observed_count;
  end if;

  if exists (
    (select function_signature from m102_expected_direct_policy_helpers
     except
     select function_signature from m102_actual_direct_policy_helpers)
    union all
    (select function_signature from m102_actual_direct_policy_helpers
     except
     select function_signature from m102_expected_direct_policy_helpers)
  ) then
    raise exception 'Migration 102 direct RLS helper set differs from the audited four-helper contract';
  end if;

  if (select count(*) from m102_actual_nested_policy_helpers) <> 1
     or not exists (
       select 1
       from m102_actual_nested_policy_helpers
       where root_signature = 'public.is_editor()'
         and nested_signature = 'public.get_my_role()'
     ) then
    raise exception 'Migration 102 nested policy helper contract must be is_editor() -> get_my_role() only';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policy policy_record
    where policy_record.polrelid = 'public.library_nodes'::regclass
      and policy_record.polname = 'Editors can manage library nodes'
      and policy_record.polcmd = '*'
      and regexp_replace(
        pg_get_expr(policy_record.polqual, policy_record.polrelid), '\s', '', 'g'
      ) = 'is_editor()'
      and regexp_replace(
        pg_get_expr(policy_record.polwithcheck, policy_record.polrelid), '\s', '', 'g'
      ) = 'is_editor()'
  ) then
    raise exception 'Migration 102 requires the exact Editors can manage library nodes ALL policy';
  end if;

  select
    function_record.oid,
    pg_get_userbyid(function_record.proowner) as owner_name,
    function_record.prorettype,
    function_record.prosecdef,
    function_record.provolatile,
    function_record.proconfig,
    language_record.lanname,
    function_record.prosrc
  into editor_record
  from pg_catalog.pg_proc function_record
  join pg_catalog.pg_language language_record
    on language_record.oid = function_record.prolang
  where function_record.oid = 'public.is_editor()'::regprocedure;

  editor_body := regexp_replace(editor_record.prosrc, '\s', '', 'g');
  if editor_record.owner_name <> 'postgres'
     or editor_record.prorettype <> 'pg_catalog.bool'::regtype
     or not editor_record.prosecdef
     or editor_record.provolatile <> 'v'
     or editor_record.proconfig is distinct from array['search_path=public']::text[]
     or editor_record.lanname <> 'sql'
     or editor_body <> 'selectpublic.get_my_role()in(''admin'',''editor'');' then
    raise exception 'Migration 102 found unexpected public.is_editor() identity or definition';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc function_record
    where function_record.oid = 'public.is_editor()'::regprocedure
      and exists (
        select 1
        from aclexplode(coalesce(function_record.proacl, acldefault('f', function_record.proowner))) acl
        where acl.grantee = 0
      )
  )
     or has_function_privilege('anon', 'public.is_editor()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.is_editor()', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.is_editor()', 'EXECUTE') then
    raise exception 'Migration 102 requires is_editor() denied to PUBLIC/anon/authenticated and executable by service_role before repair';
  end if;

  if has_function_privilege('authenticated', 'public.get_my_role()', 'EXECUTE') then
    raise exception 'Migration 102 requires get_my_role() to remain unavailable directly to authenticated';
  end if;

  select count(*) into mismatch_count
  from pg_catalog.pg_proc function_record
  join pg_catalog.pg_namespace namespace_record
    on namespace_record.oid = function_record.pronamespace
  where namespace_record.nspname = 'public'
    and function_record.prokind = 'f'
    and exists (
      select 1
      from aclexplode(coalesce(function_record.proacl, acldefault('f', function_record.proowner))) acl
      where acl.grantee = 0
    );
  if mismatch_count <> 0 then
    raise exception 'Migration 102 requires zero PUBLIC public-schema function grants, found %', mismatch_count;
  end if;

  select count(*) into mismatch_count
  from pg_catalog.pg_proc function_record
  join pg_catalog.pg_namespace namespace_record
    on namespace_record.oid = function_record.pronamespace
  where namespace_record.nspname = 'public'
    and function_record.prokind = 'f'
    and has_function_privilege('anon', function_record.oid, 'EXECUTE');
  if mismatch_count <> 0 then
    raise exception 'Migration 102 requires zero anon public-schema function grants, found %', mismatch_count;
  end if;

  if to_regclass('public.personal_topic_official_placements') is null
     or not exists (
       select 1
       from pg_catalog.pg_constraint constraint_record
       where constraint_record.conrelid = 'public.personal_topic_official_placements'::regclass
         and constraint_record.conname = 'personal_topic_official_placements_root_owner_fkey'
         and constraint_record.contype = 'f'
     )
     or not exists (
       select 1
       from information_schema.columns column_record
       where column_record.table_schema = 'public'
         and column_record.table_name = 'personal_topics'
         and column_record.column_name = 'official_placement_is_root'
         and column_record.is_generated = 'ALWAYS'
     )
     or to_regprocedure('public.set_personal_topic_official_placement(uuid,uuid)') is null
     or to_regprocedure('public.create_personal_topic(text,uuid,uuid,integer)') is null then
    raise exception 'Migration 102 requires the unchanged Migration 099/100 contracts';
  end if;
end;
$preflight$;

create temporary table m102_service_table_before on commit drop as
select
  contract.table_name,
  privilege_name,
  has_table_privilege(
    'service_role', format('public.%I', contract.table_name), privilege_name
  ) as allowed
from m102_table_contract contract
cross join unnest(array[
  'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
]) privilege_name;

create temporary table m102_service_function_before on commit drop as
select
  function_record.oid,
  format(
    '%I.%I(%s)',
    namespace_record.nspname,
    function_record.proname,
    pg_get_function_identity_arguments(function_record.oid)
  ) as function_identity,
  has_function_privilege('service_role', function_record.oid, 'EXECUTE') as allowed
from pg_catalog.pg_proc function_record
join pg_catalog.pg_namespace namespace_record
  on namespace_record.oid = function_record.pronamespace
where namespace_record.nspname = 'public'
  and function_record.prokind = 'f';

create temporary table m102_relation_before on commit drop as
select
  contract.table_name,
  relation.relrowsecurity,
  relation.relforcerowsecurity,
  relation.relowner,
  relation.relkind,
  coalesce((
    select jsonb_agg(to_jsonb(policy_record) order by policy_record.policyname)
    from pg_catalog.pg_policies policy_record
    where policy_record.schemaname = 'public'
      and policy_record.tablename = contract.table_name
  ), '[]'::jsonb) as policies,
  md5(jsonb_build_object(
    'columns', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'attnum', attribute_record.attnum,
          'name', attribute_record.attname,
          'type', format_type(attribute_record.atttypid, attribute_record.atttypmod),
          'not_null', attribute_record.attnotnull,
          'generated', attribute_record.attgenerated,
          'identity', attribute_record.attidentity,
          'default', pg_get_expr(default_record.adbin, default_record.adrelid)
        ) order by attribute_record.attnum
      )
      from pg_catalog.pg_attribute attribute_record
      left join pg_catalog.pg_attrdef default_record
        on default_record.adrelid = attribute_record.attrelid
       and default_record.adnum = attribute_record.attnum
      where attribute_record.attrelid = relation.oid
        and attribute_record.attnum > 0
        and not attribute_record.attisdropped
    ), '[]'::jsonb),
    'constraints', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'name', constraint_record.conname,
          'type', constraint_record.contype,
          'definition', pg_get_constraintdef(constraint_record.oid, true)
        ) order by constraint_record.conname
      )
      from pg_catalog.pg_constraint constraint_record
      where constraint_record.conrelid = relation.oid
    ), '[]'::jsonb),
    'indexes', coalesce((
      select jsonb_agg(pg_get_indexdef(index_record.indexrelid) order by index_record.indexrelid)
      from pg_catalog.pg_index index_record
      where index_record.indrelid = relation.oid
    ), '[]'::jsonb)
  )::text) as schema_hash
from m102_table_contract contract
join pg_catalog.pg_class relation
  on relation.oid = format('public.%I', contract.table_name)::regclass;

create temporary table m102_function_before on commit drop as
select
  function_record.oid,
  format(
    '%I.%I(%s)',
    namespace_record.nspname,
    function_record.proname,
    pg_get_function_identity_arguments(function_record.oid)
  ) as function_identity,
  pg_get_functiondef(function_record.oid) as definition,
  function_record.proowner,
  function_record.prosecdef,
  function_record.proleakproof,
  function_record.provolatile,
  function_record.proparallel,
  function_record.proconfig
from pg_catalog.pg_proc function_record
join pg_catalog.pg_namespace namespace_record
  on namespace_record.oid = function_record.pronamespace
where namespace_record.nspname = 'public'
  and function_record.prokind = 'f';

create temporary table m102_trigger_before on commit drop as
select
  trigger_record.oid,
  trigger_record.tgrelid,
  trigger_record.tgfoid,
  trigger_record.tgenabled,
  pg_get_triggerdef(trigger_record.oid, true) as definition
from pg_catalog.pg_trigger trigger_record
join pg_catalog.pg_class relation on relation.oid = trigger_record.tgrelid
join pg_catalog.pg_namespace namespace_record on namespace_record.oid = relation.relnamespace
where namespace_record.nspname = 'public'
  and not trigger_record.tgisinternal;

create temporary table m102_data_before (
  table_name text primary key,
  row_count bigint not null,
  row_fingerprint text not null
) on commit drop;

do $snapshot_data$
declare
  contract record;
  counted_rows bigint;
  fingerprint text;
begin
  for contract in select table_name from m102_table_contract loop
    execute format(
      'select count(*), coalesce(md5(string_agg(row_hash, '''' order by row_hash)), md5('''')) from (select md5(row_to_json(row_record)::text) row_hash from public.%I row_record) rows',
      contract.table_name
    ) into counted_rows, fingerprint;
    insert into m102_data_before values (
      contract.table_name, counted_rows, fingerprint
    );
  end loop;
end;
$snapshot_data$;

grant execute on function public.is_editor() to authenticated;

do $postconditions$
declare
  mismatch_count bigint;
  authenticated_cells bigint;
  observed_count bigint;
  counted_rows bigint;
  fingerprint text;
  before_data record;
begin
  select count(*) into mismatch_count
  from m102_table_contract contract
  cross join unnest(array[
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
  ]) privilege_name
  where has_table_privilege(
    'authenticated', format('public.%I', contract.table_name), privilege_name
  ) is distinct from (privilege_name = any(contract.authenticated_operations));
  if mismatch_count <> 0 then
    raise exception 'Migration 102 changed % authenticated table ACL cells', mismatch_count;
  end if;

  select count(*) into authenticated_cells
  from m102_table_contract contract
  cross join unnest(array[
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
  ]) privilege_name
  where has_table_privilege(
    'authenticated', format('public.%I', contract.table_name), privilege_name
  );
  if authenticated_cells <> 95 then
    raise exception 'Migration 102 changed the 95-cell authenticated table contract to %', authenticated_cells;
  end if;

  select count(*) into mismatch_count
  from m102_table_contract contract
  join pg_catalog.pg_class relation
    on relation.oid = format('public.%I', contract.table_name)::regclass
  where exists (
    select 1
    from aclexplode(coalesce(relation.relacl, acldefault('r', relation.relowner))) acl
    where acl.grantee = 0
  );
  if mismatch_count <> 0 then
    raise exception 'Migration 102 introduced PUBLIC table ACLs';
  end if;

  select count(*) into mismatch_count
  from m102_table_contract contract
  cross join unnest(array[
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
  ]) privilege_name
  where has_table_privilege(
    'anon', format('public.%I', contract.table_name), privilege_name
  );
  if mismatch_count <> 0 then
    raise exception 'Migration 102 introduced anon table privileges';
  end if;

  select count(*) into mismatch_count
  from m102_function_contract contract
  where has_function_privilege(
    'authenticated',
    to_regprocedure('public.' || contract.function_signature),
    'EXECUTE'
  ) is distinct from contract.authenticated_execute;
  if mismatch_count <> 0 then
    raise exception 'Migration 102 expanded 69-signature function contract has % mismatches', mismatch_count;
  end if;

  select count(*) into mismatch_count
  from m102_expected_direct_policy_helpers helper
  where not has_function_privilege(
    'authenticated', to_regprocedure(helper.function_signature), 'EXECUTE'
  );
  if mismatch_count <> 0 then
    raise exception 'Migration 102 left % direct policy helpers unavailable to authenticated', mismatch_count;
  end if;

  if has_function_privilege('authenticated', 'public.get_my_role()', 'EXECUTE') then
    raise exception 'Migration 102 incorrectly exposed get_my_role() to authenticated';
  end if;

  select count(*) into mismatch_count
  from pg_catalog.pg_proc function_record
  join pg_catalog.pg_namespace namespace_record
    on namespace_record.oid = function_record.pronamespace
  where namespace_record.nspname = 'public'
    and function_record.prokind = 'f'
    and exists (
      select 1
      from aclexplode(coalesce(function_record.proacl, acldefault('f', function_record.proowner))) acl
      where acl.grantee = 0
    );
  if mismatch_count <> 0 then
    raise exception 'Migration 102 introduced PUBLIC function EXECUTE';
  end if;

  select count(*) into mismatch_count
  from pg_catalog.pg_proc function_record
  join pg_catalog.pg_namespace namespace_record
    on namespace_record.oid = function_record.pronamespace
  where namespace_record.nspname = 'public'
    and function_record.prokind = 'f'
    and has_function_privilege('anon', function_record.oid, 'EXECUTE');
  if mismatch_count <> 0 then
    raise exception 'Migration 102 introduced anon function EXECUTE';
  end if;

  select count(*) into mismatch_count
  from m102_service_table_before before
  where before.allowed is distinct from has_table_privilege(
    'service_role', format('public.%I', before.table_name), before.privilege_name
  );
  if mismatch_count <> 0 then
    raise exception 'Migration 102 changed % service_role table privilege cells', mismatch_count;
  end if;

  select count(*) into mismatch_count
  from m102_service_function_before before
  where before.allowed is distinct from has_function_privilege(
    'service_role', before.oid, 'EXECUTE'
  );
  if mismatch_count <> 0 then
    raise exception 'Migration 102 changed % service_role function privileges', mismatch_count;
  end if;

  select count(*) into mismatch_count
  from m102_relation_before before
  join pg_catalog.pg_class relation
    on relation.oid = format('public.%I', before.table_name)::regclass
  where before.relrowsecurity is distinct from relation.relrowsecurity
     or before.relforcerowsecurity is distinct from relation.relforcerowsecurity
     or before.relowner is distinct from relation.relowner
     or before.relkind is distinct from relation.relkind
     or before.policies is distinct from coalesce((
       select jsonb_agg(to_jsonb(policy_record) order by policy_record.policyname)
       from pg_catalog.pg_policies policy_record
       where policy_record.schemaname = 'public'
         and policy_record.tablename = before.table_name
     ), '[]'::jsonb)
     or before.schema_hash is distinct from md5(jsonb_build_object(
       'columns', coalesce((
         select jsonb_agg(
           jsonb_build_object(
             'attnum', attribute_record.attnum,
             'name', attribute_record.attname,
             'type', format_type(attribute_record.atttypid, attribute_record.atttypmod),
             'not_null', attribute_record.attnotnull,
             'generated', attribute_record.attgenerated,
             'identity', attribute_record.attidentity,
             'default', pg_get_expr(default_record.adbin, default_record.adrelid)
           ) order by attribute_record.attnum
         )
         from pg_catalog.pg_attribute attribute_record
         left join pg_catalog.pg_attrdef default_record
           on default_record.adrelid = attribute_record.attrelid
          and default_record.adnum = attribute_record.attnum
         where attribute_record.attrelid = relation.oid
           and attribute_record.attnum > 0
           and not attribute_record.attisdropped
       ), '[]'::jsonb),
       'constraints', coalesce((
         select jsonb_agg(
           jsonb_build_object(
             'name', constraint_record.conname,
             'type', constraint_record.contype,
             'definition', pg_get_constraintdef(constraint_record.oid, true)
           ) order by constraint_record.conname
         )
         from pg_catalog.pg_constraint constraint_record
         where constraint_record.conrelid = relation.oid
       ), '[]'::jsonb),
       'indexes', coalesce((
         select jsonb_agg(pg_get_indexdef(index_record.indexrelid) order by index_record.indexrelid)
         from pg_catalog.pg_index index_record
         where index_record.indrelid = relation.oid
       ), '[]'::jsonb)
     )::text);
  if mismatch_count <> 0 then
    raise exception 'Migration 102 changed % table/RLS/policy definitions', mismatch_count;
  end if;

  select count(*) into observed_count
  from m102_table_contract contract
  join pg_catalog.pg_class relation
    on relation.oid = format('public.%I', contract.table_name)::regclass
  where relation.relrowsecurity;
  if observed_count <> 65 then
    raise exception 'Migration 102 changed RLS coverage to %/65', observed_count;
  end if;

  select count(*) into observed_count
  from pg_catalog.pg_policies policy_record
  join m102_table_contract contract on contract.table_name = policy_record.tablename
  where policy_record.schemaname = 'public';
  if observed_count <> 126 then
    raise exception 'Migration 102 changed canonical policy count to %', observed_count;
  end if;

  select count(*) into mismatch_count
  from m102_function_before before
  full join (
    select
      function_record.oid,
      format(
        '%I.%I(%s)', namespace_record.nspname, function_record.proname,
        pg_get_function_identity_arguments(function_record.oid)
      ) as function_identity,
      pg_get_functiondef(function_record.oid) as definition,
      function_record.proowner,
      function_record.prosecdef,
      function_record.proleakproof,
      function_record.provolatile,
      function_record.proparallel,
      function_record.proconfig
    from pg_catalog.pg_proc function_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = function_record.pronamespace
    where namespace_record.nspname = 'public'
      and function_record.prokind = 'f'
  ) after using (oid)
  where before.oid is null
     or after.oid is null
     or before.function_identity is distinct from after.function_identity
     or before.definition is distinct from after.definition
     or before.proowner is distinct from after.proowner
     or before.prosecdef is distinct from after.prosecdef
     or before.proleakproof is distinct from after.proleakproof
     or before.provolatile is distinct from after.provolatile
     or before.proparallel is distinct from after.proparallel
     or before.proconfig is distinct from after.proconfig;
  if mismatch_count <> 0 then
    raise exception 'Migration 102 changed % function definitions or execution properties', mismatch_count;
  end if;

  select count(*) into mismatch_count
  from (
    (select * from m102_trigger_before
     except
     select
       trigger_record.oid,
       trigger_record.tgrelid,
       trigger_record.tgfoid,
       trigger_record.tgenabled,
       pg_get_triggerdef(trigger_record.oid, true)
     from pg_catalog.pg_trigger trigger_record
     join pg_catalog.pg_class relation on relation.oid = trigger_record.tgrelid
     join pg_catalog.pg_namespace namespace_record on namespace_record.oid = relation.relnamespace
     where namespace_record.nspname = 'public'
       and not trigger_record.tgisinternal)
    union all
    (select
       trigger_record.oid,
       trigger_record.tgrelid,
       trigger_record.tgfoid,
       trigger_record.tgenabled,
       pg_get_triggerdef(trigger_record.oid, true)
     from pg_catalog.pg_trigger trigger_record
     join pg_catalog.pg_class relation on relation.oid = trigger_record.tgrelid
     join pg_catalog.pg_namespace namespace_record on namespace_record.oid = relation.relnamespace
     where namespace_record.nspname = 'public'
       and not trigger_record.tgisinternal
     except
     select * from m102_trigger_before)
  ) changed_triggers;
  if mismatch_count <> 0 then
    raise exception 'Migration 102 changed % trigger bindings', mismatch_count;
  end if;

  for before_data in select * from m102_data_before loop
    execute format(
      'select count(*), coalesce(md5(string_agg(row_hash, '''' order by row_hash)), md5('''')) from (select md5(row_to_json(row_record)::text) row_hash from public.%I row_record) rows',
      before_data.table_name
    ) into counted_rows, fingerprint;
    if before_data.row_count is distinct from counted_rows
       or before_data.row_fingerprint is distinct from fingerprint then
      raise exception 'Migration 102 changed persistent data in %', before_data.table_name;
    end if;
  end loop;

  if to_regclass('public.personal_topic_official_placements') is null
     or to_regprocedure('public.set_personal_topic_official_placement(uuid,uuid)') is null
     or to_regprocedure('public.create_personal_topic(text,uuid,uuid,integer)') is null then
    raise exception 'Migration 102 changed Migration 099/100 contracts';
  end if;
end;
$postconditions$;

commit;
