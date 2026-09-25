-- Checkpoint B: establish a dedicated, fail-closed owner contract for future
-- Socrates application objects. Existing objects remain owned by postgres and
-- governed by Migrations 101 and 102.
--
-- Required convention for Migration 104+:
--   BEGIN
--   -> postgres preflight
--   -> SET LOCAL ROLE socrates_migrator
--   -> create application objects
--   -> enable RLS / create policies
--   -> explicit authenticated grants
--   -> explicit service_role grants only for named operational callers
--   -> owner-scoped assertions
--   -> RESET ROLE
--   -> postgres final assertions
--   -> COMMIT
--
-- Logical restores/environments applying post-103 migrations must bootstrap
-- this role contract before restoring or creating migrator-owned objects.

begin;

create temporary table m103_canonical_tables (
  table_name text primary key
) on commit drop;

insert into m103_canonical_tables values
  ('approved_domains'),
  ('article_category_placements'),
  ('article_concepts'),
  ('article_sources'),
  ('article_tags'),
  ('article_versions'),
  ('articles'),
  ('concept_aliases'),
  ('concept_distinctions'),
  ('concept_placements'),
  ('concept_prerequisites'),
  ('concept_relationships'),
  ('concept_tags'),
  ('concept_versions'),
  ('concepts'),
  ('content_flags'),
  ('content_source_notes'),
  ('learn_sections'),
  ('learner_account_defaults'),
  ('learning_object_concepts'),
  ('learning_objects'),
  ('libraries'),
  ('library_group_libraries'),
  ('library_groups'),
  ('library_nodes'),
  ('personal_cards'),
  ('personal_collection_cards'),
  ('personal_collections'),
  ('personal_concept_official_placements'),
  ('personal_concepts'),
  ('personal_review_attempts'),
  ('personal_topic_official_placements'),
  ('personal_topics'),
  ('question_accepted_answers'),
  ('question_additional_testing_angles'),
  ('question_options'),
  ('question_related_concepts'),
  ('question_sources'),
  ('question_tags'),
  ('question_versions'),
  ('questions'),
  ('review_attempts'),
  ('sources'),
  ('study_candidate_flags'),
  ('study_card_feedback'),
  ('study_deck_node_exclusions'),
  ('study_deck_node_preferences'),
  ('study_deck_personal_collection_selections'),
  ('study_deck_personal_topic_selections'),
  ('study_decks'),
  ('study_priority_source_policy'),
  ('study_progress_reset_concepts'),
  ('study_progress_resets'),
  ('study_response_submissions'),
  ('study_sessions'),
  ('tags'),
  ('user_concept_mastery'),
  ('user_concept_testing_angle_state'),
  ('user_libraries'),
  ('user_notes'),
  ('user_personal_concept_state'),
  ('user_roles'),
  ('user_study_concept_overrides'),
  ('user_study_node_selections'),
  ('user_submastery');

create temporary table m103_managed_schemas (
  schema_name text primary key
) on commit drop;

insert into m103_managed_schemas values
  ('auth'),
  ('storage'),
  ('realtime'),
  ('extensions'),
  ('vault'),
  ('graphql_public');

do $preflight$
declare
  missing_tables text;
  missing_schemas text;
  mismatch_count bigint;
  role_record pg_catalog.pg_roles%rowtype;
