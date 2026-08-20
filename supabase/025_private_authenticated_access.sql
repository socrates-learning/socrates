-- Private Socrates access: remove anonymous content reads and require an
-- approved Socrates role for authenticated learner-facing content.

create or replace function public.has_socrates_role()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role in ('learner', 'editor', 'admin')
  );
$$;

revoke all on function public.has_socrates_role() from public;
grant execute on function public.has_socrates_role() to authenticated;

revoke all on function public.is_editor_or_admin() from anon;

drop function if exists public.assign_role_from_approved_domain();

drop function if exists public.save_article_draft(
  uuid,
  text,
  text,
  text,
  uuid,
  boolean
);

drop policy if exists "Public libraries are readable" on public.libraries;
drop policy if exists "Authenticated libraries are readable" on public.libraries;
create policy "Authenticated libraries are readable"
  on public.libraries
  for select
  to authenticated
  using (public.has_socrates_role());

drop policy if exists "Public library nodes are readable" on public.library_nodes;
drop policy if exists "Allow published/public read library_nodes" on public.library_nodes;
drop policy if exists "Authenticated library nodes are readable" on public.library_nodes;
create policy "Authenticated library nodes are readable"
  on public.library_nodes
  for select
  to authenticated
  using (public.has_socrates_role());

drop policy if exists "Published concepts are readable" on public.concepts;
drop policy if exists "Students can read published concepts" on public.concepts;
create policy "Published concepts are readable"
  on public.concepts
  for select
  to authenticated
  using (
    public.has_socrates_role()
    and status = 'published'
  );

drop policy if exists "Readable learn sections" on public.learn_sections;
create policy "Readable learn sections"
  on public.learn_sections
  for select
  to authenticated
  using (
    public.is_editor_or_admin()
    or (
      public.has_socrates_role()
      and exists (
        select 1
        from public.concepts c
        where c.id = concept_id
          and c.status = 'published'
      )
    )
  );

drop policy if exists "Readable concept placements" on public.concept_placements;
drop policy if exists "Anyone can read placements for published concepts"
  on public.concept_placements;
create policy "Readable concept placements"
  on public.concept_placements
  for select
  to authenticated
  using (
    public.is_editor_or_admin()
    or (
      public.has_socrates_role()
      and exists (
        select 1
        from public.concepts c
        where c.id = concept_id
          and c.status = 'published'
      )
    )
  );

drop policy if exists "Readable concept relationships" on public.concept_relationships;
create policy "Readable concept relationships"
  on public.concept_relationships
  for select
  to authenticated
  using (
    public.is_editor_or_admin()
    or (
      public.has_socrates_role()
      and exists (
        select 1
        from public.concepts source_concept
        where source_concept.id = source_concept_id
          and source_concept.status = 'published'
      )
      and exists (
        select 1
        from public.concepts target_concept
        where target_concept.id = target_concept_id
          and target_concept.status = 'published'
      )
    )
  );

drop policy if exists "Readable concept distinctions" on public.concept_distinctions;
create policy "Readable concept distinctions"
  on public.concept_distinctions
  for select
  to authenticated
  using (
    public.is_editor_or_admin()
    or (
      public.has_socrates_role()
      and exists (
        select 1
        from public.concepts c
        where c.id = concept_id
          and c.status = 'published'
      )
    )
  );

drop policy if exists "Readable concept attribution" on public.content_source_notes;
create policy "Readable concept attribution"
  on public.content_source_notes
  for select
  to authenticated
  using (
    public.is_editor_or_admin()
    or (
      public.has_socrates_role()
      and (
        (
          concept_id is not null
          and exists (
            select 1
            from public.concepts c
            where c.id = concept_id
              and c.status = 'published'
          )
        )
        or (
          learn_section_id is not null
          and exists (
            select 1
            from public.learn_sections ls
            join public.concepts c on c.id = ls.concept_id
            where ls.id = learn_section_id
              and c.status = 'published'
          )
        )
      )
    )
  );

drop policy if exists "Readable attributed sources" on public.sources;
create policy "Readable attributed sources"
  on public.sources
  for select
  to authenticated
  using (
    public.has_socrates_role()
    and (
      exists (
        select 1
        from public.content_source_notes csn
        join public.concepts c on c.id = csn.concept_id
        where csn.source_id = sources.id
          and csn.concept_id is not null
          and c.status = 'published'
      )
      or exists (
        select 1
        from public.content_source_notes csn
        join public.learn_sections ls on ls.id = csn.learn_section_id
        join public.concepts c on c.id = ls.concept_id
        where csn.source_id = sources.id
          and csn.learn_section_id is not null
          and c.status = 'published'
      )
    )
  );

drop policy if exists "Published articles are readable" on public.articles;
create policy "Published articles are readable"
  on public.articles
  for select
  to authenticated
  using (
    public.has_socrates_role()
    and status = 'published'
    and published_version_id is not null
  );

drop policy if exists "Published article versions are readable"
  on public.article_versions;
create policy "Published article versions are readable"
  on public.article_versions
  for select
  to authenticated
  using (
    public.has_socrates_role()
    and exists (
      select 1
      from public.articles a
      where a.id = article_id
        and a.status = 'published'
        and a.published_version_id = article_versions.id
    )
  );

drop policy if exists "Published article concepts are readable"
  on public.article_concepts;
create policy "Published article concepts are readable"
  on public.article_concepts
  for select
  to authenticated
  using (
    public.has_socrates_role()
    and exists (
      select 1
      from public.articles a
      where a.id = article_id
        and a.status = 'published'
    )
  );

drop policy if exists "Published article sources are readable"
  on public.article_sources;
create policy "Published article sources are readable"
  on public.article_sources
  for select
  to authenticated
  using (
    public.has_socrates_role()
    and exists (
      select 1
      from public.articles a
      where a.id = article_id
        and a.status = 'published'
        and a.published_version_id = article_version_id
    )
  );

drop policy if exists "Published article placements are readable"
  on public.article_category_placements;
create policy "Published article placements are readable"
  on public.article_category_placements
  for select
  to authenticated
  using (
    public.has_socrates_role()
    and exists (
      select 1
      from public.articles a
      where a.id = article_id
        and a.status = 'published'
    )
  );

drop policy if exists "Tags are readable" on public.tags;
create policy "Tags are readable"
  on public.tags
  for select
  to authenticated
  using (public.has_socrates_role());

drop policy if exists "Published article tags are readable" on public.article_tags;
create policy "Published article tags are readable"
  on public.article_tags
  for select
  to authenticated
  using (
    public.has_socrates_role()
    and exists (
      select 1
      from public.articles article
      where article.id = article_id
        and article.status = 'published'
        and article.published_version_id is not null
    )
  );

do $validation$
declare
  policy_list text;
begin
  select string_agg(format('%I.%I.%I', schemaname, tablename, policyname), ', ')
  into policy_list
  from pg_policies
  where schemaname = 'public'
    and tablename in (
      'libraries',
      'library_nodes',
      'concepts',
      'learn_sections',
      'concept_placements',
      'concept_relationships',
      'concept_distinctions',
      'content_source_notes',
      'sources',
      'articles',
      'article_versions',
      'article_concepts',
      'article_sources',
      'article_category_placements',
      'tags',
      'article_tags'
    )
    and 'anon' = any(roles);

  if policy_list is not null then
    raise exception 'Private access migration incomplete: anon policies remain: %',
      policy_list;
  end if;
end
$validation$;
