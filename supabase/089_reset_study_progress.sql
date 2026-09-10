-- Owner-scoped official Study progress reset with preserved lifetime history.
--
-- Historical review_attempts and study_sessions remain auditable. A sparse
-- reset ledger establishes the active-learning boundary for each affected
-- Concept; current learner projections are removed and the official selector
-- ignores attempts at or before that boundary. Personal Study state, authored
-- content, deck configuration, feedback, and flags are deliberately untouched.

begin;

do $$
begin
  if to_regclass('public.review_attempts') is null
    or to_regclass('public.user_concept_mastery') is null
    or to_regclass('public.user_concept_testing_angle_state') is null
    or to_regclass('public.study_sessions') is null
    or to_regclass('public.study_decks') is null
    or to_regclass('public.library_nodes') is null
    or to_regclass('public.concept_placements') is null
    or to_regprocedure('public.select_next_study_question(uuid,boolean)') is null
  then
    raise exception 'Reset Study Progress prerequisites are not installed.';
  end if;
end;
$$;

create table public.study_progress_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  library_id uuid not null,
  scope text not null
    constraint study_progress_resets_scope_check
    check (scope in ('concept', 'topic', 'library')),
  target_id uuid,
  target_name text not null
    constraint study_progress_resets_target_name_not_blank
    check (btrim(target_name) <> ''),
  reset_at timestamptz not null,
  concepts_reset integer not null
    constraint study_progress_resets_concepts_reset_check
    check (concepts_reset >= 0),
  mastery_rows_reset integer not null
    constraint study_progress_resets_mastery_rows_check
    check (mastery_rows_reset >= 0),
  testing_angle_rows_reset integer not null
    constraint study_progress_resets_angle_rows_check
    check (testing_angle_rows_reset >= 0),
  submastery_rows_reset integer not null
    constraint study_progress_resets_submastery_rows_check
    check (submastery_rows_reset >= 0),
  study_sessions_closed integer not null
    constraint study_progress_resets_sessions_closed_check
    check (study_sessions_closed >= 0),
  result_summary jsonb not null,
  created_at timestamptz not null default now(),
  constraint study_progress_resets_user_request_key unique (user_id, request_id),
  constraint study_progress_resets_id_user_key unique (id, user_id),
  constraint study_progress_resets_target_shape_check check (
    (scope = 'library' and target_id is null)
    or (scope in ('concept', 'topic') and target_id is not null)
  )
);

create index study_progress_resets_user_library_created_idx
  on public.study_progress_resets(user_id, library_id, created_at desc);

create table public.study_progress_reset_concepts (
  reset_id uuid not null,
  user_id uuid not null,
  concept_id uuid not null,
  reset_at timestamptz not null,
  primary key (reset_id, concept_id),
  constraint study_progress_reset_concepts_reset_owner_fkey
    foreign key (reset_id, user_id)
    references public.study_progress_resets(id, user_id)
    on delete cascade
);

create index study_progress_reset_concepts_active_boundary_idx
  on public.study_progress_reset_concepts(user_id, concept_id, reset_at desc);

alter table public.study_progress_resets enable row level security;
alter table public.study_progress_reset_concepts enable row level security;

create policy "Users read own Study progress resets"
  on public.study_progress_resets
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.has_socrates_role()
  );

create policy "Users read own Study progress reset Concepts"
  on public.study_progress_reset_concepts
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.has_socrates_role()
  );

revoke all on table public.study_progress_resets
  from public, anon, authenticated;
revoke all on table public.study_progress_reset_concepts
  from public, anon, authenticated;
grant select on table public.study_progress_resets to authenticated;
grant select on table public.study_progress_reset_concepts to authenticated;

-- Internal selector helper. It is intentionally not client executable.
create function public.get_concept_study_reset_at(
  p_user_id uuid,
  p_concept_id uuid
)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select max(boundary.reset_at)
  from public.study_progress_reset_concepts boundary
  where boundary.user_id = p_user_id
    and boundary.concept_id = p_concept_id;
$$;

revoke all on function public.get_concept_study_reset_at(uuid, uuid)
  from public, anon, authenticated;

-- Serialize official Study writes against reset boundaries and reject a card
-- submitted from a session that began before its Concept was reset.
create function public.enforce_review_attempt_reset_boundary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_started_at timestamptz;
  latest_reset_at timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.user_id::text, 0)
  );

  if new.study_session_id is null or new.concept_id is null then
    return new;
  end if;

  select session_row.started_at
  into session_started_at
  from public.study_sessions session_row
  where session_row.id = new.study_session_id
    and session_row.user_id = new.user_id;

  latest_reset_at := public.get_concept_study_reset_at(
    new.user_id,
    new.concept_id
  );

  if latest_reset_at is not null
    and session_started_at is not null
    and session_started_at <= latest_reset_at
  then
    raise exception 'Study progress changed after this session began. Exit Study and start a new session.';
  end if;

  return new;
