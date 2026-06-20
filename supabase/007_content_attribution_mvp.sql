-- Attribution MVP v1 database foundation.

alter table public.sources
  add column if not exists url text,
  add column if not exists license text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.sources
  alter column created_by set default auth.uid();

create or replace function public.set_sources_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_sources_updated_at on public.sources;

create trigger set_sources_updated_at
  before update on public.sources
  for each row
  execute function public.set_sources_updated_at();

alter table public.content_source_notes
  add column if not exists learn_section_id uuid;

alter table public.content_source_notes
  alter column created_by set default auth.uid();

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'content_source_notes'
      and c.conname = 'content_source_notes_learn_section_id_fkey'
  ) then
    alter table public.content_source_notes
      add constraint content_source_notes_learn_section_id_fkey
      foreign key (learn_section_id)
      references public.learn_sections(id)
      on delete cascade;
  end if;
end
$migration$;

create index if not exists sources_created_by_idx
  on public.sources(created_by);

create index if not exists content_source_notes_source_id_idx
  on public.content_source_notes(source_id);

create index if not exists content_source_notes_concept_id_idx
  on public.content_source_notes(concept_id)
  where concept_id is not null;

create index if not exists content_source_notes_learn_section_id_idx
  on public.content_source_notes(learn_section_id)
  where learn_section_id is not null;

create unique index if not exists content_source_notes_source_concept_uidx
  on public.content_source_notes(source_id, concept_id)
  where concept_id is not null;

create unique index if not exists content_source_notes_source_learn_section_uidx
  on public.content_source_notes(source_id, learn_section_id)
  where learn_section_id is not null;

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'content_source_notes'
      and c.conname = 'content_source_notes_exactly_one_target'
  ) then
    alter table public.content_source_notes
      add constraint content_source_notes_exactly_one_target
      check (
        (concept_id is not null)::integer
        + (learn_section_id is not null)::integer = 1
      )
      not valid;
  end if;
end
$migration$;
