-- Study Creator Stage 2D: permit Study Sessions backed by either official
-- Questions or selected personal Cards.
--
-- Official eligibility, selection, response persistence, Algorithm v2, Cram
-- traversal, and Session snapshots remain unchanged. The sole contract change
-- is that an owned active deck may start when resolve_study_candidates exposes
-- at least one eligible candidate of either discriminated source.

begin;

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
    from public.resolve_study_candidates(target_deck.id) candidate
  ) then
    raise exception 'No eligible Study candidates are available for this deck.';
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

comment on function public.start_study_session(uuid, integer) is
  'Starts an owned active Study Session when the deck has an eligible official Question or selected owned personal Card; the existing Session snapshot contract is unchanged.';

revoke all on function public.start_study_session(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.start_study_session(uuid, integer)
  to authenticated;

notify pgrst, 'reload schema';

commit;
