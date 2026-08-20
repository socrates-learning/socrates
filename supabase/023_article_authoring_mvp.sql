-- Task B1: Article Authoring MVP RPC.
-- Keeps the existing article tables and immutable article_versions model.

create or replace function public.article_slug_from_title(p_title text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from lower(regexp_replace(coalesce(p_title, ''), '[^a-zA-Z0-9]+', '-', 'g')));
$$;

create or replace function public.save_article_draft(
  p_article_id uuid,
  p_title text,
  p_summary text,
  p_body_markdown text,
  p_library_node_id uuid,
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
  next_version_number integer;
  new_version_id uuid;
  base_slug text;
  candidate_slug text;
  suffix integer := 1;
  next_status text := case when p_publish then 'published' else 'draft' end;
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

  select *
  into target_node
  from public.library_nodes ln
  where ln.id = p_library_node_id;

  if target_node.id is null then
    raise exception 'Article placement was not found';
  end if;

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
  where article_id = target_article.id;

  insert into public.article_category_placements (
    article_id,
    library_node_id,
    sort_order,
    created_by
  )
  values (
    target_article.id,
    target_node.id,
    0,
    caller_id
  )
  on conflict (article_id, library_node_id) do nothing;

  return jsonb_build_object(
    'article_id', target_article.id,
    'slug', target_article.slug,
    'status', target_article.status,
    'current_version_id', target_article.current_version_id,
    'published_version_id', target_article.published_version_id
  );
end;
$$;

revoke all on function public.article_slug_from_title(text) from public;
grant execute on function public.article_slug_from_title(text) to authenticated;

revoke all on function public.save_article_draft(
  uuid,
  text,
  text,
  text,
  uuid,
  boolean
) from public;

grant execute on function public.save_article_draft(
  uuid,
  text,
  text,
  text,
  uuid,
  boolean
) to authenticated;
