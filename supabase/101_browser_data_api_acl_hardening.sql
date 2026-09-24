-- Checkpoint A: explicitly constrain browser/Data API privileges for the
-- canonical Socrates application tables and RPCs. This migration changes
-- ACLs only. It deliberately preserves service_role effective privileges,
-- owners, RLS, policies, function definitions, triggers, schema, and data.

begin;

create temporary table m101_table_contract (
  table_name text primary key,
  authenticated_operations text[] not null
) on commit drop;

insert into m101_table_contract (table_name, authenticated_operations) values
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

create temporary table m101_function_contract (
  function_signature text primary key,
  authenticated_execute boolean not null
) on commit drop;

insert into m101_function_contract (function_signature, authenticated_execute) values
  ('archive_catalog_tag(uuid)', true),
  ('archive_library_group(uuid)', true),
  ('archive_question(uuid)', true),
  ('create_article_core_concept(uuid,text,text,uuid,uuid[],text)', true),
  ('create_catalog_tag(text)', true),
  ('create_library_group(uuid,text)', true),
  ('create_library_node_in_library(uuid,uuid,text,text,integer)', true),
  ('create_library_with_root(uuid,text,text)', true),
  ('create_personal_concept_overlay(uuid,text,text,uuid,uuid,text)', true),
  ('create_personal_topic(text,uuid,uuid,integer)', true),
  ('delete_development_content(text,uuid)', true),
  ('end_study_session(uuid)', true),
  ('get_concept_prerequisites(uuid)', true),
  ('get_concept_tags(uuid)', true),
  ('get_creator_algorithm_diagnostics(uuid)', true),
  ('get_creator_questions(uuid,uuid)', true),
  ('get_development_delete_summary(text,uuid)', true),
  ('get_existing_home_study_bootstrap(uuid)', true),
  ('get_home_study_bootstrap(uuid,uuid)', true),
  ('get_library_learner_progress(uuid)', true),
  ('get_or_create_active_study_deck(uuid)', true),
  ('link_article_core_concept(uuid,uuid,text,text)', true),
  ('list_users_with_roles()', true),
  ('move_library_group(uuid,uuid)', true),
  ('move_library_node_in_library(uuid,uuid,uuid)', true),
  ('move_library_to_group(uuid,uuid)', true),
  ('provision_invited_learner(text)', true),
  ('reactivate_catalog_tag(uuid)', true),
  ('record_personal_study_attempt(uuid,uuid,uuid,uuid,text,uuid)', true),
  ('record_personal_study_attempt(uuid,uuid,uuid,uuid,text)', true),
  ('record_study_session_attempt(uuid,uuid,uuid,text,uuid)', true),
  ('record_study_session_attempt(uuid,uuid,uuid,text)', true),
  ('rename_catalog_tag(uuid,text)', true),
  ('rename_library_group(uuid,text)', true),
  ('rename_library_node_in_library(uuid,uuid,text)', true),
  ('rename_library_with_root(uuid,text)', true),
  ('reorder_library_group(uuid,text)', true),
  ('reset_study_progress(uuid,text,uuid,uuid)', true),
  ('resolve_study_candidates(uuid)', true),
  ('resolve_study_deck(uuid)', true),
  ('save_article_draft(uuid,text,text,text,uuid,uuid[],uuid,uuid[],boolean)', true),
  ('save_article_draft(uuid,text,text,text,uuid,uuid[],uuid,text[],boolean)', false),
  ('save_concept_with_prerequisites(uuid,text,text,uuid,uuid[],uuid[],text,jsonb,jsonb)', true),
  ('save_personal_concept_with_overlay(uuid,uuid,text,text,text,uuid,uuid)', true),
  ('save_question_with_relationships_v2(uuid,uuid,text,text,text,text,uuid,integer,text,text,jsonb,jsonb,uuid[],uuid[],uuid,uuid[],text[])', true),
  ('save_question_with_version(uuid,uuid,text,text,text,text,uuid,integer,text,text,jsonb,jsonb,uuid[],uuid[])', true),
  ('save_question_with_version(uuid,uuid,text,text,text,text,uuid,integer,text,text,jsonb,jsonb,uuid[])', false),
  ('search_creator_questions(uuid,text,text,text,text,uuid,uuid,text,uuid,integer,timestamp with time zone,uuid)', true),
  ('select_next_study_candidate(uuid,boolean)', true),
  ('set_library_organizer_status(uuid,text)', true),
  ('set_personal_topic_official_placement(uuid,uuid)', true),
  ('set_study_deck_node_selection(uuid,uuid,boolean)', true),
  ('set_user_role_by_email(text,text)', true),
  ('start_study_session_with_candidate(uuid,integer,uuid,boolean)', true),
  ('submit_study_card_feedback(uuid,uuid,uuid,text,text)', true),
  ('unlink_article_core_concept(uuid)', true),
  ('article_slug_from_title(text)', false),
  ('assert_question_publishable(uuid)', false),
  ('tag_slug_from_name(text)', false),
  ('delete_unused_source(uuid)', false),
  ('list_user_library_memberships()', false),
  ('resolve_user_study_plan(uuid)', false),
  ('set_user_primary_library(uuid,uuid)', false),
  ('get_my_role()', false),
  ('is_editor()', false),
  ('set_source_key()', false);

