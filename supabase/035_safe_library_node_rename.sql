-- Safe Knowledge Tree topic rename.
-- Editors/admins may rename non-root nodes without changing tree structure.

create or replace function public.rename_library_node_in_library(
  p_library_id uuid,
  p_node_id uuid,
  p_name text
)
returns public.library_nodes
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_node public.library_nodes%rowtype;
  duplicate_node public.library_nodes%rowtype;
  renamed_node public.library_nodes%rowtype;
  cleaned_name text := btrim(coalesce(p_name, ''));
begin
  if caller_id is null then
    raise exception 'Authenticated user is required';
  end if;

  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may rename library topics';
  end if;

  if p_library_id is null
     or not exists (
       select 1
       from public.libraries l
       where l.id = p_library_id
     ) then
    raise exception 'Library was not found';
  end if;

  if p_node_id is null then
    raise exception 'Topic is required';
  end if;

  if cleaned_name = '' then
    raise exception 'Topic name is required';
  end if;

  select *
  into target_node
  from public.library_nodes ln
  where ln.id = p_node_id;

  if target_node.id is null then
    raise exception 'Topic was not found';
  end if;

  if target_node.library_id is distinct from p_library_id then
    raise exception 'Topic does not belong to the active library';
  end if;

  if target_node.parent_id is null then
    raise exception 'The library root cannot be renamed';
  end if;

  select *
  into duplicate_node
  from public.library_nodes ln
  where ln.library_id = p_library_id
    and ln.parent_id is not distinct from target_node.parent_id
    and ln.id <> target_node.id
    and lower(btrim(ln.name)) = lower(cleaned_name)
  limit 1;

  if duplicate_node.id is not null then
    raise exception
      'A topic named "%" already exists beneath the same parent',
      cleaned_name;
  end if;

  update public.library_nodes
  set name = cleaned_name
  where id = target_node.id
  returning * into renamed_node;

  return renamed_node;
end;
$$;

revoke all on function public.rename_library_node_in_library(
  uuid,
  uuid,
  text
) from public;

grant execute on function public.rename_library_node_in_library(
  uuid,
  uuid,
  text
) to authenticated;
