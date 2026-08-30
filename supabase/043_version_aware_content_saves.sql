-- Version-aware Concept and Question saves.
-- Live records and child tables remain learner-facing; these controlled RPCs
-- append one immutable snapshot and advance current_version_id atomically.

create or replace function public.append_concept_version_snapshot(
  p_concept_id uuid,
  p_created_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_concept public.concepts%rowtype;
  previous_version_id uuid;
  next_version_number integer;
  new_version_id uuid;
begin
  select *
  into target_concept
  from public.concepts c
  where c.id = p_concept_id
  for update;

  if target_concept.id is null then
    raise exception 'Concept was not found';
  end if;

  previous_version_id := target_concept.current_version_id;

  if previous_version_id is null then
    if exists (
      select 1
      from public.concept_versions cv
      where cv.concept_id = target_concept.id
    ) then
      raise exception 'Concept has versions but no current version pointer';
    end if;

    next_version_number := 1;
  else
    select cv.version_number + 1
    into next_version_number
    from public.concept_versions cv
    where cv.id = previous_version_id
      and cv.concept_id = target_concept.id;

    if next_version_number is null then
      raise exception 'Concept current version pointer is invalid';
    end if;
  end if;

  if exists (
    select 1
    from public.concept_placements cp
    left join public.library_nodes ln on ln.id = cp.library_node_id
    where cp.concept_id = target_concept.id
      and (cp.library_node_id is null or ln.id is null)
  ) then
    raise exception 'Concept snapshot stopped: a placement is incomplete or orphaned';
  end if;

  if exists (
    select 1
    from public.concept_tags ct
    left join public.tags t on t.id = ct.tag_id
    where ct.concept_id = target_concept.id
      and (ct.tag_id is null or t.id is null)
  ) then
    raise exception 'Concept snapshot stopped: a tag is incomplete or orphaned';
  end if;

  if exists (
    select 1
    from public.content_source_notes csn
    left join public.sources s on s.id = csn.source_id
    where csn.concept_id = target_concept.id
      and (
        csn.learn_section_id is not null
        or csn.source_id is null
        or s.id is null
      )
  ) then
    raise exception 'Concept snapshot stopped: a source link is incomplete or inconsistent';
  end if;

  insert into public.concept_versions (
    concept_id,
    version_number,
    parent_version_id,
    name,
    body_markdown,
    concept_type,
    importance,
    difficulty,
    estimated_time,
    summary,
    why_it_matters,
    placements_snapshot,
    tags_snapshot,
    sources_snapshot,
    snapshot_schema_version,
    edit_summary,
    created_by
  )
  select
    c.id,
    next_version_number,
    previous_version_id,
    c.name,
    c.body_markdown,
    c.concept_type,
    c.importance,
    c.difficulty,
    c.estimated_time,
    c.summary,
    c.why_it_matters,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'placement_id', cp.id,
            'library_node_id', cp.library_node_id,
            'library_id', ln.library_id,
            'node_parent_id', ln.parent_id,
            'node_name', ln.name,
            'node_type', ln.node_type,
            'node_sort_order', ln.sort_order,
            'placement_sort_order', cp.sort_order
          )
          order by cp.sort_order nulls last, cp.library_node_id, cp.id
        )
        from public.concept_placements cp
        join public.library_nodes ln on ln.id = cp.library_node_id
        where cp.concept_id = c.id
      ),
      '[]'::jsonb
    ),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'concept_tag_id', ct.id,
            'tag_id', t.id,
            'name', t.name,
            'slug', t.slug,
            'legacy_tag', ct.tag,
            'created_by', ct.created_by,
            'created_at', ct.created_at
          )
          order by lower(t.name), t.slug, ct.id
        )
        from public.concept_tags ct
        join public.tags t on t.id = ct.tag_id
        where ct.concept_id = c.id
      ),
      '[]'::jsonb
    ),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'attribution_id', csn.id,
            'source_id', s.id,
            'source_key', s.source_key,
            'title', s.title,
            'author', s.author,
            'edition', s.edition,
            'source_type', s.source_type,
            'source_notes', s.notes,
            'url', s.url,
            'license', s.license,
            'attribution_note', csn.note,
            'source_created_by', s.created_by,
            'source_created_at', s.created_at,
            'source_updated_at', s.updated_at,
            'attribution_created_by', csn.created_by,
            'attribution_created_at', csn.created_at
          )
          order by s.source_key, s.id, csn.id
        )
        from public.content_source_notes csn
        join public.sources s on s.id = csn.source_id
        where csn.concept_id = c.id
          and csn.learn_section_id is null
      ),
      '[]'::jsonb
    ),
    1,
    'Saved Concept',
    p_created_by
  from public.concepts c
  where c.id = target_concept.id
  returning id into new_version_id;

  update public.concepts
  set current_version_id = new_version_id
  where id = target_concept.id;

  return new_version_id;
