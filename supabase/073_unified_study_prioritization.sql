-- Study Creator Stage 2E: unified official/personal Study prioritization.
--
-- The official Priority Algorithm v2 selector remains unchanged. This layer
-- produces a separate personal-card offer, then chooses between the protected
-- official offer and personal offer with an explicit, configurable source
-- policy. Official and personal persistence continue through their existing
-- source-specific RPCs.

begin;

create table public.study_priority_source_policy (
  policy_name text primary key,
  official_source_weight smallint not null
    constraint study_priority_source_policy_official_weight_check
    check (official_source_weight > 0),
  personal_source_weight smallint not null
    constraint study_priority_source_policy_personal_weight_check
    check (personal_source_weight > 0),
  max_source_absence smallint not null
    constraint study_priority_source_policy_absence_check
    check (max_source_absence > 0),
  max_official_run smallint not null
    constraint study_priority_source_policy_official_run_check
    check (max_official_run > 0),
  max_personal_run smallint not null
    constraint study_priority_source_policy_personal_run_check
    check (max_personal_run > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_priority_source_policy_name_check
    check (policy_name = 'normal_default')
);

insert into public.study_priority_source_policy (
  policy_name,
  official_source_weight,
  personal_source_weight,
  max_source_absence,
  max_official_run,
  max_personal_run
)
values ('normal_default', 2, 1, 4, 3, 2);

alter table public.study_priority_source_policy enable row level security;

revoke all on table public.study_priority_source_policy
  from public, anon, authenticated;

create index personal_review_attempts_session_card_position_idx
  on public.personal_review_attempts(
    study_session_id,
    personal_card_id,
    sequence_position
  );

create or replace function public.select_next_personal_study_card(
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
    raise exception 'Not authorized to select a personal Study Card.';
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

  with
  personal_candidates as (
    select candidate.*
    from public.resolve_study_candidates(target_session.study_deck_id) candidate
    where candidate.candidate_type = 'personal'
  ),
  card_history as (
    select
      candidate.personal_card_id,
      count(attempt.id)::integer as total_attempt_count,
      count(attempt.id) filter (
        where attempt.result in ('easy', 'average', 'hard')
      )::integer as positive_attempt_count,
      count(attempt.id) filter (
        where attempt.result in ('didnt_know', 'forgot', 'too_hard')
      )::integer as negative_attempt_count,
      count(attempt.id) filter (
        where attempt.study_session_id = target_session.id
      )::integer as session_attempt_count,
      max(attempt.sequence_position) filter (
        where attempt.study_session_id = target_session.id
      ) as session_latest_position,
      max(attempt.created_at) as last_attempt_at,
      (
        array_agg(attempt.result order by attempt.created_at desc, attempt.id desc)
          filter (where attempt.id is not null)
      )[1] as latest_card_result
    from personal_candidates candidate
    left join public.personal_review_attempts attempt
      on attempt.personal_card_id = candidate.personal_card_id
     and attempt.user_id = current_user_id
    group by candidate.personal_card_id
  ),
  personal_traversal as (
    select min(history.session_attempt_count) as minimum_attempt_count
    from card_history history
  ),
  personal_inputs as (
    select
      candidate.*,
      history.total_attempt_count,
      history.positive_attempt_count,
      history.negative_attempt_count,
      history.session_attempt_count,
      history.session_latest_position,
      history.last_attempt_at,
      history.latest_card_result,
      traversal.minimum_attempt_count,
      state.evidence_count,
      state.positive_evidence_count,
      state.negative_evidence_count,
      state.consecutive_success_count,
      state.consecutive_lapse_count,
      state.last_result,
      state.last_reviewed_at,
      (state.personal_concept_id is null) as is_unseen_concept,
      case state.last_result
        when 'easy' then 0.00::double precision
        when 'average' then 0.15::double precision
        when 'hard' then 0.30::double precision
        when 'didnt_know' then 0.85::double precision
        when 'forgot' then 1.00::double precision
        when 'too_hard' then 0.70::double precision
        else 0.00::double precision
      end as latest_result_need
    from personal_candidates candidate
    join card_history history
      on history.personal_card_id = candidate.personal_card_id
    cross join personal_traversal traversal
    left join public.user_personal_concept_state state
      on state.user_id = current_user_id
     and state.personal_concept_id = candidate.personal_concept_id
  ),
  personal_metrics as (
    select
      input.*,
      case
        when input.is_unseen_concept then 0.70::double precision
        else least(
          1::double precision,
          greatest(
            0::double precision,
            0.40::double precision * (
              (input.negative_evidence_count + 1)::double precision
                / (input.evidence_count + 2)::double precision
            )
            + 0.25::double precision * input.latest_result_need
            + 0.15::double precision * (
              least(input.consecutive_lapse_count, 3)::double precision / 3
            )
            + 0.10::double precision / sqrt(
              (input.evidence_count + 1)::double precision
            )
            + 0.10::double precision * (
              1::double precision - exp(
                -greatest(
                  0::double precision,
                  extract(epoch from (now() - input.last_reviewed_at))
                    / 86400::double precision
                ) / 21::double precision
              )
            )
            - 0.15::double precision * (
              least(input.consecutive_success_count, 5)::double precision / 5
            )
          )
        )
      end as personal_concept_need,
      case
        when input.total_attempt_count = 0 then 1::double precision
        else 0::double precision
      end as card_new_component,
      case
        when input.total_attempt_count = 0 then 1::double precision
        else
          1::double precision - exp(
            -greatest(
              0::double precision,
              extract(epoch from (now() - input.last_attempt_at))
                / 86400::double precision
            ) / 14::double precision
          )
      end as card_revisit_need,
      case
        when input.total_attempt_count = 0 then 1::double precision
        else least(
          1::double precision,
          greatest(
            0::double precision,
            0.70::double precision * (
              (input.negative_attempt_count + 1)::double precision
                / (input.total_attempt_count + 2)::double precision
            )
            + 0.30::double precision * (
              case input.latest_card_result
                when 'easy' then 0.00::double precision
                when 'average' then 0.15::double precision
                when 'hard' then 0.30::double precision
                when 'didnt_know' then 0.85::double precision
                when 'forgot' then 1.00::double precision
                when 'too_hard' then 0.70::double precision
                else 0.00::double precision
              end
            )
          )
        )
      end as card_outcome_need,
      case
        when input.is_unseen_concept then 0.85::double precision
        else least(
          1::double precision,
          greatest(
            0::double precision,
            0.55::double precision * (
              (input.negative_evidence_count + 1)::double precision
                / (input.evidence_count + 2)::double precision
            )
            + 0.30::double precision * input.latest_result_need
            + 0.15::double precision * (
              least(input.consecutive_lapse_count, 3)::double precision / 3
            )
          )
        )
      end as personal_cram_need,
      (
        (
          input.last_result = 'forgot'
          and input.last_reviewed_at >= now() - interval '7 days'
        )
        or coalesce(input.consecutive_lapse_count, 0) >= 2
      ) as is_critical_personal
    from personal_inputs input
  ),
  personal_scores as (
    select
      metric.*,
      least(
        1::double precision,
        greatest(
          0::double precision,
          0.60::double precision * metric.personal_concept_need
            + 0.20::double precision * metric.card_new_component
            + 0.15::double precision * metric.card_outcome_need
            + 0.05::double precision * metric.card_revisit_need
        )
      ) as personal_priority,
      count(*) filter (
        where metric.session_attempt_count = metric.minimum_attempt_count
      ) over () as traversal_pool_count,
      max(metric.session_latest_position) over () as latest_personal_position
    from personal_metrics metric
  ),
  selected_personal as (
    select score.*
    from personal_scores score
    where score.session_attempt_count = score.minimum_attempt_count
    order by
      case
        when score.traversal_pool_count > 1
          and score.session_latest_position = score.latest_personal_position
          and score.latest_personal_position is not null
          then 1
        else 0
      end,
      case
        when target_session.cram_mode then score.personal_cram_need
        else score.personal_priority
      end desc,
      score.total_attempt_count,
      score.last_attempt_at asc nulls first,
      score.candidate_position,
      score.personal_card_id
    limit 1
  )
  select
    jsonb_build_object(
      'candidate_type', 'personal',
      'candidate_id', selected.candidate_id,
      'official_question_id', null,
      'official_concept_id', null,
      'personal_card_id', selected.personal_card_id,
      'personal_concept_id', selected.personal_concept_id,
      'personal_topic_id', selected.personal_topic_id,
      'prompt', selected.prompt,
      'answer', selected.answer,
      'explanation', null,
      'difficulty', null,
      'testing_angle', null,
      'candidate_position', selected.candidate_position,
      'created_at', selected.created_at
    )
    || case
      when coalesce(p_include_debug, false) then jsonb_build_object(
        'personal_priority', selected.personal_priority,
        'personal_concept_need', selected.personal_concept_need,
        'personal_cram_need', selected.personal_cram_need,
        'card_new_component', selected.card_new_component,
        'card_outcome_need', selected.card_outcome_need,
        'card_revisit_need', selected.card_revisit_need,
        'card_positive_attempt_count', selected.positive_attempt_count,
        'card_negative_attempt_count', selected.negative_attempt_count,
        'card_latest_result', selected.latest_card_result,
        'personal_evidence_count', selected.evidence_count,
        'personal_positive_evidence_count', selected.positive_evidence_count,
        'personal_negative_evidence_count', selected.negative_evidence_count,
        'personal_consecutive_success_count',
          selected.consecutive_success_count,
        'personal_consecutive_lapse_count', selected.consecutive_lapse_count,
        'personal_latest_result', selected.last_result,
        'personal_is_critical', selected.is_critical_personal,
        'personal_session_attempt_count', selected.session_attempt_count,
        'personal_traversal_minimum_count', selected.minimum_attempt_count,
        'selection_reason', case
          when target_session.cram_mode then 'personal_cram_need'
          when selected.is_unseen_concept then 'personal_unseen_concept'
          when selected.is_critical_personal then 'personal_lapse_priority'
          when selected.card_new_component > 0 then 'personal_new_card'
          else 'personal_priority'
        end
      )
      else '{}'::jsonb
    end
  into selection_result
  from selected_personal selected;

  return selection_result;
end;
$$;

create or replace function public.select_next_study_candidate(
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
  policy public.study_priority_source_policy%rowtype;
  official_offer jsonb;
  personal_offer jsonb;
  selected_offer jsonb;
  selected_source text;
  decision_reason text;
  official_attempt_count integer := 0;
  personal_attempt_count integer := 0;
  official_latest_position integer;
  personal_latest_position integer;
  official_absence integer := 0;
  personal_absence integer := 0;
  latest_source text;
  latest_source_run integer := 0;
  next_position integer;
  official_debt double precision := 0;
  personal_debt double precision := 0;
  official_critical boolean := false;
  personal_critical boolean := false;
  global_minimum_count integer;
  official_minimum_count integer;
  personal_minimum_count integer;
  official_available boolean;
  personal_available boolean;
  selection_result jsonb;
begin
  if current_user_id is null or not public.has_socrates_role() then
    raise exception 'Not authorized to select a Study candidate.';
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

  select source_policy.*
  into policy
  from public.study_priority_source_policy source_policy
  where source_policy.policy_name = 'normal_default';

  if policy.policy_name is null then
    raise exception 'Study priority source policy is not configured.';
  end if;

  if exists (
    select 1
    from public.resolve_study_candidates(target_session.study_deck_id) candidate
    where candidate.candidate_type = 'official'
  ) then
    official_offer := public.select_next_study_question(
      target_session.id,
      true
    );
  end if;

  if exists (
    select 1
    from public.resolve_study_candidates(target_session.study_deck_id) candidate
    where candidate.candidate_type = 'personal'
  ) then
    personal_offer := public.select_next_personal_study_card(
      target_session.id,
      true
    );
  end if;

  official_available := official_offer is not null;
  personal_available := personal_offer is not null;

  if not official_available and not personal_available then
    return null;
  end if;

  select
    count(*)::integer,
    max(attempt.sequence_position)
  into official_attempt_count, official_latest_position
  from public.review_attempts attempt
  where attempt.study_session_id = target_session.id
    and attempt.user_id = current_user_id;

  select
    count(*)::integer,
    max(attempt.sequence_position)
  into personal_attempt_count, personal_latest_position
  from public.personal_review_attempts attempt
  where attempt.study_session_id = target_session.id
    and attempt.user_id = current_user_id;

  next_position := official_attempt_count + personal_attempt_count + 1;
  official_absence := official_attempt_count + personal_attempt_count
    - coalesce(official_latest_position, 0);
  personal_absence := official_attempt_count + personal_attempt_count
    - coalesce(personal_latest_position, 0);

  official_debt :=
    next_position::double precision
      * policy.official_source_weight::double precision
      / (
        policy.official_source_weight + policy.personal_source_weight
      )::double precision
    - official_attempt_count::double precision;
  personal_debt :=
    next_position::double precision
      * policy.personal_source_weight::double precision
      / (
        policy.official_source_weight + policy.personal_source_weight
      )::double precision
    - personal_attempt_count::double precision;

  with combined_history as (
    select attempt.sequence_position, 'official'::text as source_type
    from public.review_attempts attempt
    where attempt.study_session_id = target_session.id
      and attempt.user_id = current_user_id

    union all

    select attempt.sequence_position, 'personal'::text as source_type
    from public.personal_review_attempts attempt
    where attempt.study_session_id = target_session.id
      and attempt.user_id = current_user_id
  ),
  latest as (
    select history.source_type
    from combined_history history
    order by history.sequence_position desc
    limit 1
  )
  select latest.source_type
  into latest_source
  from latest;

  if latest_source is not null then
    with combined_history as (
      select attempt.sequence_position, 'official'::text as source_type
      from public.review_attempts attempt
      where attempt.study_session_id = target_session.id
        and attempt.user_id = current_user_id

      union all

      select attempt.sequence_position, 'personal'::text as source_type
      from public.personal_review_attempts attempt
      where attempt.study_session_id = target_session.id
        and attempt.user_id = current_user_id
    )
    select count(*)::integer
    into latest_source_run
    from combined_history history
    where history.source_type = latest_source
      and not exists (
        select 1
        from combined_history newer
        where newer.sequence_position > history.sequence_position
          and newer.source_type <> latest_source
      );
  end if;

  official_critical :=
    coalesce((official_offer ->> 'lapse_priority_component')::double precision, 0) > 0
    or coalesce(
      (official_offer ->> 'repeated_lapse_priority_component')::double precision,
      0
    ) > 0
    or coalesce(
      (official_offer ->> 'urgent_review_component')::double precision,
      0
    ) > 0;
  personal_critical := coalesce(
    (personal_offer ->> 'personal_is_critical')::boolean,
    false
  );

  if target_session.cram_mode then
    with candidate_counts as (
      select
        candidate.candidate_type,
        candidate.candidate_id,
        case candidate.candidate_type
          when 'official' then (
            select count(*)::integer
            from public.review_attempts attempt
            where attempt.study_session_id = target_session.id
              and attempt.user_id = current_user_id
              and attempt.question_id = candidate.official_question_id
          )
          else (
            select count(*)::integer
            from public.personal_review_attempts attempt
            where attempt.study_session_id = target_session.id
              and attempt.user_id = current_user_id
              and attempt.personal_card_id = candidate.personal_card_id
          )
        end as session_attempt_count
      from public.resolve_study_candidates(target_session.study_deck_id) candidate
    )
    select
      min(counts.session_attempt_count),
      min(counts.session_attempt_count) filter (
        where counts.candidate_type = 'official'
      ),
      min(counts.session_attempt_count) filter (
        where counts.candidate_type = 'personal'
      )
    into
      global_minimum_count,
      official_minimum_count,
      personal_minimum_count
    from candidate_counts counts;

    official_available :=
      official_available
      and official_minimum_count = global_minimum_count;
    personal_available :=
      personal_available
      and personal_minimum_count = global_minimum_count;

    if official_available and not personal_available then
      selected_source := 'official';
      decision_reason := 'cram_global_traversal_official';
    elsif personal_available and not official_available then
      selected_source := 'personal';
      decision_reason := 'cram_global_traversal_personal';
    elsif coalesce(
      (official_offer ->> 'selected_concept_cram_need')::double precision,
      0
    ) >= coalesce(
      (personal_offer ->> 'personal_cram_need')::double precision,
      0
    ) then
      selected_source := 'official';
      decision_reason := 'cram_need_official';
    else
      selected_source := 'personal';
      decision_reason := 'cram_need_personal';
    end if;
  elsif official_available and not personal_available then
    selected_source := 'official';
    decision_reason := 'official_only';
  elsif personal_available and not official_available then
    selected_source := 'personal';
    decision_reason := 'personal_only';
  elsif personal_absence >= policy.max_source_absence
      or (
        latest_source = 'official'
        and latest_source_run >= policy.max_official_run
      ) then
    selected_source := 'personal';
    decision_reason := 'personal_starvation_guard';
  elsif official_absence >= policy.max_source_absence
      or (
        latest_source = 'personal'
        and latest_source_run >= policy.max_personal_run
      ) then
    selected_source := 'official';
    decision_reason := 'official_starvation_guard';
  elsif official_critical and not personal_critical then
    selected_source := 'official';
    decision_reason := 'official_urgency_override';
  elsif personal_critical and not official_critical then
    selected_source := 'personal';
    decision_reason := 'personal_urgency_override';
  elsif official_debt >= personal_debt then
    selected_source := 'official';
    decision_reason := case
      when official_critical and personal_critical
        then 'both_urgent_official_debt'
      else 'official_weighted_debt'
    end;
  else
    selected_source := 'personal';
    decision_reason := case
      when official_critical and personal_critical
        then 'both_urgent_personal_debt'
      else 'personal_weighted_debt'
    end;
  end if;

  selected_offer := case selected_source
    when 'official' then official_offer
    else personal_offer
  end;

  if selected_source = 'official' then
    select jsonb_build_object(
      'candidate_type', 'official',
      'candidate_id', candidate.candidate_id,
      'official_question_id', candidate.official_question_id,
      'official_concept_id', candidate.official_concept_id,
      'personal_card_id', null,
      'personal_concept_id', null,
      'personal_topic_id', null,
      'prompt', candidate.prompt,
      'answer', candidate.answer,
      'explanation', candidate.explanation,
      'difficulty', candidate.difficulty,
      'testing_angle', candidate.testing_angle,
      'candidate_position', candidate.candidate_position,
      'created_at', candidate.created_at
    )
    into selection_result
    from public.resolve_study_candidates(target_session.study_deck_id) candidate
    where candidate.candidate_type = 'official'
      and candidate.official_question_id = (
        selected_offer ->> 'question_id'
      )::uuid;
  else
    selection_result := selected_offer - array[
      'personal_priority',
      'personal_concept_need',
      'personal_cram_need',
      'card_new_component',
      'card_outcome_need',
      'card_revisit_need',
      'card_positive_attempt_count',
      'card_negative_attempt_count',
      'card_latest_result',
      'personal_evidence_count',
      'personal_positive_evidence_count',
      'personal_negative_evidence_count',
      'personal_consecutive_success_count',
      'personal_consecutive_lapse_count',
      'personal_latest_result',
      'personal_is_critical',
      'personal_session_attempt_count',
      'personal_traversal_minimum_count',
      'selection_reason'
    ];
  end if;

  if selection_result is null then
    raise exception 'Selected Study candidate is no longer eligible.';
  end if;

  if coalesce(p_include_debug, false) then
    selection_result := selection_result || jsonb_build_object(
      'debug', jsonb_build_object(
        'source_decision', decision_reason,
        'selected_source', selected_source,
        'official_source_weight', policy.official_source_weight,
        'personal_source_weight', policy.personal_source_weight,
        'max_source_absence', policy.max_source_absence,
        'max_official_run', policy.max_official_run,
        'max_personal_run', policy.max_personal_run,
        'official_attempt_count', official_attempt_count,
        'personal_attempt_count', personal_attempt_count,
        'official_debt', official_debt,
        'personal_debt', personal_debt,
        'official_critical', official_critical,
        'personal_critical', personal_critical,
        'latest_source', latest_source,
        'latest_source_run', latest_source_run,
        'global_traversal_minimum_count', global_minimum_count,
        'official_offer', official_offer,
        'personal_offer', personal_offer
      )
    );
  end if;

  return selection_result;
end;
$$;

comment on table public.study_priority_source_policy is
  'Protected Stage 2E product-policy parameters for mixed-source Study selection. The initial normal-mode ratio is two official slots to one personal slot.';
comment on function public.select_next_personal_study_card(uuid, boolean) is
  'Returns one eligible owned personal Card using personal Concept evidence, exact Card history, and source-local traversal. It writes no learner state.';
comment on function public.select_next_study_candidate(uuid, boolean) is
  'Returns one discriminated official or personal Study candidate. Official Algorithm v2 and both source-specific persistence paths remain unchanged.';

revoke all on function public.select_next_personal_study_card(uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.select_next_study_candidate(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.select_next_study_candidate(uuid, boolean)
  to authenticated;

notify pgrst, 'reload schema';

commit;
