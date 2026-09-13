-- Permit authenticated Socrates learners to inspect prerequisite information
-- for published official Concepts without broadening direct table visibility or
-- any prerequisite mutation authority. Editors/admins retain their complete
-- authoring view, including draft and archived Concepts.

begin;

do $migration$
begin
  if to_regprocedure('public.get_concept_prerequisites(uuid)') is null then
    raise exception 'Migration 094 requires get_concept_prerequisites(uuid)';
  end if;

  if to_regprocedure('public.sync_concept_prerequisites(uuid,uuid,jsonb)') is null
     or to_regprocedure(
       'public.save_concept_with_prerequisites(uuid,text,text,uuid,uuid[],uuid[],text,jsonb,jsonb)'
     ) is null then
    raise exception 'Migration 094 requires the existing prerequisite mutation contract';
  end if;

  if to_regprocedure('public.has_socrates_role()') is null
     or to_regprocedure('public.is_editor_or_admin()') is null then
    raise exception 'Migration 094 requires the existing Socrates role helpers';
  end if;

  if not exists (
    select 1
    from pg_policies policy_row
    where policy_row.schemaname = 'public'
      and policy_row.tablename = 'concept_prerequisites'
      and policy_row.policyname = 'Editors read concept prerequisites'
      and policy_row.cmd = 'SELECT'
      and policy_row.roles = array['authenticated']::name[]
      and policy_row.qual = 'is_editor_or_admin()'
  ) then
    raise exception 'Unexpected concept_prerequisites read policy';
  end if;
end;
$migration$;

create temporary table migration_094_baseline (
  sync_hash text not null,
  save_hash text not null,
  prerequisite_table_acl text,
  prerequisite_policies jsonb not null
) on commit drop;

insert into migration_094_baseline
select
  md5(pg_get_functiondef(
    'public.sync_concept_prerequisites(uuid,uuid,jsonb)'::regprocedure
  )),
  md5(pg_get_functiondef(
    'public.save_concept_with_prerequisites(uuid,text,text,uuid,uuid[],uuid[],text,jsonb,jsonb)'::regprocedure
  )),
  relation_row.relacl::text,
  coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'policyname', policy_row.policyname,
        'permissive', policy_row.permissive,
        'roles', policy_row.roles,
        'cmd', policy_row.cmd,
        'qual', policy_row.qual,
        'with_check', policy_row.with_check
      )
      order by policy_row.policyname
    )
    from pg_policies policy_row
    where policy_row.schemaname = 'public'
      and policy_row.tablename = 'concept_prerequisites'
  ), '[]'::jsonb)
from pg_class relation_row
join pg_namespace namespace_row
  on namespace_row.oid = relation_row.relnamespace
where namespace_row.nspname = 'public'
  and relation_row.relname = 'concept_prerequisites';

