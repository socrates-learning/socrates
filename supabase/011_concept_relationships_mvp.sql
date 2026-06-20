-- Concept-to-concept relationships MVP.

create table if not exists public.concept_relationships (
  id uuid primary key default gen_random_uuid(),
  source_concept_id uuid references public.concepts(id) on delete cascade,
  target_concept_id uuid references public.concepts(id) on delete cascade,
  relationship_type text not null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz default now(),
  unique(source_concept_id, target_concept_id, relationship_type)
);

alter table public.concept_relationships
  alter column id set default gen_random_uuid(),
  alter column created_by set default auth.uid(),
  alter column created_at set default now();

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'concept_relationships'
      and c.conname = 'concept_relationships_type_check'
  ) then
    alter table public.concept_relationships
      add constraint concept_relationships_type_check
      check (
        relationship_type in (
          'related_to',
          'prerequisite_for',
          'treats',
          'causes',
          'acts_on',
          'compares_with'
        )
      );
  end if;
end
$migration$;

create unique index if not exists concept_relationships_source_target_type_uidx
  on public.concept_relationships(
    source_concept_id,
    target_concept_id,
    relationship_type
  );

create index if not exists concept_relationships_source_concept_id_idx
  on public.concept_relationships(source_concept_id);

create index if not exists concept_relationships_target_concept_id_idx
  on public.concept_relationships(target_concept_id);

create index if not exists concept_relationships_created_by_idx
  on public.concept_relationships(created_by);

alter table public.concept_relationships enable row level security;

drop policy if exists "Readable concept relationships"
  on public.concept_relationships;
create policy "Readable concept relationships"
  on public.concept_relationships
  for select
  using (
    exists (
      select 1
      from public.concepts c
      where c.id in (source_concept_id, target_concept_id)
        and (c.is_public = true or c.created_by = auth.uid())
    )
  );

drop policy if exists "Editors insert own concept relationships"
  on public.concept_relationships;
create policy "Editors insert own concept relationships"
  on public.concept_relationships
  for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1
      from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role in ('editor', 'admin')
    )
    and exists (
      select 1
      from public.concepts source_concept
      where source_concept.id = source_concept_id
        and source_concept.created_by = auth.uid()
    )
    and exists (
      select 1
      from public.concepts target_concept
      where target_concept.id = target_concept_id
        and target_concept.created_by = auth.uid()
    )
  );

drop policy if exists "Editors delete own concept relationships"
  on public.concept_relationships;
create policy "Editors delete own concept relationships"
  on public.concept_relationships
  for delete
  using (
    created_by = auth.uid()
    and exists (
      select 1
      from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role in ('editor', 'admin')
    )
  );
