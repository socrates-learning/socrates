-- Study Creator Stage 1: private, user-owned topics, concepts, and cards.
-- This layer is intentionally separate from official Creator Studio content and
-- does not change Set Up Deck, Study Mode, or Priority Algorithm behavior.

begin;

create table public.personal_topics (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  parent_id uuid,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint personal_topics_name_not_blank check (btrim(name) <> ''),
  constraint personal_topics_name_length check (char_length(name) <= 120),
  constraint personal_topics_id_owner_key unique (id, owner_id),
  constraint personal_topics_parent_owner_fkey
    foreign key (parent_id, owner_id)
    references public.personal_topics(id, owner_id)
    on delete restrict,
  constraint personal_topics_not_own_parent check (parent_id is distinct from id)
);

create unique index personal_topics_root_name_key
  on public.personal_topics(owner_id, lower(btrim(name)))
  where parent_id is null;
create unique index personal_topics_child_name_key
  on public.personal_topics(owner_id, parent_id, lower(btrim(name)))
  where parent_id is not null;
create index personal_topics_owner_parent_sort_idx
  on public.personal_topics(owner_id, parent_id, sort_order, created_at);

create or replace function public.validate_personal_topic_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ancestor_id uuid := new.parent_id;
  next_parent_id uuid;
begin
  while ancestor_id is not null loop
    if ancestor_id = new.id then
      raise exception 'A personal topic cannot be moved beneath itself or one of its children';
    end if;

    select topic.parent_id
    into next_parent_id
    from public.personal_topics topic
    where topic.id = ancestor_id
      and topic.owner_id = new.owner_id;

    if not found then
      raise exception 'Personal topic parent not found';
    end if;

    ancestor_id := next_parent_id;
  end loop;

  return new;
end;
$$;

create trigger validate_personal_topic_parent
  before insert or update of parent_id, owner_id on public.personal_topics
  for each row execute function public.validate_personal_topic_parent();

create table public.personal_concepts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  topic_id uuid not null,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint personal_concepts_name_not_blank check (btrim(name) <> ''),
  constraint personal_concepts_name_length check (char_length(name) <= 160),
  constraint personal_concepts_description_length
    check (description is null or char_length(description) <= 1000),
  constraint personal_concepts_id_owner_key unique (id, owner_id),
  constraint personal_concepts_topic_owner_fkey
    foreign key (topic_id, owner_id)
    references public.personal_topics(id, owner_id)
    on delete restrict
);

create unique index personal_concepts_topic_name_key
  on public.personal_concepts(owner_id, topic_id, lower(btrim(name)));
create index personal_concepts_owner_topic_created_idx
  on public.personal_concepts(owner_id, topic_id, created_at);

create table public.personal_cards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  concept_id uuid not null,
  question text not null,
  answer text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint personal_cards_question_not_blank check (btrim(question) <> ''),
  constraint personal_cards_answer_not_blank check (btrim(answer) <> ''),
  constraint personal_cards_question_length check (char_length(question) <= 10000),
  constraint personal_cards_answer_length check (char_length(answer) <= 20000),
  constraint personal_cards_id_owner_key unique (id, owner_id),
  constraint personal_cards_concept_owner_fkey
    foreign key (concept_id, owner_id)
    references public.personal_concepts(id, owner_id)
    on delete cascade
);

create index personal_cards_owner_concept_created_idx
  on public.personal_cards(owner_id, concept_id, created_at);
create index personal_cards_owner_updated_idx
  on public.personal_cards(owner_id, updated_at desc);

create or replace function public.set_personal_content_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_personal_topics_updated_at
  before update on public.personal_topics
  for each row execute function public.set_personal_content_updated_at();
create trigger set_personal_concepts_updated_at
  before update on public.personal_concepts
  for each row execute function public.set_personal_content_updated_at();
create trigger set_personal_cards_updated_at
  before update on public.personal_cards
  for each row execute function public.set_personal_content_updated_at();

alter table public.personal_topics enable row level security;
alter table public.personal_concepts enable row level security;
alter table public.personal_cards enable row level security;

create policy "Users read own personal topics"
  on public.personal_topics
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.has_socrates_role()
  );
create policy "Users create own personal topics"
  on public.personal_topics
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.has_socrates_role()
  );
create policy "Users update own personal topics"
  on public.personal_topics
  for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and public.has_socrates_role()
  );
create policy "Users delete own personal topics"
  on public.personal_topics
  for delete
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.has_socrates_role()
  );

create policy "Users read own personal concepts"
  on public.personal_concepts
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.has_socrates_role()
  );
create policy "Users create own personal concepts"
  on public.personal_concepts
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.has_socrates_role()
  );
create policy "Users update own personal concepts"
  on public.personal_concepts
  for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and public.has_socrates_role()
  );
create policy "Users delete own personal concepts"
  on public.personal_concepts
  for delete
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.has_socrates_role()
  );

create policy "Users read own personal cards"
  on public.personal_cards
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.has_socrates_role()
  );
create policy "Users create own personal cards"
  on public.personal_cards
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.has_socrates_role()
  );
create policy "Users update own personal cards"
  on public.personal_cards
  for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and public.has_socrates_role()
  );
create policy "Users delete own personal cards"
  on public.personal_cards
  for delete
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.has_socrates_role()
  );

revoke all on table public.personal_topics from public, anon, authenticated;
revoke all on table public.personal_concepts from public, anon, authenticated;
revoke all on table public.personal_cards from public, anon, authenticated;
grant select, insert, update, delete on table public.personal_topics to authenticated;
grant select, insert, update, delete on table public.personal_concepts to authenticated;
grant select, insert, update, delete on table public.personal_cards to authenticated;

revoke all on function public.set_personal_content_updated_at()
  from public, anon, authenticated;
revoke all on function public.validate_personal_topic_parent()
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
