-- Priority Algorithm v2 Phase 2: difficulty-aware learner-state evidence.
--
-- Authored Question difficulty now scales the existing response evidence
-- deltas. Medium preserves the deployed coefficients exactly. This migration
-- does not change selector ranking, Study Mode UI, deck setup, Cram traversal,
-- immutable review attempts, or Testing Angle coverage semantics.

begin;

create or replace function public.apply_user_concept_evidence(
  p_user_id uuid,
  p_concept_id uuid,
  p_result text,
  p_testing_angle text,
  p_exposure_at timestamptz,
  p_question_difficulty text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  mastery_delta numeric;
  retrievability_delta numeric;
  stability_delta numeric;
  uncertainty_delta numeric;
  normalized_testing_angle text := nullif(btrim(coalesce(p_testing_angle, '')), '');
begin
  if p_user_id is null or p_concept_id is null or p_exposure_at is null then
    raise exception 'Complete learner evidence identity and timestamp are required.';
  end if;

  if p_question_difficulty not in ('easy', 'medium', 'hard') then
    raise exception 'Unsupported question difficulty: %', p_question_difficulty;
  end if;

  -- Explicit response x authored-difficulty coefficient table. Medium is the
  -- original evidence model. Successful retrieval scales 0.90 / 1.00 / 1.10;
  -- Didn't Know and Forgot scale 1.10 / 1.00 / 0.90. Too Hard has separate
  -- state and uncertainty scaling because a hard probe exceeding current level
  -- is intentionally less mastery-negative but more uncertainty-positive.
  select
    coefficients.mastery_delta,
    coefficients.retrievability_delta,
    coefficients.stability_delta,
    coefficients.uncertainty_delta
  into
    mastery_delta,
    retrievability_delta,
    stability_delta,
    uncertainty_delta
  from (
    values
      ('easy',        'easy',    0.162::numeric,  0.198::numeric,  0.135::numeric, -0.108::numeric),
      ('easy',        'medium',  0.180::numeric,  0.220::numeric,  0.150::numeric, -0.120::numeric),
      ('easy',        'hard',    0.198::numeric,  0.242::numeric,  0.165::numeric, -0.132::numeric),
      ('average',     'easy',    0.090::numeric,  0.108::numeric,  0.072::numeric, -0.072::numeric),
      ('average',     'medium',  0.100::numeric,  0.120::numeric,  0.080::numeric, -0.080::numeric),
      ('average',     'hard',    0.110::numeric,  0.132::numeric,  0.088::numeric, -0.088::numeric),
      ('hard',        'easy',    0.036::numeric,  0.045::numeric,  0.027::numeric, -0.036::numeric),
      ('hard',        'medium',  0.040::numeric,  0.050::numeric,  0.030::numeric, -0.040::numeric),
      ('hard',        'hard',    0.044::numeric,  0.055::numeric,  0.033::numeric, -0.044::numeric),
      ('didnt_know',  'easy',   -0.242::numeric, -0.275::numeric, -0.088::numeric, -0.110::numeric),
      ('didnt_know',  'medium', -0.220::numeric, -0.250::numeric, -0.080::numeric, -0.100::numeric),
      ('didnt_know',  'hard',   -0.198::numeric, -0.225::numeric, -0.072::numeric, -0.090::numeric),
      ('forgot',      'easy',   -0.088::numeric, -0.330::numeric, -0.132::numeric, -0.066::numeric),
      ('forgot',      'medium', -0.080::numeric, -0.300::numeric, -0.120::numeric, -0.060::numeric),
      ('forgot',      'hard',   -0.072::numeric, -0.270::numeric, -0.108::numeric, -0.054::numeric),
      ('too_hard',    'easy',   -0.050::numeric, -0.125::numeric, -0.025::numeric,  0.030::numeric),
      ('too_hard',    'medium', -0.040::numeric, -0.100::numeric, -0.020::numeric,  0.040::numeric),
      ('too_hard',    'hard',   -0.020::numeric, -0.050::numeric, -0.010::numeric,  0.060::numeric)
  ) as coefficients(
    result,
    question_difficulty,
    mastery_delta,
    retrievability_delta,
    stability_delta,
    uncertainty_delta
  )
  where coefficients.result = p_result
    and coefficients.question_difficulty = p_question_difficulty;

  if mastery_delta is null then
    raise exception 'Unsupported learner response: %', p_result;
  end if;

  insert into public.user_concept_mastery as learner_state (
    user_id,
    concept_id,
    mastery_estimate,
    retrievability,
    stability,
    uncertainty,
    evidence_count,
    last_exposure_at,
    last_result
  )
  values (
    p_user_id,
    p_concept_id,
    least(1::numeric, greatest(0::numeric, 0.50::numeric + mastery_delta)),
    least(1::numeric, greatest(0::numeric, 0.50::numeric + retrievability_delta)),
    least(1::numeric, greatest(0::numeric, 0.25::numeric + stability_delta)),
    least(1::numeric, greatest(0::numeric, 0.75::numeric + uncertainty_delta)),
    1,
    p_exposure_at,
    p_result
  )
  on conflict (user_id, concept_id) do update
  set mastery_estimate = least(
        1::numeric,
        greatest(0::numeric, learner_state.mastery_estimate + mastery_delta)
      ),
      retrievability = least(
        1::numeric,
        greatest(0::numeric, learner_state.retrievability + retrievability_delta)
      ),
      stability = least(
        1::numeric,
        greatest(0::numeric, learner_state.stability + stability_delta)
      ),
      uncertainty = least(
        1::numeric,
        greatest(0::numeric, learner_state.uncertainty + uncertainty_delta)
      ),
      evidence_count = learner_state.evidence_count + 1,
      last_exposure_at = p_exposure_at,
      last_result = p_result,
      updated_at = now();

  if normalized_testing_angle is not null then
    insert into public.user_concept_testing_angle_state as angle_state (
      user_id,
      concept_id,
      testing_angle,
      evidence_count,
      last_exposure_at,
      last_result
    )
    values (
      p_user_id,
      p_concept_id,
      normalized_testing_angle,
      1,
      p_exposure_at,
      p_result
    )
    on conflict (user_id, concept_id, testing_angle) do update
    set evidence_count = angle_state.evidence_count + 1,
        last_exposure_at = p_exposure_at,
        last_result = p_result,
        updated_at = now();
  end if;
end;
$$;

-- Preserve the internal five-argument helper as a medium-baseline compatibility
-- path for any administrative code outside the application RPC. Its privileges
-- remain revoked from client roles.
create or replace function public.apply_user_concept_evidence(
  p_user_id uuid,
  p_concept_id uuid,
  p_result text,
  p_testing_angle text,
  p_exposure_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.apply_user_concept_evidence(
    p_user_id,
    p_concept_id,
    p_result,
    p_testing_angle,
    p_exposure_at,
    'medium'
  );
end;
$$;

create or replace function public.record_study_session_attempt(
  p_study_session_id uuid,
  p_question_id uuid,
  p_concept_id uuid,
  p_result text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_session public.study_sessions%rowtype;
  question_testing_angle text;
  question_difficulty text;
  next_position integer;
  new_attempt_id uuid;
  attempt_created_at timestamptz;
begin
  if current_user_id is null or not public.has_socrates_role() then
    raise exception 'Not authorized to record a study response.';
  end if;

  if p_result not in (
    'easy',
    'average',
    'hard',
    'didnt_know',
    'forgot',
    'too_hard'
  ) then
    raise exception 'Invalid Study Mode response.';
  end if;

  select ss.*
  into target_session
  from public.study_sessions ss
  where ss.id = p_study_session_id
    and ss.user_id = current_user_id
    and ss.ended_at is null
  for update;

  if target_session.id is null then
    raise exception 'Active study session not found.';
  end if;

  select q.testing_angle, q.difficulty
  into question_testing_angle, question_difficulty
  from public.questions q
  where q.id = p_question_id
    and q.concept_id = p_concept_id
    and q.status = 'published'
    and q.question_type = 'short_answer'
    and exists (
      select 1
      from public.question_accepted_answers qaa
      where qaa.question_id = q.id
    )
    and exists (
      select 1
      from public.resolve_study_deck(target_session.study_deck_id) resolved
      where resolved.concept_id = q.concept_id
    );

  if not found then
    raise exception 'Question is not eligible for this study session.';
  end if;

  next_position := target_session.answered_count + 1;

  insert into public.review_attempts (
    user_id,
    question_id,
    concept_id,
    result,
    score,
    study_session_id,
    sequence_position,
    testing_angle
  )
  values (
    current_user_id,
    p_question_id,
    p_concept_id,
    p_result,
    null,
    target_session.id,
    next_position,
    question_testing_angle
  )
  returning id, created_at into new_attempt_id, attempt_created_at;

  update public.study_sessions
  set answered_count = next_position
  where id = target_session.id;

  perform public.apply_user_concept_evidence(
    current_user_id,
    p_concept_id,
    p_result,
    question_testing_angle,
    attempt_created_at,
    question_difficulty
  );

  return jsonb_build_object(
    'attempt_id', new_attempt_id,
    'sequence_position', next_position
  );
end;
$$;

revoke all on function public.apply_user_concept_evidence(
  uuid,
  uuid,
  text,
  text,
  timestamptz,
  text
) from public, anon, authenticated;

revoke all on function public.apply_user_concept_evidence(
  uuid,
  uuid,
  text,
  text,
  timestamptz
) from public, anon, authenticated;

revoke all on function public.record_study_session_attempt(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_study_session_attempt(uuid, uuid, uuid, text)
  to authenticated;

commit;
