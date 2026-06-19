-- Socrates database schema
-- Run this in Supabase SQL Editor.

create extension if not exists "uuid-ossp";

create table public.libraries (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  created_at timestamptz default now()
);

create table public.library_nodes (
  id uuid primary key default uuid_generate_v4(),
  library_id uuid references public.libraries(id) on delete cascade,
  parent_id uuid references public.library_nodes(id) on delete cascade,
  name text not null,
  node_type text not null check (node_type in ('section','chapter','topic','module')),
  sort_order int default 0,
  created_at timestamptz default now()
);

create table public.concepts (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  concept_type text,
  importance text check (importance in ('Low','Medium','High')) default 'Medium',
  difficulty text check (difficulty in ('Beginner','Intermediate','Advanced')) default 'Beginner',
  estimated_time text,
  summary text,
  why_it_matters text,
  created_by uuid references auth.users(id),
  is_public boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.concept_placements (
  id uuid primary key default uuid_generate_v4(),
  concept_id uuid references public.concepts(id) on delete cascade,
  library_node_id uuid references public.library_nodes(id) on delete cascade,
  sort_order int default 0,
  unique(concept_id, library_node_id)
);

create table public.concept_relationships (
  id uuid primary key default uuid_generate_v4(),
  source_concept_id uuid references public.concepts(id) on delete cascade,
  target_concept_id uuid references public.concepts(id) on delete cascade,
  relationship_type text not null,
  explanation text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  unique(source_concept_id, target_concept_id, relationship_type)
);

create table public.learn_sections (
  id uuid primary key default uuid_generate_v4(),
  concept_id uuid references public.concepts(id) on delete cascade,
  title text not null,
  body text not null,
  sort_order int default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.learning_objects (
  id uuid primary key default uuid_generate_v4(),
  primary_concept_id uuid references public.concepts(id) on delete cascade,
  object_type text not null check (object_type in ('flashcard','question','clinical_scenario','distinction','mnemonic','note','explanation')),
  prompt text not null,
  answer text,
  explanation text,
  submastery_area text,
  difficulty text check (difficulty in ('Beginner','Intermediate','Advanced')) default 'Beginner',
  created_by uuid references auth.users(id),
  is_public boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.learning_object_concepts (
  id uuid primary key default uuid_generate_v4(),
  learning_object_id uuid references public.learning_objects(id) on delete cascade,
  concept_id uuid references public.concepts(id) on delete cascade,
  role text default 'related',
  unique(learning_object_id, concept_id)
);

create table public.sources (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  author text,
  edition text,
  source_type text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table public.content_source_notes (
  id uuid primary key default uuid_generate_v4(),
  source_id uuid references public.sources(id) on delete set null,
  concept_id uuid references public.concepts(id) on delete cascade,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table public.user_concept_mastery (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  concept_id uuid references public.concepts(id) on delete cascade,
  mastery numeric default 50,
  updated_at timestamptz default now(),
  unique(user_id, concept_id)
);

create table public.user_submastery (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  concept_id uuid references public.concepts(id) on delete cascade,
  submastery_area text not null,
  mastery numeric default 50,
  updated_at timestamptz default now(),
  unique(user_id, concept_id, submastery_area)
);

create table public.review_attempts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  learning_object_id uuid references public.learning_objects(id) on delete cascade,
  result text not null check (result in ('knew','guessed','missed','need_explanation')),
  created_at timestamptz default now()
);

create table public.user_notes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  concept_id uuid references public.concepts(id) on delete cascade,
  note text not null,
  updated_at timestamptz default now(),
  unique(user_id, concept_id)
);

create table public.content_flags (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  learning_object_id uuid references public.learning_objects(id) on delete cascade,
  reason text,
  details text,
  created_at timestamptz default now()
);

-- Starter seed content
insert into public.libraries (name, description) values
('Pharmacology', 'Drug classes, mechanisms, clinical uses, adverse effects, and patient safety.'),
('Physiology', 'Body systems and normal function.'),
('Pathophysiology', 'Disease processes and abnormal physiology.');

-- Row Level Security foundation. Policies should be tightened before public launch.
alter table public.libraries enable row level security;
alter table public.library_nodes enable row level security;
alter table public.concepts enable row level security;
alter table public.concept_placements enable row level security;
alter table public.concept_relationships enable row level security;
alter table public.learn_sections enable row level security;
alter table public.learning_objects enable row level security;
alter table public.learning_object_concepts enable row level security;
alter table public.sources enable row level security;
alter table public.content_source_notes enable row level security;
alter table public.user_concept_mastery enable row level security;
alter table public.user_submastery enable row level security;
alter table public.review_attempts enable row level security;
alter table public.user_notes enable row level security;
alter table public.content_flags enable row level security;

-- Public read for public educational content.
create policy "Public libraries are readable" on public.libraries for select using (true);
create policy "Public concepts are readable" on public.concepts for select using (is_public = true or auth.uid() = created_by);
create policy "Creators can insert concepts" on public.concepts for insert with check (auth.uid() = created_by);
create policy "Creators can update own concepts" on public.concepts for update using (auth.uid() = created_by);

-- User-owned data policies.
create policy "Users manage own mastery" on public.user_concept_mastery for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own submastery" on public.user_submastery for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own notes" on public.user_notes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users create own attempts" on public.review_attempts for insert with check (auth.uid() = user_id);
create policy "Users read own attempts" on public.review_attempts for select using (auth.uid() = user_id);
