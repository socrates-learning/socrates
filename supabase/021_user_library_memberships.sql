-- Phase 2B: User Library Membership Foundation
-- Adds user-to-library memberships and primary-library preference support.
-- This migration intentionally does not alter concept visibility, content RLS,
-- application behavior, Nursing content, or active-library filtering.

create table if not exists public.user_libraries (
  user_id uuid not null
    references auth.users(id) on delete cascade,
  library_id uuid not null
    references public.libraries(id),
  is_primary boolean not null default false,
  assigned_by uuid null
    references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, library_id)
);

create unique index if not exists user_libraries_one_primary_per_user_idx
  on public.user_libraries(user_id)
  where is_primary;

create index if not exists user_libraries_user_id_idx
  on public.user_libraries(user_id);

create index if not exists user_libraries_library_id_idx
  on public.user_libraries(library_id);

create index if not exists user_libraries_assigned_by_idx
  on public.user_libraries(assigned_by);

create or replace function public.set_user_libraries_updated_at()
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

drop trigger if exists set_user_libraries_updated_at
  on public.user_libraries;

create trigger set_user_libraries_updated_at
  before update on public.user_libraries
  for each row
  execute function public.set_user_libraries_updated_at();

alter table public.user_libraries enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "Users read own library memberships"
  on public.user_libraries;

create policy "Users read own library memberships"
  on public.user_libraries
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Editors read library memberships"
  on public.user_libraries;

create policy "Editors read library memberships"
  on public.user_libraries
  for select
  to authenticated
  using (public.is_editor_or_admin());

drop policy if exists "Admins insert library memberships"
  on public.user_libraries;

create policy "Admins insert library memberships"
  on public.user_libraries
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "Admins update library memberships"
  on public.user_libraries;

create policy "Admins update library memberships"
  on public.user_libraries
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins delete library memberships"
  on public.user_libraries;

create policy "Admins delete library memberships"
  on public.user_libraries
  for delete
  to authenticated
  using (public.is_admin());

