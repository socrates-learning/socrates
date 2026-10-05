-- Home projection/count compatibility only. No candidate, preference, collection,
-- scheduling, authority, storage or structural-write contract changes.
begin;
do $$ begin
  if current_user <> 'postgres' or not exists(
    select 1 from pg_proc where oid = to_regprocedure('public.get_home_study_bootstrap(uuid,uuid)')
      and proowner = 'postgres'::regrole and prosecdef and provolatile = 's'
      and proconfig = array['search_path=""']
      and md5(pg_get_functiondef(oid)) = 'a1466f5a75f9c3249222f3335eb14e4e'
  ) or to_regprocedure('public.set_study_deck_topic_subtree_preference(uuid,uuid,text,integer,text)') is null then
    raise exception '118 requires the exact released through-117 Home bootstrap';
  end if;
end $$;

CREATE OR REPLACE FUNCTION public.get_home_study_bootstrap(p_library_id uuid, p_deck_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_user_id uuid := (select auth.uid());
  target_deck public.study_decks%rowtype;
  result jsonb;
  home_topic_ids uuid[];
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

  -- Exclude only branches with a proven canonical root in another Library.
  -- Unplaced roots, missing parents and cycles stay visible to Home's existing
  -- fail-closed composer. This is projection, never a Study eligibility change.
  with recursive other_library_topics(id) as (
    select topic.id
    from public.personal_topics topic
    join public.personal_topic_official_placements placement
      on placement.personal_topic_id = topic.id
     and placement.owner_id = current_user_id
    join public.library_nodes node on node.id = placement.library_node_id
    where topic.owner_id = current_user_id and topic.parent_id is null
      and node.library_id <> p_library_id
    union
    select child.id from public.personal_topics child
    join other_library_topics parent on parent.id = child.parent_id
    where child.owner_id = current_user_id
  )
  select coalesce(array_agg(topic.id order by topic.id), '{}'::uuid[])
  into home_topic_ids
  from public.personal_topics topic
  where topic.owner_id = current_user_id
    and not exists(select 1 from other_library_topics other where other.id = topic.id);

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
    'library_availability_question_counts',
      public.get_library_official_availability_counts(p_library_id),
    -- Retained wire field: selected-deck candidates, never Library availability.
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
            and topic.id = any(home_topic_ids)
        ),
        '[]'::jsonb
      ),
    'personal_topic_placements',
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'personal_topic_id', placement.personal_topic_id,
          'library_node_id', placement.library_node_id
        ) order by placement.personal_topic_id)
        from public.personal_topic_official_placements placement
        where placement.owner_id = current_user_id
          and placement.personal_topic_id = any(home_topic_ids)
      ), '[]'::jsonb),
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
            and concept.topic_id = any(home_topic_ids)
        ),
        '[]'::jsonb
      ),
    'personal_cards',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', card.id,
              'concept_id', card.concept_id,
              'library_node_id', card.library_node_id,
              'library_id', card.library_id,
              'personal_topic_id', card.personal_topic_id
            )
            order by card.created_at, card.id
          )
          from public.personal_cards card
          where card.owner_id = current_user_id
            and (
              card.personal_topic_id = any(home_topic_ids)
              or (card.library_id = p_library_id and exists(
                select 1 from public.library_nodes node
                where node.id = card.library_node_id and node.library_id = p_library_id
              ))
              or exists(select 1 from public.personal_concepts concept
                where concept.id = card.concept_id and concept.owner_id = current_user_id
                  and concept.topic_id = any(home_topic_ids))
            )
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

  result := result || jsonb_build_object('unified_deck_settings',public.m109_settings_snapshot(target_deck.id),
    'personal_topic_preferences',(select coalesce(jsonb_object_agg(personal_topic_id,new_mastery_balance),'{}') from public.study_deck_personal_topic_preferences where deck_id=target_deck.id),
    'personal_collection_preferences',(select coalesce(jsonb_object_agg(personal_collection_id,new_mastery_balance),'{}') from public.study_deck_personal_collection_preferences where deck_id=target_deck.id),
    'personal_collection_groups',(select coalesce(jsonb_agg(jsonb_build_object('group_key','personal:collection:'||c.id::text,'collection_id',c.id,'selected',exists(select 1 from public.study_deck_personal_collection_selections cs where cs.deck_id=target_deck.id and cs.personal_collection_id=c.id)) order by c.id),'[]') from public.personal_collections c where c.owner_id=current_user_id),
    'unified_deck_capabilities',jsonb_build_object('branch_selection',true,'group_balance',true,'calibration_version',1));
  return result;
end;
$function$
;

commit;
