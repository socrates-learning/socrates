-- Backfill immutable version 1 snapshots for existing Concepts and Questions.
-- Stable records and live child rows remain authoritative for current reads;
-- this migration only creates initial snapshots and fills null current pointers.

begin;

-- Keep each snapshot internally consistent while Creator Studio may otherwise
-- write the live parent and child tables in separate statements.
lock table
  public.article_concepts,
  public.concepts,
  public.concept_placements,
  public.concept_tags,
  public.content_source_notes,
  public.library_nodes,
  public.questions,
  public.question_accepted_answers,
  public.question_options,
  public.question_sources,
  public.sources,
  public.tags,
  public.concept_versions,
  public.question_versions
in share row exclusive mode;

do $preflight$
begin
  if exists (
    select 1
    from public.concepts c
    where exists (
      select 1
      from public.concept_versions cv
      where cv.concept_id = c.id
    )
      and not exists (
        select 1
        from public.concept_versions cv
        where cv.concept_id = c.id
          and cv.version_number = 1
      )
  ) then
    raise exception
      'Concept version backfill stopped: an existing Concept has versions but no version 1';
  end if;

  if exists (
    select 1
    from public.questions q
    where exists (
      select 1
      from public.question_versions qv
      where qv.question_id = q.id
    )
      and not exists (
        select 1
        from public.question_versions qv
        where qv.question_id = q.id
          and qv.version_number = 1
      )
  ) then
    raise exception
      'Question version backfill stopped: an existing Question has versions but no version 1';
  end if;

  if exists (
    select 1
    from public.concept_placements cp
    left join public.concepts c on c.id = cp.concept_id
    left join public.library_nodes ln on ln.id = cp.library_node_id
    where cp.concept_id is null
      or cp.library_node_id is null
      or c.id is null
      or ln.id is null
  ) then
    raise exception
      'Concept version backfill stopped: a Concept placement is incomplete or orphaned';
  end if;

  if exists (
    select 1
    from public.concept_tags ct
    left join public.concepts c on c.id = ct.concept_id
    left join public.tags t on t.id = ct.tag_id
    where c.id is null
      or ct.tag_id is null
      or t.id is null
  ) then
    raise exception
      'Concept version backfill stopped: a Concept tag is incomplete or orphaned';
  end if;

  if exists (
    select 1
    from public.content_source_notes csn
    left join public.concepts c on c.id = csn.concept_id
    left join public.sources s on s.id = csn.source_id
    where csn.concept_id is not null
      and (
        c.id is null
        or csn.learn_section_id is not null
        or csn.source_id is null
        or s.id is null
      )
  ) then
    raise exception
      'Concept version backfill stopped: a Concept source link is incomplete or inconsistent';
  end if;

  if exists (
    select 1
    from public.question_accepted_answers qaa
    left join public.questions q on q.id = qaa.question_id
    where q.id is null
  ) then
    raise exception
      'Question version backfill stopped: an accepted answer is orphaned';
  end if;

  if exists (
    select 1
    from public.question_options qo
    left join public.questions q on q.id = qo.question_id
    where q.id is null
  ) then
    raise exception
      'Question version backfill stopped: a Question option is orphaned';
  end if;

  if exists (
    select 1
    from public.question_sources qs
    left join public.questions q on q.id = qs.question_id
    left join public.sources s on s.id = qs.source_id
    where q.id is null or s.id is null
  ) then
    raise exception
      'Question version backfill stopped: a Question source link is incomplete or orphaned';
  end if;
end
$preflight$;

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
  1,
  null,
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
  'Backfilled existing Concept as version 1',
  c.created_by
from public.concepts c
where not exists (
  select 1
  from public.concept_versions cv
  where cv.concept_id = c.id
)
on conflict (concept_id, version_number) do nothing;

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
  1,
  null,
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
  'Backfilled existing Question as version 1',
  q.created_by
from public.questions q
where not exists (
  select 1
  from public.question_versions qv
  where qv.question_id = q.id
)
on conflict (question_id, version_number) do nothing;

-- Existing non-null pointers are deliberately preserved. A null pointer is
-- filled only from that same stable record's version 1.
update public.concepts c
set current_version_id = cv.id
from public.concept_versions cv
where c.current_version_id is null
  and cv.concept_id = c.id
  and cv.version_number = 1;

