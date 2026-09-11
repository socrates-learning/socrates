-- Consolidated read-only Home bootstrap after active-Library and active-deck
-- resolution. This keeps the existing authoritative deck/candidate functions,
-- but avoids serializing the full candidate payload or paying a network round
-- trip for every Home setup relation.

begin;

create or replace function public.get_home_study_bootstrap(
  p_library_id uuid,
  p_deck_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_deck public.study_decks%rowtype;
  result jsonb;
begin
  if current_user_id is null or not public.has_socrates_role() then
    raise exception 'Not authorized to load Home study data.';
  end if;

  select deck.*
  into target_deck
  from public.study_decks deck
  where deck.id = p_deck_id
    and deck.library_id = p_library_id
    and deck.user_id = current_user_id
    and deck.is_active;

  if target_deck.id is null then
    raise exception 'Active study deck not found.';
  end if;

  if not public.is_editor_or_admin()
    and not exists (
      select 1
      from public.user_libraries membership
      where membership.user_id = current_user_id
        and membership.library_id = p_library_id
    )
  then
    raise exception 'Not authorized for this Library.';
  end if;

  select jsonb_build_object(
    'available_libraries',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', library.id,
              'name', library.name,
              'slug', library.slug,
              'description', library.description,
              'status', library.status
            )
            order by library.name, library.id
          )
          from public.libraries library
          where library.status = 'active'
            and (
              public.is_editor_or_admin()
              or library.id = p_library_id
            )
        ),
        '[]'::jsonb
      ),
    'nodes',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', node.id,
              'name', node.name,
              'node_type', node.node_type,
              'parent_id', node.parent_id
            )
            order by node.name, node.id
          )
          from public.library_nodes node
          where node.library_id = p_library_id
        ),
        '[]'::jsonb
      ),
    'placements',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'concept_id', placement.concept_id,
              'library_node_id', placement.library_node_id,
              'concepts', jsonb_build_object(
                'id', concept.id,
                'name', concept.name,
                'concept_type', concept.concept_type,
                'summary', concept.summary
              )
            )
            order by placement.library_node_id, placement.concept_id
          )
          from public.concept_placements placement
          join public.library_nodes node
            on node.id = placement.library_node_id
           and node.library_id = p_library_id
          join public.concepts concept
            on concept.id = placement.concept_id
           and concept.status = 'published'
        ),
        '[]'::jsonb
      ),
    'selected_node_ids',
      coalesce(
        (
          select jsonb_agg(selection.node_id order by selection.node_id)
          from public.user_study_node_selections selection
          where selection.deck_id = target_deck.id
            and selection.user_id = current_user_id
            and selection.library_id = p_library_id
        ),
        '[]'::jsonb
      ),
    'excluded_node_ids',
      coalesce(
        (
          select jsonb_agg(exclusion.node_id order by exclusion.node_id)
          from public.study_deck_node_exclusions exclusion
          where exclusion.deck_id = target_deck.id
            and exclusion.user_id = current_user_id
            and exclusion.library_id = p_library_id
        ),
        '[]'::jsonb
      ),
    'node_preferences',
      coalesce(
        (
          select jsonb_object_agg(
            preference.library_node_id::text,
            preference.new_mastery_balance
            order by preference.library_node_id::text
          )
          from public.study_deck_node_preferences preference
          where preference.deck_id = target_deck.id
            and preference.user_id = current_user_id
            and preference.library_id = p_library_id
        ),
        '{}'::jsonb
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
            and override.library_id = p_library_id
        ),
        '{}'::jsonb
      ),
    'resolved_concepts',
      coalesce(
        (
          select jsonb_agg(
            to_jsonb(resolved)
            order by lower(resolved.concept_name), resolved.concept_id
          )
          from public.resolve_study_deck(target_deck.id) resolved
        ),
        '[]'::jsonb
      ),
    'official_question_counts',
      coalesce(
        (
          select jsonb_object_agg(
            count_row.concept_id::text,
            count_row.question_count
            order by count_row.concept_id::text
          )
          from (
            select
              candidate.official_concept_id as concept_id,
              count(distinct candidate.official_question_id)::integer
                as question_count
            from public.resolve_study_candidates(target_deck.id) candidate
            where candidate.candidate_type = 'official'
              and candidate.official_concept_id is not null
              and candidate.official_question_id is not null
            group by candidate.official_concept_id
          ) count_row
        ),
        '{}'::jsonb
      ),
    'learner_progress',
      public.get_library_learner_progress(p_library_id),
    'personal_topics',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', topic.id,
              'parent_id', topic.parent_id,
              'name', topic.name,
              'sort_order', topic.sort_order
            )
            order by topic.sort_order, topic.name, topic.id
          )
          from public.personal_topics topic
          where topic.owner_id = current_user_id
        ),
        '[]'::jsonb
      ),
    'personal_concepts',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', concept.id,
              'topic_id', concept.topic_id,
              'name', concept.name
            )
            order by concept.name, concept.id
          )
          from public.personal_concepts concept
          where concept.owner_id = current_user_id
        ),
        '[]'::jsonb
      ),
    'personal_cards',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', card.id,
              'concept_id', card.concept_id
            )
            order by card.created_at, card.id
          )
          from public.personal_cards card
          where card.owner_id = current_user_id
        ),
        '[]'::jsonb
      ),
    'selected_personal_topic_ids',
      coalesce(
        (
          select jsonb_agg(
            selection.personal_topic_id
            order by selection.personal_topic_id
          )
          from public.study_deck_personal_topic_selections selection
          where selection.deck_id = target_deck.id
            and selection.user_id = current_user_id
            and selection.library_id = p_library_id
        ),
        '[]'::jsonb
      ),
    'personal_collections',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', collection.id,
              'name', collection.name,
              'card_count', (
                select count(*)::integer
                from public.personal_collection_cards membership
                where membership.collection_id = collection.id
                  and membership.owner_id = current_user_id
              )
            )
            order by collection.name, collection.id
          )
          from public.personal_collections collection
          where collection.owner_id = current_user_id
        ),
        '[]'::jsonb
      ),
    'selected_personal_collection_ids',
      coalesce(
        (
          select jsonb_agg(
            selection.personal_collection_id
            order by selection.personal_collection_id
          )
          from public.study_deck_personal_collection_selections selection
          where selection.deck_id = target_deck.id
            and selection.user_id = current_user_id
            and selection.library_id = p_library_id
        ),
        '[]'::jsonb
      )
  )
  into result;

  return result;
end;
$$;

revoke all on function public.get_home_study_bootstrap(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_home_study_bootstrap(uuid, uuid)
  to authenticated;

commit;