end;
$$;

create or replace function public.append_question_version_snapshot(
  p_question_id uuid,
  p_created_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_question public.questions%rowtype;
  previous_version_id uuid;
  next_version_number integer;
  new_version_id uuid;
begin
  select *
  into target_question
  from public.questions q
  where q.id = p_question_id
  for update;

  if target_question.id is null then
    raise exception 'Question was not found';
  end if;

  previous_version_id := target_question.current_version_id;

  if previous_version_id is null then
    if exists (
      select 1
      from public.question_versions qv
      where qv.question_id = target_question.id
    ) then
      raise exception 'Question has versions but no current version pointer';
    end if;

    next_version_number := 1;
  else
    select qv.version_number + 1
    into next_version_number
    from public.question_versions qv
    where qv.id = previous_version_id
      and qv.question_id = target_question.id;

    if next_version_number is null then
      raise exception 'Question current version pointer is invalid';
    end if;
  end if;

  if exists (
    select 1
    from public.question_sources qs
    left join public.sources s on s.id = qs.source_id
    where qs.question_id = target_question.id
      and s.id is null
  ) then
    raise exception 'Question snapshot stopped: a source link is orphaned';
  end if;

  insert into public.question_versions (
    question_id,
    version_number,
    parent_version_id,
    concept_id,
    question_type,
    prompt,
    explanation,
    difficulty,
    testing_angle,
    sort_order,
    review_article_concept_id,
    accepted_answers_snapshot,
    options_snapshot,
    sources_snapshot,
    snapshot_schema_version,
    edit_summary,
    created_by
  )
  select
    q.id,
    next_version_number,
    previous_version_id,
    q.concept_id,
    q.question_type,
    q.prompt,
    q.explanation,
    q.difficulty,
    q.testing_angle,
    q.sort_order,
    q.review_article_concept_id,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'accepted_answer_id', qaa.id,
            'answer_text', qaa.answer_text,
            'normalized_answer', qaa.normalized_answer,
            'sort_order', qaa.sort_order,
            'created_at', qaa.created_at,
            'updated_at', qaa.updated_at
          )
          order by qaa.sort_order, qaa.id
        )
        from public.question_accepted_answers qaa
        where qaa.question_id = q.id
      ),
      '[]'::jsonb
    ),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'option_id', qo.id,
            'option_text', qo.option_text,
            'is_correct', qo.is_correct,
            'sort_order', qo.sort_order,
            'created_at', qo.created_at,
            'updated_at', qo.updated_at
          )
          order by qo.sort_order, qo.id
        )
        from public.question_options qo
        where qo.question_id = q.id
      ),
      '[]'::jsonb
    ),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'question_source_id', qs.id,
            'source_id', s.id,
            'source_key', s.source_key,
            'title', s.title,
            'author', s.author,
            'edition', s.edition,
            'source_type', s.source_type,
            'source_notes', s.notes,
            'url', s.url,
            'license', s.license,
            'question_source_note', qs.note,
            'source_created_by', s.created_by,
            'source_created_at', s.created_at,
            'source_updated_at', s.updated_at,
            'question_source_created_by', qs.created_by,
            'question_source_created_at', qs.created_at,
            'question_source_updated_at', qs.updated_at
          )
          order by s.source_key, s.id, qs.id
        )
        from public.question_sources qs
        join public.sources s on s.id = qs.source_id
        where qs.question_id = q.id
      ),
      '[]'::jsonb
    ),
    1,
    'Saved Question',
    p_created_by
  from public.questions q
  where q.id = target_question.id
  returning id into new_version_id;

  update public.questions
  set current_version_id = new_version_id
  where id = target_question.id;

  return new_version_id;
end;
$$;

