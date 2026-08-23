-- Safe Knowledge Tree topic movement.
-- Editors/admins may move an existing library node beneath another node
-- in the same library, while preventing cycles and duplicate siblings.

create or replace function public.move_library_node_in_library(
  p_library_id uuid,
  p_node_id uuid,
  p_new_parent_id uuid
)
returns public.library_nodes
language plpgsql
security definer
set search_path = ''
as $$
declare
  moving_node public.library_nodes%rowtype;
  new_parent public.library_nodes%rowtype;
  moved_node public.library_nodes%rowtype;
  duplicate_node public.library_nodes%rowtype;
  would_create_cycle boolean := false;
begin
  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may move library topics';
  end if;

  if p_library_id is null then
    raise exception 'Library is required';
  end if;

  if p_node_id is null then
    raise exception 'Topic is required';
  end if;

  if p_new_parent_id is null then
    raise exception 'New parent topic is required';
  end if;

  select *
  into moving_node
  from public.library_nodes ln
  where ln.id = p_node_id;

  if moving_node.id is null then
    raise exception 'Topic was not found';
  end if;

  if moving_node.library_id is distinct from p_library_id then
    raise exception 'Topic does not belong to the active library';
  end if;

  -- Keep the library root fixed.
  if moving_node.parent_id is null then
    raise exception 'The library root cannot be moved';
  end if;

  if p_node_id = p_new_parent_id then
    raise exception 'A topic cannot be moved beneath itself';
  end if;

  select *
  into new_parent
  from public.library_nodes ln
  where ln.id = p_new_parent_id;

  if new_parent.id is null then
    raise exception 'New parent topic was not found';
  end if;

  if new_parent.library_id is distinct from p_library_id then
    raise exception 'New parent topic does not belong to the active library';
  end if;

  -- Prevent moving a topic underneath one of its own descendants.
  with recursive descendants as (
    select ln.id
    from public.library_nodes ln
    where ln.parent_id = p_node_id

    union all

    select child.id
    from public.library_nodes child
    join descendants d on child.parent_id = d.id
  )
  select exists (
    select 1
    from descendants
    where id = p_new_parent_id
  )
  into would_create_cycle;

  if would_create_cycle then
    raise exception 'A topic cannot be moved beneath one of its own subtopics';
  end if;

  -- Do not create two same-named topics beneath the same parent.
  select *
  into duplicate_node
  from public.library_nodes ln
  where ln.library_id = p_library_id
    and ln.parent_id = p_new_parent_id
    and ln.id <> p_node_id
    and lower(btrim(ln.name)) = lower(btrim(moving_node.name))
  limit 1;

  if duplicate_node.id is not null then
    raise exception
      'A topic named "%" already exists beneath the selected topic',
      moving_node.name;
  end if;

  update public.library_nodes
  set parent_id = p_new_parent_id
  where id = p_node_id
  returning * into moved_node;

  return moved_node;
end;
$$;

revoke all on function public.move_library_node_in_library(
  uuid,
  uuid,
  uuid
) from public;

grant execute on function public.move_library_node_in_library(
  uuid,
  uuid,
  uuid
) to authenticated;