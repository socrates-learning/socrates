-- Task B3A: Question Bank backend/data foundation.
-- Creates normalized reusable questions attached to concepts without changing
-- learner delivery, mastery scoring, or existing learning_objects behavior.

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null references public.concepts(id) on delete cascade,
  question_type text not null default 'multiple_choice'
    constraint questions_question_type_check
    check (question_type in ('multiple_choice', 'true_false', 'short_answer')),
  prompt text not null,
  explanation text,
  status text not null default 'draft'
    constraint questions_status_check
    check (status in ('draft', 'published', 'archived')),
  review_article_concept_id uuid references public.article_concepts(id) on delete set null,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint questions_prompt_not_blank check (btrim(prompt) <> '')
);

create table if not exists public.question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  option_text text not null,
  is_correct boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint question_options_text_not_blank check (btrim(option_text) <> ''),
  constraint question_options_question_sort_key unique (question_id, sort_order)
);

create table if not exists public.question_accepted_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  answer_text text not null,
  normalized_answer text generated always as (
    lower(regexp_replace(btrim(answer_text), '\s+', ' ', 'g'))
  ) stored,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint question_accepted_answers_text_not_blank check (btrim(answer_text) <> ''),
  constraint question_accepted_answers_question_answer_key
    unique (question_id, normalized_answer),
  constraint question_accepted_answers_question_sort_key unique (question_id, sort_order)
);

create table if not exists public.question_sources (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete restrict,
  note text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint question_sources_question_source_key unique (question_id, source_id)
);

create index if not exists questions_concept_id_idx
  on public.questions(concept_id);
create index if not exists questions_status_idx
  on public.questions(status);
create index if not exists questions_created_by_idx
  on public.questions(created_by);
create index if not exists questions_review_article_concept_id_idx
  on public.questions(review_article_concept_id)
  where review_article_concept_id is not null;
create index if not exists questions_concept_sort_idx
  on public.questions(concept_id, sort_order, created_at);

create index if not exists question_options_question_id_idx
  on public.question_options(question_id);
create index if not exists question_options_correct_idx
  on public.question_options(question_id)
  where is_correct;

create index if not exists question_accepted_answers_question_id_idx
  on public.question_accepted_answers(question_id);

create index if not exists question_sources_question_id_idx
  on public.question_sources(question_id);
create index if not exists question_sources_source_id_idx
  on public.question_sources(source_id);

create or replace function public.set_question_bank_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_questions_updated_at on public.questions;
create trigger set_questions_updated_at
  before update on public.questions
  for each row execute function public.set_question_bank_updated_at();

drop trigger if exists set_question_options_updated_at on public.question_options;
create trigger set_question_options_updated_at
  before update on public.question_options
  for each row execute function public.set_question_bank_updated_at();

drop trigger if exists set_question_accepted_answers_updated_at
  on public.question_accepted_answers;
create trigger set_question_accepted_answers_updated_at
  before update on public.question_accepted_answers
  for each row execute function public.set_question_bank_updated_at();

drop trigger if exists set_question_sources_updated_at on public.question_sources;
create trigger set_question_sources_updated_at
  before update on public.question_sources
  for each row execute function public.set_question_bank_updated_at();

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

  if btrim(coalesce(target_question.explanation, '')) = '' then
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

create or replace function public.validate_question_publish()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' then
    perform public.assert_question_publishable(new.id);
  end if;

  return new;
end;
$$;