do $preflight$
declare
  missing_tables text;
  missing_functions text;
begin
  if (select count(*) from m101_table_contract) <> 65 then
    raise exception 'Migration 101 table contract must contain exactly 65 tables';
  end if;

  if (select count(*) from m101_function_contract) <> 66 then
    raise exception 'Migration 101 function contract must contain exactly 66 exact signatures';
  end if;

  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    raise exception 'Migration 101 requires anon, authenticated, and service_role database roles';
  end if;

  select string_agg(contract.table_name, ', ' order by contract.table_name)
  into missing_tables
  from m101_table_contract contract
  where to_regclass(format('public.%I', contract.table_name)) is null
     or not exists (
       select 1
       from pg_catalog.pg_class relation
       join pg_catalog.pg_namespace namespace_record
         on namespace_record.oid = relation.relnamespace
       where namespace_record.nspname = 'public'
         and relation.relname = contract.table_name
         and relation.relkind in ('r', 'p')
     );

  if missing_tables is not null then
    raise exception 'Migration 101 missing required application tables: %', missing_tables;
  end if;

  select string_agg(contract.function_signature, ', ' order by contract.function_signature)
  into missing_functions
  from m101_function_contract contract
  where to_regprocedure('public.' || contract.function_signature) is null;

  if missing_functions is not null then
    raise exception 'Migration 101 missing required exact function signatures: %', missing_functions;
  end if;
end;
$preflight$;

create temporary table m101_service_table_before (
  table_name text not null,
  privilege_name text not null,
  allowed boolean not null,
  primary key (table_name, privilege_name)
) on commit drop;

insert into m101_service_table_before (table_name, privilege_name, allowed)
select
  contract.table_name,
  privilege_name,
  has_table_privilege(
    'service_role',
    format('public.%I', contract.table_name),
    privilege_name
  )
from m101_table_contract contract
cross join unnest(array[
  'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
]) as privilege_name;

create temporary table m101_service_function_before (
  function_oid oid primary key,
  function_identity text not null,
  allowed boolean not null
) on commit drop;

insert into m101_service_function_before (function_oid, function_identity, allowed)
select
  function_record.oid,
  format(
    '%I.%I(%s)',
    namespace_record.nspname,
    function_record.proname,
    pg_get_function_identity_arguments(function_record.oid)
  ),
  has_function_privilege('service_role', function_record.oid, 'EXECUTE')
from pg_catalog.pg_proc function_record
join pg_catalog.pg_namespace namespace_record
  on namespace_record.oid = function_record.pronamespace
where namespace_record.nspname = 'public'
  and function_record.prokind = 'f';

create temporary table m101_relation_metadata_before on commit drop as
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
  coalesce((
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
  ), '[]'::jsonb) as columns,
  coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'name', constraint_record.conname,
        'type', constraint_record.contype,
        'definition', pg_get_constraintdef(constraint_record.oid, true)
      ) order by constraint_record.conname
    )
    from pg_catalog.pg_constraint constraint_record
    where constraint_record.conrelid = relation.oid
  ), '[]'::jsonb) as constraints,
  coalesce((
    select jsonb_agg(pg_get_indexdef(index_record.indexrelid) order by index_record.indexrelid)
    from pg_catalog.pg_index index_record
    where index_record.indrelid = relation.oid
  ), '[]'::jsonb) as indexes
