-- Creator consolidation stabilization: atomically update an existing personal
-- Concept and its optional placement in an authorized official context.
-- New personal Concept creation remains on create_personal_concept_overlay().

begin;

do $$
begin
  if to_regclass('public.personal_concepts') is null
    or to_regclass('public.personal_topics') is null
    or to_regclass('public.personal_concept_official_placements') is null
    or to_regclass('public.library_nodes') is null
    or to_regclass('public.libraries') is null
    or to_regclass('public.concepts') is null
    or to_regclass('public.concept_placements') is null
    or to_regprocedure('public.has_socrates_role()') is null
    or to_regprocedure('public.is_editor_or_admin()') is null
  then
    raise exception 'Migration 095 requires the installed personal-content and official-overlay foundations';
  end if;
end;
$$;

create function public.save_personal_concept_with_overlay(
  p_personal_concept_id uuid,
  p_personal_topic_id uuid,
  p_name text,
  p_description text,
  p_source_reference text default null,
  p_library_node_id uuid default null,
  p_official_concept_id uuid default null
)
returns table (
  personal_concept_id uuid,
  owner_id uuid,
  topic_id uuid,
  concept_name text,
  concept_description text,
  concept_source_reference text,
  concept_created_at timestamptz,
  concept_updated_at timestamptz,
  overlay_id uuid,
  overlay_library_node_id uuid,
  overlay_official_concept_id uuid,
  overlay_created_at timestamptz,
  overlay_updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  existing_concept public.personal_concepts%rowtype;
  saved_concept public.personal_concepts%rowtype;
  saved_overlay public.personal_concept_official_placements%rowtype;
  target_library_id uuid;
begin
  if caller_id is null or not public.has_socrates_role() then
    raise exception 'Approved Socrates access is required to save personal material';
  end if;

  if p_personal_concept_id is null then
    raise exception 'Personal Concept ID is required';
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

  select concept.*
  into existing_concept
  from public.personal_concepts concept
  where concept.id = p_personal_concept_id
    and concept.owner_id = caller_id
  for update;

  if not found then
    raise exception 'Personal Concept was not found for the signed-in owner';
  end if;

  if not exists (
    select 1
    from public.personal_topics topic
    where topic.id = p_personal_topic_id
      and topic.owner_id = caller_id
  ) then
    raise exception 'Choose one of your personal Topics';
  end if;

  if p_library_node_id is null and p_official_concept_id is not null then
    raise exception 'An official Concept overlay requires an official Topic placement';
  end if;

  update public.personal_concepts concept
  set topic_id = p_personal_topic_id,
      name = btrim(p_name),
      description = nullif(btrim(coalesce(p_description, '')), ''),
      source_reference = nullif(btrim(coalesce(p_source_reference, '')), '')
  where concept.id = existing_concept.id
    and concept.owner_id = caller_id
  returning concept.* into saved_concept;

  if p_library_node_id is null then
    delete from public.personal_concept_official_placements placement
    where placement.personal_concept_id = existing_concept.id
      and placement.owner_id = caller_id;
  else
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
         from public.concepts official_concept
         join public.concept_placements placement
           on placement.concept_id = official_concept.id
          and placement.library_node_id = p_library_node_id
         where official_concept.id = p_official_concept_id
           and official_concept.status = 'published'
       ) then
      raise exception 'Official Concept placement must exist and be published';
    end if;

    insert into public.personal_concept_official_placements (
      owner_id,
      personal_concept_id,
      library_node_id,
      official_concept_id
    ) values (
      caller_id,
      existing_concept.id,
      p_library_node_id,
      p_official_concept_id
    )
    on conflict on constraint personal_concept_official_placements_concept_key do update
    set owner_id = excluded.owner_id,
        library_node_id = excluded.library_node_id,
        official_concept_id = excluded.official_concept_id
    where personal_concept_official_placements.owner_id = caller_id
    returning personal_concept_official_placements.* into saved_overlay;

    if saved_overlay.id is null then
      raise exception 'Personal Concept overlay was not available to the signed-in owner';
    end if;
  end if;

  return query
  select
    saved_concept.id,
    saved_concept.owner_id,
    saved_concept.topic_id,
    saved_concept.name,
    saved_concept.description,
    saved_concept.source_reference,
    saved_concept.created_at,
    saved_concept.updated_at,
    saved_overlay.id,
    saved_overlay.library_node_id,
    saved_overlay.official_concept_id,
    saved_overlay.created_at,
    saved_overlay.updated_at;
end;
$$;

comment on function public.save_personal_concept_with_overlay(
  uuid, uuid, text, text, text, uuid, uuid
) is
  'Atomically updates one owned personal Concept and upserts or detaches its optional authorized official overlay.';

revoke all on function public.save_personal_concept_with_overlay(
  uuid, uuid, text, text, text, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.save_personal_concept_with_overlay(
  uuid, uuid, text, text, text, uuid, uuid
) to authenticated;

notify pgrst, 'reload schema';

commit;