create or replace function public.list_user_library_memberships()
returns table (
  user_id uuid,
  email text,
  role text,
  library_id uuid,
  library_name text,
  library_slug text,
  library_status text,
  is_primary boolean,
  assigned_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins may list user library memberships';
  end if;

  return query
  select
    ul.user_id,
    u.email::text,
    ur.role,
    ul.library_id,
    l.name,
    l.slug,
    l.status,
    ul.is_primary,
    ul.assigned_by,
    ul.created_at,
    ul.updated_at
  from public.user_libraries ul
  join auth.users u on u.id = ul.user_id
  join public.libraries l on l.id = ul.library_id
  left join public.user_roles ur on ur.user_id = ul.user_id
  order by u.email, l.name, ul.library_id;
end;
$$;

create or replace function public.set_user_primary_library(
  target_user_id uuid,
  target_library_id uuid
)
returns public.user_libraries
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  selected_library public.libraries%rowtype;
  membership public.user_libraries%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only admins may set a user primary library';
  end if;

  if caller_id is null then
    raise exception 'Authenticated admin context is required';
  end if;

  if not exists (
    select 1
    from auth.users u
    where u.id = target_user_id
  ) then
    raise exception 'Target user does not exist: %', target_user_id;
  end if;

  select *
  into selected_library
  from public.libraries l
  where l.id = target_library_id;

  if selected_library.id is null then
    raise exception 'Target library does not exist: %', target_library_id;
  end if;

  if selected_library.status is distinct from 'active' then
    raise exception 'Target library must be active: %', target_library_id;
  end if;

  update public.user_libraries ul
  set is_primary = false
  where ul.user_id = target_user_id
    and ul.is_primary = true;

  insert into public.user_libraries (
    user_id,
    library_id,
    is_primary,
    assigned_by
  )
  values (
    target_user_id,
    target_library_id,
    true,
    caller_id
  )
  on conflict (user_id, library_id)
  do update set
    is_primary = true,
    assigned_by = excluded.assigned_by
  returning * into membership;

  return membership;
end;
$$;

revoke all on function public.list_user_library_memberships() from public;
grant execute on function public.list_user_library_memberships() to authenticated;

revoke all on function public.set_user_primary_library(uuid, uuid) from public;
grant execute on function public.set_user_primary_library(uuid, uuid) to authenticated;

do $$
declare
  pharmacology_library_id uuid;
  pre_concepts_count bigint;
  pre_library_nodes_count bigint;
  pre_placements_count bigint;
  pre_relationships_count bigint;
  pre_learn_sections_count bigint;
  pre_sources_count bigint;
  pre_attribution_count bigint;
  pre_review_attempts_count bigint;
  pre_user_notes_count bigint;
begin
  select count(*) into pre_concepts_count from public.concepts;
  select count(*) into pre_library_nodes_count from public.library_nodes;
  select count(*) into pre_placements_count from public.concept_placements;
  select count(*) into pre_relationships_count from public.concept_relationships;
  select count(*) into pre_learn_sections_count from public.learn_sections;
  select count(*) into pre_sources_count from public.sources;
  select count(*) into pre_attribution_count from public.content_source_notes;
  select count(*) into pre_review_attempts_count from public.review_attempts;
  select count(*) into pre_user_notes_count from public.user_notes;

  select id
  into pharmacology_library_id
  from public.libraries
  where slug = 'pharmacology'
    and status = 'active';

  if pharmacology_library_id is null then
    raise exception 'Active Pharmacology library was not found for user library backfill';
  end if;

  insert into public.user_libraries (
    user_id,
    library_id,
    is_primary,
    assigned_by
  )
  select
    u.id,
    pharmacology_library_id,
    true,
    null
  from auth.users u
  where not exists (
    select 1
    from public.user_libraries ul
    where ul.user_id = u.id
      and ul.is_primary = true
  )
  on conflict (user_id, library_id)
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
    end;

  if exists (
    select 1
    from public.user_libraries
    group by user_id, library_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate user-library membership rows detected';
  end if;

  if exists (
    select 1
    from public.user_libraries
    where is_primary = true
    group by user_id
    having count(*) > 1
  ) then
    raise exception 'A user has more than one primary library membership';
  end if;

  if exists (
    select 1
    from public.user_libraries ul
    left join auth.users u on u.id = ul.user_id
    where u.id is null
  ) then
    raise exception 'User library membership references a missing user';
  end if;

  if exists (
    select 1
    from public.user_libraries ul
    left join public.libraries l on l.id = ul.library_id
    where l.id is null
  ) then
    raise exception 'User library membership references a missing library';
  end if;

  if exists (
    select 1
    from auth.users u
    where not exists (
      select 1
      from public.user_libraries ul
      where ul.user_id = u.id
        and ul.is_primary = true
    )
  ) then
    raise exception 'At least one existing user does not have a primary library membership after backfill';
  end if;

  if (select count(*) from public.concepts) <> pre_concepts_count then
    raise exception 'Concept count changed unexpectedly';
  end if;

  if (select count(*) from public.library_nodes) <> pre_library_nodes_count then
    raise exception 'Library node count changed unexpectedly';
  end if;

  if (select count(*) from public.concept_placements) <> pre_placements_count then
    raise exception 'Concept placement count changed unexpectedly';
  end if;

  if (select count(*) from public.concept_relationships) <> pre_relationships_count then
    raise exception 'Concept relationship count changed unexpectedly';
  end if;

  if (select count(*) from public.learn_sections) <> pre_learn_sections_count then
    raise exception 'Learn section count changed unexpectedly';
  end if;

  if (select count(*) from public.sources) <> pre_sources_count then
    raise exception 'Source count changed unexpectedly';
  end if;

  if (select count(*) from public.content_source_notes) <> pre_attribution_count then
    raise exception 'Attribution count changed unexpectedly';
  end if;

  if (select count(*) from public.review_attempts) <> pre_review_attempts_count then
    raise exception 'Review attempt count changed unexpectedly';
  end if;

  if (select count(*) from public.user_notes) <> pre_user_notes_count then
    raise exception 'User note count changed unexpectedly';
  end if;
end
$$;
