-- Phase 2A: Library Foundation Normalization
-- Normalizes Medicine into a real library without changing content visibility,
-- concept placements, RLS policies, or application behavior.

alter table public.libraries
  add column if not exists slug text;

alter table public.libraries
  add column if not exists status text;

update public.libraries
set slug = case lower(btrim(name))
  when 'pharmacology' then 'pharmacology'
  when 'physiology' then 'physiology'
  when 'pathophysiology' then 'pathophysiology'
  when 'medicine' then 'medicine'
  else lower(regexp_replace(regexp_replace(btrim(name), '[^a-zA-Z0-9]+', '-', 'g'), '(^-|-$)', '', 'g'))
end
where slug is null
  or btrim(slug) = '';

update public.libraries
set status = 'active'
where status is null
  or btrim(status) = '';

do $$
begin
  if exists (
    select 1
    from public.libraries
    where status not in ('active', 'inactive', 'archived')
  ) then
    raise exception 'Cannot add libraries_status_check: invalid library status values exist';
  end if;

  if exists (
    select 1
    from public.libraries
    where slug is not null
      and btrim(slug) <> ''
    group by slug
    having count(*) > 1
  ) then
    raise exception 'Cannot add unique library slug index: duplicate library slugs exist';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'libraries_status_check'
      and conrelid = 'public.libraries'::regclass
  ) then
    alter table public.libraries
      add constraint libraries_status_check
      check (status in ('active', 'inactive', 'archived'));
  end if;
end
$$;

create unique index if not exists libraries_slug_unique_idx
  on public.libraries(slug)
  where slug is not null;

create index if not exists library_nodes_library_id_idx
  on public.library_nodes(library_id);

create index if not exists library_nodes_parent_id_idx
  on public.library_nodes(parent_id);

create index if not exists concept_placements_library_node_id_idx
  on public.concept_placements(library_node_id);

create index if not exists concept_placements_concept_id_idx
  on public.concept_placements(concept_id);

do $$
declare
  medicine_library_id uuid;
  medicine_root_id uuid;
  medicine_subtree_count integer;
  medicine_non_null_different_count integer;
  pharmacology_library_id uuid;
  pharmacology_node_count integer;
  pre_concepts_count bigint;
  pre_placements_count bigint;
  pre_relationships_count bigint;
  pre_learn_sections_count bigint;
  pre_sources_count bigint;
  pre_attribution_count bigint;
  pre_review_attempts_count bigint;
  pre_user_notes_count bigint;
