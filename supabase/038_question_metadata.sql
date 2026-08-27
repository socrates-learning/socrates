-- Question metadata foundation.
-- Adds authored difficulty and testing-angle fields without changing delivery.

alter table public.questions
  add column if not exists difficulty text not null default 'medium';

update public.questions
set difficulty = 'medium'
where difficulty is null
  or difficulty not in ('easy', 'medium', 'hard');

alter table public.questions
  alter column difficulty set default 'medium',
  alter column difficulty set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'questions'
      and c.conname = 'questions_difficulty_check'
  ) then
    alter table public.questions
      add constraint questions_difficulty_check
      check (difficulty in ('easy', 'medium', 'hard'));
  end if;
end;
$$;

alter table public.questions
  add column if not exists testing_angle text not null default 'General Understanding';

update public.questions
set testing_angle = 'General Understanding'
where btrim(coalesce(testing_angle, '')) = '';

alter table public.questions
  alter column testing_angle set default 'General Understanding',
  alter column testing_angle set not null;

drop function if exists public.create_question(
  uuid,
  text,
  text,
  text,
  uuid,
  integer
);

create or replace function public.create_question(
  p_concept_id uuid,
  p_question_type text,
  p_prompt text,
  p_explanation text default null,
  p_review_article_concept_id uuid default null,
  p_sort_order integer default 0,
  p_difficulty text default 'medium',
  p_testing_angle text default 'General Understanding'
)
returns public.questions
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  new_question public.questions%rowtype;
begin
  if caller_id is null then
    raise exception 'Authenticated user is required';
  end if;

  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may create questions';
  end if;

  if p_question_type not in ('multiple_choice', 'true_false', 'short_answer') then
    raise exception 'Unsupported question type';
  end if;

  if p_difficulty not in ('easy', 'medium', 'hard') then
    raise exception 'Unsupported question difficulty';
  end if;

  if btrim(coalesce(p_prompt, '')) = '' then
    raise exception 'Question prompt is required';
  end if;

  if not exists (select 1 from public.concepts c where c.id = p_concept_id) then
    raise exception 'Concept was not found';
  end if;

  if p_review_article_concept_id is not null
    and not exists (
      select 1
      from public.article_concepts ac
      where ac.id = p_review_article_concept_id
        and ac.concept_id = p_concept_id
    )
  then
    raise exception 'Review article concept must reference the same concept';
  end if;

  insert into public.questions (
    concept_id,
    question_type,
    prompt,
    explanation,
    status,
    review_article_concept_id,
    sort_order,
    difficulty,
    testing_angle,
    created_by
  )
  values (
    p_concept_id,
    p_question_type,
    btrim(p_prompt),
    nullif(btrim(coalesce(p_explanation, '')), ''),
    'draft',
    p_review_article_concept_id,
    coalesce(p_sort_order, 0),
    p_difficulty,
    coalesce(nullif(btrim(p_testing_angle), ''), 'General Understanding'),
    caller_id
  )
  returning * into new_question;

  return new_question;
end;
$$;

drop function if exists public.update_question(
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  integer
);

create or replace function public.update_question(
  p_question_id uuid,
  p_question_type text,
  p_prompt text,
  p_explanation text,
  p_status text,
  p_review_article_concept_id uuid default null,
  p_sort_order integer default 0,
  p_difficulty text default 'medium',
  p_testing_angle text default 'General Understanding'
)
returns public.questions
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_question public.questions%rowtype;
begin
  if caller_id is null then
    raise exception 'Authenticated user is required';
  end if;

  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may update questions';
  end if;

  if p_question_type not in ('multiple_choice', 'true_false', 'short_answer') then
    raise exception 'Unsupported question type';
  end if;

  if p_status not in ('draft', 'published', 'archived') then
    raise exception 'Unsupported question status';
  end if;

  if p_difficulty not in ('easy', 'medium', 'hard') then
    raise exception 'Unsupported question difficulty';
  end if;

  if btrim(coalesce(p_prompt, '')) = '' then
    raise exception 'Question prompt is required';
  end if;

  select *
  into target_question
  from public.questions q
  where q.id = p_question_id
  for update;

  if target_question.id is null then
    raise exception 'Question was not found';
  end if;

  if p_review_article_concept_id is not null
    and not exists (
      select 1
      from public.article_concepts ac
      where ac.id = p_review_article_concept_id
        and ac.concept_id = target_question.concept_id
    )
  then
    raise exception 'Review article concept must reference the same concept';
  end if;

  update public.questions
  set question_type = p_question_type,
      prompt = btrim(p_prompt),
      explanation = nullif(btrim(coalesce(p_explanation, '')), ''),
      status = p_status,
      review_article_concept_id = p_review_article_concept_id,
      sort_order = coalesce(p_sort_order, 0),
      difficulty = p_difficulty,
      testing_angle = coalesce(
        nullif(btrim(p_testing_angle), ''),
        'General Understanding'
      )
  where id = p_question_id
  returning * into target_question;

  return target_question;
end;
$$;

revoke all on function public.create_question(
  uuid,
  text,
  text,
  text,
  uuid,
  integer,
  text,
  text
) from public;
grant execute on function public.create_question(
  uuid,
  text,
  text,
  text,
  uuid,
  integer,
  text,
  text
) to authenticated;

revoke all on function public.update_question(
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  integer,
  text,
  text
) from public;
grant execute on function public.update_question(
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  integer,
  text,
  text
) to authenticated;
