-- Allow published short-answer questions to rely on accepted answers without
-- requiring the explanation field used by the other question types.

create or replace function public.assert_question_publishable(p_question_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  target_question public.questions%rowtype;
begin
  select *
  into target_question
  from public.questions q
  where q.id = p_question_id;

  if target_question.id is null or target_question.status <> 'published' then
    return;
  end if;

  if target_question.question_type <> 'short_answer'
    and btrim(coalesce(target_question.explanation, '')) = ''
  then
    raise exception 'Published questions require an explanation';
  end if;

  if target_question.question_type = 'multiple_choice' then
    if (
      select count(*)
      from public.question_options qo
      where qo.question_id = target_question.id
    ) < 2 then
      raise exception 'Published multiple-choice questions require at least two options';
    end if;

    if not exists (
      select 1
      from public.question_options qo
      where qo.question_id = target_question.id
        and qo.is_correct
    ) then
      raise exception 'Published multiple-choice questions require a correct option';
    end if;
  elsif target_question.question_type = 'true_false' then
    if (
      select count(*)
      from public.question_options qo
      where qo.question_id = target_question.id
    ) <> 2 then
      raise exception 'Published true/false questions require exactly two options';
    end if;

    if (
      select count(*)
      from public.question_options qo
      where qo.question_id = target_question.id
        and qo.is_correct
    ) <> 1 then
      raise exception 'Published true/false questions require exactly one correct option';
    end if;
  elsif target_question.question_type = 'short_answer' then
    if not exists (
      select 1
      from public.question_accepted_answers qaa
      where qaa.question_id = target_question.id
    ) then
      raise exception 'Published short-answer questions require at least one accepted answer';
    end if;
  end if;
end;
$$;
