-- Read-only staff diagnostics for the authenticated learner only.
-- No scheduler/evidence definitions are replaced. The active-session offer is
-- delegated to the unified scheduler; scores for other Concepts are unavailable.
begin;
create function public.get_creator_algorithm_diagnostics(p_library_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  learner_id uuid := auth.uid();
  library_name text;
  active_session public.study_sessions%rowtype;
  candidate jsonb;
  result jsonb;
begin
  if learner_id is null or not public.is_editor_or_admin() then
    raise exception 'Only editors and admins may read Algorithm diagnostics';
  end if;
  select l.name into library_name from public.libraries l where l.id = p_library_id;
  if not found then raise exception 'Library not found'; end if;

  -- Match the real session context. Do not create a synthetic session or mutate
  -- selections to manufacture per-Concept scores. Latest open session is explicit.
  select s.* into active_session from public.study_sessions s
  where s.user_id = learner_id and s.library_id = p_library_id and s.ended_at is null
  order by s.started_at desc, s.id desc limit 1 for share;
  if active_session.id is not null then
    candidate := public.select_next_study_candidate(active_session.id, true);
  end if;

  with library_concepts as (
    select c.id, c.name from public.concepts c
    where exists (select 1 from public.concept_placements cp
      join public.library_nodes n on n.id = cp.library_node_id
      where cp.concept_id = c.id and n.library_id = p_library_id)
  ), library_attempts as (
    -- Attribute history to the Library at session time, not current placement.
    select a.id, a.concept_id, a.question_id, a.created_at, a.result,
      a.testing_angle, a.study_session_id
    from public.review_attempts a join public.study_sessions s on s.id = a.study_session_id
    where a.user_id = learner_id and s.user_id = learner_id and s.library_id = p_library_id
  )
  select jsonb_build_object(
    'library', jsonb_build_object('id', p_library_id, 'name', library_name),
    'as_of', now(),
    'summary', jsonb_build_object(
      'sessions', (select count(*) from public.study_sessions s where s.user_id = learner_id and s.library_id = p_library_id),
      'attempts', (select count(*) from library_attempts),
      'concepts_assessed', (select count(distinct a.concept_id) from library_attempts a),
      'concepts_in_library', (select count(*) from library_concepts)
    ),
    'concepts', coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name,
      'state', (select to_jsonb(m) - array['user_id','concept_id','created_at','updated_at']
        from public.user_concept_mastery m where m.user_id = learner_id and m.concept_id = c.id),
      'angles', coalesce((select jsonb_agg(jsonb_build_object(
        'testing_angle', a.testing_angle, 'evidence_count', a.evidence_count,
        'last_result', a.last_result, 'last_exposure_at', a.last_exposure_at
      ) order by a.testing_angle) from public.user_concept_testing_angle_state a
        where a.user_id = learner_id and a.concept_id = c.id), '[]'::jsonb)
    ) order by c.name, c.id) from library_concepts c), '[]'::jsonb),
    'recent_attempts', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc, r.id desc) from (
      select a.*, c.name as concept_name, left(q.prompt, 240) as current_prompt
      from (select * from library_attempts order by created_at desc, id desc limit 50) a
      left join public.concepts c on c.id = a.concept_id
      left join public.questions q on q.id = a.question_id
    ) r), '[]'::jsonb),
    'session', case when active_session.id is not null then jsonb_build_object(
      'id', active_session.id, 'started_at', active_session.started_at,
      'cram_mode', active_session.cram_mode
    ) else null end,
    -- Only official debug plus the source decision is needed here. Never return
    -- personal-card payloads or accepted answers from the scheduler response.
    'official_offer', (candidate #> '{debug,official_offer}') - 'accepted_answer',
    'selected_source', candidate #> '{debug,selected_source}',
    'source_decision', candidate #> '{debug,source_decision}'
  ) into result;
  return result;
end;
$$;
revoke all on function public.get_creator_algorithm_diagnostics(uuid) from public, anon, authenticated;
grant execute on function public.get_creator_algorithm_diagnostics(uuid) to authenticated;
commit;
