-- Persistent Set Up Deck preferences.
--
-- Eligibility remains owned by user_study_node_selections and
-- user_study_concept_overrides. These preferences are soft future scheduler
-- inputs only; resolve_study_deck remains eligibility-only.

begin;

alter table public.study_decks
  add column cram_mode boolean not null default false;

create table public.study_deck_node_preferences (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  library_id uuid not null references public.libraries(id) on delete cascade,
  library_node_id uuid not null,
  new_mastery_balance smallint not null default 50,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_deck_node_preferences_balance_check
    check (new_mastery_balance between 0 and 100),
  constraint study_deck_node_preferences_deck_node_key
    unique (deck_id, library_node_id),
  constraint study_deck_node_preferences_deck_owner_library_fkey
    foreign key (deck_id, user_id, library_id)
    references public.study_decks(id, user_id, library_id)
    on delete cascade,
  constraint study_deck_node_preferences_node_library_fkey
    foreign key (library_node_id, library_id)
    references public.library_nodes(id, library_id)
    on delete cascade
);

create index study_deck_node_preferences_deck_id_idx
  on public.study_deck_node_preferences(deck_id);
create index study_deck_node_preferences_user_library_idx
  on public.study_deck_node_preferences(user_id, library_id);

create trigger set_study_deck_node_preferences_updated_at
  before update on public.study_deck_node_preferences
  for each row execute function public.set_user_study_selection_updated_at();

-- Existing selections start balanced. ON CONFLICT keeps this migration safe if
-- its data statement is repeated during a controlled recovery.
insert into public.study_deck_node_preferences (
  deck_id,
  user_id,
  library_id,
  library_node_id,
  new_mastery_balance
)
select
  selection.deck_id,
  selection.user_id,
  selection.library_id,
  selection.node_id,
  50
from public.user_study_node_selections selection
on conflict (deck_id, library_node_id) do nothing;

-- Every future eligibility selection receives an atomic default preference.
-- A retained preference wins when a node is reselected.
create or replace function public.ensure_study_deck_node_preference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.study_deck_node_preferences (
    deck_id,
    user_id,
    library_id,
    library_node_id,
    new_mastery_balance
  )
  values (
    new.deck_id,
    new.user_id,
    new.library_id,
    new.node_id,
    50
  )
  on conflict (deck_id, library_node_id) do nothing;

  return new;
end;
$$;

create trigger ensure_study_deck_node_preference_after_selection
  after insert on public.user_study_node_selections
  for each row execute function public.ensure_study_deck_node_preference();

alter table public.study_deck_node_preferences enable row level security;

create policy "Users read own study deck node preferences"
  on public.study_deck_node_preferences
  for select
  to authenticated
  using (
    public.has_socrates_role()
    and exists (
      select 1
      from public.study_decks deck
      where deck.id = study_deck_node_preferences.deck_id
        and deck.user_id = (select auth.uid())
        and study_deck_node_preferences.user_id = deck.user_id
        and study_deck_node_preferences.library_id = deck.library_id
    )
  );

create policy "Users manage own selected study deck node preferences"
  on public.study_deck_node_preferences
  for all
  to authenticated
  using (
    public.has_socrates_role()
    and exists (
      select 1
      from public.study_decks deck
      where deck.id = study_deck_node_preferences.deck_id
        and deck.user_id = (select auth.uid())
        and study_deck_node_preferences.user_id = deck.user_id
        and study_deck_node_preferences.library_id = deck.library_id
    )
  )
  with check (
    public.has_socrates_role()
    and exists (
      select 1
      from public.study_decks deck
      join public.user_study_node_selections selection
        on selection.deck_id = deck.id
       and selection.node_id = study_deck_node_preferences.library_node_id
       and selection.user_id = deck.user_id
       and selection.library_id = deck.library_id
      where deck.id = study_deck_node_preferences.deck_id
        and deck.user_id = (select auth.uid())
        and study_deck_node_preferences.user_id = deck.user_id
        and study_deck_node_preferences.library_id = deck.library_id
    )
  );

revoke all on table public.study_deck_node_preferences
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.study_deck_node_preferences
  to authenticated;

