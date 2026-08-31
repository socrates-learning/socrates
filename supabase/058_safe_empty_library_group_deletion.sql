begin;

create or replace function public.empty_library_delete_block_reason(
  p_library_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_root_count bigint;
  v_node_count bigint;
  v_concept_ids uuid[];
begin
  if not exists (
    select 1
    from public.libraries l
    where l.id = p_library_id
  ) then
    return 'Library was not found.';
  end if;

  select
    count(*) filter (where ln.parent_id is null),
    count(*)
  into v_root_count, v_node_count
  from public.library_nodes ln
  where ln.library_id = p_library_id;

  if v_root_count <> 1 then
    return format(
      'Library must have exactly one root Topic Tree node before deletion (found %s).',
      v_root_count
    );
  end if;

  if v_node_count <> 1 then
    return 'Library still has non-root Topic Tree nodes. Remove or archive that structure first.';
  end if;

  select coalesce(array_agg(distinct attributable.concept_id), array[]::uuid[])
  into v_concept_ids
  from (
    select cp.concept_id
    from public.concept_placements cp
    join public.library_nodes ln on ln.id = cp.library_node_id
    where ln.library_id = p_library_id

    union

    select cv.concept_id
    from public.concept_versions cv
    cross join lateral jsonb_array_elements(cv.placements_snapshot) placement
    where placement ->> 'library_id' = p_library_id::text
  ) attributable;

  if exists (
    select 1
    from public.concept_placements cp
    join public.library_nodes ln on ln.id = cp.library_node_id
    where ln.library_id = p_library_id
  ) then
    return 'Library still has Concept placements. Remove or archive that curriculum first.';
  end if;

  if exists (
    select 1
    from public.article_category_placements ap
    join public.library_nodes ln on ln.id = ap.library_node_id
    where ln.library_id = p_library_id
  ) then
    return 'Library still has Article placements. Remove or archive that curriculum first.';
  end if;

  if cardinality(v_concept_ids) > 0 then
    if exists (
      select 1
      from public.review_attempts ra
      where ra.concept_id = any(v_concept_ids)
         or exists (
           select 1
           from public.questions q
           where q.id = ra.question_id
             and q.concept_id = any(v_concept_ids)
         )
    ) then
      return 'Library content has learner review history and cannot be permanently deleted.';
    end if;

    if exists (
      select 1
      from public.user_concept_mastery ucm
      where ucm.concept_id = any(v_concept_ids)
    ) or exists (
      select 1
      from public.user_concept_testing_angle_state uctas
      where uctas.concept_id = any(v_concept_ids)
    ) or exists (
      select 1
      from public.user_submastery us
      where us.concept_id = any(v_concept_ids)
    ) or exists (
      select 1
      from public.user_notes un
      where un.concept_id = any(v_concept_ids)
    ) then
      return 'Library content has learner-state history and cannot be permanently deleted.';
    end if;

    if exists (
      select 1
      from public.questions q
      where q.concept_id = any(v_concept_ids)
    ) or exists (
      select 1
      from public.question_versions qv
      where qv.concept_id = any(v_concept_ids)
    ) then
      return 'Library content has Question history and cannot be permanently deleted.';
    end if;

    return 'Library has immutable Concept placement history and cannot be permanently deleted.';
  end if;

  if exists (
    select 1
    from public.study_sessions ss
    where ss.library_id = p_library_id
  ) then
    return 'Library has Study Session history and cannot be permanently deleted.';
  end if;

  if exists (
    select 1
    from public.study_decks sd
    where sd.library_id = p_library_id
  ) then
    return 'Library still has Study Decks. Remove those disposable decks first.';
  end if;

  if exists (
    select 1
    from public.user_libraries ul
    where ul.library_id = p_library_id
  ) then
    return 'Library still has user memberships. Remove those disposable memberships first.';
  end if;

  if exists (
    select 1
    from public.user_study_node_selections usns
    where usns.library_id = p_library_id
  ) then
    return 'Library still has saved Study node selections.';
  end if;

  if exists (
    select 1
    from public.user_study_concept_overrides usco
    where usco.library_id = p_library_id
  ) then
    return 'Library still has saved Study Concept overrides.';
  end if;

  if exists (
    select 1
    from public.study_deck_node_preferences sdnp
    where sdnp.library_id = p_library_id
  ) then
    return 'Library still has retained Study node preferences.';
  end if;

  return null;
end;
$$;

revoke all on function public.empty_library_delete_block_reason(uuid) from public;
revoke all on function public.empty_library_delete_block_reason(uuid) from anon;
revoke all on function public.empty_library_delete_block_reason(uuid) from authenticated;

create or replace function public.protect_library_root_node()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.parent_id is null then
    if tg_op = 'DELETE'
       and current_setting('socrates.verified_empty_library_delete', true) = old.library_id::text
       and public.empty_library_delete_block_reason(old.library_id) is null then
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

create or replace function public.get_library_organizer_delete_eligibility()
returns table (
  record_type text,
  record_id uuid,
  can_delete boolean,
  reason text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.is_editor_or_admin() then
    raise exception 'Editor or admin role required.';
  end if;

  return query
  select
    'group'::text,
    lg.id,
    not exists (
      select 1
      from public.library_groups child
      where child.parent_id = lg.id
    ) and not exists (
      select 1
      from public.library_group_libraries lgl
      where lgl.group_id = lg.id
    ),
    case
      when exists (
        select 1
        from public.library_groups child
        where child.parent_id = lg.id
      ) then 'Group still has child Groups.'
      when exists (
        select 1
        from public.library_group_libraries lgl
        where lgl.group_id = lg.id
      ) then 'Group still contains Libraries.'
      else null
    end
  from public.library_groups lg;

  return query
  select
    'library'::text,
    l.id,
    blocker.reason is null,
    blocker.reason
  from public.libraries l
  cross join lateral (
    select public.empty_library_delete_block_reason(l.id) as reason
  ) blocker;
end;
$$;

revoke all on function public.get_library_organizer_delete_eligibility() from public;
revoke all on function public.get_library_organizer_delete_eligibility() from anon;
revoke all on function public.get_library_organizer_delete_eligibility() from authenticated;
grant execute on function public.get_library_organizer_delete_eligibility() to authenticated;

create or replace function public.delete_empty_library_group(
  p_group_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_group_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.is_editor_or_admin() then
    raise exception 'Editor or admin role required.';
  end if;

  select lg.id
  into v_group_id
  from public.library_groups lg
  where lg.id = p_group_id
  for update;

  if v_group_id is null then
    raise exception 'Library Group was not found.';
  end if;

  if exists (
    select 1
    from public.library_groups child
    where child.parent_id = p_group_id
  ) then
    raise exception 'Group still has child Groups. Move or remove them first.';
  end if;

  if exists (
    select 1
    from public.library_group_libraries lgl
    where lgl.group_id = p_group_id
  ) then
    raise exception 'Group still contains Libraries. Move them first.';
  end if;

  delete from public.library_groups lg
  where lg.id = p_group_id;

  return p_group_id;
end;
$$;

revoke all on function public.delete_empty_library_group(uuid) from public;
revoke all on function public.delete_empty_library_group(uuid) from anon;
revoke all on function public.delete_empty_library_group(uuid) from authenticated;
grant execute on function public.delete_empty_library_group(uuid) to authenticated;

create or replace function public.delete_empty_library(
  p_library_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_library_id uuid;
  v_root_id uuid;
  v_block_reason text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.is_editor_or_admin() then
    raise exception 'Editor or admin role required.';
  end if;

  select l.id
  into v_library_id
  from public.libraries l
  where l.id = p_library_id
  for update;

  if v_library_id is null then
    raise exception 'Library was not found.';
  end if;

  select ln.id
  into v_root_id
  from public.library_nodes ln
  where ln.library_id = p_library_id
    and ln.parent_id is null
  for update;

  v_block_reason := public.empty_library_delete_block_reason(p_library_id);
  if v_block_reason is not null then
    raise exception '%', v_block_reason;
  end if;

  delete from public.library_group_libraries lgl
  where lgl.library_id = p_library_id;

  perform set_config(
    'socrates.verified_empty_library_delete',
    p_library_id::text,
    true
  );

  delete from public.library_nodes ln
  where ln.id = v_root_id;

  if not found then
    raise exception 'Verified Library root could not be deleted.';
  end if;

  delete from public.libraries l
  where l.id = p_library_id;

  if not found then
    raise exception 'Verified empty Library could not be deleted.';
  end if;

  return p_library_id;
end;
$$;

revoke all on function public.delete_empty_library(uuid) from public;
revoke all on function public.delete_empty_library(uuid) from anon;
revoke all on function public.delete_empty_library(uuid) from authenticated;
grant execute on function public.delete_empty_library(uuid) to authenticated;

commit;
