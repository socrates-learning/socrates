-- Shared Tag Catalog and version-aware Concept/Question/Article assignments.
-- Tags remain stable global identities; content saves may only select existing
-- tags and cannot create catalog entries as a side effect.

begin;

alter table public.tags
  add column if not exists status text not null default 'active',
  add column if not exists updated_at timestamptz not null default now();

alter table public.tags
  drop constraint if exists tags_status_check;
alter table public.tags
  add constraint tags_status_check
  check (status in ('active', 'archived'));

do $preflight$
begin
  if exists (
    select 1
    from public.tags t
    where public.tag_slug_from_name(t.name) = ''
  ) then
    raise exception 'Tag Catalog migration stopped: an existing tag has no canonical slug';
  end if;

  if exists (
    select 1
    from public.tags t
    group by public.tag_slug_from_name(t.name)
    having count(*) > 1
  ) then
    raise exception 'Tag Catalog migration stopped: existing tag names collide canonically';
  end if;
end
$preflight$;

-- Rebuild the exact-slug constraint around canonicalization so even legacy
-- swapped/noncanonical slugs can be normalized atomically.
alter table public.tags drop constraint if exists tags_slug_key;

update public.tags t
set slug = public.tag_slug_from_name(t.name)
where t.slug is distinct from public.tag_slug_from_name(t.name);

alter table public.tags
  add constraint tags_slug_key unique (slug);

create unique index if not exists tags_canonical_name_slug_idx
  on public.tags (public.tag_slug_from_name(name));

create or replace function public.canonicalize_tag_catalog_row()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  cleaned_name text;
  canonical_slug text;
begin
  cleaned_name := regexp_replace(btrim(coalesce(new.name, '')), '\s+', ' ', 'g');
  canonical_slug := public.tag_slug_from_name(cleaned_name);

  if cleaned_name = '' or canonical_slug = '' then
    raise exception 'Tag name is required';
  end if;

  new.name := cleaned_name;
  new.slug := canonical_slug;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists canonicalize_tag_catalog_row on public.tags;
create trigger canonicalize_tag_catalog_row
  before insert or update of name, slug, status on public.tags
  for each row execute function public.canonicalize_tag_catalog_row();

-- Catalog writes are controlled by the RPCs below. Existing read access is
-- preserved for authenticated Socrates users.
drop policy if exists "Editors manage tags" on public.tags;
revoke insert, update, delete on table public.tags
  from public, anon, authenticated;
grant select on table public.tags to authenticated;

