-- Make concepts.status the authoritative lifecycle and visibility field.

create or replace function public.is_editor_or_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('editor', 'admin')
  );
$$;

revoke all on function public.is_editor_or_admin() from public;
grant execute on function public.is_editor_or_admin() to anon;
grant execute on function public.is_editor_or_admin() to authenticated;

alter table public.concepts
  alter column status set default 'draft',
  alter column status set not null;

create index if not exists concepts_status_idx
  on public.concepts(status);

update public.concepts
set is_public = (status = 'published')
where is_public is distinct from (status = 'published');

create or replace function public.enforce_concept_lifecycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and new.status is distinct from old.status
    and not public.is_editor_or_admin()
  then
    raise exception 'Only editors and admins may change concept lifecycle status';
  end if;

  new.is_public := new.status = 'published';
  new.updated_at := now();

  return new;
end;
$$;

drop trigger if exists enforce_concept_lifecycle
  on public.concepts;
create trigger enforce_concept_lifecycle
  before insert or update on public.concepts
  for each row execute function public.enforce_concept_lifecycle();

alter table public.concepts enable row level security;

drop policy if exists "Public concepts are readable" on public.concepts;
drop policy if exists "Creators can insert concepts" on public.concepts;
drop policy if exists "Creators can update own concepts" on public.concepts;
drop policy if exists "Editors can insert concepts" on public.concepts;
drop policy if exists "Published concepts are readable" on public.concepts;
drop policy if exists "Editors read all concepts" on public.concepts;
drop policy if exists "Editors insert concepts" on public.concepts;
drop policy if exists "Editors update concepts" on public.concepts;

create policy "Published concepts are readable"
  on public.concepts
  for select
  to anon, authenticated
  using (status = 'published');

create policy "Editors read all concepts"
  on public.concepts
  for select
  to authenticated
  using (public.is_editor_or_admin());

create policy "Editors insert concepts"
  on public.concepts
  for insert
  to authenticated
  with check (
    public.is_editor_or_admin()
    and created_by = (select auth.uid())
  );

create policy "Editors update concepts"
  on public.concepts
  for update
  to authenticated
  using (public.is_editor_or_admin())
  with check (public.is_editor_or_admin());

drop policy if exists "Readable learn sections" on public.learn_sections;
drop policy if exists "Editors insert own learn sections" on public.learn_sections;
drop policy if exists "Editors insert learn sections" on public.learn_sections;
drop policy if exists "Editors update learn sections" on public.learn_sections;
create policy "Readable learn sections"
  on public.learn_sections
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.concepts c
      where c.id = concept_id
        and (
          c.status = 'published'
          or public.is_editor_or_admin()
        )
    )
  );

create policy "Editors insert learn sections"
  on public.learn_sections
  for insert
  to authenticated
  with check (
    public.is_editor_or_admin()
    and created_by = (select auth.uid())
    and exists (
      select 1
      from public.concepts c
      where c.id = concept_id
    )
  );

create policy "Editors update learn sections"
  on public.learn_sections
  for update
  to authenticated
  using (public.is_editor_or_admin())
  with check (public.is_editor_or_admin());

drop policy if exists "Readable concept placements" on public.concept_placements;
create policy "Readable concept placements"
  on public.concept_placements
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.concepts c
      where c.id = concept_id
        and (
          c.status = 'published'
          or public.is_editor_or_admin()
        )
    )
  );

drop policy if exists "Editors insert concept placements"
  on public.concept_placements;
create policy "Editors insert concept placements"
  on public.concept_placements
  for insert
  to authenticated
  with check (
    public.is_editor_or_admin()
    and exists (
      select 1
      from public.concepts c
      where c.id = concept_id
    )
  );

drop policy if exists "Readable concept relationships"
  on public.concept_relationships;
drop policy if exists "Editors insert own concept relationships"
  on public.concept_relationships;
drop policy if exists "Editors insert concept relationships"
  on public.concept_relationships;
create policy "Readable concept relationships"
  on public.concept_relationships
  for select
  to anon, authenticated
  using (
    public.is_editor_or_admin()
    or (
      exists (
        select 1
        from public.concepts source_concept
        where source_concept.id = source_concept_id
          and source_concept.status = 'published'
      )
      and exists (
        select 1
        from public.concepts target_concept
        where target_concept.id = target_concept_id
          and target_concept.status = 'published'
      )
    )
  );

