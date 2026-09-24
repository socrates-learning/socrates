-- Atomic owner-scoped personal Topic creation with optional canonical
-- placement beneath an authorized official Topic. This adds one RPC only and
-- does not modify Migration 099 placement storage or any Study contract.

begin;

do $preflight$
begin
  if to_regclass('public.personal_topics') is null
    or to_regclass('public.personal_topic_official_placements') is null
    or to_regclass('public.library_nodes') is null
    or to_regprocedure('public.has_socrates_role()') is null
    or to_regprocedure(
      'public.set_personal_topic_official_placement(uuid,uuid)'
    ) is null
  then
    raise exception 'Migration 100 requires the installed personal Topic and Migration 099 placement foundations';
  end if;

  if to_regprocedure(
    'public.create_personal_topic(text,uuid,uuid,integer)'
  ) is not null then
    raise exception 'Migration 100 atomic personal Topic creation RPC already exists unexpectedly';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_record
    where constraint_record.conrelid =
      'public.personal_topic_official_placements'::regclass
      and constraint_record.conname =
        'personal_topic_official_placements_root_owner_fkey'
      and constraint_record.contype = 'f'
  ) then
    raise exception 'Migration 100 requires the Migration 099 root-owner placement constraint';
  end if;

  if not exists (
    select 1
    from information_schema.columns column_record
    where column_record.table_schema = 'public'
      and column_record.table_name = 'personal_topics'
      and column_record.column_name = 'official_placement_is_root'
      and column_record.is_generated = 'ALWAYS'
  ) then
    raise exception 'Migration 100 requires the generated personal Topic root marker';
  end if;
end;
$preflight$;

create function public.create_personal_topic(
  p_name text,
  p_parent_personal_topic_id uuid default null,
  p_official_library_node_id uuid default null,
  p_sort_order integer default 0
)
returns table (
  id uuid,
  owner_id uuid,
  parent_id uuid,
  name text,
  sort_order integer,
  created_at timestamptz,
  updated_at timestamptz,
  placement_id uuid,
  library_node_id uuid,
  placement_created_at timestamptz,
  placement_updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  normalized_name text := btrim(p_name);
  owned_parent public.personal_topics%rowtype;
  saved_topic public.personal_topics%rowtype;
  saved_placement public.personal_topic_official_placements%rowtype;
begin
  if caller_id is null or not public.has_socrates_role() then
    raise exception 'Approved Socrates access is required to create personal Topics';
  end if;

  if normalized_name is null or normalized_name = '' then
    raise exception 'Topic name is required';
  end if;

  if char_length(normalized_name) > 120 then
    raise exception 'Topic name cannot exceed 120 characters';
  end if;

  if p_parent_personal_topic_id is not null
     and p_official_library_node_id is not null then
    raise exception 'A child personal Topic cannot have a direct official placement';
  end if;

  if p_parent_personal_topic_id is not null then
    select topic.*
    into owned_parent
    from public.personal_topics topic
    where topic.id = p_parent_personal_topic_id
      and topic.owner_id = caller_id
    for update;

    if not found then
      raise exception 'Parent personal Topic was not found for the signed-in owner';
    end if;
  end if;

  insert into public.personal_topics (
    owner_id,
    parent_id,
    name,
    sort_order
  ) values (
    caller_id,
    p_parent_personal_topic_id,
    normalized_name,
    coalesce(p_sort_order, 0)
  )
  returning personal_topics.* into saved_topic;

  if p_official_library_node_id is not null then
    perform *
    from public.set_personal_topic_official_placement(
      saved_topic.id,
      p_official_library_node_id
    );

    select placement.*
    into saved_placement
    from public.personal_topic_official_placements placement
    where placement.personal_topic_id = saved_topic.id
      and placement.owner_id = caller_id;

    if not found then
      raise exception 'Atomic personal Topic placement was not created';
    end if;
  end if;

  return query
  select
    saved_topic.id,
    saved_topic.owner_id,
    saved_topic.parent_id,
    saved_topic.name,
    saved_topic.sort_order,
    saved_topic.created_at,
    saved_topic.updated_at,
    saved_placement.id,
    saved_placement.library_node_id,
    saved_placement.created_at,
    saved_placement.updated_at;
end;
$$;

comment on function public.create_personal_topic(text, uuid, uuid, integer) is
  'Atomically creates the signed-in owner''s personal Topic and, for a root only, optionally places it beneath one authorized active official Topic. A child Topic never receives a direct official placement.';

revoke all on function public.create_personal_topic(text, uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.create_personal_topic(text, uuid, uuid, integer)
  to authenticated;

notify pgrst, 'reload schema';

commit;
