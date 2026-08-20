-- Task B1.1: Multi-placement article organization and reusable article tags.

alter table public.article_category_placements
  add column if not exists is_primary boolean not null default false;

create unique index if not exists article_category_placements_one_primary_idx
  on public.article_category_placements(article_id)
  where is_primary;

with ranked_placements as (
  select
    id,
    row_number() over (
      partition by article_id
      order by is_primary desc, sort_order, created_at, id
    ) as placement_rank
  from public.article_category_placements
)
update public.article_category_placements placement
set is_primary = ranked_placements.placement_rank = 1
from ranked_placements
where placement.id = ranked_placements.id
  and placement.is_primary is distinct from (ranked_placements.placement_rank = 1);

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint tags_slug_key unique (slug),
  constraint tags_name_not_blank check (btrim(name) <> ''),
  constraint tags_slug_not_blank check (btrim(slug) <> '')
);

create table if not exists public.article_tags (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint article_tags_article_tag_key unique (article_id, tag_id)
);

create index if not exists article_tags_article_id_idx
  on public.article_tags(article_id);

create index if not exists article_tags_tag_id_idx
  on public.article_tags(tag_id);

alter table public.tags enable row level security;
alter table public.article_tags enable row level security;

drop policy if exists "Tags are readable" on public.tags;
create policy "Tags are readable"
  on public.tags
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Editors manage tags" on public.tags;
create policy "Editors manage tags"
  on public.tags
  for all
  to authenticated
  using (public.is_editor_or_admin())
  with check (public.is_editor_or_admin());

drop policy if exists "Published article tags are readable" on public.article_tags;
create policy "Published article tags are readable"
  on public.article_tags
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.articles article
      where article.id = article_id
        and article.status = 'published'
        and article.published_version_id is not null
    )
  );

drop policy if exists "Editors manage article tags" on public.article_tags;
create policy "Editors manage article tags"
  on public.article_tags
  for all
  to authenticated
  using (public.is_editor_or_admin())
  with check (public.is_editor_or_admin());

create or replace function public.tag_slug_from_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from lower(regexp_replace(btrim(coalesce(p_name, '')), '[^a-zA-Z0-9]+', '-', 'g')));
$$;

