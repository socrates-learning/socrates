-- LOCAL CANDIDATE: set-based suppression; local correctness/performance verified.
-- Migration 106: restore Algorithm v2 most-specific branch balance semantics.
-- Migration 104 remains reserved. Requires the exact through-105 selector contract.
-- Compatible with protected Migration 107; Home availability is unchanged.
-- Materialize Concept/ancestor suppression keys once, then anti-join coverage.
-- DISTINCT deduplicates suppression keys only; retained incomparable placements
-- still participate in the unchanged averaging and fallback CTE.
-- Only an existing postgres-owned function is replaced: no new application
-- object, owner change, grant, default privilege, index, or role change.
-- In accordance with Migration 103, future NEW application objects must instead
-- be created as socrates_migrator. CREATE OR REPLACE here preserves the OID/ACL.
-- The source hash makes this deliberately non-idempotent and rejects drift.

begin;

do $repair$
declare
  target_oid oid := to_regprocedure('public.select_next_study_question_hardened(uuid,boolean)');
  before_catalog jsonb;
  before_definition text;
  after_definition text;
  old_cte constant text := $old$
  most_specific_selected_nodes as (
    select covering.*
    from covering_selected_nodes covering
    left join selected_node_descendants descendant
      on descendant.ancestor_selected_node_id = covering.selected_node_id
    left join covering_selected_nodes more_specific
      on more_specific.concept_id = covering.concept_id
     and more_specific.selected_node_id = descendant.descendant_selected_node_id
    where more_specific.concept_id is null
  ),
$old$;
  new_cte constant text := $new$
  suppressed_selected_nodes as materialized (
    select distinct more_specific.concept_id,
      descendant.ancestor_selected_node_id as selected_node_id
    from selected_node_descendants descendant
    join covering_selected_nodes more_specific
      on more_specific.selected_node_id = descendant.descendant_selected_node_id
  ),
  most_specific_selected_nodes as (
    select covering.*
    from covering_selected_nodes covering
    left join suppressed_selected_nodes suppressed
      on suppressed.concept_id = covering.concept_id
     and suppressed.selected_node_id = covering.selected_node_id
    where suppressed.concept_id is null
  ),
$new$;
  migrator record;
begin
  if session_user <> 'postgres' or current_user <> 'postgres' then
    raise exception 'Migration 106 requires postgres';
  end if;
  select * into migrator from pg_catalog.pg_roles where rolname = 'socrates_migrator';
  if not found or migrator.rolcanlogin or migrator.rolsuper
     or migrator.rolinherit or migrator.rolcreaterole or migrator.rolcreatedb
     or migrator.rolreplication or migrator.rolbypassrls then
    raise exception 'Migration 103 fail-closed creator role is required';
  end if;
  if (select count(*) from pg_catalog.pg_auth_members where roleid=migrator.oid) <> 2
     or not exists (select 1 from pg_catalog.pg_auth_members
       where roleid=migrator.oid and member='postgres'::regrole
         and grantor='supabase_admin'::regrole and admin_option and not inherit_option and not set_option)
     or not exists (select 1 from pg_catalog.pg_auth_members
       where roleid=migrator.oid and member='postgres'::regrole
         and grantor='postgres'::regrole and not admin_option and not inherit_option and set_option) then
    raise exception 'Migration 103 PG17 membership contract is required';
  end if;
  if not exists (select 1 from pg_catalog.pg_proc
     where oid=to_regprocedure('public.validate_question_publish()') and prosecdef
       and md5(prosrc)='1948153dd1b8bca62397d5a3ce317c46')
     or not exists (select 1 from pg_catalog.pg_proc
     where oid=to_regprocedure('public.validate_question_child_publish()') and prosecdef
       and md5(prosrc)='a02d12cead4a4f8e324fcf57f0d2e14b') then
    raise exception 'Installed Migration 105 validation context is required';
  end if;
  if target_oid is null then
    raise exception 'Existing hardened selector is required; creation is forbidden';
  end if;
  select to_jsonb(p), pg_catalog.pg_get_functiondef(p.oid)
    into before_catalog, before_definition
    from pg_catalog.pg_proc p where p.oid=target_oid;
  if md5(before_definition) <> 'f9740751b4fac9ca99d11a8880f21334'
     or (before_catalog->>'proowner')::oid <> 'postgres'::regrole
     or before_catalog->'proacl' is distinct from '["postgres=X/postgres","service_role=X/postgres"]'::jsonb then
    raise exception 'Unexpected through-105 hardened selector definition/owner/ACL';
  end if;
  -- Remove the delimiter's leading newline; require exactly one exact CTE.
  if (length(before_definition)-length(replace(before_definition, substr(old_cte,2),'')))
       / length(substr(old_cte,2)) <> 1 then
    raise exception 'Expected most-specific CTE must occur exactly once';
  end if;
  execute replace(before_definition, substr(old_cte,2), substr(new_cte,2));
  select pg_catalog.pg_get_functiondef(target_oid) into after_definition;
  if md5(after_definition) <> '5774237a9890e1064d1bed53adfb9d4f'
     or after_definition <> replace(before_definition,substr(old_cte,2),substr(new_cte,2))
     or (select to_jsonb(p)-'prosrc' from pg_catalog.pg_proc p where p.oid=target_oid)
          is distinct from (before_catalog-'prosrc') then
    raise exception 'Migration 106 post-state mismatch; ownership, ACL and all other metadata must remain exact';
  end if;
end;
$repair$;

commit;
