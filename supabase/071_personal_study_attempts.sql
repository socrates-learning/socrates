-- Study Creator Stage 2C: isolated personal Card attempt persistence.
--
-- Personal responses share the existing Study Session identity and sequence,
-- but never enter official review_attempts, official Concept learner state,
-- Testing Angle evidence, or either Priority selector.

begin;

-- These redundant same-owner keys let the personal attempt table enforce its
-- ownership invariants with foreign keys rather than trusting RPC checks alone.
alter table public.study_decks
  add constraint study_decks_id_user_key unique (id, user_id);

alter table public.study_sessions
  add constraint study_sessions_id_deck_user_key
  unique (id, study_deck_id, user_id);

alter table public.personal_cards
  add constraint personal_cards_id_concept_owner_key
  unique (id, concept_id, owner_id);

create table public.personal_review_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  study_session_id uuid not null,
  study_deck_id uuid not null,
  personal_card_id uuid not null,
  personal_concept_id uuid not null,
  result text not null
    constraint personal_review_attempts_result_check
    check (
      result in (
        'easy',
        'average',
        'hard',
        'didnt_know',
        'forgot',
        'too_hard'
      )
    ),
  sequence_position integer not null
    constraint personal_review_attempts_sequence_position_check
    check (sequence_position > 0),
  created_at timestamptz not null default now(),
  constraint personal_review_attempts_session_sequence_key
    unique (study_session_id, sequence_position),
  constraint personal_review_attempts_session_deck_owner_fkey
    foreign key (study_session_id, study_deck_id, user_id)
    references public.study_sessions(id, study_deck_id, user_id)
    on delete restrict,
  constraint personal_review_attempts_deck_owner_fkey
    foreign key (study_deck_id, user_id)
    references public.study_decks(id, user_id)
    on delete restrict,
  constraint personal_review_attempts_card_concept_owner_fkey
    foreign key (personal_card_id, personal_concept_id, user_id)
    references public.personal_cards(id, concept_id, owner_id)
    on delete restrict,
  constraint personal_review_attempts_concept_owner_fkey
    foreign key (personal_concept_id, user_id)
    references public.personal_concepts(id, owner_id)
    on delete restrict
);

create index personal_review_attempts_user_created_idx
  on public.personal_review_attempts(user_id, created_at desc);
create index personal_review_attempts_session_created_idx
  on public.personal_review_attempts(study_session_id, created_at, id);
create index personal_review_attempts_card_created_idx
  on public.personal_review_attempts(personal_card_id, created_at desc);
create index personal_review_attempts_concept_created_idx
  on public.personal_review_attempts(personal_concept_id, created_at desc);

create table public.user_personal_concept_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  personal_concept_id uuid not null,
  evidence_count integer not null
    constraint user_personal_concept_state_evidence_count_check
    check (evidence_count > 0),
  positive_evidence_count integer not null
    constraint user_personal_concept_state_positive_count_check
    check (positive_evidence_count >= 0),
  negative_evidence_count integer not null
    constraint user_personal_concept_state_negative_count_check
    check (negative_evidence_count >= 0),
  consecutive_success_count integer not null
    constraint user_personal_concept_state_success_streak_check
    check (consecutive_success_count >= 0),
  consecutive_lapse_count integer not null
    constraint user_personal_concept_state_lapse_streak_check
    check (consecutive_lapse_count >= 0),
  last_result text not null
    constraint user_personal_concept_state_last_result_check
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
  last_reviewed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, personal_concept_id),
  constraint user_personal_concept_state_concept_owner_fkey
    foreign key (personal_concept_id, user_id)
    references public.personal_concepts(id, owner_id)
    on delete restrict,
  constraint user_personal_concept_state_evidence_totals_check
    check (
      evidence_count = positive_evidence_count + negative_evidence_count
    ),
  constraint user_personal_concept_state_single_streak_check
    check (
      consecutive_success_count = 0
      or consecutive_lapse_count = 0
    )
);

create index user_personal_concept_state_user_reviewed_idx
  on public.user_personal_concept_state(user_id, last_reviewed_at desc);

create or replace function public.set_user_personal_concept_state_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_user_personal_concept_state_updated_at
  before update on public.user_personal_concept_state
  for each row
  execute function public.set_user_personal_concept_state_updated_at();

alter table public.personal_review_attempts enable row level security;
alter table public.user_personal_concept_state enable row level security;

create policy "Users read own personal review attempts"
  on public.personal_review_attempts
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.has_socrates_role()
  );

create policy "Users read own personal Concept state"
  on public.user_personal_concept_state
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.has_socrates_role()
  );

revoke all on table public.personal_review_attempts
  from public, anon, authenticated;
revoke all on table public.user_personal_concept_state
  from public, anon, authenticated;
grant select on table public.personal_review_attempts to authenticated;
grant select on table public.user_personal_concept_state to authenticated;

