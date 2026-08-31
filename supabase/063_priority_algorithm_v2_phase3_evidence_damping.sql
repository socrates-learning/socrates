-- Priority Algorithm v2 Phase 3: evidence-aware learner-state damping.
--
-- The Phase 2 response x authored-difficulty table remains the raw evidence
-- signal. A transparent multiplier based on the pre-attempt evidence_count
-- makes established learner state more conservative without suppressing clear
-- negative evidence or fresh Forgot lapses. Selector ranking, Study Mode UI,
-- deck setup, Cram traversal, immutable review attempts, and Testing Angle
-- coverage semantics are unchanged.

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
  maturity_multiplier numeric;
  normalized_testing_angle text := nullif(btrim(coalesce(p_testing_angle, '')), '');
begin
  if p_user_id is null or p_concept_id is null or p_exposure_at is null then
    raise exception 'Complete learner evidence identity and timestamp are required.';
  end if;

  if p_question_difficulty not in ('easy', 'medium', 'hard') then
    raise exception 'Unsupported question difficulty: %', p_question_difficulty;
  end if;

  -- Exact Phase 2 raw response x authored-difficulty coefficient table.
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

  -- Evidence bands use the count before this attempt. All response families
  -- are undamped through the foundational band. Mature routine evidence has a
  -- 0.35 floor, clear negative evidence has a 0.50 floor, and Forgot has a
  -- 0.65 floor so a genuine lapse remains meaningful in established state.
  select
    case
      when coalesce(learner_state.evidence_count, 0) <= 10 then 1.00::numeric
      when coalesce(learner_state.evidence_count, 0) <= 24 then 0.75::numeric
      when coalesce(learner_state.evidence_count, 0) <= 49 then 0.50::numeric
      when p_result = 'forgot' then 0.65::numeric
      when p_result in ('didnt_know', 'too_hard') then 0.50::numeric
      else 0.35::numeric
    end
  into maturity_multiplier
  from (values (1)) as singleton(dummy)
  left join public.user_concept_mastery learner_state
    on learner_state.user_id = p_user_id
   and learner_state.concept_id = p_concept_id;

  mastery_delta := mastery_delta * maturity_multiplier;
  retrievability_delta := retrievability_delta * maturity_multiplier;
  stability_delta := stability_delta * maturity_multiplier;
  uncertainty_delta := uncertainty_delta * maturity_multiplier;

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

revoke all on function public.apply_user_concept_evidence(
  uuid,
  uuid,
  text,
  text,
  timestamptz,
  text
) from public, anon, authenticated;

commit;
