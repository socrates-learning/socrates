-- Priority Algorithm v2 Phase 4: repeated-lapse and recovery-history sensitivity.
--
-- Preserves the Migration 061 selector architecture and the Migration 056 Cram
-- branch while adding one bounded Normal Priority Mode contribution derived
-- from immutable review_attempts. The signal considers at most 12 attempts per
-- eligible Concept within 45 days. Forgot adds linearly age-decayed concern;
-- later Easy, Average, and Hard responses recover 1.00, 0.75, and 0.50 of the
-- same age-decayed unit. Didn't Know and Too Hard remain semantically separate.
-- One unresolved lapse produces no repeated-lapse bonus, and the contribution
-- is capped at 0.20. Phase 1 fresh-Forgot behavior remains unchanged.

begin;

create or replace function public.select_next_study_question(
  p_study_session_id uuid,
  p_include_debug boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_session public.study_sessions%rowtype;
  selection_result jsonb;
begin
  if current_user_id is null or not public.has_socrates_role() then
    raise exception 'Not authorized to select a study question.';
  end if;

  select session_row.*
  into target_session
  from public.study_sessions session_row
  where session_row.id = p_study_session_id
    and session_row.user_id = current_user_id
    and session_row.ended_at is null
  for share;

  if target_session.id is null then
    raise exception 'Active study session not found.';
  end if;

  if target_session.cram_mode then
    with
    cram_eligible_questions as (
      select
        question.id as question_id,
        question.concept_id,
        question.prompt,
        question.difficulty,
        question.testing_angle,
        lower(btrim(question.testing_angle)) as normalized_angle,
        question.sort_order,
        question.created_at,
        accepted.answer_text as accepted_answer
      from public.resolve_study_deck(target_session.study_deck_id) resolved
      join public.questions question
        on question.concept_id = resolved.concept_id
      join lateral (
        select answer.answer_text
        from public.question_accepted_answers answer
        where answer.question_id = question.id
        order by answer.sort_order, answer.id
        limit 1
      ) accepted on true
      where question.status = 'published'
        and question.question_type = 'short_answer'
    ),
    cram_eligible_angles as (
      select distinct
        question.concept_id,
        question.normalized_angle
      from cram_eligible_questions question
    ),
    cram_angle_state_rollup as (
      select
        angle_state.concept_id,
        lower(btrim(angle_state.testing_angle)) as normalized_angle,
        sum(angle_state.evidence_count) as evidence_count,
        max(angle_state.last_exposure_at) as last_exposure_at
      from public.user_concept_testing_angle_state angle_state
      where angle_state.user_id = current_user_id
      group by
        angle_state.concept_id,
        lower(btrim(angle_state.testing_angle))
    ),
    cram_angle_state_latest as (
      select distinct on (
        angle_state.concept_id,
        lower(btrim(angle_state.testing_angle))
      )
        angle_state.concept_id,
        lower(btrim(angle_state.testing_angle)) as normalized_angle,
        angle_state.last_result
      from public.user_concept_testing_angle_state angle_state
      where angle_state.user_id = current_user_id
      order by
        angle_state.concept_id,
        lower(btrim(angle_state.testing_angle)),
        angle_state.last_exposure_at desc,
        angle_state.updated_at desc,
        angle_state.testing_angle
    ),
    cram_angle_needs as (
      select
        angle.concept_id,
        angle.normalized_angle,
        case
          when rollup.evidence_count is null then 1::double precision
          else
            0.70::double precision / (1 + rollup.evidence_count)
            + 0.20::double precision * (
                1 - exp(
                  -greatest(
                    0::double precision,
                    extract(epoch from (now() - rollup.last_exposure_at))
                      / 86400::double precision
                  ) / 14::double precision
                )
              )
            + 0.10::double precision * case latest.last_result
                when 'easy' then 0::double precision
                when 'average' then 0.25::double precision
                when 'hard' then 0.50::double precision
                when 'didnt_know' then 1::double precision
                when 'forgot' then 0.90::double precision
                when 'too_hard' then 0.60::double precision
                else 0::double precision
              end
        end as angle_need
      from cram_eligible_angles angle
      left join cram_angle_state_rollup rollup
        on rollup.concept_id = angle.concept_id
       and rollup.normalized_angle = angle.normalized_angle
      left join cram_angle_state_latest latest
        on latest.concept_id = angle.concept_id
       and latest.normalized_angle = angle.normalized_angle
    ),
    cram_concepts as (
      select distinct question.concept_id
      from cram_eligible_questions question
    ),
    cram_concept_inputs as (
      select
        concept.concept_id,
        mastery.mastery_estimate::double precision as mastery_estimate,
        mastery.retrievability::double precision as stored_retrievability,
        mastery.stability::double precision as stability,
        mastery.uncertainty::double precision as uncertainty,
        mastery.last_exposure_at,
        (mastery.concept_id is null) as is_unseen
      from cram_concepts concept
      left join public.user_concept_mastery mastery
        on mastery.user_id = current_user_id
       and mastery.concept_id = concept.concept_id
    ),
    cram_concept_metrics as (
      select
        input.*,
        case
          when input.is_unseen then null::double precision
          else input.stored_retrievability * exp(
            -greatest(
              0::double precision,
              extract(epoch from (now() - input.last_exposure_at))
                / 86400::double precision
            ) / (1::double precision + 29::double precision * input.stability)
          )
        end as live_retrievability
      from cram_concept_inputs input
    ),
    cram_concept_scores as (
      select
        metric.*,
        case
          when metric.is_unseen then 0.85::double precision
          else
            0.55::double precision
              * (1::double precision - metric.mastery_estimate)
            + 0.30::double precision
              * (1::double precision - metric.live_retrievability)
            + 0.15::double precision * metric.uncertainty
        end as cram_need
      from cram_concept_metrics metric
    ),
    cram_question_history as (
      select
        question.question_id,
        count(attempt.id) filter (
          where attempt.study_session_id = target_session.id
        )::integer as session_attempt_count,
        max(attempt.created_at) as last_attempt_at
      from cram_eligible_questions question
      left join public.review_attempts attempt
        on attempt.question_id = question.question_id
       and attempt.user_id = current_user_id
      group by question.question_id
    ),
    cram_traversal as (
      select min(history.session_attempt_count) as minimum_attempt_count
      from cram_question_history history
    ),
    cram_ranked_questions as (
      select
        question.*,
        concept.is_unseen,
        concept.mastery_estimate,
        concept.cram_need,
        angle.angle_need,
        history.session_attempt_count,
        history.last_attempt_at,
        traversal.minimum_attempt_count,
        abs(
          case question.difficulty
            when 'easy' then 0
            when 'medium' then 1
            when 'hard' then 2
          end
          -
          case
            when concept.is_unseen then 1
            when concept.mastery_estimate < 0.40::double precision then 0
            when concept.mastery_estimate <= 0.75::double precision then 1
            else 2
          end
        ) as difficulty_distance
      from cram_eligible_questions question
      join cram_concept_scores concept
        on concept.concept_id = question.concept_id
      join cram_angle_needs angle
        on angle.concept_id = question.concept_id
       and angle.normalized_angle = question.normalized_angle
      join cram_question_history history
        on history.question_id = question.question_id
      cross join cram_traversal traversal
      where history.session_attempt_count = traversal.minimum_attempt_count
    ),
    cram_selected_question as (
      select ranked.*
      from cram_ranked_questions ranked
      order by
        ranked.cram_need desc,
        ranked.angle_need desc,
        ranked.difficulty_distance,
        ranked.last_attempt_at asc nulls first,
        ranked.sort_order,
        ranked.created_at,
        ranked.question_id
      limit 1
    )
    select
      jsonb_build_object(
        'question_id', selected.question_id,
        'concept_id', selected.concept_id,
        'testing_angle', selected.testing_angle,
        'prompt', selected.prompt,
        'accepted_answer', selected.accepted_answer,
        'difficulty', selected.difficulty
      )
      || case
        when coalesce(p_include_debug, false) then jsonb_build_object(
          'cram_mode', true,
          'cram_traversal_minimum_count', selected.minimum_attempt_count,
          'selected_question_session_count', selected.session_attempt_count,
          'selected_concept_cram_need', selected.cram_need,
          'selected_angle_need', selected.angle_need,
          'selection_reason', 'cram_mastery_need'
        )
        else '{}'::jsonb
      end
    into selection_result
    from cram_selected_question selected;

    return selection_result;
  end if;

  with recursive
  eligible_concepts as (
    select
      resolved.concept_id,
      resolved.selection_source
    from public.resolve_study_deck(target_session.study_deck_id) resolved
    where exists (
      select 1
      from public.questions eligible_question
      where eligible_question.concept_id = resolved.concept_id
        and eligible_question.status = 'published'
        and eligible_question.question_type = 'short_answer'
        and exists (
          select 1
          from public.question_accepted_answers eligible_answer
          where eligible_answer.question_id = eligible_question.id
        )
    )
  ),
  selected_node_ids as (
    select selected_node.value::uuid as selected_node_id
    from jsonb_array_elements_text(
      coalesce(
        target_session.selection_snapshot -> 'selected_node_ids',
        '[]'::jsonb
      )
    ) selected_node(value)
  ),
  selected_subtrees as (
    select
      selected.selected_node_id,
      selected.selected_node_id as node_id
    from selected_node_ids selected

    union all

    select
      subtree.selected_node_id,
      child.id
    from selected_subtrees subtree
    join public.library_nodes child
      on child.parent_id = subtree.node_id
     and child.library_id = target_session.library_id
  ),
  covering_selected_nodes as (
    select distinct
      eligible.concept_id,
      subtree.selected_node_id,
      coalesce(
        nullif(
          target_session.selection_snapshot
            -> 'node_preferences'
            ->> subtree.selected_node_id::text,
          ''
        )::numeric,
        50::numeric
      ) as branch_balance
    from eligible_concepts eligible
    join public.concept_placements placement
      on placement.concept_id = eligible.concept_id
    join selected_subtrees subtree
      on subtree.node_id = placement.library_node_id
  ),
  most_specific_selected_nodes as (
    select covering.*
    from covering_selected_nodes covering
    where not exists (
      select 1
      from covering_selected_nodes more_specific
      join selected_subtrees ancestry
        on ancestry.selected_node_id = covering.selected_node_id
       and ancestry.node_id = more_specific.selected_node_id
      where more_specific.concept_id = covering.concept_id
        and more_specific.selected_node_id <> covering.selected_node_id
    )
  ),
  concept_balances as (
    select
      eligible.concept_id,
      eligible.selection_source,
      coalesce(avg(specific.branch_balance), 50::numeric) as branch_balance
    from eligible_concepts eligible
    left join most_specific_selected_nodes specific
      on specific.concept_id = eligible.concept_id
    group by eligible.concept_id, eligible.selection_source
  ),
  eligible_questions as (
    select
      question.id as question_id,
      question.concept_id,
      question.prompt,
      question.difficulty,
      question.testing_angle,
      lower(btrim(question.testing_angle)) as normalized_angle,
      question.sort_order,
      question.created_at,
      accepted.answer_text as accepted_answer
    from public.questions question
    join concept_balances balance
      on balance.concept_id = question.concept_id
    join lateral (
      select answer.answer_text
      from public.question_accepted_answers answer
      where answer.question_id = question.id
      order by answer.sort_order, answer.id
      limit 1
    ) accepted on true
    where question.status = 'published'
      and question.question_type = 'short_answer'
  ),
  eligible_angles as (
    select distinct
      question.concept_id,
      question.normalized_angle
    from eligible_questions question
  ),
  angle_state_rollup as (
    select
      angle_state.concept_id,
      lower(btrim(angle_state.testing_angle)) as normalized_angle,
      sum(angle_state.evidence_count)::integer as evidence_count,
      max(angle_state.last_exposure_at) as last_exposure_at
    from public.user_concept_testing_angle_state angle_state
    where angle_state.user_id = current_user_id
    group by
      angle_state.concept_id,
      lower(btrim(angle_state.testing_angle))
  ),
  angle_state_latest as (
    select distinct on (
      angle_state.concept_id,
      lower(btrim(angle_state.testing_angle))
    )
      angle_state.concept_id,
      lower(btrim(angle_state.testing_angle)) as normalized_angle,
      angle_state.last_result
    from public.user_concept_testing_angle_state angle_state
    where angle_state.user_id = current_user_id
    order by
      angle_state.concept_id,
      lower(btrim(angle_state.testing_angle)),
      angle_state.last_exposure_at desc,
      angle_state.updated_at desc,
      angle_state.testing_angle
  ),
  angle_needs as (
    select
      angle.concept_id,
      angle.normalized_angle,
      case
        when rollup.evidence_count is null then 1::double precision
        else
          0.70::double precision / (1 + rollup.evidence_count)
          + 0.20::double precision * (
              1 - exp(
                -greatest(
                  0::double precision,
                  extract(epoch from (now() - rollup.last_exposure_at))
                    / 86400::double precision
                ) / 14::double precision
              )
            )
          + 0.10::double precision * case latest.last_result
              when 'easy' then 0::double precision
              when 'average' then 0.25::double precision
              when 'hard' then 0.50::double precision
              when 'didnt_know' then 1::double precision
              when 'forgot' then 0.90::double precision
              when 'too_hard' then 0.60::double precision
              else 0::double precision
            end
      end as angle_need
    from eligible_angles angle
    left join angle_state_rollup rollup
      on rollup.concept_id = angle.concept_id
     and rollup.normalized_angle = angle.normalized_angle
    left join angle_state_latest latest
      on latest.concept_id = angle.concept_id
     and latest.normalized_angle = angle.normalized_angle
  ),
  preferred_angles as (
    select distinct on (angle.concept_id)
      angle.concept_id,
      angle.normalized_angle,
      angle.angle_need
    from angle_needs angle
    order by
      angle.concept_id,
      angle.angle_need desc,
      angle.normalized_angle
  ),
  session_position as (
    select coalesce(max(attempt.sequence_position), 0) as latest_position
    from public.review_attempts attempt
    where attempt.study_session_id = target_session.id
      and attempt.user_id = current_user_id
  ),
  recent_concepts as (
    select
      attempt.concept_id,
      max(attempt.sequence_position) as latest_position
    from public.review_attempts attempt
    where attempt.study_session_id = target_session.id
      and attempt.user_id = current_user_id
      and attempt.concept_id is not null
    group by attempt.concept_id
  ),
  recent_history_attempts as (
    select
      balance.concept_id,
      history.id as attempt_id,
      history.result,
      history.created_at,
      row_number() over (
        partition by balance.concept_id
        order by history.created_at, history.id
      )::integer as history_position,
      greatest(
        0::double precision,
        1::double precision
          - greatest(
              0::double precision,
              extract(epoch from (now() - history.created_at))
            ) / 3888000::double precision
      ) as age_weight
    from concept_balances balance
    join lateral (
      select
        attempt.id,
        attempt.result,
        attempt.created_at
      from public.review_attempts attempt
      where attempt.user_id = current_user_id
        and attempt.concept_id = balance.concept_id
        and attempt.created_at >= now() - interval '45 days'
      order by attempt.created_at desc, attempt.id desc
      limit 12
    ) history on true
  ),
  repeated_lapse_walk as (
    select
      attempt.concept_id,
      attempt.history_position,
      least(
        3::double precision,
        greatest(
          0::double precision,
          case attempt.result
            when 'forgot' then attempt.age_weight
            when 'easy' then -1.00::double precision * attempt.age_weight
            when 'average' then -0.75::double precision * attempt.age_weight
            when 'hard' then -0.50::double precision * attempt.age_weight
            else 0::double precision
          end
        )
      ) as repeated_lapse_concern
    from recent_history_attempts attempt
    where attempt.history_position = 1

    union all

    select
      attempt.concept_id,
      attempt.history_position,
      least(
        3::double precision,
        greatest(
          0::double precision,
          walk.repeated_lapse_concern
            + case attempt.result
                when 'forgot' then attempt.age_weight
                when 'easy' then -1.00::double precision * attempt.age_weight
                when 'average' then -0.75::double precision * attempt.age_weight
                when 'hard' then -0.50::double precision * attempt.age_weight
                else 0::double precision
              end
        )
      ) as repeated_lapse_concern
    from repeated_lapse_walk walk
    join recent_history_attempts attempt
      on attempt.concept_id = walk.concept_id
     and attempt.history_position = walk.history_position + 1
  ),
  repeated_lapse_state as (
    select distinct on (walk.concept_id)
      walk.concept_id,
      walk.repeated_lapse_concern
    from repeated_lapse_walk walk
    order by walk.concept_id, walk.history_position desc
  ),
  eligible_concept_count as (
    select count(*)::integer as concept_count
    from concept_balances
  ),
  concept_inputs as (
    select
      balance.concept_id,
      balance.selection_source,
      balance.branch_balance::double precision as branch_balance,
      mastery.mastery_estimate::double precision as mastery_estimate,
      mastery.retrievability::double precision as stored_retrievability,
      mastery.stability::double precision as stability,
      mastery.uncertainty::double precision as uncertainty,
      mastery.last_exposure_at,
      mastery.last_result,
      coalesce(history.repeated_lapse_concern, 0::double precision)
        as repeated_lapse_concern,
      (mastery.concept_id is null) as is_unseen,
      preferred.normalized_angle,
      preferred.angle_need,
      concept_count.concept_count,
      session.latest_position as session_latest_position,
      recent.latest_position as concept_latest_position
    from concept_balances balance
    join preferred_angles preferred
      on preferred.concept_id = balance.concept_id
    cross join eligible_concept_count concept_count
    cross join session_position session
    left join public.user_concept_mastery mastery
      on mastery.user_id = current_user_id
     and mastery.concept_id = balance.concept_id
    left join recent_concepts recent
      on recent.concept_id = balance.concept_id
    left join repeated_lapse_state history
      on history.concept_id = balance.concept_id
  ),
  concept_metrics as (
    select
      input.*,
      case
        when input.is_unseen then null::double precision
        else input.stored_retrievability * exp(
          -greatest(
            0::double precision,
            extract(epoch from (now() - input.last_exposure_at))
              / 86400::double precision
          ) / (1::double precision + 29::double precision * input.stability)
        )
      end as live_retrievability,
      case
        when not input.is_unseen and input.last_result = 'forgot' then
          greatest(
            0::double precision,
            1::double precision
              - greatest(
                  0::double precision,
                  extract(epoch from (now() - input.last_exposure_at))
                ) / 604800::double precision
          )
        else 0::double precision
      end as lapse_signal,
      least(
        1::double precision,
        greatest(
          0::double precision,
          (input.repeated_lapse_concern - 1::double precision)
            / 2::double precision
        )
      ) as repeated_lapse_signal,
      0.30::double precision
        + 0.20::double precision
          * (1::double precision - input.branch_balance / 100::double precision)
        as new_weight,
      0.30::double precision
        + 0.20::double precision
          * (input.branch_balance / 100::double precision)
        as review_weight,
      case
        when input.concept_count <= 1 then 0::double precision
        when input.concept_count = 2 then
          case
            when input.concept_latest_position = input.session_latest_position
              and input.session_latest_position > 0
              then 0.12::double precision
            else 0::double precision
          end
        else
          case
            when input.concept_latest_position = input.session_latest_position
              and input.session_latest_position > 0
              then 0.25::double precision
            when input.concept_latest_position >= input.session_latest_position - 2
              and input.session_latest_position > 0
              then 0.12::double precision
            when input.concept_latest_position >= input.session_latest_position - 5
              and input.session_latest_position > 0
              then 0.05::double precision
            else 0::double precision
          end
      end as recent_concept_penalty
    from concept_inputs input
  ),
  concept_needs as (
    select
      metric.*,
      case
        when metric.is_unseen then null::double precision
        else
          0.45::double precision * (1::double precision - metric.mastery_estimate)
          + 0.30::double precision * (
              1::double precision - metric.live_retrievability
            )
          + 0.15::double precision * metric.uncertainty
          + 0.10::double precision * (1::double precision - metric.stability)
      end as review_need
    from concept_metrics metric
  ),
  concept_scores as (
    select
      need.*,
      case
        when need.review_need is null then 0::double precision
        else least(
          1::double precision,
          greatest(
            0::double precision,
            (need.review_need - 0.75::double precision) / 0.25::double precision
          )
        )
      end as urgent_review,
      need.new_weight * case when need.is_unseen then 1 else 0 end
        as new_component,
      need.review_weight * coalesce(need.review_need, 0::double precision)
        as review_component,
      0.15::double precision * need.angle_need as angle_component
    from concept_needs need
  ),
  ranked_concepts as (
    select
      score.*,
      0.30::double precision * score.urgent_review as urgent_review_component,
      0.65::double precision * score.lapse_signal as lapse_priority_component,
      0.20::double precision * score.repeated_lapse_signal
        as repeated_lapse_priority_component,
      least(
        0.85::double precision,
        0.65::double precision * score.lapse_signal
          + 0.20::double precision * score.repeated_lapse_signal
      ) as combined_lapse_priority_component,
      score.new_component
        + score.review_component
        + score.angle_component
        + 0.30::double precision * score.urgent_review
        + least(
            0.85::double precision,
            0.65::double precision * score.lapse_signal
              + 0.20::double precision * score.repeated_lapse_signal
          )
        - score.recent_concept_penalty
        as concept_priority
    from concept_scores score
  ),
  selected_concept as (
    select ranked.*
    from ranked_concepts ranked
    order by
      ranked.concept_priority desc,
      ranked.urgent_review desc,
      ranked.angle_need desc,
      ranked.concept_id
    limit 1
  ),
  question_history as (
    select
      question.question_id,
      count(attempt.id) filter (
        where attempt.study_session_id = target_session.id
      )::integer as session_attempt_count,
      max(attempt.sequence_position) filter (
        where attempt.study_session_id = target_session.id
      ) as session_latest_position,
      max(attempt.created_at) as last_attempt_at
    from eligible_questions question
    join selected_concept selected
      on selected.concept_id = question.concept_id
    left join public.review_attempts attempt
      on attempt.question_id = question.question_id
     and attempt.user_id = current_user_id
    group by question.question_id
  ),
  selected_question_pool as (
    select
      question.*,
      selected.branch_balance,
      selected.is_unseen,
      selected.mastery_estimate,
      selected.live_retrievability,
      selected.last_result,
      selected.lapse_signal,
      selected.lapse_priority_component,
      selected.repeated_lapse_concern,
      selected.repeated_lapse_signal,
      selected.repeated_lapse_priority_component,
      selected.combined_lapse_priority_component,
      selected.normalized_angle as preferred_angle,
      selected.angle_need,
      selected.new_component,
      selected.review_component,
      selected.angle_component,
      selected.urgent_review_component,
      selected.recent_concept_penalty,
      selected.concept_priority,
      history.session_attempt_count,
      history.session_latest_position,
      history.last_attempt_at,
      count(*) over () as question_pool_count,
      selected.session_latest_position as overall_session_latest_position,
      case question.difficulty
        when 'easy' then 0
        when 'medium' then 1
        when 'hard' then 2
      end as difficulty_number,
      case
        when selected.is_unseen then 1
        when selected.last_result = 'too_hard' then 0
        when selected.last_result = 'forgot' then
          case
            when selected.live_retrievability < 0.45::double precision then 0
            else 1
          end
        when selected.last_result = 'didnt_know' then 0
        when (
          0.65::double precision * selected.mastery_estimate
          + 0.35::double precision * selected.live_retrievability
        ) < 0.40::double precision then 0
        when (
          0.65::double precision * selected.mastery_estimate
          + 0.35::double precision * selected.live_retrievability
        ) <= 0.72::double precision then 1
        else 2
      end as target_difficulty_number
    from eligible_questions question
    join selected_concept selected
      on selected.concept_id = question.concept_id
    join question_history history
      on history.question_id = question.question_id
  ),
  selected_question as (
    select pool.*
    from selected_question_pool pool
    order by
      case
        when pool.question_pool_count > 1
          and pool.session_latest_position = pool.overall_session_latest_position
          and pool.overall_session_latest_position > 0
          then 1
        else 0
      end,
      case when pool.normalized_angle = pool.preferred_angle then 0 else 1 end,
      case
        when pool.session_latest_position is null
          or pool.overall_session_latest_position = 0
          or pool.session_latest_position < pool.overall_session_latest_position - 4
          then 0
        else 1
      end,
      abs(pool.difficulty_number - pool.target_difficulty_number),
      case
        when pool.difficulty_number <= pool.target_difficulty_number then 0
        else 1
      end,
      pool.session_attempt_count,
      pool.last_attempt_at asc nulls first,
      pool.sort_order,
      pool.created_at,
      pool.question_id
    limit 1
  )
  select
    jsonb_build_object(
      'question_id', selected.question_id,
      'concept_id', selected.concept_id,
      'testing_angle', selected.testing_angle,
      'prompt', selected.prompt,
      'accepted_answer', selected.accepted_answer,
      'difficulty', selected.difficulty
    )
    || case
      when coalesce(p_include_debug, false) then jsonb_build_object(
        'selected_branch_balance', selected.branch_balance,
        'new_component', selected.new_component,
        'review_component', selected.review_component,
        'angle_component', selected.angle_component,
        'urgent_review_component', selected.urgent_review_component,
        'lapse_signal', selected.lapse_signal,
        'lapse_priority_component', selected.lapse_priority_component,
        'repeated_lapse_concern', selected.repeated_lapse_concern,
        'repeated_lapse_signal', selected.repeated_lapse_signal,
        'repeated_lapse_priority_component',
          selected.repeated_lapse_priority_component,
        'combined_lapse_priority_component',
          selected.combined_lapse_priority_component,
        'latest_result', selected.last_result,
        'live_retrievability', selected.live_retrievability,
        'target_difficulty_number', selected.target_difficulty_number,
        'recent_penalty', selected.recent_concept_penalty,
        'concept_priority', selected.concept_priority,
        'selected_angle_need', selected.angle_need,
        'selection_reason', case
          when selected.is_unseen then 'unseen_concept'
          when selected.lapse_priority_component > 0 then 'fresh_forgot_lapse'
          when selected.repeated_lapse_priority_component > 0
            then 'repeated_lapse_history'
          when selected.urgent_review_component > 0 then 'urgent_review'
          else 'priority_score'
        end
      )
      else '{}'::jsonb
    end
  into selection_result
  from selected_question selected;

  return selection_result;
end;
$$;

revoke all on function public.select_next_study_question(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.select_next_study_question(uuid, boolean)
  to authenticated;

commit;