update public.questions q
set current_version_id = qv.id
from public.question_versions qv
where q.current_version_id is null
  and qv.question_id = q.id
  and qv.version_number = 1;

do $verification$
declare
  concept_count bigint;
  concept_version_1_count bigint;
  question_count bigint;
  question_version_1_count bigint;
  null_concept_pointer_count bigint;
  null_question_pointer_count bigint;
  mismatch_count bigint;
begin
  select count(*) into concept_count from public.concepts;
  select count(*) into concept_version_1_count
  from public.concept_versions
  where version_number = 1;

  if concept_count <> concept_version_1_count then
    raise exception
      'Concept version backfill incomplete: % Concepts but % version 1 rows',
      concept_count,
      concept_version_1_count;
  end if;

  select count(*) into question_count from public.questions;
  select count(*) into question_version_1_count
  from public.question_versions
  where version_number = 1;

  if question_count <> question_version_1_count then
    raise exception
      'Question version backfill incomplete: % Questions but % version 1 rows',
      question_count,
      question_version_1_count;
  end if;

  select count(*) into null_concept_pointer_count
  from public.concepts
  where current_version_id is null;

  if null_concept_pointer_count <> 0 then
    raise exception
      'Concept version backfill incomplete: % Concepts have a null current_version_id',
      null_concept_pointer_count;
  end if;

  select count(*) into null_question_pointer_count
  from public.questions
  where current_version_id is null;

  if null_question_pointer_count <> 0 then
    raise exception
      'Question version backfill incomplete: % Questions have a null current_version_id',
      null_question_pointer_count;
  end if;

  select count(*) into mismatch_count
  from public.concepts c
  join public.concept_versions cv
    on cv.id = c.current_version_id
   and cv.concept_id = c.id
  where jsonb_array_length(cv.placements_snapshot) <>
      (select count(*) from public.concept_placements cp where cp.concept_id = c.id)
    or jsonb_array_length(cv.tags_snapshot) <>
      (select count(*) from public.concept_tags ct where ct.concept_id = c.id)
    or jsonb_array_length(cv.sources_snapshot) <>
      (
        select count(*)
        from public.content_source_notes csn
        where csn.concept_id = c.id
          and csn.learn_section_id is null
      );

  if mismatch_count <> 0 then
    raise exception
      'Concept version backfill inconsistent: % current snapshots have child-count mismatches',
      mismatch_count;
  end if;

  select count(*) into mismatch_count
  from public.questions q
  join public.question_versions qv
    on qv.id = q.current_version_id
   and qv.question_id = q.id
  where jsonb_array_length(qv.accepted_answers_snapshot) <>
      (
        select count(*)
        from public.question_accepted_answers qaa
        where qaa.question_id = q.id
      )
    or jsonb_array_length(qv.options_snapshot) <>
      (
        select count(*)
        from public.question_options qo
        where qo.question_id = q.id
      )
    or jsonb_array_length(qv.sources_snapshot) <>
      (
        select count(*)
        from public.question_sources qs
        where qs.question_id = q.id
      );

  if mismatch_count <> 0 then
    raise exception
      'Question version backfill inconsistent: % current snapshots have child-count mismatches',
      mismatch_count;
  end if;
end
$verification$;

-- Optional post-apply operator checks:
-- select
--   (select count(*) from public.concepts) as concept_count,
--   (select count(*) from public.concept_versions where version_number = 1)
--     as concept_version_1_count,
--   (select count(*) from public.concepts where current_version_id is null)
--     as concepts_without_current_version;
--
-- select
--   (select count(*) from public.questions) as question_count,
--   (select count(*) from public.question_versions where version_number = 1)
--     as question_version_1_count,
--   (select count(*) from public.questions where current_version_id is null)
--     as questions_without_current_version,
--   (select count(*) from public.question_accepted_answers)
--     as live_accepted_answer_count,
--   (
--     select coalesce(sum(jsonb_array_length(accepted_answers_snapshot)), 0)
--     from public.question_versions
--     where version_number = 1
--   ) as version_1_accepted_answer_count,
--   (select count(*) from public.question_options) as live_option_count,
--   (
--     select coalesce(sum(jsonb_array_length(options_snapshot)), 0)
--     from public.question_versions
--     where version_number = 1
--   ) as version_1_option_count;

commit;
