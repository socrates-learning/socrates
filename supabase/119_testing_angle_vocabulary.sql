-- Editable official-authoring labels; immutable text keys remain the learning contract.
-- No Question, version, attempt or evidence rows are rewritten by this migration.
begin;

do $$ begin
  if exists(select 1 from (values
    ('m116_question_save_core(uuid,uuid,text,text,text,text,uuid,integer,text,text,jsonb,jsonb,uuid[],uuid[],uuid,uuid[],text[],text)','f9a9288f50cf50add05fda8b12a5a89e'),
    ('save_question_with_relationships_v2(uuid,uuid,text,text,text,text,uuid,integer,text,text,jsonb,jsonb,uuid[],uuid[],uuid,uuid[],text[])','fb5746cc86bb5eede3e6832c2d4036c6'),
    ('create_question(uuid,text,text,text,uuid,integer,text,text)','b3c5b781f3bd9dd6e00752dd84c48494'),
    ('update_question(uuid,text,text,text,text,uuid,integer,text,text)','e754743cab2b8a427d341f2912217189')
  ) expected(signature,body_hash)
    left join pg_proc p on p.oid=to_regprocedure('public.'||expected.signature)
    where p.oid is null or md5(pg_get_functiondef(p.oid))<>expected.body_hash
  ) then raise exception '119 requires the released Question writer contract'; end if;
end $$;

create table public.testing_angle_vocabulary (
  id uuid primary key default gen_random_uuid(),
  storage_key text not null check (btrim(storage_key)<>''),
  display_name text not null check (btrim(display_name)<>''),
  status text not null check (status in ('active','retired')),
  reserved_names text[] not null,
  sort_order integer not null check (sort_order>=0),
  revision bigint not null default 1 check (revision>0),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint testing_angle_default_active check (
    lower(btrim(storage_key))<>'general understanding' or status='active'
  )
);
create unique index testing_angle_vocabulary_key on public.testing_angle_vocabulary(lower(btrim(storage_key)));
create unique index testing_angle_vocabulary_name on public.testing_angle_vocabulary(lower(btrim(display_name)));
alter table public.testing_angle_vocabulary enable row level security;
revoke all on public.testing_angle_vocabulary from public, anon, authenticated, service_role;

-- Default spellings win; current custom values become active. History-only values
-- are recognized without reopening them for ordinary new assignment.
with defaults(value,position) as (values
  ('General Understanding',0),('Recognition / Definition',1),
  ('Mechanism / Pathophysiology',2),('Clinical Manifestations',3),
  ('Assessment / Interpretation',4),('Clinical Application',5),
  ('Intervention / Management',6),('Complications / Outcomes',7),
  ('Differentiation / Comparison',8)
), observed(value,active,position,priority) as (
  select value,true,position,0 from defaults
  union all select testing_angle,true,null,1 from public.questions
  union all select testing_angle,true,null,1 from public.question_additional_testing_angles
  union all select testing_angle,false,null,2 from public.question_versions
  union all select a->>'testing_angle',false,null,2 from public.question_versions v
    cross join lateral jsonb_array_elements(coalesce(v.additional_testing_angles_snapshot,'[]'::jsonb)) a
  union all select testing_angle,false,null,2 from public.review_attempts
  union all select testing_angle,false,null,2 from public.user_concept_testing_angle_state
), grouped as (
  select lower(btrim(value)) normalized,
    (array_agg(btrim(value) order by priority,position,value collate "C"))[1] storage_key,
    bool_or(active) active,min(position) position
  from observed where nullif(btrim(value),'') is not null group by lower(btrim(value))
)
insert into public.testing_angle_vocabulary(storage_key,display_name,status,reserved_names,sort_order)
select storage_key,storage_key,case when active then 'active' else 'retired' end,
  array[normalized],(row_number() over(order by position nulls last,normalized collate "C")-1)::integer
from grouped;

create function public.can_manage_testing_angle_vocabulary() returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and public.is_editor_or_admin();
$$;

create function public.m119_require_manager() returns void
language plpgsql stable security definer set search_path='' as $$ begin
  if not public.can_manage_testing_angle_vocabulary() then
    raise exception 'Only authorized editors and admins may manage Testing Angles' using errcode='42501';
  end if;
