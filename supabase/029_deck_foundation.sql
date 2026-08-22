-- Task D1: Deck foundation for learner Pages 1-2.
-- Converts the C1 learner study selections into deck-scoped selections while
-- preserving existing rows and keeping learner delivery for a later phase.

create table if not exists public.study_decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  library_id uuid not null references public.libraries(id) on delete cascade,
  name text not null default 'Current Deck',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists study_decks_user_library_idx
  on public.study_decks(user_id, library_id);
create index if not exists study_decks_library_id_idx
  on public.study_decks(library_id);
create unique index if not exists study_decks_one_active_per_library_idx
  on public.study_decks(user_id, library_id)
  where is_active;

drop trigger if exists set_study_decks_updated_at
  on public.study_decks;
create trigger set_study_decks_updated_at
  before update on public.study_decks
  for each row execute function public.set_user_study_selection_updated_at();

alter table public.study_decks enable row level security;

drop policy if exists "Users read own study decks"
  on public.study_decks;
create policy "Users read own study decks"
  on public.study_decks
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.has_socrates_role()
  );

drop policy if exists "Users create own study decks"
  on public.study_decks;
create policy "Users create own study decks"
  on public.study_decks
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and public.has_socrates_role()
    and (
      public.is_editor_or_admin()
      or exists (
        select 1
        from public.user_libraries ul
        where ul.user_id = (select auth.uid())
          and ul.library_id = study_decks.library_id
      )
    )
  );

drop policy if exists "Users update own study decks"
  on public.study_decks;
create policy "Users update own study decks"
  on public.study_decks
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and public.has_socrates_role()
    and (
      public.is_editor_or_admin()
      or exists (
        select 1
        from public.user_libraries ul
        where ul.user_id = (select auth.uid())
          and ul.library_id = study_decks.library_id
      )
    )
  );

drop policy if exists "Users delete own study decks"
  on public.study_decks;
create policy "Users delete own study decks"
  on public.study_decks
  for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.has_socrates_role()
  );

alter table public.user_study_node_selections
  add column if not exists id uuid default gen_random_uuid();
alter table public.user_study_node_selections
  add column if not exists deck_id uuid;

alter table public.user_study_concept_overrides
  add column if not exists id uuid default gen_random_uuid();
alter table public.user_study_concept_overrides
  add column if not exists deck_id uuid;

update public.user_study_node_selections
set id = gen_random_uuid()
where id is null;

update public.user_study_concept_overrides
set id = gen_random_uuid()
where id is null;

insert into public.study_decks (user_id, library_id, name, is_active)
select distinct source_rows.user_id, source_rows.library_id, 'Current Deck', true
from (
  select user_id, library_id from public.user_study_node_selections
  union
  select user_id, library_id from public.user_study_concept_overrides
) source_rows
where not exists (
  select 1
  from public.study_decks sd
  where sd.user_id = source_rows.user_id
    and sd.library_id = source_rows.library_id
    and sd.is_active
);

update public.user_study_node_selections usns
set deck_id = sd.id
from public.study_decks sd
where usns.deck_id is null
  and sd.user_id = usns.user_id
  and sd.library_id = usns.library_id
  and sd.is_active;

update public.user_study_concept_overrides usco
set deck_id = sd.id
from public.study_decks sd
where usco.deck_id is null
  and sd.user_id = usco.user_id
  and sd.library_id = usco.library_id
  and sd.is_active;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'user_study_node_selections_pkey'
      and conrelid = 'public.user_study_node_selections'::regclass
  ) then
    alter table public.user_study_node_selections
      drop constraint user_study_node_selections_pkey;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_study_node_selections_pkey'
      and conrelid = 'public.user_study_node_selections'::regclass
  ) then
    alter table public.user_study_node_selections
      add constraint user_study_node_selections_pkey primary key (id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_study_node_selections_deck_id_fkey'
      and conrelid = 'public.user_study_node_selections'::regclass
  ) then
    alter table public.user_study_node_selections
      add constraint user_study_node_selections_deck_id_fkey
      foreign key (deck_id) references public.study_decks(id) on delete cascade;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'user_study_concept_overrides_pkey'
      and conrelid = 'public.user_study_concept_overrides'::regclass
  ) then
    alter table public.user_study_concept_overrides
      drop constraint user_study_concept_overrides_pkey;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_study_concept_overrides_pkey'
      and conrelid = 'public.user_study_concept_overrides'::regclass
  ) then
    alter table public.user_study_concept_overrides
      add constraint user_study_concept_overrides_pkey primary key (id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_study_concept_overrides_deck_id_fkey'
      and conrelid = 'public.user_study_concept_overrides'::regclass
  ) then
    alter table public.user_study_concept_overrides
      add constraint user_study_concept_overrides_deck_id_fkey
      foreign key (deck_id) references public.study_decks(id) on delete cascade;
  end if;
