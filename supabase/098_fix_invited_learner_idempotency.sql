-- Fix invited-learner provisioning against the canonical user_id uniqueness
-- contract while preserving every other Migration 097 object and behavior.

begin;

create temporary table migration_098_baseline (
  old_function_definition text not null,
  old_function_acl aclitem[],
  old_function_owner oid not null,
  old_function_security_definer boolean not null,
  old_function_config text[],
  old_function_result text not null,
  protected_contract_fingerprint text not null
) on commit drop;

do $migration$
declare
  target_function_count integer;
  old_definition text;
  old_clause constant text :=
    'on conflict on constraint user_roles_pkey do nothing;';
  protected_fingerprint text;
begin
  select count(*)
  into target_function_count
  from pg_proc procedure_row
  join pg_namespace schema_row
    on schema_row.oid = procedure_row.pronamespace
  where schema_row.nspname = 'public'
    and procedure_row.proname = 'provision_invited_learner';

  if target_function_count <> 1
     or to_regprocedure('public.provision_invited_learner(text)') is null then
    raise exception
      'Migration 098 requires exactly public.provision_invited_learner(text); found % overload(s)',
      target_function_count;
  end if;

  if to_regclass('public.learner_account_defaults') is null
     or to_regprocedure(
       'public.set_learner_account_defaults_updated_at()'
     ) is null then
    raise exception 'Migration 097 learner-account objects are incomplete';
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.user_roles'::regclass
      and constraint_row.contype in ('p', 'u')
      and array(
        select attribute_row.attname::text
        from unnest(constraint_row.conkey)
          with ordinality as key_column(attribute_number, position)
        join pg_attribute attribute_row
          on attribute_row.attrelid = constraint_row.conrelid
         and attribute_row.attnum = key_column.attribute_number
        order by key_column.position
      ) = array['user_id']::text[]
  ) then
    raise exception
      'user_roles must enforce one unique role row per user_id';
  end if;

  if (select count(*) from public.learner_account_defaults) <> 1
     or not exists (
       select 1
       from public.learner_account_defaults account_default
       join public.libraries library_row
         on library_row.id = account_default.default_library_id
       where account_default.singleton = true
         and account_default.default_library_id =
           'fd6ba480-e665-4bfd-9f06-fe0f24ec4964'
         and library_row.name = 'Nursing'
         and library_row.slug = 'nursing'
         and library_row.status = 'active'
     ) then
    raise exception 'Canonical Nursing learner-account default has drifted';
  end if;

  select pg_get_functiondef(
    'public.provision_invited_learner(text)'::regprocedure
  )
  into old_definition;

  if (
    length(old_definition) - length(replace(old_definition, old_clause, ''))
  ) / length(old_clause) <> 1 then
    raise exception
      'Expected exactly one Migration 097 role-conflict clause before replacement';
  end if;

  if pg_get_function_identity_arguments(
       'public.provision_invited_learner(text)'::regprocedure
     ) <> 'target_email text'
     or pg_get_function_result(
       'public.provision_invited_learner(text)'::regprocedure
     ) <> 'TABLE(user_id uuid, email text, role text, library_id uuid, library_name text, library_slug text, is_primary boolean)'
     or not (
       select procedure_row.prosecdef
       from pg_proc procedure_row
       where procedure_row.oid =
         'public.provision_invited_learner(text)'::regprocedure
     )
     or not coalesce((
       select procedure_row.proconfig @> array['search_path=""']::text[]
       from pg_proc procedure_row
       where procedure_row.oid =
         'public.provision_invited_learner(text)'::regprocedure
     ), false) then
    raise exception 'Migration 097 provisioning RPC metadata has drifted';
  end if;

  if has_function_privilege(
       'public',
       'public.provision_invited_learner(text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.provision_invited_learner(text)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.provision_invited_learner(text)',
       'EXECUTE'
     ) then
    raise exception 'Migration 097 provisioning RPC ACL has drifted';
  end if;

  select md5(jsonb_build_object(
    'defaults_relation', (
      select jsonb_build_object(
        'oid', table_row.oid,
        'owner', table_row.relowner,
        'rls', table_row.relrowsecurity,
        'force_rls', table_row.relforcerowsecurity,
        'acl', to_jsonb(table_row.relacl)
      )
      from pg_class table_row
      where table_row.oid = 'public.learner_account_defaults'::regclass
    ),
    'defaults_columns', (
      select jsonb_agg(
        jsonb_build_object(
          'number', attribute_row.attnum,
          'name', attribute_row.attname,
          'type', format_type(
            attribute_row.atttypid,
            attribute_row.atttypmod
          ),
          'not_null', attribute_row.attnotnull,
          'default', pg_get_expr(
            default_row.adbin,
            default_row.adrelid
          )
        )
        order by attribute_row.attnum
      )
      from pg_attribute attribute_row
      left join pg_attrdef default_row
        on default_row.adrelid = attribute_row.attrelid
       and default_row.adnum = attribute_row.attnum
      where attribute_row.attrelid =
        'public.learner_account_defaults'::regclass
        and attribute_row.attnum > 0
        and not attribute_row.attisdropped
    ),
    'defaults_constraints', (
      select jsonb_agg(
        jsonb_build_object(
          'name', constraint_row.conname,
          'type', constraint_row.contype,
          'definition', pg_get_constraintdef(constraint_row.oid)
        )
        order by constraint_row.conname
      )
      from pg_constraint constraint_row
      where constraint_row.conrelid =
        'public.learner_account_defaults'::regclass
    ),
    'defaults_rows', (
      select jsonb_agg(to_jsonb(account_default) order by singleton)
      from public.learner_account_defaults account_default
    ),
    'defaults_policies', (
      select coalesce(
        jsonb_agg(to_jsonb(policy_row) order by policy_row.policyname),
        '[]'::jsonb
      )
      from pg_policies policy_row
      where policy_row.schemaname = 'public'
        and policy_row.tablename = 'learner_account_defaults'
    ),
    'updated_at_helper', (
      select jsonb_build_object(
        'definition', pg_get_functiondef(procedure_row.oid),
        'owner', procedure_row.proowner,
        'security_definer', procedure_row.prosecdef,
        'config', to_jsonb(procedure_row.proconfig),
        'acl', to_jsonb(procedure_row.proacl)
      )
      from pg_proc procedure_row
      where procedure_row.oid =
        'public.set_learner_account_defaults_updated_at()'::regprocedure
    ),
    'defaults_triggers', (
      select jsonb_agg(
        pg_get_triggerdef(trigger_row.oid)
        order by trigger_row.tgname
      )
      from pg_trigger trigger_row
      where trigger_row.tgrelid =
        'public.learner_account_defaults'::regclass
        and not trigger_row.tgisinternal
    ),
    'auth_user_provisioning_triggers', (
      select coalesce(
        jsonb_agg(
          pg_get_triggerdef(trigger_row.oid)
          order by trigger_row.tgname
        ),
        '[]'::jsonb
      )
      from pg_trigger trigger_row
      join pg_class table_row on table_row.oid = trigger_row.tgrelid
      join pg_namespace schema_row on schema_row.oid = table_row.relnamespace
      where schema_row.nspname = 'auth'
        and table_row.relname = 'users'
        and not trigger_row.tgisinternal
        and pg_get_triggerdef(trigger_row.oid)
          ilike '%provision_invited_learner%'
    )
  )::text)
  into protected_fingerprint;

  insert into migration_098_baseline (
    old_function_definition,
    old_function_acl,
    old_function_owner,
    old_function_security_definer,
    old_function_config,
    old_function_result,
    protected_contract_fingerprint
  )
  select
    old_definition,
    procedure_row.proacl,
    procedure_row.proowner,
    procedure_row.prosecdef,
    procedure_row.proconfig,
    pg_get_function_result(procedure_row.oid),
    protected_fingerprint
  from pg_proc procedure_row
  where procedure_row.oid =
    'public.provision_invited_learner(text)'::regprocedure;
