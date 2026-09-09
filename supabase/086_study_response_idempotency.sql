-- Stable response identities; legacy signatures remain compatible with older clients.
begin;

create table public.study_response_submissions (
  user_id uuid not null references auth.users(id) on delete cascade,
  submission_id uuid not null,
  request jsonb not null,
  response jsonb,
  primary key (user_id, submission_id)
);
alter table public.study_response_submissions enable row level security;
revoke all on table public.study_response_submissions from public, anon, authenticated;

alter table public.review_attempts add column submission_id uuid;
create unique index review_attempts_user_submission_key
  on public.review_attempts(user_id, submission_id) where submission_id is not null;
alter table public.personal_review_attempts add column submission_id uuid;
create unique index personal_review_attempts_user_submission_key
  on public.personal_review_attempts(user_id, submission_id) where submission_id is not null;

create function public.record_study_session_attempt(
  p_study_session_id uuid,
  p_question_id uuid,
  p_concept_id uuid,
  p_result text,
  p_submission_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  request_payload jsonb := jsonb_build_object('kind', 'official', 'p_study_session_id', p_study_session_id, 'p_question_id', p_question_id, 'p_concept_id', p_concept_id, 'p_result', p_result);
  saved public.study_response_submissions%rowtype;
  result_payload jsonb;
begin
  if current_user_id is null or not public.has_socrates_role() then
    raise exception 'Not authorized to record a Study response.';
  end if;
  if p_submission_id is null then
    raise exception 'A submission identifier is required.';
  end if;

  -- The unique key waits for any concurrent first writer. Its reservation,
  -- attempt, evidence, session count, and saved result commit or roll back together.
  insert into public.study_response_submissions(user_id, submission_id, request)
  values (current_user_id, p_submission_id, request_payload)
  on conflict (user_id, submission_id) do nothing;

  select * into strict saved from public.study_response_submissions
  where user_id = current_user_id and submission_id = p_submission_id
  for update;
  if saved.request is distinct from request_payload then
    raise exception 'Submission identifier was already used for a different response.';
  end if;
  if saved.response is not null then
    return saved.response;
  end if;

  -- Delegate unchanged eligibility, sequencing, and evidence formulas.
  result_payload := public.record_study_session_attempt(p_study_session_id, p_question_id, p_concept_id, p_result);
  update public.review_attempts set submission_id = p_submission_id
  where id = (result_payload->>'attempt_id')::uuid and user_id = current_user_id;
  update public.study_response_submissions set response = result_payload
  where user_id = current_user_id and submission_id = p_submission_id;
  return result_payload;
end;
$$;
revoke all on function public.record_study_session_attempt(uuid, uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.record_study_session_attempt(uuid, uuid, uuid, text, uuid) to authenticated;

create function public.record_personal_study_attempt(
  p_study_session_id uuid,
  p_study_deck_id uuid,
  p_personal_card_id uuid,
  p_personal_concept_id uuid,
  p_result text,
  p_submission_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  request_payload jsonb := jsonb_build_object('kind', 'personal', 'p_study_session_id', p_study_session_id, 'p_study_deck_id', p_study_deck_id, 'p_personal_card_id', p_personal_card_id, 'p_personal_concept_id', p_personal_concept_id, 'p_result', p_result);
  saved public.study_response_submissions%rowtype;
  result_payload jsonb;
begin
  if current_user_id is null or not public.has_socrates_role() then
    raise exception 'Not authorized to record a Study response.';
  end if;
  if p_submission_id is null then
    raise exception 'A submission identifier is required.';
  end if;

  -- The unique key waits for any concurrent first writer. Its reservation,
  -- attempt, evidence, session count, and saved result commit or roll back together.
  insert into public.study_response_submissions(user_id, submission_id, request)
  values (current_user_id, p_submission_id, request_payload)
  on conflict (user_id, submission_id) do nothing;

  select * into strict saved from public.study_response_submissions
  where user_id = current_user_id and submission_id = p_submission_id
  for update;
  if saved.request is distinct from request_payload then
    raise exception 'Submission identifier was already used for a different response.';
  end if;
  if saved.response is not null then
    return saved.response;
  end if;

  -- Delegate unchanged eligibility, sequencing, and evidence formulas.
  result_payload := public.record_personal_study_attempt(p_study_session_id, p_study_deck_id, p_personal_card_id, p_personal_concept_id, p_result);
  update public.personal_review_attempts set submission_id = p_submission_id
  where id = (result_payload->>'attemptId')::uuid and user_id = current_user_id;
  update public.study_response_submissions set response = result_payload
  where user_id = current_user_id and submission_id = p_submission_id;
  return result_payload;
end;
$$;
revoke all on function public.record_personal_study_attempt(uuid, uuid, uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.record_personal_study_attempt(uuid, uuid, uuid, uuid, text, uuid) to authenticated;

commit;
