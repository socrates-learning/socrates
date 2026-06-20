-- Attribution MVP Phase 2 policy for concept-level attribution.

alter table public.content_source_notes enable row level security;

drop policy if exists "Editors attach own sources to own concepts"
  on public.content_source_notes;

create policy "Editors attach own sources to own concepts"
  on public.content_source_notes
  for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and concept_id is not null
    and learn_section_id is null
    and exists (
      select 1
      from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.role in ('editor', 'admin')
    )
    and exists (
      select 1
      from public.sources s
      where s.id = source_id
        and s.created_by = (select auth.uid())
    )
    and exists (
      select 1
      from public.concepts c
      where c.id = concept_id
        and c.created_by = (select auth.uid())
    )
  );
