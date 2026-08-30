-- User x Concept learner-state projection derived from immutable review attempts.
-- Attempts remain the source of truth. This migration adds deterministic,
-- replaceable v1 evidence updates without scheduler or priority behavior.

begin;

do $$
begin
  if exists (select 1 from public.user_concept_mastery) then
    raise exception 'user_concept_mastery contains prototype rows; review them before applying learner-state semantics.';
  end if;
end;
$$;

alter table public.user_concept_mastery
  rename column mastery to mastery_estimate;

alter table public.user_concept_mastery
  alter column user_id set not null,
  alter column concept_id set not null,
  alter column mastery_estimate drop default,
  alter column updated_at set default now(),
  alter column updated_at set not null,
  add column retrievability numeric not null,
  add column stability numeric not null,
  add column uncertainty numeric not null,
  add column evidence_count integer not null,
  add column last_exposure_at timestamptz not null,
  add column last_result text not null,
  add column created_at timestamptz not null default now(),
  add constraint user_concept_mastery_mastery_estimate_check
    check (mastery_estimate between 0 and 1),
  add constraint user_concept_mastery_retrievability_check
    check (retrievability between 0 and 1),
  add constraint user_concept_mastery_stability_check
    check (stability between 0 and 1),
  add constraint user_concept_mastery_uncertainty_check
    check (uncertainty between 0 and 1),
  add constraint user_concept_mastery_evidence_count_check
    check (evidence_count > 0),
  add constraint user_concept_mastery_last_result_check
    check (
      last_result in (
        'easy',
        'average',
        'hard',
        'didnt_know',
        'forgot',
        'too_hard'
      )
    );

create table public.user_concept_testing_angle_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  concept_id uuid not null references public.concepts(id) on delete cascade,
  testing_angle text not null
    constraint user_concept_testing_angle_not_blank
    check (btrim(testing_angle) <> ''),
  evidence_count integer not null
    constraint user_concept_testing_angle_evidence_count_check
    check (evidence_count > 0),
  last_exposure_at timestamptz not null,
  last_result text not null
    constraint user_concept_testing_angle_last_result_check
    check (
      last_result in (
        'easy',
        'average',
        'hard',
        'didnt_know',
        'forgot',
        'too_hard'
      )
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, concept_id, testing_angle),
  constraint user_concept_testing_angle_parent_fkey
    foreign key (user_id, concept_id)
    references public.user_concept_mastery(user_id, concept_id)
    on delete cascade
);

create index user_concept_testing_angle_concept_idx
  on public.user_concept_testing_angle_state(concept_id, testing_angle);

alter table public.user_concept_testing_angle_state enable row level security;

drop policy if exists "Users manage own mastery" on public.user_concept_mastery;
create policy "Users read own concept learner state"
  on public.user_concept_mastery
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.has_socrates_role()
  );

drop policy if exists "Users manage own submastery" on public.user_submastery;
create policy "Users read own submastery"
  on public.user_submastery
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.has_socrates_role()
  );

create policy "Users read own concept testing-angle state"
  on public.user_concept_testing_angle_state
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.has_socrates_role()
  );

revoke all on table public.user_concept_mastery from public, anon, authenticated;
revoke all on table public.user_submastery from public, anon, authenticated;
revoke all on table public.user_concept_testing_angle_state from public, anon, authenticated;
grant select on table public.user_concept_mastery to authenticated;
grant select on table public.user_submastery to authenticated;
grant select on table public.user_concept_testing_angle_state to authenticated;

alter table public.review_attempts
  add column testing_angle text,
  add constraint review_attempts_testing_angle_not_blank
    check (testing_angle is null or btrim(testing_angle) <> '');

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

  select q.testing_angle
  into question_testing_angle
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
    attempt_created_at
  );

  return jsonb_build_object(
    'attempt_id', new_attempt_id,
    'sequence_position', next_position
  );
end;
$$;

do $$
declare
  historical_attempt record;
begin
  for historical_attempt in
    select
      ra.user_id,
      ra.concept_id,
      ra.result,
      ra.created_at
    from public.review_attempts ra
    join public.questions q
      on q.id = ra.question_id
      and q.concept_id = ra.concept_id
    where ra.user_id is not null
      and ra.concept_id is not null
      and ra.created_at is not null
      and ra.result in (
        'easy',
        'average',
        'hard',
        'didnt_know',
        'forgot',
        'too_hard'
      )
    order by ra.user_id, ra.concept_id, ra.created_at, ra.id
  loop
    perform public.apply_user_concept_evidence(
      historical_attempt.user_id,
      historical_attempt.concept_id,
      historical_attempt.result,
      null,
      historical_attempt.created_at
    );
  end loop;
end;
$$;

revoke all on function public.apply_user_concept_evidence(uuid, uuid, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.record_study_session_attempt(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_study_session_attempt(uuid, uuid, uuid, text)
  to authenticated;

commit;
