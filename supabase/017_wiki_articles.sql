-- Wiki-style article foundation: identity, immutable revisions, and links.

create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,
  summary text,
  status text not null default 'draft'
    constraint articles_status_check
    check (status in ('draft', 'in_review', 'published', 'archived')),
  owner_id uuid references auth.users(id) on delete set null default auth.uid(),
  current_version_id uuid,
  published_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create table if not exists public.article_versions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  parent_version_id uuid references public.article_versions(id) on delete restrict,
  title text not null,
  summary text,
  body_markdown text not null default '',
  edit_summary text,
  created_by uuid references auth.users(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  constraint article_versions_article_version_key
    unique (article_id, version_number),
  constraint article_versions_article_id_id_key
    unique (article_id, id)
);

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'articles'
      and c.conname = 'articles_current_version_id_fkey'
  ) then
    alter table public.articles
      add constraint articles_current_version_id_fkey
      foreign key (current_version_id)
      references public.article_versions(id)
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'articles'
      and c.conname = 'articles_published_version_id_fkey'
  ) then
    alter table public.articles
      add constraint articles_published_version_id_fkey
      foreign key (published_version_id)
      references public.article_versions(id)
      on delete restrict;
  end if;
end
$migration$;

create table if not exists public.article_concepts (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  concept_id uuid not null references public.concepts(id) on delete cascade,
  role text not null default 'discussed'
    constraint article_concepts_role_check
    check (role in ('primary', 'discussed', 'prerequisite', 'related')),
  section_anchor text,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint article_concepts_article_concept_role_key
    unique (article_id, concept_id, role)
);

create table if not exists public.article_sources (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null,
  article_version_id uuid not null,
  source_id uuid not null references public.sources(id) on delete restrict,
  citation_key text not null,
  locator text,
  note text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint article_sources_article_version_fkey
    foreign key (article_id, article_version_id)
    references public.article_versions(article_id, id)
    on delete restrict,
  constraint article_sources_version_citation_key
    unique (article_version_id, citation_key)
);

create table if not exists public.article_category_placements (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  library_node_id uuid not null
    references public.library_nodes(id) on delete cascade,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint article_category_placements_article_node_key
    unique (article_id, library_node_id)
);

create unique index if not exists articles_slug_uidx
  on public.articles(lower(slug));
create index if not exists articles_status_idx
  on public.articles(status);
create index if not exists articles_owner_id_idx
  on public.articles(owner_id);

create index if not exists article_versions_article_id_idx
  on public.article_versions(article_id);
create index if not exists article_versions_created_by_idx
  on public.article_versions(created_by);

create index if not exists article_concepts_article_id_idx
  on public.article_concepts(article_id);
create index if not exists article_concepts_concept_id_idx
  on public.article_concepts(concept_id);

create index if not exists article_sources_article_id_idx
  on public.article_sources(article_id);
create index if not exists article_sources_article_version_id_idx
  on public.article_sources(article_version_id);
create index if not exists article_sources_source_id_idx
  on public.article_sources(source_id);

create index if not exists article_category_placements_article_id_idx
  on public.article_category_placements(article_id);
create index if not exists article_category_placements_library_node_id_idx
  on public.article_category_placements(library_node_id);

create or replace function public.prevent_article_version_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'article_versions are immutable; create a new revision instead';
end;
$$;

drop trigger if exists prevent_article_version_mutation
  on public.article_versions;
create trigger prevent_article_version_mutation
  before update or delete on public.article_versions
  for each row execute function public.prevent_article_version_mutation();

create or replace function public.set_wiki_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_articles_updated_at on public.articles;
create trigger set_articles_updated_at
  before update on public.articles
  for each row execute function public.set_wiki_updated_at();

drop trigger if exists set_article_concepts_updated_at on public.article_concepts;
create trigger set_article_concepts_updated_at
  before update on public.article_concepts
  for each row execute function public.set_wiki_updated_at();

drop trigger if exists set_article_sources_updated_at on public.article_sources;
create trigger set_article_sources_updated_at
  before update on public.article_sources
  for each row execute function public.set_wiki_updated_at();

drop trigger if exists set_article_category_placements_updated_at
  on public.article_category_placements;
create trigger set_article_category_placements_updated_at
  before update on public.article_category_placements
  for each row execute function public.set_wiki_updated_at();

alter table public.articles enable row level security;
alter table public.article_versions enable row level security;
alter table public.article_concepts enable row level security;
alter table public.article_sources enable row level security;
alter table public.article_category_placements enable row level security;

-- Articles: public published reads, authenticated drafts, owner edits, admin override.
drop policy if exists "Published articles are readable" on public.articles;
create policy "Published articles are readable"
  on public.articles
  for select
  to anon, authenticated
  using (status = 'published' and published_version_id is not null);

drop policy if exists "Owners read own articles" on public.articles;
create policy "Owners read own articles"
  on public.articles
  for select
  to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "Authenticated users create draft articles"
  on public.articles;