end;
$$;

create trigger enforce_review_attempt_reset_boundary
  before insert on public.review_attempts
  for each row execute function public.enforce_review_attempt_reset_boundary();

revoke all on function public.enforce_review_attempt_reset_boundary()
  from public, anon, authenticated;

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

  -- Serialize Study evidence with owner-scoped reset boundaries before the
  -- session row is locked, preventing lock inversion with a concurrent reset.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_user_id::text, 0)
  );

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

revoke all on function public.record_study_session_attempt(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_study_session_attempt(uuid, uuid, uuid, text)
  to authenticated;

create function public.reset_study_progress(
  p_request_id uuid,
  p_scope text,
  p_library_id uuid,
  p_target_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_scope text := lower(btrim(coalesce(p_scope, '')));
  target_name text;
  new_reset_id uuid;
  reset_timestamp timestamptz;
  concept_count integer := 0;
  mastery_count integer := 0;
  angle_count integer := 0;
  submastery_count integer := 0;
  closed_session_count integer := 0;
  saved public.study_progress_resets%rowtype;
  summary jsonb;
begin
  if current_user_id is null or not public.has_socrates_role() then
    raise exception 'Not authorized to reset Study progress.';
  end if;

  if p_request_id is null then
    raise exception 'A reset request identifier is required.';
  end if;

  if normalized_scope not in ('concept', 'topic', 'library') then
    raise exception 'Reset scope must be concept, topic, or library.';
  end if;

  if p_library_id is null then
    raise exception 'An active Library is required.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_user_id::text, 0)
  );

  select reset_row.*
  into saved
  from public.study_progress_resets reset_row
  where reset_row.user_id = current_user_id
    and reset_row.request_id = p_request_id
  for update;

  if saved.id is not null then
    if saved.scope is distinct from normalized_scope
      or saved.library_id is distinct from p_library_id
      or saved.target_id is distinct from p_target_id
    then
      raise exception 'Reset request identifier was already used for a different scope or target.';
    end if;
    return saved.result_summary;
  end if;

  if not exists (
    select 1
    from public.libraries library_row
    where library_row.id = p_library_id
      and library_row.status = 'active'
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
    raise exception 'Not authorized to reset progress for this Library.';
  end if;

  if normalized_scope = 'library' then
    if p_target_id is not null then
      raise exception 'Current Library reset does not accept a separate target.';
    end if;
    select library_row.name
    into target_name
    from public.libraries library_row
    where library_row.id = p_library_id;
  elsif normalized_scope = 'topic' then
    if p_target_id is null then
      raise exception 'A Topic or branch is required.';
    end if;
    select node.name
    into target_name
    from public.library_nodes node
    where node.id = p_target_id
      and node.library_id = p_library_id
    for share;
    if target_name is null then
      raise exception 'Topic does not belong to the active Library.';
    end if;
  else
    if p_target_id is null then
      raise exception 'A Concept is required.';
    end if;
    select concept.name
    into target_name
    from public.concepts concept
    where concept.id = p_target_id
      and concept.status = 'published'
      and exists (
        select 1
        from public.concept_placements placement
        join public.library_nodes node
          on node.id = placement.library_node_id
        where placement.concept_id = concept.id
          and node.library_id = p_library_id
      )
    for share;
    if target_name is null then
      raise exception 'Published Concept does not belong to the active Library.';
    end if;
  end if;

  -- Ending every open session in the target Library is deliberate: a session
  -- snapshots deck configuration and may already hold any affected card in a
  -- different browser tab. Lifetime session and attempt history is preserved.
  update public.study_sessions session_row
  set ended_at = greatest(now(), session_row.started_at)
  where session_row.user_id = current_user_id
    and session_row.library_id = p_library_id
    and session_row.ended_at is null;
  get diagnostics closed_session_count = row_count;

  reset_timestamp := clock_timestamp();

  insert into public.study_progress_resets (
    user_id,
    request_id,
    library_id,
    scope,
    target_id,
    target_name,
    reset_at,
    concepts_reset,
    mastery_rows_reset,
    testing_angle_rows_reset,
    submastery_rows_reset,
    study_sessions_closed,
    result_summary
  )
  values (
    current_user_id,
    p_request_id,
    p_library_id,
    normalized_scope,
    p_target_id,
    target_name,
    reset_timestamp,
    0,
    0,
    0,
    0,
    closed_session_count,
    '{}'::jsonb
  )
  returning id into new_reset_id;

  with recursive topic_subtree as (
    select node.id
    from public.library_nodes node
    where normalized_scope = 'topic'
      and node.id = p_target_id
      and node.library_id = p_library_id

    union

    select child.id
    from topic_subtree parent
    join public.library_nodes child
      on child.parent_id = parent.id
     and child.library_id = p_library_id
  ),
  target_concepts as (
    select distinct concept.id as concept_id
    from public.concepts concept
    join public.concept_placements placement
      on placement.concept_id = concept.id
    join public.library_nodes node
      on node.id = placement.library_node_id
     and node.library_id = p_library_id
    where concept.status = 'published'
      and (
        normalized_scope = 'library'
        or (normalized_scope = 'concept' and concept.id = p_target_id)
        or (
          normalized_scope = 'topic'
          and placement.library_node_id in (
            select subtree.id from topic_subtree subtree
          )
        )
      )
  )
  insert into public.study_progress_reset_concepts (
    reset_id,
    user_id,
    concept_id,
    reset_at
  )
  select
    new_reset_id,
    current_user_id,
    target.concept_id,
    reset_timestamp
  from target_concepts target;

  select count(*)::integer
  into concept_count
  from public.study_progress_reset_concepts boundary
  where boundary.reset_id = new_reset_id;

  select count(*)::integer
  into angle_count
  from public.user_concept_testing_angle_state angle_state
  join public.study_progress_reset_concepts boundary
    on boundary.reset_id = new_reset_id
   and boundary.concept_id = angle_state.concept_id
  where angle_state.user_id = current_user_id;

  delete from public.user_submastery submastery
  using public.study_progress_reset_concepts boundary
  where boundary.reset_id = new_reset_id
    and submastery.user_id = current_user_id
    and submastery.concept_id = boundary.concept_id;
  get diagnostics submastery_count = row_count;

  -- Testing Angle state is deleted by its same-user Concept-state cascade.
  delete from public.user_concept_mastery mastery
  using public.study_progress_reset_concepts boundary
  where boundary.reset_id = new_reset_id
    and mastery.user_id = current_user_id
    and mastery.concept_id = boundary.concept_id;
  get diagnostics mastery_count = row_count;

  summary := jsonb_build_object(
    'request_id', p_request_id,
    'reset_at', reset_timestamp,
    'scope', normalized_scope,
    'target_id', p_target_id,
    'target_name', target_name,
    'concepts_reset', concept_count,
    'mastery_rows_reset', mastery_count,
    'testing_angle_rows_reset', angle_count,
    'submastery_rows_reset', submastery_count,
    'study_sessions_closed', closed_session_count,
    'historical_attempts_preserved', true,
    'personal_progress_unchanged', true
  );

  update public.study_progress_resets reset_row
  set concepts_reset = concept_count,
      mastery_rows_reset = mastery_count,
      testing_angle_rows_reset = angle_count,
      submastery_rows_reset = submastery_count,
      study_sessions_closed = closed_session_count,
      result_summary = summary
  where reset_row.id = new_reset_id;

  return summary;
end;
$$;

revoke all on function public.reset_study_progress(uuid, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.reset_study_progress(uuid, text, uuid, uuid)
  to authenticated;

-- The official selector definition below is copied from released Migration 082.
-- Its formulas, eligibility, tie-breaking, Cram traversal, and debug contract
-- are unchanged. Four historical-attempt reads now apply the latest reset
-- boundary for the relevant Concept.

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
       and attempt.created_at > coalesce(
         public.get_concept_study_reset_at(
           current_user_id,
           question.concept_id
         ),
         '-infinity'::timestamptz
       )
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
  effective_deck_concepts as (
    select resolved.*
    from public.resolve_study_deck(target_session.study_deck_id) resolved
  ),
  eligible_concepts as (
    select
      resolved.concept_id,
      resolved.selection_source
    from effective_deck_concepts resolved
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
  direct_prerequisite_concepts as (
    select distinct
      downstream.concept_id as downstream_concept_id,
      edge.prerequisite_concept_id as prerequisite_concept_id,
      edge.strength
    from eligible_concepts downstream
    join public.concept_prerequisites edge
      on edge.concept_id = downstream.concept_id
     and edge.prerequisite_concept_id is not null
    join effective_deck_concepts effective
      on effective.concept_id = edge.prerequisite_concept_id
    join public.concepts prerequisite
      on prerequisite.id = edge.prerequisite_concept_id
     and prerequisite.status = 'published'
    where edge.prerequisite_concept_id <> downstream.concept_id
      and exists (
        select 1
        from public.concept_placements placement
        join public.library_nodes node
          on node.id = placement.library_node_id
        where placement.concept_id = edge.prerequisite_concept_id
          and node.library_id = target_session.library_id
      )
  ),
  prerequisite_topic_nodes as (
    select
      downstream.concept_id as downstream_concept_id,
      edge.prerequisite_library_node_id as prerequisite_root_node_id,
      edge.prerequisite_library_node_id as node_id,
      edge.strength
    from eligible_concepts downstream
    join public.concept_prerequisites edge
      on edge.concept_id = downstream.concept_id
     and edge.prerequisite_library_node_id is not null
    join public.library_nodes prerequisite_root
      on prerequisite_root.id = edge.prerequisite_library_node_id
     and prerequisite_root.library_id = target_session.library_id

    union

    select
      topic.downstream_concept_id,
      topic.prerequisite_root_node_id,
      child.id,
      topic.strength
    from prerequisite_topic_nodes topic
    join public.library_nodes child
      on child.parent_id = topic.node_id
     and child.library_id = target_session.library_id
  ),
  topic_prerequisite_concepts as (
    select distinct
      topic.downstream_concept_id,
      placement.concept_id as prerequisite_concept_id,
      topic.strength
    from prerequisite_topic_nodes topic
    join public.concept_placements placement
      on placement.library_node_id = topic.node_id
    join public.concepts prerequisite
      on prerequisite.id = placement.concept_id
     and prerequisite.status = 'published'
    join effective_deck_concepts effective
      on effective.concept_id = placement.concept_id
    where placement.concept_id <> topic.downstream_concept_id
  ),
  qualifying_prerequisite_concepts as (
    select
      direct.downstream_concept_id,
      direct.prerequisite_concept_id,
      direct.strength
    from direct_prerequisite_concepts direct

    union

    select
      topic.downstream_concept_id,
      topic.prerequisite_concept_id,
      topic.strength
    from topic_prerequisite_concepts topic
  ),
  prerequisite_priority_components as (
    select
      qualifying.downstream_concept_id as concept_id,
      least(
        0.12::double precision,
        max(
          case qualifying.strength
            when 'required' then 0.12::double precision
            when 'recommended' then 0.06::double precision
          end
          * greatest(
              0::double precision,
              (
                0.75::double precision
                  - coalesce(mastery.mastery_estimate, 0)::double precision
              ) / 0.75::double precision
            )
        )
      ) as prerequisite_priority_component
    from qualifying_prerequisite_concepts qualifying
    left join public.user_concept_mastery mastery
      on mastery.user_id = current_user_id
     and mastery.concept_id = qualifying.prerequisite_concept_id
    group by qualifying.downstream_concept_id
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
        and attempt.created_at > coalesce(
          public.get_concept_study_reset_at(
            current_user_id,
            balance.concept_id
          ),
          '-infinity'::timestamptz
        )
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
      coalesce(
        prerequisite.prerequisite_priority_component,
        0::double precision
      ) as prerequisite_priority_component,
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
    left join prerequisite_priority_components prerequisite
      on prerequisite.concept_id = balance.concept_id
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
        + score.prerequisite_priority_component
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
  selected_angle_history_attempts as (
    select
      angle.concept_id,
      angle.normalized_angle,
      history.response_value
    from eligible_angles angle
    join selected_concept selected
      on selected.concept_id = angle.concept_id
    join lateral (
      select
        case attempt.result
          when 'easy' then 1.00::double precision
          when 'average' then 0.75::double precision
          when 'hard' then 0.60::double precision
          when 'didnt_know' then 0.00::double precision
          when 'forgot' then 0.10::double precision
          when 'too_hard' then 0.25::double precision
        end as response_value
      from public.review_attempts attempt
      where attempt.user_id = current_user_id
        and attempt.concept_id = selected.concept_id
        and attempt.created_at > coalesce(
          public.get_concept_study_reset_at(
            current_user_id,
            selected.concept_id
          ),
          '-infinity'::timestamptz
        )
        and lower(btrim(attempt.testing_angle)) = angle.normalized_angle
        and attempt.result in (
          'easy',
          'average',
          'hard',
          'didnt_know',
          'forgot',
          'too_hard'
        )
        and attempt.created_at >= now() - interval '45 days'
      order by attempt.created_at desc, attempt.id desc
      limit 6
    ) history on true
  ),
  selected_angle_history_metrics as (
    select
      history.concept_id,
      history.normalized_angle,
      count(*)::integer as history_count,
      avg(history.response_value) as mean_response,
      avg(history.response_value * history.response_value) as mean_square_response
    from selected_angle_history_attempts history
    group by history.concept_id, history.normalized_angle
  ),
  selected_angle_components as (
    select
      angle.concept_id,
      angle.normalized_angle,
      rollup.evidence_count,
      rollup.last_exposure_at,
      latest.last_result,
      coalesce(history.history_count, 0) as history_count,
      case
        when rollup.evidence_count is null then 1::double precision
        else
          0.45::double precision
            / sqrt(greatest(1, rollup.evidence_count)::double precision)
      end as evidence_need_component,
      case
        when rollup.evidence_count is null then 0::double precision
        else
          0.20::double precision * (
            1::double precision
              - exp(
                  -greatest(
                    0::double precision,
                    extract(epoch from (now() - rollup.last_exposure_at))
                      / 86400::double precision
                  ) / 30::double precision
                )
          )
      end as time_need_component,
      case
        when rollup.evidence_count is null then 0::double precision
        else
          0.25::double precision * case latest.last_result
            when 'easy' then 0.00::double precision
            when 'average' then 0.30::double precision
            when 'hard' then 0.50::double precision
            when 'didnt_know' then 1.00::double precision
            when 'forgot' then 0.90::double precision
            when 'too_hard' then 0.60::double precision
            else 0::double precision
          end
      end as response_need_component,
      case
        when coalesce(history.history_count, 0) < 2 then 0::double precision
        else
          0.10::double precision * least(
            1::double precision,
            greatest(
              0::double precision,
              4::double precision * (
                history.mean_square_response
                  - history.mean_response * history.mean_response
              )
            )
          )
      end as contradiction_need_component
    from eligible_angles angle
    join selected_concept selected
      on selected.concept_id = angle.concept_id
    left join angle_state_rollup rollup
      on rollup.concept_id = angle.concept_id
     and rollup.normalized_angle = angle.normalized_angle
    left join angle_state_latest latest
      on latest.concept_id = angle.concept_id
     and latest.normalized_angle = angle.normalized_angle
    left join selected_angle_history_metrics history
      on history.concept_id = angle.concept_id
     and history.normalized_angle = angle.normalized_angle
  ),
  selected_angle_needs as (
    select
      component.*,
      case
        when component.evidence_count is null then 1::double precision
        else least(
          0.95::double precision,
          greatest(
            0::double precision,
            component.evidence_need_component
              + component.time_need_component
              + component.response_need_component
              + component.contradiction_need_component
          )
        )
      end as angle_need
    from selected_angle_components component
  ),
  selected_preferred_angle as (
    select angle.*
    from selected_angle_needs angle
    order by angle.angle_need desc, angle.normalized_angle
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
     and attempt.created_at > coalesce(
       public.get_concept_study_reset_at(
         current_user_id,
         question.concept_id
       ),
       '-infinity'::timestamptz
     )
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
      preferred.normalized_angle as preferred_angle,
      preferred.angle_need,
      preferred.evidence_count as angle_evidence_count,
      preferred.history_count as angle_history_count,
      preferred.evidence_need_component,
      preferred.time_need_component,
      preferred.response_need_component,
      preferred.contradiction_need_component,
      selected.angle_need as concept_angle_need,
      selected.new_component,
      selected.review_component,
      selected.angle_component,
      selected.prerequisite_priority_component,
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
    join selected_preferred_angle preferred
      on preferred.concept_id = selected.concept_id
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
        'prerequisite_priority_component',
          selected.prerequisite_priority_component,
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
        'concept_angle_need', selected.concept_angle_need,
        'angle_evidence_count', selected.angle_evidence_count,
        'angle_history_count', selected.angle_history_count,
        'angle_evidence_component', selected.evidence_need_component,
        'angle_time_component', selected.time_need_component,
        'angle_response_component', selected.response_need_component,
        'angle_contradiction_component',
          selected.contradiction_need_component,
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

comment on table public.study_progress_resets is
  'Owner-scoped idempotent official Study reset ledger. Historical attempts and sessions are preserved.';
comment on table public.study_progress_reset_concepts is
  'Exact Concept membership and timestamp snapshot for each official Study progress reset.';
comment on function public.reset_study_progress(uuid, text, uuid, uuid) is
  'Atomically restarts active official learner state for one Concept, Topic subtree, or active Library while preserving lifetime history and all content/deck configuration.';

notify pgrst, 'reload schema';

commit;
