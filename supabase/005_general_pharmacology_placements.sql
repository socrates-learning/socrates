-- Move concepts off the Pharmacology root into a visible child topic.

do $migration$
declare
  pharmacology_root_count integer;
  pharmacology_root_id uuid;
  pharmacology_library_id uuid;
  general_node_count integer;
  general_node_id uuid;
begin
  select count(*)
  into pharmacology_root_count
  from public.library_nodes
  where name = 'Pharmacology'
    and parent_id is null;

  if pharmacology_root_count <> 1 then
    raise exception 'Expected exactly one Pharmacology root node, found %',
      pharmacology_root_count;
  end if;

  select id, library_id
  into pharmacology_root_id, pharmacology_library_id
  from public.library_nodes
  where name = 'Pharmacology'
    and parent_id is null;

  select count(*)
  into general_node_count
  from public.library_nodes
  where parent_id = pharmacology_root_id
    and name = 'General Pharmacology Concepts';

  if general_node_count > 1 then
    raise exception 'Expected at most one General Pharmacology Concepts child, found %',
      general_node_count;
  end if;

  if general_node_count = 0 then
    insert into public.library_nodes (
      library_id,
      parent_id,
      name,
      node_type,
      sort_order
    )
    values (
      pharmacology_library_id,
      pharmacology_root_id,
      'General Pharmacology Concepts',
      'topic',
      0
    )
    returning id into general_node_id;
  else
    select id
    into general_node_id
    from public.library_nodes
    where parent_id = pharmacology_root_id
      and name = 'General Pharmacology Concepts';
  end if;

  insert into public.concept_placements (
    concept_id,
    library_node_id,
    sort_order
  )
  select
    concept_id,
    general_node_id,
    sort_order
  from public.concept_placements
  where library_node_id = pharmacology_root_id
  on conflict (concept_id, library_node_id) do nothing;

  if exists (
    select 1
    from public.concept_placements root_placement
    where root_placement.library_node_id = pharmacology_root_id
      and not exists (
        select 1
        from public.concept_placements general_placement
        where general_placement.library_node_id = general_node_id
          and general_placement.concept_id = root_placement.concept_id
      )
  ) then
    raise exception 'Not all Pharmacology root placements were copied';
  end if;

  delete from public.concept_placements
  where library_node_id = pharmacology_root_id;
end
$migration$;
