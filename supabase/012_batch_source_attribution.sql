-- 012_batch_source_attribution.sql
-- First-class, reusable source attribution for batch concept imports.

alter table public.sources
  add column if not exists source_key text;

update public.sources
set source_key = 'legacy:' || id::text
where source_key is null or btrim(source_key) = '';

alter table public.sources
  alter column source_key set not null;

create unique index if not exists sources_source_key_uidx
  on public.sources(source_key);

create or replace function public.import_seed_concept(
  p_concept jsonb,
  p_sources jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  imported_concept_id uuid;
  imported_source_id uuid;
  created_by_id uuid;
  concept_name text;
  source_record jsonb;
  source_key_value text;
  source_title text;
begin
  concept_name := nullif(btrim(p_concept ->> 'name'), '');

  if concept_name is null then
    raise exception 'Imported concept name is required';
  end if;

  if jsonb_typeof(p_sources) <> 'array' or jsonb_array_length(p_sources) = 0 then
    raise exception 'Every imported concept requires at least one source';
  end if;

  created_by_id := coalesce(
    nullif(p_concept ->> 'created_by', '')::uuid,
    auth.uid()
  );

  select c.id
  into imported_concept_id
  from public.concepts c
  where lower(c.name) = lower(concept_name)
  order by
    (c.created_by = created_by_id) desc nulls last,
    (c.status = 'published') desc,
    c.created_at desc
  limit 1;

  if imported_concept_id is null then
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
    returning id into imported_concept_id;
  end if;

  for source_record in
    select value from jsonb_array_elements(p_sources)
  loop
    source_key_value := lower(nullif(btrim(source_record ->> 'source_key'), ''));
    source_title := nullif(btrim(source_record ->> 'title'), '');

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
      author = coalesce(excluded.author, public.sources.author),
      edition = coalesce(excluded.edition, public.sources.edition),
      source_type = coalesce(excluded.source_type, public.sources.source_type),
      notes = coalesce(excluded.notes, public.sources.notes),
      url = coalesce(excluded.url, public.sources.url),
      license = coalesce(excluded.license, public.sources.license),
      created_by = coalesce(public.sources.created_by, excluded.created_by)
    returning id into imported_source_id;

    insert into public.content_source_notes (
      source_id,
      concept_id,
      learn_section_id,
      note,
      created_by
    )
    values (
      imported_source_id,
      imported_concept_id,
      null,
      nullif(source_record ->> 'note', ''),
      created_by_id
    )
    on conflict (source_id, concept_id)
      where concept_id is not null
    do update
    set note = coalesce(excluded.note, public.content_source_notes.note);
  end loop;

  return imported_concept_id;
end;
$$;

revoke all on function public.import_seed_concept(jsonb, jsonb) from public;
grant execute on function public.import_seed_concept(jsonb, jsonb) to authenticated;
grant execute on function public.import_seed_concept(jsonb, jsonb) to service_role;