end $$;

create function public.m119_catalog_identity() returns trigger
language plpgsql set search_path='' as $$ begin
  if tg_op='DELETE' then raise exception 'Testing Angles may be retired, not deleted'; end if;
  if new.id is distinct from old.id or new.storage_key is distinct from old.storage_key
    or new.created_at is distinct from old.created_at or new.sort_order is distinct from old.sort_order
  then raise exception 'Testing Angle identity and order are immutable'; end if;
  return new;
end $$;
create trigger testing_angle_vocabulary_identity before update or delete on public.testing_angle_vocabulary
  for each row execute function public.m119_catalog_identity();

create function public.get_testing_angle_vocabulary()
returns setof public.testing_angle_vocabulary
language plpgsql stable security definer set search_path='' as $$ begin
  perform public.m119_require_manager();
  return query select * from public.testing_angle_vocabulary order by sort_order,id;
end $$;

create function public.m119_available_name(p_name text,p_except uuid default null) returns text
language plpgsql security definer set search_path='' as $$
declare cleaned text:=btrim(coalesce(p_name,'')); begin
  perform public.m119_require_manager();
  -- Serialize cross-row/former-name uniqueness, including concurrent creation.
  perform pg_catalog.pg_advisory_xact_lock(119,1);
  if cleaned='' or char_length(cleaned)>200 or cleaned ~ '[[:cntrl:]]' then
    raise exception 'Testing Angle name must be 1–200 characters without control characters';
  end if;
  if exists(select 1 from public.testing_angle_vocabulary v
    where v.id is distinct from p_except and lower(cleaned)=any(v.reserved_names)
  ) then raise exception 'This Testing Angle name is already used or reserved'; end if;
  return cleaned;
end $$;

create function public.create_testing_angle(p_name text) returns public.testing_angle_vocabulary
language plpgsql security definer set search_path='' as $$
declare cleaned text; result public.testing_angle_vocabulary; begin
  cleaned:=public.m119_available_name(p_name);
  insert into public.testing_angle_vocabulary(storage_key,display_name,status,reserved_names,sort_order,created_by,updated_by)
  values(cleaned,cleaned,'active',array[lower(cleaned)],
    (select coalesce(max(sort_order),-1)+1 from public.testing_angle_vocabulary),auth.uid(),auth.uid()) returning * into result;
  return result;
end $$;

create function public.rename_testing_angle(p_id uuid,p_name text,p_expected_revision bigint)
returns public.testing_angle_vocabulary
language plpgsql security definer set search_path='' as $$
declare cleaned text; result public.testing_angle_vocabulary; begin
  cleaned:=public.m119_available_name(p_name,p_id);
  select * into result from public.testing_angle_vocabulary where id=p_id for update;
  if not found or result.revision is distinct from p_expected_revision then
    raise exception 'Testing Angle changed; reload the vocabulary before trying again' using errcode='40001';
  end if;
  if result.display_name=cleaned then return result; end if;
  update public.testing_angle_vocabulary set display_name=cleaned,
    reserved_names=array(select distinct name from unnest(result.reserved_names||array[lower(cleaned)]) name order by name),
    revision=revision+1,updated_at=clock_timestamp(),updated_by=auth.uid()
  where id=p_id returning * into result;
  return result;
end $$;

create function public.set_testing_angle_retired(p_id uuid,p_retired boolean,p_expected_revision bigint)
returns public.testing_angle_vocabulary
language plpgsql security definer set search_path='' as $$
declare result public.testing_angle_vocabulary; next_status text; begin
  perform public.m119_require_manager();
  perform pg_catalog.pg_advisory_xact_lock(119,1);
  if p_retired is null then raise exception 'Testing Angle state is required'; end if;
  select * into result from public.testing_angle_vocabulary where id=p_id for update;
  if not found or result.revision is distinct from p_expected_revision then
    raise exception 'Testing Angle changed; reload the vocabulary before trying again' using errcode='40001';
  end if;
  if p_retired and lower(btrim(result.storage_key))='general understanding' then
    raise exception 'General Understanding is the protected New Question default and cannot be removed';
  end if;
  next_status:=case when p_retired then 'retired' else 'active' end;
  if result.status=next_status then return result; end if;
  update public.testing_angle_vocabulary set status=next_status,revision=revision+1,
    updated_at=clock_timestamp(),updated_by=auth.uid() where id=p_id returning * into result;
  return result;
