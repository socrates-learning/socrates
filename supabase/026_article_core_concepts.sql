-- Task B2: Article to reusable Core Concept authoring.
-- Adds narrow editor/admin RPCs for linking existing concepts, creating draft
-- concepts from an article, and unlinking article-concept relationships.

create or replace function public.link_article_core_concept(
  p_article_id uuid,
  p_concept_id uuid,
  p_section_anchor text default null,
  p_role text default 'discussed'
)
returns public.article_concepts
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  linked_row public.article_concepts%rowtype;
begin
  if caller_id is null then
    raise exception 'Authenticated user is required';
  end if;

  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may link article concepts';
  end if;

  if p_role not in ('primary', 'discussed', 'prerequisite', 'related') then
    raise exception 'Unsupported article concept role';
  end if;

  if not exists (select 1 from public.articles a where a.id = p_article_id) then
    raise exception 'Article was not found';
  end if;

  if not exists (select 1 from public.concepts c where c.id = p_concept_id) then
    raise exception 'Concept was not found';
  end if;

  insert into public.article_concepts (
    article_id,
    concept_id,
    role,
    section_anchor,
    created_by
  )
  values (
    p_article_id,
    p_concept_id,
    p_role,
    nullif(btrim(coalesce(p_section_anchor, '')), ''),
    caller_id
  )
  on conflict (article_id, concept_id, role)
  do update set
    section_anchor = excluded.section_anchor,
    updated_at = now()
  returning * into linked_row;

  return linked_row;
end;
$$;

create or replace function public.create_article_core_concept(
  p_article_id uuid,
  p_name text,
  p_summary text,
  p_active_library_id uuid,
  p_library_node_ids uuid[],
  p_section_anchor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  normalized_placement_ids uuid[];
  placement_node_id uuid;
  new_concept_id uuid;
  linked_row public.article_concepts%rowtype;
begin
  if caller_id is null then
    raise exception 'Authenticated user is required';
  end if;

  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may create article concepts';
  end if;

  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'Concept name is required';
  end if;

  if p_active_library_id is null then
    raise exception 'Active library is required';
  end if;

  if not exists (select 1 from public.articles a where a.id = p_article_id) then
    raise exception 'Article was not found';
  end if;

  select array_agg(distinct placement_id)
  into normalized_placement_ids
  from unnest(coalesce(p_library_node_ids, array[]::uuid[])) as placement_id
  where placement_id is not null;

  if coalesce(array_length(normalized_placement_ids, 1), 0) = 0 then
    raise exception 'At least one concept placement is required';
  end if;

  foreach placement_node_id in array normalized_placement_ids loop
    if not exists (
      select 1
      from public.library_nodes ln
      where ln.id = placement_node_id
        and ln.library_id = p_active_library_id
    ) then
      raise exception 'All concept placements must belong to the active library';
    end if;
  end loop;

  insert into public.concepts (
    name,
    concept_type,
    importance,
    difficulty,
    summary,
    status,
    is_public,
    created_by
  )
  values (
    btrim(p_name),
    'core_concept',
    'Medium',
    'Beginner',
    nullif(btrim(coalesce(p_summary, '')), ''),
    'draft',
    false,
    caller_id
  )
  returning id into new_concept_id;

  foreach placement_node_id in array normalized_placement_ids loop
    insert into public.concept_placements (
      concept_id,
      library_node_id,
      sort_order
    )
    values (
      new_concept_id,
      placement_node_id,
      0
    )
    on conflict (concept_id, library_node_id) do nothing;
  end loop;

  insert into public.article_concepts (
    article_id,
    concept_id,
    role,
    section_anchor,
    created_by
  )
  values (
    p_article_id,
    new_concept_id,
    'discussed',
    nullif(btrim(coalesce(p_section_anchor, '')), ''),
    caller_id
  )
  returning * into linked_row;

  return jsonb_build_object(
    'concept_id', new_concept_id,
    'article_concept_id', linked_row.id,
    'status', 'draft'
  );
end;
$$;

create or replace function public.unlink_article_core_concept(
  p_article_concept_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise exception 'Authenticated user is required';
  end if;

  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may unlink article concepts';
  end if;

  delete from public.article_concepts
  where id = p_article_concept_id;

  return found;
end;
$$;

revoke all on function public.link_article_core_concept(
  uuid,
  uuid,
  text,
  text
) from public;
grant execute on function public.link_article_core_concept(
  uuid,
  uuid,
  text,
  text
) to authenticated;

revoke all on function public.create_article_core_concept(
  uuid,
  text,
  text,
  uuid,
  uuid[],
  text
) from public;
grant execute on function public.create_article_core_concept(
  uuid,
  text,
  text,
  uuid,
  uuid[],
  text
) to authenticated;

revoke all on function public.unlink_article_core_concept(uuid) from public;
grant execute on function public.unlink_article_core_concept(uuid) to authenticated;
