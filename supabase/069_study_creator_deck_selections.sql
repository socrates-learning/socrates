-- Study Creator Stage 2A: deck-scoped selection of private personal Topics.
--
-- Row presence means the Topic branch is included. This migration intentionally
-- does not add personal Cards to resolve_study_deck, Study Sessions, Study Mode,
-- review_attempts, or either Priority selector.

begin;

create table public.study_deck_personal_topic_selections (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null,
  user_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  library_id uuid not null,
  personal_topic_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_deck_personal_topic_selections_deck_topic_key
    unique (deck_id, personal_topic_id),
  constraint study_deck_personal_topic_selections_deck_owner_library_fkey
    foreign key (deck_id, user_id, library_id)
    references public.study_decks(id, user_id, library_id)
    on delete cascade,
  constraint study_deck_personal_topic_selections_topic_owner_fkey
    foreign key (personal_topic_id, user_id)
    references public.personal_topics(id, owner_id)
    on delete cascade
);

create index study_deck_personal_topic_selections_deck_id_idx
  on public.study_deck_personal_topic_selections(deck_id);
create index study_deck_personal_topic_selections_user_topic_idx
  on public.study_deck_personal_topic_selections(user_id, personal_topic_id);

create trigger set_study_deck_personal_topic_selections_updated_at
  before update on public.study_deck_personal_topic_selections
  for each row execute function public.set_user_study_selection_updated_at();

alter table public.study_deck_personal_topic_selections enable row level security;

create policy "Users read own personal Topic deck selections"
  on public.study_deck_personal_topic_selections
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.has_socrates_role()
    and exists (
      select 1
      from public.study_decks deck
      where deck.id = study_deck_personal_topic_selections.deck_id
        and deck.user_id = (select auth.uid())
        and deck.user_id = study_deck_personal_topic_selections.user_id
        and deck.library_id = study_deck_personal_topic_selections.library_id
    )
  );

create policy "Users create own personal Topic deck selections"
  on public.study_deck_personal_topic_selections
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and public.has_socrates_role()
    and exists (
      select 1
      from public.study_decks deck
      where deck.id = study_deck_personal_topic_selections.deck_id
        and deck.user_id = (select auth.uid())
        and deck.user_id = study_deck_personal_topic_selections.user_id
        and deck.library_id = study_deck_personal_topic_selections.library_id
    )
    and exists (
      select 1
      from public.personal_topics topic
      where topic.id = study_deck_personal_topic_selections.personal_topic_id
        and topic.owner_id = (select auth.uid())
        and topic.owner_id = study_deck_personal_topic_selections.user_id
    )
  );

create policy "Users update own personal Topic deck selections"
  on public.study_deck_personal_topic_selections
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.has_socrates_role()
  )
  with check (
    user_id = (select auth.uid())
    and public.has_socrates_role()
    and exists (
      select 1
      from public.study_decks deck
      where deck.id = study_deck_personal_topic_selections.deck_id
        and deck.user_id = (select auth.uid())
        and deck.user_id = study_deck_personal_topic_selections.user_id
        and deck.library_id = study_deck_personal_topic_selections.library_id
    )
    and exists (
      select 1
      from public.personal_topics topic
      where topic.id = study_deck_personal_topic_selections.personal_topic_id
        and topic.owner_id = (select auth.uid())
        and topic.owner_id = study_deck_personal_topic_selections.user_id
    )
  );

create policy "Users delete own personal Topic deck selections"
  on public.study_deck_personal_topic_selections
  for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.has_socrates_role()
    and exists (
      select 1
      from public.study_decks deck
      where deck.id = study_deck_personal_topic_selections.deck_id
        and deck.user_id = (select auth.uid())
        and deck.user_id = study_deck_personal_topic_selections.user_id
        and deck.library_id = study_deck_personal_topic_selections.library_id
    )
  );

revoke all on table public.study_deck_personal_topic_selections
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.study_deck_personal_topic_selections
  to authenticated;

notify pgrst, 'reload schema';

commit;
