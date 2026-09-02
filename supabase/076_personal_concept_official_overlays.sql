-- Study Creator Phase 3B: owner-scoped placement of personal Concepts in the
-- official Topic Tree, plus read-only candidate eligibility through those
-- placements. The canonical personal Topic -> Concept -> Card hierarchy and
-- all source-specific Study selection and persistence functions are unchanged.

begin;

create table public.personal_concept_official_placements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  personal_concept_id uuid not null,
  library_node_id uuid not null,
  official_concept_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint personal_concept_official_placements_concept_key
    unique (personal_concept_id),
  constraint personal_concept_official_placements_concept_owner_fkey
    foreign key (personal_concept_id, owner_id)
    references public.personal_concepts(id, owner_id)
    on delete cascade,
  constraint personal_concept_official_placements_node_fkey
    foreign key (library_node_id)
    references public.library_nodes(id)
    on delete cascade,
  constraint personal_concept_official_placements_official_pair_fkey
    foreign key (official_concept_id, library_node_id)
    references public.concept_placements(concept_id, library_node_id)
    on delete cascade
);

create index personal_concept_official_placements_owner_idx
  on public.personal_concept_official_placements(owner_id);
create index personal_concept_official_placements_node_idx
  on public.personal_concept_official_placements(library_node_id);
create index personal_concept_official_placements_official_pair_idx
  on public.personal_concept_official_placements(
    official_concept_id,
    library_node_id
  )
  where official_concept_id is not null;

create or replace function public.validate_personal_concept_official_placement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_library_id uuid;
begin
  if caller_id is null or not public.has_socrates_role() then
    raise exception 'Approved Socrates access is required to manage personal Concept placements';
  end if;

  if new.owner_id is distinct from caller_id then
    raise exception 'Personal Concept placements may only be managed by their owner';
  end if;

  select node.library_id
  into target_library_id
  from public.library_nodes node
  where node.id = new.library_node_id;

  if target_library_id is null then
    raise exception 'Official Topic placement was not found';
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

  if new.official_concept_id is not null
     and not exists (
       select 1
       from public.concepts concept
       join public.concept_placements placement
         on placement.concept_id = concept.id
        and placement.library_node_id = new.library_node_id
       where concept.id = new.official_concept_id
         and concept.status = 'published'
     ) then
    raise exception 'Official Concept placement must exist and be published';
  end if;

  return new;
end;
$$;

create trigger validate_personal_concept_official_placement
  before insert or update of owner_id, personal_concept_id, library_node_id,
    official_concept_id
  on public.personal_concept_official_placements
  for each row execute function public.validate_personal_concept_official_placement();

create trigger set_personal_concept_official_placements_updated_at
  before update on public.personal_concept_official_placements
  for each row execute function public.set_personal_content_updated_at();

alter table public.personal_concept_official_placements enable row level security;

create policy "Users read own personal Concept official placements"
  on public.personal_concept_official_placements
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.has_socrates_role()
  );

create policy "Users create own personal Concept official placements"
  on public.personal_concept_official_placements
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.has_socrates_role()
    and exists (
      select 1
      from public.library_nodes node
      where node.id = personal_concept_official_placements.library_node_id
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
    and (
      official_concept_id is null
      or exists (
        select 1
        from public.concepts concept
        join public.concept_placements placement
          on placement.concept_id = concept.id
         and placement.library_node_id =
           personal_concept_official_placements.library_node_id
        where concept.id =
            personal_concept_official_placements.official_concept_id
          and concept.status = 'published'
      )
    )
  );

create policy "Users update own personal Concept official placements"
  on public.personal_concept_official_placements
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
      where node.id = personal_concept_official_placements.library_node_id
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
    and (
      official_concept_id is null
      or exists (
        select 1
        from public.concepts concept
        join public.concept_placements placement
          on placement.concept_id = concept.id
         and placement.library_node_id =
           personal_concept_official_placements.library_node_id
        where concept.id =
            personal_concept_official_placements.official_concept_id
          and concept.status = 'published'
      )
    )
  );

create policy "Users delete own personal Concept official placements"
  on public.personal_concept_official_placements
  for delete
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.has_socrates_role()
  );

revoke all on table public.personal_concept_official_placements
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.personal_concept_official_placements
  to authenticated;

revoke all on function public.validate_personal_concept_official_placement()
  from public, anon, authenticated;

