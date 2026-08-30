-- Global Library organization foundation.
--
-- Library groups organize stable Libraries above their independent Topic Trees.
-- They do not grant Library access, alter curriculum placement, or represent
-- future commercial/package membership.

begin;

-- Fail before changing constraints if legacy Topic Tree data cannot satisfy
-- the permanent one-Library-per-tree boundary.
do $preflight$
begin
  if exists (
    select 1
    from public.library_nodes ln
    where ln.library_id is null
  ) then
    raise exception
      'Cannot enforce Topic Tree Library ownership: library_nodes rows with null library_id exist';
  end if;

  if exists (
    select 1
    from public.library_nodes child
    join public.library_nodes parent on parent.id = child.parent_id
    where child.library_id is distinct from parent.library_id
  ) then
    raise exception
      'Cannot enforce Topic Tree Library ownership: cross-Library parent relationships exist';
  end if;

  if exists (
    select 1
    from public.library_nodes root
    where root.parent_id is null
    group by root.library_id
    having count(*) > 1
  ) then
    raise exception
      'Cannot enforce one Library root: a Library with multiple root nodes exists';
  end if;
end
$preflight$;

alter table public.library_nodes
  alter column library_id set not null;

alter table public.library_nodes
  add constraint library_nodes_id_library_id_key
  unique (id, library_id);

alter table public.library_nodes
  drop constraint if exists library_nodes_parent_id_fkey;

alter table public.library_nodes
  add constraint library_nodes_parent_same_library_fkey
  foreign key (parent_id, library_id)
  references public.library_nodes (id, library_id)
  on delete cascade;

create unique index library_nodes_one_root_per_library_idx
  on public.library_nodes (library_id)
  where parent_id is null;

create table public.library_groups (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid null
    references public.library_groups(id) on delete restrict,
  name text not null,
  slug text not null,
  sort_order integer not null default 0,
  status text not null default 'active',
  created_by uuid null
    references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint library_groups_name_not_blank_check
    check (btrim(name) <> ''),
  constraint library_groups_slug_not_blank_check
    check (btrim(slug) <> ''),
  constraint library_groups_slug_format_check
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint library_groups_slug_key unique (slug),
  constraint library_groups_status_check
    check (status in ('active', 'inactive', 'archived')),
  constraint library_groups_not_own_parent_check
    check (parent_id is null or parent_id <> id)
);

create unique index library_groups_root_name_key
  on public.library_groups (lower(btrim(name)))
  where parent_id is null;

create unique index library_groups_sibling_name_key
  on public.library_groups (parent_id, lower(btrim(name)))
  where parent_id is not null;

create index library_groups_parent_id_idx
  on public.library_groups(parent_id);

create table public.library_group_libraries (
  group_id uuid not null
    references public.library_groups(id) on delete restrict,
  library_id uuid not null
    references public.libraries(id) on delete restrict,
  sort_order integer not null default 0,
  created_by uuid null
    references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint library_group_libraries_pkey
    primary key (group_id, library_id),
  constraint library_group_libraries_one_canonical_group_key
    unique (library_id)
);

create index library_group_libraries_group_id_idx
  on public.library_group_libraries(group_id);

create or replace function public.set_library_organization_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.prevent_library_group_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'A Library group cannot be its own parent';
  end if;

  if exists (
    with recursive ancestors as (
      select parent.id, parent.parent_id
      from public.library_groups parent
      where parent.id = new.parent_id

      union all

      select parent.id, parent.parent_id
      from public.library_groups parent
      join ancestors child on child.parent_id = parent.id
    )
    select 1
    from ancestors
    where id = new.id
  ) then
    raise exception 'A Library group cannot be moved beneath its own descendant';
  end if;

  return new;
end;
$$;

create trigger prevent_library_group_cycle
  before insert or update of parent_id on public.library_groups
  for each row
  execute function public.prevent_library_group_cycle();

create trigger set_library_groups_updated_at
  before update on public.library_groups
  for each row
  execute function public.set_library_organization_updated_at();

create trigger set_library_group_libraries_updated_at
  before update on public.library_group_libraries
  for each row
  execute function public.set_library_organization_updated_at();

alter table public.library_groups enable row level security;
alter table public.library_group_libraries enable row level security;

revoke all on table public.library_groups
  from public, anon, authenticated;
revoke all on table public.library_group_libraries
  from public, anon, authenticated;

grant select on table public.library_groups to authenticated;
grant select on table public.library_group_libraries to authenticated;

create policy "Authorized users read visible Library groups"
  on public.library_groups
  for select
  to authenticated
  using (
    public.is_editor_or_admin()
    or (
      public.has_socrates_role()
      and status = 'active'
    )
  );

create policy "Authorized users read visible Library group placements"
  on public.library_group_libraries
  for select
  to authenticated
  using (
    public.is_editor_or_admin()
    or (
      public.has_socrates_role()
      and exists (
        select 1
        from public.library_groups group_record
        where group_record.id = group_id
          and group_record.status = 'active'
      )
      and exists (
        select 1
        from public.libraries library_record
        where library_record.id = library_id
          and library_record.status = 'active'
      )
    )
  );

revoke all on function public.set_library_organization_updated_at()
  from public, anon, authenticated;
revoke all on function public.prevent_library_group_cycle()
  from public, anon, authenticated;

-- Establish the first global organization without recreating or changing any
-- Library or root Topic Tree node. Prior migrations establish unique Nursing
-- and Medicine Library slugs; if either is absent, retain the infrastructure
-- and emit a notice rather than inventing a replacement Library.
do $organization$
declare
  health_sciences_group_id uuid;
  nursing_library_id uuid;
  medicine_library_id uuid;
begin
  insert into public.library_groups (
    parent_id,
    name,
    slug,
    sort_order,
    status,
    created_by
  )
  values (
    null,
    'Health Sciences',
    'health-sciences',
    0,
    'active',
    null
  )
  returning id into health_sciences_group_id;

  select library_record.id
  into nursing_library_id
  from public.libraries library_record
  where library_record.slug = 'nursing';

  select library_record.id
  into medicine_library_id
  from public.libraries library_record
  where library_record.slug = 'medicine';

  if nursing_library_id is not null then
    insert into public.library_group_libraries (
      group_id,
      library_id,
      sort_order,
      created_by
    )
    values (
      health_sciences_group_id,
      nursing_library_id,
      0,
      null
    );
  else
    raise notice
      'Nursing Library slug was not found; Health Sciences was created without that association';
  end if;

  if medicine_library_id is not null then
    insert into public.library_group_libraries (
      group_id,
      library_id,
      sort_order,
      created_by
    )
    values (
      health_sciences_group_id,
      medicine_library_id,
      1,
      null
    );
  else
    raise notice
      'Medicine Library slug was not found; Health Sciences was created without that association';
  end if;
end
$organization$;

commit;
