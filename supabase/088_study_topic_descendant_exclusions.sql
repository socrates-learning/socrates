-- Sparse descendant exclusions for official Set Up Deck Topic selections.
--
-- Existing user_study_node_selections remain explicit subtree includes. This
-- additive table stores only exception roots, so all existing decks keep their
-- current meaning and selecting a large parent never writes every descendant.

begin;

create table public.study_deck_node_exclusions (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  library_id uuid not null references public.libraries(id) on delete cascade,
  node_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_deck_node_exclusions_deck_node_key
    unique (deck_id, node_id),
  constraint study_deck_node_exclusions_deck_owner_library_fkey
    foreign key (deck_id, user_id, library_id)
    references public.study_decks(id, user_id, library_id)
    on delete cascade,
  constraint study_deck_node_exclusions_node_library_fkey
    foreign key (node_id, library_id)
    references public.library_nodes(id, library_id)
    on delete restrict
);

create index study_deck_node_exclusions_user_library_idx
  on public.study_deck_node_exclusions(user_id, library_id);
create index study_deck_node_exclusions_node_id_idx
  on public.study_deck_node_exclusions(node_id);

create trigger set_study_deck_node_exclusions_updated_at
  before update on public.study_deck_node_exclusions
  for each row execute function public.set_user_study_selection_updated_at();

alter table public.study_deck_node_exclusions enable row level security;

create policy "Users read own study deck node exclusions"
  on public.study_deck_node_exclusions
  for select
  to authenticated
  using (
    public.has_socrates_role()
    and exists (
      select 1
      from public.study_decks deck
      where deck.id = study_deck_node_exclusions.deck_id
        and deck.user_id = (select auth.uid())
        and study_deck_node_exclusions.user_id = deck.user_id
        and study_deck_node_exclusions.library_id = deck.library_id
    )
  );

-- Direct deletion is retained for the existing Clear Deck operation. Inserts
-- and all include/exclude transitions go through the atomic RPC below.
create policy "Users delete own study deck node exclusions"
  on public.study_deck_node_exclusions
  for delete
  to authenticated
  using (
    public.has_socrates_role()
    and exists (
      select 1
      from public.study_decks deck
      where deck.id = study_deck_node_exclusions.deck_id
        and deck.user_id = (select auth.uid())
        and study_deck_node_exclusions.user_id = deck.user_id
        and study_deck_node_exclusions.library_id = deck.library_id
    )
  );

revoke all on table public.study_deck_node_exclusions
  from public, anon, authenticated;
grant select, delete on table public.study_deck_node_exclusions
  to authenticated;

