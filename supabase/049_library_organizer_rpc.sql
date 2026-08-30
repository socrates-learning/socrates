-- Controlled Creator Studio mutations for the global Library Organizer.
-- Requires 048_global_library_organization.sql.

begin;

create or replace function public.library_organization_slug(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(
    both '-'
    from lower(regexp_replace(btrim(coalesce(p_name, '')), '[^a-zA-Z0-9]+', '-', 'g'))
  );
$$;

create or replace function public.create_library_group(
  p_parent_id uuid,
  p_name text
)
returns public.library_groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleaned_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  base_slug text;
  candidate_slug text;
  suffix integer := 1;
  next_sort_order integer;
  created_group public.library_groups%rowtype;
begin
  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may create Library groups';
  end if;

  if cleaned_name = '' then
    raise exception 'Library group name is required';
  end if;

  if p_parent_id is not null
     and not exists (
       select 1
       from public.library_groups parent
       where parent.id = p_parent_id
         and parent.status = 'active'
     ) then
    raise exception 'Active parent Library group was not found';
  end if;

  base_slug := public.library_organization_slug(cleaned_name);
  if base_slug = '' then
    base_slug := 'library-group';
  end if;
  candidate_slug := base_slug;

  while exists (
    select 1
    from public.library_groups existing_group
    where existing_group.slug = candidate_slug
  ) loop
    suffix := suffix + 1;
    candidate_slug := base_slug || '-' || suffix::text;
  end loop;

  select coalesce(max(sibling.sort_order), -1) + 1
  into next_sort_order
  from public.library_groups sibling
  where sibling.parent_id is not distinct from p_parent_id;

  insert into public.library_groups (
    parent_id,
    name,
    slug,
    sort_order,
    status,
    created_by
  )
  values (
    p_parent_id,
    cleaned_name,
    candidate_slug,
    next_sort_order,
    'active',
    (select auth.uid())
  )
  returning * into created_group;

  return created_group;
end;
$$;

create or replace function public.rename_library_group(
  p_group_id uuid,
  p_name text
)
returns public.library_groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleaned_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  renamed_group public.library_groups%rowtype;
begin
  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may rename Library groups';
  end if;

  if cleaned_name = '' then
    raise exception 'Library group name is required';
  end if;

  update public.library_groups target_group
  set name = cleaned_name
  where target_group.id = p_group_id
  returning * into renamed_group;

  if renamed_group.id is null then
    raise exception 'Library group was not found';
  end if;

  return renamed_group;
end;
$$;

create or replace function public.move_library_group(
  p_group_id uuid,
  p_new_parent_id uuid
)
returns public.library_groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_sort_order integer;
  moved_group public.library_groups%rowtype;
begin
  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may move Library groups';
  end if;

  if not exists (
    select 1
    from public.library_groups target_group
    where target_group.id = p_group_id
  ) then
    raise exception 'Library group was not found';
  end if;

  if p_new_parent_id is not null
     and not exists (
       select 1
       from public.library_groups parent_group
       where parent_group.id = p_new_parent_id
         and parent_group.status = 'active'
     ) then
    raise exception 'Active destination Library group was not found';
  end if;

  select coalesce(max(sibling.sort_order), -1) + 1
  into next_sort_order
  from public.library_groups sibling
  where sibling.parent_id is not distinct from p_new_parent_id
    and sibling.id <> p_group_id;

  update public.library_groups target_group
  set parent_id = p_new_parent_id,
      sort_order = next_sort_order
  where target_group.id = p_group_id
  returning * into moved_group;

  return moved_group;
end;
$$;

create or replace function public.reorder_library_group(
  p_group_id uuid,
  p_direction text
)
returns public.library_groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_group public.library_groups%rowtype;
  adjacent_group public.library_groups%rowtype;
  normalized_direction text := lower(btrim(coalesce(p_direction, '')));
  target_sort_order integer;
begin
  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may reorder Library groups';
  end if;

  if normalized_direction not in ('up', 'down') then
    raise exception 'Direction must be up or down';
  end if;

  select *
  into target_group
  from public.library_groups target
  where target.id = p_group_id
  for update;

  if target_group.id is null then
    raise exception 'Library group was not found';
  end if;

  if normalized_direction = 'up' then
    select *
    into adjacent_group
    from public.library_groups sibling
    where sibling.parent_id is not distinct from target_group.parent_id
      and sibling.id <> target_group.id
      and (
        sibling.sort_order < target_group.sort_order
        or (
          sibling.sort_order = target_group.sort_order
          and (lower(sibling.name), sibling.id) < (lower(target_group.name), target_group.id)
        )
      )
    order by sibling.sort_order desc, lower(sibling.name) desc, sibling.id desc
    limit 1
    for update;
  else
    select *
    into adjacent_group
    from public.library_groups sibling
    where sibling.parent_id is not distinct from target_group.parent_id
      and sibling.id <> target_group.id
      and (
        sibling.sort_order > target_group.sort_order
        or (
          sibling.sort_order = target_group.sort_order
          and (lower(sibling.name), sibling.id) > (lower(target_group.name), target_group.id)
        )
      )
    order by sibling.sort_order, lower(sibling.name), sibling.id
    limit 1
    for update;
  end if;

  if adjacent_group.id is null then
    return target_group;
  end if;

  target_sort_order := target_group.sort_order;

  update public.library_groups
  set sort_order = adjacent_group.sort_order
  where id = target_group.id;

  update public.library_groups
  set sort_order = target_sort_order
  where id = adjacent_group.id;

  select *
  into target_group
  from public.library_groups target
  where target.id = p_group_id;

  return target_group;
end;
$$;

create or replace function public.archive_library_group(
  p_group_id uuid
)
returns public.library_groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  archived_group public.library_groups%rowtype;
begin
  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may archive Library groups';
  end if;

  update public.library_groups target_group
  set status = 'archived'
  where target_group.id = p_group_id
  returning * into archived_group;

  if archived_group.id is null then
    raise exception 'Library group was not found';
  end if;

  return archived_group;
end;
$$;

create or replace function public.create_library_with_root(
  p_group_id uuid,
  p_name text,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleaned_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  cleaned_description text := nullif(btrim(coalesce(p_description, '')), '');
  base_slug text;
  candidate_slug text;
  suffix integer := 1;
  next_sort_order integer;
  created_library public.libraries%rowtype;
  root_node public.library_nodes%rowtype;
begin
  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may create Libraries';
  end if;

  if cleaned_name = '' then
    raise exception 'Library name is required';
  end if;

  if not exists (
    select 1
    from public.library_groups target_group
    where target_group.id = p_group_id
      and target_group.status = 'active'
  ) then
    raise exception 'Active Library group was not found';
  end if;

  base_slug := public.library_organization_slug(cleaned_name);
  if base_slug = '' then
    base_slug := 'library';
  end if;
  candidate_slug := base_slug;

  while exists (
    select 1
    from public.libraries existing_library
    where existing_library.slug = candidate_slug
  ) loop
    suffix := suffix + 1;
    candidate_slug := base_slug || '-' || suffix::text;
  end loop;

  insert into public.libraries (
    name,
    description,
    slug,
    status
  )
  values (
    cleaned_name,
    cleaned_description,
    candidate_slug,
    'active'
  )
  returning * into created_library;

  insert into public.library_nodes (
    library_id,
    parent_id,
    name,
    node_type,
    sort_order
  )
  values (
    created_library.id,
    null,
    cleaned_name,
    'section',
    0
  )
  returning * into root_node;

  select coalesce(max(existing_placement.sort_order), -1) + 1
  into next_sort_order
  from public.library_group_libraries existing_placement
  where existing_placement.group_id = p_group_id;

  insert into public.library_group_libraries (
    group_id,
    library_id,
    sort_order,
    created_by
  )
  values (
    p_group_id,
    created_library.id,
    next_sort_order,
    (select auth.uid())
  );

  return jsonb_build_object(
    'library_id', created_library.id,
    'library_slug', created_library.slug,
    'root_node_id', root_node.id,
    'group_id', p_group_id
  );
end;
$$;

create or replace function public.move_library_to_group(
  p_library_id uuid,
  p_group_id uuid
)
returns public.library_group_libraries
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_sort_order integer;
  moved_placement public.library_group_libraries%rowtype;
begin
  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may organize Libraries';
  end if;

  if not exists (
    select 1
    from public.libraries target_library
    where target_library.id = p_library_id
  ) then
    raise exception 'Library was not found';
  end if;

  if not exists (
    select 1
    from public.library_groups target_group
    where target_group.id = p_group_id
      and target_group.status = 'active'
  ) then
    raise exception 'Active Library group was not found';
  end if;

  select coalesce(max(existing_placement.sort_order), -1) + 1
  into next_sort_order
  from public.library_group_libraries existing_placement
  where existing_placement.group_id = p_group_id
    and existing_placement.library_id <> p_library_id;

  insert into public.library_group_libraries (
    group_id,
    library_id,
    sort_order,
    created_by
  )
  values (
    p_group_id,
    p_library_id,
    next_sort_order,
    (select auth.uid())
  )
  on conflict (library_id)
  do update set
    group_id = excluded.group_id,
    sort_order = excluded.sort_order
  returning * into moved_placement;

  return moved_placement;
end;
$$;

create or replace function public.rename_library_with_root(
  p_library_id uuid,
  p_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleaned_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  target_library public.libraries%rowtype;
  root_node public.library_nodes%rowtype;
  root_count integer;
begin
  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may rename Libraries';
  end if;

  if cleaned_name = '' then
    raise exception 'Library name is required';
  end if;

  select *
  into target_library
  from public.libraries library_record
  where library_record.id = p_library_id
  for update;

  if target_library.id is null then
    raise exception 'Library was not found';
  end if;

  select count(*)
  into root_count
  from public.library_nodes root
  where root.library_id = p_library_id
    and root.parent_id is null;

  if root_count <> 1 then
    raise exception 'Library must have exactly one root Topic Tree node';
  end if;

  select *
  into root_node
  from public.library_nodes root
  where root.library_id = p_library_id
    and root.parent_id is null;

  update public.libraries
  set name = cleaned_name
  where id = p_library_id;

  update public.library_nodes
  set name = cleaned_name
  where id = root_node.id;

  return jsonb_build_object(
    'library_id', p_library_id,
    'library_slug', target_library.slug,
    'root_node_id', root_node.id,
    'name', cleaned_name
  );
end;
$$;

create or replace function public.set_library_organizer_status(
  p_library_id uuid,
  p_status text
)
returns public.libraries
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_status text := lower(btrim(coalesce(p_status, '')));
  updated_library public.libraries%rowtype;
begin
  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may change Library status';
  end if;

  if normalized_status not in ('active', 'inactive', 'archived') then
    raise exception 'Invalid Library status';
  end if;

  update public.libraries target_library
  set status = normalized_status
  where target_library.id = p_library_id
  returning * into updated_library;

  if updated_library.id is null then
    raise exception 'Library was not found';
  end if;

  return updated_library;
end;
$$;

revoke all on function public.library_organization_slug(text)
  from public, anon, authenticated;
revoke all on function public.create_library_group(uuid, text)
  from public, anon, authenticated;
revoke all on function public.rename_library_group(uuid, text)
  from public, anon, authenticated;
revoke all on function public.move_library_group(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.reorder_library_group(uuid, text)
  from public, anon, authenticated;
revoke all on function public.archive_library_group(uuid)
  from public, anon, authenticated;
revoke all on function public.create_library_with_root(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.move_library_to_group(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.rename_library_with_root(uuid, text)
  from public, anon, authenticated;
revoke all on function public.set_library_organizer_status(uuid, text)
  from public, anon, authenticated;

grant execute on function public.create_library_group(uuid, text)
  to authenticated;
grant execute on function public.rename_library_group(uuid, text)
  to authenticated;
grant execute on function public.move_library_group(uuid, uuid)
  to authenticated;
grant execute on function public.reorder_library_group(uuid, text)
  to authenticated;
grant execute on function public.archive_library_group(uuid)
  to authenticated;
grant execute on function public.create_library_with_root(uuid, text, text)
  to authenticated;
grant execute on function public.move_library_to_group(uuid, uuid)
  to authenticated;
grant execute on function public.rename_library_with_root(uuid, text)
  to authenticated;
grant execute on function public.set_library_organizer_status(uuid, text)
  to authenticated;

commit;
