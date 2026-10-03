-- Explicit official text interpretation. No authored source or historical JSON rewrite.
-- Legacy full writers remain available only for entirely legacy content.
-- Media lifecycle, placements, selection, scoring and authority are unchanged.
begin;

do $$ begin
 if current_user <> 'postgres' or to_regclass('public.question_media_drafts') is null then
  raise exception '116 requires postgres and the released schema through 115';
 end if;
end $$;

alter table public.concepts add column body_format text not null default 'legacy'
 check (body_format in ('legacy','visual_markdown_v1'));
alter table public.concept_versions add column body_format text not null default 'legacy'
 check (body_format in ('legacy','visual_markdown_v1'));
alter table public.questions add column prompt_format text not null default 'legacy'
 check (prompt_format in ('legacy','visual_markdown_v1'));
alter table public.question_versions add column prompt_format text not null default 'legacy'
 check (prompt_format in ('legacy','visual_markdown_v1'));
alter table public.question_accepted_answers add column answer_format text not null default 'legacy'
 check (answer_format in ('legacy','visual_markdown_v1'));

comment on column public.concepts.body_format is 'Explicit interpretation only; opening content never converts it.';
comment on column public.concept_versions.body_format is 'Immutable interpretation paired with this version body.';
comment on column public.questions.prompt_format is 'Independent official Front interpretation; legacy is literal text.';
comment on column public.question_versions.prompt_format is 'Immutable Front interpretation; missing old Answer snapshot answer_format means legacy.';
comment on column public.question_accepted_answers.answer_format is 'Independent accepted Answer interpretation, captured in new version snapshots.';

create function public.m116_format(p_format text) returns text
language plpgsql immutable set search_path='' as $$
begin
 if p_format is null or p_format not in ('legacy','visual_markdown_v1') then
  raise exception 'Unsupported official text format' using errcode='22023';
 end if;
 return p_format;
end $$;

-- This is a lock and a content guard, never a caller-set session-variable bypass.
create function public.m116_legacy_question(p_question uuid,p_answers jsonb default null) returns void
language plpgsql security definer set search_path='' as $$
declare q public.questions;
begin
 if auth.uid() is null or not public.is_editor_or_admin() then raise exception 'Question authoring denied' using errcode='42501'; end if;
 if p_question is not null then
  select * into q from public.questions where id=p_question for update;
  if not found then raise exception 'Question was not found'; end if;
  if q.prompt_format<>'legacy' or exists(select 1 from public.question_accepted_answers where question_id=q.id and answer_format<>'legacy') then
   raise exception 'Edit rich Question content in Creator Studio' using errcode='40001';
  end if;
 end if;
 if p_answers is not null and exists(select 1 from jsonb_array_elements(p_answers) a where coalesce(a->>'answer_format','legacy')<>'legacy') then
  raise exception 'An explicit format-aware save is required' using errcode='22023';
 end if;
end $$;

create function public.m116_legacy_concept(p_concept uuid) returns void
language plpgsql security definer set search_path='' as $$
declare c public.concepts;
begin
 if auth.uid() is null or not public.is_editor_or_admin() then raise exception 'Concept authoring denied' using errcode='42501'; end if;
 if p_concept is null then return; end if;
 select * into c from public.concepts where id=p_concept for update;
 if not found then raise exception 'Concept was not found'; end if;
 if c.body_format<>'legacy' then raise exception 'An explicit format-aware Concept save is required' using errcode='40001'; end if;
end $$;

