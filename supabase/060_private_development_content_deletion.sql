-- Temporary private-development deletion controls.
--
-- These RPCs intentionally allow trusted editors/admins to remove disposable
-- framework content after reviewing a dependency summary. They are not the
-- final production retention model and are not exposed to learner roles.

begin;

create or replace function public.prevent_content_version_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('socrates.development_delete_actor', true)
       = coalesce((select auth.uid())::text, '')
     and public.is_editor_or_admin() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  raise exception '% rows are immutable; create a new version instead', tg_table_name;
end;
$$;

create or replace function public.prevent_article_version_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('socrates.development_delete_actor', true)
       = coalesce((select auth.uid())::text, '')
     and public.is_editor_or_admin() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  raise exception 'article_versions are immutable; create a new revision instead';
end;
$$;

create or replace function public.protect_library_root_node()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.parent_id is null then
    if tg_op = 'DELETE'
       and (
         current_setting('socrates.verified_empty_library_delete', true)
           = old.library_id::text
         or (
           current_setting('socrates.development_delete_actor', true)
             = coalesce((select auth.uid())::text, '')
           and public.is_editor_or_admin()
         )
       ) then
      return old;
    end if;

    if tg_op = 'DELETE' then
      raise exception 'The library root cannot be deleted.';
    end if;

    if new.parent_id is not null then
      raise exception 'The library root cannot be moved beneath another Topic Tree node.';
    end if;

    if new.library_id is distinct from old.library_id then
      raise exception 'The library root cannot be reassigned to another Library.';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.get_development_delete_summary(
  p_record_type text,
  p_record_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
  v_child_groups bigint := 0;
  v_libraries bigint := 0;
  v_nodes bigint := 0;
  v_concepts bigint := 0;
  v_questions bigint := 0;
  v_articles bigint := 0;
  v_attempts bigint := 0;
  v_versions bigint := 0;
  v_concept_assignments bigint := 0;
  v_question_assignments bigint := 0;
  v_article_assignments bigint := 0;
  v_warning text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;
  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may inspect deletion impact.';
  end if;

  case p_record_type
    when 'group' then
      select lg.name into v_name
      from public.library_groups lg where lg.id = p_record_id;
      if v_name is null then raise exception 'Library Group was not found.'; end if;

      with recursive group_tree as (
        select lg.id from public.library_groups lg where lg.id = p_record_id
        union all
        select child.id
        from public.library_groups child
        join group_tree parent on child.parent_id = parent.id
      ), group_libraries as (
        select distinct lgl.library_id
        from public.library_group_libraries lgl
        where lgl.group_id in (select id from group_tree)
      ), group_nodes as (
        select ln.id
        from public.library_nodes ln
        where ln.library_id in (select library_id from group_libraries)
      ), group_concepts as (
        select distinct cp.concept_id
        from public.concept_placements cp
        where cp.library_node_id in (select id from group_nodes)
      ), group_articles as (
        select distinct ap.article_id
        from public.article_category_placements ap
        where ap.library_node_id in (select id from group_nodes)
      )
      select
        (select greatest(count(*) - 1, 0) from group_tree),
        (select count(*) from group_libraries),
        (select count(*) from group_nodes),
        (select count(*) from group_concepts),
        (select count(*) from public.questions q where q.concept_id in (select concept_id from group_concepts)),
        (select count(*) from group_articles)
      into v_child_groups, v_libraries, v_nodes, v_concepts, v_questions, v_articles;

      v_warning := format(
        E'Delete this Group?\nThis Group contains %s child Groups, %s Libraries, %s Topic Tree nodes, %s Concepts, %s Questions, and %s Articles. Deleting it will permanently remove associated development content.',
        v_child_groups, v_libraries, v_nodes, v_concepts, v_questions, v_articles
      );

    when 'library' then
      select l.name into v_name from public.libraries l where l.id = p_record_id;
      if v_name is null then raise exception 'Library was not found.'; end if;

      select count(*) into v_nodes
      from public.library_nodes ln where ln.library_id = p_record_id;
      select count(distinct cp.concept_id) into v_concepts
      from public.concept_placements cp
      join public.library_nodes ln on ln.id = cp.library_node_id
      where ln.library_id = p_record_id;
      select count(*) into v_questions
      from public.questions q
      where q.concept_id in (
        select distinct cp.concept_id
        from public.concept_placements cp
        join public.library_nodes ln on ln.id = cp.library_node_id
        where ln.library_id = p_record_id
      );
      select count(distinct ap.article_id) into v_articles
      from public.article_category_placements ap
      join public.library_nodes ln on ln.id = ap.library_node_id
      where ln.library_id = p_record_id;

      v_warning := format(
        E'Delete this Library?\nThis Library contains %s Topic Tree nodes, %s Concepts, %s Questions, and %s Articles. Deleting it will permanently remove associated development content.',
        v_nodes, v_concepts, v_questions, v_articles
      );

    when 'library_node' then
      select ln.name into v_name
      from public.library_nodes ln where ln.id = p_record_id;
      if v_name is null then raise exception 'Topic Tree node was not found.'; end if;

      with recursive node_tree as (
        select ln.id from public.library_nodes ln where ln.id = p_record_id
        union all
        select child.id
        from public.library_nodes child
        join node_tree parent on child.parent_id = parent.id
      )
      select
        greatest((select count(*) from node_tree) - 1, 0),
        (select count(*) from public.concept_placements cp where cp.library_node_id in (select id from node_tree)),
        (select count(*) from public.article_category_placements ap where ap.library_node_id in (select id from node_tree))
      into v_nodes, v_concepts, v_articles;

      v_warning := format(
        E'Delete this branch?\nThis branch contains %s subtopics, %s Concept placements, and %s Article placements. Continuing will permanently remove this structure and its saved study preferences.',
        v_nodes, v_concepts, v_articles
      );

    when 'concept' then
      select c.name into v_name from public.concepts c where c.id = p_record_id;
      if v_name is null then raise exception 'Concept was not found.'; end if;
      select count(*) into v_questions from public.questions q where q.concept_id = p_record_id;
      select count(*) into v_attempts from public.review_attempts ra where ra.concept_id = p_record_id;
      select count(*) into v_versions from public.concept_versions cv where cv.concept_id = p_record_id;
      v_warning := format(
        E'Delete this Concept?\nThis Concept contains %s Questions, %s learner attempts, and %s immutable versions. Deleting it will permanently remove associated development and learner data.',
        v_questions, v_attempts, v_versions
      );

    when 'question' then
      select q.prompt into v_name from public.questions q where q.id = p_record_id;
      if v_name is null then raise exception 'Question was not found.'; end if;
      select count(*) into v_attempts from public.review_attempts ra where ra.question_id = p_record_id;
      select count(*) into v_versions from public.question_versions qv where qv.question_id = p_record_id;
      v_warning := format(
        E'Delete this Question?\nThis Question has %s learner attempts and %s immutable versions. Deleting it will permanently remove that development and learner history.',
        v_attempts, v_versions
      );

    when 'tag' then
      select t.name into v_name from public.tags t where t.id = p_record_id;
      if v_name is null then raise exception 'Tag was not found.'; end if;
      select count(*) into v_concept_assignments from public.concept_tags ct where ct.tag_id = p_record_id;
      select count(*) into v_question_assignments from public.question_tags qt where qt.tag_id = p_record_id;
      select count(*) into v_article_assignments from public.article_tags at where at.tag_id = p_record_id;
      v_warning := format(
        E'Delete this Tag?\nThis Tag is assigned to %s Concepts, %s Questions, and %s Articles. Deleting it will permanently remove those assignments; immutable snapshots retain their historical text.',
        v_concept_assignments, v_question_assignments, v_article_assignments
      );

    else
      raise exception 'Unsupported deletion type: %', p_record_type;
  end case;

  return jsonb_build_object(
    'record_type', p_record_type,
    'record_id', p_record_id,
    'name', v_name,
    'warning', v_warning,
    'child_groups', v_child_groups,
    'libraries', v_libraries,
    'nodes', v_nodes,
    'concepts', v_concepts,
    'questions', v_questions,
    'articles', v_articles,
    'attempts', v_attempts,
    'versions', v_versions,
    'concept_assignments', v_concept_assignments,
    'question_assignments', v_question_assignments,
    'article_assignments', v_article_assignments
  );
end;
$$;

create or replace function public._development_delete_question(p_question_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.review_attempts where question_id = p_question_id;
  delete from public.question_tags where question_id = p_question_id;
  delete from public.question_sources where question_id = p_question_id;
  delete from public.question_options where question_id = p_question_id;
  delete from public.question_accepted_answers where question_id = p_question_id;
  update public.questions
  set current_version_id = null, official_version_id = null
  where id = p_question_id;
  delete from public.question_versions where question_id = p_question_id;
  delete from public.questions where id = p_question_id;
end;
$$;

create or replace function public._development_delete_concept(p_concept_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_question_id uuid;
begin
  for v_question_id in
    select q.id from public.questions q where q.concept_id = p_concept_id
  loop
    perform public._development_delete_question(v_question_id);
  end loop;

  update public.questions
  set review_article_concept_id = null
  where review_article_concept_id in (
    select ac.id from public.article_concepts ac where ac.concept_id = p_concept_id
  );
  update public.question_versions
  set review_article_concept_id = null
  where review_article_concept_id in (
    select ac.id from public.article_concepts ac where ac.concept_id = p_concept_id
  );
  delete from public.article_concepts where concept_id = p_concept_id;
  delete from public.review_attempts where concept_id = p_concept_id;
  update public.concepts
  set current_version_id = null, official_version_id = null
  where id = p_concept_id;
  delete from public.concept_versions where concept_id = p_concept_id;
  delete from public.concepts where id = p_concept_id;
end;
$$;

create or replace function public._development_delete_article(p_article_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.article_sources where article_id = p_article_id;
  delete from public.article_tags where article_id = p_article_id;
  update public.questions
  set review_article_concept_id = null
  where review_article_concept_id in (
    select ac.id from public.article_concepts ac where ac.article_id = p_article_id
  );
  update public.question_versions
  set review_article_concept_id = null
  where review_article_concept_id in (
    select ac.id from public.article_concepts ac where ac.article_id = p_article_id
  );
  delete from public.article_concepts where article_id = p_article_id;
  delete from public.article_category_placements where article_id = p_article_id;
  update public.articles
  set current_version_id = null, published_version_id = null
  where id = p_article_id;
  delete from public.article_versions where article_id = p_article_id;
  delete from public.articles where id = p_article_id;
end;
$$;

create or replace function public._development_delete_library_node(p_node_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_parent_id uuid;
  v_node_id uuid;
begin
  select ln.parent_id into v_parent_id
  from public.library_nodes ln where ln.id = p_node_id for update;
  if not found then raise exception 'Topic Tree node was not found.'; end if;
  if v_parent_id is null then
    raise exception 'Delete the Library from Library Organizer to remove its root.';
  end if;

  with recursive node_tree as (
    select ln.id from public.library_nodes ln where ln.id = p_node_id
    union all
    select child.id from public.library_nodes child
    join node_tree parent on child.parent_id = parent.id
  )
  delete from public.study_deck_node_preferences p
  where p.library_node_id in (select id from node_tree);

  with recursive node_tree as (
    select ln.id from public.library_nodes ln where ln.id = p_node_id
    union all
    select child.id from public.library_nodes child
    join node_tree parent on child.parent_id = parent.id
  )
  delete from public.user_study_node_selections s
  where s.node_id in (select id from node_tree);

  with recursive node_tree as (
    select ln.id from public.library_nodes ln where ln.id = p_node_id
    union all
    select child.id from public.library_nodes child
    join node_tree parent on child.parent_id = parent.id
  )
  delete from public.concept_placements p
  where p.library_node_id in (select id from node_tree);

  with recursive node_tree as (
    select ln.id from public.library_nodes ln where ln.id = p_node_id
    union all
    select child.id from public.library_nodes child
    join node_tree parent on child.parent_id = parent.id
  )
  delete from public.article_category_placements p
  where p.library_node_id in (select id from node_tree);

  for v_node_id in
    with recursive node_tree as (
      select ln.id, 0 as depth from public.library_nodes ln where ln.id = p_node_id
      union all
      select child.id, parent.depth + 1
      from public.library_nodes child
      join node_tree parent on child.parent_id = parent.id
    )
    select id from node_tree order by depth desc
  loop
    delete from public.library_nodes where id = v_node_id;
  end loop;
end;
$$;

create or replace function public._development_delete_library(p_library_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_concept_id uuid;
  v_article_id uuid;
  v_node_id uuid;
begin
  perform 1 from public.libraries l where l.id = p_library_id for update;
  if not found then raise exception 'Library was not found.'; end if;

  delete from public.review_attempts ra
  where ra.study_session_id in (
    select ss.id from public.study_sessions ss where ss.library_id = p_library_id
  );
  delete from public.study_sessions where library_id = p_library_id;
  delete from public.study_deck_node_preferences where library_id = p_library_id;
  delete from public.user_study_node_selections where library_id = p_library_id;
  delete from public.user_study_concept_overrides where library_id = p_library_id;
  delete from public.study_decks where library_id = p_library_id;
  delete from public.user_libraries where library_id = p_library_id;

  for v_article_id in
    select distinct ap.article_id
    from public.article_category_placements ap
    join public.library_nodes ln on ln.id = ap.library_node_id
    where ln.library_id = p_library_id
  loop
    perform public._development_delete_article(v_article_id);
  end loop;

  for v_concept_id in
    select distinct cp.concept_id
    from public.concept_placements cp
    join public.library_nodes ln on ln.id = cp.library_node_id
    where ln.library_id = p_library_id
  loop
    perform public._development_delete_concept(v_concept_id);
  end loop;

  delete from public.library_group_libraries where library_id = p_library_id;
  delete from public.study_deck_node_preferences where library_id = p_library_id;
  delete from public.user_study_node_selections where library_id = p_library_id;
  delete from public.concept_placements
  where library_node_id in (select id from public.library_nodes where library_id = p_library_id);
  delete from public.article_category_placements
  where library_node_id in (select id from public.library_nodes where library_id = p_library_id);

  for v_node_id in
    with recursive node_tree as (
      select ln.id, 0 as depth
      from public.library_nodes ln
      where ln.library_id = p_library_id and ln.parent_id is null
      union all
      select child.id, parent.depth + 1
      from public.library_nodes child
      join node_tree parent on child.parent_id = parent.id
    )
    select id from node_tree order by depth desc
  loop
    delete from public.library_nodes where id = v_node_id;
  end loop;

  delete from public.libraries where id = p_library_id;
end;
$$;

create or replace function public._development_delete_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_library_id uuid;
  v_group_id uuid;
begin
  perform 1 from public.library_groups lg where lg.id = p_group_id for update;
  if not found then raise exception 'Library Group was not found.'; end if;

  for v_library_id in
    with recursive group_tree as (
      select lg.id from public.library_groups lg where lg.id = p_group_id
      union all
      select child.id from public.library_groups child
      join group_tree parent on child.parent_id = parent.id
    )
    select distinct lgl.library_id
    from public.library_group_libraries lgl
    where lgl.group_id in (select id from group_tree)
  loop
    perform public._development_delete_library(v_library_id);
  end loop;

  for v_group_id in
    with recursive group_tree as (
      select lg.id, 0 as depth from public.library_groups lg where lg.id = p_group_id
      union all
      select child.id, parent.depth + 1
      from public.library_groups child
      join group_tree parent on child.parent_id = parent.id
    )
    select id from group_tree order by depth desc
  loop
    delete from public.library_groups where id = v_group_id;
  end loop;
end;
$$;

create or replace function public._development_delete_tag(p_tag_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.concept_tags where tag_id = p_tag_id;
  delete from public.question_tags where tag_id = p_tag_id;
  delete from public.article_tags where tag_id = p_tag_id;
  delete from public.tags where id = p_tag_id;
end;
$$;

create or replace function public.delete_development_content(
  p_record_type text,
  p_record_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'Authentication required.'; end if;
  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may permanently delete development content.';
  end if;

  -- Lock/validate the requested identity before enabling the narrowly scoped
  -- immutable/root trigger bypass for this transaction.
  perform public.get_development_delete_summary(p_record_type, p_record_id);
  perform set_config('socrates.development_delete_actor', v_actor::text, true);

  case p_record_type
    when 'group' then perform public._development_delete_group(p_record_id);
    when 'library' then perform public._development_delete_library(p_record_id);
    when 'library_node' then perform public._development_delete_library_node(p_record_id);
    when 'concept' then perform public._development_delete_concept(p_record_id);
    when 'question' then perform public._development_delete_question(p_record_id);
    when 'tag' then perform public._development_delete_tag(p_record_id);
    else raise exception 'Unsupported deletion type: %', p_record_type;
  end case;

  return p_record_id;
end;
$$;

revoke all on function public.get_development_delete_summary(text, uuid)
  from public, anon, authenticated;
revoke all on function public.delete_development_content(text, uuid)
  from public, anon, authenticated;
grant execute on function public.get_development_delete_summary(text, uuid)
  to authenticated;
grant execute on function public.delete_development_content(text, uuid)
  to authenticated;

revoke all on function public._development_delete_question(uuid)
  from public, anon, authenticated;
revoke all on function public._development_delete_concept(uuid)
  from public, anon, authenticated;
revoke all on function public._development_delete_article(uuid)
  from public, anon, authenticated;
revoke all on function public._development_delete_library_node(uuid)
  from public, anon, authenticated;
revoke all on function public._development_delete_library(uuid)
  from public, anon, authenticated;
revoke all on function public._development_delete_group(uuid)
  from public, anon, authenticated;
revoke all on function public._development_delete_tag(uuid)
  from public, anon, authenticated;

commit;