begin
  create temp table phase2a_pre_nodes on commit drop as
    select id, parent_id, library_id
    from public.library_nodes;

  create temp table phase2a_pre_placements on commit drop as
    select id, concept_id, library_node_id, sort_order
    from public.concept_placements;

  select count(*) into pre_concepts_count from public.concepts;
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
    and lower(btrim(name)) = 'pharmacology';

  if pharmacology_library_id is null then
    raise exception 'Expected existing Pharmacology library was not found';
  end if;

  select count(*)
  into pharmacology_node_count
  from public.library_nodes
  where library_id = pharmacology_library_id;

  if pharmacology_node_count <> 5 then
    raise exception 'Expected 5 Pharmacology library nodes before normalization, found %',
      pharmacology_node_count;
  end if;

  select id
  into medicine_library_id
  from public.libraries
  where slug = 'medicine'
     or lower(btrim(name)) = 'medicine'
  order by case when slug = 'medicine' then 0 else 1 end, created_at, id
  limit 1;

  if medicine_library_id is null then
    insert into public.libraries (name, description, slug, status)
    values (
      'Medicine',
      'Comprehensive medical school and clinical medicine curriculum.',
      'medicine',
      'active'
    )
    returning id into medicine_library_id;
  else
    update public.libraries
    set name = case when btrim(name) = '' then 'Medicine' else name end,
        description = coalesce(description, 'Comprehensive medical school and clinical medicine curriculum.'),
        slug = 'medicine',
        status = coalesce(status, 'active')
    where id = medicine_library_id;
  end if;

  if (
    select count(*)
    from public.libraries
    where slug = 'medicine'
  ) <> 1 then
    raise exception 'Expected exactly one Medicine library by slug after normalization';
  end if;

  select id
  into medicine_root_id
  from public.library_nodes
  where parent_id is null
    and lower(btrim(name)) = 'medicine';

  if medicine_root_id is null then
    raise exception 'Medicine root library_node was not found';
  end if;

  if (
    select count(*)
    from public.library_nodes
    where parent_id is null
      and lower(btrim(name)) = 'medicine'
  ) <> 1 then
    raise exception 'Expected exactly one Medicine root library_node';
  end if;

  with recursive medicine_tree as (
    select id, parent_id, library_id
    from public.library_nodes
    where id = medicine_root_id

    union all

    select child.id, child.parent_id, child.library_id
    from public.library_nodes child
    join medicine_tree parent on parent.id = child.parent_id
  )
  select count(*),
         count(*) filter (
           where library_id is not null
             and library_id <> medicine_library_id
         )
  into medicine_subtree_count,
       medicine_non_null_different_count
  from medicine_tree;

  if medicine_subtree_count <> 300 then
    raise exception 'Medicine subtree validation failed: expected 300 nodes, found %',
      medicine_subtree_count;
  end if;

  if medicine_non_null_different_count <> 0 then
    raise exception 'Medicine subtree contains nodes assigned to a different library';
  end if;

  with recursive medicine_tree as (
    select id
    from public.library_nodes
    where id = medicine_root_id

    union all

    select child.id
    from public.library_nodes child
    join medicine_tree parent on parent.id = child.parent_id
  )
  update public.library_nodes ln
  set library_id = medicine_library_id
  from medicine_tree mt
  where ln.id = mt.id
    and ln.library_id is distinct from medicine_library_id;

  if exists (
    select 1
    from phase2a_pre_nodes pre
    full join public.library_nodes post on post.id = pre.id
    where pre.id is null
       or post.id is null
       or post.parent_id is distinct from pre.parent_id
  ) then
    raise exception 'Library node ID or parent relationship changed unexpectedly';
  end if;

  if exists (
    select 1
    from public.library_nodes ln
    join phase2a_pre_nodes pre on pre.id = ln.id
    where pre.library_id = pharmacology_library_id
      and ln.library_id is distinct from pharmacology_library_id
  ) then
    raise exception 'Existing Pharmacology nodes did not retain their original library ID';
  end if;

  if exists (
    select 1
    from phase2a_pre_placements pre
    full join public.concept_placements post on post.id = pre.id
    where pre.id is null
       or post.id is null
       or post.concept_id is distinct from pre.concept_id
       or post.library_node_id is distinct from pre.library_node_id
       or post.sort_order is distinct from pre.sort_order
  ) then
    raise exception 'Concept placements changed unexpectedly';
  end if;

  if (select count(*) from public.concepts) <> pre_concepts_count then
    raise exception 'Concept count changed unexpectedly';
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

  if exists (
    select 1
    from public.libraries
    where slug is null
       or btrim(slug) = ''
       or status not in ('active', 'inactive', 'archived')
  ) then
    raise exception 'Library slug/status backfill validation failed';
  end if;

  with recursive medicine_tree as (
    select id, library_id
    from public.library_nodes
    where id = medicine_root_id

    union all

    select child.id, child.library_id
    from public.library_nodes child
    join medicine_tree parent on parent.id = child.parent_id
  )
  select count(*) filter (where library_id is null or library_id <> medicine_library_id)
  into medicine_non_null_different_count
  from medicine_tree;

  if medicine_non_null_different_count <> 0 then
    raise exception 'Medicine subtree has nodes without the Medicine library ID after normalization';
  end if;

  if to_regclass('public.category_trees') is not null
    or to_regclass('public.category_nodes') is not null
    or to_regclass('public.concept_category_links') is not null
    or to_regclass('public.labels') is not null
    or to_regclass('public.concept_labels') is not null then
    raise exception 'Legacy flexible taxonomy tables must not be created by Phase 2A';
  end if;
end
$$;
