-- Persisted Study Mode session identity and attempt sequencing foundation.
-- This migration does not add scheduling, mastery, or priority behavior.

begin;

create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  library_id uuid not null references public.libraries(id) on delete restrict,
  study_deck_id uuid,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  new_mastery_balance smallint not null default 50
    constraint study_sessions_new_mastery_balance_check
    check (new_mastery_balance between 0 and 100),
  answered_count integer not null default 0
    constraint study_sessions_answered_count_check
    check (answered_count >= 0),
  selection_snapshot jsonb not null default jsonb_build_object(
    'selected_node_ids', '[]'::jsonb,
    'concept_overrides', '{}'::jsonb
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_sessions_ended_after_start_check
    check (ended_at is null or ended_at >= started_at),
  constraint study_sessions_id_user_key unique (id, user_id)
);

create unique index study_decks_id_user_library_key
  on public.study_decks(id, user_id, library_id);

alter table public.study_sessions
  add constraint study_sessions_deck_owner_library_fkey
  foreign key (study_deck_id, user_id, library_id)
  references public.study_decks(id, user_id, library_id)
  on delete restrict;

create index study_sessions_user_started_at_idx
  on public.study_sessions(user_id, started_at desc);
create index study_sessions_deck_started_at_idx
  on public.study_sessions(study_deck_id, started_at desc)
  where study_deck_id is not null;

create or replace function public.set_study_sessions_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_study_sessions_updated_at
  before update on public.study_sessions
  for each row execute function public.set_study_sessions_updated_at();

alter table public.study_sessions enable row level security;

create policy "Users read own study sessions"
  on public.study_sessions
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.has_socrates_role()
  );

revoke all on table public.study_sessions from public, anon, authenticated;
grant select on table public.study_sessions to authenticated;

alter table public.review_attempts
  add column study_session_id uuid,
  add column sequence_position integer,
  add constraint review_attempts_session_sequence_pair_check
    check (
      (study_session_id is null and sequence_position is null)
      or
      (study_session_id is not null and sequence_position is not null and sequence_position > 0)
    ),
  add constraint review_attempts_session_user_fkey
    foreign key (study_session_id, user_id)
    references public.study_sessions(id, user_id)
    on delete restrict;

create unique index review_attempts_session_sequence_key
  on public.review_attempts(study_session_id, sequence_position)
  where study_session_id is not null;
create index review_attempts_study_session_id_idx
  on public.review_attempts(study_session_id)
  where study_session_id is not null;

drop policy if exists "Users create own attempts" on public.review_attempts;
create policy "Users create own attempts"
  on public.review_attempts
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and study_session_id is null
    and sequence_position is null
  );

create or replace function public.start_study_session(
  p_study_deck_id uuid,
  p_new_mastery_balance integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_deck public.study_decks%rowtype;
  snapshot jsonb;
  new_session_id uuid;
begin
  if current_user_id is null or not public.has_socrates_role() then
    raise exception 'Not authorized to start a study session.';
  end if;

  if p_new_mastery_balance is null or p_new_mastery_balance not between 0 and 100 then
    raise exception 'Study balance must be between 0 and 100.';
  end if;

  select sd.*
  into target_deck
  from public.study_decks sd
  where sd.id = p_study_deck_id
    and sd.user_id = current_user_id
    and sd.is_active;

  if target_deck.id is null then
    raise exception 'Active study deck not found.';
  end if;

  if not exists (
    select 1
    from public.resolve_study_deck(target_deck.id) resolved
    join public.questions q on q.concept_id = resolved.concept_id
    where q.status = 'published'
      and q.question_type = 'short_answer'
      and exists (
        select 1
        from public.question_accepted_answers qaa
        where qaa.question_id = q.id
      )
  ) then
    raise exception 'No eligible authored questions are available for this deck.';
  end if;

  select jsonb_build_object(
    'selected_node_ids',
    coalesce(
      (
        select jsonb_agg(usns.node_id order by usns.node_id::text)
        from public.user_study_node_selections usns
        where usns.deck_id = target_deck.id
          and usns.user_id = current_user_id
          and usns.library_id = target_deck.library_id
      ),
      '[]'::jsonb
    ),
    'concept_overrides',
    coalesce(
      (
        select jsonb_object_agg(
          usco.concept_id::text,
          usco.selection_state
          order by usco.concept_id::text
        )
        from public.user_study_concept_overrides usco
        where usco.deck_id = target_deck.id
          and usco.user_id = current_user_id
          and usco.library_id = target_deck.library_id
      ),
      '{}'::jsonb
    )
  )
  into snapshot;

  insert into public.study_sessions (
    user_id,
    library_id,
    study_deck_id,
    new_mastery_balance,
    selection_snapshot
  )
  values (
    current_user_id,
    target_deck.library_id,
    target_deck.id,
    p_new_mastery_balance::smallint,
    snapshot
  )
  returning id into new_session_id;

  return new_session_id;
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
  next_position integer;
  new_attempt_id uuid;
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

  if not exists (
    select 1
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
      )
  ) then
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
    sequence_position
  )
  values (
    current_user_id,
    p_question_id,
    p_concept_id,
    p_result,
    null,
    target_session.id,
    next_position
  )
  returning id into new_attempt_id;

  update public.study_sessions
  set answered_count = next_position
  where id = target_session.id;

  return jsonb_build_object(
    'attempt_id', new_attempt_id,
    'sequence_position', next_position
  );
end;
$$;

create or replace function public.end_study_session(
  p_study_session_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null or not public.has_socrates_role() then
    raise exception 'Not authorized to end a study session.';
  end if;

  update public.study_sessions
  set ended_at = coalesce(ended_at, now())
  where id = p_study_session_id
    and user_id = current_user_id;

  return found;
end;
$$;

revoke all on function public.set_study_sessions_updated_at() from public, anon, authenticated;
revoke all on function public.start_study_session(uuid, integer) from public, anon, authenticated;
revoke all on function public.record_study_session_attempt(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.end_study_session(uuid) from public, anon, authenticated;

grant execute on function public.start_study_session(uuid, integer) to authenticated;
grant execute on function public.record_study_session_attempt(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.end_study_session(uuid) to authenticated;

commit;
