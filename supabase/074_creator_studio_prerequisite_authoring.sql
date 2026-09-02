-- Phase 2B: explicit prerequisite authoring for official Concepts.
--
-- This migration stores authored Concept -> Concept and Concept -> Topic-node
-- edges only. It does not change study eligibility, selection, priority, or any
-- learner-facing scheduler.

create table public.concept_prerequisites (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null
    references public.concepts(id) on delete cascade,
  prerequisite_concept_id uuid
    references public.concepts(id) on delete restrict,
  prerequisite_library_node_id uuid
    references public.library_nodes(id) on delete restrict,
  strength text not null
    constraint concept_prerequisites_strength_check
    check (strength in ('required', 'recommended')),
  created_by uuid
    references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid
    references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint concept_prerequisites_one_target_check
    check (num_nonnulls(prerequisite_concept_id, prerequisite_library_node_id) = 1),
  constraint concept_prerequisites_no_self_check
    check (prerequisite_concept_id is null or prerequisite_concept_id <> concept_id)
);

create unique index concept_prerequisites_concept_target_uidx
  on public.concept_prerequisites(concept_id, prerequisite_concept_id)
  where prerequisite_concept_id is not null;

create unique index concept_prerequisites_topic_target_uidx
  on public.concept_prerequisites(concept_id, prerequisite_library_node_id)
  where prerequisite_library_node_id is not null;

create index concept_prerequisites_prerequisite_concept_idx
  on public.concept_prerequisites(prerequisite_concept_id)
  where prerequisite_concept_id is not null;

create index concept_prerequisites_prerequisite_topic_idx
  on public.concept_prerequisites(prerequisite_library_node_id)
  where prerequisite_library_node_id is not null;

create or replace function public.reject_concept_prerequisite_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.prerequisite_concept_id is null then
    return new;
  end if;

  -- Serialize Concept-edge changes so two concurrent saves cannot create a
  -- cycle after independently passing the recursive check.
  perform pg_advisory_xact_lock(74002002);

  if exists (
    with recursive prerequisite_chain(concept_id) as (
      select new.prerequisite_concept_id
      union
      select edge.prerequisite_concept_id
      from prerequisite_chain chain
      join public.concept_prerequisites edge
        on edge.concept_id = chain.concept_id
      where edge.prerequisite_concept_id is not null
        and edge.id is distinct from new.id
    )
    select 1
    from prerequisite_chain
    where concept_id = new.concept_id
  ) then
    raise exception 'Concept prerequisite would create a cycle';
  end if;

  return new;
end;
$$;

create trigger reject_concept_prerequisite_cycle
  before insert or update of concept_id, prerequisite_concept_id
  on public.concept_prerequisites
  for each row execute function public.reject_concept_prerequisite_cycle();

alter table public.concept_prerequisites enable row level security;

create policy "Editors read concept prerequisites"
  on public.concept_prerequisites
  for select
  to authenticated
  using (public.is_editor_or_admin());

revoke all on table public.concept_prerequisites from public, anon, authenticated;
grant select on table public.concept_prerequisites to authenticated;