begin
  if session_user <> 'postgres' or current_user <> 'postgres' then
    raise exception 'Migration 103 must begin as postgres (session_user=%, current_user=%)', session_user, current_user;
  end if;

  select * into role_record from pg_catalog.pg_roles where rolname = 'postgres';
  if not found or role_record.rolsuper or not role_record.rolcreaterole then
    raise exception 'Migration 103 requires the Production-equivalent non-superuser postgres migration identity with CREATEROLE';
  end if;

  if to_regnamespace('public') is null
     or not has_schema_privilege('postgres', 'public', 'USAGE')
     or not has_schema_privilege('postgres', 'public', 'CREATE') then
    raise exception 'Migration 103 requires postgres USAGE and CREATE on public';
  end if;

  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'supabase_admin') then
    raise exception 'Migration 103 requires anon, authenticated, service_role, and supabase_admin roles';
  end if;

  if (select count(*) from m103_canonical_tables) <> 65 then
    raise exception 'Migration 103 canonical table manifest must contain exactly 65 tables';
  end if;

  select string_agg(table_name, ', ' order by table_name)
  into missing_tables
  from m103_canonical_tables
  where to_regclass(format('public.%I', table_name)) is null;

  if missing_tables is not null then
    raise exception 'Migration 103 requires the Migration 101 table baseline; missing: %', missing_tables;
  end if;

  select count(*) into mismatch_count
  from m103_canonical_tables manifest
  join pg_catalog.pg_class relation
    on relation.oid = format('public.%I', manifest.table_name)::regclass
  where not relation.relrowsecurity;

  if mismatch_count <> 0 then
    raise exception 'Migration 103 requires RLS on all 65 canonical tables; missing=%', mismatch_count;
  end if;

  select count(*) into mismatch_count
  from m103_canonical_tables manifest
  join pg_catalog.pg_class relation
    on relation.oid = format('public.%I', manifest.table_name)::regclass
  where exists (
    select 1
    from aclexplode(coalesce(relation.relacl, acldefault('r', relation.relowner))) acl
    where acl.grantee = 0
  );

  if mismatch_count <> 0 then
    raise exception 'Migration 103 requires zero PUBLIC canonical table ACLs; found=%', mismatch_count;
  end if;

  select count(*) into mismatch_count
  from m103_canonical_tables manifest
  cross join unnest(array[
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
  ]) privilege_name
  where has_table_privilege(
    'anon', format('public.%I', manifest.table_name), privilege_name
  );

  if mismatch_count <> 0 then
    raise exception 'Migration 103 requires zero anon canonical table privileges; found=%', mismatch_count;
  end if;

  select count(*) into mismatch_count
  from m103_canonical_tables manifest
  cross join unnest(array[
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
  ]) privilege_name
  where has_table_privilege(
    'authenticated', format('public.%I', manifest.table_name), privilege_name
  );

  if mismatch_count <> 95 then
    raise exception 'Migration 103 requires the Migration 101 authenticated table ACL baseline (expected 95 cells, found %)', mismatch_count;
  end if;

  select count(*) into mismatch_count
  from pg_catalog.pg_policy policy_record
  join pg_catalog.pg_class relation on relation.oid = policy_record.polrelid
  join pg_catalog.pg_namespace namespace_record on namespace_record.oid = relation.relnamespace
  join m103_canonical_tables manifest on manifest.table_name = relation.relname
  where namespace_record.nspname = 'public';

  if mismatch_count <> 126 then
    raise exception 'Migration 103 requires the Migration 101 policy baseline (expected 126 policies, found %)', mismatch_count;
  end if;

  if to_regprocedure('public.has_socrates_role()') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.is_editor()') is null
     or to_regprocedure('public.is_editor_or_admin()') is null
     or to_regprocedure('public.get_my_role()') is null
     or not has_function_privilege('authenticated', 'public.has_socrates_role()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.is_admin()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.is_editor()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.is_editor_or_admin()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.get_my_role()', 'EXECUTE') then
    raise exception 'Migration 103 requires the installed Migration 102 policy-helper execution contract';
  end if;

  if to_regclass('public.personal_topic_official_placements') is null
     or to_regprocedure('public.set_personal_topic_official_placement(uuid,uuid)') is null
     or to_regprocedure('public.create_personal_topic(text,uuid,uuid,integer)') is null then
    raise exception 'Migration 103 requires the installed Migration 099/100 contracts';
  end if;

  select string_agg(schema_name, ', ' order by schema_name)
  into missing_schemas
  from m103_managed_schemas
  where to_regnamespace(schema_name) is null;

  if missing_schemas is not null then
    raise exception 'Migration 103 requires the expected managed schemas: %', missing_schemas;
  end if;

  select count(*) into mismatch_count
  from m103_managed_schemas managed
  join pg_catalog.pg_namespace namespace_record
    on namespace_record.nspname = managed.schema_name
  where exists (
    select 1
    from aclexplode(coalesce(
      namespace_record.nspacl,
      acldefault('n', namespace_record.nspowner)
    )) acl
    where acl.grantee = 0
      and acl.privilege_type = 'CREATE'
  );

  if mismatch_count <> 0 then
    raise exception 'Migration 103 found PUBLIC CREATE on % managed schemas', mismatch_count;
  end if;

  -- If the role already exists, require the complete exact contract before
  -- allowing an idempotent re-run. Never repair partial/wrong configuration.
  select * into role_record
  from pg_catalog.pg_roles
  where rolname = 'socrates_migrator';

  if found then
    if role_record.rolsuper
       or role_record.rolinherit
       or role_record.rolcreaterole
       or role_record.rolcreatedb
       or role_record.rolcanlogin
       or role_record.rolreplication
       or role_record.rolbypassrls then
      raise exception 'Existing socrates_migrator role attributes differ from the exact contract';
    end if;

    if (select count(*) from pg_catalog.pg_auth_members membership
        where membership.roleid = 'socrates_migrator'::regrole) <> 2
       or (select count(*)
           from pg_catalog.pg_auth_members membership
           join pg_catalog.pg_roles grantor_role on grantor_role.oid = membership.grantor
           where membership.roleid = 'socrates_migrator'::regrole
             and membership.member = 'postgres'::regrole
             and membership.grantor <> 'postgres'::regrole
             and grantor_role.rolsuper
             and membership.admin_option
             and not membership.inherit_option
             and not membership.set_option) <> 1
       or (select count(*)
           from pg_catalog.pg_auth_members membership
           where membership.roleid = 'socrates_migrator'::regrole
             and membership.member = 'postgres'::regrole
             and membership.grantor = 'postgres'::regrole
             and not membership.admin_option
             and not membership.inherit_option
             and membership.set_option) <> 1
       or not exists (
         select 1 from pg_catalog.pg_auth_members membership
         where membership.roleid = 'socrates_migrator'::regrole
           and membership.member = 'postgres'::regrole
           and not membership.admin_option
           and not membership.inherit_option
           and membership.set_option
       )
       or exists (
         select 1 from pg_catalog.pg_auth_members membership
         where membership.member = 'socrates_migrator'::regrole
       ) then
      raise exception 'Existing socrates_migrator membership differs from the PostgreSQL 17 native administrative plus explicit SET-only contract';
    end if;

    if not has_schema_privilege('socrates_migrator', 'public', 'USAGE')
       or not has_schema_privilege('socrates_migrator', 'public', 'CREATE')
       or exists (
         select 1
         from pg_catalog.pg_namespace namespace_record
         where namespace_record.nspname <> 'public'
           and namespace_record.nspname not like 'pg_temp_%'
           and namespace_record.nspname not like 'pg_toast_temp_%'
           and has_schema_privilege('socrates_migrator', namespace_record.oid, 'CREATE')
       ) then
      raise exception 'Existing socrates_migrator schema authority differs from public-only contract';
    end if;

    if exists (
      select 1
      from pg_catalog.pg_default_acl default_acl
      cross join lateral aclexplode(default_acl.defaclacl) acl
      where default_acl.defaclrole = 'socrates_migrator'::regrole
        and (acl.grantee = 0 or acl.grantee <> 'socrates_migrator'::regrole)
    ) then
      raise exception 'Existing socrates_migrator default ACL contains a non-owner grant';
    end if;

    if exists (
      select 1
      from aclexplode(coalesce(
        (select default_acl.defaclacl
         from pg_catalog.pg_default_acl default_acl
         where default_acl.defaclrole = 'socrates_migrator'::regrole
           and default_acl.defaclnamespace = 0
           and default_acl.defaclobjtype = 'f'),
        acldefault('f', 'socrates_migrator'::regrole)
      )) acl
      where acl.grantee = 0
    ) then
      raise exception 'Existing socrates_migrator function default still grants PUBLIC EXECUTE';
    end if;
  end if;
