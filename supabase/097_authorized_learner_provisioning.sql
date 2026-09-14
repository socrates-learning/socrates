-- Authorized learner-account provisioning for invited Socrates users.
--
-- This migration deliberately does not attach provisioning to auth.users.
-- An authenticated administrator must explicitly provision an already-created
-- or invited Auth identity. The configured Library UUID is the sole source of
-- the initial learner entitlement.

begin;

create table public.learner_account_defaults (
  singleton boolean primary key default true,
  default_library_id uuid not null unique
    references public.libraries(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learner_account_defaults_singleton_check check (singleton)
);

alter table public.learner_account_defaults enable row level security;

revoke all on table public.learner_account_defaults
  from public, anon, authenticated;

do $migration$
declare
  approved_nursing_library_id constant uuid :=
    'fd6ba480-e665-4bfd-9f06-fe0f24ec4964';
begin
  if not exists (
    select 1
    from public.libraries library_row
    where library_row.id = approved_nursing_library_id
      and library_row.slug = 'nursing'
      and library_row.name = 'Nursing'
      and library_row.status = 'active'
  ) then
    raise exception
      'Approved default Nursing Library is missing, inactive, or has unexpected identity: %',
      approved_nursing_library_id;
  end if;

  insert into public.learner_account_defaults (
    singleton,
    default_library_id
  )
  values (
    true,
    approved_nursing_library_id
  );
end;
$migration$;

create or replace function public.set_learner_account_defaults_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_learner_account_defaults_updated_at()
  from public, anon, authenticated;

create trigger set_learner_account_defaults_updated_at
  before update on public.learner_account_defaults
  for each row
  execute function public.set_learner_account_defaults_updated_at();

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
  on conflict on constraint user_roles_pkey do nothing;

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

revoke all on function public.provision_invited_learner(text)
  from public, anon, authenticated;
grant execute on function public.provision_invited_learner(text)
  to authenticated;

do $migration$
declare
  default_count integer;
begin
  select count(*)
  into default_count
  from public.learner_account_defaults;

  if default_count <> 1
     or not exists (
       select 1
       from public.learner_account_defaults account_default
       join public.libraries library_row
         on library_row.id = account_default.default_library_id
       where account_default.singleton = true
         and library_row.slug = 'nursing'
         and library_row.name = 'Nursing'
         and library_row.status = 'active'
     ) then
    raise exception 'Unexpected learner-account default configuration';
  end if;

  if exists (
    select 1
    from pg_trigger trigger_row
    join pg_class table_row on table_row.oid = trigger_row.tgrelid
    join pg_namespace schema_row on schema_row.oid = table_row.relnamespace
    where schema_row.nspname = 'auth'
      and table_row.relname = 'users'
      and not trigger_row.tgisinternal
      and pg_get_triggerdef(trigger_row.oid) ilike '%provision_invited_learner%'
  ) then
    raise exception 'Learner provisioning must not be attached to auth.users';
  end if;
end;
$migration$;

commit;
