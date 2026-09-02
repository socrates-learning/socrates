-- Phase 4C: deck-scoped Personal Deck selection and candidate eligibility.
-- Row presence means the owner-global Personal Deck contributes its current Cards.

begin;

create table public.study_deck_personal_collection_selections (
  deck_id uuid not null,
  user_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  library_id uuid not null,
  personal_collection_id uuid not null,
  created_at timestamptz not null default now(),
  constraint study_deck_personal_collection_pkey
    primary key (deck_id, personal_collection_id),
  constraint study_deck_personal_collection_deck_owner_library_fkey
    foreign key (deck_id, user_id, library_id)
    references public.study_decks(id, user_id, library_id)
    on delete cascade,
  constraint study_deck_personal_collection_collection_owner_fkey
    foreign key (personal_collection_id, user_id)
    references public.personal_collections(id, owner_id)
    on delete cascade
);

create index study_deck_personal_collection_selections_user_collection_idx
  on public.study_deck_personal_collection_selections(user_id, personal_collection_id);

alter table public.study_deck_personal_collection_selections enable row level security;

create policy "Users read own Personal Deck study selections"
  on public.study_deck_personal_collection_selections for select to authenticated
  using (
    user_id = (select auth.uid())
    and public.has_socrates_role()
    and exists (
      select 1 from public.study_decks deck
      where deck.id = study_deck_personal_collection_selections.deck_id
        and deck.user_id = (select auth.uid())
        and deck.user_id = study_deck_personal_collection_selections.user_id
        and deck.library_id = study_deck_personal_collection_selections.library_id
    )
  );

create policy "Users create own Personal Deck study selections"
  on public.study_deck_personal_collection_selections for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.has_socrates_role()
    and exists (
      select 1 from public.study_decks deck
      where deck.id = study_deck_personal_collection_selections.deck_id
        and deck.user_id = (select auth.uid())
        and deck.user_id = study_deck_personal_collection_selections.user_id
        and deck.library_id = study_deck_personal_collection_selections.library_id
    )
    and exists (
      select 1 from public.personal_collections collection
      where collection.id = study_deck_personal_collection_selections.personal_collection_id
        and collection.owner_id = (select auth.uid())
        and collection.owner_id = study_deck_personal_collection_selections.user_id
    )
  );

create policy "Users delete own Personal Deck study selections"
  on public.study_deck_personal_collection_selections for delete to authenticated
  using (
    user_id = (select auth.uid())
    and public.has_socrates_role()
    and exists (
      select 1 from public.study_decks deck
      where deck.id = study_deck_personal_collection_selections.deck_id
        and deck.user_id = (select auth.uid())
        and deck.user_id = study_deck_personal_collection_selections.user_id
        and deck.library_id = study_deck_personal_collection_selections.library_id
    )
  );

revoke all on table public.study_deck_personal_collection_selections
  from public, anon, authenticated;
grant select, insert, delete
  on table public.study_deck_personal_collection_selections
  to authenticated;

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
  eligible_personal_cards as (
    select card.id
    from eligible_personal_concepts eligible
    join deck on true
    join public.personal_cards card
      on card.concept_id = eligible.id
     and card.owner_id = deck.user_id

    union

    select membership.personal_card_id
    from deck
    join public.study_deck_personal_collection_selections selection
      on selection.deck_id = deck.id
     and selection.user_id = deck.user_id
     and selection.library_id = deck.library_id
    join public.personal_collections collection
      on collection.id = selection.personal_collection_id
     and collection.owner_id = deck.user_id
    join public.personal_collection_cards membership
      on membership.collection_id = collection.id
     and membership.owner_id = deck.user_id
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
    from eligible_personal_cards eligible
    join deck on true
    join public.personal_cards card
      on card.id = eligible.id
     and card.owner_id = deck.user_id
    join public.personal_concepts concept
      on concept.id = card.concept_id
     and concept.owner_id = deck.user_id
    join public.personal_topics topic
      on topic.id = concept.topic_id
     and topic.owner_id = deck.user_id
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
  'Read-only candidate adapter for eligible official Questions, selected owned personal Cards, Personal Deck Cards, and owned personal Concept overlays. It does not select, record, score, or update learner evidence.';

revoke all on function public.resolve_study_candidates(uuid)
  from public, anon, authenticated;
grant execute on function public.resolve_study_candidates(uuid)
  to authenticated;

notify pgrst, 'reload schema';

commit;
