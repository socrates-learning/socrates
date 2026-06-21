-- Allow editors and admins to manage the nested library category tree.

drop policy if exists "Editors insert library nodes"
  on public.library_nodes;
create policy "Editors insert library nodes"
  on public.library_nodes
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.role in ('editor', 'admin')
    )
  );

drop policy if exists "Editors update library nodes"
  on public.library_nodes;
create policy "Editors update library nodes"
  on public.library_nodes
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.role in ('editor', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.role in ('editor', 'admin')
    )
  );
