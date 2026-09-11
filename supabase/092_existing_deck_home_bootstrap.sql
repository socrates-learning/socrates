-- Read-only common-path Home bootstrap. Existing decks resolve in one RPC;
-- deck creation remains the established race-safe fallback in application code.

begin;

create or replace function public.get_existing_home_study_bootstrap(
  p_library_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  active_deck public.study_decks%rowtype;
begin
  if current_user_id is null or not public.has_socrates_role() then
    raise exception 'Not authorized to load Home study data.';
  end if;

  if not public.is_editor_or_admin()
    and not exists (
      select 1
      from public.user_libraries membership
      where membership.user_id = current_user_id
        and membership.library_id = p_library_id
    )
  then
    raise exception 'Not authorized for this Library.';
  end if;

  select deck.*
  into active_deck
  from public.study_decks deck
  where deck.user_id = current_user_id
    and deck.library_id = p_library_id
    and deck.is_active
  order by deck.created_at, deck.id
  limit 1;

  if active_deck.id is null then
    return jsonb_build_object(
      'deck', null,
      'bootstrap', null
    );
  end if;

  return jsonb_build_object(
    'deck', to_jsonb(active_deck),
    'bootstrap', public.get_home_study_bootstrap(
      p_library_id,
      active_deck.id
    )
  );
end;
$$;

revoke all on function public.get_existing_home_study_bootstrap(uuid)
  from public, anon, authenticated;
grant execute on function public.get_existing_home_study_bootstrap(uuid)
  to authenticated;

commit;