-- Resolve the closest explicit include/exclude directive for every covered
-- node. A more-specific directive wins; exclusion wins the impossible tie so
-- malformed direct writes fail closed. Cycles terminate without looping.
create or replace function public.resolve_effective_study_nodes(
  p_deck_id uuid
)
returns table (
  node_id uuid,
  source_node_id uuid,
  source_state text,
  source_distance integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive deck as (
    select study_deck.id, study_deck.user_id, study_deck.library_id
    from public.study_decks study_deck
    where study_deck.id = p_deck_id
      and study_deck.user_id = (select auth.uid())
      and public.has_socrates_role()
      and (
        public.is_editor_or_admin()
        or exists (
          select 1
          from public.user_libraries membership
          where membership.user_id = (select auth.uid())
            and membership.library_id = study_deck.library_id
        )
      )
  ),
  directive_roots as (
    select
      selection.node_id as source_node_id,
      selection.node_id,
      'included'::text as source_state,
      0::integer as source_distance,
      array[selection.node_id]::uuid[] as visited
    from deck
    join public.user_study_node_selections selection
      on selection.deck_id = deck.id
     and selection.user_id = deck.user_id
     and selection.library_id = deck.library_id

    union all

    select
      exclusion.node_id as source_node_id,
      exclusion.node_id,
      'excluded'::text as source_state,
      0::integer as source_distance,
      array[exclusion.node_id]::uuid[] as visited
    from deck
    join public.study_deck_node_exclusions exclusion
      on exclusion.deck_id = deck.id
     and exclusion.user_id = deck.user_id
     and exclusion.library_id = deck.library_id
  ),
  directives as (
    select root.*
    from directive_roots root

    union all

    select
      directive.source_node_id,
      child.id,
      directive.source_state,
      directive.source_distance + 1,
      directive.visited || child.id
    from directives directive
    join public.library_nodes child
      on child.parent_id = directive.node_id
     and not child.id = any(directive.visited)
    join deck on deck.library_id = child.library_id
  ),
  ranked as (
    select
      directive.node_id,
      directive.source_node_id,
      directive.source_state,
      directive.source_distance,
      row_number() over (
        partition by directive.node_id
        order by
          directive.source_distance,
          case directive.source_state when 'excluded' then 0 else 1 end,
          directive.source_node_id
      ) as directive_rank
    from directives directive
  )
  select
    ranked.node_id,
    ranked.source_node_id,
    ranked.source_state,
    ranked.source_distance
  from ranked
  where ranked.directive_rank = 1
    and ranked.source_state = 'included';
$$;

revoke all on function public.resolve_effective_study_nodes(uuid)
  from public, anon, authenticated;

-- Apply a whole-branch checkbox action atomically. Checking a partial branch
-- clears descendant exceptions and stores the smallest required include.
-- Unchecking clears nested directives and stores one exclusion only when an
-- outside selected ancestor would otherwise keep the branch included.
create or replace function public.set_study_deck_node_selection(
  p_deck_id uuid,
  p_node_id uuid,
  p_should_include boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_deck public.study_decks%rowtype;
  selected_ids jsonb;
  excluded_ids jsonb;
begin
  if current_user_id is null or not public.has_socrates_role() then
    raise exception 'Not authorized to update this Study deck.';
  end if;

  select deck.*
  into target_deck
  from public.study_decks deck
  where deck.id = p_deck_id
    and deck.user_id = current_user_id
    and deck.is_active
    and (
      public.is_editor_or_admin()
      or exists (
        select 1
        from public.user_libraries membership
        where membership.user_id = current_user_id
          and membership.library_id = deck.library_id
      )
    )
  for update;

  if target_deck.id is null then
    raise exception 'Active Study deck not found.';
  end if;

  if p_should_include is null then
    raise exception 'Topic selection state is required.';
  end if;

  perform 1
  from public.library_nodes node
  where node.id = p_node_id
    and node.library_id = target_deck.library_id
  for share;

  if not found then
    raise exception 'Topic does not belong to this Study deck Library.';
  end if;

  -- A branch click is a complete instruction for that branch. Remove older
  -- nested directives first so hidden exceptions cannot surprise the learner.
  with recursive subtree(id, visited) as (
    select node.id, array[node.id]::uuid[]
    from public.library_nodes node
    where node.id = p_node_id
      and node.library_id = target_deck.library_id

    union all

    select child.id, parent.visited || child.id
    from subtree parent
    join public.library_nodes child
      on child.parent_id = parent.id
     and child.library_id = target_deck.library_id
     and not child.id = any(parent.visited)
  )
  delete from public.user_study_node_selections selection
  using subtree
  where selection.deck_id = target_deck.id
    and selection.node_id = subtree.id;

  with recursive subtree(id, visited) as (
    select node.id, array[node.id]::uuid[]
    from public.library_nodes node
    where node.id = p_node_id
      and node.library_id = target_deck.library_id

    union all

    select child.id, parent.visited || child.id
    from subtree parent
    join public.library_nodes child
      on child.parent_id = parent.id
     and child.library_id = target_deck.library_id
     and not child.id = any(parent.visited)
  )
  delete from public.study_deck_node_exclusions exclusion
  using subtree
  where exclusion.deck_id = target_deck.id
    and exclusion.node_id = subtree.id;

  if p_should_include then
    if not exists (
      select 1
      from public.resolve_effective_study_nodes(target_deck.id) effective
      where effective.node_id = p_node_id
    ) then
      insert into public.user_study_node_selections (
        deck_id,
        user_id,
        library_id,
        node_id
      )
      values (
        target_deck.id,
        current_user_id,
        target_deck.library_id,
        p_node_id
      );
    end if;
  elsif exists (
    select 1
    from public.resolve_effective_study_nodes(target_deck.id) effective
    where effective.node_id = p_node_id
  ) then
    insert into public.study_deck_node_exclusions (
      deck_id,
      user_id,
      library_id,
      node_id
    )
    values (
      target_deck.id,
      current_user_id,
      target_deck.library_id,
      p_node_id
    );
  end if;

  select coalesce(
    jsonb_agg(selection.node_id order by selection.node_id::text),
    '[]'::jsonb
  )
  into selected_ids
  from public.user_study_node_selections selection
  where selection.deck_id = target_deck.id;

  select coalesce(
    jsonb_agg(exclusion.node_id order by exclusion.node_id::text),
    '[]'::jsonb
  )
  into excluded_ids
  from public.study_deck_node_exclusions exclusion
  where exclusion.deck_id = target_deck.id;

  return jsonb_build_object(
    'selected_node_ids', selected_ids,
    'excluded_node_ids', excluded_ids
  );
end;
$$;

revoke all on function public.set_study_deck_node_selection(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.set_study_deck_node_selection(uuid, uuid, boolean)
  to authenticated;

-- Concept precedence remains compatible with the released model:
-- effective Topic nodes establish defaults; explicit Concept exclusions remove
-- individual Concepts; explicit Concept includes restore them even when their
-- containing Topic subtree is excluded.
create or replace function public.resolve_study_deck(
  p_deck_id uuid
)
returns table (
  concept_id uuid,
  concept_name text,
  concept_type text,
  summary text,
  published_question_count bigint,
  selection_source text
)
language sql
stable
security definer
set search_path = ''
as $$
  with deck as (
    select study_deck.id, study_deck.user_id, study_deck.library_id
    from public.study_decks study_deck
    where study_deck.id = p_deck_id
      and study_deck.user_id = (select auth.uid())
      and public.has_socrates_role()
      and (
        public.is_editor_or_admin()
        or exists (
          select 1
          from public.user_libraries membership
          where membership.user_id = (select auth.uid())
            and membership.library_id = study_deck.library_id
        )
      )
  ),
  effective_nodes as (
    select effective.node_id
    from deck
    cross join lateral public.resolve_effective_study_nodes(deck.id) effective
  ),
  branch_concepts as (
    select distinct placement.concept_id
    from effective_nodes effective
    join public.concept_placements placement
      on placement.library_node_id = effective.node_id
    join public.concepts concept on concept.id = placement.concept_id
    where concept.status = 'published'
  ),
  included_concepts as (
    select distinct override.concept_id
    from public.user_study_concept_overrides override
    join deck on deck.id = override.deck_id
    join public.concepts concept on concept.id = override.concept_id
    where override.user_id = deck.user_id
      and override.library_id = deck.library_id
      and override.selection_state = 'included'
      and concept.status = 'published'
      and exists (
        select 1
        from public.concept_placements placement
        join public.library_nodes node on node.id = placement.library_node_id
        where placement.concept_id = override.concept_id
          and node.library_id = deck.library_id
      )
  ),
  excluded_concepts as (
    select distinct override.concept_id
    from public.user_study_concept_overrides override
    join deck on deck.id = override.deck_id
    where override.user_id = deck.user_id
      and override.library_id = deck.library_id
      and override.selection_state = 'excluded'
  ),
  effective_concepts as (
    select branch.concept_id, 'branch'::text as selection_source
    from branch_concepts branch
    where branch.concept_id not in (
      select excluded.concept_id from excluded_concepts excluded
    )

    union

    select included.concept_id, 'included'::text as selection_source
    from included_concepts included
  )
  select
    concept.id,
    concept.name,
    concept.concept_type,
    concept.summary,
    count(question.id) filter (where question.status = 'published'),
    min(effective.selection_source)
  from effective_concepts effective
  join public.concepts concept on concept.id = effective.concept_id
  left join public.questions question on question.concept_id = concept.id
  where concept.status = 'published'
  group by concept.id, concept.name, concept.concept_type, concept.summary
  order by concept.name;
$$;

revoke all on function public.resolve_study_deck(uuid)
  from public, anon, authenticated;
grant execute on function public.resolve_study_deck(uuid)
  to authenticated;

alter table public.study_sessions
  alter column selection_snapshot set default jsonb_build_object(
    'selected_node_ids', '[]'::jsonb,
    'excluded_node_ids', '[]'::jsonb,
    'concept_overrides', '{}'::jsonb,
    'node_preferences', '{}'::jsonb,
    'cram_mode', false
  );

create or replace function public.start_study_session(
  p_study_deck_id uuid,
  p_new_mastery_balance integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_deck public.study_decks%rowtype;
  snapshot jsonb;
  session_balance integer;
  new_session_id uuid;
begin
  if current_user_id is null or not public.has_socrates_role() then
    raise exception 'Not authorized to start a study session.';
  end if;

  if p_new_mastery_balance is null or p_new_mastery_balance not between 0 and 100 then
    raise exception 'Study balance must be between 0 and 100.';
  end if;

  select deck.*
  into target_deck
  from public.study_decks deck
  where deck.id = p_study_deck_id
    and deck.user_id = current_user_id
    and deck.is_active;

  if target_deck.id is null then
    raise exception 'Active study deck not found.';
  end if;

  if not exists (
    select 1
    from public.resolve_study_candidates(target_deck.id) candidate
  ) then
    raise exception 'No eligible Study candidates are available for this deck.';
  end if;

  select coalesce(
    round(avg(coalesce(preference.new_mastery_balance, 50)))::integer,
    p_new_mastery_balance
  )
  into session_balance
  from public.user_study_node_selections selection
  left join public.study_deck_node_preferences preference
    on preference.deck_id = selection.deck_id
   and preference.library_node_id = selection.node_id
  where selection.deck_id = target_deck.id
    and selection.user_id = current_user_id
    and selection.library_id = target_deck.library_id;

  select jsonb_build_object(
    'selected_node_ids',
    coalesce(
      (
        select jsonb_agg(selection.node_id order by selection.node_id::text)
        from public.user_study_node_selections selection
        where selection.deck_id = target_deck.id
          and selection.user_id = current_user_id
          and selection.library_id = target_deck.library_id
      ),
      '[]'::jsonb
    ),
    'excluded_node_ids',
    coalesce(
      (
        select jsonb_agg(exclusion.node_id order by exclusion.node_id::text)
        from public.study_deck_node_exclusions exclusion
        where exclusion.deck_id = target_deck.id
          and exclusion.user_id = current_user_id
          and exclusion.library_id = target_deck.library_id
      ),
      '[]'::jsonb
    ),
    'concept_overrides',
    coalesce(
      (
        select jsonb_object_agg(
          override.concept_id::text,
          override.selection_state
          order by override.concept_id::text
        )
        from public.user_study_concept_overrides override
        where override.deck_id = target_deck.id
          and override.user_id = current_user_id
          and override.library_id = target_deck.library_id
      ),
      '{}'::jsonb
    ),
    'node_preferences',
    coalesce(
      (
        select jsonb_object_agg(
          selection.node_id::text,
          coalesce(preference.new_mastery_balance, 50)
          order by selection.node_id::text
        )
        from public.user_study_node_selections selection
        left join public.study_deck_node_preferences preference
          on preference.deck_id = selection.deck_id
         and preference.library_node_id = selection.node_id
        where selection.deck_id = target_deck.id
          and selection.user_id = current_user_id
          and selection.library_id = target_deck.library_id
      ),
      '{}'::jsonb
    ),
    'cram_mode', target_deck.cram_mode
  )
  into snapshot;

  insert into public.study_sessions (
    user_id,
    library_id,
    study_deck_id,
    new_mastery_balance,
    cram_mode,
    selection_snapshot
  )
  values (
    current_user_id,
    target_deck.library_id,
    target_deck.id,
    session_balance::smallint,
    target_deck.cram_mode,
    snapshot
  )
  returning id into new_session_id;

  return new_session_id;
end;
$$;

comment on function public.start_study_session(uuid, integer) is
  'Starts an owned active Study Session from unified candidates and snapshots sparse official Topic includes/exclusions without changing candidate scoring.';

revoke all on function public.start_study_session(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.start_study_session(uuid, integer)
  to authenticated;

notify pgrst, 'reload schema';

commit;
