-- MVP v0.1 schema stabilization
-- Run after schema.sql and 002_flexible_taxonomy.sql.

alter table public.concepts
  add column status text not null default 'draft'
  check (status in ('draft', 'published', 'archived'));

alter table public.concepts
  alter column created_by set default auth.uid();

alter table public.review_attempts
  add column concept_id uuid references public.concepts(id) on delete cascade,
  add column score smallint check (score between 1 and 4),
  add constraint review_attempts_has_target
    check (concept_id is not null or learning_object_id is not null);

create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'learner'
    check (role in ('learner', 'editor', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.concept_distinctions (
  id uuid primary key default uuid_generate_v4(),
  concept_id uuid not null references public.concepts(id) on delete cascade,
  distinction text not null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index concept_distinctions_concept_id_idx
  on public.concept_distinctions(concept_id);

create index review_attempts_concept_id_idx
  on public.review_attempts(concept_id);

alter table public.user_roles enable row level security;
alter table public.concept_distinctions enable row level security;

create policy "Users read own role" on public.user_roles
  for select using (auth.uid() = user_id);

create policy "Readable concept distinctions" on public.concept_distinctions
  for select using (
    exists (
      select 1
      from public.concepts c
      where c.id = concept_id
        and (c.is_public = true or c.created_by = auth.uid())
    )
  );

create policy "Editors manage concept distinctions" on public.concept_distinctions
  for all
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role in ('editor', 'admin')
    )
  )
  with check (
    auth.uid() = created_by
    and exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role in ('editor', 'admin')
    )
  );

create policy "Public library nodes are readable" on public.library_nodes
  for select using (true);

create policy "Readable concept placements" on public.concept_placements
  for select using (
    exists (
      select 1
      from public.concepts c
      where c.id = concept_id
        and (c.is_public = true or c.created_by = auth.uid())
    )
  );

create policy "Editors insert concept placements" on public.concept_placements
  for insert with check (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role in ('editor', 'admin')
    )
    and exists (
      select 1
      from public.concepts c
      where c.id = concept_id
        and (c.is_public = true or c.created_by = auth.uid())
    )
  );

drop policy "Creators can insert concepts" on public.concepts;

create policy "Editors can insert concepts" on public.concepts
  for insert with check (
    auth.uid() = created_by
    and exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role in ('editor', 'admin')
    )
  );

-- Compatibility RPC for the current callback. Approved-domain configuration is
-- not yet part of the repository, so new users receive the least-privileged role.
create or replace function public.assign_role_from_approved_domain()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  assigned_role text;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.user_roles (user_id, role)
  values (current_user_id, 'learner')
  on conflict (user_id) do nothing;

  select ur.role into assigned_role
  from public.user_roles ur
  where ur.user_id = current_user_id;

  return assigned_role;
end;
$$;

create or replace function public.list_users_with_roles()
returns table (
  user_id uuid,
  email text,
  role text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role = 'admin'
  ) then
    raise exception 'Admin role required';
  end if;

  return query
    select
      u.id,
      u.email::text,
      ur.role,
      coalesce(ur.created_at, u.created_at)
    from auth.users u
    left join public.user_roles ur on ur.user_id = u.id
    order by u.created_at;
end;
$$;

create or replace function public.set_user_role_by_email(
  target_email text,
  new_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
begin
  if not exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role = 'admin'
  ) then
    raise exception 'Admin role required';
  end if;

  if new_role not in ('learner', 'editor', 'admin') then
    raise exception 'Invalid role';
  end if;

  select u.id into target_user_id
  from auth.users u
  where lower(u.email) = lower(target_email)
  limit 1;

  if target_user_id is null then
    raise exception 'User not found';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'Administrators cannot change their own role';
  end if;

  insert into public.user_roles (user_id, role)
  values (target_user_id, new_role)
  on conflict (user_id) do update
    set role = excluded.role,
        updated_at = now();
end;
$$;

revoke all on function public.assign_role_from_approved_domain() from public;
revoke all on function public.list_users_with_roles() from public;
revoke all on function public.set_user_role_by_email(text, text) from public;

grant execute on function public.assign_role_from_approved_domain() to authenticated;
grant execute on function public.list_users_with_roles() to authenticated;
grant execute on function public.set_user_role_by_email(text, text) to authenticated;