create or replace function public.record_personal_study_attempt(
  p_study_session_id uuid,
  p_study_deck_id uuid,
  p_personal_card_id uuid,
  p_personal_concept_id uuid,
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
  card_concept_id uuid;
  next_position integer;
  new_attempt_id uuid;
  attempt_created_at timestamptz;
  is_positive boolean;
  resulting_evidence_count integer;
  resulting_positive_count integer;
  resulting_negative_count integer;
  resulting_success_streak integer;
  resulting_lapse_streak integer;
  resulting_last_result text;
  resulting_last_reviewed_at timestamptz;
begin
  if current_user_id is null or not public.has_socrates_role() then
    raise exception 'Not authorized to record a personal study response.';
  end if;

  if p_result is null or p_result not in (
    'easy',
    'average',
    'hard',
    'didnt_know',
    'forgot',
    'too_hard'
  ) then
    raise exception 'Invalid personal Study response.';
  end if;

  select session_row.*
  into target_session
  from public.study_sessions session_row
  where session_row.id = p_study_session_id
    and session_row.study_deck_id = p_study_deck_id
    and session_row.user_id = current_user_id
    and session_row.ended_at is null
  for update;

  if target_session.id is null then
    raise exception 'Active owned Study Session and deck not found.';
  end if;

  select card.concept_id
  into card_concept_id
  from public.personal_cards card
  where card.id = p_personal_card_id
    and card.owner_id = current_user_id;

  if card_concept_id is null then
    raise exception 'Owned personal Card not found.';
  end if;

  if card_concept_id <> p_personal_concept_id then
    raise exception 'Personal Card does not belong to the supplied Concept.';
  end if;

  if not exists (
    select 1
    from public.resolve_study_candidates(target_session.study_deck_id) candidate
    where candidate.candidate_type = 'personal'
      and candidate.personal_card_id = p_personal_card_id
      and candidate.personal_concept_id = p_personal_concept_id
  ) then
    raise exception 'Personal Card is not eligible for this Study deck.';
  end if;

  next_position := target_session.answered_count + 1;
  is_positive := p_result in ('easy', 'average', 'hard');

  insert into public.personal_review_attempts (
    user_id,
    study_session_id,
    study_deck_id,
    personal_card_id,
    personal_concept_id,
    result,
    sequence_position
  )
  values (
    current_user_id,
    target_session.id,
    target_session.study_deck_id,
    p_personal_card_id,
    p_personal_concept_id,
    p_result,
    next_position
  )
  returning id, created_at
  into new_attempt_id, attempt_created_at;

  insert into public.user_personal_concept_state as personal_state (
    user_id,
    personal_concept_id,
    evidence_count,
    positive_evidence_count,
    negative_evidence_count,
    consecutive_success_count,
    consecutive_lapse_count,
    last_result,
    last_reviewed_at
  )
  values (
    current_user_id,
    p_personal_concept_id,
    1,
    case when is_positive then 1 else 0 end,
    case when is_positive then 0 else 1 end,
    case when is_positive then 1 else 0 end,
    case when is_positive then 0 else 1 end,
    p_result,
    attempt_created_at
  )
  on conflict (user_id, personal_concept_id) do update
  set evidence_count = personal_state.evidence_count + 1,
      positive_evidence_count = personal_state.positive_evidence_count
        + case when is_positive then 1 else 0 end,
      negative_evidence_count = personal_state.negative_evidence_count
        + case when is_positive then 0 else 1 end,
      consecutive_success_count = case
        when is_positive then personal_state.consecutive_success_count + 1
        else 0
      end,
      consecutive_lapse_count = case
        when is_positive then 0
        else personal_state.consecutive_lapse_count + 1
      end,
      last_result = p_result,
      last_reviewed_at = attempt_created_at
  returning
    evidence_count,
    positive_evidence_count,
    negative_evidence_count,
    consecutive_success_count,
    consecutive_lapse_count,
    last_result,
    last_reviewed_at
  into
    resulting_evidence_count,
    resulting_positive_count,
    resulting_negative_count,
    resulting_success_streak,
    resulting_lapse_streak,
    resulting_last_result,
    resulting_last_reviewed_at;

  update public.study_sessions
  set answered_count = next_position
  where id = target_session.id;

  return jsonb_build_object(
    'attemptId', new_attempt_id,
    'sequencePosition', next_position,
    'studySessionId', target_session.id,
    'studyDeckId', target_session.study_deck_id,
    'personalCardId', p_personal_card_id,
    'personalConceptId', p_personal_concept_id,
    'result', p_result,
    'state', jsonb_build_object(
      'evidenceCount', resulting_evidence_count,
      'positiveEvidenceCount', resulting_positive_count,
      'negativeEvidenceCount', resulting_negative_count,
      'consecutiveSuccessCount', resulting_success_streak,
      'consecutiveLapseCount', resulting_lapse_streak,
      'lastResult', resulting_last_result,
      'lastReviewedAt', resulting_last_reviewed_at
    )
  );
end;
$$;

comment on table public.personal_review_attempts is
  'Immutable owner-scoped Study responses for personal Study Creator Cards. These rows never enter official review_attempts.';
comment on table public.user_personal_concept_state is
  'Replaceable owner-scoped counts and response streaks derived from personal_review_attempts. No official mastery or Testing Angle semantics are applied.';
comment on function public.record_personal_study_attempt(
  uuid,
  uuid,
  uuid,
  uuid,
  text
) is
  'Atomically records one eligible owned personal Card response, advances the shared Study Session count, and updates only personal Concept state.';

revoke all on function public.set_user_personal_concept_state_updated_at()
  from public, anon, authenticated;
revoke all on function public.record_personal_study_attempt(
  uuid,
  uuid,
  uuid,
  uuid,
  text
) from public, anon, authenticated;
grant execute on function public.record_personal_study_attempt(
  uuid,
  uuid,
  uuid,
  uuid,
  text
) to authenticated;

notify pgrst, 'reload schema';

commit;
