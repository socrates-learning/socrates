-- Phase 2A article sections MVP support

alter table public.learn_sections
  alter column created_by set default auth.uid();

create index if not exists learn_sections_concept_sort_idx
  on public.learn_sections(concept_id, sort_order);

alter table public.learn_sections enable row level security;

do $migration$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'learn_sections'
      and policyname = 'Readable learn sections'
  ) then
    execute $policy$
      create policy "Readable learn sections" on public.learn_sections
        for select using (
          exists (
            select 1
            from public.concepts c
            where c.id = concept_id
              and (c.is_public = true or c.created_by = auth.uid())
          )
        )
    $policy$;
  end if;
end
$migration$;

do $migration$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'learn_sections'
      and policyname = 'Editors insert own learn sections'
  ) then
    execute $policy$
      create policy "Editors insert own learn sections" on public.learn_sections
        for insert with check (
          auth.uid() = created_by
          and exists (
            select 1
            from public.concepts c
            where c.id = concept_id
              and c.created_by = auth.uid()
          )
          and exists (
            select 1
            from public.user_roles ur
            where ur.user_id = auth.uid()
              and ur.role in ('editor', 'admin')
          )
        )
    $policy$;
  end if;
end
$migration$;
