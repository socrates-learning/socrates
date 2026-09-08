-- Disposable / rollback-only integration verifier. Run after migration 084 locally.
\set ON_ERROR_STOP on
begin;
create temporary table diagnostics_results (name text primary key, result text not null);
create function pg_temp.check_result(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL: %', label; end if;
  insert into diagnostics_results values(label, 'PASS');
end $$;
create function pg_temp.expect_error(label text, statement text) returns void language plpgsql as $$
declare rejected boolean := false;
begin
  begin execute statement; exception when others then rejected := true; end;
  perform pg_temp.check_result(label, rejected);
end $$;
create temporary table diagnostics_fixture as select gen_random_uuid() editor, gen_random_uuid() learner,
  gen_random_uuid() library, gen_random_uuid() other_library, gen_random_uuid() node,
  gen_random_uuid() other_node, gen_random_uuid() primary_concept, gen_random_uuid() related_a,
  gen_random_uuid() related_b, gen_random_uuid() related_c, gen_random_uuid() foreign_concept,
  gen_random_uuid() deck, gen_random_uuid() session;
insert into auth.users(id) select editor from diagnostics_fixture union all select learner from diagnostics_fixture;
insert into public.user_roles(user_id,role) select editor,'editor' from diagnostics_fixture union all select learner,'learner' from diagnostics_fixture;
select set_config('request.jwt.claim.sub',editor::text,true) from diagnostics_fixture;
insert into public.libraries(id,name,slug,status) select library,'Algorithm diagnostics','diagnostics-'||library,'active' from diagnostics_fixture union all select other_library,'Other','diagnostics-'||other_library,'active' from diagnostics_fixture;
insert into public.library_nodes(id,library_id,name,node_type) select node,library,'Local test root','section' from diagnostics_fixture union all select other_node,other_library,'Other root','section' from diagnostics_fixture;
insert into public.concepts(id,name,status,created_by)
  select id, label,'published',editor from diagnostics_fixture cross join lateral (values
    (primary_concept,'Primary'),(related_a,'Related A'),(related_b,'Related B'),(related_c,'Related C'),(foreign_concept,'Other Library')) c(id,label);
insert into public.concept_placements(concept_id,library_node_id)
 select id,case when id=foreign_concept then other_node else node end from diagnostics_fixture cross join lateral unnest(array[primary_concept,related_a,related_b,related_c,foreign_concept]) id;
insert into public.study_decks(id,user_id,library_id,name,is_active) select deck,editor,library,'Algorithm diagnostics',false from diagnostics_fixture;
insert into public.user_study_node_selections(user_id,library_id,node_id,deck_id) select editor,library,node,deck from diagnostics_fixture;
insert into public.study_sessions(id,user_id,library_id,study_deck_id,selection_snapshot)
 select session,editor,library,deck,jsonb_build_object('selected_node_ids',jsonb_build_array(node),'node_preferences',jsonb_build_object(node::text,50)) from diagnostics_fixture;
insert into public.concept_prerequisites(concept_id,prerequisite_concept_id,strength,created_by,updated_by)
 select primary_concept,related_a,'required',editor,editor from diagnostics_fixture;

-- Strong and weak scenarios use the real attempt writer, not fabricated state.
create temporary table diagnostic_questions as
select c.id concept_id, public.save_question_with_relationships_v2(
 null,c.id,'short_answer','Diagnostics '||c.name,null,'published',null,0,'medium',
 'Mechanism','[{"answer_text":"Answer"}]',null,null,'{}',f.library,
 case when c.id=f.primary_concept then array[f.related_b] else '{}'::uuid[] end,
 array['Application']) as q
from diagnostics_fixture f join public.concepts c on c.id in (f.primary_concept,f.related_a);
create temporary table definitions_before as
select oid,pg_get_functiondef(oid) definition from pg_proc
where pronamespace='public'::regnamespace and prokind='f';
grant all on diagnostics_fixture, diagnostics_results, diagnostic_questions to authenticated;
set local role authenticated;
do $$
declare f record; q uuid; strong_q uuid; d jsonb; o jsonb; c jsonb; baseline jsonb; i integer;
begin
 select * into f from diagnostics_fixture;
 select (x.q).id into q from diagnostic_questions x where concept_id=f.primary_concept;
 select (x.q).id into strong_q from diagnostic_questions x where concept_id=f.related_a;
 for i in 1..4 loop
  perform public.record_study_session_attempt(f.session,strong_q,f.related_a,'easy');
  perform public.record_study_session_attempt(f.session,q,f.primary_concept,'forgot');
 end loop;
 d := public.get_creator_algorithm_diagnostics(f.library);
 perform pg_temp.check_result('strong versus weak mastery matches real attempts',
  (select (entry#>>'{state,mastery_estimate}')::numeric from jsonb_array_elements(d->'concepts') entry where entry->>'id'=f.related_a::text) >
  (select (entry#>>'{state,mastery_estimate}')::numeric from jsonb_array_elements(d->'concepts') entry where entry->>'id'=f.primary_concept::text));
 perform pg_temp.check_result('Primary Angle rows equal persisted state exactly',
  (select entry->'angles' from jsonb_array_elements(d->'concepts') entry where entry->>'id'=f.primary_concept::text)=
  (select jsonb_agg(jsonb_build_object('testing_angle',a.testing_angle,'evidence_count',a.evidence_count,'last_result',a.last_result,'last_exposure_at',a.last_exposure_at) order by a.testing_angle) from public.user_concept_testing_angle_state a where a.concept_id=f.primary_concept));
 -- The prerequisite starts strong, then becomes weak through authentic evidence.
 for i in 1..4 loop
  perform public.record_study_session_attempt(f.session,strong_q,f.related_a,'didnt_know');
 end loop;
 d := public.get_creator_algorithm_diagnostics(f.library);
 o := public.select_next_study_candidate(f.session,true);
 perform pg_temp.check_result('entire official offer equals unified scheduler exactly', d->'official_offer'=(o#>'{debug,official_offer}')-'accepted_answer');
 perform pg_temp.check_result('final priority equals authoritative selector exactly', d#>'{official_offer,concept_priority}'=public.select_next_study_question(f.session,true)->'concept_priority');
 perform pg_temp.check_result('source decision equals unified scheduler',d->'source_decision'=o#>'{debug,source_decision}' and d->'selected_source'=o#>'{debug,selected_source}');
 perform pg_temp.check_result('active prerequisite is nonzero',(d#>>'{official_offer,prerequisite_priority_component}')::numeric>0);
 perform pg_temp.check_result('repeated lapse is nonzero',(d#>>'{official_offer,repeated_lapse_concern}')::numeric>0);
 perform pg_temp.check_result('weak Primary Angle need available',(d#>>'{official_offer,selected_angle_need}')::numeric>0);
 for c in select value from jsonb_array_elements(d->'concepts') loop
  perform pg_temp.check_result('persisted Concept state '||(c->>'name'),coalesce(c->'state','null'::jsonb)=coalesce((select to_jsonb(m)-array['user_id','concept_id','created_at','updated_at'] from public.user_concept_mastery m where m.concept_id=(c->>'id')::uuid),'null'::jsonb));
 end loop;
 perform pg_temp.check_result('Additional Angles have no evidence',not exists(select 1 from public.user_concept_testing_angle_state where testing_angle='Application'));
 perform pg_temp.check_result('Related Concepts have no mastery',not exists(select 1 from public.user_concept_mastery where concept_id=f.related_b));
 perform pg_temp.check_result('summary counts real session attempts',d#>>'{summary,sessions}'='1' and d#>>'{summary,attempts}'='12' and d#>>'{summary,concepts_assessed}'='2');
 perform pg_temp.check_result('history matches stored attempts',not exists(select 1 from jsonb_array_elements(d->'recent_attempts') r left join public.review_attempts a on a.id=(r->>'id')::uuid where a.id is null or r->>'result'<>a.result or r->>'testing_angle'<>a.testing_angle or (r->>'created_at')::timestamptz<>a.created_at));
 perform pg_temp.check_result('no fabricated historical fields',not exists(select 1 from jsonb_array_elements(d->'recent_attempts') r where r ? 'difficulty' or r ? 'mastery_delta'));
 perform pg_temp.check_result('no answers or personal payload',not (d->'official_offer' ? 'accepted_answer') and not(d ? 'personal_offer'));
 perform pg_temp.check_result('other Library is empty',(public.get_creator_algorithm_diagnostics(f.other_library)#>>'{summary,attempts}')='0');
 for i in 1..55 loop perform public.record_study_session_attempt(f.session,q,f.primary_concept,'hard'); end loop;
 d := public.get_creator_algorithm_diagnostics(f.library);
 perform pg_temp.check_result('recent attempts bounded at 50 without truncating totals',jsonb_array_length(d->'recent_attempts')=50 and d#>>'{summary,attempts}'='67');
 baseline := jsonb_build_object('mastery',(select jsonb_agg(to_jsonb(m)) from public.user_concept_mastery m),'angles',(select jsonb_agg(to_jsonb(a)) from public.user_concept_testing_angle_state a),'attempts',(select jsonb_agg(to_jsonb(a)) from public.review_attempts a),'sessions',(select jsonb_agg(to_jsonb(s)) from public.study_sessions s));
 perform public.get_creator_algorithm_diagnostics(f.library);
 perform pg_temp.check_result('diagnostics do not mutate state/history/sessions',baseline=jsonb_build_object('mastery',(select jsonb_agg(to_jsonb(m)) from public.user_concept_mastery m),'angles',(select jsonb_agg(to_jsonb(a)) from public.user_concept_testing_angle_state a),'attempts',(select jsonb_agg(to_jsonb(a)) from public.review_attempts a),'sessions',(select jsonb_agg(to_jsonb(s)) from public.study_sessions s)));
 perform set_config('request.jwt.claim.sub',f.learner::text,true);
 perform pg_temp.expect_error('learner denied',format('select public.get_creator_algorithm_diagnostics(%L)',f.library));
 perform set_config('request.jwt.claim.sub','',true);
 perform pg_temp.expect_error('unauthenticated denied',format('select public.get_creator_algorithm_diagnostics(%L)',f.library));
end $$;
reset role;
-- Another staff account may read only its own state.
update public.user_roles set role='admin' where user_id=(select learner from diagnostics_fixture);
select set_config('request.jwt.claim.sub',learner::text,true) from diagnostics_fixture;
set local role authenticated;
select pg_temp.check_result('second staff cannot see first learner history',public.get_creator_algorithm_diagnostics(library)#>>'{summary,attempts}'='0' and not exists(select 1 from jsonb_array_elements(public.get_creator_algorithm_diagnostics(library)->'concepts') c where c->'state'<>'null'::jsonb)) from diagnostics_fixture;
reset role;
select set_config('request.jwt.claim.sub',editor::text,true) from diagnostics_fixture;
update public.study_sessions set cram_mode=true where id=(select session from diagnostics_fixture);
set local role authenticated;
select pg_temp.check_result('Cram output matches authoritative scheduler',public.get_creator_algorithm_diagnostics(library)->'official_offer'=public.select_next_study_question(session,true)-'accepted_answer') from diagnostics_fixture;
reset role;
update public.study_sessions set ended_at=now() where id=(select session from diagnostics_fixture);
set local role authenticated;
select pg_temp.check_result('closed session gives state without fabricated priority',public.get_creator_algorithm_diagnostics(library)->'session'='null'::jsonb and public.get_creator_algorithm_diagnostics(library)->'official_offer'='null'::jsonb) from diagnostics_fixture;
reset role;
select pg_temp.check_result('existing function definitions unchanged',not exists(select 1 from definitions_before where definition<>pg_get_functiondef(oid)));
select pg_temp.check_result('anon has no execute privilege',not has_function_privilege('anon','public.get_creator_algorithm_diagnostics(uuid)','execute'));
select * from diagnostics_results order by name;
select count(*) as passed from diagnostics_results;
rollback;