end $$;

alter table public.user_study_node_selections
  alter column id set not null,
  alter column deck_id set not null;

alter table public.user_study_concept_overrides
  alter column id set not null,
  alter column deck_id set not null;

create unique index if not exists user_study_node_selections_deck_node_idx
  on public.user_study_node_selections(deck_id, node_id);
create index if not exists user_study_node_selections_deck_id_idx
  on public.user_study_node_selections(deck_id);

create unique index if not exists user_study_concept_overrides_deck_concept_idx
  on public.user_study_concept_overrides(deck_id, concept_id);
create index if not exists user_study_concept_overrides_deck_id_idx
  on public.user_study_concept_overrides(deck_id);

drop policy if exists "Users read own study node selections"
  on public.user_study_node_selections;
create policy "Users read own study node selections"
  on public.user_study_node_selections
  for select
  to authenticated
  using (
    public.has_socrates_role()
    and
    exists (
      select 1
      from public.study_decks sd
      where sd.id = user_study_node_selections.deck_id
        and sd.user_id = (select auth.uid())
        and user_study_node_selections.user_id = sd.user_id
        and user_study_node_selections.library_id = sd.library_id
    )
  );

drop policy if exists "Users create own study node selections"
  on public.user_study_node_selections;
drop policy if exists "Users delete own study node selections"
  on public.user_study_node_selections;
drop policy if exists "Users manage own study node selections"
  on public.user_study_node_selections;
create policy "Users manage own study node selections"
  on public.user_study_node_selections
  for all
  to authenticated
  using (
    public.has_socrates_role()
    and
    exists (
      select 1
      from public.study_decks sd
      where sd.id = user_study_node_selections.deck_id
        and sd.user_id = (select auth.uid())
        and user_study_node_selections.user_id = sd.user_id
        and user_study_node_selections.library_id = sd.library_id
    )
  )
  with check (
    public.has_socrates_role()
    and
    exists (
      select 1
      from public.study_decks sd
      join public.library_nodes ln on ln.library_id = sd.library_id
      where sd.id = user_study_node_selections.deck_id
        and sd.user_id = (select auth.uid())
        and user_study_node_selections.user_id = sd.user_id
        and user_study_node_selections.library_id = sd.library_id
        and ln.id = user_study_node_selections.node_id
    )
  );

drop policy if exists "Users read own study concept overrides"
  on public.user_study_concept_overrides;
create policy "Users read own study concept overrides"
  on public.user_study_concept_overrides
  for select
  to authenticated
  using (
    public.has_socrates_role()
    and
    exists (
      select 1
      from public.study_decks sd
      where sd.id = user_study_concept_overrides.deck_id
        and sd.user_id = (select auth.uid())
        and user_study_concept_overrides.user_id = sd.user_id
        and user_study_concept_overrides.library_id = sd.library_id
    )
  );

drop policy if exists "Users manage own study concept overrides"
  on public.user_study_concept_overrides;
create policy "Users manage own study concept overrides"
  on public.user_study_concept_overrides
  for all
  to authenticated
  using (
    public.has_socrates_role()
    and
    exists (
      select 1
      from public.study_decks sd
      where sd.id = user_study_concept_overrides.deck_id
        and sd.user_id = (select auth.uid())
        and user_study_concept_overrides.user_id = sd.user_id
        and user_study_concept_overrides.library_id = sd.library_id
    )
  )
  with check (
    public.has_socrates_role()
    and
    exists (
      select 1
      from public.study_decks sd
      join public.concept_placements cp
        on cp.concept_id = user_study_concept_overrides.concept_id
      join public.library_nodes ln
        on ln.id = cp.library_node_id
        and ln.library_id = sd.library_id
      where sd.id = user_study_concept_overrides.deck_id
        and sd.user_id = (select auth.uid())
        and user_study_concept_overrides.user_id = sd.user_id
        and user_study_concept_overrides.library_id = sd.library_id
    )
  );

