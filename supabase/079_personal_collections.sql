-- Study Creator Phase 4B: owner-global Personal Decks with Card-only membership.
-- This organizational layer does not copy personal content or participate in study selection.

begin;

create table public.personal_collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint personal_collections_name_not_blank check (btrim(name) <> ''),
  constraint personal_collections_name_length check (char_length(name) <= 160),
  constraint personal_collections_id_owner_key unique (id, owner_id)
);

create unique index personal_collections_owner_name_key
  on public.personal_collections(owner_id, lower(btrim(name)));

create trigger set_personal_collections_updated_at
  before update on public.personal_collections
  for each row execute function public.set_personal_content_updated_at();

create table public.personal_collection_cards (
  collection_id uuid not null,
  owner_id uuid not null default auth.uid(),
  personal_card_id uuid not null,
  created_at timestamptz not null default now(),
  constraint personal_collection_cards_pkey primary key (collection_id, personal_card_id),
  constraint personal_collection_cards_collection_owner_fkey
    foreign key (collection_id, owner_id)
    references public.personal_collections(id, owner_id)
    on delete cascade,
  constraint personal_collection_cards_card_owner_fkey
    foreign key (personal_card_id, owner_id)
    references public.personal_cards(id, owner_id)
    on delete cascade
);

create index personal_collection_cards_owner_card_idx
  on public.personal_collection_cards(owner_id, personal_card_id);

alter table public.personal_collections enable row level security;
alter table public.personal_collection_cards enable row level security;

create policy "Users read own personal collections"
  on public.personal_collections for select to authenticated
  using (owner_id = (select auth.uid()) and public.has_socrates_role());
create policy "Users create own personal collections"
  on public.personal_collections for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.has_socrates_role());
create policy "Users update own personal collections"
  on public.personal_collections for update to authenticated
  using (owner_id = (select auth.uid()) and public.has_socrates_role())
  with check (owner_id = (select auth.uid()) and public.has_socrates_role());
create policy "Users delete own personal collections"
  on public.personal_collections for delete to authenticated
  using (owner_id = (select auth.uid()) and public.has_socrates_role());

create policy "Users read own personal collection cards"
  on public.personal_collection_cards for select to authenticated
  using (owner_id = (select auth.uid()) and public.has_socrates_role());
create policy "Users add own personal collection cards"
  on public.personal_collection_cards for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.has_socrates_role());
create policy "Users remove own personal collection cards"
  on public.personal_collection_cards for delete to authenticated
  using (owner_id = (select auth.uid()) and public.has_socrates_role());

revoke all on table public.personal_collections from public, anon, authenticated;
revoke all on table public.personal_collection_cards from public, anon, authenticated;
grant select, insert, update, delete on table public.personal_collections to authenticated;
grant select, insert, delete on table public.personal_collection_cards to authenticated;

notify pgrst, 'reload schema';

commit;
