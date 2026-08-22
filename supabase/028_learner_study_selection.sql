-- Task C1: Learner study selection foundation.
-- Persists user-selected library branches and concept-level include/exclude
-- overrides without copying content or changing learner delivery/mastery logic.

create table if not exists public.user_study_node_selections (
  user_id uuid not null references auth.users(id) on delete cascade,
  library_id uuid not null references public.libraries(id) on delete cascade,
  node_id uuid not null references public.library_nodes(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, library_id, node_id)
);

create table if not exists public.user_study_concept_overrides (
  user_id uuid not null references auth.users(id) on delete cascade,
  library_id uuid not null references public.libraries(id) on delete cascade,
  concept_id uuid not null references public.concepts(id) on delete cascade,
  selection_state text not null
    constraint user_study_concept_overrides_selection_state_check
    check (selection_state in ('included', 'excluded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, library_id, concept_id)
);

create index if not exists user_study_node_selections_user_library_idx
  on public.user_study_node_selections(user_id, library_id);
create index if not exists user_study_node_selections_node_id_idx
  on public.user_study_node_selections(node_id);
create index if not exists user_study_concept_overrides_user_library_idx
  on public.user_study_concept_overrides(user_id, library_id);
create index if not exists user_study_concept_overrides_concept_id_idx
  on public.user_study_concept_overrides(concept_id);
create index if not exists user_study_concept_overrides_selection_state_idx
  on public.user_study_concept_overrides(selection_state);

create or replace function public.set_user_study_selection_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_user_study_node_selections_updated_at
  on public.user_study_node_selections;
create trigger set_user_study_node_selections_updated_at
  before update on public.user_study_node_selections
  for each row execute function public.set_user_study_selection_updated_at();

drop trigger if exists set_user_study_concept_overrides_updated_at
  on public.user_study_concept_overrides;
create trigger set_user_study_concept_overrides_updated_at
  before update on public.user_study_concept_overrides
  for each row execute function public.set_user_study_selection_updated_at();

alter table public.user_study_node_selections enable row level security;
alter table public.user_study_concept_overrides enable row level security;

drop policy if exists "Users read own study node selections"
  on public.user_study_node_selections;
create policy "Users read own study node selections"
  on public.user_study_node_selections
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users create own study node selections"
  on public.user_study_node_selections;
create policy "Users create own study node selections"
  on public.user_study_node_selections
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.library_nodes ln
      where ln.id = user_study_node_selections.node_id
        and ln.library_id = user_study_node_selections.library_id
    )
    and (
      public.is_editor_or_admin()
      or exists (
        select 1
        from public.user_libraries ul
        where ul.user_id = (select auth.uid())
          and ul.library_id = user_study_node_selections.library_id
      )
    )
  );

drop policy if exists "Users delete own study node selections"
  on public.user_study_node_selections;
create policy "Users delete own study node selections"
  on public.user_study_node_selections
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users read own study concept overrides"
  on public.user_study_concept_overrides;
create policy "Users read own study concept overrides"
  on public.user_study_concept_overrides
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users manage own study concept overrides"
  on public.user_study_concept_overrides;
create policy "Users manage own study concept overrides"
  on public.user_study_concept_overrides
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.concept_placements cp
      join public.library_nodes ln on ln.id = cp.library_node_id
      where cp.concept_id = user_study_concept_overrides.concept_id
        and ln.library_id = user_study_concept_overrides.library_id
    )
    and (
      public.is_editor_or_admin()
      or exists (
        select 1
        from public.user_libraries ul
        where ul.user_id = (select auth.uid())
          and ul.library_id = user_study_concept_overrides.library_id
      )
    )
  );

create or replace function public.resolve_user_study_plan(
  p_library_id uuid
)
returns table (
  concept_id uuid,
  concept_name text,
  concept_type text,
  summary text,
  published_question_count bigint,
  selection_source text
)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive selected_nodes as (
    select usns.node_id
    from public.user_study_node_selections usns
    join public.library_nodes ln on ln.id = usns.node_id
    where usns.user_id = (select auth.uid())
      and usns.library_id = p_library_id
      and ln.library_id = p_library_id

    union

    select child.id
    from public.library_nodes child
    join selected_nodes parent on parent.node_id = child.parent_id
    where child.library_id = p_library_id
  ),
  branch_concepts as (
    select distinct cp.concept_id
    from selected_nodes sn
    join public.concept_placements cp on cp.library_node_id = sn.node_id
    join public.concepts c on c.id = cp.concept_id
    where c.status = 'published'
  ),
  included_concepts as (
    select distinct usco.concept_id
    from public.user_study_concept_overrides usco
    join public.concepts c on c.id = usco.concept_id
    where usco.user_id = (select auth.uid())
      and usco.library_id = p_library_id
      and usco.selection_state = 'included'
      and c.status = 'published'
      and exists (
        select 1
        from public.concept_placements cp
        join public.library_nodes ln on ln.id = cp.library_node_id
        where cp.concept_id = usco.concept_id
          and ln.library_id = p_library_id
      )
  ),
  excluded_concepts as (
    select distinct usco.concept_id
    from public.user_study_concept_overrides usco
    where usco.user_id = (select auth.uid())
      and usco.library_id = p_library_id
      and usco.selection_state = 'excluded'
  ),
  effective_concepts as (
    select concept_id, 'branch'::text as selection_source
    from branch_concepts
    where concept_id not in (select concept_id from excluded_concepts)

    union

    select concept_id, 'included'::text as selection_source
    from included_concepts
  )
  select
    c.id,
    c.name,
    c.concept_type,
    c.summary,
    count(q.id) filter (where q.status = 'published') as published_question_count,
    min(ec.selection_source) as selection_source
  from effective_concepts ec
  join public.concepts c on c.id = ec.concept_id
  left join public.questions q on q.concept_id = c.id
  where c.status = 'published'
    and public.has_socrates_role()
    and (
      public.is_editor_or_admin()
      or exists (
        select 1
        from public.user_libraries ul
        where ul.user_id = (select auth.uid())
          and ul.library_id = p_library_id
      )
    )
  group by c.id, c.name, c.concept_type, c.summary
  order by c.name;
$$;

revoke all on function public.set_user_study_selection_updated_at() from public;
revoke all on function public.resolve_user_study_plan(uuid) from public;
grant execute on function public.resolve_user_study_plan(uuid) to authenticated;
