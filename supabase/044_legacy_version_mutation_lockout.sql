-- Close authenticated-client access to legacy non-version-aware Concept and
-- Question mutation RPCs after the version-aware clients are deployed.
--
-- The version-aware RPCs remain client-callable. They execute the retained
-- legacy helpers as their SECURITY DEFINER owner, so revoking client EXECUTE
-- does not break internal reuse.

revoke execute on function public.save_concept_draft(
  uuid,
  text,
  text,
  uuid,
  uuid[],
  text[]
) from public, anon, authenticated;

revoke execute on function public.sync_concept_references(uuid, jsonb)
  from public, anon, authenticated;

revoke execute on function public.import_seed_concept(jsonb, jsonb)
  from public, anon, authenticated;

revoke execute on function public.create_question(
  uuid,
  text,
  text,
  text,
  uuid,
  integer,
  text,
  text
) from public, anon, authenticated;

revoke execute on function public.update_question(
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  integer,
  text,
  text
) from public, anon, authenticated;

revoke execute on function public.replace_question_accepted_answers(uuid, jsonb)
  from public, anon, authenticated;

revoke execute on function public.replace_question_options(uuid, jsonb)
  from public, anon, authenticated;

revoke execute on function public.attach_question_source(uuid, uuid, text)
  from public, anon, authenticated;

revoke execute on function public.detach_question_source(uuid)
  from public, anon, authenticated;

-- Remove browser-role mutation access to the live records and child rows that
-- are captured by Concept and Question versions. SELECT policies and SELECT
-- privileges are intentionally left unchanged.
drop policy if exists "Creators can insert concepts" on public.concepts;
drop policy if exists "Creators can update own concepts" on public.concepts;
drop policy if exists "Editors can manage concepts" on public.concepts;
drop policy if exists "Editors can insert concepts" on public.concepts;
drop policy if exists "Editors insert concepts" on public.concepts;
drop policy if exists "Editors update concepts" on public.concepts;

drop policy if exists "Editors can manage concept placements"
  on public.concept_placements;
drop policy if exists "Editors insert concept placements"
  on public.concept_placements;

drop policy if exists "Editors manage concept tags"
  on public.concept_tags;

drop policy if exists "Editors manage questions" on public.questions;
drop policy if exists "Editors manage question options"
  on public.question_options;
drop policy if exists "Editors manage short-answer keys"
  on public.question_accepted_answers;
drop policy if exists "Editors manage question sources"
  on public.question_sources;

revoke insert, update, delete on table
  public.concepts,
  public.concept_placements,
  public.concept_tags,
  public.questions,
  public.question_options,
  public.question_accepted_answers,
  public.question_sources
from public, anon, authenticated;

-- content_source_notes also stores learn-section attribution, which is not a
-- Concept-version child. Remove Concept-link mutation while retaining the
-- existing editor workflow for source links owned by learn sections.
drop policy if exists "Editors attach own sources to own concepts"
  on public.content_source_notes;
drop policy if exists "Editors attach own sources to concepts"
  on public.content_source_notes;
drop policy if exists "Editors attach own sources to learn sections"
  on public.content_source_notes;

create policy "Editors attach own sources to learn sections"
  on public.content_source_notes
  for insert
  to authenticated
  with check (
    public.is_editor_or_admin()
    and created_by = (select auth.uid())
    and concept_id is null
    and learn_section_id is not null
    and exists (
      select 1
      from public.sources s
      where s.id = source_id
        and s.created_by = (select auth.uid())
    )
    and exists (
      select 1
      from public.learn_sections ls
      where ls.id = learn_section_id
    )
  );

revoke insert, update, delete on table public.content_source_notes
  from public, anon;
revoke update, delete on table public.content_source_notes
  from authenticated;
grant insert on table public.content_source_notes to authenticated;