create policy "Editors insert concept relationships"
  on public.concept_relationships
  for insert
  to authenticated
  with check (
    public.is_editor_or_admin()
    and created_by = (select auth.uid())
    and exists (
      select 1
      from public.concepts source_concept
      where source_concept.id = source_concept_id
    )
    and exists (
      select 1
      from public.concepts target_concept
      where target_concept.id = target_concept_id
    )
  );

drop policy if exists "Readable concept distinctions"
  on public.concept_distinctions;
drop policy if exists "Anyone can read concept distinctions"
  on public.concept_distinctions;
create policy "Readable concept distinctions"
  on public.concept_distinctions
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.concepts c
      where c.id = concept_id
        and (
          c.status = 'published'
          or public.is_editor_or_admin()
        )
    )
  );

drop policy if exists "Authenticated users read visible concept attribution"
  on public.content_source_notes;
drop policy if exists "Readable concept attribution"
  on public.content_source_notes;
drop policy if exists "Editors attach own sources to own concepts"
  on public.content_source_notes;
drop policy if exists "Editors attach own sources to concepts"
  on public.content_source_notes;
create policy "Readable concept attribution"
  on public.content_source_notes
  for select
  to anon, authenticated
  using (
    public.is_editor_or_admin()
    or (
      concept_id is not null
      and exists (
        select 1
        from public.concepts c
        where c.id = concept_id
          and c.status = 'published'
      )
    )
    or (
      learn_section_id is not null
      and exists (
        select 1
        from public.learn_sections ls
        join public.concepts c on c.id = ls.concept_id
        where ls.id = learn_section_id
          and c.status = 'published'
      )
    )
  );

create policy "Editors attach own sources to concepts"
  on public.content_source_notes
  for insert
  to authenticated
  with check (
    public.is_editor_or_admin()
    and created_by = (select auth.uid())
    and exists (
      select 1
      from public.sources s
      where s.id = source_id
        and s.created_by = (select auth.uid())
    )
    and (
      (
        concept_id is not null
        and exists (
          select 1
          from public.concepts c
          where c.id = concept_id
        )
      )
      or (
        learn_section_id is not null
        and exists (
          select 1
          from public.learn_sections ls
          where ls.id = learn_section_id
        )
      )
    )
  );

drop policy if exists "Creators read own sources" on public.sources;
drop policy if exists "Authenticated users read visible sources" on public.sources;
drop policy if exists "Readable attributed sources" on public.sources;
drop policy if exists "Editors read all sources" on public.sources;

create policy "Readable attributed sources"
  on public.sources
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.content_source_notes csn
      join public.concepts c on c.id = csn.concept_id
      where csn.source_id = sources.id
        and csn.concept_id is not null
        and c.status = 'published'
    )
    or exists (
      select 1
      from public.content_source_notes csn
      join public.learn_sections ls on ls.id = csn.learn_section_id
      join public.concepts c on c.id = ls.concept_id
      where csn.source_id = sources.id
        and csn.learn_section_id is not null
        and c.status = 'published'
    )
  );

create policy "Editors read all sources"
  on public.sources
  for select
  to authenticated
  using (public.is_editor_or_admin());

do $validation$
declare
  policy_list text;
begin
  select string_agg(format('%I.%I.%I', schemaname, tablename, policyname), ', ')
  into policy_list
  from pg_policies
  where schemaname = 'public'
    and tablename in (
      'concepts',
      'learn_sections',
      'concept_placements',
      'concept_relationships',
      'concept_distinctions',
      'content_source_notes',
      'sources'
    )
    and (
      coalesce(qual, '') ~* '\mis_public\M'
      or coalesce(with_check, '') ~* '\mis_public\M'
    );

  if policy_list is not null then
    raise exception
      'Lifecycle visibility migration incomplete: RLS policies still reference is_public: %',
      policy_list;
  end if;
end
$validation$;

do $validation$
declare
  policy_list text;
begin
  select string_agg(format('%I.%I.%I', schemaname, tablename, policyname), ', ')
  into policy_list
  from pg_policies
  where schemaname = 'public'
    and tablename in (
      'concepts',
      'learn_sections',
      'concept_placements',
      'concept_relationships',
      'concept_distinctions',
      'content_source_notes',
      'sources'
    )
    and cmd = 'SELECT'
    and regexp_replace(
      regexp_replace(lower(coalesce(qual, '')), '::[a-z0-9_." ]+(\[\])?', '', 'g'),
      '[[:space:]()]',
      '',
      'g'
    ) = 'true';

  if policy_list is not null then
    raise exception
      'Lifecycle visibility migration incomplete: unrestricted SELECT policies remain: %',
      policy_list;
  end if;
end
$validation$;