end;
$preflight$;

-- Snapshot all boundaries that this migration must preserve.
create temporary table m103_postgres_defaults_before on commit drop as
select defaclnamespace, defaclobjtype, defaclacl
from pg_catalog.pg_default_acl
where defaclrole = 'postgres'::regrole;

create temporary table m103_supabase_admin_defaults_before on commit drop as
select defaclnamespace, defaclobjtype, defaclacl
from pg_catalog.pg_default_acl
where defaclrole = 'supabase_admin'::regrole;

create temporary table m103_managed_schemas_before on commit drop as
select namespace_record.oid, namespace_record.nspowner, namespace_record.nspacl
from pg_catalog.pg_namespace namespace_record
join m103_managed_schemas managed
  on managed.schema_name = namespace_record.nspname;

create temporary table m103_relations_before on commit drop as
select
  relation.oid,
  relation.relowner,
  relation.relacl,
  relation.relrowsecurity,
  relation.relforcerowsecurity,
  relation.relkind
from pg_catalog.pg_class relation
join pg_catalog.pg_namespace namespace_record
  on namespace_record.oid = relation.relnamespace
where namespace_record.nspname = 'public'
  and relation.relkind in ('r', 'p', 'S', 'v', 'm');

create temporary table m103_functions_before on commit drop as
select
  function_record.oid,
  function_record.proowner,
  function_record.proacl,
  md5(pg_get_functiondef(function_record.oid)) as definition_fingerprint
