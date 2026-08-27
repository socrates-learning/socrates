-- Concept tag persistence foundation.
-- Reuses public.tags and normalizes existing public.concept_tags.tag data.

create table if not exists public.concept_tags (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null references public.concepts(id) on delete cascade,
  tag text,
  tag_id uuid references public.tags(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.concept_tags
  add column if not exists tag_id uuid references public.tags(id) on delete cascade;

do $$
declare
  existing_tag record;
  cleaned_tag_name text;
  tag_slug text;
  normalized_tag_id uuid;
begin
  for existing_tag in
    select id, tag, created_by
    from public.concept_tags
    where tag_id is null
      and btrim(coalesce(tag, '')) <> ''
  loop
    cleaned_tag_name := regexp_replace(btrim(existing_tag.tag), '\s+', ' ', 'g');
    tag_slug := public.tag_slug_from_name(cleaned_tag_name);

    if cleaned_tag_name = '' or tag_slug = '' then
      continue;
    end if;

    insert into public.tags (name, slug, created_by)
    values (cleaned_tag_name, tag_slug, existing_tag.created_by)
    on conflict (slug)
    do update set name = public.tags.name
    returning id into normalized_tag_id;

    update public.concept_tags
    set tag_id = normalized_tag_id
    where id = existing_tag.id;
  end loop;
end;
$$;

delete from public.concept_tags ct
where ct.tag_id is not null
  and exists (
    select 1
    from public.concept_tags duplicate
    where duplicate.concept_id = ct.concept_id
      and duplicate.tag_id = ct.tag_id
      and (
        duplicate.created_at < ct.created_at
        or (
          duplicate.created_at = ct.created_at
          and duplicate.id < ct.id
        )
      )
  );

alter table public.concept_tags
  alter column tag drop not null;

alter table public.concept_tags
  alter column tag_id set not null;

alter table public.concept_tags
  drop constraint if exists concept_tags_concept_tag_key;

alter table public.concept_tags
  add constraint concept_tags_concept_tag_key unique (concept_id, tag_id);

create index if not exists concept_tags_concept_id_idx
  on public.concept_tags(concept_id);

create index if not exists concept_tags_tag_id_idx
  on public.concept_tags(tag_id);

create index if not exists concept_tags_created_by_idx
  on public.concept_tags(created_by);

alter table public.concept_tags enable row level security;

drop policy if exists "Readable concept tags"
  on public.concept_tags;
create policy "Readable concept tags"
  on public.concept_tags
  for select
  to authenticated
  using (
    public.has_socrates_role()
    and (
      public.is_editor_or_admin()
      or exists (
        select 1
        from public.concepts c
        where c.id = concept_id
          and c.status = 'published'
      )
    )
  );

drop policy if exists "Editors manage concept tags"
  on public.concept_tags;
create policy "Editors manage concept tags"
  on public.concept_tags
  for all
  to authenticated
  using (public.is_editor_or_admin())
  with check (public.is_editor_or_admin());

drop function if exists public.save_concept_draft(
  uuid,
  text,
  text,
  uuid,
  uuid[]
);

create or replace function public.save_concept_draft(
  p_concept_id uuid,
  p_name text,
  p_body_markdown text,
  p_active_library_id uuid,
  p_library_node_ids uuid[],
  p_tag_names text[] default array[]::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_concept public.concepts%rowtype;
  normalized_placement_ids uuid[];
  placement_node_id uuid;
  tag_name text;
  cleaned_tag_name text;
  tag_slug text;
  tag_id uuid;
  seen_tag_slugs text[] := array[]::text[];
begin
  if caller_id is null then
    raise exception 'Authenticated user is required';
  end if;

  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may save concepts';
  end if;

  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'Concept name is required';
  end if;

  if btrim(coalesce(p_body_markdown, '')) = '' then
    raise exception 'Concept content is required';
  end if;

  if p_active_library_id is null
     or not exists (
       select 1
       from public.libraries l
       where l.id = p_active_library_id
     ) then
    raise exception 'Active library was not found';
  end if;

  select array_agg(distinct placement_id)
  into normalized_placement_ids
  from unnest(coalesce(p_library_node_ids, array[]::uuid[])) as placement_id
  where placement_id is not null;

  if coalesce(array_length(normalized_placement_ids, 1), 0) = 0 then
    raise exception 'At least one concept placement is required';
  end if;

  foreach placement_node_id in array normalized_placement_ids loop
    if not exists (
      select 1
      from public.library_nodes ln
      where ln.id = placement_node_id
        and ln.library_id = p_active_library_id
    ) then
      raise exception 'All concept placements must belong to the active library';
    end if;
  end loop;

  if p_concept_id is null then
    insert into public.concepts (
      name,
      body_markdown,
      status,
      is_public,
      created_by
    )
    values (
      btrim(p_name),
      coalesce(p_body_markdown, ''),
      'draft',
      false,
      caller_id
    )
    returning * into target_concept;
  else
    select *
    into target_concept
    from public.concepts c
    where c.id = p_concept_id
    for update;

    if target_concept.id is null then
      raise exception 'Concept was not found';
    end if;

    update public.concepts
    set name = btrim(p_name),
        body_markdown = coalesce(p_body_markdown, '')
    where id = target_concept.id
    returning * into target_concept;
  end if;

  delete from public.concept_placements cp
  where cp.concept_id = target_concept.id
    and exists (
      select 1
      from public.library_nodes ln
      where ln.id = cp.library_node_id
        and ln.library_id = p_active_library_id
    )
    and not cp.library_node_id = any(normalized_placement_ids);

  foreach placement_node_id in array normalized_placement_ids loop
    insert into public.concept_placements (
      concept_id,
      library_node_id,
      sort_order
    )
    values (
      target_concept.id,
      placement_node_id,
      0
    )
    on conflict (concept_id, library_node_id) do nothing;
  end loop;

  delete from public.concept_tags
  where concept_id = target_concept.id;

  foreach tag_name in array coalesce(p_tag_names, array[]::text[]) loop
    cleaned_tag_name := regexp_replace(btrim(tag_name), '\s+', ' ', 'g');
    tag_slug := public.tag_slug_from_name(cleaned_tag_name);

    if cleaned_tag_name = '' or tag_slug = '' or tag_slug = any(seen_tag_slugs) then
      continue;
    end if;

    seen_tag_slugs := array_append(seen_tag_slugs, tag_slug);

    insert into public.tags (name, slug, created_by)
    values (cleaned_tag_name, tag_slug, caller_id)
    on conflict (slug)
    do update set name = public.tags.name
    returning id into tag_id;

    insert into public.concept_tags (concept_id, tag_id, created_by)
    values (target_concept.id, tag_id, caller_id)
    on conflict (concept_id, tag_id) do nothing;
  end loop;

  return jsonb_build_object(
    'concept_id', target_concept.id,
    'status', target_concept.status,
    'library_id', p_active_library_id,
    'library_node_ids', normalized_placement_ids,
    'tags', coalesce(seen_tag_slugs, array[]::text[])
  );
end;
$$;

create or replace function public.get_concept_tags(p_concept_id uuid)
returns table (
  id uuid,
  name text,
  slug text
)
language sql
security definer
set search_path = ''
as $$
  select t.id, t.name, t.slug
  from public.concept_tags ct
  join public.tags t on t.id = ct.tag_id
  join public.concepts c on c.id = ct.concept_id
  where ct.concept_id = p_concept_id
    and public.has_socrates_role()
    and (
      public.is_editor_or_admin()
      or c.status = 'published'
    )
  order by t.name;
$$;

revoke all on function public.save_concept_draft(
  uuid,
  text,
  text,
  uuid,
  uuid[],
  text[]
) from public;

grant execute on function public.save_concept_draft(
  uuid,
  text,
  text,
  uuid,
  uuid[],
  text[]
) to authenticated;

revoke all on function public.get_concept_tags(uuid) from public;
grant execute on function public.get_concept_tags(uuid) to authenticated;