create or replace function public.validate_question_child_publish()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_question_id uuid;
begin
  if tg_op = 'DELETE' then
    target_question_id := old.question_id;
  else
    target_question_id := new.question_id;
  end if;

  perform public.assert_question_publishable(target_question_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists validate_question_publish on public.questions;
create constraint trigger validate_question_publish
  after insert or update of status, question_type, explanation on public.questions
  deferrable initially deferred
  for each row execute function public.validate_question_publish();

drop trigger if exists validate_question_options_publish
  on public.question_options;
create constraint trigger validate_question_options_publish
  after insert or update or delete on public.question_options
  deferrable initially deferred
  for each row execute function public.validate_question_child_publish();

drop trigger if exists validate_question_accepted_answers_publish
  on public.question_accepted_answers;
create constraint trigger validate_question_accepted_answers_publish
  after insert or update or delete on public.question_accepted_answers
  deferrable initially deferred
  for each row execute function public.validate_question_child_publish();

alter table public.questions enable row level security;
alter table public.question_options enable row level security;
alter table public.question_accepted_answers enable row level security;
alter table public.question_sources enable row level security;

drop policy if exists "Published questions are readable" on public.questions;
create policy "Published questions are readable"
  on public.questions
  for select
  to authenticated
  using (
    public.has_socrates_role()
    and status = 'published'
    and exists (
      select 1
      from public.concepts c
      where c.id = concept_id
        and c.status = 'published'
    )
  );

drop policy if exists "Editors read all questions" on public.questions;
create policy "Editors read all questions"
  on public.questions
  for select
  to authenticated
  using (public.is_editor_or_admin());

drop policy if exists "Editors manage questions" on public.questions;
create policy "Editors manage questions"
  on public.questions
  for all
  to authenticated
  using (public.is_editor_or_admin())
  with check (public.is_editor_or_admin());

drop policy if exists "Published question options are readable" on public.question_options;
create policy "Published question options are readable"
  on public.question_options
  for select
  to authenticated
  using (
    public.has_socrates_role()
    and exists (
      select 1
      from public.questions q
      join public.concepts c on c.id = q.concept_id
      where q.id = question_id
        and q.status = 'published'
        and c.status = 'published'
    )
  );

drop policy if exists "Editors read all question options" on public.question_options;
create policy "Editors read all question options"
  on public.question_options
  for select
  to authenticated
  using (public.is_editor_or_admin());

drop policy if exists "Editors manage question options" on public.question_options;
create policy "Editors manage question options"
  on public.question_options
  for all
  to authenticated
  using (public.is_editor_or_admin())
  with check (public.is_editor_or_admin());

drop policy if exists "Editors read short-answer keys" on public.question_accepted_answers;
create policy "Editors read short-answer keys"
  on public.question_accepted_answers
  for select
  to authenticated
  using (public.is_editor_or_admin());

drop policy if exists "Editors manage short-answer keys" on public.question_accepted_answers;
create policy "Editors manage short-answer keys"
  on public.question_accepted_answers
  for all
  to authenticated
  using (public.is_editor_or_admin())
  with check (public.is_editor_or_admin());

drop policy if exists "Published question sources are readable" on public.question_sources;
create policy "Published question sources are readable"
  on public.question_sources
  for select
  to authenticated
  using (
    public.has_socrates_role()
    and exists (
      select 1
      from public.questions q
      join public.concepts c on c.id = q.concept_id
      where q.id = question_id
        and q.status = 'published'
        and c.status = 'published'
    )
  );

drop policy if exists "Editors read all question sources" on public.question_sources;
create policy "Editors read all question sources"
  on public.question_sources
  for select
  to authenticated
  using (public.is_editor_or_admin());

drop policy if exists "Editors manage question sources" on public.question_sources;
create policy "Editors manage question sources"
  on public.question_sources
  for all
  to authenticated
  using (public.is_editor_or_admin())
  with check (public.is_editor_or_admin());

drop policy if exists "Published question source records are readable"
  on public.sources;
create policy "Published question source records are readable"
  on public.sources
  for select
  to authenticated
  using (
    public.has_socrates_role()
    and exists (
      select 1
      from public.question_sources qs
      join public.questions q on q.id = qs.question_id
      join public.concepts c on c.id = q.concept_id
      where qs.source_id = sources.id
        and q.status = 'published'
        and c.status = 'published'
    )
  );

create or replace function public.create_question(
  p_concept_id uuid,
  p_question_type text,
  p_prompt text,
  p_explanation text default null,
  p_review_article_concept_id uuid default null,
  p_sort_order integer default 0
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
    review_article_concept_id,
    sort_order,
    status,
    created_by
  )
  values (
    p_concept_id,
    p_question_type,
    btrim(p_prompt),
    nullif(btrim(coalesce(p_explanation, '')), ''),
    p_review_article_concept_id,
    coalesce(p_sort_order, 0),
    'draft',
    caller_id
  )
  returning * into new_question;

  return new_question;
end;
$$;

create or replace function public.update_question(
  p_question_id uuid,
  p_question_type text,
  p_prompt text,
  p_explanation text,
  p_status text,
  p_review_article_concept_id uuid default null,
  p_sort_order integer default 0
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
      sort_order = coalesce(p_sort_order, 0)
  where id = p_question_id
  returning * into target_question;

  return target_question;
end;
$$;

create or replace function public.archive_question(
  p_question_id uuid
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
    raise exception 'Only editors and admins may archive questions';
  end if;

  update public.questions
  set status = 'archived'
  where id = p_question_id
  returning * into target_question;

  if target_question.id is null then
    raise exception 'Question was not found';
  end if;

  return target_question;
end;
$$;

create or replace function public.delete_draft_question(
  p_question_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise exception 'Authenticated user is required';
  end if;

  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may delete draft questions';
  end if;

  delete from public.questions
  where id = p_question_id
    and status = 'draft';

  return found;
end;
$$;

create or replace function public.replace_question_options(
  p_question_id uuid,
  p_options jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  option_record jsonb;
begin
  if caller_id is null then
    raise exception 'Authenticated user is required';
  end if;

  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may manage question options';
  end if;

  if not exists (select 1 from public.questions q where q.id = p_question_id) then
    raise exception 'Question was not found';
  end if;

  if jsonb_typeof(coalesce(p_options, '[]'::jsonb)) <> 'array' then
    raise exception 'Question options must be an array';
  end if;

  delete from public.question_options
  where question_id = p_question_id;

  for option_record in
    select value from jsonb_array_elements(coalesce(p_options, '[]'::jsonb))
  loop
    if btrim(coalesce(option_record ->> 'option_text', '')) = '' then
      raise exception 'Option text is required';
    end if;

    insert into public.question_options (
      question_id,
      option_text,
      is_correct,
      sort_order
    )
    values (
      p_question_id,
      btrim(option_record ->> 'option_text'),
      coalesce((option_record ->> 'is_correct')::boolean, false),
      coalesce((option_record ->> 'sort_order')::integer, 0)
    );
  end loop;
end;
$$;

create or replace function public.replace_question_accepted_answers(
  p_question_id uuid,
  p_answers jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  answer_record jsonb;
begin
  if caller_id is null then
    raise exception 'Authenticated user is required';
  end if;

  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may manage short-answer keys';
  end if;

  if not exists (select 1 from public.questions q where q.id = p_question_id) then
    raise exception 'Question was not found';
  end if;

  if jsonb_typeof(coalesce(p_answers, '[]'::jsonb)) <> 'array' then
    raise exception 'Accepted answers must be an array';
  end if;

  delete from public.question_accepted_answers
  where question_id = p_question_id;

  for answer_record in
    select value from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
  loop
    if btrim(coalesce(answer_record ->> 'answer_text', '')) = '' then
      raise exception 'Accepted answer text is required';
    end if;

    insert into public.question_accepted_answers (
      question_id,
      answer_text,
      sort_order
    )
    values (
      p_question_id,
      btrim(answer_record ->> 'answer_text'),
      coalesce((answer_record ->> 'sort_order')::integer, 0)
    );
  end loop;
end;
$$;

create or replace function public.attach_question_source(
  p_question_id uuid,
  p_source_id uuid,
  p_note text default null
)
returns public.question_sources
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  linked_source public.question_sources%rowtype;
begin
  if caller_id is null then
    raise exception 'Authenticated user is required';
  end if;

  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may attach question sources';
  end if;

  if not exists (select 1 from public.questions q where q.id = p_question_id) then
    raise exception 'Question was not found';
  end if;

  if not exists (select 1 from public.sources s where s.id = p_source_id) then
    raise exception 'Source was not found';
  end if;

  insert into public.question_sources (
    question_id,
    source_id,
    note,
    created_by
  )
  values (
    p_question_id,
    p_source_id,
    nullif(btrim(coalesce(p_note, '')), ''),
    caller_id
  )
  on conflict (question_id, source_id)
  do update set
    note = excluded.note,
    updated_at = now()
  returning * into linked_source;

  return linked_source;
end;
$$;

create or replace function public.detach_question_source(
  p_question_source_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise exception 'Authenticated user is required';
  end if;

  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may detach question sources';
  end if;

  delete from public.question_sources
  where id = p_question_source_id;

  return found;
end;
$$;

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'review_attempts'
      and c.conname = 'review_attempts_question_id_fkey'
  ) then
    alter table public.review_attempts
      add column if not exists question_id uuid,
      add constraint review_attempts_question_id_fkey
      foreign key (question_id)
      references public.questions(id)
      on delete set null;
  end if;
end
$migration$;

do $migration$
begin
  if exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'review_attempts'
      and c.conname = 'review_attempts_has_target'
  ) then
    alter table public.review_attempts
      drop constraint review_attempts_has_target;
  end if;

  alter table public.review_attempts
    add constraint review_attempts_has_target
    check (
      concept_id is not null
      or learning_object_id is not null
      or question_id is not null
    )
    not valid;
end
$migration$;

create index if not exists review_attempts_question_id_idx
  on public.review_attempts(question_id)
  where question_id is not null;

revoke all on function public.set_question_bank_updated_at() from public;
revoke all on function public.assert_question_publishable(uuid) from public;
revoke all on function public.validate_question_publish() from public;
revoke all on function public.validate_question_child_publish() from public;

revoke all on function public.create_question(
  uuid,
  text,
  text,
  text,
  uuid,
  integer
) from public;
grant execute on function public.create_question(
  uuid,
  text,
  text,
  text,
  uuid,
  integer
) to authenticated;

revoke all on function public.update_question(
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  integer
) from public;
grant execute on function public.update_question(
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  integer
) to authenticated;

revoke all on function public.archive_question(uuid) from public;
grant execute on function public.archive_question(uuid) to authenticated;

revoke all on function public.delete_draft_question(uuid) from public;
grant execute on function public.delete_draft_question(uuid) to authenticated;

revoke all on function public.replace_question_options(uuid, jsonb) from public;
grant execute on function public.replace_question_options(uuid, jsonb) to authenticated;

revoke all on function public.replace_question_accepted_answers(uuid, jsonb)
  from public;
grant execute on function public.replace_question_accepted_answers(uuid, jsonb)
  to authenticated;

revoke all on function public.attach_question_source(uuid, uuid, text) from public;
grant execute on function public.attach_question_source(uuid, uuid, text)
  to authenticated;

revoke all on function public.detach_question_source(uuid) from public;
grant execute on function public.detach_question_source(uuid) to authenticated;
