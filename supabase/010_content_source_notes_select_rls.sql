-- Attribution MVP Phase 3 read policy for concept-level attribution.

alter table public.content_source_notes enable row level security;

drop policy if exists "Authenticated users read visible concept attribution"
  on public.content_source_notes;

create policy "Authenticated users read visible concept attribution"
  on public.content_source_notes
  for select
  to authenticated
  using (
    learn_section_id is null
    and exists (
      select 1
      from public.concepts c
      where c.id = concept_id
        and (
          c.is_public = true
          or c.created_by = (select auth.uid())
        )
    )
  );
