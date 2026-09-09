-- Creator Studio Library-wide Question search.
-- Read-only authoring support: no Question, relationship, version, or learner
-- state is changed by this migration.

begin;

create index if not exists questions_created_at_id_idx
  on public.questions (created_at desc, id desc);

create or replace function public.search_creator_questions(
  p_active_library_id uuid,
  p_search_text text default null,
  p_difficulty text default null,
  p_primary_testing_angle text default null,
  p_additional_testing_angle text default null,
  p_primary_concept_id uuid default null,
  p_related_concept_id uuid default null,
  p_status text default null,
  p_tag_id uuid default null,
  p_page_size integer default 50,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_search text := nullif(lower(btrim(p_search_text)), '');
  normalized_primary_angle text := nullif(lower(btrim(p_primary_testing_angle)), '');
  normalized_additional_angle text := nullif(lower(btrim(p_additional_testing_angle)), '');
  bounded_page_size integer := least(greatest(coalesce(p_page_size, 50), 1), 100);
begin
  if (select auth.uid()) is null or not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may search official Questions';
  end if;

  if p_active_library_id is null
    or not exists (
      select 1
      from public.libraries library
      where library.id = p_active_library_id
    )
  then
    raise exception 'Active Library was not found';
  end if;

  if p_difficulty is not null
    and p_difficulty not in ('easy', 'medium', 'hard')
  then
    raise exception 'Unsupported Question difficulty filter';
  end if;

  if p_status is not null
    and p_status not in ('draft', 'published', 'archived')
  then
    raise exception 'Unsupported Question status filter';
  end if;

  if (p_before_created_at is null) <> (p_before_id is null) then
    raise exception 'Both Question search cursor values are required';
  end if;

  return query
  with matching_questions as (
    select
      question.*,
      primary_concept.name as primary_concept_name
    from public.questions question
    join public.concepts primary_concept
      on primary_concept.id = question.concept_id
    where exists (
      select 1
      from public.concept_placements placement
      join public.library_nodes node
        on node.id = placement.library_node_id
      where placement.concept_id = question.concept_id
        and node.library_id = p_active_library_id
    )
      and (
        normalized_search is null
        or position(normalized_search in lower(question.prompt)) > 0
        or position(normalized_search in lower(coalesce(question.explanation, ''))) > 0
        or exists (
          select 1
          from public.question_accepted_answers accepted_answer
          where accepted_answer.question_id = question.id
            and position(normalized_search in lower(accepted_answer.answer_text)) > 0
        )
      )
      and (p_difficulty is null or question.difficulty = p_difficulty)
      and (
        normalized_primary_angle is null
        or lower(btrim(question.testing_angle)) = normalized_primary_angle
      )
      and (
        normalized_additional_angle is null
        or exists (
          select 1
          from public.question_additional_testing_angles additional_angle
          where additional_angle.question_id = question.id
            and additional_angle.normalized_testing_angle = normalized_additional_angle
        )
      )
      and (
        p_primary_concept_id is null
        or question.concept_id = p_primary_concept_id
      )
      and (
        p_related_concept_id is null
        or exists (
          select 1
          from public.question_related_concepts related_concept
          where related_concept.question_id = question.id
            and related_concept.concept_id = p_related_concept_id
        )
      )
      and (p_status is null or question.status = p_status)
      and (
        p_tag_id is null
        or exists (
          select 1
          from public.question_tags question_tag
          where question_tag.question_id = question.id
            and question_tag.tag_id = p_tag_id
        )
      )
      and (
        p_before_created_at is null
        or (question.created_at, question.id) < (p_before_created_at, p_before_id)
      )
    order by question.created_at desc, question.id desc
    limit bounded_page_size + 1
  )
  select
    to_jsonb(matching_question)
    || jsonb_build_object(
      'additional_testing_angles', coalesce((
        select jsonb_agg(
          additional_angle.testing_angle
          order by additional_angle.normalized_testing_angle
        )
        from public.question_additional_testing_angles additional_angle
        where additional_angle.question_id = matching_question.id
      ), '[]'::jsonb),
      'related_concepts', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', related_concept.concept_id,
            'name', related.name
          )
          order by lower(related.name), related_concept.concept_id
        )
        from public.question_related_concepts related_concept
        join public.concepts related
          on related.id = related_concept.concept_id
        where related_concept.question_id = matching_question.id
      ), '[]'::jsonb),
      'question_accepted_answers', coalesce((
        select jsonb_agg(
          to_jsonb(accepted_answer)
          order by accepted_answer.sort_order, accepted_answer.id
        )
        from public.question_accepted_answers accepted_answer
        where accepted_answer.question_id = matching_question.id
      ), '[]'::jsonb),
      'question_tags', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'tag_id', tag.id,
            'tags', to_jsonb(tag)
          )
          order by lower(tag.name), tag.id
        )
        from public.question_tags question_tag
        join public.tags tag
          on tag.id = question_tag.tag_id
        where question_tag.question_id = matching_question.id
      ), '[]'::jsonb)
    )
  from matching_questions matching_question
  order by matching_question.created_at desc, matching_question.id desc;
end;
$$;

revoke all on function public.search_creator_questions(
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  uuid,
  text,
  uuid,
  integer,
  timestamptz,
  uuid
) from public, anon, authenticated;

grant execute on function public.search_creator_questions(
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  uuid,
  text,
  uuid,
  integer,
  timestamptz,
  uuid
) to authenticated;

commit;
