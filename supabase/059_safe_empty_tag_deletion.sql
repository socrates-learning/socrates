-- Guarded hard deletion for disposable, completely unused Tag identities.
-- Established Tags remain lifecycle-managed through archive/reactivate.

begin;

create or replace function public.empty_tag_delete_block_reason(p_tag_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_tag public.tags%rowtype;
  concept_assignment_count bigint;
  question_assignment_count bigint;
  article_assignment_count bigint;
  concept_history_count bigint;
  question_history_count bigint;
  article_history_count bigint;
  block_reasons text[] := array[]::text[];
begin
  if caller_id is null then
    raise exception 'Authenticated user is required';
  end if;
  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may delete unused tags';
  end if;

  select *
  into target_tag
  from public.tags t
  where t.id = p_tag_id
  for update;

  if target_tag.id is null then
    raise exception 'Tag was not found';
  end if;

  select count(distinct ct.concept_id)
  into concept_assignment_count
  from public.concept_tags ct
  where ct.tag_id = p_tag_id;

  select count(distinct qt.question_id)
  into question_assignment_count
  from public.question_tags qt
  where qt.tag_id = p_tag_id;

  select count(distinct at.article_id)
  into article_assignment_count
  from public.article_tags at
  where at.tag_id = p_tag_id;

  select count(*)
  into concept_history_count
  from public.concept_versions cv
  where exists (
    select 1
    from jsonb_array_elements(cv.tags_snapshot) snapshot_tag
    where snapshot_tag ->> 'tag_id' = p_tag_id::text
  );

  select count(*)
  into question_history_count
  from public.question_versions qv
  where exists (
    select 1
    from jsonb_array_elements(qv.tags_snapshot) snapshot_tag
    where snapshot_tag ->> 'tag_id' = p_tag_id::text
  );

  -- Article versions do not currently carry tags_snapshot. Reading the row as
  -- jsonb keeps this guard compatible if that immutable snapshot is added.
  select count(*)
  into article_history_count
  from public.article_versions av
  where exists (
    select 1
    from jsonb_array_elements(
      case
        when jsonb_typeof(to_jsonb(av) -> 'tags_snapshot') = 'array'
          then to_jsonb(av) -> 'tags_snapshot'
        else '[]'::jsonb
      end
    ) snapshot_tag
    where snapshot_tag ->> 'tag_id' = p_tag_id::text
  );

  if concept_assignment_count > 0 then
    block_reasons := array_append(
      block_reasons,
      format(
        'Tag is assigned to %s Concept%s',
        concept_assignment_count,
        case when concept_assignment_count = 1 then '' else 's' end
      )
    );
  end if;

  if question_assignment_count > 0 then
    block_reasons := array_append(
      block_reasons,
      format(
        'Tag is assigned to %s Question%s',
        question_assignment_count,
        case when question_assignment_count = 1 then '' else 's' end
      )
    );
  end if;

  if article_assignment_count > 0 then
    block_reasons := array_append(
      block_reasons,
      format(
        'Tag is assigned to %s Article%s',
        article_assignment_count,
        case when article_assignment_count = 1 then '' else 's' end
      )
    );
  end if;

  if concept_history_count + question_history_count + article_history_count > 0 then
    block_reasons := array_append(
      block_reasons,
      'Tag is retained in immutable content history'
    );
  end if;

  if cardinality(block_reasons) = 0 then
    return null;
  end if;
  return array_to_string(block_reasons, '; ');
end;
$$;

create or replace function public.delete_empty_tag(p_tag_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_tag public.tags%rowtype;
  block_reason text;
begin
  if caller_id is null then
    raise exception 'Authenticated user is required';
  end if;
  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may delete unused tags';
  end if;

  select *
  into target_tag
  from public.tags t
  where t.id = p_tag_id
  for update;

  if target_tag.id is null then
    raise exception 'Tag was not found';
  end if;

  -- The same transaction retains the row lock while dependencies are checked
  -- and the final delete is attempted.
  block_reason := public.empty_tag_delete_block_reason(p_tag_id);
  if block_reason is not null then
    raise exception '%', block_reason;
  end if;

  begin
    delete from public.tags t where t.id = p_tag_id;
  exception
    when foreign_key_violation then
      raise exception 'Tag has another protected dependency';
  end;

  return p_tag_id;
end;
$$;

revoke all on function public.empty_tag_delete_block_reason(uuid)
  from public, anon, authenticated;
revoke all on function public.delete_empty_tag(uuid)
  from public, anon, authenticated;

grant execute on function public.empty_tag_delete_block_reason(uuid)
  to authenticated;
grant execute on function public.delete_empty_tag(uuid)
  to authenticated;

commit;
