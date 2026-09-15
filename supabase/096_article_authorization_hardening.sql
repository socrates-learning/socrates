-- Harden Article authoring before the shared Creator Studio route is opened to
-- learners. Published Article reads remain available to approved authenticated
-- users; every Article mutation remains behind an editor/admin-checked
-- SECURITY DEFINER RPC.

begin;

do $preflight$
begin
  if to_regclass('public.articles') is null
    or to_regclass('public.article_versions') is null
    or to_regclass('public.article_concepts') is null
    or to_regclass('public.article_sources') is null
    or to_regclass('public.article_category_placements') is null
    or to_regclass('public.article_tags') is null
    or to_regprocedure('public.is_editor_or_admin()') is null
    or to_regprocedure(
      'public.save_article_draft(uuid,text,text,text,uuid,uuid[],uuid,uuid[],boolean)'
    ) is null
    or to_regprocedure(
      'public.link_article_core_concept(uuid,uuid,text,text)'
    ) is null
    or to_regprocedure(
      'public.create_article_core_concept(uuid,text,text,uuid,uuid[],text)'
    ) is null
    or to_regprocedure('public.unlink_article_core_concept(uuid)') is null
  then
    raise exception
      'Migration 096 requires the installed Article authoring, tag, and authorization foundations';
  end if;
end;
$preflight$;

alter table public.articles enable row level security;
alter table public.article_versions enable row level security;
alter table public.article_concepts enable row level security;
alter table public.article_sources enable row level security;
alter table public.article_category_placements enable row level security;
alter table public.article_tags enable row level security;

-- Retire the legacy authenticated-owner Article authoring surface. It predates
-- the canonical role model and would otherwise let any approved learner create
-- and mutate a draft Article by assigning themselves as owner.
drop policy if exists "Owners read own articles" on public.articles;
drop policy if exists "Authenticated users create draft articles" on public.articles;
drop policy if exists "Owners update own draft articles" on public.articles;
drop policy if exists "Admins manage all articles" on public.articles;

drop policy if exists "Owners read own article versions" on public.article_versions;
drop policy if exists "Owners create draft article versions" on public.article_versions;
drop policy if exists "Admins manage all article versions" on public.article_versions;
drop policy if exists "Admins read all article versions" on public.article_versions;
drop policy if exists "Admins create article versions" on public.article_versions;

drop policy if exists "Owners manage draft article concepts" on public.article_concepts;
drop policy if exists "Admins manage all article concepts" on public.article_concepts;

drop policy if exists "Owners manage draft article sources" on public.article_sources;
drop policy if exists "Admins manage all article sources" on public.article_sources;

drop policy if exists "Owners manage draft article placements"
  on public.article_category_placements;
drop policy if exists "Admins manage all article placements"
  on public.article_category_placements;

drop policy if exists "Editors manage article tags" on public.article_tags;

-- Staff can inspect every Article authoring row. Existing published-read
-- policies continue to expose only the approved published surface to learners.
drop policy if exists "Editors and admins read all articles" on public.articles;
create policy "Editors and admins read all articles"
  on public.articles
  for select
  to authenticated
  using (public.is_editor_or_admin());

drop policy if exists "Editors and admins read all article versions"
  on public.article_versions;
create policy "Editors and admins read all article versions"
  on public.article_versions
  for select
  to authenticated
  using (public.is_editor_or_admin());

drop policy if exists "Editors and admins read all article concepts"
  on public.article_concepts;
create policy "Editors and admins read all article concepts"
  on public.article_concepts
  for select
  to authenticated
  using (public.is_editor_or_admin());

drop policy if exists "Editors and admins read all article sources"
  on public.article_sources;
create policy "Editors and admins read all article sources"
  on public.article_sources
  for select
  to authenticated
  using (public.is_editor_or_admin());

drop policy if exists "Editors and admins read all article placements"
  on public.article_category_placements;
create policy "Editors and admins read all article placements"
  on public.article_category_placements
  for select
  to authenticated
  using (public.is_editor_or_admin());

drop policy if exists "Editors and admins read all article tags"
  on public.article_tags;
create policy "Editors and admins read all article tags"
  on public.article_tags
  for select
  to authenticated
  using (public.is_editor_or_admin());

-- Browser clients never need direct Article DML. The existing staff-checked
-- SECURITY DEFINER RPCs remain the only application mutation boundary.
revoke all on table
  public.articles,
  public.article_versions,
  public.article_concepts,
  public.article_sources,
  public.article_category_placements,
  public.article_tags
from public, anon, authenticated;

grant select on table
  public.articles,
  public.article_versions,
  public.article_concepts,
  public.article_sources,
  public.article_category_placements,
  public.article_tags
to authenticated;

-- Reassert the intended browser-facing Article RPC ACLs without changing any
-- function body. Each executable mutation RPC independently checks
-- is_editor_or_admin().
revoke execute on function public.save_article_draft(
  uuid, text, text, text, uuid, uuid[], uuid, text[], boolean
) from public, anon, authenticated;

revoke execute on function public.save_article_draft(
  uuid, text, text, text, uuid, uuid[], uuid, uuid[], boolean
) from public, anon;
grant execute on function public.save_article_draft(
  uuid, text, text, text, uuid, uuid[], uuid, uuid[], boolean
) to authenticated;