from pg_catalog.pg_proc function_record
join pg_catalog.pg_namespace namespace_record
  on namespace_record.oid = function_record.pronamespace
where namespace_record.nspname = 'public'
  and function_record.prokind = 'f';

create temporary table m103_policies_before on commit drop as
select
  policy_record.oid,
  md5(concat_ws('|', policy_record.polname, policy_record.polcmd,
    policy_record.polpermissive, policy_record.polroles::text,
    pg_get_expr(policy_record.polqual, policy_record.polrelid),
    pg_get_expr(policy_record.polwithcheck, policy_record.polrelid))) as fingerprint
from pg_catalog.pg_policy policy_record
join pg_catalog.pg_class relation on relation.oid = policy_record.polrelid
join pg_catalog.pg_namespace namespace_record on namespace_record.oid = relation.relnamespace
where namespace_record.nspname = 'public';

create temporary table m103_triggers_before on commit drop as
select
  trigger_record.oid,
  trigger_record.tgrelid,
  trigger_record.tgfoid,
  trigger_record.tgenabled,
  md5(pg_get_triggerdef(trigger_record.oid, true)) as fingerprint
from pg_catalog.pg_trigger trigger_record
join pg_catalog.pg_class relation on relation.oid = trigger_record.tgrelid
join pg_catalog.pg_namespace namespace_record on namespace_record.oid = relation.relnamespace
where namespace_record.nspname = 'public'
  and not trigger_record.tgisinternal;

do $create_role_if_absent$
begin
  if not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'socrates_migrator'
  ) then
    execute 'create role socrates_migrator nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls';
  end if;
end;
$create_role_if_absent$;

grant socrates_migrator to postgres with inherit false, set true;

-- PostgreSQL 17 gives a non-superuser CREATEROLE creator one automatic
-- ADMIN-only membership (SET=false, INHERIT=false). Socrates adds a distinct
-- SET-only membership (ADMIN=false, INHERIT=false). No other membership row is
-- allowed, and neither grant silently inherits migrator privileges.
do $membership_contract$
begin
  if (select count(*) from pg_catalog.pg_auth_members membership
      where membership.roleid = 'socrates_migrator'::regrole) <> 2
     or (select count(*)
         from pg_catalog.pg_auth_members membership
         join pg_catalog.pg_roles grantor_role on grantor_role.oid = membership.grantor
         where membership.roleid = 'socrates_migrator'::regrole
           and membership.member = 'postgres'::regrole
           and membership.grantor <> 'postgres'::regrole
           and grantor_role.rolsuper
           and membership.admin_option
           and not membership.inherit_option
           and not membership.set_option) <> 1
     or (select count(*)
         from pg_catalog.pg_auth_members membership
         where membership.roleid = 'socrates_migrator'::regrole
           and membership.member = 'postgres'::regrole
           and membership.grantor = 'postgres'::regrole
           and not membership.admin_option
           and not membership.inherit_option
           and membership.set_option) <> 1
     or exists (
       select 1 from pg_catalog.pg_auth_members membership
       where membership.member = 'socrates_migrator'::regrole
     ) then
    raise exception 'Migration 103 membership does not match the PostgreSQL 17 native administrative plus explicit SET-only contract';
  end if;

  if current_user <> 'postgres'
     or session_user <> 'postgres'
     or pg_has_role('postgres', 'socrates_migrator', 'USAGE')
     or not pg_has_role('postgres', 'socrates_migrator', 'SET') then
    raise exception 'Migration 103 requires non-inherited migrator privileges and deliberate SET ROLE capability';
  end if;