-- Validate the canonical Creator shape and the complete loaded revision before writing.
-- Fields outside the approved Creator controls cannot be silently reset by its payload.
create function public.m116_question_context(p_library uuid,p_payload jsonb,p_expected_version uuid,p_expected_updated_at timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare q public.questions; target uuid:=nullif(p_payload->>'p_question_id','')::uuid; a jsonb;
begin
 perform public.m115_author(auth.uid(),p_library);
 if jsonb_typeof(p_payload) is distinct from 'object' or (p_payload->>'p_active_library_id')::uuid is distinct from p_library then raise exception 'Invalid Question context'; end if;
 perform public.m116_format(p_payload->>'p_prompt_format');
 if p_payload->>'p_question_type' is distinct from 'short_answer' or jsonb_typeof(p_payload->'p_accepted_answers') is distinct from 'array' or jsonb_array_length(p_payload->'p_accepted_answers')<>1 then raise exception 'This Question shape must remain in its supported authoring workflow'; end if;
 a:=p_payload->'p_accepted_answers'->0;
 perform public.m116_format(a->>'answer_format');
 if target is null then
  if p_expected_version is not null or p_expected_updated_at is not null or p_payload->>'p_difficulty' is distinct from 'medium' or p_payload->>'p_status' is distinct from 'published' then raise exception 'Invalid new Question compatibility defaults'; end if;
  perform public.m113_actor_target(auth.uid(),p_library,'concept',(p_payload->>'p_concept_id')::uuid);
 else
  select * into q from public.questions where id=target for update;
  if not found then raise exception 'Question was not found' using errcode='40001'; end if;
  perform public.m113_actor_target(auth.uid(),p_library,'question',q.id);
  if q.current_version_id is distinct from p_expected_version or q.updated_at is distinct from p_expected_updated_at then raise exception 'Question changed; reload before saving' using errcode='40001'; end if;
  if q.question_type<>'short_answer' or (select count(*) from public.question_accepted_answers where question_id=q.id)>1 then raise exception 'This Question shape must remain in its supported authoring workflow'; end if;
  if row(q.concept_id,q.question_type,q.explanation,q.review_article_concept_id,q.sort_order,q.difficulty,q.status) is distinct from
     row((p_payload->>'p_concept_id')::uuid,p_payload->>'p_question_type',p_payload->>'p_explanation',nullif(p_payload->>'p_review_article_concept_id','')::uuid,(p_payload->>'p_sort_order')::integer,p_payload->>'p_difficulty',p_payload->>'p_status') then
   raise exception 'Unexposed Question metadata must be preserved';
  end if;
  if (q.prompt_format='visual_markdown_v1' and p_payload->>'p_prompt_format'<>'visual_markdown_v1') or
    (exists(select 1 from public.question_accepted_answers where question_id=q.id and answer_format='visual_markdown_v1') and a->>'answer_format'<>'visual_markdown_v1') then raise exception 'Converted text cannot be downgraded implicitly'; end if;
 end if;
end $$;

create function public.save_question_with_format(p_active_library_id uuid,p_expected_version uuid,p_expected_updated_at timestamptz,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q public.questions;
begin
 perform public.m116_question_context(p_active_library_id,p_payload,p_expected_version,p_expected_updated_at);
 q:=public.m116_question_save_core(nullif(p_payload->>'p_question_id','')::uuid,(p_payload->>'p_concept_id')::uuid,
  p_payload->>'p_question_type',p_payload->>'p_prompt',p_payload->>'p_explanation',p_payload->>'p_status',
  nullif(p_payload->>'p_review_article_concept_id','')::uuid,(p_payload->>'p_sort_order')::integer,p_payload->>'p_difficulty',p_payload->>'p_testing_angle',
  p_payload->'p_accepted_answers',nullif(p_payload->'p_options','null'::jsonb),
  case when jsonb_typeof(p_payload->'p_source_ids')='array' then array(select value::uuid from jsonb_array_elements_text(p_payload->'p_source_ids')) end,
  array(select value::uuid from jsonb_array_elements_text(p_payload->'p_tag_ids')),p_active_library_id,
  case when jsonb_typeof(p_payload->'p_related_concept_ids')='array' then array(select value::uuid from jsonb_array_elements_text(p_payload->'p_related_concept_ids')) end,
  case when jsonb_typeof(p_payload->'p_additional_testing_angles')='array' then array(select value from jsonb_array_elements_text(p_payload->'p_additional_testing_angles')) end,
  p_payload->>'p_prompt_format');
 return to_jsonb(q)||jsonb_build_object('question_accepted_answers',(select jsonb_agg(to_jsonb(a) order by a.sort_order,a.id) from public.question_accepted_answers a where a.question_id=q.id));
end $$;

create function public.save_concept_with_format(p_active_library_id uuid,p_expected_version uuid,p_expected_updated_at timestamptz,p_body_format text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.concepts; target uuid:=nullif(p_payload->>'p_concept_id','')::uuid; result jsonb;
begin
 perform public.m114_author(auth.uid(),p_active_library_id);
 perform public.m116_format(p_body_format);
 if jsonb_typeof(p_payload) is distinct from 'object' or (p_payload->>'p_active_library_id')::uuid is distinct from p_active_library_id then raise exception 'Invalid Concept context'; end if;
 if target is not null then
  select * into c from public.concepts where id=target for update;
  if not found then raise exception 'Concept was not found' using errcode='40001'; end if;
  perform public.m113_actor_target(auth.uid(),p_active_library_id,'concept',target);
  if c.current_version_id is distinct from p_expected_version or c.updated_at is distinct from p_expected_updated_at then raise exception 'Concept changed; reload before saving' using errcode='40001'; end if;
  if c.body_format='visual_markdown_v1' and p_body_format<>'visual_markdown_v1' then raise exception 'Converted text cannot be downgraded implicitly'; end if;
 elsif p_expected_version is not null or p_expected_updated_at is not null then raise exception 'Invalid new Concept revision';
 end if;
 result:=public.m116_concept_with_prerequisites(target,p_payload->>'p_name',p_payload->>'p_body_markdown',p_active_library_id,
  array(select value::uuid from jsonb_array_elements_text(p_payload->'p_library_node_ids')),
  array(select value::uuid from jsonb_array_elements_text(p_payload->'p_tag_ids')),p_payload->>'p_status',p_payload->'p_references',p_payload->'p_prerequisites',p_body_format);
 select * into c from public.concepts where id=(result->>'concept_id')::uuid;
 return result||jsonb_build_object('body_format',c.body_format,'bodyMarkdown',c.body_markdown,'updated_at',c.updated_at);
end $$;

-- Article Policy A changes review metadata only. Text, Answer identities, shape,
-- relationships, Tags, Testing Angles and media remain database-owned and untouched.
create function public.save_article_question_metadata(p_library_id uuid,p_article_id uuid,p_question_id uuid,p_expected_version uuid,p_expected_updated_at timestamptz,p_patch jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q public.questions; requested uuid[]; link uuid; v uuid;
begin
 perform public.m115_author(auth.uid(),p_library_id);
 select * into q from public.questions where id=p_question_id for update;
 if not found then raise exception 'Question was not found' using errcode='40001'; end if;
 perform public.m113_actor_target(auth.uid(),p_library_id,'question',q.id);
 if not exists(select 1 from public.article_category_placements p join public.library_nodes n on n.id=p.library_node_id where p.article_id=p_article_id and n.library_id=p_library_id)
  or not exists(select 1 from public.article_concepts where article_id=p_article_id and concept_id=q.concept_id) then raise exception 'Article Question context denied' using errcode='42501'; end if;
 if q.current_version_id is distinct from p_expected_version or q.updated_at is distinct from p_expected_updated_at then raise exception 'Question changed; reload before saving metadata' using errcode='40001'; end if;
 if jsonb_typeof(p_patch) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_patch) k where k not in ('review_article_concept_id','source_ids','status')) then raise exception 'Unsupported Article metadata'; end if;
 if p_patch?'review_article_concept_id' then
  link:=nullif(p_patch->>'review_article_concept_id','')::uuid;
  if link is not null and not exists(select 1 from public.article_concepts where id=link and article_id=p_article_id and concept_id=q.concept_id) then raise exception 'Review link denied' using errcode='42501'; end if;
  update public.questions set review_article_concept_id=link where id=q.id;
 end if;
 if p_patch?'source_ids' then
  if jsonb_typeof(p_patch->'source_ids') is distinct from 'array' then raise exception 'Sources must be an array'; end if;
  requested:=array(select distinct value::uuid from jsonb_array_elements_text(p_patch->'source_ids'));
  if exists(select 1 from unnest(requested) r(source_id) where r.source_id is null or not exists(select 1 from public.sources s where s.id=r.source_id)) then raise exception 'Question source not found'; end if;
  delete from public.question_sources where question_id=q.id and not(source_id=any(requested));
  insert into public.question_sources(question_id,source_id,created_by) select q.id,id,auth.uid() from unnest(requested) id on conflict(question_id,source_id) do nothing;
 end if;
 if p_patch?'status' then
  if p_patch->>'status' is null or p_patch->>'status' not in ('draft','published','archived') then raise exception 'Invalid Question status'; end if;
  update public.questions set status=p_patch->>'status' where id=q.id;
 end if;
 v:=public.append_question_version_snapshot(q.id,auth.uid());
 select * into q from public.questions where id=q.id;
 return to_jsonb(q)||jsonb_build_object('source_ids',coalesce((select jsonb_agg(source_id order by source_id) from public.question_sources where question_id=q.id),'[]'));
end $$;

-- Released function adaptations: generated from the captured d90c39e definitions.

CREATE OR REPLACE FUNCTION public.m116_concept_draft_core(p_concept_id uuid, p_name text, p_body_markdown text, p_active_library_id uuid, p_library_node_ids uuid[], p_tag_names text[] DEFAULT ARRAY[]::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  target_concept public.concepts%rowtype;
  normalized_placement_ids uuid[];
  placement_node_id uuid;
  tag_name text;
  cleaned_tag_name text;
  tag_slug text;
  resolved_tag_id uuid;
  seen_tag_slugs text[] := array[]::text[];
begin
  if caller_id is null then
    raise exception 'Authenticated user is required';
  end if;

  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may save concepts';
  end if;

  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'Concept name is required';
  end if;

  if btrim(coalesce(p_body_markdown, '')) = '' then
    raise exception 'Concept content is required';
  end if;

  if p_active_library_id is null
     or not exists (
       select 1
       from public.libraries l
       where l.id = p_active_library_id
     ) then
    raise exception 'Active library was not found';
  end if;

  select array_agg(distinct placement_id)
  into normalized_placement_ids
  from unnest(coalesce(p_library_node_ids, array[]::uuid[])) as placement_id
  where placement_id is not null;

  if coalesce(array_length(normalized_placement_ids, 1), 0) = 0 then
    raise exception 'At least one concept placement is required';
  end if;

  foreach placement_node_id in array normalized_placement_ids loop
    if not exists (
      select 1
      from public.library_nodes ln
      where ln.id = placement_node_id
        and ln.library_id = p_active_library_id
    ) then
      raise exception 'All concept placements must belong to the active library';
    end if;
  end loop;

  if p_concept_id is null then
    insert into public.concepts (
      name,
      body_markdown,
      status,
      is_public,
      created_by
    )
    values (
      btrim(p_name),
      coalesce(p_body_markdown, ''),
      'draft',
      false,
      caller_id
    )
    returning * into target_concept;
  else
    select *
    into target_concept
    from public.concepts c
    where c.id = p_concept_id
    for update;

    if target_concept.id is null then
      raise exception 'Concept was not found';
    end if;

    update public.concepts
    set name = btrim(p_name),
        body_markdown = coalesce(p_body_markdown, '')
    where id = target_concept.id
    returning * into target_concept;
  end if;

  delete from public.concept_placements cp
  where cp.concept_id = target_concept.id
    and exists (
      select 1
      from public.library_nodes ln
      where ln.id = cp.library_node_id
        and ln.library_id = p_active_library_id
    )
    and not cp.library_node_id = any(normalized_placement_ids);

  foreach placement_node_id in array normalized_placement_ids loop
    insert into public.concept_placements (
      concept_id,
      library_node_id,
      sort_order
    )
    values (
      target_concept.id,
      placement_node_id,
      0
    )
    on conflict (concept_id, library_node_id) do nothing;
  end loop;

  delete from public.concept_tags
  where concept_id = target_concept.id;

  foreach tag_name in array coalesce(p_tag_names, array[]::text[]) loop
    cleaned_tag_name := regexp_replace(btrim(tag_name), '\s+', ' ', 'g');
    tag_slug := public.tag_slug_from_name(cleaned_tag_name);

    if cleaned_tag_name = '' or tag_slug = '' or tag_slug = any(seen_tag_slugs) then
      continue;
    end if;

    seen_tag_slugs := array_append(seen_tag_slugs, tag_slug);

    insert into public.tags (name, slug, created_by)
    values (cleaned_tag_name, tag_slug, caller_id)
    on conflict (slug)
    do update set name = public.tags.name
    returning id into resolved_tag_id;

    insert into public.concept_tags (concept_id, tag_id, created_by)
    values (target_concept.id, resolved_tag_id, caller_id)
    on conflict (concept_id, tag_id) do nothing;
  end loop;

  return jsonb_build_object(
    'concept_id', target_concept.id,
    'status', target_concept.status,
    'library_id', p_active_library_id,
    'library_node_ids', normalized_placement_ids,
    'tags', coalesce(seen_tag_slugs, array[]::text[])
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_concept_draft(p_concept_id uuid, p_name text, p_body_markdown text, p_active_library_id uuid, p_library_node_ids uuid[], p_tag_names text[] DEFAULT ARRAY[]::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  target_concept public.concepts%rowtype;
  normalized_placement_ids uuid[];
  placement_node_id uuid;
  tag_name text;
  cleaned_tag_name text;
  tag_slug text;
  resolved_tag_id uuid;
  seen_tag_slugs text[] := array[]::text[];
begin
  perform public.m116_legacy_concept(p_concept_id);
  if caller_id is null then
    raise exception 'Authenticated user is required';
  end if;

  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may save concepts';
  end if;

  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'Concept name is required';
  end if;

  if btrim(coalesce(p_body_markdown, '')) = '' then
    raise exception 'Concept content is required';
  end if;

  if p_active_library_id is null
     or not exists (
       select 1
       from public.libraries l
       where l.id = p_active_library_id
     ) then
    raise exception 'Active library was not found';
  end if;

  select array_agg(distinct placement_id)
  into normalized_placement_ids
  from unnest(coalesce(p_library_node_ids, array[]::uuid[])) as placement_id
  where placement_id is not null;

  if coalesce(array_length(normalized_placement_ids, 1), 0) = 0 then
    raise exception 'At least one concept placement is required';
  end if;

  foreach placement_node_id in array normalized_placement_ids loop
    if not exists (
      select 1
      from public.library_nodes ln
      where ln.id = placement_node_id
        and ln.library_id = p_active_library_id
    ) then
      raise exception 'All concept placements must belong to the active library';
    end if;
  end loop;

  if p_concept_id is null then
    insert into public.concepts (
      name,
      body_markdown,
      status,
      is_public,
      created_by
    )
    values (
      btrim(p_name),
      coalesce(p_body_markdown, ''),
      'draft',
      false,
      caller_id
    )
    returning * into target_concept;
  else
    select *
    into target_concept
    from public.concepts c
    where c.id = p_concept_id
    for update;

    if target_concept.id is null then
      raise exception 'Concept was not found';
    end if;

    update public.concepts
    set name = btrim(p_name),
        body_markdown = coalesce(p_body_markdown, '')
    where id = target_concept.id
    returning * into target_concept;
  end if;

  delete from public.concept_placements cp
  where cp.concept_id = target_concept.id
    and exists (
      select 1
      from public.library_nodes ln
      where ln.id = cp.library_node_id
        and ln.library_id = p_active_library_id
    )
    and not cp.library_node_id = any(normalized_placement_ids);

  foreach placement_node_id in array normalized_placement_ids loop
    insert into public.concept_placements (
      concept_id,
      library_node_id,
      sort_order
    )
    values (
      target_concept.id,
      placement_node_id,
      0
    )
    on conflict (concept_id, library_node_id) do nothing;
  end loop;

  delete from public.concept_tags
  where concept_id = target_concept.id;

  foreach tag_name in array coalesce(p_tag_names, array[]::text[]) loop
    cleaned_tag_name := regexp_replace(btrim(tag_name), '\s+', ' ', 'g');
    tag_slug := public.tag_slug_from_name(cleaned_tag_name);

    if cleaned_tag_name = '' or tag_slug = '' or tag_slug = any(seen_tag_slugs) then
      continue;
    end if;

    seen_tag_slugs := array_append(seen_tag_slugs, tag_slug);

    insert into public.tags (name, slug, created_by)
    values (cleaned_tag_name, tag_slug, caller_id)
    on conflict (slug)
    do update set name = public.tags.name
    returning id into resolved_tag_id;

    insert into public.concept_tags (concept_id, tag_id, created_by)
    values (target_concept.id, resolved_tag_id, caller_id)
    on conflict (concept_id, tag_id) do nothing;
  end loop;

  return jsonb_build_object(
    'concept_id', target_concept.id,
    'status', target_concept.status,
    'library_id', p_active_library_id,
    'library_node_ids', normalized_placement_ids,
    'tags', coalesce(seen_tag_slugs, array[]::text[])
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.m116_concept_version_core(p_concept_id uuid, p_name text, p_body_markdown text, p_active_library_id uuid, p_library_node_ids uuid[], p_tag_ids uuid[], p_status text, p_references jsonb, p_body_format text DEFAULT 'legacy'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  save_result jsonb;
  reference_result jsonb;
  saved_concept_id uuid;
  existing_tag_ids uuid[];
  normalized_tag_ids uuid[];
  selected_tag_id uuid;
  new_version_id uuid;
begin
  if caller_id is null then raise exception 'Authenticated user is required'; end if;
  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may save concepts';
  end if;
  if p_status not in ('draft', 'published', 'archived') then
    raise exception 'Unsupported Concept status';
  end if;

  select coalesce(array_agg(ct.tag_id), array[]::uuid[])
  into existing_tag_ids
  from public.concept_tags ct
  where ct.concept_id = p_concept_id;

  normalized_tag_ids := public.validate_assignable_tag_ids(
    p_tag_ids,
    existing_tag_ids
  );

  save_result := public.m116_concept_draft_core(
    p_concept_id,
    p_name,
    p_body_markdown,
    p_active_library_id,
    p_library_node_ids,
    array[]::text[]
  );
  saved_concept_id := (save_result ->> 'concept_id')::uuid;

  foreach selected_tag_id in array normalized_tag_ids loop
    insert into public.concept_tags (concept_id, tag_id, created_by)
    values (saved_concept_id, selected_tag_id, caller_id)
    on conflict (concept_id, tag_id) do nothing;
  end loop;

  reference_result := public.sync_concept_references(
    saved_concept_id,
    coalesce(p_references, '[]'::jsonb)
  );

  update public.concepts set status = p_status where id = saved_concept_id;
  update public.concepts set body_format=public.m116_format(p_body_format) where id=saved_concept_id;
  new_version_id := public.append_concept_version_snapshot(saved_concept_id, caller_id);

  return save_result || jsonb_build_object(
    'status', p_status,
    'tags', coalesce((
      select jsonb_agg(t.slug order by lower(t.name), t.id)
      from public.concept_tags ct
      join public.tags t on t.id = ct.tag_id
      where ct.concept_id = saved_concept_id
    ), '[]'::jsonb),
    'references', reference_result -> 'references',
    'version_id', new_version_id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.m116_concept_with_prerequisites(p_concept_id uuid, p_name text, p_body_markdown text, p_active_library_id uuid, p_library_node_ids uuid[], p_tag_ids uuid[], p_status text, p_references jsonb, p_prerequisites jsonb, p_body_format text DEFAULT 'legacy'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  save_result jsonb;
  saved_concept_id uuid;
  prerequisite_result jsonb;
begin
  -- The existing controlled save remains authoritative for content, tags,
  -- references, lifecycle, placements, and version creation. Any prerequisite
  -- failure aborts this wrapper call and rolls the complete save back.
  save_result := public.m116_concept_version_core(
    p_concept_id,
    p_name,
    p_body_markdown,
    p_active_library_id,
    p_library_node_ids,
    p_tag_ids,
    p_status,
    p_references, p_body_format
  );
  saved_concept_id := (save_result ->> 'concept_id')::uuid;
  prerequisite_result := public.sync_concept_prerequisites(
    saved_concept_id,
    p_active_library_id,
    p_prerequisites
  );

  return save_result || jsonb_build_object('prerequisites', prerequisite_result);
end;
$function$;

CREATE OR REPLACE FUNCTION public.m116_update_question_core(p_question_id uuid, p_question_type text, p_prompt text, p_explanation text, p_status text, p_review_article_concept_id uuid DEFAULT NULL::uuid, p_sort_order integer DEFAULT 0, p_difficulty text DEFAULT 'medium'::text, p_testing_angle text DEFAULT 'General Understanding'::text)
 RETURNS questions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.update_question(p_question_id uuid, p_question_type text, p_prompt text, p_explanation text, p_status text, p_review_article_concept_id uuid DEFAULT NULL::uuid, p_sort_order integer DEFAULT 0, p_difficulty text DEFAULT 'medium'::text, p_testing_angle text DEFAULT 'General Understanding'::text)
 RETURNS questions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  target_question public.questions%rowtype;
begin
  perform public.m116_legacy_question(p_question_id);
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
$function$;

CREATE OR REPLACE FUNCTION public.m116_replace_answers_core(p_question_id uuid, p_answers jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      sort_order, answer_format
    )
    values (
      p_question_id,
      btrim(answer_record ->> 'answer_text'),
      coalesce((answer_record ->> 'sort_order')::integer, 0),
      public.m116_format(coalesce(answer_record->>'answer_format','legacy'))
    );
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.replace_question_accepted_answers(p_question_id uuid, p_answers jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  answer_record jsonb;
begin
  perform public.m116_legacy_question(p_question_id,p_answers);
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
$function$;

CREATE OR REPLACE FUNCTION public.replace_question_options(p_question_id uuid, p_options jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  option_record jsonb;
begin
  perform public.m116_legacy_question(p_question_id);
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
$function$;

CREATE OR REPLACE FUNCTION public.m116_question_save_core(p_question_id uuid, p_concept_id uuid, p_question_type text, p_prompt text, p_explanation text, p_status text, p_review_article_concept_id uuid, p_sort_order integer, p_difficulty text, p_testing_angle text, p_accepted_answers jsonb, p_options jsonb, p_source_ids uuid[], p_tag_ids uuid[], p_active_library_id uuid DEFAULT NULL::uuid, p_related_concept_ids uuid[] DEFAULT NULL::uuid[], p_additional_testing_angles text[] DEFAULT NULL::text[], p_prompt_format text DEFAULT 'legacy'::text)
 RETURNS questions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    saved_question := public.m116_update_question_core(
      p_question_id, p_question_type, p_prompt, p_explanation, interim_status,
      p_review_article_concept_id, p_sort_order, p_difficulty, p_testing_angle
    );
  end if;

  if p_accepted_answers is not null then
    perform public.m116_replace_answers_core(saved_question.id, p_accepted_answers);
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

  saved_question := public.m116_update_question_core(
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
  update public.questions set prompt_format=public.m116_format(p_prompt_format) where id=saved_question.id;
  perform public.append_question_version_snapshot(saved_question.id, caller_id);

  select * into saved_question from public.questions q where q.id = saved_question.id;
  return saved_question;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_question_with_relationships_v2(p_question_id uuid, p_concept_id uuid, p_question_type text, p_prompt text, p_explanation text, p_status text, p_review_article_concept_id uuid, p_sort_order integer, p_difficulty text, p_testing_angle text, p_accepted_answers jsonb, p_options jsonb, p_source_ids uuid[], p_tag_ids uuid[], p_active_library_id uuid DEFAULT NULL::uuid, p_related_concept_ids uuid[] DEFAULT NULL::uuid[], p_additional_testing_angles text[] DEFAULT NULL::text[])
 RETURNS questions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  perform public.m116_legacy_question(p_question_id,p_accepted_answers);
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
$function$;

CREATE OR REPLACE FUNCTION public.append_concept_version_snapshot(p_concept_id uuid, p_created_by uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    body_markdown, body_format,
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
    c.body_markdown, c.body_format,
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
$function$;

CREATE OR REPLACE FUNCTION public.append_question_version_snapshot(p_question_id uuid, p_created_by uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    question_type, prompt, prompt_format, explanation, difficulty, testing_angle, sort_order,
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
    q.prompt, q.prompt_format,
    q.explanation,
    q.difficulty,
    q.testing_angle,
    q.sort_order,
    q.review_article_concept_id,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'accepted_answer_id', qaa.id,
        'answer_text', qaa.answer_text,
        'answer_format', qaa.answer_format,
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
$function$;

CREATE OR REPLACE FUNCTION public.m114_save(p_library uuid, p_concept uuid, p_draft uuid, p_expected_version uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); d public.concept_media_drafts; c public.concepts; a public.media_assets;
 item jsonb; manifest jsonb; ids uuid[]; manifest_ids uuid[]; asset_ids uuid[]; asset uuid; op public.media_service_operations;
 digest text; result jsonb; target uuid; version uuid; requested_reservation uuid;
begin
 perform public.m114_author(actor,p_library);
 perform public.m116_format(coalesce(p_payload->>'p_body_format','legacy'));
 if coalesce(p_payload->>'p_body_format','legacy')='legacy' then perform public.m116_legacy_concept(p_concept); end if;
 if jsonb_typeof(p_payload)<>'object' or (p_payload->>'p_active_library_id')::uuid is distinct from p_library then raise exception 'Invalid Concept save context'; end if;
 manifest:=p_payload->'placements';
 if jsonb_typeof(manifest) is distinct from 'array' then raise exception 'Complete image manifest required'; end if;
 ids:=public.m114_tokens(p_payload->>'p_body_markdown');
 select coalesce(array_agg((value->>'placementId')::uuid order by ord),'{}'::uuid[]) into manifest_ids from jsonb_array_elements(manifest) with ordinality entries(value,ord);
 if ids is distinct from manifest_ids then raise exception 'Image token order differs from manifest'; end if;
 digest:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
 if p_concept is null then
  select * into d from public.concept_media_drafts where id=p_draft for update;
  if not found or d.author_id is distinct from actor or d.library_id is distinct from p_library then raise exception 'Draft denied' using errcode='42501'; end if;
  if d.state='consumed' then
   if d.save_digest is distinct from digest then raise exception 'Consumed draft payload differs' using errcode='40001'; end if;
   return public.m114_receipt(d.bound_concept_id,d.bound_version_id,p_payload);
  end if;
  if d.state<>'open' or d.expires_at<=clock_timestamp() or p_expected_version is not null then raise exception 'Draft expired or closed' using errcode='40001'; end if;
  perform 1 from public.media_service_operations where target_kind='concept-draft' and target_id=d.id and operation_type='upload' order by id for update;
  if exists(select 1 from public.media_service_operations where target_kind='concept-draft' and target_id=d.id and operation_type='upload' and state not in ('complete','cancelled')) then raise exception 'Finish or cancel pending image uploads'; end if;
 else
  if p_draft is not null then raise exception 'Existing Concept cannot consume a new draft'; end if;
  perform public.m113_actor_target(actor,p_library,'concept',p_concept);
  select * into c from public.concepts where id=p_concept for update;
  if not found or c.current_version_id is distinct from p_expected_version then raise exception 'Concept changed; reload before saving' using errcode='40001'; end if;
  if p_payload?'p_body_format' and c.updated_at is distinct from (p_payload->>'p_expected_updated_at')::timestamptz then raise exception 'Concept changed; reload before saving' using errcode='40001'; end if;
  perform 1 from public.media_service_operations where id in (select (value->>'reservationId')::uuid from jsonb_array_elements(manifest) where value->>'reservationId' is not null) order by id for update;
 end if;
 select coalesce(array_agg(distinct (value->>'assetId')::uuid order by (value->>'assetId')::uuid),'{}'::uuid[]) into asset_ids from jsonb_array_elements(manifest);
 foreach asset in array asset_ids loop
  select * into a from public.media_assets where id=asset for update;
  if not found or a.library_id<>p_library or a.scope<>'official' or a.state<>'ready' then raise exception 'Ready authorized asset required' using errcode='42501'; end if;
 end loop;
 for item in select value from jsonb_array_elements(manifest) with ordinality e(value,ord) order by ord loop
  if coalesce(length(btrim(item->>'altText')),0) not between 1 and 2000 or length(coalesce(item->>'caption',''))>4000 then raise exception 'Required image text is invalid'; end if;
  if exists(select 1 from public.content_media_placements where id=(item->>'placementId')::uuid and concept_id is distinct from p_concept) then raise exception 'Placement identity belongs to other content' using errcode='42501'; end if;
  -- Retained placements are authorized by the actual saved Concept. New assets
  -- require this author's exact reservation, never a guessed ready asset UUID.
  if p_concept is not null and exists(select 1 from public.content_media_placements where id=(item->>'placementId')::uuid and concept_id=p_concept and asset_id=(item->>'assetId')::uuid) then continue; end if;
  requested_reservation:=nullif(item->>'reservationId','')::uuid;
  select * into op from public.media_service_operations where id=requested_reservation and operation_type='upload' and actor_id=actor and library_id=p_library and asset_id=(item->>'assetId')::uuid and state='complete' and cancelled_at is null and expires_at>clock_timestamp();
  if not found or (p_concept is null and (op.target_kind<>'concept-draft' or op.target_id<>d.id)) or (p_concept is not null and (op.target_kind<>'concept' or op.target_id<>p_concept)) then raise exception 'Image reservation denied' using errcode='42501'; end if;
  if not exists(select 1 from public.media_upload_sessions where asset_id=op.asset_id and actor_id=actor and expires_at>clock_timestamp()) then raise exception 'Image reservation expired'; end if;
 end loop;
 if p_concept is null then
  result:=public.save_concept_draft(null,p_payload->>'p_name',p_payload->>'p_body_markdown',p_library,array(select value::uuid from jsonb_array_elements_text(p_payload->'p_library_node_ids')),array[]::text[]);
  target:=(result->>'concept_id')::uuid;
 else target:=p_concept; end if;
 delete from public.content_media_placements where concept_id=target;
 insert into public.content_media_placements(id,asset_id,library_id,concept_id,surface,ordinal,alt_text,caption)
 select (value->>'placementId')::uuid,(value->>'assetId')::uuid,p_library,target,'concept',(ord-1)::integer,value->>'altText',nullif(value->>'caption','')
 from jsonb_array_elements(manifest) with ordinality e(value,ord) order by (value->>'assetId')::uuid,(value->>'placementId')::uuid;
 result:=public.m116_concept_with_prerequisites(target,p_payload->>'p_name',p_payload->>'p_body_markdown',p_library,
  array(select value::uuid from jsonb_array_elements_text(p_payload->'p_library_node_ids')),
  array(select value::uuid from jsonb_array_elements_text(p_payload->'p_tag_ids')),p_payload->>'p_status',p_payload->'p_references',p_payload->'p_prerequisites',coalesce(p_payload->>'p_body_format','legacy'));
 version:=(result->>'version_id')::uuid;
 if not exists(select 1 from public.concepts where id=target and current_version_id=version and body_markdown=p_payload->>'p_body_markdown') then raise exception 'Concept save readback differs'; end if;
 if p_concept is null then
  if (select count(*) from public.concept_versions where concept_id=target)<>1 then raise exception 'First save must create exactly one version'; end if;
  update public.concept_media_drafts set state='consumed',save_digest=digest,bound_concept_id=target,bound_version_id=version,closed_at=clock_timestamp() where id=d.id;
  perform public.m114_close_operations(d.id);
 end if;
 return result||public.m114_receipt(target,version,p_payload);
end $function$;

CREATE OR REPLACE FUNCTION public.m115_save(p_library uuid, p_question uuid, p_draft uuid, p_expected_version uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); d public.question_media_drafts; q public.questions; a public.media_assets;
 item jsonb; manifest jsonb; asset uuid; op public.media_service_operations; digest text; target uuid; version uuid; surface_name text; ord integer;
begin
 perform public.m115_author(actor,p_library);
 if jsonb_typeof(p_payload) is distinct from 'object' or (p_payload->>'p_active_library_id')::uuid is distinct from p_library or nullif(p_payload->>'p_question_id','')::uuid is distinct from p_question then raise exception 'Invalid Question save context'; end if;
 if jsonb_typeof(p_payload->'front') is distinct from 'array' or jsonb_typeof(p_payload->'answer') is distinct from 'array' then raise exception 'Complete Front and Answer manifests required'; end if;
 digest:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
 select * into d from public.question_media_drafts where id=p_draft for update;
 if not found or row(d.author_id,d.library_id,d.question_id,d.expected_version_id) is distinct from row(actor,p_library,p_question,p_expected_version) then raise exception 'Draft denied' using errcode='42501'; end if;
 if d.state='consumed' then
  if d.save_digest is distinct from digest then raise exception 'Consumed draft payload differs' using errcode='40001'; end if;
  if exists(select 1 from public.questions where id=d.bound_question_id) then perform public.m113_actor_target(actor,p_library,'question',d.bound_question_id); end if;
  return public.m115_receipt(d.bound_question_id,d.bound_version_id);
 end if;
 if d.state<>'open' or d.expires_at<=clock_timestamp() then raise exception 'Draft expired or closed' using errcode='40001'; end if;
 if p_payload?'p_prompt_format' then
  perform public.m116_question_context(p_library,p_payload,p_expected_version,(p_payload->>'p_expected_updated_at')::timestamptz);
 else perform public.m116_legacy_question(p_question,p_payload->'p_accepted_answers'); end if;
 if p_question is not null then
  select * into q from public.questions where id=p_question for update;
  if not found then return jsonb_build_object('terminal',true,'id',p_question); end if;
  perform public.m113_actor_target(actor,p_library,'question',p_question);
  if q.current_version_id is distinct from p_expected_version then raise exception 'Question changed; reload before saving' using errcode='40001'; end if;
  if row(q.difficulty,q.status) is distinct from row(p_payload->>'p_difficulty',p_payload->>'p_status') then raise exception 'Loaded compatibility metadata must be preserved'; end if;
 else
  if p_expected_version is not null or p_payload->>'p_difficulty' is distinct from 'medium' or p_payload->>'p_status' is distinct from 'published' then raise exception 'Invalid new Question defaults'; end if;
  perform public.m113_actor_target(actor,p_library,'concept',(p_payload->>'p_concept_id')::uuid);
 end if;
 if p_payload->>'p_question_type' is distinct from 'short_answer' or coalesce(length(btrim(p_payload->>'p_prompt')),0)=0 or jsonb_typeof(p_payload->'p_accepted_answers') is distinct from 'array' or jsonb_array_length(p_payload->'p_accepted_answers')<>1 or coalesce(length(btrim(p_payload->'p_accepted_answers'->0->>'answer_text')),0)=0 then raise exception 'Question and Answer are required'; end if;
 manifest:=(p_payload->'front')||(p_payload->'answer');
 if (select count(distinct value->>'placementId') from jsonb_array_elements(manifest))<>jsonb_array_length(manifest) then raise exception 'Duplicate image placement'; end if;
 foreach surface_name in array array['front','answer'] loop
  ord:=0;
  for item in select value from jsonb_array_elements(p_payload->surface_name) loop
   if item->>'surface' is distinct from surface_name or (item->>'ordinal')::integer is distinct from ord or item->>'placementId' is null or item->>'assetId' is null then raise exception 'Invalid image surface/order/identity'; end if;
   if jsonb_typeof(item->'altText') is distinct from 'string' or length(btrim(item->>'altText')) not between 1 and 2000 or jsonb_typeof(item->'caption') is distinct from 'string' or length(item->>'caption')>4000 then raise exception 'Required image text is invalid'; end if;
   ord:=ord+1;
  end loop;
 end loop;
 perform 1 from public.media_service_operations where target_kind='question-draft' and target_id=d.id and operation_type='upload' order by id for update;
 if exists(select 1 from public.media_service_operations where target_kind='question-draft' and target_id=d.id and operation_type='upload' and state not in ('complete','cancelled')) then raise exception 'Finish or cancel pending image uploads'; end if;
 for asset in select distinct (value->>'assetId')::uuid from jsonb_array_elements(manifest) order by 1 loop
  select * into a from public.media_assets where id=asset for update;
  if not found or a.library_id<>p_library or a.scope<>'official' or a.state<>'ready' then raise exception 'Ready authorized asset required' using errcode='42501'; end if;
 end loop;
 for item in select value from jsonb_array_elements(manifest) loop
  if exists(select 1 from public.content_media_placements where id=(item->>'placementId')::uuid and (question_id is distinct from p_question or surface<>item->>'surface')) then raise exception 'Placement belongs to another target/surface' using errcode='42501'; end if;
  if p_question is not null and exists(select 1 from public.content_media_placements where id=(item->>'placementId')::uuid and question_id=p_question and surface=item->>'surface' and asset_id=(item->>'assetId')::uuid) then continue; end if;
  select * into op from public.media_service_operations where id=nullif(item->>'reservationId','')::uuid and operation_type='upload' and actor_id=actor and library_id=p_library and target_kind='question-draft' and target_id=d.id and asset_id=(item->>'assetId')::uuid and state='complete' and cancelled_at is null and expires_at>clock_timestamp();
  if not found or not exists(select 1 from public.media_upload_sessions where asset_id=op.asset_id and actor_id=actor and expires_at>clock_timestamp()) then raise exception 'Image reservation denied' using errcode='42501'; end if;
 end loop;
 if p_question is null then
  q:=public.create_question((p_payload->>'p_concept_id')::uuid,p_payload->>'p_question_type',p_payload->>'p_prompt',p_payload->>'p_explanation',nullif(p_payload->>'p_review_article_concept_id','')::uuid,(p_payload->>'p_sort_order')::integer,p_payload->>'p_difficulty',p_payload->>'p_testing_angle');
  target:=q.id;
 else target:=p_question; end if;
 delete from public.content_media_placements where question_id=target;
 insert into public.content_media_placements(id,asset_id,library_id,question_id,surface,ordinal,alt_text,caption)
 select (value->>'placementId')::uuid,(value->>'assetId')::uuid,p_library,target,value->>'surface',(value->>'ordinal')::integer,value->>'altText',nullif(value->>'caption','')
 from jsonb_array_elements(manifest) order by (value->>'assetId')::uuid,(value->>'placementId')::uuid;
 q:=public.m116_question_save_core(target,(p_payload->>'p_concept_id')::uuid,p_payload->>'p_question_type',p_payload->>'p_prompt',p_payload->>'p_explanation',p_payload->>'p_status',nullif(p_payload->>'p_review_article_concept_id','')::uuid,(p_payload->>'p_sort_order')::integer,p_payload->>'p_difficulty',p_payload->>'p_testing_angle',p_payload->'p_accepted_answers',nullif(p_payload->'p_options','null'::jsonb),
  case when jsonb_typeof(p_payload->'p_source_ids')='array' then array(select value::uuid from jsonb_array_elements_text(p_payload->'p_source_ids')) end,
  array(select value::uuid from jsonb_array_elements_text(p_payload->'p_tag_ids')),p_library,
  case when jsonb_typeof(p_payload->'p_related_concept_ids')='array' then array(select value::uuid from jsonb_array_elements_text(p_payload->'p_related_concept_ids')) end,
  case when jsonb_typeof(p_payload->'p_additional_testing_angles')='array' then array(select value from jsonb_array_elements_text(p_payload->'p_additional_testing_angles')) end,coalesce(p_payload->>'p_prompt_format','legacy'));
 version:=q.current_version_id;
 if version is null or q.prompt is distinct from p_payload->>'p_prompt' or not exists(select 1 from public.question_accepted_answers where question_id=target and answer_text=p_payload->'p_accepted_answers'->0->>'answer_text') then raise exception 'Question save readback differs'; end if;
 if p_question is null and (select count(*) from public.question_versions where question_id=target)<>1 then raise exception 'First save must create exactly one version'; end if;
 if (select count(*) from public.media_version_references where question_version_id=version)<>jsonb_array_length(manifest) then raise exception 'Version media differs'; end if;
 update public.question_media_drafts set state='consumed',save_digest=digest,bound_question_id=target,bound_version_id=version,closed_at=clock_timestamp() where id=d.id;
 perform public.m115_close_operations(d.id);
 return public.m115_receipt(target,version);
end $function$;

CREATE OR REPLACE FUNCTION public.m114_manifest(p_actor uuid, p_library uuid, p_concept uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.concepts; media jsonb;
begin
 perform set_config('request.jwt.claim.sub',coalesce(p_actor::text,''),true);
 select * into c from public.concepts where id=p_concept;
 if c.id is null or not public.m112_library_access(p_library)
 or (not public.is_editor_or_admin() and c.status<>'published')
 or not exists(select 1 from public.concept_placements cp join public.library_nodes n on n.id=cp.library_node_id where cp.concept_id=c.id and n.library_id=p_library)
 or exists(select 1 from public.concept_placements cp join public.library_nodes n on n.id=cp.library_node_id where cp.concept_id=c.id and n.library_id<>p_library)
 then raise exception 'Concept media read denied' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('placementId',p.id,'assetId',p.asset_id,'ordinal',p.ordinal,'altText',p.alt_text,'caption',coalesce(p.caption,''),'mime',a.mime_type,'width',a.width,'height',a.height,'sha256',a.sha256) order by p.ordinal),'[]') into media
 from public.content_media_placements p join public.media_assets a on a.id=p.asset_id where p.concept_id=c.id and p.library_id=p_library and a.state='ready' and a.scope='official';
 return jsonb_build_object('conceptId',c.id,'versionId',c.current_version_id,'bodyMarkdown',c.body_markdown,'body_format',c.body_format,'updated_at',c.updated_at,'placements',media);
end $function$;

CREATE OR REPLACE FUNCTION public.m114_receipt(p_concept uuid, p_version uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.concept_versions; refs jsonb; media jsonb;
begin
 select * into v from public.concept_versions where id=p_version and concept_id=p_concept;
 if not found or not exists(select 1 from public.concepts where id=p_concept) then return jsonb_build_object('terminal',true,'concept_id',p_concept,'version_id',p_version); end if;
 select coalesce(jsonb_agg(jsonb_build_object('client_id',r->>'client_id','source_id',s->>'source_id','attribution_id',s->>'attribution_id')),'[]') into refs
 from jsonb_array_elements(coalesce(p_payload->'p_references','[]')) r
 join lateral jsonb_array_elements(v.sources_snapshot) s on
  (nullif(r->>'source_id','') is not null and s->>'source_id'=r->>'source_id') or
  (nullif(r->>'source_id','') is null and s->>'source_key'='concept-reference:'||p_concept::text||':'||btrim(r->>'client_id'));
 if jsonb_array_length(refs)<>jsonb_array_length(coalesce(p_payload->'p_references','[]')) then raise exception 'Reference receipt unavailable'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('placementId',r.placement_id,'assetId',r.asset_id,'ordinal',r.ordinal,'altText',r.alt_text,'caption',coalesce(r.caption,''),'mime',a.mime_type,'width',a.width,'height',a.height,'sha256',a.sha256) order by r.ordinal),'[]') into media
 from public.media_version_references r join public.media_assets a on a.id=r.asset_id where r.concept_version_id=p_version;
 return jsonb_build_object('concept_id',p_concept,'version_id',p_version,'references',refs,'placements',media,'bodyMarkdown',v.body_markdown,'body_format',v.body_format,'updated_at',(select updated_at from public.concepts where id=p_concept));
end $function$;

CREATE OR REPLACE FUNCTION public.m115_manifest(p_actor uuid, p_library uuid, p_question uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare q public.questions; media jsonb; answer text; answer_format text;
begin
 perform 1 from public.questions where id=p_question for share;
 q:=public.m115_read_target(p_actor,p_library,p_question);
 select a.answer_text,a.answer_format into answer,answer_format from public.question_accepted_answers a where question_id=q.id order by sort_order,id limit 1;
 select coalesce(jsonb_agg(jsonb_build_object('placementId',p.id,'assetId',p.asset_id,'surface',p.surface,'ordinal',p.ordinal,'altText',p.alt_text,'caption',coalesce(p.caption,''),'mime',a.mime_type,'width',a.width,'height',a.height,'sha256',a.sha256) order by p.surface,p.ordinal),'[]') into media
 from public.content_media_placements p join public.media_assets a on a.id=p.asset_id where p.question_id=q.id and p.library_id=p_library and a.state='ready' and a.scope='official';
 return jsonb_build_object('questionId',q.id,'versionId',q.current_version_id,'libraryId',p_library,'prompt',q.prompt,'answer',coalesce(answer,''),'placements',media,'prompt_format',q.prompt_format,'answer_format',coalesce(answer_format,'legacy'),'updated_at',q.updated_at);
end $function$;

CREATE OR REPLACE FUNCTION public.m115_receipt(p_question uuid, p_version uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.question_versions; media jsonb; current_version uuid; answer text; answer_format text;
begin
 select * into v from public.question_versions where id=p_version and question_id=p_question;
 if not found or not exists(select 1 from public.questions where id=p_question) then return jsonb_build_object('terminal',true,'id',p_question,'current_version_id',p_version); end if;
 select current_version_id into current_version from public.questions where id=p_question;
 select a->>'answer_text',coalesce(a->>'answer_format','legacy') into answer,answer_format from jsonb_array_elements(v.accepted_answers_snapshot) a order by (a->>'sort_order')::integer,a->>'id' limit 1;
 select coalesce(jsonb_agg(jsonb_build_object('placementId',r.placement_id,'assetId',r.asset_id,'surface',r.surface,'ordinal',r.ordinal,'altText',r.alt_text,'caption',coalesce(r.caption,''),'mime',a.mime_type,'width',a.width,'height',a.height,'sha256',a.sha256) order by r.surface,r.ordinal),'[]') into media
 from public.media_version_references r join public.media_assets a on a.id=r.asset_id where r.question_version_id=p_version;
 return jsonb_build_object('id',p_question,'current_version_id',p_version,'superseded',current_version is distinct from p_version,'prompt',v.prompt,'answer',coalesce(answer,''),'placements',media,'prompt_format',v.prompt_format,'answer_format',coalesce(answer_format,'legacy'),'updated_at',(select updated_at from public.questions where id=p_question));
end $function$;

CREATE OR REPLACE FUNCTION public.select_next_study_question_hardened(p_study_session_id uuid, p_include_debug boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_user_id uuid := (select auth.uid());
  target_session public.study_sessions%rowtype;
  selection_result jsonb;
begin
  if current_user_id is null or not public.has_socrates_role() then
    raise exception 'Not authorized to select a study question.';
  end if;

  select session_row.*
  into target_session
  from public.study_sessions session_row
  where session_row.id = p_study_session_id
    and session_row.user_id = current_user_id
    and session_row.ended_at is null
  for share;

  if target_session.id is null then
    raise exception 'Active study session not found.';
  end if;

  if target_session.cram_mode then
    with
    cram_eligible_questions as (
      select
        question.id as question_id,
        question.concept_id,
        question.prompt, question.prompt_format, question.current_version_id,
        question.difficulty,
        question.testing_angle,
        lower(btrim(question.testing_angle)) as normalized_angle,
        question.sort_order,
        question.created_at,
        accepted.answer_text as accepted_answer, accepted.answer_format as accepted_answer_format
      from public.resolve_study_deck(target_session.study_deck_id) resolved
      join public.questions question
        on question.concept_id = resolved.concept_id
      join lateral (
        select answer.answer_text, answer.answer_format
        from public.question_accepted_answers answer
        where answer.question_id = question.id
        order by answer.sort_order, answer.id
        limit 1
      ) accepted on true
      where question.status = 'published'
        and question.question_type = 'short_answer'
    ),
    cram_eligible_angles as (
      select distinct
        question.concept_id,
        question.normalized_angle
      from cram_eligible_questions question
    ),
    cram_angle_state_rollup as (
      select
        angle_state.concept_id,
        lower(btrim(angle_state.testing_angle)) as normalized_angle,
        sum(angle_state.evidence_count) as evidence_count,
        max(angle_state.last_exposure_at) as last_exposure_at
      from public.user_concept_testing_angle_state angle_state
      where angle_state.user_id = current_user_id
      group by
        angle_state.concept_id,
        lower(btrim(angle_state.testing_angle))
    ),
    cram_angle_state_latest as (
      select distinct on (
        angle_state.concept_id,
        lower(btrim(angle_state.testing_angle))
      )
        angle_state.concept_id,
        lower(btrim(angle_state.testing_angle)) as normalized_angle,
        angle_state.last_result
      from public.user_concept_testing_angle_state angle_state
      where angle_state.user_id = current_user_id
      order by
        angle_state.concept_id,
        lower(btrim(angle_state.testing_angle)),
        angle_state.last_exposure_at desc,
        angle_state.updated_at desc,
        angle_state.testing_angle
    ),
    cram_angle_needs as (
      select
        angle.concept_id,
        angle.normalized_angle,
        case
          when rollup.evidence_count is null then 1::double precision
          else
            0.70::double precision / (1 + rollup.evidence_count)
            + 0.20::double precision * (
                1 - exp(
                  -greatest(
                    0::double precision,
                    extract(epoch from (now() - rollup.last_exposure_at))
                      / 86400::double precision
                  ) / 14::double precision
                )
              )
            + 0.10::double precision * case latest.last_result
                when 'easy' then 0::double precision
                when 'average' then 0.25::double precision
                when 'hard' then 0.50::double precision
                when 'didnt_know' then 1::double precision
                when 'forgot' then 0.90::double precision
                when 'too_hard' then 0.60::double precision
                else 0::double precision
              end
        end as angle_need
      from cram_eligible_angles angle
      left join cram_angle_state_rollup rollup
        on rollup.concept_id = angle.concept_id
       and rollup.normalized_angle = angle.normalized_angle
      left join cram_angle_state_latest latest
        on latest.concept_id = angle.concept_id
       and latest.normalized_angle = angle.normalized_angle
    ),
    cram_concepts as (
      select distinct question.concept_id
      from cram_eligible_questions question
    ),
    cram_concept_inputs as (
      select
        concept.concept_id,
        mastery.mastery_estimate::double precision as mastery_estimate,
        mastery.retrievability::double precision as stored_retrievability,
        mastery.stability::double precision as stability,
        mastery.uncertainty::double precision as uncertainty,
        mastery.last_exposure_at,
        (mastery.concept_id is null) as is_unseen
      from cram_concepts concept
      left join public.user_concept_mastery mastery
        on mastery.user_id = current_user_id
       and mastery.concept_id = concept.concept_id
    ),
    cram_concept_metrics as (
      select
        input.*,
        case
          when input.is_unseen then null::double precision
          else input.stored_retrievability * exp(
            -greatest(
              0::double precision,
              extract(epoch from (now() - input.last_exposure_at))
                / 86400::double precision
            ) / (1::double precision + 29::double precision * input.stability)
          )
        end as live_retrievability
      from cram_concept_inputs input
    ),
    cram_concept_scores as (
      select
        metric.*,
        case
          when metric.is_unseen then 0.85::double precision
          else
            0.55::double precision
              * (1::double precision - metric.mastery_estimate)
            + 0.30::double precision
              * (1::double precision - metric.live_retrievability)
            + 0.15::double precision * metric.uncertainty
        end as cram_need
      from cram_concept_metrics metric
    ),
    cram_question_history as (
      select
        question.question_id,
        count(attempt.id) filter (
          where attempt.study_session_id = target_session.id
        )::integer as session_attempt_count,
        max(attempt.created_at) as last_attempt_at
      from cram_eligible_questions question
      left join public.review_attempts attempt
        on attempt.question_id = question.question_id
       and attempt.user_id = current_user_id
       and attempt.created_at > coalesce(
         public.get_concept_study_reset_at(
           current_user_id,
           question.concept_id
         ),
         '-infinity'::timestamptz
       )
      group by question.question_id
    ),
    cram_traversal as (
      select min(history.session_attempt_count) as minimum_attempt_count
      from cram_question_history history
    ),
    cram_ranked_questions as (
      select
        question.*,
        concept.is_unseen,
        concept.mastery_estimate,
        concept.cram_need,
        angle.angle_need,
        history.session_attempt_count,
        history.last_attempt_at,
        traversal.minimum_attempt_count,
        abs(
          case question.difficulty
            when 'easy' then 0
            when 'medium' then 1
            when 'hard' then 2
          end
          -
          case
            when concept.is_unseen then 1
            when concept.mastery_estimate < 0.40::double precision then 0
            when concept.mastery_estimate <= 0.75::double precision then 1
            else 2
          end
        ) as difficulty_distance
      from cram_eligible_questions question
      join cram_concept_scores concept
        on concept.concept_id = question.concept_id
      join cram_angle_needs angle
        on angle.concept_id = question.concept_id
       and angle.normalized_angle = question.normalized_angle
      join cram_question_history history
        on history.question_id = question.question_id
      cross join cram_traversal traversal
      where history.session_attempt_count = traversal.minimum_attempt_count
    ),
    cram_selected_question as (
      select ranked.*
      from cram_ranked_questions ranked
      order by
        ranked.cram_need desc,
        ranked.angle_need desc,
        ranked.difficulty_distance,
        ranked.last_attempt_at asc nulls first,
        ranked.sort_order,
        ranked.created_at,
        ranked.question_id
      limit 1
    )
    select
      jsonb_build_object(
        'question_id', selected.question_id,
        'concept_id', selected.concept_id,
        'testing_angle', selected.testing_angle,
        'prompt', selected.prompt,
        'prompt_format', selected.prompt_format, 'answer_format', selected.accepted_answer_format, 'question_version_id', selected.current_version_id,
        'accepted_answer', selected.accepted_answer,
        'difficulty', selected.difficulty
      )
      || case
        when coalesce(p_include_debug, false) then jsonb_build_object(
          'cram_mode', true,
          'cram_traversal_minimum_count', selected.minimum_attempt_count,
          'selected_question_session_count', selected.session_attempt_count,
          'selected_concept_cram_need', selected.cram_need,
          'selected_angle_need', selected.angle_need,
          'selection_reason', 'cram_mastery_need'
        )
        else '{}'::jsonb
      end
    into selection_result
    from cram_selected_question selected;

    return selection_result;
  end if;

  with recursive
  effective_deck_concepts as (
    select resolved.*
    from public.resolve_study_deck(target_session.study_deck_id) resolved
  ),
  eligible_concepts as (
    select
      resolved.concept_id,
      resolved.selection_source
    from effective_deck_concepts resolved
    where exists (
      select 1
      from public.questions eligible_question
      where eligible_question.concept_id = resolved.concept_id
        and eligible_question.status = 'published'
        and eligible_question.question_type = 'short_answer'
        and exists (
          select 1
          from public.question_accepted_answers eligible_answer
          where eligible_answer.question_id = eligible_question.id
        )
    )
  ),
  direct_prerequisite_concepts as (
    select distinct
      downstream.concept_id as downstream_concept_id,
      edge.prerequisite_concept_id as prerequisite_concept_id,
      edge.strength
    from eligible_concepts downstream
    join public.concept_prerequisites edge
      on edge.concept_id = downstream.concept_id
     and edge.prerequisite_concept_id is not null
    join effective_deck_concepts effective
      on effective.concept_id = edge.prerequisite_concept_id
    join public.concepts prerequisite
      on prerequisite.id = edge.prerequisite_concept_id
     and prerequisite.status = 'published'
    where edge.prerequisite_concept_id <> downstream.concept_id
      and exists (
        select 1
        from public.concept_placements placement
        join public.library_nodes node
          on node.id = placement.library_node_id
        where placement.concept_id = edge.prerequisite_concept_id
          and node.library_id = target_session.library_id
      )
  ),
  prerequisite_topic_nodes as (
    select
      downstream.concept_id as downstream_concept_id,
      edge.prerequisite_library_node_id as prerequisite_root_node_id,
      edge.prerequisite_library_node_id as node_id,
      edge.strength
    from eligible_concepts downstream
    join public.concept_prerequisites edge
      on edge.concept_id = downstream.concept_id
     and edge.prerequisite_library_node_id is not null
    join public.library_nodes prerequisite_root
      on prerequisite_root.id = edge.prerequisite_library_node_id
     and prerequisite_root.library_id = target_session.library_id

    union

    select
      topic.downstream_concept_id,
      topic.prerequisite_root_node_id,
      child.id,
      topic.strength
    from prerequisite_topic_nodes topic
    join public.library_nodes child
      on child.parent_id = topic.node_id
     and child.library_id = target_session.library_id
  ),
  topic_prerequisite_concepts as (
    select distinct
      topic.downstream_concept_id,
      placement.concept_id as prerequisite_concept_id,
      topic.strength
    from prerequisite_topic_nodes topic
    join public.concept_placements placement
      on placement.library_node_id = topic.node_id
    join public.concepts prerequisite
      on prerequisite.id = placement.concept_id
     and prerequisite.status = 'published'
    join effective_deck_concepts effective
      on effective.concept_id = placement.concept_id
    where placement.concept_id <> topic.downstream_concept_id
  ),
  qualifying_prerequisite_concepts as (
    select
      direct.downstream_concept_id,
      direct.prerequisite_concept_id,
      direct.strength
    from direct_prerequisite_concepts direct

    union

    select
      topic.downstream_concept_id,
      topic.prerequisite_concept_id,
      topic.strength
    from topic_prerequisite_concepts topic
  ),
  prerequisite_priority_components as (
    select
      qualifying.downstream_concept_id as concept_id,
      least(
        0.12::double precision,
        max(
          case qualifying.strength
            when 'required' then 0.12::double precision
            when 'recommended' then 0.06::double precision
          end
          * greatest(
              0::double precision,
              (
                0.75::double precision
                  - coalesce(mastery.mastery_estimate, 0)::double precision
              ) / 0.75::double precision
            )
        )
      ) as prerequisite_priority_component
    from qualifying_prerequisite_concepts qualifying
    left join public.user_concept_mastery mastery
      on mastery.user_id = current_user_id
     and mastery.concept_id = qualifying.prerequisite_concept_id
    group by qualifying.downstream_concept_id
  ),
  selected_node_ids as (
    select selected_node.value::uuid as selected_node_id
    from jsonb_array_elements_text(
      coalesce(
        target_session.selection_snapshot -> 'selected_node_ids',
        '[]'::jsonb
      )
    ) selected_node(value)
  ),
  selected_subtrees as (
    select
      selected.selected_node_id,
      selected.selected_node_id as node_id
    from selected_node_ids selected

    union all

    select
      subtree.selected_node_id,
      child.id
    from selected_subtrees subtree
    join public.library_nodes child
      on child.parent_id = subtree.node_id
     and child.library_id = target_session.library_id
  ),
  selected_node_descendants as (
    select distinct
      ancestry.selected_node_id as ancestor_selected_node_id,
      selected.selected_node_id as descendant_selected_node_id
    from selected_subtrees ancestry
    join selected_node_ids selected
      on selected.selected_node_id = ancestry.node_id
    where selected.selected_node_id <> ancestry.selected_node_id
  ),
  covering_selected_nodes as (
    select distinct
      eligible.concept_id,
      subtree.selected_node_id,
      coalesce(
        nullif(
          target_session.selection_snapshot
            -> 'node_preferences'
            ->> subtree.selected_node_id::text,
          ''
        )::numeric,
        50::numeric
      ) as branch_balance
    from eligible_concepts eligible
    join public.concept_placements placement
      on placement.concept_id = eligible.concept_id
    join selected_subtrees subtree
      on subtree.node_id = placement.library_node_id
  ),
  suppressed_selected_nodes as materialized (
    select distinct more_specific.concept_id,
      descendant.ancestor_selected_node_id as selected_node_id
    from selected_node_descendants descendant
    join covering_selected_nodes more_specific
      on more_specific.selected_node_id = descendant.descendant_selected_node_id
  ),
  most_specific_selected_nodes as (
    select covering.*
    from covering_selected_nodes covering
    left join suppressed_selected_nodes suppressed
      on suppressed.concept_id = covering.concept_id
     and suppressed.selected_node_id = covering.selected_node_id
    where suppressed.concept_id is null
  ),
  concept_balances as (
    select
      eligible.concept_id,
      eligible.selection_source,
      coalesce(avg(specific.branch_balance), 50::numeric) as branch_balance
    from eligible_concepts eligible
    left join most_specific_selected_nodes specific
      on specific.concept_id = eligible.concept_id
    group by eligible.concept_id, eligible.selection_source
  ),
  -- Keep the Library-wide Question pass narrow. The prior implementation
  -- materialized prompt/answer/difficulty payloads for every eligible Question
  -- before the winning Concept was known. These axes are the only Question
  -- fields needed to rank Concepts and Testing Angles.
  eligible_question_axes as (
    select
      question.id as question_id,
      question.concept_id,
      lower(btrim(question.testing_angle)) as normalized_angle,
      question.sort_order,
      question.created_at
    from public.questions question
    join concept_balances balance
      on balance.concept_id = question.concept_id
    where question.status = 'published'
      and question.question_type = 'short_answer'
      and exists (
        select 1
        from public.question_accepted_answers answer
        where answer.question_id = question.id
      )
  ),
  eligible_angles as (
    select distinct
      question.concept_id,
      question.normalized_angle
    from eligible_question_axes question
  ),
  angle_state_rollup as (
    select
      angle_state.concept_id,
      lower(btrim(angle_state.testing_angle)) as normalized_angle,
      sum(angle_state.evidence_count)::integer as evidence_count,
      max(angle_state.last_exposure_at) as last_exposure_at
    from public.user_concept_testing_angle_state angle_state
    where angle_state.user_id = current_user_id
    group by
      angle_state.concept_id,
      lower(btrim(angle_state.testing_angle))
  ),
  angle_state_latest as (
    select distinct on (
      angle_state.concept_id,
      lower(btrim(angle_state.testing_angle))
    )
      angle_state.concept_id,
      lower(btrim(angle_state.testing_angle)) as normalized_angle,
      angle_state.last_result
    from public.user_concept_testing_angle_state angle_state
    where angle_state.user_id = current_user_id
    order by
      angle_state.concept_id,
      lower(btrim(angle_state.testing_angle)),
      angle_state.last_exposure_at desc,
      angle_state.updated_at desc,
      angle_state.testing_angle
  ),
  angle_needs as (
    select
      angle.concept_id,
      angle.normalized_angle,
      case
        when rollup.evidence_count is null then 1::double precision
        else
          0.70::double precision / (1 + rollup.evidence_count)
          + 0.20::double precision * (
              1 - exp(
                -greatest(
                  0::double precision,
                  extract(epoch from (now() - rollup.last_exposure_at))
                    / 86400::double precision
                ) / 14::double precision
              )
            )
          + 0.10::double precision * case latest.last_result
              when 'easy' then 0::double precision
              when 'average' then 0.25::double precision
              when 'hard' then 0.50::double precision
              when 'didnt_know' then 1::double precision
              when 'forgot' then 0.90::double precision
              when 'too_hard' then 0.60::double precision
              else 0::double precision
            end
      end as angle_need
    from eligible_angles angle
    left join angle_state_rollup rollup
      on rollup.concept_id = angle.concept_id
     and rollup.normalized_angle = angle.normalized_angle
    left join angle_state_latest latest
      on latest.concept_id = angle.concept_id
     and latest.normalized_angle = angle.normalized_angle
  ),
  preferred_angles as (
    select distinct on (angle.concept_id)
      angle.concept_id,
      angle.normalized_angle,
      angle.angle_need
    from angle_needs angle
    order by
      angle.concept_id,
      angle.angle_need desc,
      angle.normalized_angle
  ),
  session_position as (
    select coalesce(max(attempt.sequence_position), 0) as latest_position
    from public.review_attempts attempt
    where attempt.study_session_id = target_session.id
      and attempt.user_id = current_user_id
  ),
  recent_concepts as (
    select
      attempt.concept_id,
      max(attempt.sequence_position) as latest_position
    from public.review_attempts attempt
    where attempt.study_session_id = target_session.id
      and attempt.user_id = current_user_id
      and attempt.concept_id is not null
    group by attempt.concept_id
  ),
  recent_history_attempts as (
    select
      balance.concept_id,
      history.id as attempt_id,
      history.result,
      history.created_at,
      row_number() over (
        partition by balance.concept_id
        order by history.created_at, history.id
      )::integer as history_position,
      greatest(
        0::double precision,
        1::double precision
          - greatest(
              0::double precision,
              extract(epoch from (now() - history.created_at))
            ) / 3888000::double precision
      ) as age_weight
    from concept_balances balance
    join lateral (
      select
        attempt.id,
        attempt.result,
        attempt.created_at
      from public.review_attempts attempt
      where attempt.user_id = current_user_id
        and attempt.concept_id = balance.concept_id
        and attempt.created_at > coalesce(
          public.get_concept_study_reset_at(
            current_user_id,
            balance.concept_id
          ),
          '-infinity'::timestamptz
        )
        and attempt.created_at >= now() - interval '45 days'
      order by attempt.created_at desc, attempt.id desc
      limit 12
    ) history on true
  ),
  repeated_lapse_walk as (
    select
      attempt.concept_id,
      attempt.history_position,
      least(
        3::double precision,
        greatest(
          0::double precision,
          case attempt.result
            when 'forgot' then attempt.age_weight
            when 'easy' then -1.00::double precision * attempt.age_weight
            when 'average' then -0.75::double precision * attempt.age_weight
            when 'hard' then -0.50::double precision * attempt.age_weight
            else 0::double precision
          end
        )
      ) as repeated_lapse_concern
    from recent_history_attempts attempt
    where attempt.history_position = 1

    union all

    select
      attempt.concept_id,
      attempt.history_position,
      least(
        3::double precision,
        greatest(
          0::double precision,
          walk.repeated_lapse_concern
            + case attempt.result
                when 'forgot' then attempt.age_weight
                when 'easy' then -1.00::double precision * attempt.age_weight
                when 'average' then -0.75::double precision * attempt.age_weight
                when 'hard' then -0.50::double precision * attempt.age_weight
                else 0::double precision
              end
        )
      ) as repeated_lapse_concern
    from repeated_lapse_walk walk
    join recent_history_attempts attempt
      on attempt.concept_id = walk.concept_id
     and attempt.history_position = walk.history_position + 1
  ),
  repeated_lapse_state as (
    select distinct on (walk.concept_id)
      walk.concept_id,
      walk.repeated_lapse_concern
    from repeated_lapse_walk walk
    order by walk.concept_id, walk.history_position desc
  ),
  eligible_concept_count as (
    select count(*)::integer as concept_count
    from concept_balances
  ),
  concept_inputs as (
    select
      balance.concept_id,
      balance.selection_source,
      balance.branch_balance::double precision as branch_balance,
      mastery.mastery_estimate::double precision as mastery_estimate,
      mastery.retrievability::double precision as stored_retrievability,
      mastery.stability::double precision as stability,
      mastery.uncertainty::double precision as uncertainty,
      mastery.last_exposure_at,
      mastery.last_result,
      coalesce(
        prerequisite.prerequisite_priority_component,
        0::double precision
      ) as prerequisite_priority_component,
      coalesce(history.repeated_lapse_concern, 0::double precision)
        as repeated_lapse_concern,
      (mastery.concept_id is null) as is_unseen,
      preferred.normalized_angle,
      preferred.angle_need,
      concept_count.concept_count,
      session.latest_position as session_latest_position,
      recent.latest_position as concept_latest_position
    from concept_balances balance
    join preferred_angles preferred
      on preferred.concept_id = balance.concept_id
    cross join eligible_concept_count concept_count
    cross join session_position session
    left join public.user_concept_mastery mastery
      on mastery.user_id = current_user_id
     and mastery.concept_id = balance.concept_id
    left join recent_concepts recent
      on recent.concept_id = balance.concept_id
    left join repeated_lapse_state history
      on history.concept_id = balance.concept_id
    left join prerequisite_priority_components prerequisite
      on prerequisite.concept_id = balance.concept_id
  ),
  concept_metrics as (
    select
      input.*,
      case
        when input.is_unseen then null::double precision
        else input.stored_retrievability * exp(
          -greatest(
            0::double precision,
            extract(epoch from (now() - input.last_exposure_at))
              / 86400::double precision
          ) / (1::double precision + 29::double precision * input.stability)
        )
      end as live_retrievability,
      case
        when not input.is_unseen and input.last_result = 'forgot' then
          greatest(
            0::double precision,
            1::double precision
              - greatest(
                  0::double precision,
                  extract(epoch from (now() - input.last_exposure_at))
                ) / 604800::double precision
          )
        else 0::double precision
      end as lapse_signal,
      least(
        1::double precision,
        greatest(
          0::double precision,
          (input.repeated_lapse_concern - 1::double precision)
            / 2::double precision
        )
      ) as repeated_lapse_signal,
      0.30::double precision
        + 0.20::double precision
          * (1::double precision - input.branch_balance / 100::double precision)
        as new_weight,
      0.30::double precision
        + 0.20::double precision
          * (input.branch_balance / 100::double precision)
        as review_weight,
      case
        when input.concept_count <= 1 then 0::double precision
        when input.concept_count = 2 then
          case
            when input.concept_latest_position = input.session_latest_position
              and input.session_latest_position > 0
              then 0.12::double precision
            else 0::double precision
          end
        else
          case
            when input.concept_latest_position = input.session_latest_position
              and input.session_latest_position > 0
              then 0.25::double precision
            when input.concept_latest_position >= input.session_latest_position - 2
              and input.session_latest_position > 0
              then 0.12::double precision
            when input.concept_latest_position >= input.session_latest_position - 5
              and input.session_latest_position > 0
              then 0.05::double precision
            else 0::double precision
          end
      end as recent_concept_penalty
    from concept_inputs input
  ),
  concept_needs as (
    select
      metric.*,
      case
        when metric.is_unseen then null::double precision
        else
          0.45::double precision * (1::double precision - metric.mastery_estimate)
          + 0.30::double precision * (
              1::double precision - metric.live_retrievability
            )
          + 0.15::double precision * metric.uncertainty
          + 0.10::double precision * (1::double precision - metric.stability)
      end as review_need
    from concept_metrics metric
  ),
  concept_scores as (
    select
      need.*,
      case
        when need.review_need is null then 0::double precision
        else least(
          1::double precision,
          greatest(
            0::double precision,
            (need.review_need - 0.75::double precision) / 0.25::double precision
          )
        )
      end as urgent_review,
      need.new_weight * case when need.is_unseen then 1 else 0 end
        as new_component,
      need.review_weight * coalesce(need.review_need, 0::double precision)
        as review_component,
      0.15::double precision * need.angle_need as angle_component
    from concept_needs need
  ),
  ranked_concepts as (
    select
      score.*,
      0.30::double precision * score.urgent_review as urgent_review_component,
      0.65::double precision * score.lapse_signal as lapse_priority_component,
      0.20::double precision * score.repeated_lapse_signal
        as repeated_lapse_priority_component,
      least(
        0.85::double precision,
        0.65::double precision * score.lapse_signal
          + 0.20::double precision * score.repeated_lapse_signal
      ) as combined_lapse_priority_component,
      score.new_component
        + score.review_component
        + score.angle_component
        + score.prerequisite_priority_component
        + 0.30::double precision * score.urgent_review
        + least(
            0.85::double precision,
            0.65::double precision * score.lapse_signal
              + 0.20::double precision * score.repeated_lapse_signal
          )
        - score.recent_concept_penalty
        as concept_priority
    from concept_scores score
  ),
  selected_concept as (
    select ranked.*
    from ranked_concepts ranked
    order by
      ranked.concept_priority desc,
      ranked.urgent_review desc,
      ranked.angle_need desc,
      ranked.concept_id
    limit 1
  ),
  selected_angle_history_attempts as (
    select
      angle.concept_id,
      angle.normalized_angle,
      history.response_value
    from eligible_angles angle
    join selected_concept selected
      on selected.concept_id = angle.concept_id
    join lateral (
      select
        case attempt.result
          when 'easy' then 1.00::double precision
          when 'average' then 0.75::double precision
          when 'hard' then 0.60::double precision
          when 'didnt_know' then 0.00::double precision
          when 'forgot' then 0.10::double precision
          when 'too_hard' then 0.25::double precision
        end as response_value
      from public.review_attempts attempt
      where attempt.user_id = current_user_id
        and attempt.concept_id = selected.concept_id
        and attempt.created_at > coalesce(
          public.get_concept_study_reset_at(
            current_user_id,
            selected.concept_id
          ),
          '-infinity'::timestamptz
        )
        and lower(btrim(attempt.testing_angle)) = angle.normalized_angle
        and attempt.result in (
          'easy',
          'average',
          'hard',
          'didnt_know',
          'forgot',
          'too_hard'
        )
        and attempt.created_at >= now() - interval '45 days'
      order by attempt.created_at desc, attempt.id desc
      limit 6
    ) history on true
  ),
  selected_angle_history_metrics as (
    select
      history.concept_id,
      history.normalized_angle,
      count(*)::integer as history_count,
      avg(history.response_value) as mean_response,
      avg(history.response_value * history.response_value) as mean_square_response
    from selected_angle_history_attempts history
    group by history.concept_id, history.normalized_angle
  ),
  selected_angle_components as (
    select
      angle.concept_id,
      angle.normalized_angle,
      rollup.evidence_count,
      rollup.last_exposure_at,
      latest.last_result,
      coalesce(history.history_count, 0) as history_count,
      case
        when rollup.evidence_count is null then 1::double precision
        else
          0.45::double precision
            / sqrt(greatest(1, rollup.evidence_count)::double precision)
      end as evidence_need_component,
      case
        when rollup.evidence_count is null then 0::double precision
        else
          0.20::double precision * (
            1::double precision
              - exp(
                  -greatest(
                    0::double precision,
                    extract(epoch from (now() - rollup.last_exposure_at))
                      / 86400::double precision
                  ) / 30::double precision
                )
          )
      end as time_need_component,
      case
        when rollup.evidence_count is null then 0::double precision
        else
          0.25::double precision * case latest.last_result
            when 'easy' then 0.00::double precision
            when 'average' then 0.30::double precision
            when 'hard' then 0.50::double precision
            when 'didnt_know' then 1.00::double precision
            when 'forgot' then 0.90::double precision
            when 'too_hard' then 0.60::double precision
            else 0::double precision
          end
      end as response_need_component,
      case
        when coalesce(history.history_count, 0) < 2 then 0::double precision
        else
          0.10::double precision * least(
            1::double precision,
            greatest(
              0::double precision,
              4::double precision * (
                history.mean_square_response
                  - history.mean_response * history.mean_response
              )
            )
          )
      end as contradiction_need_component
    from eligible_angles angle
    join selected_concept selected
      on selected.concept_id = angle.concept_id
    left join angle_state_rollup rollup
      on rollup.concept_id = angle.concept_id
     and rollup.normalized_angle = angle.normalized_angle
    left join angle_state_latest latest
      on latest.concept_id = angle.concept_id
     and latest.normalized_angle = angle.normalized_angle
    left join selected_angle_history_metrics history
      on history.concept_id = angle.concept_id
     and history.normalized_angle = angle.normalized_angle
  ),
  selected_angle_needs as (
    select
      component.*,
      case
        when component.evidence_count is null then 1::double precision
        else least(
          0.95::double precision,
          greatest(
            0::double precision,
            component.evidence_need_component
              + component.time_need_component
              + component.response_need_component
              + component.contradiction_need_component
          )
        )
      end as angle_need
    from selected_angle_components component
  ),
  selected_preferred_angle as (
    select angle.*
    from selected_angle_needs angle
    order by angle.angle_need desc, angle.normalized_angle
    limit 1
  ),
  -- Only the winning Concept now pays the full Question payload and ordered
  -- accepted-answer lookup cost. Eligibility and ordering are byte-for-byte
  -- equivalent to the former Library-wide eligible_questions CTE.
  selected_concept_questions as (
    select
      question.id as question_id,
      question.concept_id,
      question.prompt, question.prompt_format, question.current_version_id,
      question.explanation,
      question.difficulty,
      question.testing_angle,
      lower(btrim(question.testing_angle)) as normalized_angle,
      question.sort_order,
      question.created_at,
      accepted.answer_text as accepted_answer, accepted.answer_format as accepted_answer_format
    from public.questions question
    join selected_concept selected
      on selected.concept_id = question.concept_id
    join lateral (
      select answer.answer_text, answer.answer_format
      from public.question_accepted_answers answer
      where answer.question_id = question.id
      order by answer.sort_order, answer.id
      limit 1
    ) accepted on true
    where question.status = 'published'
      and question.question_type = 'short_answer'
  ),
  question_history as (
    select
      question.question_id,
      count(attempt.id) filter (
        where attempt.study_session_id = target_session.id
      )::integer as session_attempt_count,
      max(attempt.sequence_position) filter (
        where attempt.study_session_id = target_session.id
      ) as session_latest_position,
      max(attempt.created_at) as last_attempt_at
    from selected_concept_questions question
    left join public.review_attempts attempt
      on attempt.question_id = question.question_id
     and attempt.user_id = current_user_id
     and attempt.created_at > coalesce(
       public.get_concept_study_reset_at(
         current_user_id,
         question.concept_id
       ),
       '-infinity'::timestamptz
     )
    group by question.question_id
  ),
  selected_question_pool as (
    select
      question.*,
      selected.branch_balance,
      selected.is_unseen,
      selected.mastery_estimate,
      selected.live_retrievability,
      selected.last_result,
      selected.lapse_signal,
      selected.lapse_priority_component,
      selected.repeated_lapse_concern,
      selected.repeated_lapse_signal,
      selected.repeated_lapse_priority_component,
      selected.combined_lapse_priority_component,
      preferred.normalized_angle as preferred_angle,
      preferred.angle_need,
      preferred.evidence_count as angle_evidence_count,
      preferred.history_count as angle_history_count,
      preferred.evidence_need_component,
      preferred.time_need_component,
      preferred.response_need_component,
      preferred.contradiction_need_component,
      selected.angle_need as concept_angle_need,
      selected.new_component,
      selected.review_component,
      selected.angle_component,
      selected.prerequisite_priority_component,
      selected.urgent_review_component,
      selected.recent_concept_penalty,
      selected.concept_priority,
      history.session_attempt_count,
      history.session_latest_position,
      history.last_attempt_at,
      count(*) over () as question_pool_count,
      selected.session_latest_position as overall_session_latest_position,
      case question.difficulty
        when 'easy' then 0
        when 'medium' then 1
        when 'hard' then 2
      end as difficulty_number,
      case
        when selected.is_unseen then 1
        when selected.last_result = 'too_hard' then 0
        when selected.last_result = 'forgot' then
          case
            when selected.live_retrievability < 0.45::double precision then 0
            else 1
          end
        when selected.last_result = 'didnt_know' then 0
        when (
          0.65::double precision * selected.mastery_estimate
          + 0.35::double precision * selected.live_retrievability
        ) < 0.40::double precision then 0
        when (
          0.65::double precision * selected.mastery_estimate
          + 0.35::double precision * selected.live_retrievability
        ) <= 0.72::double precision then 1
        else 2
      end as target_difficulty_number
    from selected_concept_questions question
    join selected_concept selected on true
    join selected_preferred_angle preferred
      on preferred.concept_id = selected.concept_id
    join question_history history
      on history.question_id = question.question_id
  ),
  selected_question as (
    select pool.*
    from selected_question_pool pool
    order by
      case
        when pool.question_pool_count > 1
          and pool.session_latest_position = pool.overall_session_latest_position
          and pool.overall_session_latest_position > 0
          then 1
        else 0
      end,
      case when pool.normalized_angle = pool.preferred_angle then 0 else 1 end,
      case
        when pool.session_latest_position is null
          or pool.overall_session_latest_position = 0
          or pool.session_latest_position < pool.overall_session_latest_position - 4
          then 0
        else 1
      end,
      abs(pool.difficulty_number - pool.target_difficulty_number),
      case
        when pool.difficulty_number <= pool.target_difficulty_number then 0
        else 1
      end,
      pool.session_attempt_count,
      pool.last_attempt_at asc nulls first,
      pool.sort_order,
      pool.created_at,
      pool.question_id
    limit 1
  ),
  selected_question_with_position as (
    select
      selected.*,
      1 + (
        select count(*)::bigint
        from public.questions candidate
        join concept_balances candidate_balance
          on candidate_balance.concept_id = candidate.concept_id
        join effective_deck_concepts candidate_concept
          on candidate_concept.concept_id = candidate.concept_id
        join effective_deck_concepts selected_concept_row
          on selected_concept_row.concept_id = selected.concept_id
        where candidate.status = 'published'
          and candidate.question_type = 'short_answer'
          and exists (
            select 1
            from public.question_accepted_answers candidate_answer
            where candidate_answer.question_id = candidate.id
          )
          and row(
          lower(candidate_concept.concept_name),
          candidate.concept_id,
          candidate.sort_order,
          candidate.created_at,
          candidate.id
        ) < row(
          lower(selected_concept_row.concept_name),
          selected.concept_id,
          selected.sort_order,
          selected.created_at,
          selected.question_id
        )
      ) as candidate_position
    from selected_question selected
  )
  select
    jsonb_build_object(
      'question_id', selected.question_id,
      'concept_id', selected.concept_id,
      'testing_angle', selected.testing_angle,
      'prompt', selected.prompt,
        'prompt_format', selected.prompt_format, 'answer_format', selected.accepted_answer_format, 'question_version_id', selected.current_version_id,
      'accepted_answer', selected.accepted_answer,
      'difficulty', selected.difficulty,
      'explanation', selected.explanation,
      'candidate_position', selected.candidate_position,
      'created_at', selected.created_at
    )
    || case
      when coalesce(p_include_debug, false) then jsonb_build_object(
        'selected_branch_balance', selected.branch_balance,
        'new_component', selected.new_component,
        'review_component', selected.review_component,
        'angle_component', selected.angle_component,
        'prerequisite_priority_component',
          selected.prerequisite_priority_component,
        'urgent_review_component', selected.urgent_review_component,
        'lapse_signal', selected.lapse_signal,
        'lapse_priority_component', selected.lapse_priority_component,
        'repeated_lapse_concern', selected.repeated_lapse_concern,
        'repeated_lapse_signal', selected.repeated_lapse_signal,
        'repeated_lapse_priority_component',
          selected.repeated_lapse_priority_component,
        'combined_lapse_priority_component',
          selected.combined_lapse_priority_component,
        'latest_result', selected.last_result,
        'live_retrievability', selected.live_retrievability,
        'target_difficulty_number', selected.target_difficulty_number,
        'recent_penalty', selected.recent_concept_penalty,
        'concept_priority', selected.concept_priority,
        'selected_angle_need', selected.angle_need,
        'concept_angle_need', selected.concept_angle_need,
        'angle_evidence_count', selected.angle_evidence_count,
        'angle_history_count', selected.angle_history_count,
        'angle_evidence_component', selected.evidence_need_component,
        'angle_time_component', selected.time_need_component,
        'angle_response_component', selected.response_need_component,
        'angle_contradiction_component',
          selected.contradiction_need_component,
        'selection_reason', case
          when selected.is_unseen then 'unseen_concept'
          when selected.lapse_priority_component > 0 then 'fresh_forgot_lapse'
          when selected.repeated_lapse_priority_component > 0
            then 'repeated_lapse_history'
          when selected.urgent_review_component > 0 then 'urgent_review'
          else 'priority_score'
        end
      )
      else '{}'::jsonb
    end
  into selection_result
  from selected_question_with_position selected;

  return selection_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.select_next_study_candidate(p_study_session_id uuid, p_include_debug boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_user_id uuid := (select auth.uid());
  target_session public.study_sessions%rowtype;
  policy public.study_priority_source_policy%rowtype;
  official_offer jsonb;
  personal_offer jsonb;
  selected_offer jsonb;
  selected_source text;
  decision_reason text;
  official_attempt_count integer := 0;
  personal_attempt_count integer := 0;
  official_latest_position integer;
  personal_latest_position integer;
  official_absence integer := 0;
  personal_absence integer := 0;
  latest_source text;
  latest_source_run integer := 0;
  next_position integer;
  official_debt double precision := 0;
  personal_debt double precision := 0;
  official_critical boolean := false;
  personal_critical boolean := false;
  global_minimum_count integer;
  official_minimum_count integer;
  personal_minimum_count integer;
  official_available boolean;
  personal_available boolean;
  selection_result jsonb;
begin
  if current_user_id is null or not public.has_socrates_role() then
    raise exception 'Not authorized to select a Study candidate.';
  end if;

  select session_row.*
  into target_session
  from public.study_sessions session_row
  where session_row.id = p_study_session_id
    and session_row.user_id = current_user_id
    and session_row.ended_at is null
  for share;

  if target_session.id is null then
    raise exception 'Active study session not found.';
  end if;

  select source_policy.*
  into policy
  from public.study_priority_source_policy source_policy
  where source_policy.policy_name = 'normal_default';

  if policy.policy_name is null then
    raise exception 'Study priority source policy is not configured.';
  end if;

  -- Each source selector already returns null when that source has no eligible
  -- offer. Calling it directly avoids two broad availability scans over the
  -- unified resolver without changing source arbitration.
  official_offer := public.select_next_study_question_hardened(
    target_session.id,
    true
  );
  personal_offer := public.select_next_personal_study_card(
    target_session.id,
    true
  );

  official_available := official_offer is not null;
  personal_available := personal_offer is not null;

  if not official_available and not personal_available then
    return null;
  end if;

  select
    count(*)::integer,
    max(attempt.sequence_position)
  into official_attempt_count, official_latest_position
  from public.review_attempts attempt
  where attempt.study_session_id = target_session.id
    and attempt.user_id = current_user_id;

  select
    count(*)::integer,
    max(attempt.sequence_position)
  into personal_attempt_count, personal_latest_position
  from public.personal_review_attempts attempt
  where attempt.study_session_id = target_session.id
    and attempt.user_id = current_user_id;

  next_position := official_attempt_count + personal_attempt_count + 1;
  official_absence := official_attempt_count + personal_attempt_count
    - coalesce(official_latest_position, 0);
  personal_absence := official_attempt_count + personal_attempt_count
    - coalesce(personal_latest_position, 0);

  official_debt :=
    next_position::double precision
      * policy.official_source_weight::double precision
      / (
        policy.official_source_weight + policy.personal_source_weight
      )::double precision
    - official_attempt_count::double precision;
  personal_debt :=
    next_position::double precision
      * policy.personal_source_weight::double precision
      / (
        policy.official_source_weight + policy.personal_source_weight
      )::double precision
    - personal_attempt_count::double precision;

  with combined_history as (
    select attempt.sequence_position, 'official'::text as source_type
    from public.review_attempts attempt
    where attempt.study_session_id = target_session.id
      and attempt.user_id = current_user_id

    union all

    select attempt.sequence_position, 'personal'::text as source_type
    from public.personal_review_attempts attempt
    where attempt.study_session_id = target_session.id
      and attempt.user_id = current_user_id
  ),
  latest as (
    select history.source_type
    from combined_history history
    order by history.sequence_position desc
    limit 1
  )
  select latest.source_type
  into latest_source
  from latest;

  if latest_source is not null then
    with combined_history as (
      select attempt.sequence_position, 'official'::text as source_type
      from public.review_attempts attempt
      where attempt.study_session_id = target_session.id
        and attempt.user_id = current_user_id

      union all

      select attempt.sequence_position, 'personal'::text as source_type
      from public.personal_review_attempts attempt
      where attempt.study_session_id = target_session.id
        and attempt.user_id = current_user_id
    )
    select count(*)::integer
    into latest_source_run
    from combined_history history
    where history.source_type = latest_source
      and not exists (
        select 1
        from combined_history newer
        where newer.sequence_position > history.sequence_position
          and newer.source_type <> latest_source
      );
  end if;

  official_critical :=
    coalesce((official_offer ->> 'lapse_priority_component')::double precision, 0) > 0
    or coalesce(
      (official_offer ->> 'repeated_lapse_priority_component')::double precision,
      0
    ) > 0
    or coalesce(
      (official_offer ->> 'urgent_review_component')::double precision,
      0
    ) > 0;
  personal_critical := coalesce(
    (personal_offer ->> 'personal_is_critical')::boolean,
    false
  );

  if target_session.cram_mode then
    with candidate_counts as (
      select
        candidate.candidate_type,
        candidate.candidate_id,
        case candidate.candidate_type
          when 'official' then (
            select count(*)::integer
            from public.review_attempts attempt
            where attempt.study_session_id = target_session.id
              and attempt.user_id = current_user_id
              and attempt.question_id = candidate.official_question_id
          )
          else (
            select count(*)::integer
            from public.personal_review_attempts attempt
            where attempt.study_session_id = target_session.id
              and attempt.user_id = current_user_id
              and attempt.personal_card_id = candidate.personal_card_id
          )
        end as session_attempt_count
      from public.resolve_study_candidates(target_session.study_deck_id) candidate
    )
    select
      min(counts.session_attempt_count),
      min(counts.session_attempt_count) filter (
        where counts.candidate_type = 'official'
      ),
      min(counts.session_attempt_count) filter (
        where counts.candidate_type = 'personal'
      )
    into
      global_minimum_count,
      official_minimum_count,
      personal_minimum_count
    from candidate_counts counts;

    official_available :=
      official_available
      and official_minimum_count = global_minimum_count;
    personal_available :=
      personal_available
      and personal_minimum_count = global_minimum_count;

    if official_available and not personal_available then
      selected_source := 'official';
      decision_reason := 'cram_global_traversal_official';
    elsif personal_available and not official_available then
      selected_source := 'personal';
      decision_reason := 'cram_global_traversal_personal';
    elsif coalesce(
      (official_offer ->> 'selected_concept_cram_need')::double precision,
      0
    ) >= coalesce(
      (personal_offer ->> 'personal_cram_need')::double precision,
      0
    ) then
      selected_source := 'official';
      decision_reason := 'cram_need_official';
    else
      selected_source := 'personal';
      decision_reason := 'cram_need_personal';
    end if;
  elsif official_available and not personal_available then
    selected_source := 'official';
    decision_reason := 'official_only';
  elsif personal_available and not official_available then
    selected_source := 'personal';
    decision_reason := 'personal_only';
  elsif personal_absence >= policy.max_source_absence
      or (
        latest_source = 'official'
        and latest_source_run >= policy.max_official_run
      ) then
    selected_source := 'personal';
    decision_reason := 'personal_starvation_guard';
  elsif official_absence >= policy.max_source_absence
      or (
        latest_source = 'personal'
        and latest_source_run >= policy.max_personal_run
      ) then
    selected_source := 'official';
    decision_reason := 'official_starvation_guard';
  elsif official_critical and not personal_critical then
    selected_source := 'official';
    decision_reason := 'official_urgency_override';
  elsif personal_critical and not official_critical then
    selected_source := 'personal';
    decision_reason := 'personal_urgency_override';
  elsif official_debt >= personal_debt then
    selected_source := 'official';
    decision_reason := case
      when official_critical and personal_critical
        then 'both_urgent_official_debt'
      else 'official_weighted_debt'
    end;
  else
    selected_source := 'personal';
    decision_reason := case
      when official_critical and personal_critical
        then 'both_urgent_personal_debt'
      else 'personal_weighted_debt'
    end;
  end if;

  selected_offer := case selected_source
    when 'official' then official_offer
    else personal_offer
  end;

  if selected_source = 'official' and target_session.cram_mode then
    select jsonb_build_object(
      'candidate_type', 'official',
      'candidate_id', candidate.candidate_id,
      'official_question_id', candidate.official_question_id,
      'official_concept_id', candidate.official_concept_id,
      'personal_card_id', null,
      'personal_concept_id', null,
      'personal_topic_id', null,
      'prompt', candidate.prompt,
      'prompt_format', format_question.prompt_format, 'answer_format', format_answer.answer_format, 'question_version_id', format_question.current_version_id,
      'answer', candidate.answer,
      'explanation', candidate.explanation,
      'difficulty', candidate.difficulty,
      'testing_angle', candidate.testing_angle,
      'candidate_position', candidate.candidate_position,
      'created_at', candidate.created_at
    )
    into selection_result
    from public.resolve_study_candidates(target_session.study_deck_id) candidate
    join public.questions format_question on format_question.id=candidate.official_question_id
    join lateral (select answer_format from public.question_accepted_answers where question_id=format_question.id order by sort_order,id limit 1) format_answer on true
    where candidate.candidate_type = 'official'
      and candidate.official_question_id = (
        selected_offer ->> 'question_id'
      )::uuid;
  elsif selected_source = 'official' then
    -- The hardened Normal official selector already carries the exact selected
    -- Question payload and global resolver position, so no third broad resolver
    -- pass is needed merely to adapt the discriminated candidate contract.
    selection_result := jsonb_build_object(
      'candidate_type', 'official',
      'candidate_id', selected_offer -> 'question_id',
      'official_question_id', selected_offer -> 'question_id',
      'official_concept_id', selected_offer -> 'concept_id',
      'personal_card_id', null,
      'personal_concept_id', null,
      'personal_topic_id', null,
      'prompt', selected_offer -> 'prompt',
      'prompt_format', selected_offer -> 'prompt_format', 'answer_format', selected_offer -> 'answer_format', 'question_version_id', selected_offer -> 'question_version_id',
      'answer', selected_offer -> 'accepted_answer',
      'explanation', selected_offer -> 'explanation',
      'difficulty', selected_offer -> 'difficulty',
      'testing_angle', selected_offer -> 'testing_angle',
      'candidate_position', selected_offer -> 'candidate_position',
      'created_at', selected_offer -> 'created_at'
    );
  else
    selection_result := selected_offer - array[
      'personal_priority',
      'personal_concept_need',
      'personal_cram_need',
      'card_new_component',
      'card_outcome_need',
      'card_revisit_need',
      'card_positive_attempt_count',
      'card_negative_attempt_count',
      'card_latest_result',
      'personal_evidence_count',
      'personal_positive_evidence_count',
      'personal_negative_evidence_count',
      'personal_consecutive_success_count',
      'personal_consecutive_lapse_count',
      'personal_latest_result',
      'personal_is_critical',
      'personal_session_attempt_count',
      'personal_traversal_minimum_count',
      'selection_reason'
    ];
  end if;

  if selection_result is null then
    raise exception 'Selected Study candidate is no longer eligible.';
  end if;

  if coalesce(p_include_debug, false) then
    selection_result := selection_result || jsonb_build_object(
      'debug', jsonb_build_object(
        'source_decision', decision_reason,
        'selected_source', selected_source,
        'official_source_weight', policy.official_source_weight,
        'personal_source_weight', policy.personal_source_weight,
        'max_source_absence', policy.max_source_absence,
        'max_official_run', policy.max_official_run,
        'max_personal_run', policy.max_personal_run,
        'official_attempt_count', official_attempt_count,
        'personal_attempt_count', personal_attempt_count,
        'official_debt', official_debt,
        'personal_debt', personal_debt,
        'official_critical', official_critical,
        'personal_critical', personal_critical,
        'latest_source', latest_source,
        'latest_source_run', latest_source_run,
        'global_traversal_minimum_count', global_minimum_count,
        'official_offer', official_offer,
        'personal_offer', personal_offer
      )
    );
  end if;

  return selection_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.m115_candidate_hint(p_candidate jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare q public.questions; hint jsonb; answer text;
begin
 if p_candidate is null or p_candidate->>'candidate_type' is distinct from 'official' then return p_candidate; end if;
 select * into q from public.questions where id=(p_candidate->>'official_question_id')::uuid;
 if not found then return p_candidate||jsonb_build_object('question_media_hint',jsonb_build_object('unavailable',true)); end if;
 hint:=public.question_media_hint(q);
 select answer_text into answer from public.question_accepted_answers where question_id=q.id order by sort_order,id limit 1;
 if q.current_version_id is distinct from (p_candidate->>'question_version_id')::uuid or q.prompt is distinct from p_candidate->>'prompt' or answer is distinct from p_candidate->>'answer' then hint:=coalesce(hint,'{}')||jsonb_build_object('unavailable',true); end if;
 return p_candidate||jsonb_build_object('question_media_hint',hint);
end $function$;


do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p where p.pronamespace='public'::regnamespace
  and (p.proname like 'm116\_%' escape '\' or p.proname in ('save_concept_with_format','save_question_with_format','save_article_question_metadata')) loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 end loop;
end $$;
grant execute on function public.save_concept_with_format(uuid,uuid,timestamptz,text,jsonb),public.save_question_with_format(uuid,uuid,timestamptz,jsonb),public.save_article_question_metadata(uuid,uuid,uuid,uuid,timestamptz,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