create or replace function public.get_or_create_active_study_deck(
  p_library_id uuid
)
returns public.study_decks
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  active_deck public.study_decks;
begin
  if current_user_id is null or not public.has_socrates_role() then
    raise exception 'Not authorized to manage study decks.';
  end if;

  if not (
    public.is_editor_or_admin()
    or exists (
      select 1
      from public.user_libraries ul
      where ul.user_id = current_user_id
        and ul.library_id = p_library_id
    )
  ) then
    raise exception 'Not authorized for this library.';
  end if;

  select *
  into active_deck
  from public.study_decks sd
  where sd.user_id = current_user_id
    and sd.library_id = p_library_id
    and sd.is_active
  order by sd.created_at
  limit 1;

  if active_deck.id is not null then
    return active_deck;
  end if;

  begin
    insert into public.study_decks (user_id, library_id, name, is_active)
    values (current_user_id, p_library_id, 'Current Deck', true)
    returning * into active_deck;
  exception
    when unique_violation then
      select *
      into active_deck
      from public.study_decks sd
      where sd.user_id = current_user_id
        and sd.library_id = p_library_id
        and sd.is_active
      order by sd.created_at
      limit 1;
  end;

  return active_deck;
end;
$$;

create or replace function public.resolve_study_deck(
  p_deck_id uuid
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
  with recursive deck as (
    select sd.id, sd.user_id, sd.library_id
    from public.study_decks sd
    where sd.id = p_deck_id
      and sd.user_id = (select auth.uid())
      and public.has_socrates_role()
      and (
        public.is_editor_or_admin()
        or exists (
          select 1
          from public.user_libraries ul
          where ul.user_id = (select auth.uid())
            and ul.library_id = sd.library_id
        )
      )
  ),
  selected_nodes as (
    select usns.node_id
    from public.user_study_node_selections usns
    join deck d on d.id = usns.deck_id
    join public.library_nodes ln on ln.id = usns.node_id
    where usns.user_id = d.user_id
      and usns.library_id = d.library_id
      and ln.library_id = d.library_id

    union

    select child.id
    from public.library_nodes child
    join selected_nodes parent on parent.node_id = child.parent_id
    join deck d on d.library_id = child.library_id
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
    join deck d on d.id = usco.deck_id
    join public.concepts c on c.id = usco.concept_id
    where usco.user_id = d.user_id
      and usco.library_id = d.library_id
      and usco.selection_state = 'included'
      and c.status = 'published'
      and exists (
        select 1
        from public.concept_placements cp
        join public.library_nodes ln on ln.id = cp.library_node_id
        where cp.concept_id = usco.concept_id
          and ln.library_id = d.library_id
      )
  ),
  excluded_concepts as (
    select distinct usco.concept_id
    from public.user_study_concept_overrides usco
    join deck d on d.id = usco.deck_id
    where usco.user_id = d.user_id
      and usco.library_id = d.library_id
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
  group by c.id, c.name, c.concept_type, c.summary
  order by c.name;
$$;

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
  select resolved.*
  from (
    select sd.id
    from public.study_decks sd
    where sd.user_id = (select auth.uid())
      and sd.library_id = p_library_id
      and sd.is_active
    order by sd.created_at
    limit 1
  ) active_deck
  cross join lateral public.resolve_study_deck(active_deck.id) resolved;
$$;

revoke all on function public.get_or_create_active_study_deck(uuid) from public;
revoke all on function public.resolve_study_deck(uuid) from public;
revoke all on function public.resolve_user_study_plan(uuid) from public;
grant execute on function public.get_or_create_active_study_deck(uuid) to authenticated;
grant execute on function public.resolve_study_deck(uuid) to authenticated;
grant execute on function public.resolve_user_study_plan(uuid) to authenticated;
