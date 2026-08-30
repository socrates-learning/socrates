-- Immutable Concept and Question version infrastructure.
-- This migration is additive only: it does not backfill versions, change
-- authoring RPCs, or alter learner-facing reads.

create table if not exists public.concept_versions (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null
    references public.concepts(id) on delete restrict,
  version_number integer not null
    constraint concept_versions_version_number_check
    check (version_number > 0),
  parent_version_id uuid,
  name text not null
    constraint concept_versions_name_not_blank
    check (btrim(name) <> ''),
  body_markdown text not null default '',
  concept_type text,
  importance text,
  difficulty text,
  estimated_time text,
  summary text,
  why_it_matters text,
  placements_snapshot jsonb not null default '[]'::jsonb
    constraint concept_versions_placements_snapshot_array
    check (jsonb_typeof(placements_snapshot) = 'array'),
  tags_snapshot jsonb not null default '[]'::jsonb
    constraint concept_versions_tags_snapshot_array
    check (jsonb_typeof(tags_snapshot) = 'array'),
  sources_snapshot jsonb not null default '[]'::jsonb
    constraint concept_versions_sources_snapshot_array
    check (jsonb_typeof(sources_snapshot) = 'array'),
  snapshot_schema_version smallint not null default 1
    constraint concept_versions_snapshot_schema_version_check
    check (snapshot_schema_version > 0),
  edit_summary text,
  created_by uuid
    references auth.users(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  constraint concept_versions_concept_version_key
    unique (concept_id, version_number),
  constraint concept_versions_concept_id_id_key
    unique (concept_id, id),
  constraint concept_versions_parent_same_concept_fkey
    foreign key (concept_id, parent_version_id)
    references public.concept_versions(concept_id, id)
    on delete restrict
);

create table if not exists public.question_versions (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null
    references public.questions(id) on delete restrict,
  version_number integer not null
    constraint question_versions_version_number_check
    check (version_number > 0),
  parent_version_id uuid,
  concept_id uuid not null
    references public.concepts(id) on delete restrict,
  question_type text not null
    constraint question_versions_question_type_check
    check (question_type in ('multiple_choice', 'true_false', 'short_answer')),
  prompt text not null
    constraint question_versions_prompt_not_blank
    check (btrim(prompt) <> ''),
  explanation text,
  difficulty text not null default 'medium'
    constraint question_versions_difficulty_check
    check (difficulty in ('easy', 'medium', 'hard')),
  testing_angle text not null default 'General Understanding'
    constraint question_versions_testing_angle_not_blank
    check (btrim(testing_angle) <> ''),
  sort_order integer not null default 0,
  review_article_concept_id uuid
    references public.article_concepts(id) on delete restrict,
  accepted_answers_snapshot jsonb not null default '[]'::jsonb
    constraint question_versions_accepted_answers_snapshot_array
    check (jsonb_typeof(accepted_answers_snapshot) = 'array'),
  options_snapshot jsonb not null default '[]'::jsonb
    constraint question_versions_options_snapshot_array
    check (jsonb_typeof(options_snapshot) = 'array'),
  sources_snapshot jsonb not null default '[]'::jsonb
    constraint question_versions_sources_snapshot_array
    check (jsonb_typeof(sources_snapshot) = 'array'),
  snapshot_schema_version smallint not null default 1
    constraint question_versions_snapshot_schema_version_check
    check (snapshot_schema_version > 0),
  edit_summary text,
  created_by uuid
    references auth.users(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  constraint question_versions_question_version_key
    unique (question_id, version_number),
  constraint question_versions_question_id_id_key
    unique (question_id, id),
  constraint question_versions_parent_same_question_fkey
    foreign key (question_id, parent_version_id)
    references public.question_versions(question_id, id)
    on delete restrict
);

alter table public.concepts
  add column if not exists current_version_id uuid,
  add column if not exists official_version_id uuid;

alter table public.questions
  add column if not exists current_version_id uuid,
  add column if not exists official_version_id uuid;

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.concepts'::regclass
      and c.conname = 'concepts_current_version_same_concept_fkey'
  ) then
    alter table public.concepts
      add constraint concepts_current_version_same_concept_fkey
      foreign key (id, current_version_id)
      references public.concept_versions(concept_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.concepts'::regclass
      and c.conname = 'concepts_official_version_same_concept_fkey'
  ) then
    alter table public.concepts
      add constraint concepts_official_version_same_concept_fkey
      foreign key (id, official_version_id)
      references public.concept_versions(concept_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.questions'::regclass
      and c.conname = 'questions_current_version_same_question_fkey'
  ) then
    alter table public.questions
      add constraint questions_current_version_same_question_fkey
      foreign key (id, current_version_id)
      references public.question_versions(question_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.questions'::regclass
      and c.conname = 'questions_official_version_same_question_fkey'
  ) then
    alter table public.questions
      add constraint questions_official_version_same_question_fkey
      foreign key (id, official_version_id)
      references public.question_versions(question_id, id)
      on delete restrict;
  end if;
end
$migration$;

create index if not exists concept_versions_concept_id_idx
  on public.concept_versions(concept_id);
create index if not exists concept_versions_parent_version_id_idx
  on public.concept_versions(parent_version_id)
  where parent_version_id is not null;
create index if not exists concept_versions_created_by_idx
  on public.concept_versions(created_by)
  where created_by is not null;

create index if not exists question_versions_question_id_idx
  on public.question_versions(question_id);
create index if not exists question_versions_concept_id_idx
  on public.question_versions(concept_id);
create index if not exists question_versions_parent_version_id_idx
  on public.question_versions(parent_version_id)
  where parent_version_id is not null;
create index if not exists question_versions_created_by_idx
  on public.question_versions(created_by)
  where created_by is not null;

-- Version rows are not client-readable or client-writable until explicit,
-- narrowly scoped version policies and controlled creation RPCs are added.
alter table public.concept_versions enable row level security;
alter table public.question_versions enable row level security;

revoke all on table public.concept_versions from public, anon, authenticated;
revoke all on table public.question_versions from public, anon, authenticated;

create or replace function public.prevent_content_version_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% rows are immutable; create a new version instead', tg_table_name;
end;
$$;

drop trigger if exists prevent_concept_version_mutation
  on public.concept_versions;
create trigger prevent_concept_version_mutation
  before update or delete on public.concept_versions
  for each row execute function public.prevent_content_version_mutation();

drop trigger if exists prevent_question_version_mutation
  on public.question_versions;
create trigger prevent_question_version_mutation
  before update or delete on public.question_versions
  for each row execute function public.prevent_content_version_mutation();

revoke all on function public.prevent_content_version_mutation() from public;
