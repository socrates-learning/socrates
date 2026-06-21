-- First-class, reusable source attribution for batch concept imports.

alter table public.sources
  add column if not exists source_key text;

update public.sources
set source_key = 'legacy:' || id::text
where source_key is null or btrim(source_key) = '';

alter table public.sources
  alter column source_key set not null;

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'sources'
      and c.conname = 'sources_source_key_not_blank'
  ) then
    alter table public.sources
      add constraint sources_source_key_not_blank
      check (btrim(source_key) <> '');
  end if;
end
$migration$;

create unique index if not exists sources_source_key_uidx
  on public.sources(source_key);

comment on column public.sources.source_key is
  'Stable canonical identifier used to reuse one source across many content records.';

create or replace function public.set_source_key()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  normalized_title text;
  normalized_author text;
begin
  if new.source_key is not null and btrim(new.source_key) <> '' then
    new.source_key = lower(btrim(new.source_key));
    return new;
  end if;

  if new.url is not null and btrim(new.url) <> '' then
    new.source_key = 'url:' || lower(regexp_replace(btrim(new.url), '/+$', ''));
    return new;
  end if;

  normalized_title = trim(
    both '-' from regexp_replace(lower(btrim(new.title)), '[^a-z0-9]+', '-', 'g')
  );
  normalized_author = trim(
    both '-' from regexp_replace(
      lower(coalesce(nullif(btrim(new.author), ''), 'unknown')),
      '[^a-z0-9]+',
      '-',
      'g'
    )
  );
  new.source_key = 'title:' || normalized_title || ':' || normalized_author;

  return new;
end;
$$;

drop trigger if exists set_source_key on public.sources;
create trigger set_source_key
  before insert or update of source_key, title, author, url
  on public.sources
  for each row
  execute function public.set_source_key();

delete from public.content_source_notes
where source_id is null;

alter table public.content_source_notes
  alter column source_id set not null;

alter table public.content_source_notes
  drop constraint if exists content_source_notes_source_id_fkey;

alter table public.content_source_notes
  add constraint content_source_notes_source_id_fkey
  foreign key (source_id)
  references public.sources(id)
  on delete cascade;

alter table public.content_source_notes
  validate constraint content_source_notes_exactly_one_target;

drop policy if exists "Creators read own sources" on public.sources;
drop policy if exists "Authenticated users read visible sources" on public.sources;

create policy "Authenticated users read visible sources"
  on public.sources
  for select
  to authenticated
  using (
    created_by = (select auth.uid())
    or exists (
      select 1
      from public.content_source_notes csn
      join public.concepts c on c.id = csn.concept_id
      where csn.source_id = sources.id
        and (c.is_public = true or c.created_by = (select auth.uid()))
    )
    or exists (
      select 1
      from public.content_source_notes csn
      join public.learn_sections ls on ls.id = csn.learn_section_id
      join public.concepts c on c.id = ls.concept_id
      where csn.source_id = sources.id
        and (c.is_public = true or c.created_by = (select auth.uid()))
    )
  );

create or replace function public.import_seed_concept(
  p_concept jsonb,
  p_sources jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  concept_id uuid;
  source_id uuid;
  created_by_id uuid;
  concept_name text;
  source_record jsonb;
  source_key_value text;
  source_title text;
begin
  if jsonb_typeof(p_concept) <> 'object' then
    raise exception 'p_concept must be a JSON object';
  end if;

  if jsonb_typeof(p_sources) <> 'array' or jsonb_array_length(p_sources) = 0 then
    raise exception 'Every imported concept requires at least one source';
  end if;

  concept_name = nullif(btrim(p_concept ->> 'name'), '');

  if concept_name is null then
    raise exception 'Imported concept name is required';
  end if;

  created_by_id = coalesce(
    nullif(p_concept ->> 'created_by', '')::uuid,
    auth.uid()
  );

  select c.id
  into concept_id
  from public.concepts c
  where lower(c.name) = lower(concept_name)
  order by
    (c.created_by = created_by_id) desc nulls last,
    (c.status = 'published') desc,
    c.created_at desc
  limit 1;

  if concept_id is null then
    insert into public.concepts (
      name,
      concept_type,
      importance,
      difficulty,
      estimated_time,
      summary,
      why_it_matters,
      created_by,
      is_public,
      status
    )
    values (
      concept_name,
      nullif(p_concept ->> 'concept_type', ''),
      coalesce(nullif(p_concept ->> 'importance', ''), 'Medium'),
      coalesce(nullif(p_concept ->> 'difficulty', ''), 'Beginner'),
      nullif(p_concept ->> 'estimated_time', ''),
      nullif(p_concept ->> 'summary', ''),
      nullif(p_concept ->> 'why_it_matters', ''),
      created_by_id,
      coalesce((p_concept ->> 'is_public')::boolean, false),
      coalesce(nullif(p_concept ->> 'status', ''), 'draft')
    )
    returning id into concept_id;
  end if;

  for source_record in
    select value from jsonb_array_elements(p_sources)
  loop
    if jsonb_typeof(source_record) <> 'object' then
      raise exception 'Each source must be a JSON object';
    end if;

    source_key_value = lower(nullif(btrim(source_record ->> 'source_key'), ''));
    source_title = nullif(btrim(source_record ->> 'title'), '');

    if source_key_value is null or source_title is null then
      raise exception 'Each source requires source_key and title';
    end if;

    insert into public.sources (
      source_key,
      title,
      author,
      edition,
      source_type,
      notes,
      url,
      license,
      created_by
    )
    values (
      source_key_value,
      source_title,
      nullif(source_record ->> 'author', ''),
      nullif(source_record ->> 'edition', ''),
      nullif(source_record ->> 'source_type', ''),
      nullif(source_record ->> 'notes', ''),
      nullif(source_record ->> 'url', ''),
      nullif(source_record ->> 'license', ''),
      created_by_id
    )
    on conflict (source_key) do update
    set
      title = excluded.title,
      author = coalesce(excluded.author, sources.author),
      edition = coalesce(excluded.edition, sources.edition),
      source_type = coalesce(excluded.source_type, sources.source_type),
      notes = coalesce(excluded.notes, sources.notes),
      url = coalesce(excluded.url, sources.url),
      license = coalesce(excluded.license, sources.license),
      created_by = coalesce(sources.created_by, excluded.created_by)
    returning id into source_id;

    insert into public.content_source_notes (
      source_id,
      concept_id,
      learn_section_id,
      note,
      created_by
    )
    values (
      source_id,
      concept_id,
      null,
      nullif(source_record ->> 'note', ''),
      created_by_id
    )
    on conflict (source_id, concept_id)
      where concept_id is not null
    do update
    set note = coalesce(excluded.note, content_source_notes.note);
  end loop;

  if not exists (
    select 1
    from public.content_source_notes csn
    where csn.concept_id = concept_id
  ) then
    raise exception 'Imported concept must retain at least one source';
  end if;

  return concept_id;
end;
$$;

comment on function public.import_seed_concept(jsonb, jsonb) is
  'Atomically creates or reuses a concept, upserts reusable sources by source_key, and attaches at least one source.';

revoke all on function public.import_seed_concept(jsonb, jsonb) from public;
grant execute on function public.import_seed_concept(jsonb, jsonb) to service_role;