end;
$membership_contract$;

grant usage, create on schema public to socrates_migrator;

set local role socrates_migrator;

do $assert_migrator_role$
begin
  if session_user <> 'postgres' or current_user <> 'socrates_migrator' then
    raise exception 'Migration 103 failed to assume socrates_migrator (session_user=%, current_user=%)', session_user, current_user;
  end if;
end;
$assert_migrator_role$;

-- Configure only the current role's defaults. Using FOR ROLE here would fail
-- under Production's non-superuser postgres identity even though SET ROLE is
-- deliberately allowed.
alter default privileges
  revoke all privileges on tables from public, anon, authenticated, service_role;

alter default privileges
  revoke all privileges on sequences from public, anon, authenticated, service_role;

alter default privileges
  revoke execute on functions from anon, authenticated, service_role;

-- Must be last: if PostgreSQL collapses an empty explicit function-default
-- row, this recreates the owner-only override of built-in PUBLIC EXECUTE.
alter default privileges
  revoke execute on functions from public;

do $owner_scoped_default_assertions$
begin
  if current_user <> 'socrates_migrator' then
    raise exception 'Migration 103 owner-scoped assertions must execute as socrates_migrator';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_default_acl default_acl
    cross join lateral aclexplode(default_acl.defaclacl) acl
    where default_acl.defaclrole = current_user::regrole
      and acl.grantee <> current_user::regrole
  ) then
    raise exception 'Migration 103 owner-scoped default ACL contains a non-owner grant';
  end if;

  if exists (
    select 1
    from aclexplode(coalesce(
      (select default_acl.defaclacl
       from pg_catalog.pg_default_acl default_acl
       where default_acl.defaclrole = current_user::regrole
         and default_acl.defaclnamespace = 0
         and default_acl.defaclobjtype = 'f'),
      acldefault('f', current_user::regrole)
    )) acl
    where acl.grantee = 0
  ) then
    raise exception 'Migration 103 owner-scoped function defaults still grant PUBLIC EXECUTE';
  end if;
end;
$owner_scoped_default_assertions$;

reset role;

do $assert_postgres_role_restored$
begin
  if session_user <> 'postgres' or current_user <> 'postgres' then
    raise exception 'Migration 103 failed to restore postgres (session_user=%, current_user=%)', session_user, current_user;
  end if;
end;
$assert_postgres_role_restored$;

do $postconditions$
declare
  role_record pg_catalog.pg_roles%rowtype;
  mismatch_count bigint;