end;
$migration$;

create or replace function public.provision_invited_learner(
  target_email text
)
returns table (
  user_id uuid,
  email text,
  role text,
  library_id uuid,
  library_name text,
  library_slug text,
  is_primary boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_user_id uuid;
  target_user_email text;
  target_role text;
  configured_library public.libraries%rowtype;
  membership public.user_libraries%rowtype;
begin
  if caller_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.user_roles caller_role
    where caller_role.user_id = caller_id
      and caller_role.role = 'admin'
  ) then
    raise exception 'Admin role required';
  end if;

  if nullif(btrim(coalesce(target_email, '')), '') is null then
    raise exception 'Target email is required';
  end if;

  select auth_user.id, auth_user.email::text
  into target_user_id, target_user_email
  from auth.users auth_user
  where lower(auth_user.email) = lower(btrim(target_email))
  order by auth_user.created_at, auth_user.id
  limit 1
  for update;

  if target_user_id is null then
    raise exception 'Invited Auth user not found';
  end if;

  if target_user_id = caller_id then
    raise exception 'Administrators cannot provision their own account';
  end if;

  select user_role.role
  into target_role
  from public.user_roles user_role
  where user_role.user_id = target_user_id;

  if target_role is not null and target_role <> 'learner' then
    raise exception 'Target user already has staff role: %', target_role;
  end if;

  select library_row.*
  into configured_library
  from public.learner_account_defaults account_default
  join public.libraries library_row
    on library_row.id = account_default.default_library_id
  where account_default.singleton = true
    and library_row.status = 'active'
  for share of account_default, library_row;

  if configured_library.id is null then
    raise exception 'No active default learner Library is configured';
  end if;

  insert into public.user_roles (user_id, role)
  values (target_user_id, 'learner')
  on conflict do nothing;

  select user_role.role
  into strict target_role
  from public.user_roles user_role
  where user_role.user_id = target_user_id;

  if target_role <> 'learner' then
    raise exception 'Target user has incompatible role: %', target_role;
  end if;

  insert into public.user_libraries (
    user_id,
    library_id,
    is_primary,
    assigned_by
  )
  values (
    target_user_id,
    configured_library.id,
    not exists (
      select 1
      from public.user_libraries existing_membership
      where existing_membership.user_id = target_user_id
        and existing_membership.is_primary = true
    ),
    caller_id
  )
  on conflict on constraint user_libraries_pkey
  do update set
    is_primary = case
      when not exists (
        select 1
        from public.user_libraries existing_primary
        where existing_primary.user_id = excluded.user_id
          and existing_primary.is_primary = true
          and existing_primary.library_id <> excluded.library_id
      ) then true
      else public.user_libraries.is_primary
    end,
    assigned_by = coalesce(public.user_libraries.assigned_by, excluded.assigned_by)
  returning * into membership;

  return query
  select
    target_user_id,
    target_user_email,
    target_role,
    configured_library.id,
    configured_library.name,
    configured_library.slug,
    membership.is_primary;
