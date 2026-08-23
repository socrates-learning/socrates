-- Safe Creator Studio source deletion.
-- Editors/admins may permanently delete only sources that are not
-- attached to concepts/learn sections, articles, or questions.

create or replace function public.delete_unused_source(
  p_source_id uuid
)
returns public.sources
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_source public.sources%rowtype;
  deleted_source public.sources%rowtype;
begin
  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may remove sources';
  end if;

  if p_source_id is null then
    raise exception 'Source is required';
  end if;

  select *
  into target_source
  from public.sources s
  where s.id = p_source_id;

  if target_source.id is null then
    raise exception 'Source was not found';
  end if;

  -- Protect concept and learn-section attribution.
  if exists (
    select 1
    from public.content_source_notes csn
    where csn.source_id = p_source_id
  ) then
    raise exception
      'This source is attached to concept or learning content. Remove those source links first';
  end if;

  -- Protect article citations.
  if exists (
    select 1
    from public.article_sources ars
    where ars.source_id = p_source_id
  ) then
    raise exception
      'This source is attached to one or more articles. Remove those article source links first';
  end if;

  -- Protect question citations.
  if exists (
    select 1
    from public.question_sources qs
    where qs.source_id = p_source_id
  ) then
    raise exception
      'This source is attached to one or more questions. Remove those question source links first';
  end if;

  delete from public.sources
  where id = p_source_id
  returning * into deleted_source;

  return deleted_source;
end;
$$;

revoke all on function public.delete_unused_source(
  uuid
) from public;

grant execute on function public.delete_unused_source(
  uuid
) to authenticated;