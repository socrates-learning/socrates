-- Canonical owner-scoped placement of a root personal Topic beneath one
-- authorized official Topic Tree node. This is Creator organization metadata
-- only: personal Concept overlays and all Study behavior remain unchanged.

begin;

do $preflight$
begin
  if to_regclass('public.personal_topics') is null
    or to_regclass('public.personal_concepts') is null
    or to_regclass('public.personal_cards') is null
    or to_regclass('public.personal_concept_official_placements') is null
    or to_regclass('public.libraries') is null
    or to_regclass('public.library_nodes') is null
    or to_regclass('public.user_libraries') is null
    or to_regprocedure('public.has_socrates_role()') is null
    or to_regprocedure('public.is_editor_or_admin()') is null
    or to_regprocedure('public.set_personal_content_updated_at()') is null
  then
    raise exception 'Migration 099 requires the installed personal-content, official-tree, membership, and authorization foundations';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_record
    where constraint_record.conrelid = 'public.personal_topics'::regclass
      and constraint_record.conname = 'personal_topics_id_owner_key'
      and constraint_record.contype = 'u'
  ) then
    raise exception 'Migration 099 requires personal_topics_id_owner_key';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_record
    where constraint_record.conrelid = 'public.user_libraries'::regclass
      and constraint_record.conname = 'user_libraries_pkey'
      and constraint_record.contype = 'p'
  ) then
    raise exception 'Migration 099 requires the canonical user_libraries primary key';
  end if;

  if not exists (
    select 1
    from information_schema.columns column_record
    where column_record.table_schema = 'public'
      and column_record.table_name = 'libraries'
      and column_record.column_name = 'status'
  ) then
    raise exception 'Migration 099 requires libraries.status';
  end if;

  if to_regclass('public.personal_topic_official_placements') is not null
    or to_regprocedure(
      'public.set_personal_topic_official_placement(uuid,uuid)'
    ) is not null
  then
    raise exception 'Migration 099 placement objects already exist unexpectedly';
  end if;

  if exists (
    select 1
    from information_schema.columns column_record
    where column_record.table_schema = 'public'
      and column_record.table_name = 'personal_topics'
      and column_record.column_name in (
        'official_placement_is_root',
        'official_placement_root_required'
      )
  ) then
    raise exception 'Migration 099 personal Topic root-marker columns already exist unexpectedly';
  end if;
end;
$preflight$;

-- The generated marker makes the cross-table root-only invariant enforceable
-- by a real foreign key. Reparenting a placed root changes true -> false and is
-- rejected by the FK, including under concurrent direct-table operations.
alter table public.personal_topics
  add column official_placement_is_root boolean
  generated always as (parent_id is null) stored;

alter table public.personal_topics
  add constraint personal_topics_official_placement_root_key
  unique (id, owner_id, official_placement_is_root);

create table public.personal_topic_official_placements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  personal_topic_id uuid not null,
  library_node_id uuid not null,
  official_placement_root_required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint personal_topic_official_placements_topic_key
    unique (personal_topic_id),
  constraint personal_topic_official_placements_root_required_check
    check (official_placement_root_required),
  constraint personal_topic_official_placements_root_owner_fkey
    foreign key (
      personal_topic_id,
      owner_id,
      official_placement_root_required
    )
    references public.personal_topics (
      id,
      owner_id,
      official_placement_is_root
    )
    on update restrict
    on delete cascade,
  constraint personal_topic_official_placements_node_fkey
    foreign key (library_node_id)
    references public.library_nodes(id)
    on delete cascade
);

create index personal_topic_official_placements_owner_node_idx
  on public.personal_topic_official_placements(
    owner_id,
    library_node_id,
    created_at,
    id
  );

create or replace function public.validate_personal_topic_official_placement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_library_id uuid;
  topic_parent_id uuid;
begin
  if caller_id is null or not public.has_socrates_role() then
    raise exception 'Approved Socrates access is required to manage personal Topic placements';
  end if;

  if new.owner_id is distinct from caller_id then
    raise exception 'Personal Topic placements may only be managed by their owner';
  end if;

  select topic.parent_id
  into topic_parent_id
  from public.personal_topics topic
  where topic.id = new.personal_topic_id
    and topic.owner_id = caller_id
  for update;

  if not found then
    raise exception 'Personal Topic was not found for the signed-in owner';
  end if;

  if topic_parent_id is not null then
    raise exception 'Only a root personal Topic may have an official Topic placement';
  end if;

  select node.library_id
  into target_library_id
  from public.library_nodes node
  join public.libraries library_record
    on library_record.id = node.library_id
  where node.id = new.library_node_id
    and library_record.status = 'active';

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

  return new;
end;
$$;

create trigger validate_personal_topic_official_placement
  before insert or update of owner_id, personal_topic_id, library_node_id
  on public.personal_topic_official_placements
  for each row execute function public.validate_personal_topic_official_placement();

