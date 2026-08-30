-- Structural deletion safety for Topic Trees and versioned Questions.
--
-- Topic Tree nodes may be moved normally, but physical deletion must not
-- cascade into curriculum placements or learner configuration. Persisted
-- Questions retain their stable identity and immutable history when removed
-- from active draft authoring.

begin;

-- Replace node-facing cascades with restrictive relationships. Existing rows
-- already satisfy these relationships; only their deletion behavior changes.
alter table public.library_nodes
  drop constraint library_nodes_parent_same_library_fkey;

alter table public.library_nodes
  add constraint library_nodes_parent_same_library_fkey
  foreign key (parent_id, library_id)
  references public.library_nodes (id, library_id)
  on delete restrict;

alter table public.concept_placements
  drop constraint concept_placements_library_node_id_fkey;

alter table public.concept_placements
  add constraint concept_placements_library_node_id_fkey
  foreign key (library_node_id)
  references public.library_nodes(id)
  on delete restrict;

alter table public.article_category_placements
  drop constraint article_category_placements_library_node_id_fkey;

alter table public.article_category_placements
  add constraint article_category_placements_library_node_id_fkey
  foreign key (library_node_id)
  references public.library_nodes(id)
  on delete restrict;

alter table public.user_study_node_selections
  drop constraint user_study_node_selections_node_id_fkey;

alter table public.user_study_node_selections
  add constraint user_study_node_selections_node_id_fkey
  foreign key (node_id)
  references public.library_nodes(id)
  on delete restrict;

alter table public.study_deck_node_preferences
  drop constraint study_deck_node_preferences_node_library_fkey;

alter table public.study_deck_node_preferences
  add constraint study_deck_node_preferences_node_library_fkey
  foreign key (library_node_id, library_id)
  references public.library_nodes(id, library_id)
  on delete restrict;

-- Root nodes are stable Library infrastructure. Protect deletion at the table
-- boundary, including cascaded deletion initiated through public.libraries.
-- Also prevent turning an existing root into a non-root as a deletion bypass.
create or replace function public.protect_library_root_node()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.parent_id is null then
      raise exception 'The library root cannot be deleted';
    end if;
    return old;
  end if;

  if old.parent_id is null
     and (
       new.parent_id is not null
       or new.library_id is distinct from old.library_id
     ) then
    raise exception 'The library root cannot be moved or reassigned directly';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_library_root_node_delete
  on public.library_nodes;
create trigger protect_library_root_node_delete
  before delete on public.library_nodes
  for each row execute function public.protect_library_root_node();

drop trigger if exists protect_library_root_node_structure
  on public.library_nodes;
create trigger protect_library_root_node_structure
  before update of parent_id, library_id on public.library_nodes
  for each row execute function public.protect_library_root_node();

revoke all on function public.protect_library_root_node()
  from public, anon, authenticated;

-- Delete only a truly empty non-root node. The target-row lock serializes
-- dependency checks against concurrent inserts that reference this node; the
-- restrictive foreign keys provide a final database-level guard.
create or replace function public.delete_empty_library_node_in_library(
  p_library_id uuid,
  p_node_id uuid
)
returns public.library_nodes
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_node public.library_nodes%rowtype;
  deleted_node public.library_nodes%rowtype;
begin
  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may remove library topics';
  end if;

  if p_library_id is null then
    raise exception 'Library is required';
  end if;

  if p_node_id is null then
    raise exception 'Topic is required';
  end if;

  select *
  into target_node
  from public.library_nodes ln
  where ln.id = p_node_id
  for update;

  if target_node.id is null then
    raise exception 'Topic was not found';
  end if;

  if target_node.library_id is distinct from p_library_id then
    raise exception 'Topic does not belong to the active library';
  end if;

  if target_node.parent_id is null then
    raise exception 'The library root cannot be removed';
  end if;

  if exists (
    select 1
    from public.library_nodes child
    where child.parent_id = p_node_id
  ) then
    raise exception
      'This topic contains subtopics. Move or remove those subtopics first';
  end if;

  if exists (
    select 1
    from public.concept_placements cp
    where cp.library_node_id = p_node_id
  ) then
    raise exception
      'This topic is linked to one or more concepts. Remove those topic assignments first';
  end if;

  if exists (
    select 1
    from public.article_category_placements acp
    where acp.library_node_id = p_node_id
  ) then
    raise exception
      'This topic is linked to one or more articles. Remove those article locations first';
  end if;

  if exists (
    select 1
    from public.user_study_node_selections usns
    where usns.node_id = p_node_id
  ) then
    raise exception
      'This topic is currently used in a study deck. Remove the study selection first';
  end if;

  if exists (
    select 1
    from public.study_deck_node_preferences sdnp
    where sdnp.library_node_id = p_node_id
  ) then
    raise exception
      'This topic has retained study preferences. Remove those preferences first';
  end if;

  delete from public.library_nodes
  where id = p_node_id
  returning * into deleted_node;

  return deleted_node;
end;
$$;

revoke all on function public.delete_empty_library_node_in_library(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.delete_empty_library_node_in_library(uuid, uuid)
  to authenticated;

-- A persisted draft Question already has an immutable version. "Delete Draft"
-- therefore removes it from active authoring by archiving the stable record,
-- while preserving its UUID, current/official pointers, and version history.
create or replace function public.delete_draft_question(
  p_question_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_question public.questions%rowtype;
begin
  if caller_id is null then
    raise exception 'Authenticated user is required';
  end if;

  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may remove draft questions';
  end if;

  select *
  into target_question
  from public.questions q
  where q.id = p_question_id
  for update;

  if target_question.id is null or target_question.status <> 'draft' then
    return false;
  end if;

  update public.questions
  set status = 'archived'
  where id = target_question.id;

  return true;
end;
$$;

revoke all on function public.delete_draft_question(uuid)
  from public, anon, authenticated;
grant execute on function public.delete_draft_question(uuid)
  to authenticated;

commit;