create policy "Authenticated users create draft articles"
  on public.articles
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and status = 'draft'
  );

drop policy if exists "Owners update own draft articles" on public.articles;
create policy "Owners update own draft articles"
  on public.articles
  for update
  to authenticated
  using (
    owner_id = (select auth.uid())
    and status = 'draft'
  )
  with check (
    owner_id = (select auth.uid())
    and status = 'draft'
  );

drop policy if exists "Admins manage all articles" on public.articles;
create policy "Admins manage all articles"
  on public.articles
  for all
  to authenticated
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = (select auth.uid()) and ur.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = (select auth.uid()) and ur.role = 'admin'
    )
  );

-- Versions are immutable for owners. Only the published revision is public.
drop policy if exists "Published article versions are readable"
  on public.article_versions;
create policy "Published article versions are readable"
  on public.article_versions
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.articles a
      where a.id = article_id
        and a.status = 'published'
        and a.published_version_id = article_versions.id
    )
  );

drop policy if exists "Owners read own article versions"
  on public.article_versions;
create policy "Owners read own article versions"
  on public.article_versions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.articles a
      where a.id = article_id and a.owner_id = (select auth.uid())
    )
  );

drop policy if exists "Owners create draft article versions"
  on public.article_versions;
create policy "Owners create draft article versions"
  on public.article_versions
  for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.articles a
      where a.id = article_id
        and a.owner_id = (select auth.uid())
        and a.status = 'draft'
    )
  );

drop policy if exists "Admins manage all article versions"
  on public.article_versions;
drop policy if exists "Admins read all article versions"
  on public.article_versions;
create policy "Admins read all article versions"
  on public.article_versions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = (select auth.uid()) and ur.role = 'admin'
    )
  );

drop policy if exists "Admins create article versions"
  on public.article_versions;
create policy "Admins create article versions"
  on public.article_versions
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = (select auth.uid()) and ur.role = 'admin'
    )
  );

-- Concept, source, and category links follow article visibility and ownership.
drop policy if exists "Published article concepts are readable"
  on public.article_concepts;
create policy "Published article concepts are readable"
  on public.article_concepts
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.articles a
      where a.id = article_id and a.status = 'published'
    )
  );

drop policy if exists "Owners manage draft article concepts"
  on public.article_concepts;
create policy "Owners manage draft article concepts"
  on public.article_concepts
  for all
  to authenticated
  using (
    exists (
      select 1 from public.articles a
      where a.id = article_id
        and a.owner_id = (select auth.uid())
        and a.status = 'draft'
    )
  )
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.articles a
      where a.id = article_id
        and a.owner_id = (select auth.uid())
        and a.status = 'draft'
    )
  );

drop policy if exists "Admins manage all article concepts"
  on public.article_concepts;
create policy "Admins manage all article concepts"
  on public.article_concepts
  for all
  to authenticated
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = (select auth.uid()) and ur.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = (select auth.uid()) and ur.role = 'admin'
    )
  );

drop policy if exists "Published article sources are readable"
  on public.article_sources;
create policy "Published article sources are readable"
  on public.article_sources
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.articles a
      where a.id = article_id
        and a.status = 'published'
        and a.published_version_id = article_version_id
    )
  );

drop policy if exists "Owners manage draft article sources"
  on public.article_sources;
create policy "Owners manage draft article sources"
  on public.article_sources
  for all
  to authenticated
  using (
    exists (
      select 1 from public.articles a
      where a.id = article_id
        and a.owner_id = (select auth.uid())
        and a.status = 'draft'
    )
  )
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.articles a
      where a.id = article_id
        and a.owner_id = (select auth.uid())
        and a.status = 'draft'
    )
  );

drop policy if exists "Admins manage all article sources"
  on public.article_sources;
create policy "Admins manage all article sources"
  on public.article_sources
  for all
  to authenticated
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = (select auth.uid()) and ur.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = (select auth.uid()) and ur.role = 'admin'
    )
  );

drop policy if exists "Published article placements are readable"
  on public.article_category_placements;
create policy "Published article placements are readable"
  on public.article_category_placements
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.articles a
      where a.id = article_id and a.status = 'published'
    )
  );

drop policy if exists "Owners manage draft article placements"
  on public.article_category_placements;
create policy "Owners manage draft article placements"
  on public.article_category_placements
  for all
  to authenticated
  using (
    exists (
      select 1 from public.articles a
      where a.id = article_id
        and a.owner_id = (select auth.uid())
        and a.status = 'draft'
    )
  )
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.articles a
      where a.id = article_id
        and a.owner_id = (select auth.uid())
        and a.status = 'draft'
    )
  );

drop policy if exists "Admins manage all article placements"
  on public.article_category_placements;
create policy "Admins manage all article placements"
  on public.article_category_placements
  for all
  to authenticated
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = (select auth.uid()) and ur.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = (select auth.uid()) and ur.role = 'admin'
    )
  );
