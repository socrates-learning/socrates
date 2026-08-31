-- Authenticated learner progress read model for Home/Progress.
--
-- Concept mastery remains the unit of progress. Each Topic Tree branch includes
-- published Concepts placed on that node or any descendant, de-duplicated per
-- branch. Concepts without learner state remain explicitly unseen.

begin;

create or replace function public.get_library_learner_progress(
  p_library_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  result jsonb;
begin
  if current_user_id is null or not public.has_socrates_role() then
    raise exception 'Not authorized to read learner progress.';
  end if;

  if not exists (
    select 1
    from public.libraries library_record
    where library_record.id = p_library_id
      and library_record.status = 'active'
  ) then
    raise exception 'Active Library not found.';
  end if;

  if not public.is_editor_or_admin()
    and not exists (
      select 1
      from public.user_libraries membership
      where membership.user_id = current_user_id
        and membership.library_id = p_library_id
    )
  then
    raise exception 'Not authorized to read progress for this Library.';
  end if;

  with recursive node_closure as (
    select
      node.id as branch_id,
      node.id as descendant_id
    from public.library_nodes node
    where node.library_id = p_library_id

    union all

    select
      closure.branch_id,
      child.id
    from node_closure closure
    join public.library_nodes child
      on child.parent_id = closure.descendant_id
     and child.library_id = p_library_id
  ),
  branch_concepts as (
    select distinct
      closure.branch_id,
      placement.concept_id
    from node_closure closure
    join public.concept_placements placement
      on placement.library_node_id = closure.descendant_id
    join public.concepts concept
      on concept.id = placement.concept_id
     and concept.status = 'published'
  ),
  library_concepts as (
    select distinct branch_concept.concept_id
    from branch_concepts branch_concept
  ),
  user_attempt_counts as (
    select
      attempt.concept_id,
      count(*)::integer as question_attempts
    from public.review_attempts attempt
    join library_concepts library_concept
      on library_concept.concept_id = attempt.concept_id
    where attempt.user_id = current_user_id
    group by attempt.concept_id
  ),
  node_metrics as (
    select
      node.id as library_node_id,
      node.name,
      node.parent_id,
      node.sort_order,
      count(branch_concept.concept_id)::integer as total_concepts,
      count(mastery.concept_id)::integer as assessed_concepts,
      (count(branch_concept.concept_id) - count(mastery.concept_id))::integer
        as unseen_concepts,
      case
        when count(mastery.concept_id) = 0 then null
        else round(avg(mastery.mastery_estimate) * 100, 1)
      end as assessed_mastery_percent,
      case
        when count(branch_concept.concept_id) = 0 then 0::numeric
        else round(
          sum(coalesce(mastery.mastery_estimate, 0::numeric))
            * 100
            / count(branch_concept.concept_id),
          1
        )
      end as coverage_adjusted_progress_percent,
      coalesce(sum(mastery.evidence_count), 0)::integer as evidence_count,
      coalesce(sum(attempt_count.question_attempts), 0)::integer
        as questions_answered
    from public.library_nodes node
    left join branch_concepts branch_concept
      on branch_concept.branch_id = node.id
    left join public.user_concept_mastery mastery
      on mastery.user_id = current_user_id
     and mastery.concept_id = branch_concept.concept_id
    left join user_attempt_counts attempt_count
      on attempt_count.concept_id = branch_concept.concept_id
    where node.library_id = p_library_id
    group by node.id, node.name, node.parent_id, node.sort_order
  ),
  library_metrics as (
    select
      count(library_concept.concept_id)::integer as total_concepts,
      count(mastery.concept_id)::integer as assessed_concepts,
      (count(library_concept.concept_id) - count(mastery.concept_id))::integer
        as unseen_concepts,
      case
        when count(mastery.concept_id) = 0 then null
        else round(avg(mastery.mastery_estimate) * 100, 1)
      end as assessed_mastery_percent,
      case
        when count(library_concept.concept_id) = 0 then 0::numeric
        else round(
          sum(coalesce(mastery.mastery_estimate, 0::numeric))
            * 100
            / count(library_concept.concept_id),
          1
        )
      end as coverage_adjusted_progress_percent,
      coalesce(sum(mastery.evidence_count), 0)::integer as evidence_count,
      coalesce(sum(attempt_count.question_attempts), 0)::integer
        as questions_answered
    from library_concepts library_concept
    left join public.user_concept_mastery mastery
      on mastery.user_id = current_user_id
     and mastery.concept_id = library_concept.concept_id
    left join user_attempt_counts attempt_count
      on attempt_count.concept_id = library_concept.concept_id
  ),
  recent_session_rows as (
    select
      session.id,
      session.study_deck_id,
      deck.name as deck_name,
      session.started_at,
      session.ended_at,
      session.answered_count
    from public.study_sessions session
    left join public.study_decks deck on deck.id = session.study_deck_id
    where session.user_id = current_user_id
      and session.library_id = p_library_id
    order by session.started_at desc, session.id
    limit 5
  )
  select jsonb_build_object(
    'library_id', p_library_id,
    'summary', jsonb_build_object(
      'total_concepts', metrics.total_concepts,
      'assessed_concepts', metrics.assessed_concepts,
      'unseen_concepts', metrics.unseen_concepts,
      'assessed_mastery_percent', metrics.assessed_mastery_percent,
      'coverage_adjusted_progress_percent',
        metrics.coverage_adjusted_progress_percent,
      'evidence_count', metrics.evidence_count,
      'questions_answered', metrics.questions_answered,
      'recent_session_count', (
        select count(*)::integer
        from public.study_sessions session
        where session.user_id = current_user_id
          and session.library_id = p_library_id
          and session.started_at >= now() - interval '30 days'
      )
    ),
    'nodes', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'library_node_id', node_metric.library_node_id,
            'name', node_metric.name,
            'parent_id', node_metric.parent_id,
            'sort_order', node_metric.sort_order,
            'total_concepts', node_metric.total_concepts,
            'assessed_concepts', node_metric.assessed_concepts,
            'unseen_concepts', node_metric.unseen_concepts,
            'assessed_mastery_percent',
              node_metric.assessed_mastery_percent,
            'coverage_adjusted_progress_percent',
              node_metric.coverage_adjusted_progress_percent,
            'evidence_count', node_metric.evidence_count,
            'questions_answered', node_metric.questions_answered
          )
          order by node_metric.sort_order, lower(node_metric.name),
            node_metric.library_node_id
        )
        from node_metrics node_metric
      ),
      '[]'::jsonb
    ),
    'recent_sessions', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', recent_session.id,
            'study_deck_id', recent_session.study_deck_id,
            'deck_name', recent_session.deck_name,
            'started_at', recent_session.started_at,
            'ended_at', recent_session.ended_at,
            'answered_count', recent_session.answered_count
          )
          order by recent_session.started_at desc, recent_session.id
        )
        from recent_session_rows recent_session
      ),
      '[]'::jsonb
    )
  )
  into result
  from library_metrics metrics;

  return result;
end;
$$;

revoke all on function public.get_library_learner_progress(uuid)
  from public, anon, authenticated;
grant execute on function public.get_library_learner_progress(uuid)
  to authenticated;

commit;
