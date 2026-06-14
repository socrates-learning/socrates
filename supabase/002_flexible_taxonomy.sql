-- Flexible taxonomy upgrade
-- Concepts are not locked into one textbook/category path.
-- A concept can be placed under many user-created libraries, topics, categories, and subcategories.

create table if not exists public.category_trees (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  owner_id uuid references auth.users(id) on delete cascade,
  visibility text not null check (visibility in ('private','shared','public')) default 'private',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.category_nodes (
  id uuid primary key default uuid_generate_v4(),
  tree_id uuid references public.category_trees(id) on delete cascade,
  parent_id uuid references public.category_nodes(id) on delete cascade,
  name text not null,
  node_type text not null default 'category',
  description text,
  sort_order int default 0,
  owner_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(tree_id, parent_id, name)
);

create table if not exists public.concept_category_links (
  id uuid primary key default uuid_generate_v4(),
  concept_id uuid references public.concepts(id) on delete cascade,
  category_node_id uuid references public.category_nodes(id) on delete cascade,
  link_type text not null default 'appears_in',
  owner_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  unique(concept_id, category_node_id, owner_id)
);

create table if not exists public.labels (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  label_type text default 'general',
  owner_id uuid references auth.users(id) on delete cascade,
  visibility text not null check (visibility in ('private','shared','public')) default 'private',
  created_at timestamptz default now(),
  unique(name, owner_id)
);

create table if not exists public.concept_labels (
  id uuid primary key default uuid_generate_v4(),
  concept_id uuid references public.concepts(id) on delete cascade,
  label_id uuid references public.labels(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  unique(concept_id, label_id, owner_id)
);

alter table public.category_trees enable row level security;
alter table public.category_nodes enable row level security;
alter table public.concept_category_links enable row level security;
alter table public.labels enable row level security;
alter table public.concept_labels enable row level security;

create policy "Read visible category trees" on public.category_trees
  for select using (visibility = 'public' or auth.uid() = owner_id);
create policy "Manage own category trees" on public.category_trees
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "Read visible category nodes" on public.category_nodes
  for select using (
    auth.uid() = owner_id or exists (
      select 1 from public.category_trees t
      where t.id = tree_id and t.visibility = 'public'
    )
  );
create policy "Manage own category nodes" on public.category_nodes
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "Manage own concept category links" on public.concept_category_links
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "Read visible labels" on public.labels
  for select using (visibility = 'public' or auth.uid() = owner_id);
create policy "Manage own labels" on public.labels
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "Manage own concept labels" on public.concept_labels
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Example idea, not required seed:
-- ACE Inhibitors can be linked to nodes in Pharmacology, Physiology, Cardiology, Pediatrics, NCLEX, etc.