begin
  select * into strict role_record
  from pg_catalog.pg_roles
  where rolname = 'socrates_migrator';

  if role_record.rolsuper
     or role_record.rolinherit
     or role_record.rolcreaterole
     or role_record.rolcreatedb
     or role_record.rolcanlogin
     or role_record.rolreplication
     or role_record.rolbypassrls then
    raise exception 'Migration 103 role attributes do not match the exact contract';
  end if;

  if (select count(*) from pg_catalog.pg_auth_members membership
      where membership.roleid = 'socrates_migrator'::regrole) <> 2
     or (select count(*)
         from pg_catalog.pg_auth_members membership
         join pg_catalog.pg_roles grantor_role on grantor_role.oid = membership.grantor
         where membership.roleid = 'socrates_migrator'::regrole
           and membership.member = 'postgres'::regrole
           and membership.grantor <> 'postgres'::regrole
           and grantor_role.rolsuper
           and membership.admin_option
           and not membership.inherit_option
           and not membership.set_option) <> 1
     or (select count(*)
         from pg_catalog.pg_auth_members membership
         where membership.roleid = 'socrates_migrator'::regrole
           and membership.member = 'postgres'::regrole
           and membership.grantor = 'postgres'::regrole
           and not membership.admin_option
           and not membership.inherit_option
           and membership.set_option) <> 1
     or not exists (
       select 1 from pg_catalog.pg_auth_members membership
       where membership.roleid = 'socrates_migrator'::regrole
         and membership.member = 'postgres'::regrole
         and not membership.admin_option
         and not membership.inherit_option
         and membership.set_option
     )
     or exists (
       select 1 from pg_catalog.pg_auth_members membership
       where membership.member = 'socrates_migrator'::regrole
     ) then
    raise exception 'Migration 103 membership does not match the PostgreSQL 17 native administrative plus explicit SET-only contract';
  end if;

  if pg_has_role('postgres', 'socrates_migrator', 'USAGE')
     or not pg_has_role('postgres', 'socrates_migrator', 'SET') then
    raise exception 'Migration 103 membership unexpectedly inherits migrator privileges or cannot SET ROLE';
  end if;

  if not has_schema_privilege('socrates_migrator', 'public', 'USAGE')
     or not has_schema_privilege('socrates_migrator', 'public', 'CREATE')
     or exists (
       select 1
       from pg_catalog.pg_namespace namespace_record
       where namespace_record.nspname <> 'public'
         and namespace_record.nspname not like 'pg_temp_%'
         and namespace_record.nspname not like 'pg_toast_temp_%'
         and has_schema_privilege('socrates_migrator', namespace_record.oid, 'CREATE')
     ) then
    raise exception 'Migration 103 schema authority is not public-only';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_default_acl default_acl
    cross join lateral aclexplode(default_acl.defaclacl) acl
    where default_acl.defaclrole = 'socrates_migrator'::regrole
      and acl.grantee <> 'socrates_migrator'::regrole
  ) then
    raise exception 'Migration 103 default ACL contains a non-owner grant';
  end if;

  if exists (
    select 1
    from aclexplode(coalesce(
      (select default_acl.defaclacl
       from pg_catalog.pg_default_acl default_acl
       where default_acl.defaclrole = 'socrates_migrator'::regrole
         and default_acl.defaclnamespace = 0
         and default_acl.defaclobjtype = 'f'),
      acldefault('f', 'socrates_migrator'::regrole)
    )) acl
    where acl.grantee = 0
  ) then
    raise exception 'Migration 103 function defaults still grant PUBLIC EXECUTE';
  end if;

  select count(*) into mismatch_count
  from m103_postgres_defaults_before before_record
  full join (
    select defaclnamespace, defaclobjtype, defaclacl
    from pg_catalog.pg_default_acl
    where defaclrole = 'postgres'::regrole
  ) after_record using (defaclnamespace, defaclobjtype)
  where before_record.defaclnamespace is null
     or after_record.defaclnamespace is null
     or before_record.defaclacl is distinct from after_record.defaclacl;
  if mismatch_count <> 0 then
    raise exception 'Migration 103 changed % postgres default-privilege rows', mismatch_count;
  end if;

  select count(*) into mismatch_count
  from m103_supabase_admin_defaults_before before_record
  full join (
    select defaclnamespace, defaclobjtype, defaclacl
    from pg_catalog.pg_default_acl
    where defaclrole = 'supabase_admin'::regrole
  ) after_record using (defaclnamespace, defaclobjtype)
  where before_record.defaclnamespace is null
     or after_record.defaclnamespace is null
     or before_record.defaclacl is distinct from after_record.defaclacl;
  if mismatch_count <> 0 then
    raise exception 'Migration 103 changed % supabase_admin default-privilege rows', mismatch_count;
  end if;

  select count(*) into mismatch_count
  from m103_managed_schemas_before before_record
  full join (
    select namespace_record.oid, namespace_record.nspowner, namespace_record.nspacl
    from pg_catalog.pg_namespace namespace_record
    join m103_managed_schemas managed on managed.schema_name = namespace_record.nspname
  ) after_record using (oid)
  where before_record.oid is null
     or after_record.oid is null
     or before_record.nspowner is distinct from after_record.nspowner
     or before_record.nspacl is distinct from after_record.nspacl;
  if mismatch_count <> 0 then
    raise exception 'Migration 103 changed % managed-schema definitions', mismatch_count;
  end if;

  select count(*) into mismatch_count
  from m103_relations_before before_record
  full join (
    select relation.oid, relation.relowner, relation.relacl,
      relation.relrowsecurity, relation.relforcerowsecurity, relation.relkind
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace_record on namespace_record.oid = relation.relnamespace
    where namespace_record.nspname = 'public'
      and relation.relkind in ('r', 'p', 'S', 'v', 'm')
  ) after_record using (oid)
  where before_record.oid is null
     or after_record.oid is null
     or before_record.relowner is distinct from after_record.relowner
     or before_record.relacl is distinct from after_record.relacl
     or before_record.relrowsecurity is distinct from after_record.relrowsecurity
     or before_record.relforcerowsecurity is distinct from after_record.relforcerowsecurity
     or before_record.relkind is distinct from after_record.relkind;
  if mismatch_count <> 0 then
    raise exception 'Migration 103 changed % existing public relation contracts', mismatch_count;
  end if;

  select count(*) into mismatch_count
  from m103_functions_before before_record
  full join (
    select function_record.oid, function_record.proowner, function_record.proacl,
      md5(pg_get_functiondef(function_record.oid)) as definition_fingerprint
    from pg_catalog.pg_proc function_record
    join pg_catalog.pg_namespace namespace_record on namespace_record.oid = function_record.pronamespace
    where namespace_record.nspname = 'public'
      and function_record.prokind = 'f'
  ) after_record using (oid)
  where before_record.oid is null
     or after_record.oid is null
     or before_record.proowner is distinct from after_record.proowner
     or before_record.proacl is distinct from after_record.proacl
     or before_record.definition_fingerprint is distinct from after_record.definition_fingerprint;
  if mismatch_count <> 0 then
    raise exception 'Migration 103 changed % existing public function contracts', mismatch_count;
  end if;

  select count(*) into mismatch_count
  from m103_policies_before before_record
  full join (
    select policy_record.oid,
      md5(concat_ws('|', policy_record.polname, policy_record.polcmd,
        policy_record.polpermissive, policy_record.polroles::text,
        pg_get_expr(policy_record.polqual, policy_record.polrelid),
        pg_get_expr(policy_record.polwithcheck, policy_record.polrelid))) as fingerprint
    from pg_catalog.pg_policy policy_record
    join pg_catalog.pg_class relation on relation.oid = policy_record.polrelid
    join pg_catalog.pg_namespace namespace_record on namespace_record.oid = relation.relnamespace
    where namespace_record.nspname = 'public'
  ) after_record using (oid)
  where before_record.oid is null
     or after_record.oid is null
     or before_record.fingerprint is distinct from after_record.fingerprint;
  if mismatch_count <> 0 then
    raise exception 'Migration 103 changed % existing public policies', mismatch_count;
  end if;

  select count(*) into mismatch_count
  from m103_triggers_before before_record
  full join (
    select trigger_record.oid, trigger_record.tgrelid, trigger_record.tgfoid,
      trigger_record.tgenabled, md5(pg_get_triggerdef(trigger_record.oid, true)) as fingerprint
    from pg_catalog.pg_trigger trigger_record
    join pg_catalog.pg_class relation on relation.oid = trigger_record.tgrelid
    join pg_catalog.pg_namespace namespace_record on namespace_record.oid = relation.relnamespace
    where namespace_record.nspname = 'public'
      and not trigger_record.tgisinternal
  ) after_record using (oid)
  where before_record.oid is null
     or after_record.oid is null
     or before_record.tgrelid is distinct from after_record.tgrelid
     or before_record.tgfoid is distinct from after_record.tgfoid
     or before_record.tgenabled is distinct from after_record.tgenabled
     or before_record.fingerprint is distinct from after_record.fingerprint;
  if mismatch_count <> 0 then
    raise exception 'Migration 103 changed % existing public trigger contracts', mismatch_count;
  end if;
end;
$postconditions$;

commit;
