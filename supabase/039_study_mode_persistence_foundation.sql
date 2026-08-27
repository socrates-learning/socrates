-- Study Mode response persistence and published answer access foundation.

alter table public.review_attempts
  drop constraint if exists review_attempts_result_check;

alter table public.review_attempts
  add constraint review_attempts_result_check
  check (
    result in (
      'knew',
      'guessed',
      'missed',
      'need_explanation',
      'easy',
      'average',
      'hard',
      'didnt_know',
      'forgot',
      'too_hard'
    )
  );

drop policy if exists "Published question accepted answers are readable"
  on public.question_accepted_answers;
create policy "Published question accepted answers are readable"
  on public.question_accepted_answers
  for select
  to authenticated
  using (
    public.has_socrates_role()
    and exists (
      select 1
      from public.questions q
      join public.concepts c on c.id = q.concept_id
      where q.id = question_accepted_answers.question_id
        and q.status = 'published'
        and c.status = 'published'
    )
  );