revoke all on function public.ensure_study_deck_node_preference()
  from public, anon, authenticated;

alter table public.study_sessions
  add column cram_mode boolean not null default false;

alter table public.study_sessions
  alter column selection_snapshot set default jsonb_build_object(
    'selected_node_ids', '[]'::jsonb,
    'concept_overrides', '{}'::jsonb,
    'node_preferences', '{}'::jsonb,
    'cram_mode', false
  );

-- Keep the existing signature for deployed clients. The legacy scalar stores
-- the average persisted selected-node preference for compatibility, while the
-- complete per-node map and Cram flag are captured in selection_snapshot.
create or replace function public.start_study_session(
  p_study_deck_id uuid,
  p_new_mastery_balance integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_deck public.study_decks%rowtype;
  snapshot jsonb;
  session_balance integer;
  new_session_id uuid;
begin
  if current_user_id is null or not public.has_socrates_role() then
    raise exception 'Not authorized to start a study session.';
  end if;

  if p_new_mastery_balance is null or p_new_mastery_balance not between 0 and 100 then
    raise exception 'Study balance must be between 0 and 100.';
  end if;

  select deck.*
  into target_deck
  from public.study_decks deck
  where deck.id = p_study_deck_id
    and deck.user_id = current_user_id
    and deck.is_active;

  if target_deck.id is null then
    raise exception 'Active study deck not found.';
  end if;

  if not exists (
    select 1
    from public.resolve_study_deck(target_deck.id) resolved
    join public.questions question on question.concept_id = resolved.concept_id
    where question.status = 'published'
      and question.question_type = 'short_answer'
      and exists (
        select 1
        from public.question_accepted_answers answer
        where answer.question_id = question.id
      )
  ) then
    raise exception 'No eligible authored questions are available for this deck.';
  end if;

  select coalesce(
    round(avg(coalesce(preference.new_mastery_balance, 50)))::integer,
    p_new_mastery_balance
  )
  into session_balance
  from public.user_study_node_selections selection
  left join public.study_deck_node_preferences preference
    on preference.deck_id = selection.deck_id
   and preference.library_node_id = selection.node_id
  where selection.deck_id = target_deck.id
    and selection.user_id = current_user_id
    and selection.library_id = target_deck.library_id;

  select jsonb_build_object(
    'selected_node_ids',
    coalesce(
      (
        select jsonb_agg(selection.node_id order by selection.node_id::text)
        from public.user_study_node_selections selection
        where selection.deck_id = target_deck.id
          and selection.user_id = current_user_id
          and selection.library_id = target_deck.library_id
      ),
      '[]'::jsonb
    ),
    'concept_overrides',
    coalesce(
      (
        select jsonb_object_agg(
          override.concept_id::text,
          override.selection_state
          order by override.concept_id::text
        )
        from public.user_study_concept_overrides override
        where override.deck_id = target_deck.id
          and override.user_id = current_user_id
          and override.library_id = target_deck.library_id
      ),
      '{}'::jsonb
    ),
    'node_preferences',
    coalesce(
      (
        select jsonb_object_agg(
          selection.node_id::text,
          coalesce(preference.new_mastery_balance, 50)
          order by selection.node_id::text
        )
        from public.user_study_node_selections selection
        left join public.study_deck_node_preferences preference
          on preference.deck_id = selection.deck_id
         and preference.library_node_id = selection.node_id
        where selection.deck_id = target_deck.id
          and selection.user_id = current_user_id
          and selection.library_id = target_deck.library_id
      ),
      '{}'::jsonb
    ),
    'cram_mode', target_deck.cram_mode
  )
  into snapshot;

  insert into public.study_sessions (
    user_id,
    library_id,
    study_deck_id,
    new_mastery_balance,
    cram_mode,
    selection_snapshot
  )
  values (
    current_user_id,
    target_deck.library_id,
    target_deck.id,
    session_balance::smallint,
    target_deck.cram_mode,
    snapshot
  )
  returning id into new_session_id;

  return new_session_id;
end;
$$;

revoke all on function public.start_study_session(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.start_study_session(uuid, integer)
  to authenticated;

commit;