create or replace function public.save_article_draft(
  p_article_id uuid,
  p_title text,
  p_summary text,
  p_body_markdown text,
  p_active_library_id uuid,
  p_library_node_ids uuid[],
  p_primary_library_node_id uuid,
  p_tag_names text[] default array[]::text[],
  p_publish boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_article public.articles%rowtype;
  target_node public.library_nodes%rowtype;
  placement_node_id uuid;
  normalized_placement_ids uuid[];
  next_version_number integer;
  new_version_id uuid;
  base_slug text;
  candidate_slug text;
  suffix integer := 1;
  next_status text := case when p_publish then 'published' else 'draft' end;
  tag_name text;
  cleaned_tag_name text;
  tag_slug text;
  tag_id uuid;
begin
  if caller_id is null then
    raise exception 'Authenticated user is required';
  end if;

  if not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may save articles';
  end if;

  if btrim(coalesce(p_title, '')) = '' then
    raise exception 'Article title is required';
  end if;

  if btrim(coalesce(p_body_markdown, '')) = '' then
    raise exception 'Article body is required';
  end if;

  if p_active_library_id is null then
    raise exception 'Active library is required';
  end if;

  select array_agg(distinct placement_id)
  into normalized_placement_ids
  from unnest(coalesce(p_library_node_ids, array[]::uuid[])) as placement_id
  where placement_id is not null;

  if coalesce(array_length(normalized_placement_ids, 1), 0) = 0 then
    raise exception 'At least one article placement is required';
  end if;

  if p_primary_library_node_id is null
     or not p_primary_library_node_id = any(normalized_placement_ids) then
    raise exception 'Primary placement must be one of the selected placements';
  end if;

  select *
  into target_node
  from public.library_nodes ln
  where ln.id = p_primary_library_node_id;

  if target_node.id is null then
    raise exception 'Primary article placement was not found';
  end if;

  if target_node.library_id is distinct from p_active_library_id then
    raise exception 'Primary placement must belong to the active library';
  end if;

  foreach placement_node_id in array normalized_placement_ids loop
    if not exists (
      select 1
      from public.library_nodes ln
      where ln.id = placement_node_id
        and ln.library_id = p_active_library_id
    ) then
      raise exception 'All normal article placements must belong to the same active library';
    end if;
  end loop;

  base_slug := public.article_slug_from_title(p_title);
  if base_slug = '' then
    base_slug := 'article';
  end if;
  candidate_slug := base_slug;

  loop
    exit when not exists (
      select 1
      from public.articles a
      where lower(a.slug) = lower(candidate_slug)
        and (p_article_id is null or a.id <> p_article_id)
    );

    suffix := suffix + 1;
    candidate_slug := base_slug || '-' || suffix::text;
  end loop;

  if p_article_id is null then
    insert into public.articles (
      slug,
      title,
      summary,
      status,
      owner_id,
      published_at
    )
    values (
      candidate_slug,
      btrim(p_title),
      nullif(btrim(coalesce(p_summary, '')), ''),
      next_status,
      caller_id,
      case when p_publish then now() else null end
    )
    returning * into target_article;
  else
    select *
    into target_article
    from public.articles a
    where a.id = p_article_id
    for update;

    if target_article.id is null then
      raise exception 'Article was not found';
    end if;

    update public.articles
    set slug = candidate_slug,
        title = btrim(p_title),
        summary = nullif(btrim(coalesce(p_summary, '')), ''),
        status = next_status,
        published_at = case
          when p_publish then coalesce(published_at, now())
          else published_at
        end
    where id = target_article.id
    returning * into target_article;
  end if;

  select coalesce(max(version_number), 0) + 1
  into next_version_number
  from public.article_versions
  where article_id = target_article.id;

  insert into public.article_versions (
    article_id,
    version_number,
    parent_version_id,
    title,
    summary,
    body_markdown,
    edit_summary,
    created_by
  )
  values (
    target_article.id,
    next_version_number,
    target_article.current_version_id,
    btrim(p_title),
    nullif(btrim(coalesce(p_summary, '')), ''),
    p_body_markdown,
    case when p_publish then 'Published from Article Authoring MVP' else 'Saved draft' end,
    caller_id
  )
  returning id into new_version_id;

  update public.articles
  set current_version_id = new_version_id,
      published_version_id = case when p_publish then new_version_id else published_version_id end,
      status = next_status,
      published_at = case
        when p_publish then coalesce(published_at, now())
        else published_at
      end
  where id = target_article.id
  returning * into target_article;

  delete from public.article_category_placements
  where article_id = target_article.id
    and not library_node_id = any(normalized_placement_ids);

  update public.article_category_placements
  set is_primary = false
  where article_id = target_article.id
    and is_primary = true;

  foreach placement_node_id in array normalized_placement_ids loop
    insert into public.article_category_placements (
      article_id,
      library_node_id,
      sort_order,
      is_primary,
      created_by
    )
    values (
      target_article.id,
      placement_node_id,
      case when placement_node_id = p_primary_library_node_id then 0 else 1 end,
      placement_node_id = p_primary_library_node_id,
      caller_id
    )
    on conflict (article_id, library_node_id)
    do update set
      sort_order = excluded.sort_order,
      is_primary = excluded.is_primary;
  end loop;

  delete from public.article_tags
  where article_id = target_article.id;

  foreach tag_name in array coalesce(p_tag_names, array[]::text[]) loop
    cleaned_tag_name := regexp_replace(btrim(tag_name), '\s+', ' ', 'g');
    tag_slug := public.tag_slug_from_name(cleaned_tag_name);

    if cleaned_tag_name = '' or tag_slug = '' then
      continue;
    end if;

    insert into public.tags (name, slug, created_by)
    values (cleaned_tag_name, tag_slug, caller_id)
    on conflict (slug)
    do update set name = public.tags.name
    returning id into tag_id;

    insert into public.article_tags (article_id, tag_id, created_by)
    values (target_article.id, tag_id, caller_id)
    on conflict (article_id, tag_id) do nothing;
  end loop;

  return jsonb_build_object(
    'article_id', target_article.id,
    'slug', target_article.slug,
    'status', target_article.status,
    'current_version_id', target_article.current_version_id,
    'published_version_id', target_article.published_version_id
  );
end;
$$;

revoke all on function public.tag_slug_from_name(text) from public;
grant execute on function public.tag_slug_from_name(text) to authenticated;

revoke all on function public.save_article_draft(
  uuid,
  text,
  text,
  text,
  uuid,
  uuid[],
  uuid,
  text[],
  boolean
) from public;

grant execute on function public.save_article_draft(
  uuid,
  text,
  text,
  text,
  uuid,
  uuid[],
  uuid,
  text[],
  boolean
) to authenticated;