from m101_table_contract contract
join pg_catalog.pg_class relation
  on relation.oid = format('public.%I', contract.table_name)::regclass;

create temporary table m101_function_metadata_before on commit drop as
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

create temporary table m101_trigger_metadata_before on commit drop as
select
  trigger_record.oid,
  trigger_record.tgrelid,
  trigger_record.tgfoid,
  trigger_record.tgenabled,
  pg_get_triggerdef(trigger_record.oid, true) as definition
from pg_catalog.pg_trigger trigger_record
join pg_catalog.pg_class relation
  on relation.oid = trigger_record.tgrelid
join pg_catalog.pg_namespace namespace_record
  on namespace_record.oid = relation.relnamespace
where namespace_record.nspname = 'public'
  and not trigger_record.tgisinternal;

create temporary table m101_row_counts_before (
  table_name text primary key,
  row_count bigint not null
) on commit drop;

do $snapshot_rows$
declare
  contract record;
  counted_rows bigint;
begin
  for contract in select table_name from m101_table_contract loop
    execute format('select count(*) from public.%I', contract.table_name)
      into counted_rows;
    insert into m101_row_counts_before values (contract.table_name, counted_rows);
  end loop;
end;
$snapshot_rows$;

create temporary table m101_legacy_data_before (
  table_name text primary key,
  row_count bigint not null,
  row_fingerprint text not null
) on commit drop;

do $snapshot_legacy$
declare
  legacy_table text;
  counted_rows bigint;
  fingerprint text;
begin
  foreach legacy_table in array array[
    'approved_domains',
    'concept_aliases',
    'content_flags',
    'learning_objects',
    'learning_object_concepts'
  ] loop
    execute format(
      'select count(*), coalesce(md5(string_agg(row_hash, '''' order by row_hash)), md5('''')) from (select md5(row_to_json(row_record)::text) as row_hash from public.%I row_record) rows',
      legacy_table
    ) into counted_rows, fingerprint;
    insert into m101_legacy_data_before values (
      legacy_table,
      counted_rows,
      fingerprint
    );
  end loop;
end;
$snapshot_legacy$;

do $apply_table_contract$
declare
  contract record;
begin
  for contract in
    select table_name, authenticated_operations
    from m101_table_contract
    order by table_name
  loop
    execute format(
      'revoke all privileges on table public.%I from public, anon, authenticated',
      contract.table_name
    );

    if cardinality(contract.authenticated_operations) > 0 then
      execute format(
        'grant %s on table public.%I to authenticated',
        array_to_string(contract.authenticated_operations, ', '),
        contract.table_name
      );
    end if;
  end loop;
end;
$apply_table_contract$;

do $apply_function_contract$
declare
  contract record;
  public_function record;
  trigger_function record;
begin
  -- PUBLIC and anon receive no direct execution on any current application
  -- function in the public schema. Authenticated execution is then set only
  -- for the exact covered signatures below; unlisted authenticated helper
  -- grants are left untouched because they support existing RLS internals.
  for public_function in
    select format(
      '%I.%I(%s)',
      namespace_record.nspname,
      function_record.proname,
      pg_get_function_identity_arguments(function_record.oid)
    ) as function_identity
    from pg_catalog.pg_proc function_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = function_record.pronamespace
    where namespace_record.nspname = 'public'
      and function_record.prokind = 'f'
  loop
    execute format(
      'revoke execute on function %s from public, anon',
      public_function.function_identity
    );
  end loop;

  for contract in
    select function_signature, authenticated_execute
    from m101_function_contract
    order by function_signature
  loop
    execute format(
      'revoke all privileges on function public.%s from public, anon, authenticated',
      contract.function_signature
    );

    if contract.authenticated_execute then
      execute format(
        'grant execute on function public.%s to authenticated',
        contract.function_signature
      );
    end if;
  end loop;

  for trigger_function in
    select
      format(
        '%I.%I(%s)',
        namespace_record.nspname,
        function_record.proname,
        pg_get_function_identity_arguments(function_record.oid)
      ) as function_identity
    from pg_catalog.pg_proc function_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = function_record.pronamespace
    where namespace_record.nspname = 'public'
      and function_record.prokind = 'f'
      and function_record.prorettype = 'pg_catalog.trigger'::regtype
  loop
    execute format(
      'revoke all privileges on function %s from public, anon, authenticated',
      trigger_function.function_identity
    );
  end loop;