create or replace function public.get_concept_prerequisites(p_concept_id uuid)
returns table (
  id uuid,
  target_type text,
  target_id uuid,
  target_name text,
  strength text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise exception 'Authenticated user is required';
  end if;

  if not public.has_socrates_role() then
    raise exception 'A valid Socrates role is required';
  end if;

  -- Staff retain the complete authoring view from Migration 074, including
  -- prerequisites attached to draft and archived Concepts.
  if public.is_editor_or_admin() then
    return query
    select
      edge.id,
      case
        when edge.prerequisite_concept_id is not null then 'concept'
        else 'topic'
      end,
      coalesce(
        edge.prerequisite_concept_id,
        edge.prerequisite_library_node_id
      ),
      coalesce(target_concept.name, target_node.name),
      edge.strength
    from public.concept_prerequisites edge
    left join public.concepts target_concept
      on target_concept.id = edge.prerequisite_concept_id
    left join public.library_nodes target_node
      on target_node.id = edge.prerequisite_library_node_id
    where edge.concept_id = p_concept_id
    order by edge.created_at, edge.id;

    return;
  end if;

  -- Do not reveal whether an unpublished official Concept exists.
  if not exists (
    select 1
    from public.concepts source_concept
    where source_concept.id = p_concept_id
      and source_concept.status = 'published'
  ) then
    raise exception 'Published Concept was not found';
  end if;

  return query
  select
    edge.id,
    case
      when edge.prerequisite_concept_id is not null then 'concept'
      else 'topic'
    end,
    coalesce(
      edge.prerequisite_concept_id,
      edge.prerequisite_library_node_id
    ),
    coalesce(target_concept.name, target_node.name),
    edge.strength
  from public.concept_prerequisites edge
  left join public.concepts target_concept
    on target_concept.id = edge.prerequisite_concept_id
  left join public.library_nodes target_node
    on target_node.id = edge.prerequisite_library_node_id
  where edge.concept_id = p_concept_id
    and (
      (
        edge.prerequisite_concept_id is not null
        and target_concept.status = 'published'
        and exists (
          select 1
          from public.concept_placements source_placement
          join public.library_nodes source_node
            on source_node.id = source_placement.library_node_id
          join public.concept_placements target_placement
            on target_placement.concept_id = target_concept.id
          join public.library_nodes target_placement_node
            on target_placement_node.id = target_placement.library_node_id
           and target_placement_node.library_id = source_node.library_id
          join public.libraries shared_library
            on shared_library.id = source_node.library_id
           and shared_library.status = 'active'
          where source_placement.concept_id = p_concept_id
        )
      )
      or
      (
        edge.prerequisite_library_node_id is not null
        and exists (
          select 1
          from public.concept_placements source_placement
          join public.library_nodes source_node
            on source_node.id = source_placement.library_node_id
          join public.libraries shared_library
            on shared_library.id = source_node.library_id
           and shared_library.status = 'active'
          where source_placement.concept_id = p_concept_id
            and source_node.library_id = target_node.library_id
        )
      )
    )
  order by edge.created_at, edge.id;
end;
$$;

revoke all on function public.get_concept_prerequisites(uuid)
  from public, anon, authenticated;
grant execute on function public.get_concept_prerequisites(uuid)
  to authenticated, service_role, postgres;

do $migration$
declare
  baseline migration_094_baseline%rowtype;
  final_policies jsonb;
  public_execute boolean;
  function_security_definer boolean;
  function_volatility "char";
  function_config text[];
begin
  select * into strict baseline from migration_094_baseline;

  if md5(pg_get_functiondef(
       'public.sync_concept_prerequisites(uuid,uuid,jsonb)'::regprocedure
     )) <> baseline.sync_hash
     or md5(pg_get_functiondef(
       'public.save_concept_with_prerequisites(uuid,text,text,uuid,uuid[],uuid[],text,jsonb,jsonb)'::regprocedure
     )) <> baseline.save_hash then
    raise exception 'Migration 094 changed prerequisite mutation behavior';
  end if;

  if (
    select relation_row.relacl::text
    from pg_class relation_row
    join pg_namespace namespace_row
      on namespace_row.oid = relation_row.relnamespace
    where namespace_row.nspname = 'public'
      and relation_row.relname = 'concept_prerequisites'
  ) is distinct from baseline.prerequisite_table_acl then
    raise exception 'Migration 094 changed concept_prerequisites table grants';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'policyname', policy_row.policyname,
        'permissive', policy_row.permissive,
        'roles', policy_row.roles,
        'cmd', policy_row.cmd,
        'qual', policy_row.qual,
        'with_check', policy_row.with_check
      )
      order by policy_row.policyname
    ),
    '[]'::jsonb
  )
  into final_policies
  from pg_policies policy_row
  where policy_row.schemaname = 'public'
    and policy_row.tablename = 'concept_prerequisites';

  if final_policies <> baseline.prerequisite_policies then
    raise exception 'Migration 094 changed concept_prerequisites RLS policies';
  end if;

  select
    procedure_row.prosecdef,
    procedure_row.provolatile,
    procedure_row.proconfig,
    exists (
      select 1
      from aclexplode(coalesce(
        procedure_row.proacl,
        acldefault('f', procedure_row.proowner)
      )) acl
      where acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    )
  into
    function_security_definer,
    function_volatility,
    function_config,
    public_execute
  from pg_proc procedure_row
  where procedure_row.oid =
    'public.get_concept_prerequisites(uuid)'::regprocedure;

  if not function_security_definer
     or function_volatility <> 's'
     or function_config is distinct from array['search_path=""']::text[]
     or public_execute
     or has_function_privilege(
       'anon', 'public.get_concept_prerequisites(uuid)', 'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated', 'public.get_concept_prerequisites(uuid)', 'EXECUTE'
     )
     or not has_function_privilege(
       'service_role', 'public.get_concept_prerequisites(uuid)', 'EXECUTE'
     )
     or not has_function_privilege(
       'postgres', 'public.get_concept_prerequisites(uuid)', 'EXECUTE'
     ) then
    raise exception 'Unexpected final get_concept_prerequisites(uuid) security contract';
  end if;
end;
$migration$;

commit;
