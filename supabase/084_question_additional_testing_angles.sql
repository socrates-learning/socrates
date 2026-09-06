-- Phase 7D: Additional Testing Angles are official authoring metadata only.
begin;
create table public.question_additional_testing_angles (
  question_id uuid not null references public.questions(id) on delete cascade,
  testing_angle text not null check (btrim(testing_angle) <> ''),
  normalized_testing_angle text generated always as (lower(btrim(testing_angle))) stored,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (question_id, normalized_testing_angle)
);
create index question_additional_testing_angles_reverse_idx on public.question_additional_testing_angles(normalized_testing_angle, question_id);
alter table public.question_additional_testing_angles enable row level security;
revoke all on public.question_additional_testing_angles from public, anon, authenticated;
grant select on public.question_additional_testing_angles to authenticated;
create policy question_additional_testing_angles_editor_read on public.question_additional_testing_angles
  for select to authenticated using (public.is_editor_or_admin());

create function public.check_question_additional_testing_angle() returns trigger
language plpgsql security definer set search_path = '' as $$
declare primary_angle text;
begin
  select testing_angle into primary_angle from public.questions where id = new.question_id for update;
  new.testing_angle := btrim(new.testing_angle);
  if lower(new.testing_angle) = lower(btrim(primary_angle)) then
    raise exception 'Primary Testing Angle cannot also be Additional';
  end if;
  return new;
end;
$$;
create trigger check_question_additional_testing_angle before insert or update on public.question_additional_testing_angles
for each row execute function public.check_question_additional_testing_angle();
revoke all on function public.check_question_additional_testing_angle() from public, anon, authenticated;

-- Also covers legacy scalar update paths. Never touch historical evidence or versions.
create function public.remove_primary_from_additional_testing_angles() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.question_additional_testing_angles
    where question_id = new.id and normalized_testing_angle = lower(btrim(new.testing_angle));
  return new;
end;
$$;
create trigger remove_primary_from_additional_testing_angles after update of testing_angle on public.questions
for each row execute function public.remove_primary_from_additional_testing_angles();
revoke all on function public.remove_primary_from_additional_testing_angles() from public, anon, authenticated;

-- NULL means unrecorded in historical schema-1/2/3 snapshots. No backfill.
alter table public.question_versions add column additional_testing_angles_snapshot jsonb
check (additional_testing_angles_snapshot is null or jsonb_typeof(additional_testing_angles_snapshot) = 'array');
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
  select * into target_question
  from public.questions q
  where q.id = p_question_id
  for update;

  if target_question.id is null then
    raise exception 'Question was not found';
  end if;

  previous_version_id := target_question.current_version_id;
  if previous_version_id is null then
    if exists (
      select 1 from public.question_versions qv
      where qv.question_id = target_question.id
    ) then
      raise exception 'Question has versions but no current version pointer';
    end if;
    next_version_number := 1;
  else
    select qv.version_number + 1 into next_version_number
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
    where qs.question_id = target_question.id and s.id is null
  ) then
    raise exception 'Question snapshot stopped: a source link is orphaned';
  end if;

  if exists (
    select 1
    from public.question_tags qt
    left join public.tags t on t.id = qt.tag_id
    where qt.question_id = target_question.id and t.id is null
  ) then
    raise exception 'Question snapshot stopped: a tag link is orphaned';
  end if;

  insert into public.question_versions (
    question_id, version_number, parent_version_id, concept_id,
    question_type, prompt, explanation, difficulty, testing_angle, sort_order,
    review_article_concept_id, accepted_answers_snapshot, options_snapshot,
    tags_snapshot, sources_snapshot, snapshot_schema_version, edit_summary,
    created_by, related_concepts_snapshot, additional_testing_angles_snapshot
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
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'accepted_answer_id', qaa.id,
        'answer_text', qaa.answer_text,
        'normalized_answer', qaa.normalized_answer,
        'sort_order', qaa.sort_order,
        'created_at', qaa.created_at,
        'updated_at', qaa.updated_at
      ) order by qaa.sort_order, qaa.id)
      from public.question_accepted_answers qaa
      where qaa.question_id = q.id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'option_id', qo.id,
        'option_text', qo.option_text,
        'is_correct', qo.is_correct,
        'sort_order', qo.sort_order,
        'created_at', qo.created_at,
        'updated_at', qo.updated_at
      ) order by qo.sort_order, qo.id)
      from public.question_options qo
      where qo.question_id = q.id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'question_tag_id', qt.id,
        'tag_id', t.id,
        'name', t.name,
        'slug', t.slug,
        'status', t.status,
        'created_by', qt.created_by,
        'created_at', qt.created_at
      ) order by lower(t.name), t.slug, qt.id)
      from public.question_tags qt
      join public.tags t on t.id = qt.tag_id
      where qt.question_id = q.id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
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
      ) order by s.source_key, s.id, qs.id)
      from public.question_sources qs
      join public.sources s on s.id = qs.source_id
      where qs.question_id = q.id
    ), '[]'::jsonb),
    4,
    'Saved Question',
    p_created_by,
    coalesce((select jsonb_agg(jsonb_build_object(
      'concept_id', rc.concept_id, 'name', c.name,
      'created_by', rc.created_by, 'created_at', rc.created_at
    ) order by rc.concept_id) from public.question_related_concepts rc
      join public.concepts c on c.id = rc.concept_id
      where rc.question_id = q.id), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('testing_angle', a.testing_angle, 'created_by', a.created_by, 'created_at', a.created_at) order by a.normalized_testing_angle) from public.question_additional_testing_angles a where a.question_id = q.id), '[]'::jsonb)
  from public.questions q
  where q.id = target_question.id
  returning id into new_version_id;

  update public.questions
  set current_version_id = new_version_id
  where id = target_question.id;

  return new_version_id;
