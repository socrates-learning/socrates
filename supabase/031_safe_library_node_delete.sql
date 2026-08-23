-- Safe Knowledge Tree topic deletion.
-- Editors/admins may delete only empty, unused topics.
-- Topics with subtopics, concept placements, article placements,
-- or learner study selections must be cleaned up first.

create or replace function public.delete_empty_library_node_in_library(
  p_library_id uuid,
  p_node_id uuid
)
returns public.library_nodes
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_node public.library_nodes%rowtype;
  deleted_node public.library_nodes%rowtype;
begin
  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may remove library topics';
  end if;

  if p_library_id is null then
    raise exception 'Library is required';
  end if;

  if p_node_id is null then
    raise exception 'Topic is required';
  end if;

  select *
  into target_node
  from public.library_nodes ln
  where ln.id = p_node_id;

  if target_node.id is null then
    raise exception 'Topic was not found';
  end if;

  if target_node.library_id is distinct from p_library_id then
    raise exception 'Topic does not belong to the active library';
  end if;

  -- Never allow deletion of the library root.
  if target_node.parent_id is null then
    raise exception 'The library root cannot be removed';
  end if;

  -- Protect nested taxonomy.
  if exists (
    select 1
    from public.library_nodes child
    where child.parent_id = p_node_id
  ) then
    raise exception
      'This topic contains subtopics. Move or remove those subtopics first';
  end if;

  -- Protect concepts linked to this topic.
  if exists (
    select 1
    from public.concept_placements cp
    where cp.library_node_id = p_node_id
  ) then
    raise exception
      'This topic is linked to one or more concepts. Remove those topic assignments first';
  end if;

  -- Protect articles linked to this topic.
  if exists (
    select 1
    from public.article_category_placements acp
    where acp.library_node_id = p_node_id
  ) then
    raise exception
      'This topic is linked to one or more articles. Remove those article locations first';
  end if;

  -- Protect learner/deck selections.
  if exists (
    select 1
    from public.user_study_node_selections usns
    where usns.node_id = p_node_id
  ) then
    raise exception
      'This topic is currently used in a study deck. Remove the study selection first';
  end if;

  delete from public.library_nodes
  where id = p_node_id
  returning * into deleted_node;

  return deleted_node;
end;
$$;

revoke all on function public.delete_empty_library_node_in_library(
  uuid,
  uuid
) from public;

grant execute on function public.delete_empty_library_node_in_library(
  uuid,
  uuid
) to authenticated;