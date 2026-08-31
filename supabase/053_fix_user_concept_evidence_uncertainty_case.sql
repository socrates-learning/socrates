-- Correct the deployed learner-state uncertainty CASE without rewriting
-- previously applied migration history. All other evidence coefficients and
-- atomic upsert behavior remain unchanged.

begin;

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

  select
    case p_result
      when 'easy' then 0.18
      when 'average' then 0.10
      when 'hard' then 0.04
      when 'didnt_know' then -0.22
      when 'forgot' then -0.08
      when 'too_hard' then -0.04
    end,
    case p_result
      when 'easy' then 0.22
      when 'average' then 0.12
      when 'hard' then 0.05
      when 'didnt_know' then -0.25
      when 'forgot' then -0.30
      when 'too_hard' then -0.10
    end,
    case p_result
      when 'easy' then 0.15
      when 'average' then 0.08
      when 'hard' then 0.03
      when 'didnt_know' then -0.08
      when 'forgot' then -0.12
      when 'too_hard' then -0.02
    end,
    case p_result
      when 'easy' then -0.12
      when 'average' then -0.08
      when 'hard' then -0.04
      when 'didnt_know' then -0.10
      when 'forgot' then -0.06
      when 'too_hard' then 0.04
    end
  into
    mastery_delta,
    retrievability_delta,
    stability_delta,
    uncertainty_delta;

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

revoke all on function public.apply_user_concept_evidence(
  uuid,
  uuid,
  text,
  text,
  timestamptz
) from public, anon, authenticated;

commit;
