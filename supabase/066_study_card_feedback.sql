-- Persist Study Mode card feedback independently from learner review attempts.
-- This migration does not change study response, learner-state, or priority logic.

begin;

create table public.study_card_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete restrict,
  concept_id uuid not null references public.concepts(id) on delete restrict,
  study_session_id uuid,
  feedback_type text not null
    constraint study_card_feedback_type_check
    check (feedback_type in ('error', 'suggestion')),
  message text not null
    constraint study_card_feedback_message_not_blank
    check (btrim(message) <> ''),
  status text not null default 'open'
    constraint study_card_feedback_status_check
    check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  constraint study_card_feedback_message_length_check
    check (char_length(message) <= 4000),
  constraint study_card_feedback_session_user_fkey
    foreign key (study_session_id, user_id)
    references public.study_sessions(id, user_id)
    on delete restrict
);

create index study_card_feedback_user_created_at_idx
  on public.study_card_feedback(user_id, created_at desc);
create index study_card_feedback_question_created_at_idx
  on public.study_card_feedback(question_id, created_at desc);
create index study_card_feedback_open_created_at_idx
  on public.study_card_feedback(created_at)
  where status = 'open';

alter table public.study_card_feedback enable row level security;

create policy "Users read own study card feedback"
  on public.study_card_feedback
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.has_socrates_role()
  );

create policy "Editors and admins read study card feedback"
  on public.study_card_feedback
  for select
  to authenticated
  using (public.is_editor_or_admin());

revoke all on table public.study_card_feedback from public, anon, authenticated;
grant select on table public.study_card_feedback to authenticated;

create or replace function public.submit_study_card_feedback(
  p_question_id uuid,
  p_concept_id uuid,
  p_study_session_id uuid,
  p_feedback_type text,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_message text := btrim(coalesce(p_message, ''));
  new_feedback_id uuid;
begin
  if current_user_id is null or not public.has_socrates_role() then
    raise exception 'Not authorized to submit study feedback.';
  end if;

  if p_feedback_type is null or p_feedback_type not in ('error', 'suggestion') then
    raise exception 'Feedback type must be error or suggestion.';
  end if;

  if normalized_message = '' then
    raise exception 'Feedback message is required.';
  end if;

  if char_length(normalized_message) > 4000 then
    raise exception 'Feedback message must be 4000 characters or fewer.';
  end if;

  if not exists (
    select 1
    from public.questions question
    where question.id = p_question_id
      and question.concept_id = p_concept_id
      and question.status = 'published'
  ) then
    raise exception 'Published study question not found.';
  end if;

  if p_study_session_id is not null and not exists (
    select 1
    from public.study_sessions session
    where session.id = p_study_session_id
      and session.user_id = current_user_id
  ) then
    raise exception 'Study session not found.';
  end if;

  insert into public.study_card_feedback (
    user_id,
    question_id,
    concept_id,
    study_session_id,
    feedback_type,
    message
  )
  values (
    current_user_id,
    p_question_id,
    p_concept_id,
    p_study_session_id,
    p_feedback_type,
    normalized_message
  )
  returning id into new_feedback_id;

  return new_feedback_id;
end;
$$;

revoke all on function public.submit_study_card_feedback(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_study_card_feedback(uuid, uuid, uuid, text, text)
  to authenticated;

notify pgrst, 'reload schema';

commit;