-- Article Editor creates draft Concepts through this separate RPC. Preserve
-- that Article workflow, but make its Concept creation version-aware so it is
-- not an alternate unversioned Concept creation path.
create or replace function public.create_article_core_concept(
  p_article_id uuid,
  p_name text,
  p_summary text,
  p_active_library_id uuid,
  p_library_node_ids uuid[],
  p_section_anchor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  normalized_placement_ids uuid[];
  placement_node_id uuid;
  new_concept_id uuid;
  new_version_id uuid;
  linked_row public.article_concepts%rowtype;
begin
  if caller_id is null then
    raise exception 'Authenticated user is required';
  end if;

  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may create article concepts';
  end if;

  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'Concept name is required';
  end if;

  if p_active_library_id is null then
    raise exception 'Active library is required';
  end if;

  if not exists (select 1 from public.articles a where a.id = p_article_id) then
    raise exception 'Article was not found';
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

  insert into public.concepts (
    name,
    concept_type,
    importance,
    difficulty,
    summary,
    status,
    is_public,
    created_by
  )
  values (
    btrim(p_name),
    'core_concept',
    'Medium',
    'Beginner',
    nullif(btrim(coalesce(p_summary, '')), ''),
    'draft',
    false,
    caller_id
  )
  returning id into new_concept_id;

  foreach placement_node_id in array normalized_placement_ids loop
    insert into public.concept_placements (
      concept_id,
      library_node_id,
      sort_order
    )
    values (
      new_concept_id,
      placement_node_id,
      0
    )
    on conflict (concept_id, library_node_id) do nothing;
  end loop;

  insert into public.article_concepts (
    article_id,
    concept_id,
    role,
    section_anchor,
    created_by
  )
  values (
    p_article_id,
    new_concept_id,
    'discussed',
    nullif(btrim(coalesce(p_section_anchor, '')), ''),
    caller_id
  )
  returning * into linked_row;

  new_version_id := public.append_concept_version_snapshot(
    new_concept_id,
    caller_id
  );

  return jsonb_build_object(
    'concept_id', new_concept_id,
    'article_concept_id', linked_row.id,
    'status', 'draft',
    'version_id', new_version_id
  );
end;
$$;

revoke execute on function public.create_article_core_concept(
  uuid,
  text,
  text,
  uuid,
  uuid[],
  text
) from public, anon;
grant execute on function public.create_article_core_concept(
  uuid,
  text,
  text,
  uuid,
  uuid[],
  text
) to authenticated;

-- Reassert the intended public surface for version-aware saves.
revoke execute on function public.save_concept_with_version(
  uuid,
  text,
  text,
  uuid,
  uuid[],
  text[],
  text,
  jsonb
) from public, anon;
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

revoke execute on function public.save_question_with_version(
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
) from public, anon;
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

do $validation$
declare
  unexpected_policies text;
  unexpected_privileges text;
  unexpected_column_privileges text;
begin
  select string_agg(format('%I.%I', tablename, policyname), ', ')
  into unexpected_policies
  from pg_policies
  where schemaname = 'public'
    and tablename in (
      'concepts',
      'concept_placements',
      'concept_tags',
      'questions',
      'question_options',
      'question_accepted_answers',
      'question_sources'
    )
    and cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')
    and roles && array['public', 'anon', 'authenticated']::name[];

  if unexpected_policies is not null then
    raise exception
      'Client mutation policies remain on version-controlled content: %',
      unexpected_policies;
  end if;

  select string_agg(
    format('%I.%I:%s:%s', table_schema, table_name, grantee, privilege_type),
    ', '
  )
  into unexpected_privileges
  from information_schema.table_privileges
  where table_schema = 'public'
    and table_name in (
      'concepts',
      'concept_placements',
      'concept_tags',
      'questions',
      'question_options',
      'question_accepted_answers',
      'question_sources'
    )
    and lower(grantee) in ('public', 'anon', 'authenticated')
    and privilege_type in ('INSERT', 'UPDATE', 'DELETE');

  if unexpected_privileges is not null then
    raise exception
      'Client table mutation privileges remain on version-controlled content: %',
      unexpected_privileges;
  end if;

  select string_agg(
    format(
      '%I.%I.%I:%s:%s',
      table_schema,
      table_name,
      column_name,
      grantee,
      privilege_type
    ),
    ', '
  )
  into unexpected_column_privileges
  from information_schema.column_privileges
  where table_schema = 'public'
    and table_name in (
      'concepts',
      'concept_placements',
      'concept_tags',
      'questions',
      'question_options',
      'question_accepted_answers',
      'question_sources'
    )
    and lower(grantee) in ('public', 'anon', 'authenticated')
    and privilege_type in ('INSERT', 'UPDATE');

  if unexpected_column_privileges is not null then
    raise exception
      'Client column mutation privileges remain on version-controlled content: %',
      unexpected_column_privileges;
  end if;

  select string_agg(format('%I.%I', tablename, policyname), ', ')
  into unexpected_policies
  from pg_policies
  where schemaname = 'public'
    and tablename = 'content_source_notes'
    and roles && array['public', 'anon', 'authenticated']::name[]
    and cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')
    and not (
      cmd = 'INSERT'
      and policyname = 'Editors attach own sources to learn sections'
      and roles && array['authenticated']::name[]
    );

  if unexpected_policies is not null then
    raise exception
      'Unexpected client mutation policies remain on content_source_notes: %',
      unexpected_policies;
  end if;

  select string_agg(
    format('%I.%I:%s:%s', table_schema, table_name, grantee, privilege_type),
    ', '
  )
  into unexpected_privileges
  from information_schema.table_privileges
  where table_schema = 'public'
    and table_name = 'content_source_notes'
    and (
      (
        lower(grantee) in ('public', 'anon')
        and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
      )
      or (
        lower(grantee) = 'authenticated'
        and privilege_type in ('UPDATE', 'DELETE')
      )
    );

  if unexpected_privileges is not null then
    raise exception
      'Unexpected client table mutation privileges remain on content_source_notes: %',
      unexpected_privileges;
  end if;

  select string_agg(
    format(
      '%I.%I.%I:%s:%s',
      table_schema,
      table_name,
      column_name,
      grantee,
      privilege_type
    ),
    ', '
  )
  into unexpected_column_privileges
  from information_schema.column_privileges
  where table_schema = 'public'
    and table_name = 'content_source_notes'
    and (
      (
        lower(grantee) in ('public', 'anon')
        and privilege_type in ('INSERT', 'UPDATE')
      )
      or (
        lower(grantee) = 'authenticated'
        and privilege_type = 'UPDATE'
      )
    );

  if unexpected_column_privileges is not null then
    raise exception
      'Unexpected client column mutation privileges remain on content_source_notes: %',
      unexpected_column_privileges;
  end if;
end
$validation$;

-- Deployment note: apply only after the updated clients are live and any
-- in-flight legacy saves have drained. A stale client then fails its first
-- legacy RPC at permission checking, before that function can mutate data.