create trigger set_personal_topic_official_placements_updated_at
  before update on public.personal_topic_official_placements
  for each row execute function public.set_personal_content_updated_at();

alter table public.personal_topic_official_placements enable row level security;

create policy "Users read own personal Topic official placements"
  on public.personal_topic_official_placements
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.has_socrates_role()
  );

create policy "Users create own personal Topic official placements"
  on public.personal_topic_official_placements
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.has_socrates_role()
    and exists (
      select 1
      from public.library_nodes node
      join public.libraries library_record
        on library_record.id = node.library_id
      where node.id = personal_topic_official_placements.library_node_id
        and library_record.status = 'active'
        and (
          public.is_editor_or_admin()
          or exists (
            select 1
            from public.user_libraries membership
            where membership.user_id = (select auth.uid())
              and membership.library_id = node.library_id
          )
        )
    )
  );

create policy "Users update own personal Topic official placements"
  on public.personal_topic_official_placements
  for update
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.has_socrates_role()
  )
  with check (
    owner_id = (select auth.uid())
    and public.has_socrates_role()
    and exists (
      select 1
      from public.library_nodes node
      join public.libraries library_record
        on library_record.id = node.library_id
      where node.id = personal_topic_official_placements.library_node_id
        and library_record.status = 'active'
        and (
          public.is_editor_or_admin()
          or exists (
            select 1
            from public.user_libraries membership
            where membership.user_id = (select auth.uid())
              and membership.library_id = node.library_id
          )
        )
    )
  );

create policy "Users delete own personal Topic official placements"
  on public.personal_topic_official_placements
  for delete
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.has_socrates_role()
  );

revoke all on table public.personal_topic_official_placements
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.personal_topic_official_placements
  to authenticated;

revoke all on function public.validate_personal_topic_official_placement()
  from public, anon, authenticated;

create function public.set_personal_topic_official_placement(
  p_personal_topic_id uuid,
  p_library_node_id uuid
)
returns table (
  personal_topic_id uuid,
  owner_id uuid,
  library_node_id uuid,
  placement_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  owned_topic public.personal_topics%rowtype;
  saved_placement public.personal_topic_official_placements%rowtype;
  target_library_id uuid;
begin
  if caller_id is null or not public.has_socrates_role() then
    raise exception 'Approved Socrates access is required to manage personal Topic placements';
  end if;

  if p_personal_topic_id is null then
    raise exception 'Personal Topic is required';
  end if;

  select topic.*
  into owned_topic
  from public.personal_topics topic
  where topic.id = p_personal_topic_id
    and topic.owner_id = caller_id
  for update;

  if not found then
    raise exception 'Personal Topic was not found for the signed-in owner';
  end if;

  if owned_topic.parent_id is not null then
    raise exception 'Only a root personal Topic may have an official Topic placement';
  end if;

  if p_library_node_id is null then
    delete from public.personal_topic_official_placements placement
    where placement.personal_topic_id = owned_topic.id
      and placement.owner_id = caller_id;

    return query
    select owned_topic.id, caller_id, null::uuid, null::uuid,
      null::timestamptz, null::timestamptz;
    return;
  end if;

  select node.library_id
  into target_library_id
  from public.library_nodes node
  join public.libraries library_record
    on library_record.id = node.library_id
  where node.id = p_library_node_id
    and library_record.status = 'active';

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

  insert into public.personal_topic_official_placements (
    owner_id,
    personal_topic_id,
    library_node_id
  ) values (
    caller_id,
    owned_topic.id,
    p_library_node_id
  )
  on conflict on constraint personal_topic_official_placements_topic_key do update
  set owner_id = excluded.owner_id,
      library_node_id = excluded.library_node_id
  where personal_topic_official_placements.owner_id = caller_id
  returning personal_topic_official_placements.* into saved_placement;

  if saved_placement.id is null then
    raise exception 'Personal Topic placement was not available to the signed-in owner';
  end if;

  return query
  select
    saved_placement.personal_topic_id,
    saved_placement.owner_id,
    saved_placement.library_node_id,
    saved_placement.id,
    saved_placement.created_at,
    saved_placement.updated_at;
end;
$$;

comment on table public.personal_topic_official_placements is
  'Owner-scoped canonical placement of one root personal Topic beneath one authorized official Topic Tree node. Child personal Topics inherit presentation context through personal_topics.parent_id.';

comment on function public.set_personal_topic_official_placement(uuid, uuid) is
  'Idempotently sets, moves, or removes the signed-in owner''s one official placement for a root personal Topic. A NULL official node removes only the placement.';

revoke all on function public.set_personal_topic_official_placement(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.set_personal_topic_official_placement(uuid, uuid)
  to authenticated;

notify pgrst, 'reload schema';

commit;
