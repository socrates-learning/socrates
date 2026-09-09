-- Rollback-only integration verifier for migration 086, using synthetic fixtures.
\set ON_ERROR_STOP on
begin;
create temporary table stabilization_results(name text primary key, result text);
create function pg_temp.check_result(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL: %', label; end if;
  insert into stabilization_results values(label, 'PASS');
end $$;
create temporary table f as select gen_random_uuid() editor, gen_random_uuid() other_user,
 gen_random_uuid() library, gen_random_uuid() node, gen_random_uuid() concept,
 gen_random_uuid() question, gen_random_uuid() deck, gen_random_uuid() session,
 gen_random_uuid() topic, gen_random_uuid() pc, gen_random_uuid() card;
insert into auth.users(id) select editor from f union all select other_user from f;
insert into public.user_roles(user_id,role) select editor,'editor' from f union all select other_user,'learner' from f;
select set_config('request.jwt.claim.sub',editor::text,true) from f;
insert into public.libraries(id,name,slug,status) select library,'Stabilization','stabilization-'||library,'active' from f;
insert into public.library_nodes(id,library_id,name,node_type) select node,library,'Root','section' from f;
insert into public.concepts(id,name,status,created_by) select concept,'Stabilization','published',editor from f;
insert into public.concept_placements(concept_id,library_node_id) select concept,node from f;
insert into public.questions(id,concept_id,question_type,prompt,status,difficulty,testing_angle,created_by)
 select question,concept,'short_answer','Synthetic prompt','published','medium','Mechanism',editor from f;
insert into public.question_accepted_answers(question_id,answer_text) select question,'Answer' from f;
insert into public.study_decks(id,user_id,library_id,name,is_active) select deck,editor,library,'Stabilization',false from f;
insert into public.user_study_node_selections(user_id,library_id,node_id,deck_id) select editor,library,node,deck from f;
insert into public.study_sessions(id,user_id,library_id,study_deck_id,selection_snapshot)
 select session,editor,library,deck,jsonb_build_object('selected_node_ids',jsonb_build_array(node)) from f;
insert into public.personal_topics(id,owner_id,name) select topic,editor,'Synthetic topic' from f;
insert into public.personal_concepts(id,owner_id,topic_id,name) select pc,editor,topic,'Synthetic personal' from f;
insert into public.personal_cards(id,owner_id,concept_id,question,answer) select card,editor,pc,'Personal prompt','Answer' from f;
insert into public.study_deck_personal_topic_selections(deck_id,user_id,library_id,personal_topic_id) select deck,editor,library,topic from f;

-- Compare all evidence, history, and session rows before/after a retry.
create function pg_temp.state_snapshot() returns jsonb language sql as $$
 select jsonb_build_object(
  'sessions',(select jsonb_agg(to_jsonb(x)) from public.study_sessions x where id=(select session from f)),
  'official',(select jsonb_agg(to_jsonb(x) order by id) from public.review_attempts x where user_id=(select editor from f)),
  'personal',(select jsonb_agg(to_jsonb(x) order by id) from public.personal_review_attempts x where user_id=(select editor from f)),
  'mastery',(select jsonb_agg(to_jsonb(x)) from public.user_concept_mastery x where user_id=(select editor from f)),
  'angles',(select jsonb_agg(to_jsonb(x)) from public.user_concept_testing_angle_state x where user_id=(select editor from f)),
  'personal_state',(select jsonb_agg(to_jsonb(x)) from public.user_personal_concept_state x where user_id=(select editor from f))
 );
$$;
create function pg_temp.reject_evidence() returns trigger language plpgsql as $$
begin raise exception 'Synthetic evidence failure'; end $$;

do $$
declare v record; k uuid:=gen_random_uuid(); original jsonb; retry jsonb; baseline jsonb; rejected boolean; n integer;
begin
 select * into v from f;
 original:=public.record_study_session_attempt(v.session,v.question,v.concept,'forgot',k);
 perform pg_temp.check_result('official: first submission persists key', (select count(*)=1 from public.review_attempts where user_id=v.editor and submission_id=k));
 baseline:=pg_temp.state_snapshot();
 retry:=public.record_study_session_attempt(v.session,v.question,v.concept,'forgot',k);
 perform pg_temp.check_result('official: lost acknowledgement retry returns exact original', original=retry);
 perform pg_temp.check_result('official: retry leaves all attempt/session/evidence rows identical', baseline=pg_temp.state_snapshot());
 rejected:=false;
 begin perform public.record_study_session_attempt(v.session,v.question,v.concept,'easy',k); exception when others then rejected:=true; end;
 perform pg_temp.check_result('official: changed payload rejected without writes', rejected and baseline=pg_temp.state_snapshot());
 select answered_count into n from public.study_sessions where id=v.session;
 perform public.record_study_session_attempt(v.session,v.question,v.concept,'easy',gen_random_uuid());
 perform pg_temp.check_result('official: new key for later answer advances once', (select answered_count=n+1 from public.study_sessions where id=v.session));
 perform pg_temp.check_result('official: retry still returns historical result after later answer', original=public.record_study_session_attempt(v.session,v.question,v.concept,'forgot',k));
 update public.study_sessions set ended_at=clock_timestamp() where id=v.session;
 baseline:=pg_temp.state_snapshot();
 perform pg_temp.check_result('official: retry survives closed session',original=public.record_study_session_attempt(v.session,v.question,v.concept,'forgot',k) and baseline=pg_temp.state_snapshot());
 update public.study_sessions set ended_at=null where id=v.session;
 k:=gen_random_uuid();baseline:=pg_temp.state_snapshot();
 execute 'create trigger stabilization_fail before insert or update on public.user_concept_mastery for each row execute function pg_temp.reject_evidence()';
 rejected:=false;
 begin perform public.record_study_session_attempt(v.session,v.question,v.concept,'easy',k); exception when others then rejected:=true; end;
 perform pg_temp.check_result('official: failed evidence rolls back reservation and all state', rejected and baseline=pg_temp.state_snapshot() and not exists(select 1 from public.study_response_submissions where user_id=v.editor and submission_id=k));
 execute 'drop trigger stabilization_fail on public.user_concept_mastery';
 perform public.record_study_session_attempt(v.session,v.question,v.concept,'easy',k);
 perform pg_temp.check_result('official: same key succeeds after rollback', (select count(*)=1 from public.review_attempts where submission_id=k));
 rejected:=false;
 begin perform public.record_study_session_attempt(v.session,v.question,v.concept,'easy',null); exception when others then rejected:=true; end;
 perform pg_temp.check_result('official: null key rejected',rejected);
 perform set_config('request.jwt.claim.sub',v.other_user::text,true);
 rejected:=false;
 begin perform public.record_study_session_attempt(v.session,v.question,v.concept,'easy',k); exception when others then rejected:=true; end;
 perform pg_temp.check_result('official: second user cannot replay first user result',rejected);
 perform set_config('request.jwt.claim.sub',v.editor::text,true);
end $$;

do $$
declare v record; k uuid:=gen_random_uuid(); original jsonb; retry jsonb; baseline jsonb; rejected boolean; n integer;
begin
 select * into v from f;
 original:=public.record_personal_study_attempt(v.session,v.deck,v.card,v.pc,'forgot',k);
 perform pg_temp.check_result('personal: first submission persists key', (select count(*)=1 from public.personal_review_attempts where user_id=v.editor and submission_id=k));
 baseline:=pg_temp.state_snapshot();
 retry:=public.record_personal_study_attempt(v.session,v.deck,v.card,v.pc,'forgot',k);
 perform pg_temp.check_result('personal: lost acknowledgement retry returns exact original', original=retry);
 perform pg_temp.check_result('personal: retry leaves all attempt/session/evidence rows identical', baseline=pg_temp.state_snapshot());
 rejected:=false;
 begin perform public.record_personal_study_attempt(v.session,v.deck,v.card,v.pc,'easy',k); exception when others then rejected:=true; end;
 perform pg_temp.check_result('personal: changed payload rejected without writes', rejected and baseline=pg_temp.state_snapshot());
 select answered_count into n from public.study_sessions where id=v.session;
 perform public.record_personal_study_attempt(v.session,v.deck,v.card,v.pc,'easy',gen_random_uuid());
 perform pg_temp.check_result('personal: new key for later answer advances once', (select answered_count=n+1 from public.study_sessions where id=v.session));
 perform pg_temp.check_result('personal: retry still returns historical result after later answer', original=public.record_personal_study_attempt(v.session,v.deck,v.card,v.pc,'forgot',k));
 update public.study_sessions set ended_at=clock_timestamp() where id=v.session;
 baseline:=pg_temp.state_snapshot();
 perform pg_temp.check_result('personal: retry survives closed session',original=public.record_personal_study_attempt(v.session,v.deck,v.card,v.pc,'forgot',k) and baseline=pg_temp.state_snapshot());
 update public.study_sessions set ended_at=null where id=v.session;
 k:=gen_random_uuid();baseline:=pg_temp.state_snapshot();
 execute 'create trigger stabilization_fail before insert or update on public.user_personal_concept_state for each row execute function pg_temp.reject_evidence()';
 rejected:=false;
 begin perform public.record_personal_study_attempt(v.session,v.deck,v.card,v.pc,'easy',k); exception when others then rejected:=true; end;
 perform pg_temp.check_result('personal: failed evidence rolls back reservation and all state', rejected and baseline=pg_temp.state_snapshot() and not exists(select 1 from public.study_response_submissions where user_id=v.editor and submission_id=k));
 execute 'drop trigger stabilization_fail on public.user_personal_concept_state';
 perform public.record_personal_study_attempt(v.session,v.deck,v.card,v.pc,'easy',k);
 perform pg_temp.check_result('personal: same key succeeds after rollback', (select count(*)=1 from public.personal_review_attempts where submission_id=k));
 rejected:=false;
 begin perform public.record_personal_study_attempt(v.session,v.deck,v.card,v.pc,'easy',null); exception when others then rejected:=true; end;
 perform pg_temp.check_result('personal: null key rejected',rejected);
 perform set_config('request.jwt.claim.sub',v.other_user::text,true);
 rejected:=false;
 begin perform public.record_personal_study_attempt(v.session,v.deck,v.card,v.pc,'easy',k); exception when others then rejected:=true; end;
 perform pg_temp.check_result('personal: second user cannot replay first user result',rejected);
 perform set_config('request.jwt.claim.sub',v.editor::text,true);
end $$;

select pg_temp.check_result('private response ledger denies direct client read/write',
 not has_table_privilege('authenticated','public.study_response_submissions','SELECT')
 and not has_table_privilege('authenticated','public.study_response_submissions','INSERT')
 and not has_table_privilege('anon','public.study_response_submissions','SELECT'));
select pg_temp.check_result('anonymous cannot invoke keyed writers',
 not has_function_privilege('anon','public.record_study_session_attempt(uuid,uuid,uuid,text,uuid)','EXECUTE')
 and not has_function_privilege('anon','public.record_personal_study_attempt(uuid,uuid,uuid,uuid,text,uuid)','EXECUTE'));
select * from stabilization_results order by name;
rollback;