end;
$apply_function_contract$;

-- Revoking PUBLIC may otherwise remove an effective service_role privilege
-- that was inherited only through PUBLIC. Restore exactly those effective
-- privileges that existed before this migration, without granting new ones.
do $restore_service_role$
declare
  table_privilege record;
  function_privilege record;
begin
  for table_privilege in
    select * from m101_service_table_before where allowed
  loop
    if not has_table_privilege(
      'service_role',
      format('public.%I', table_privilege.table_name),
      table_privilege.privilege_name
    ) then
      execute format(
        'grant %s on table public.%I to service_role',
        table_privilege.privilege_name,
        table_privilege.table_name
      );
    end if;
  end loop;

  for function_privilege in
    select * from m101_service_function_before where allowed
  loop
    if not has_function_privilege(
      'service_role',
      function_privilege.function_oid,
      'EXECUTE'
    ) then
      execute format(
        'grant execute on function %s to service_role',
        function_privilege.function_identity
      );
    end if;
  end loop;
end;
$restore_service_role$;

do $assert_contract$
declare
  mismatch text;
begin
  select string_agg(
    format('%s:%s expected=%s actual=%s', table_name, privilege_name, expected, actual),
    '; ' order by table_name, privilege_name
  ) into mismatch
  from (
    select
      contract.table_name,
      privilege_name,
      privilege_name = any(contract.authenticated_operations) as expected,
      has_table_privilege(
        'authenticated',
        format('public.%I', contract.table_name),
        privilege_name
      ) as actual
    from m101_table_contract contract
    cross join unnest(array[
      'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
    ]) as privilege_name
  ) checked
  where expected is distinct from actual;

  if mismatch is not null then
    raise exception 'Migration 101 authenticated table ACL mismatch: %', mismatch;
  end if;

  select string_agg(contract.table_name, ', ' order by contract.table_name)
  into mismatch
  from m101_table_contract contract
  where has_table_privilege(
    'anon',
    format('public.%I', contract.table_name),
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
  );

  if mismatch is not null then
    raise exception 'Migration 101 anon table access remains on: %', mismatch;
  end if;

  select string_agg(contract.table_name, ', ' order by contract.table_name)
  into mismatch
  from m101_table_contract contract
  join pg_catalog.pg_class relation
    on relation.oid = format('public.%I', contract.table_name)::regclass
  where exists (
    select 1
    from aclexplode(coalesce(relation.relacl, acldefault('r', relation.relowner))) acl
    where acl.grantee = 0
  );

  if mismatch is not null then
    raise exception 'Migration 101 PUBLIC table access remains on: %', mismatch;
  end if;

  select string_agg(
    format('%s expected=%s actual=%s', function_signature, expected, actual),
    '; ' order by function_signature
  ) into mismatch
  from (
    select
      contract.function_signature,
      contract.authenticated_execute as expected,
      has_function_privilege(
        'authenticated',
        to_regprocedure('public.' || contract.function_signature),
        'EXECUTE'
      ) as actual
    from m101_function_contract contract
  ) checked
  where expected is distinct from actual;

  if mismatch is not null then
    raise exception 'Migration 101 authenticated function ACL mismatch: %', mismatch;
  end if;

  select string_agg(contract.function_signature, ', ' order by contract.function_signature)
  into mismatch
  from m101_function_contract contract
  where has_function_privilege(
    'anon',
    to_regprocedure('public.' || contract.function_signature),
    'EXECUTE'
  );

  if mismatch is not null then
    raise exception 'Migration 101 anon function access remains on: %', mismatch;
  end if;

  select string_agg(contract.function_signature, ', ' order by contract.function_signature)
  into mismatch
  from m101_function_contract contract
  join pg_catalog.pg_proc function_record
    on function_record.oid = to_regprocedure('public.' || contract.function_signature)
  where exists (
    select 1
    from aclexplode(coalesce(function_record.proacl, acldefault('f', function_record.proowner))) acl
    where acl.grantee = 0
  );

  if mismatch is not null then
    raise exception 'Migration 101 PUBLIC function access remains on: %', mismatch;
  end if;

  select string_agg(
    format('%s expected=%s actual=%s', before.table_name || ':' || before.privilege_name, before.allowed, checked.allowed),
    '; ' order by before.table_name, before.privilege_name
  ) into mismatch
  from m101_service_table_before before
  cross join lateral (
    select has_table_privilege(
      'service_role',
      format('public.%I', before.table_name),
      before.privilege_name
    ) as allowed
  ) checked
  where before.allowed is distinct from checked.allowed;

  if mismatch is not null then
    raise exception 'Migration 101 changed service_role table privileges: %', mismatch;
  end if;

  select string_agg(before.function_identity, ', ' order by before.function_identity)
  into mismatch
  from m101_service_function_before before
  where before.allowed is distinct from has_function_privilege(
    'service_role', before.function_oid, 'EXECUTE'
  );

  if mismatch is not null then
    raise exception 'Migration 101 changed service_role function privileges: %', mismatch;
  end if;
