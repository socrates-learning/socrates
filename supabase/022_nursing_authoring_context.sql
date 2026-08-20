-- Task A: Nursing Creator Studio authoring context.
-- Adds the Nursing library and a minimal starter hierarchy without moving
-- existing concepts, placements, sources, or library nodes.

do $seed$
declare
  nursing_library_id uuid;
  node_record record;
  node_ids jsonb := '{}'::jsonb;
  current_node_id uuid;
  parent_node_id uuid;
begin
  select id
  into nursing_library_id
  from public.libraries
  where slug = 'nursing'
     or lower(btrim(name)) = 'nursing'
  order by case when slug = 'nursing' then 0 else 1 end, created_at, id
  limit 1;

  if nursing_library_id is null then
    insert into public.libraries (name, description, slug, status)
    values (
      'Nursing',
      'Nursing curriculum and clinical judgment learning library.',
      'nursing',
      'active'
    )
    returning id into nursing_library_id;
  else
    update public.libraries
    set name = 'Nursing',
        description = coalesce(
          description,
          'Nursing curriculum and clinical judgment learning library.'
        ),
        slug = 'nursing',
        status = 'active'
    where id = nursing_library_id;
  end if;

  for node_record in
    select *
    from (
      values
        ('Nursing', null, 'Nursing', 'section', 0),
        ('Nursing / Fundamentals', 'Nursing', 'Fundamentals', 'section', 0),
        ('Nursing / Fundamentals / Homeostasis', 'Nursing / Fundamentals', 'Homeostasis', 'chapter', 0),
        ('Nursing / Fundamentals / Homeostasis / Acid-Base Balance', 'Nursing / Fundamentals / Homeostasis', 'Acid-Base Balance', 'topic', 0),
        ('Nursing / Fundamentals / Fluids and Electrolytes', 'Nursing / Fundamentals', 'Fluids and Electrolytes', 'chapter', 1),
        ('Nursing / Fundamentals / Fluids and Electrolytes / Intravenous Fluids', 'Nursing / Fundamentals / Fluids and Electrolytes', 'Intravenous Fluids', 'topic', 0),
        ('Nursing / Adult Health', 'Nursing', 'Adult Health', 'section', 1),
        ('Nursing / Adult Health / Cardiovascular', 'Nursing / Adult Health', 'Cardiovascular', 'chapter', 0)
    ) as nodes(path, parent_path, name, node_type, sort_order)
  loop
    parent_node_id := null;

    if node_record.parent_path is not null then
      parent_node_id := (node_ids ->> node_record.parent_path)::uuid;

      if parent_node_id is null then
        raise exception 'Parent Nursing node was not resolved: %',
          node_record.parent_path;
      end if;
    end if;

    select ln.id
    into current_node_id
    from public.library_nodes ln
    where ln.library_id = nursing_library_id
      and ln.parent_id is not distinct from parent_node_id
      and lower(btrim(ln.name)) = lower(btrim(node_record.name))
    order by ln.created_at, ln.id
    limit 1;

    if current_node_id is null then
      insert into public.library_nodes (
        library_id,
        parent_id,
        name,
        node_type,
        sort_order
      )
      values (
        nursing_library_id,
        parent_node_id,
        node_record.name,
        node_record.node_type,
        node_record.sort_order
      )
      returning id into current_node_id;
    else
      update public.library_nodes
      set node_type = node_record.node_type,
          sort_order = node_record.sort_order,
          library_id = nursing_library_id
      where id = current_node_id;
    end if;

    node_ids := node_ids || jsonb_build_object(node_record.path, current_node_id);
  end loop;

  if (
    select count(*)
    from public.libraries
    where slug = 'nursing'
  ) <> 1 then
    raise exception 'Expected exactly one Nursing library';
  end if;

  if exists (
    select 1
    from public.library_nodes child
    join public.library_nodes parent on parent.id = child.parent_id
    where child.library_id = nursing_library_id
      and parent.library_id is distinct from nursing_library_id
  ) then
    raise exception 'Nursing hierarchy contains a parent from another library';
  end if;

  if exists (
    select 1
    from public.library_nodes ln
    where ln.id in (
      select (value #>> '{}')::uuid
      from jsonb_each(node_ids)
    )
      and ln.library_id is distinct from nursing_library_id
  ) then
    raise exception 'A seeded Nursing node has the wrong library_id';
  end if;
end
$seed$;

create or replace function public.create_library_node_in_library(
  p_library_id uuid,
  p_parent_id uuid,
  p_name text,
  p_node_type text default 'topic',
  p_sort_order integer default 0
)
returns public.library_nodes
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_node public.library_nodes%rowtype;
  existing_node public.library_nodes%rowtype;
  created_node public.library_nodes%rowtype;
  cleaned_name text := btrim(coalesce(p_name, ''));
  normalized_node_type text := coalesce(nullif(btrim(p_node_type), ''), 'topic');
begin
  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may create library categories';
  end if;

  if p_library_id is null then
    raise exception 'Library is required';
  end if;

  if cleaned_name = '' then
    raise exception 'Category name is required';
  end if;

  if normalized_node_type not in ('section', 'chapter', 'topic', 'module') then
    raise exception 'Invalid library node type: %', normalized_node_type;
  end if;

  select *
  into parent_node
  from public.library_nodes ln
  where ln.id = p_parent_id;

  if parent_node.id is null then
    raise exception 'Parent category was not found';
  end if;

  if parent_node.library_id is distinct from p_library_id then
    raise exception 'Parent category does not belong to the active library';
  end if;

  select *
  into existing_node
  from public.library_nodes ln
  where ln.library_id = p_library_id
    and ln.parent_id = p_parent_id
    and lower(btrim(ln.name)) = lower(cleaned_name)
  order by ln.created_at, ln.id
  limit 1;

  if existing_node.id is not null then
    return existing_node;
  end if;

  insert into public.library_nodes (
    library_id,
    parent_id,
    name,
    node_type,
    sort_order
  )
  values (
    p_library_id,
    p_parent_id,
    cleaned_name,
    normalized_node_type,
    p_sort_order
  )
  returning * into created_node;

  return created_node;
end;
$$;

revoke all on function public.create_library_node_in_library(
  uuid,
  uuid,
  text,
  text,
  integer
) from public;

grant execute on function public.create_library_node_in_library(
  uuid,
  uuid,
  text,
  text,
  integer
) to authenticated;