end $$;

-- Validate the complete association set BEFORE a save replaces any links.
-- This preserves retired values already on this Question, including promotion.
create function public.m119_validate_question_angles(p_question uuid,p_primary text,p_additional text[])
returns void language plpgsql security definer set search_path='' as $$
declare existing text[]:='{}'; requested text[]; key text; entry public.testing_angle_vocabulary; begin
  perform public.m119_require_manager();
  if p_question is not null then
    perform 1 from public.questions where id=p_question for update;
    if not found then raise exception 'Question was not found'; end if;
    select array_agg(distinct lower(btrim(value))) into existing from (
      select testing_angle value from public.questions where id=p_question
      union all select testing_angle from public.question_additional_testing_angles where question_id=p_question
    ) values_before;
  end if;
  if p_additional is not null and exists(select 1 from unnest(p_additional) a where nullif(btrim(a),'') is null) then
    raise exception 'Additional Testing Angles must not be blank';
  end if;
  requested:=array[coalesce(nullif(btrim(p_primary),''),'General Understanding')]||coalesce(p_additional,'{}');
  -- Sorted SHARE locks conflict with status updates (KEY SHARE would not).
  for key in select distinct lower(btrim(a)) from unnest(requested) a order by 1 loop
    select * into entry from public.testing_angle_vocabulary where lower(btrim(storage_key))=key for share;
    if not found then raise exception 'Testing Angle is unavailable; add it through Manage Testing Angles before assigning it' using errcode='23514'; end if;
    if entry.status='retired' and not key=any(coalesce(existing,'{}')) then
      raise exception 'Testing Angle "%" was removed from future availability; choose an active angle or restore it',entry.display_name using errcode='23514';
    end if;
  end loop;
end $$;

-- The four released writer bodies follow with only an added validation call.

CREATE OR REPLACE FUNCTION public.create_question(p_concept_id uuid, p_question_type text, p_prompt text, p_explanation text DEFAULT NULL::text, p_review_article_concept_id uuid DEFAULT NULL::uuid, p_sort_order integer DEFAULT 0, p_difficulty text DEFAULT 'medium'::text, p_testing_angle text DEFAULT 'General Understanding'::text)
 RETURNS questions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  perform public.m119_validate_question_angles(null,p_testing_angle,null);

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

  perform public.m119_validate_question_angles(p_question_id,p_testing_angle,null);

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

  perform public.m119_validate_question_angles(p_question_id,p_testing_angle,p_additional_testing_angles);

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

  perform public.m119_validate_question_angles(p_question_id,p_testing_angle,p_additional_testing_angles);

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

-- Preserve the four writers' owners and ACLs; new public authority is explicit.
do $$ declare f record; begin
  for f in select p.oid::regprocedure signature from pg_proc p
    where p.pronamespace='public'::regnamespace and (p.proname like 'm119\_%' escape '\'
      or p.proname in ('can_manage_testing_angle_vocabulary','get_testing_angle_vocabulary','create_testing_angle','rename_testing_angle','set_testing_angle_retired')) loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  end loop;
end $$;
grant execute on function public.can_manage_testing_angle_vocabulary(),public.get_testing_angle_vocabulary(),
  public.create_testing_angle(text),public.rename_testing_angle(uuid,text,bigint),
  public.set_testing_angle_retired(uuid,boolean,bigint) to authenticated;
comment on table public.testing_angle_vocabulary is 'Global official authoring vocabulary. Immutable storage keys preserve Question, version, attempt and evidence contracts; Rename changes display names only.';
comment on column public.testing_angle_vocabulary.reserved_names is 'Normalized current/former names reserved for this identity. No reassignment to another entry.';
notify pgrst,'reload schema';
commit;