create or replace function public.sync_concept_prerequisites(
  p_concept_id uuid,
  p_active_library_id uuid,
  p_prerequisites jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  item jsonb;
  target_type text;
  target_id uuid;
  target_strength text;
  retained_ids uuid[] := array[]::uuid[];
  saved_edge_id uuid;
begin
  if caller_id is null then
    raise exception 'Authenticated user is required';
  end if;
  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may save Concept prerequisites';
  end if;
  if not exists (select 1 from public.concepts where id = p_concept_id) then
    raise exception 'Concept was not found';
  end if;
  if not exists (select 1 from public.libraries where id = p_active_library_id) then
    raise exception 'Active library was not found';
  end if;
  if jsonb_typeof(coalesce(p_prerequisites, '[]'::jsonb)) <> 'array' then
    raise exception 'Concept prerequisites must be a JSON array';
  end if;

  -- The cycle trigger also takes this lock. Taking it once up front makes the
  -- complete replacement deterministic under concurrent authoring saves.
  perform pg_advisory_xact_lock(74002002);

  for item in
    select value from jsonb_array_elements(coalesce(p_prerequisites, '[]'::jsonb))
  loop
    target_type := item ->> 'target_type';
    begin
      target_id := (item ->> 'target_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Prerequisite target identifier is invalid';
    end;
    target_strength := item ->> 'strength';

    if target_type not in ('concept', 'topic') then
      raise exception 'Prerequisite target type must be concept or topic';
    end if;
    if target_strength not in ('required', 'recommended') then
      raise exception 'Prerequisite strength must be required or recommended';
    end if;

    if target_type = 'concept' then
      if target_id = p_concept_id then
        raise exception 'A Concept cannot be its own prerequisite';
      end if;
      if not exists (
        select 1
        from public.concepts target
        join public.concept_placements placement on placement.concept_id = target.id
        join public.library_nodes node on node.id = placement.library_node_id
        where target.id = target_id
          and node.library_id = p_active_library_id
      ) then
        raise exception 'Concept prerequisite target was not found in the active library';
      end if;

      insert into public.concept_prerequisites (
        concept_id, prerequisite_concept_id, strength, created_by, updated_by
      ) values (
        p_concept_id, target_id, target_strength, caller_id, caller_id
      )
      on conflict (concept_id, prerequisite_concept_id)
        where prerequisite_concept_id is not null
      do update set
        strength = excluded.strength,
        updated_by = caller_id,
        updated_at = now()
      returning id into saved_edge_id;
    else
      if not exists (
        select 1
        from public.library_nodes node
        where node.id = target_id
          and node.library_id = p_active_library_id
      ) then
        raise exception 'Topic prerequisite target was not found in the active library';
      end if;

      insert into public.concept_prerequisites (
        concept_id, prerequisite_library_node_id, strength, created_by, updated_by
      ) values (
        p_concept_id, target_id, target_strength, caller_id, caller_id
      )
      on conflict (concept_id, prerequisite_library_node_id)
        where prerequisite_library_node_id is not null
      do update set
        strength = excluded.strength,
        updated_by = caller_id,
        updated_at = now()
      returning id into saved_edge_id;
    end if;

    if saved_edge_id = any(retained_ids) then
      raise exception 'Duplicate prerequisite target';
    end if;
    retained_ids := array_append(retained_ids, saved_edge_id);
  end loop;

  delete from public.concept_prerequisites edge
  where edge.concept_id = p_concept_id
    and not edge.id = any(retained_ids);

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', edge.id,
      'target_type', case
        when edge.prerequisite_concept_id is not null then 'concept'
        else 'topic'
      end,
      'target_id', coalesce(
        edge.prerequisite_concept_id,
        edge.prerequisite_library_node_id
      ),
      'strength', edge.strength
    ) order by edge.created_at, edge.id)
    from public.concept_prerequisites edge
    where edge.concept_id = p_concept_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_concept_prerequisites(p_concept_id uuid)
returns table (
  id uuid,
  target_type text,
  target_id uuid,
  target_name text,
  strength text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may read Concept prerequisites';
  end if;

  return query
  select
    edge.id,
    case when edge.prerequisite_concept_id is not null then 'concept' else 'topic' end,
    coalesce(edge.prerequisite_concept_id, edge.prerequisite_library_node_id),
    coalesce(target_concept.name, target_node.name),
    edge.strength
  from public.concept_prerequisites edge
  left join public.concepts target_concept
    on target_concept.id = edge.prerequisite_concept_id
  left join public.library_nodes target_node
    on target_node.id = edge.prerequisite_library_node_id
  where edge.concept_id = p_concept_id
  order by edge.created_at, edge.id;
end;
$$;

create or replace function public.save_concept_with_prerequisites(
  p_concept_id uuid,
  p_name text,
  p_body_markdown text,
  p_active_library_id uuid,
  p_library_node_ids uuid[],
  p_tag_ids uuid[],
  p_status text,
  p_references jsonb,
  p_prerequisites jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  save_result jsonb;
  saved_concept_id uuid;
  prerequisite_result jsonb;
begin
  -- The existing controlled save remains authoritative for content, tags,
  -- references, lifecycle, placements, and version creation. Any prerequisite
  -- failure aborts this wrapper call and rolls the complete save back.
  save_result := public.save_concept_with_version(
    p_concept_id,
    p_name,
    p_body_markdown,
    p_active_library_id,
    p_library_node_ids,
    p_tag_ids,
    p_status,
    p_references
  );
  saved_concept_id := (save_result ->> 'concept_id')::uuid;
  prerequisite_result := public.sync_concept_prerequisites(
    saved_concept_id,
    p_active_library_id,
    p_prerequisites
  );

  return save_result || jsonb_build_object('prerequisites', prerequisite_result);
end;
$$;

revoke all on function public.reject_concept_prerequisite_cycle() from public;
revoke all on function public.sync_concept_prerequisites(uuid, uuid, jsonb) from public;
revoke all on function public.get_concept_prerequisites(uuid) from public;
revoke all on function public.save_concept_with_prerequisites(
  uuid, text, text, uuid, uuid[], uuid[], text, jsonb, jsonb
) from public;

grant execute on function public.get_concept_prerequisites(uuid) to authenticated;
grant execute on function public.save_concept_with_prerequisites(
  uuid, text, text, uuid, uuid[], uuid[], text, jsonb, jsonb
) to authenticated;