end;
$assert_contract$;

do $assert_no_non_acl_drift$
declare
  mismatch text;
  counted_rows bigint;
  fingerprint text;
  legacy_before record;
begin
  select string_agg(before.table_name, ', ' order by before.table_name)
  into mismatch
  from m101_relation_metadata_before before
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
     or before.columns is distinct from coalesce((
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
     ), '[]'::jsonb)
     or before.constraints is distinct from coalesce((
       select jsonb_agg(
         jsonb_build_object(
           'name', constraint_record.conname,
           'type', constraint_record.contype,
           'definition', pg_get_constraintdef(constraint_record.oid, true)
         ) order by constraint_record.conname
       )
       from pg_catalog.pg_constraint constraint_record
       where constraint_record.conrelid = relation.oid
     ), '[]'::jsonb)
     or before.indexes is distinct from coalesce((
       select jsonb_agg(pg_get_indexdef(index_record.indexrelid) order by index_record.indexrelid)
       from pg_catalog.pg_index index_record
       where index_record.indrelid = relation.oid
     ), '[]'::jsonb);

  if mismatch is not null then
    raise exception 'Migration 101 changed table schema, owner, RLS, or policies: %', mismatch;
  end if;

  select string_agg(before.function_identity, ', ' order by before.function_identity)
  into mismatch
  from m101_function_metadata_before before
  join pg_catalog.pg_proc function_record on function_record.oid = before.oid
  where before.definition is distinct from pg_get_functiondef(function_record.oid)
     or before.proowner is distinct from function_record.proowner
     or before.prosecdef is distinct from function_record.prosecdef
     or before.proleakproof is distinct from function_record.proleakproof
     or before.provolatile is distinct from function_record.provolatile
     or before.proparallel is distinct from function_record.proparallel
     or before.proconfig is distinct from function_record.proconfig;

  if mismatch is not null then
    raise exception 'Migration 101 changed function definitions or execution properties: %', mismatch;
  end if;

  if exists (
    select oid, tgrelid, tgfoid, tgenabled, definition
    from m101_trigger_metadata_before
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
      and not trigger_record.tgisinternal
  ) or exists (
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
      and not trigger_record.tgisinternal
    except
    select oid, tgrelid, tgfoid, tgenabled, definition
    from m101_trigger_metadata_before
  ) then
    raise exception 'Migration 101 changed trigger bindings';
  end if;

  for legacy_before in select * from m101_legacy_data_before loop
    execute format(
      'select count(*), coalesce(md5(string_agg(row_hash, '''' order by row_hash)), md5('''')) from (select md5(row_to_json(row_record)::text) as row_hash from public.%I row_record) rows',
      legacy_before.table_name
    ) into counted_rows, fingerprint;

    if legacy_before.row_count is distinct from counted_rows
       or legacy_before.row_fingerprint is distinct from fingerprint then
      raise exception 'Migration 101 changed preserved legacy table data: %', legacy_before.table_name;
    end if;
  end loop;

  for legacy_before in select * from m101_row_counts_before loop
    execute format('select count(*) from public.%I', legacy_before.table_name)
      into counted_rows;
    if legacy_before.row_count is distinct from counted_rows then
      raise exception 'Migration 101 changed row count for table %', legacy_before.table_name;
    end if;
  end loop;
end;
$assert_no_non_acl_drift$;

notify pgrst, 'reload schema';

commit;