end;
$$;

create or replace function public.save_question_with_relationships_v2(
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
  p_source_ids uuid[],
  p_tag_ids uuid[],
  p_active_library_id uuid default null,
  p_related_concept_ids uuid[] default null,
  p_additional_testing_angles text[] default null
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
  normalized_tag_ids uuid[];
  existing_tag_ids uuid[];
  source_id uuid;
  selected_tag_id uuid;
begin
  if caller_id is null then raise exception 'Authenticated user is required'; end if;
  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may save questions';
  end if;
  if p_status not in ('draft', 'published', 'archived') then
    raise exception 'Unsupported question status';
  end if;

  select coalesce(array_agg(qt.tag_id), array[]::uuid[])
  into existing_tag_ids
  from public.question_tags qt
  where qt.question_id = p_question_id;
  normalized_tag_ids := public.validate_assignable_tag_ids(p_tag_ids, existing_tag_ids);

  if p_question_id is null then
    if p_question_type = 'short_answer' and p_accepted_answers is null then
      raise exception 'New short-answer questions require an accepted-answer payload';
    end if;
    if p_question_type in ('multiple_choice', 'true_false') and p_options is null then
      raise exception 'New option-based questions require an options payload';
    end if;
    saved_question := public.create_question(
      p_concept_id, p_question_type, p_prompt, p_explanation,
      p_review_article_concept_id, p_sort_order, p_difficulty, p_testing_angle
    );
  else
    select * into target_question
    from public.questions q where q.id = p_question_id for update;
    if target_question.id is null then raise exception 'Question was not found'; end if;
    if target_question.concept_id <> p_concept_id then
      raise exception 'A Question cannot be moved to another Concept during save';
    end if;
    interim_status := case when p_status = 'published' then 'draft' else p_status end;
    saved_question := public.update_question(
      p_question_id, p_question_type, p_prompt, p_explanation, interim_status,
      p_review_article_concept_id, p_sort_order, p_difficulty, p_testing_angle
    );
  end if;

  if p_accepted_answers is not null then
    perform public.replace_question_accepted_answers(saved_question.id, p_accepted_answers);
  end if;
  if p_options is not null then
    perform public.replace_question_options(saved_question.id, p_options);
  end if;

  if p_source_ids is not null then
    select coalesce(array_agg(distinct requested_source_id), array[]::uuid[])
    into normalized_source_ids
    from unnest(p_source_ids) requested_source_id
    where requested_source_id is not null;

    if exists (
      select 1 from unnest(normalized_source_ids) requested_source_id
      left join public.sources s on s.id = requested_source_id
      where s.id is null
    ) then
      raise exception 'A Question source was not found';
    end if;

    delete from public.question_sources qs
    where qs.question_id = saved_question.id
      and (cardinality(normalized_source_ids) = 0
        or not qs.source_id = any(normalized_source_ids));

    foreach source_id in array normalized_source_ids loop
      insert into public.question_sources (question_id, source_id, note, created_by)
      values (saved_question.id, source_id, null, caller_id)
      on conflict (question_id, source_id) do nothing;
    end loop;
  end if;

  delete from public.question_tags where question_id = saved_question.id;
  foreach selected_tag_id in array normalized_tag_ids loop
    insert into public.question_tags (question_id, tag_id, created_by)
    values (saved_question.id, selected_tag_id, caller_id)
    on conflict (question_id, tag_id) do nothing;
  end loop;

  saved_question := public.update_question(
    saved_question.id, p_question_type, p_prompt, p_explanation, p_status,
    p_review_article_concept_id, p_sort_order, p_difficulty, p_testing_angle
  );
  -- NULL (including omitted) preserves; an explicit empty array clears.
  if p_related_concept_ids is not null then
    if not exists (
      select 1 from public.concept_placements cp
      join public.library_nodes n on n.id = cp.library_node_id
      where cp.concept_id = saved_question.concept_id
        and n.library_id = p_active_library_id
    ) then raise exception 'Primary Concept was not found in the active library'; end if;
    if exists (
      select 1 from unnest(p_related_concept_ids) requested(id)
      where requested.id is null or requested.id = saved_question.concept_id
        or not exists (
          select 1 from public.concept_placements cp
          join public.library_nodes n on n.id = cp.library_node_id
          where cp.concept_id = requested.id and n.library_id = p_active_library_id
        )
    ) then raise exception 'Related Concepts must be distinct from Primary and belong to the active library'; end if;
    delete from public.question_related_concepts rc
      where rc.question_id = saved_question.id
        and not (rc.concept_id = any(p_related_concept_ids));
    insert into public.question_related_concepts(question_id, concept_id, created_by)
      select saved_question.id, id, caller_id from (select distinct unnest(p_related_concept_ids) id) requested
      on conflict (question_id, concept_id) do nothing;
  end if;
  -- NULL preserves, empty clears. Reject invalid elements before replacing links.
  if p_additional_testing_angles is not null then
    if exists(select 1 from unnest(p_additional_testing_angles) a where a is null or btrim(a) = '') then
      raise exception 'Additional Testing Angles must not be blank';
    end if;
    delete from public.question_additional_testing_angles a where a.question_id = saved_question.id
      and not (a.normalized_testing_angle = any(array(select lower(btrim(v)) from unnest(p_additional_testing_angles) v)));
    insert into public.question_additional_testing_angles(question_id, testing_angle, created_by)
      select saved_question.id, display, caller_id from (
        select distinct on (lower(btrim(v))) btrim(v) display
        from unnest(p_additional_testing_angles) with ordinality input(v, position)
        where lower(btrim(v)) is distinct from lower(btrim(saved_question.testing_angle))
        order by lower(btrim(v)), position
      ) normalized
      on conflict (question_id, normalized_testing_angle) do nothing;
  end if;
  perform public.append_question_version_snapshot(saved_question.id, caller_id);

  select * into saved_question from public.questions q where q.id = saved_question.id;
  return saved_question;
end;
$$;

create or replace function public.save_question_with_relationships(
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
  p_source_ids uuid[],
  p_tag_ids uuid[],
  p_active_library_id uuid default null,
  p_related_concept_ids uuid[] default null
)
returns public.questions language sql security definer set search_path = '' as $$
select public.save_question_with_relationships_v2(
 p_question_id, p_concept_id, p_question_type, p_prompt, p_explanation, p_status,
 p_review_article_concept_id, p_sort_order, p_difficulty, p_testing_angle,
 p_accepted_answers, p_options, p_source_ids, p_tag_ids, p_active_library_id, p_related_concept_ids, null
);
$$;
revoke all on function public.save_question_with_relationships_v2(uuid,uuid,text,text,text,text,uuid,integer,text,text,jsonb,jsonb,uuid[],uuid[],uuid,uuid[],text[]) from public, anon;
grant execute on function public.save_question_with_relationships_v2(uuid,uuid,text,text,text,text,uuid,integer,text,text,jsonb,jsonb,uuid[],uuid[],uuid,uuid[],text[]) to authenticated;
create or replace function public.get_creator_questions(p_active_library_id uuid, p_concept_id uuid)
returns setof jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may browse official Questions';
  end if;
  return query
  select to_jsonb(q) || jsonb_build_object(
    'primary_concept_name', c.name,
    'additional_testing_angles', coalesce((select jsonb_agg(a.testing_angle order by a.normalized_testing_angle) from public.question_additional_testing_angles a where a.question_id = q.id), '[]'::jsonb),
    'related_concepts', coalesce((select jsonb_agg(jsonb_build_object('id', rc.concept_id, 'name', related.name) order by rc.concept_id)
      from public.question_related_concepts rc join public.concepts related on related.id = rc.concept_id
      where rc.question_id = q.id), '[]'::jsonb),
    'question_accepted_answers', coalesce((select jsonb_agg(to_jsonb(a) order by a.sort_order, a.id) from public.question_accepted_answers a where a.question_id = q.id), '[]'::jsonb),
    'question_tags', coalesce((select jsonb_agg(jsonb_build_object('tag_id', t.id, 'tags', to_jsonb(t))) from public.question_tags qt join public.tags t on t.id = qt.tag_id where qt.question_id = q.id), '[]'::jsonb)
  ) from public.questions q join public.concepts c on c.id = q.concept_id
  where exists (select 1 from public.concept_placements cp join public.library_nodes n on n.id = cp.library_node_id
    where cp.concept_id = p_concept_id and n.library_id = p_active_library_id)
    and exists (select 1 from public.concept_placements cp join public.library_nodes n on n.id = cp.library_node_id
    where cp.concept_id = q.concept_id and n.library_id = p_active_library_id)
    and (q.concept_id = p_concept_id or exists (select 1 from public.question_related_concepts rc where rc.question_id = q.id and rc.concept_id = p_concept_id))
  order by q.created_at desc, q.id desc;
end;
$$;
revoke all on function public.get_creator_questions(uuid,uuid) from public, anon;
grant execute on function public.get_creator_questions(uuid,uuid) to authenticated;
commit;