create or replace function public.save_concept_with_version(
  p_concept_id uuid,
  p_name text,
  p_body_markdown text,
  p_active_library_id uuid,
  p_library_node_ids uuid[],
  p_tag_names text[],
  p_status text,
  p_references jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  save_result jsonb;
  reference_result jsonb;
  saved_concept_id uuid;
  new_version_id uuid;
begin
  if caller_id is null then
    raise exception 'Authenticated user is required';
  end if;

  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may save concepts';
  end if;

  if p_status not in ('draft', 'published', 'archived') then
    raise exception 'Unsupported Concept status';
  end if;

  save_result := public.save_concept_draft(
    p_concept_id,
    p_name,
    p_body_markdown,
    p_active_library_id,
    p_library_node_ids,
    coalesce(p_tag_names, array[]::text[])
  );

  saved_concept_id := (save_result ->> 'concept_id')::uuid;

  reference_result := public.sync_concept_references(
    saved_concept_id,
    coalesce(p_references, '[]'::jsonb)
  );

  update public.concepts
  set status = p_status
  where id = saved_concept_id;

  new_version_id := public.append_concept_version_snapshot(
    saved_concept_id,
    caller_id
  );

  return save_result || jsonb_build_object(
    'status', p_status,
    'references', reference_result -> 'references',
    'version_id', new_version_id
  );
end;
$$;

create or replace function public.save_question_with_version(
  p_question_id uuid,
  p_concept_id uuid,
  p_question_type text,
  p_prompt text,
  p_explanation text,
  p_status text,
  p_review_article_concept_id uuid,
  p_sort_order integer,
  p_difficulty text,
  p_testing_angle text,
  p_accepted_answers jsonb,
  p_options jsonb,
  p_source_ids uuid[]
)
returns public.questions
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_question public.questions%rowtype;
  saved_question public.questions%rowtype;
  interim_status text;
  normalized_source_ids uuid[];
  source_id uuid;
  new_version_id uuid;
begin
  if caller_id is null then
    raise exception 'Authenticated user is required';
  end if;

  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may save questions';
  end if;

  if p_status not in ('draft', 'published', 'archived') then
    raise exception 'Unsupported question status';
  end if;

  if p_question_id is null then
    if p_question_type = 'short_answer' and p_accepted_answers is null then
      raise exception 'New short-answer questions require an accepted-answer payload';
    end if;

    if p_question_type in ('multiple_choice', 'true_false') and p_options is null then
      raise exception 'New option-based questions require an options payload';
    end if;

    saved_question := public.create_question(
      p_concept_id,
      p_question_type,
      p_prompt,
      p_explanation,
      p_review_article_concept_id,
      p_sort_order,
      p_difficulty,
      p_testing_angle
    );
  else
    select *
    into target_question
    from public.questions q
    where q.id = p_question_id
    for update;

    if target_question.id is null then
      raise exception 'Question was not found';
    end if;

    if target_question.concept_id <> p_concept_id then
      raise exception 'A Question cannot be moved to another Concept during save';
    end if;

    interim_status := case when p_status = 'published' then 'draft' else p_status end;

    saved_question := public.update_question(
      p_question_id,
      p_question_type,
      p_prompt,
      p_explanation,
      interim_status,
      p_review_article_concept_id,
      p_sort_order,
      p_difficulty,
      p_testing_angle
    );
  end if;

  if p_accepted_answers is not null then
    perform public.replace_question_accepted_answers(
      saved_question.id,
      p_accepted_answers
    );
  end if;

  if p_options is not null then
    perform public.replace_question_options(saved_question.id, p_options);
  end if;

  if p_source_ids is not null then
    select coalesce(array_agg(distinct requested_source_id), array[]::uuid[])
    into normalized_source_ids
    from unnest(p_source_ids) as requested_source_id
    where requested_source_id is not null;

    foreach source_id in array normalized_source_ids loop
      if not exists (select 1 from public.sources s where s.id = source_id) then
        raise exception 'A Question source was not found';
      end if;
    end loop;

    delete from public.question_sources qs
    where qs.question_id = saved_question.id
      and (
        cardinality(normalized_source_ids) = 0
        or not qs.source_id = any(normalized_source_ids)
      );

    foreach source_id in array normalized_source_ids loop
      insert into public.question_sources (
        question_id,
        source_id,
        note,
        created_by
      )
      values (
        saved_question.id,
        source_id,
        null,
        caller_id
      )
      on conflict (question_id, source_id) do nothing;
    end loop;
  end if;

  saved_question := public.update_question(
    saved_question.id,
    p_question_type,
    p_prompt,
    p_explanation,
    p_status,
    p_review_article_concept_id,
    p_sort_order,
    p_difficulty,
    p_testing_angle
  );

  new_version_id := public.append_question_version_snapshot(
    saved_question.id,
    caller_id
  );

  select *
  into saved_question
  from public.questions q
  where q.id = saved_question.id;

  return saved_question;
end;
$$;

revoke all on function public.append_concept_version_snapshot(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.append_question_version_snapshot(uuid, uuid)
  from public, anon, authenticated;

revoke all on function public.save_concept_with_version(
  uuid,
  text,
  text,
  uuid,
  uuid[],
  text[],
  text,
  jsonb
) from public;
grant execute on function public.save_concept_with_version(
  uuid,
  text,
  text,
  uuid,
  uuid[],
  text[],
  text,
  jsonb
) to authenticated;

revoke all on function public.save_question_with_version(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  integer,
  text,
  text,
  jsonb,
  jsonb,
  uuid[]
) from public;
grant execute on function public.save_question_with_version(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  integer,
  text,
  text,
  jsonb,
  jsonb,
  uuid[]
) to authenticated;