revoke execute on function public.link_article_core_concept(
  uuid, uuid, text, text
) from public, anon;
grant execute on function public.link_article_core_concept(
  uuid, uuid, text, text
) to authenticated;

revoke execute on function public.create_article_core_concept(
  uuid, text, text, uuid, uuid[], text
) from public, anon;
grant execute on function public.create_article_core_concept(
  uuid, text, text, uuid, uuid[], text
) to authenticated;

revoke execute on function public.unlink_article_core_concept(uuid)
  from public, anon;
grant execute on function public.unlink_article_core_concept(uuid)
  to authenticated;

-- Migration 060 may be installed in an existing environment. Its two public
-- entry points already enforce editor/admin authority internally; ensure anon
-- cannot invoke them without making Migration 060 a dependency of this file.
do $optional_development_delete_acls$
begin
  if to_regprocedure('public.get_development_delete_summary(text,uuid)') is not null then
    execute 'revoke execute on function public.get_development_delete_summary(text,uuid) from public, anon';
  end if;

  if to_regprocedure('public.delete_development_content(text,uuid)') is not null then
    execute 'revoke execute on function public.delete_development_content(text,uuid) from public, anon';
  end if;
end;
$optional_development_delete_acls$;

do $validation$
declare
  article_table text;
  unexpected_policies text;
begin
  foreach article_table in array array[
    'articles',
    'article_versions',
    'article_concepts',
    'article_sources',
    'article_category_placements',
    'article_tags'
  ] loop
    if not exists (
      select 1
      from pg_class table_row
      join pg_namespace schema_row on schema_row.oid = table_row.relnamespace
      where schema_row.nspname = 'public'
        and table_row.relname = article_table
        and table_row.relrowsecurity
    ) then
      raise exception 'Article authorization validation failed: RLS is disabled on %', article_table;
    end if;

    if has_table_privilege('authenticated', format('public.%I', article_table), 'INSERT')
      or has_table_privilege('authenticated', format('public.%I', article_table), 'UPDATE')
      or has_table_privilege('authenticated', format('public.%I', article_table), 'DELETE')
      or has_table_privilege('anon', format('public.%I', article_table), 'INSERT')
      or has_table_privilege('anon', format('public.%I', article_table), 'UPDATE')
      or has_table_privilege('anon', format('public.%I', article_table), 'DELETE')
    then
      raise exception 'Article authorization validation failed: browser DML remains granted on %', article_table;
    end if;

    if not has_table_privilege('authenticated', format('public.%I', article_table), 'SELECT') then
      raise exception 'Article authorization validation failed: authenticated SELECT missing on %', article_table;
    end if;

    if exists (
      select 1
      from pg_class table_row
      join pg_namespace schema_row on schema_row.oid = table_row.relnamespace
      cross join lateral aclexplode(coalesce(table_row.relacl, acldefault('r', table_row.relowner))) grant_row
      where schema_row.nspname = 'public'
        and table_row.relname = article_table
        and grant_row.grantee = 0
        and grant_row.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')
    ) then
      raise exception 'Article authorization validation failed: PUBLIC DML remains granted on %', article_table;
    end if;
  end loop;

  select string_agg(format('%I.%I', tablename, policyname), ', ' order by tablename, policyname)
  into unexpected_policies
  from pg_policies
  where schemaname = 'public'
    and tablename = any(array[
      'articles',
      'article_versions',
      'article_concepts',
      'article_sources',
      'article_category_placements',
      'article_tags'
    ])
    and cmd <> 'SELECT';

  if unexpected_policies is not null then
    raise exception
      'Article authorization validation failed: mutation policies remain: %',
      unexpected_policies;
  end if;

  if (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and policyname like 'Editors and admins read all article%'
      and cmd = 'SELECT'
  ) <> 6 then
    raise exception 'Article authorization validation failed: expected six staff read policies';
  end if;

  if has_function_privilege(
       'anon',
       'public.save_article_draft(uuid,text,text,text,uuid,uuid[],uuid,uuid[],boolean)',
       'EXECUTE'
     )
    or has_function_privilege(
      'anon',
      'public.link_article_core_concept(uuid,uuid,text,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.create_article_core_concept(uuid,text,text,uuid,uuid[],text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.unlink_article_core_concept(uuid)',
      'EXECUTE'
    )
  then
    raise exception 'Article authorization validation failed: anon Article RPC execution remains';
  end if;

  if exists (
    select 1
    from pg_proc function_row
    join pg_namespace schema_row on schema_row.oid = function_row.pronamespace
    where schema_row.nspname = 'public'
      and function_row.oid in (
        'public.save_article_draft(uuid,text,text,text,uuid,uuid[],uuid,uuid[],boolean)'::regprocedure,
        'public.link_article_core_concept(uuid,uuid,text,text)'::regprocedure,
        'public.create_article_core_concept(uuid,text,text,uuid,uuid[],text)'::regprocedure,
        'public.unlink_article_core_concept(uuid)'::regprocedure
      )
      and (
        not function_row.prosecdef
        or position('is_editor_or_admin' in pg_get_functiondef(function_row.oid)) = 0
      )
  ) then
    raise exception 'Article authorization validation failed: a mutation RPC lacks its staff check';
  end if;
end;
$validation$;

notify pgrst, 'reload schema';

commit;
