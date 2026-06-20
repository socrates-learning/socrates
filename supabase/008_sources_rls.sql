-- Attribution MVP Phase 1 policies for creator-owned sources.

alter table public.sources enable row level security;

drop policy if exists "Creators read own sources" on public.sources;
drop policy if exists "Editors insert own sources" on public.sources;
drop policy if exists "Editors update own sources" on public.sources;
drop policy if exists "Editors delete own sources" on public.sources;

create policy "Creators read own sources" on public.sources
  for select
  to authenticated
  using (created_by = (select auth.uid()));

create policy "Editors insert own sources" on public.sources
  for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1
      from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.role in ('editor', 'admin')
    )
  );

create policy "Editors update own sources" on public.sources
  for update
  to authenticated
  using (
    created_by = (select auth.uid())
    and exists (
      select 1
      from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.role in ('editor', 'admin')
    )
  )
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1
      from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.role in ('editor', 'admin')
    )
  );

create policy "Editors delete own sources" on public.sources
  for delete
  to authenticated
  using (
    created_by = (select auth.uid())
    and exists (
      select 1
      from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.role in ('editor', 'admin')
    )
  );