end;
$$;

do $migration$
declare
  baseline migration_098_baseline%rowtype;
  current_definition text;
  expected_definition text;
  current_acl aclitem[];
  current_owner oid;
  current_security_definer boolean;
  current_config text[];
  current_result text;
  current_protected_fingerprint text;
  old_clause constant text :=
    'on conflict on constraint user_roles_pkey do nothing;';
  new_clause constant text := 'on conflict do nothing;';
begin
  select * into strict baseline from migration_098_baseline;

  expected_definition := replace(
    baseline.old_function_definition,
    old_clause,
    new_clause
  );

  select
    pg_get_functiondef(procedure_row.oid),
    procedure_row.proacl,
    procedure_row.proowner,
    procedure_row.prosecdef,
    procedure_row.proconfig,
    pg_get_function_result(procedure_row.oid)
  into
    current_definition,
    current_acl,
    current_owner,
    current_security_definer,
    current_config,
    current_result
  from pg_proc procedure_row
  where procedure_row.oid =
    'public.provision_invited_learner(text)'::regprocedure;

  if current_definition <> expected_definition then
    raise exception
      'Migration 098 changed provisioning logic beyond the user_id conflict target';
  end if;

  if current_acl is distinct from baseline.old_function_acl
     or current_owner <> baseline.old_function_owner
     or current_security_definer <>
       baseline.old_function_security_definer
     or current_config is distinct from baseline.old_function_config
     or current_result <> baseline.old_function_result then
    raise exception
      'Migration 098 changed provisioning RPC security, ACL, owner, or return metadata';
  end if;

  select md5(jsonb_build_object(
    'defaults_relation', (
      select jsonb_build_object(
        'oid', table_row.oid,
        'owner', table_row.relowner,
        'rls', table_row.relrowsecurity,
        'force_rls', table_row.relforcerowsecurity,
        'acl', to_jsonb(table_row.relacl)
      )
      from pg_class table_row
      where table_row.oid = 'public.learner_account_defaults'::regclass
    ),
    'defaults_columns', (
      select jsonb_agg(
        jsonb_build_object(
          'number', attribute_row.attnum,
          'name', attribute_row.attname,
          'type', format_type(
            attribute_row.atttypid,
            attribute_row.atttypmod
          ),
          'not_null', attribute_row.attnotnull,
          'default', pg_get_expr(
            default_row.adbin,
            default_row.adrelid
          )
        )
        order by attribute_row.attnum
      )
      from pg_attribute attribute_row
      left join pg_attrdef default_row
        on default_row.adrelid = attribute_row.attrelid
       and default_row.adnum = attribute_row.attnum
      where attribute_row.attrelid =
        'public.learner_account_defaults'::regclass
        and attribute_row.attnum > 0
        and not attribute_row.attisdropped
    ),
    'defaults_constraints', (
      select jsonb_agg(
        jsonb_build_object(
          'name', constraint_row.conname,
          'type', constraint_row.contype,
          'definition', pg_get_constraintdef(constraint_row.oid)
        )
        order by constraint_row.conname
      )
      from pg_constraint constraint_row
      where constraint_row.conrelid =
        'public.learner_account_defaults'::regclass
    ),
    'defaults_rows', (
      select jsonb_agg(to_jsonb(account_default) order by singleton)
      from public.learner_account_defaults account_default
    ),
    'defaults_policies', (
      select coalesce(
        jsonb_agg(to_jsonb(policy_row) order by policy_row.policyname),
        '[]'::jsonb
      )
      from pg_policies policy_row
      where policy_row.schemaname = 'public'
        and policy_row.tablename = 'learner_account_defaults'
    ),
    'updated_at_helper', (
      select jsonb_build_object(
        'definition', pg_get_functiondef(procedure_row.oid),
        'owner', procedure_row.proowner,
        'security_definer', procedure_row.prosecdef,
        'config', to_jsonb(procedure_row.proconfig),
        'acl', to_jsonb(procedure_row.proacl)
      )
      from pg_proc procedure_row
      where procedure_row.oid =
        'public.set_learner_account_defaults_updated_at()'::regprocedure
    ),
    'defaults_triggers', (
      select jsonb_agg(
        pg_get_triggerdef(trigger_row.oid)
        order by trigger_row.tgname
      )
      from pg_trigger trigger_row
      where trigger_row.tgrelid =
        'public.learner_account_defaults'::regclass
        and not trigger_row.tgisinternal
    ),
    'auth_user_provisioning_triggers', (
      select coalesce(
        jsonb_agg(
          pg_get_triggerdef(trigger_row.oid)
          order by trigger_row.tgname
        ),
        '[]'::jsonb
      )
      from pg_trigger trigger_row
      join pg_class table_row on table_row.oid = trigger_row.tgrelid
      join pg_namespace schema_row on schema_row.oid = table_row.relnamespace
      where schema_row.nspname = 'auth'
        and table_row.relname = 'users'
        and not trigger_row.tgisinternal
        and pg_get_triggerdef(trigger_row.oid)
          ilike '%provision_invited_learner%'
    )
  )::text)
  into current_protected_fingerprint;

  if current_protected_fingerprint <>
     baseline.protected_contract_fingerprint then
    raise exception
      'Migration 098 changed another Migration 097 object or configuration';
  end if;
end;
$migration$;

commit;