create or replace function public.resolve_study_candidates(
  p_deck_id uuid
)
returns table (
  candidate_type text,
  candidate_id uuid,
  official_question_id uuid,
  official_concept_id uuid,
  personal_card_id uuid,
  personal_concept_id uuid,
  personal_topic_id uuid,
  prompt text,
  answer text,
  explanation text,
  difficulty text,
  testing_angle text,
  candidate_position bigint,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive deck as (
    select
      study_deck.id,
      study_deck.user_id,
      study_deck.library_id
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
  official_concepts as (
    select
      resolved.concept_id,
      row_number() over (
        order by lower(resolved.concept_name), resolved.concept_id
      ) as concept_position
    from deck
    cross join lateral public.resolve_study_deck(deck.id) resolved
  ),
  official_candidates as (
    select
      'official'::text as candidate_type,
      question.id as candidate_id,
      question.id as official_question_id,
      question.concept_id as official_concept_id,
      null::uuid as personal_card_id,
      null::uuid as personal_concept_id,
      null::uuid as personal_topic_id,
      question.prompt,
      accepted_answer.answer_text as answer,
      question.explanation,
      question.difficulty,
      question.testing_angle,
      0::integer as source_position,
      official_concept.concept_position,
      question.sort_order as item_sort_order,
      question.created_at
    from official_concepts official_concept
    join public.questions question
      on question.concept_id = official_concept.concept_id
    join lateral (
      select accepted.answer_text
      from public.question_accepted_answers accepted
      where accepted.question_id = question.id
      order by accepted.sort_order, accepted.id
      limit 1
    ) accepted_answer on true
    where question.status = 'published'
      and question.question_type = 'short_answer'
  ),
  selected_official_nodes as (
    select selection.node_id
    from deck
    join public.user_study_node_selections selection
      on selection.deck_id = deck.id
     and selection.user_id = deck.user_id
     and selection.library_id = deck.library_id
    join public.library_nodes node
      on node.id = selection.node_id
     and node.library_id = deck.library_id

    union

    select child.id
    from selected_official_nodes selected
    join public.library_nodes parent
      on parent.id = selected.node_id
    join public.library_nodes child
      on child.parent_id = parent.id
     and child.library_id = parent.library_id
    join deck on deck.library_id = child.library_id
  ),
  selected_personal_topics as (
    select selection.personal_topic_id
    from deck
    join public.study_deck_personal_topic_selections selection
      on selection.deck_id = deck.id
     and selection.user_id = deck.user_id
     and selection.library_id = deck.library_id

    union

    select child.id
    from selected_personal_topics selected
    join public.personal_topics parent
      on parent.id = selected.personal_topic_id
    join public.personal_topics child
      on child.parent_id = parent.id
     and child.owner_id = parent.owner_id
    join deck on deck.user_id = child.owner_id
  ),
  eligible_personal_concepts as (
    select concept.id
    from selected_personal_topics selected
    join deck on true
    join public.personal_topics topic
      on topic.id = selected.personal_topic_id
     and topic.owner_id = deck.user_id
    join public.personal_concepts concept
      on concept.topic_id = topic.id
     and concept.owner_id = deck.user_id

    union

    select placement.personal_concept_id
    from deck
    join public.personal_concept_official_placements placement
      on placement.owner_id = deck.user_id
     and placement.official_concept_id is null
    join selected_official_nodes selected
      on selected.node_id = placement.library_node_id
    join public.library_nodes node
      on node.id = placement.library_node_id
     and node.library_id = deck.library_id

    union

    select placement.personal_concept_id
    from deck
    join public.personal_concept_official_placements placement
      on placement.owner_id = deck.user_id
     and placement.official_concept_id is not null
    join official_concepts official
      on official.concept_id = placement.official_concept_id
    join public.library_nodes node
      on node.id = placement.library_node_id
     and node.library_id = deck.library_id
  ),
  personal_candidate_rows as (
    select
      card.id,
      card.owner_id,
      card.concept_id,
      concept.topic_id,
      card.question,
      card.answer,
      topic.sort_order as topic_sort_order,
      topic.name as topic_name,
      concept.name as concept_name,
      concept.created_at as concept_created_at,
      card.created_at
    from eligible_personal_concepts eligible
    join deck on true
    join public.personal_concepts concept
      on concept.id = eligible.id
     and concept.owner_id = deck.user_id
    join public.personal_topics topic
      on topic.id = concept.topic_id
     and topic.owner_id = deck.user_id
    join public.personal_cards card
      on card.concept_id = concept.id
     and card.owner_id = deck.user_id
  ),
  personal_candidates as (
    select
      'personal'::text as candidate_type,
      personal_card.id as candidate_id,
      null::uuid as official_question_id,
      null::uuid as official_concept_id,
      personal_card.id as personal_card_id,
      personal_card.concept_id as personal_concept_id,
      personal_card.topic_id as personal_topic_id,
      personal_card.question as prompt,
      personal_card.answer,
      null::text as explanation,
      null::text as difficulty,
      null::text as testing_angle,
      1::integer as source_position,
      dense_rank() over (
        order by
          personal_card.topic_sort_order,
          lower(personal_card.topic_name),
          personal_card.topic_id,
          lower(personal_card.concept_name),
          personal_card.concept_created_at,
          personal_card.concept_id
      ) as concept_position,
      0::integer as item_sort_order,
      personal_card.created_at
    from personal_candidate_rows personal_card
  ),
  combined_candidates as (
    select * from official_candidates
    union all
    select * from personal_candidates
  ),
  positioned_candidates as (
    select
      combined.*,
      row_number() over (
        order by
          combined.source_position,
          combined.concept_position,
          combined.item_sort_order,
          combined.created_at,
          combined.candidate_id
      ) as candidate_position
    from combined_candidates combined
  )
  select
    positioned.candidate_type,
    positioned.candidate_id,
    positioned.official_question_id,
    positioned.official_concept_id,
    positioned.personal_card_id,
    positioned.personal_concept_id,
    positioned.personal_topic_id,
    positioned.prompt,
    positioned.answer,
    positioned.explanation,
    positioned.difficulty,
    positioned.testing_angle,
    positioned.candidate_position,
    positioned.created_at
  from positioned_candidates positioned
  order by positioned.candidate_position;
$$;

comment on function public.resolve_study_candidates(uuid) is
  'Read-only candidate adapter for eligible official Questions, selected owned personal Cards, and owned personal Concept overlays into the active official Library. It does not select, record, score, or update learner evidence.';

revoke all on function public.resolve_study_candidates(uuid)
  from public, anon, authenticated;
grant execute on function public.resolve_study_candidates(uuid)
  to authenticated;

notify pgrst, 'reload schema';

commit;