create table if not exists public.question_tags (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null
    references public.questions(id) on delete restrict,
  tag_id uuid not null
    references public.tags(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint question_tags_question_tag_key unique (question_id, tag_id)
);

create index if not exists question_tags_question_id_idx
  on public.question_tags(question_id);
create index if not exists question_tags_tag_id_idx
  on public.question_tags(tag_id);

alter table public.question_tags enable row level security;

drop policy if exists "Readable question tags" on public.question_tags;
create policy "Readable question tags"
  on public.question_tags
  for select
  to authenticated
  using (
    public.has_socrates_role()
    and (
      public.is_editor_or_admin()
      or exists (
        select 1
        from public.questions q
        join public.concepts c on c.id = q.concept_id
        where q.id = question_id
          and q.status = 'published'
          and c.status = 'published'
      )
    )
  );

revoke all on table public.question_tags from public, anon, authenticated;
grant select on table public.question_tags to authenticated;

-- A catalog identity cannot be physically removed while live content uses it.
alter table public.concept_tags
  drop constraint if exists concept_tags_tag_id_fkey;
alter table public.concept_tags
  add constraint concept_tags_tag_id_fkey
  foreign key (tag_id) references public.tags(id) on delete restrict;

alter table public.article_tags
  drop constraint if exists article_tags_tag_id_fkey;
alter table public.article_tags
  add constraint article_tags_tag_id_fkey
  foreign key (tag_id) references public.tags(id) on delete restrict;

alter table public.question_versions
  add column if not exists tags_snapshot jsonb not null default '[]'::jsonb;

alter table public.question_versions
  drop constraint if exists question_versions_tags_snapshot_array;
alter table public.question_versions
  add constraint question_versions_tags_snapshot_array
  check (jsonb_typeof(tags_snapshot) = 'array');

create or replace function public.validate_assignable_tag_ids(
  p_tag_ids uuid[],
  p_existing_tag_ids uuid[] default array[]::uuid[]
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_tag_ids uuid[];
begin
  select coalesce(array_agg(requested.tag_id order by requested.first_position), array[]::uuid[])
  into normalized_tag_ids
  from (
    select requested_tag_id as tag_id, min(position) as first_position
    from unnest(coalesce(p_tag_ids, array[]::uuid[]))
      with ordinality as input(requested_tag_id, position)
    where requested_tag_id is not null
    group by requested_tag_id
  ) requested;

  if exists (
    select 1
    from unnest(normalized_tag_ids) requested_tag_id
    left join public.tags t on t.id = requested_tag_id
    where t.id is null
  ) then
    raise exception 'A selected tag was not found';
  end if;

  if exists (
    select 1
    from public.tags t
    where t.id = any(normalized_tag_ids)
      and t.status <> 'active'
      and not t.id = any(coalesce(p_existing_tag_ids, array[]::uuid[]))
  ) then
    raise exception 'Archived tags cannot be newly assigned';
  end if;

  -- Retain locks through the surrounding content-save transaction so a
  -- selected catalog identity cannot disappear or be renamed mid-save.
  perform 1
  from public.tags t
  where t.id = any(normalized_tag_ids)
  for key share;

  return normalized_tag_ids;
end;
$$;

create or replace function public.create_catalog_tag(p_name text)
returns public.tags
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  cleaned_name text;
  canonical_slug text;
  created_tag public.tags%rowtype;
begin
  if caller_id is null then
    raise exception 'Authenticated user is required';
  end if;
  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may manage tags';
  end if;

  cleaned_name := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  canonical_slug := public.tag_slug_from_name(cleaned_name);
  if cleaned_name = '' or canonical_slug = '' then
    raise exception 'Tag name is required';
  end if;
  if exists (select 1 from public.tags t where t.slug = canonical_slug) then
    raise exception 'A tag with this name already exists';
  end if;

  insert into public.tags (name, slug, status, created_by)
  values (cleaned_name, canonical_slug, 'active', caller_id)
  returning * into created_tag;
  return created_tag;
end;
$$;

create or replace function public.rename_catalog_tag(p_tag_id uuid, p_name text)
returns public.tags
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  cleaned_name text;
  canonical_slug text;
  renamed_tag public.tags%rowtype;
begin
  if caller_id is null then
    raise exception 'Authenticated user is required';
  end if;
  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may manage tags';
  end if;

  cleaned_name := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  canonical_slug := public.tag_slug_from_name(cleaned_name);
  if cleaned_name = '' or canonical_slug = '' then
    raise exception 'Tag name is required';
  end if;
  if exists (
    select 1 from public.tags t
    where t.slug = canonical_slug and t.id <> p_tag_id
  ) then
    raise exception 'A tag with this name already exists';
  end if;

  update public.tags
  set name = cleaned_name,
      slug = canonical_slug
  where id = p_tag_id
  returning * into renamed_tag;

  if renamed_tag.id is null then
    raise exception 'Tag was not found';
  end if;
  return renamed_tag;
end;
$$;

create or replace function public.archive_catalog_tag(p_tag_id uuid)
returns public.tags
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  archived_tag public.tags%rowtype;
begin
  if caller_id is null then
    raise exception 'Authenticated user is required';
  end if;
  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may manage tags';
  end if;

  update public.tags set status = 'archived'
  where id = p_tag_id
  returning * into archived_tag;
  if archived_tag.id is null then
    raise exception 'Tag was not found';
  end if;
  return archived_tag;
end;
$$;

create or replace function public.reactivate_catalog_tag(p_tag_id uuid)
returns public.tags
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  active_tag public.tags%rowtype;
begin
  if caller_id is null then
    raise exception 'Authenticated user is required';
  end if;
  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may manage tags';
  end if;

  update public.tags set status = 'active'
  where id = p_tag_id
  returning * into active_tag;
  if active_tag.id is null then
    raise exception 'Tag was not found';
  end if;
  return active_tag;
end;
$$;

drop function if exists public.get_concept_tags(uuid);
create function public.get_concept_tags(p_concept_id uuid)
returns table (
  id uuid,
  name text,
  slug text,
  status text
)
language sql
security definer
set search_path = ''
as $$
  select t.id, t.name, t.slug, t.status
  from public.concept_tags ct
  join public.tags t on t.id = ct.tag_id
  join public.concepts c on c.id = ct.concept_id
  where ct.concept_id = p_concept_id
    and public.has_socrates_role()
    and (public.is_editor_or_admin() or c.status = 'published')
  order by t.name;
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
    2,
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
  p_tag_ids uuid[],
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

  save_result := public.save_concept_draft(
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
  p_source_ids uuid[],
  p_tag_ids uuid[]
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
  perform public.append_question_version_snapshot(saved_question.id, caller_id);

  select * into saved_question from public.questions q where q.id = saved_question.id;
  return saved_question;
end;
$$;

create or replace function public.save_article_draft(
  p_article_id uuid,
  p_title text,
  p_summary text,
  p_body_markdown text,
  p_active_library_id uuid,
  p_library_node_ids uuid[],
  p_primary_library_node_id uuid,
  p_tag_ids uuid[],
  p_publish boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  existing_tag_ids uuid[];
  normalized_tag_ids uuid[];
  selected_tag_id uuid;
  saved_article_id uuid;
  save_result jsonb;
begin
  if caller_id is null then raise exception 'Authenticated user is required'; end if;
  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may save articles';
  end if;

  select coalesce(array_agg(at.tag_id), array[]::uuid[])
  into existing_tag_ids
  from public.article_tags at
  where at.article_id = p_article_id;
  normalized_tag_ids := public.validate_assignable_tag_ids(p_tag_ids, existing_tag_ids);

  save_result := public.save_article_draft(
    p_article_id, p_title, p_summary, p_body_markdown, p_active_library_id,
    p_library_node_ids, p_primary_library_node_id, array[]::text[], p_publish
  );
  saved_article_id := (save_result ->> 'article_id')::uuid;

  foreach selected_tag_id in array normalized_tag_ids loop
    insert into public.article_tags (article_id, tag_id, created_by)
    values (saved_article_id, selected_tag_id, caller_id)
    on conflict (article_id, tag_id) do nothing;
  end loop;

  return save_result;
end;
$$;

revoke all on function public.canonicalize_tag_catalog_row()
  from public, anon, authenticated;
revoke all on function public.validate_assignable_tag_ids(uuid[], uuid[])
  from public, anon, authenticated;
revoke all on function public.append_question_version_snapshot(uuid, uuid)
  from public, anon, authenticated;

revoke all on function public.create_catalog_tag(text) from public, anon;
revoke all on function public.rename_catalog_tag(uuid, text) from public, anon;
revoke all on function public.archive_catalog_tag(uuid) from public, anon;
revoke all on function public.reactivate_catalog_tag(uuid) from public, anon;
grant execute on function public.create_catalog_tag(text) to authenticated;
grant execute on function public.rename_catalog_tag(uuid, text) to authenticated;
grant execute on function public.archive_catalog_tag(uuid) to authenticated;
grant execute on function public.reactivate_catalog_tag(uuid) to authenticated;

revoke execute on function public.get_concept_tags(uuid) from public, anon;
grant execute on function public.get_concept_tags(uuid) to authenticated;

-- Retire client execution of the free-text save signatures.
revoke execute on function public.save_concept_with_version(
  uuid, text, text, uuid, uuid[], text[], text, jsonb
) from public, anon, authenticated;
revoke execute on function public.save_question_with_version(
  uuid, uuid, text, text, text, text, uuid, integer, text, text,
  jsonb, jsonb, uuid[]
) from public, anon, authenticated;
revoke execute on function public.save_article_draft(
  uuid, text, text, text, uuid, uuid[], uuid, text[], boolean
) from public, anon, authenticated;

revoke all on function public.save_concept_with_version(
  uuid, text, text, uuid, uuid[], uuid[], text, jsonb
) from public, anon;
grant execute on function public.save_concept_with_version(
  uuid, text, text, uuid, uuid[], uuid[], text, jsonb
) to authenticated;

revoke all on function public.save_question_with_version(
  uuid, uuid, text, text, text, text, uuid, integer, text, text,
  jsonb, jsonb, uuid[], uuid[]
) from public, anon;
grant execute on function public.save_question_with_version(
  uuid, uuid, text, text, text, text, uuid, integer, text, text,
  jsonb, jsonb, uuid[], uuid[]
) to authenticated;

revoke all on function public.save_article_draft(
  uuid, text, text, text, uuid, uuid[], uuid, uuid[], boolean
) from public, anon;
grant execute on function public.save_article_draft(
  uuid, text, text, text, uuid, uuid[], uuid, uuid[], boolean
) to authenticated;

commit;
