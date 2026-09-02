-- Study Creator Phase 3D: atomically create a personal Concept and its one
-- approved official placement. Official curriculum rows remain read-only.

begin;

create or replace function public.create_personal_concept_overlay(
  p_personal_topic_id uuid,
  p_name text,
  p_description text,
  p_library_node_id uuid,
  p_official_concept_id uuid default null
)
returns table (
  personal_concept_id uuid,
  overlay_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_library_id uuid;
  created_concept_id uuid;
  created_overlay_id uuid;
begin
  if caller_id is null or not public.has_socrates_role() then
    raise exception 'Approved Socrates access is required to create personal material';
  end if;

  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'Personal Concept name is required';
  end if;

  if char_length(btrim(p_name)) > 160 then
    raise exception 'Personal Concept name must be 160 characters or fewer';
  end if;

  if p_description is not null and char_length(p_description) > 1000 then
    raise exception 'Personal Concept description must be 1000 characters or fewer';
  end if;

  if not exists (
    select 1
    from public.personal_topics topic
    where topic.id = p_personal_topic_id
      and topic.owner_id = caller_id
  ) then
    raise exception 'Choose one of your personal Topics';
  end if;

  select node.library_id
  into target_library_id
  from public.library_nodes node
  join public.libraries library on library.id = node.library_id
  where node.id = p_library_node_id
    and library.status = 'active';

  if target_library_id is null then
    raise exception 'Active official Topic placement was not found';
  end if;

  if not public.is_editor_or_admin()
     and not exists (
       select 1
       from public.user_libraries membership
       where membership.user_id = caller_id
         and membership.library_id = target_library_id
     ) then
    raise exception 'Not authorized for the target Library';
  end if;

  if p_official_concept_id is not null
     and not exists (
       select 1
       from public.concepts concept
       join public.concept_placements placement
         on placement.concept_id = concept.id
        and placement.library_node_id = p_library_node_id
       where concept.id = p_official_concept_id
         and concept.status = 'published'
     ) then
    raise exception 'Official Concept placement must exist and be published';
  end if;

  insert into public.personal_concepts (
    owner_id,
    topic_id,
    name,
    description
  ) values (
    caller_id,
    p_personal_topic_id,
    btrim(p_name),
    nullif(btrim(coalesce(p_description, '')), '')
  )
  returning id into created_concept_id;

  insert into public.personal_concept_official_placements (
    owner_id,
    personal_concept_id,
    library_node_id,
    official_concept_id
  ) values (
    caller_id,
    created_concept_id,
    p_library_node_id,
    p_official_concept_id
  )
  returning id into created_overlay_id;

  return query select created_concept_id, created_overlay_id;
end;
$$;

revoke all on function public.create_personal_concept_overlay(
  uuid, text, text, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.create_personal_concept_overlay(
  uuid, text, text, uuid, uuid
) to authenticated;

notify pgrst, 'reload schema';

commit;
