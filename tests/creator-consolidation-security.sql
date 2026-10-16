-- LOCAL ONLY. Run with psql -v ON_ERROR_STOP=1 against a verified disposable/local DB.
-- This is a verifier, not a migration. All fixtures and helper functions roll back.
begin;
create temporary table ownership_results (name text, result text) on commit drop;
grant select, insert on ownership_results to authenticated;
insert into public.testing_angle_vocabulary(storage_key,display_name,status,reserved_names,sort_order) values('General Understanding','General Understanding','active',array['general understanding'],0) on conflict do nothing;
create function pg_temp.expect_denied(label text, statement text, expected_message text)
returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlerrm ~ expected_message then
      insert into ownership_results values (label, 'PASS');
      return;
    end if;
    raise;
  end;
  raise exception 'SECURITY FAILURE: % succeeded', label;
end $$;

do $$
declare
  learner uuid := gen_random_uuid(); other_owner uuid := gen_random_uuid();
  staff uuid := gen_random_uuid(); editor_id uuid := gen_random_uuid();
  library uuid := gen_random_uuid(); root_id uuid := gen_random_uuid();
  personal_topic uuid := gen_random_uuid(); personal_concept uuid := gen_random_uuid();
  personal_card uuid := gen_random_uuid();
begin
  insert into auth.users (id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  select id,'authenticated','authenticated','zz-creator-ownership-'||id||'@example.invalid','',now(),'{}','{}',now(),now()
  from unnest(array[learner,other_owner,staff,editor_id]) id;
  insert into public.user_roles(user_id,role) values
    (learner,'learner'),(other_owner,'learner'),(staff,'admin'),(editor_id,'editor');
  perform set_config('request.jwt.claim.sub',staff::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',staff,'role','authenticated')::text,true);
  insert into public.libraries(id,name,slug,status) values(library,'ZZ ownership','zz-ownership-'||library,'active');
  insert into public.library_nodes(id,library_id,parent_id,name,node_type) values(root_id,library,null,'ZZ root','section');
  insert into public.user_libraries(user_id,library_id,is_primary,assigned_by) values(learner,library,true,staff);
  perform set_config('request.jwt.claim.sub',other_owner::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',other_owner,'role','authenticated')::text,true);
  insert into public.personal_topics(id,owner_id,name) values(personal_topic,other_owner,'ZZ other Topic');
  insert into public.personal_concepts(id,owner_id,topic_id,name) values(personal_concept,other_owner,personal_topic,'ZZ other Concept');
  insert into public.personal_cards(id,owner_id,concept_id,question,answer) values(personal_card,other_owner,personal_concept,'ZZ question','ZZ answer');
  perform set_config('ownership.learner',learner::text,true);
  perform set_config('ownership.other',other_owner::text,true);
  perform set_config('ownership.admin',staff::text,true);
  perform set_config('ownership.editor',editor_id::text,true);
  perform set_config('ownership.library',library::text,true);
  perform set_config('ownership.root',root_id::text,true);
  perform set_config('ownership.topic',personal_topic::text,true);
  perform set_config('ownership.concept',personal_concept::text,true);
  perform set_config('ownership.card',personal_card::text,true);
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('ownership.learner'),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('ownership.learner'),'role','authenticated')::text,true);

do $$
declare
  library uuid := current_setting('ownership.library')::uuid;
  root_id uuid := current_setting('ownership.root')::uuid;
  learner uuid := current_setting('ownership.learner')::uuid;
  other_owner uuid := current_setting('ownership.other')::uuid;
  topic_id uuid := current_setting('ownership.topic')::uuid;
  concept_id uuid := current_setting('ownership.concept')::uuid;
  card_id uuid := current_setting('ownership.card')::uuid;
  own_topic uuid; own_concept uuid; own_card uuid; standalone uuid; collection uuid; overlay_concept uuid; affected integer;
  table_name text; target_id uuid;
begin
  perform pg_temp.expect_denied('learner official Topic RPC',format('select public.create_library_node_in_library(%L,%L,%L)',library,root_id,'FORGED'), 'Only editors and admins');
  perform pg_temp.expect_denied('learner official Concept RPC',format('select public.save_concept_with_prerequisites(null,%L,%L,%L,array[%L::uuid],array[]::uuid[],%L,%L::jsonb,%L::jsonb)','FORGED','Body',library,root_id,'published','[]','[]'), 'Only editors and admins');
  perform pg_temp.expect_denied('learner official Question RPC',format('select public.save_question_with_relationships_v2(null,null,%L,%L,null,%L,null,0,%L,%L,%L::jsonb,%L::jsonb,null,null,%L)', 'short_answer','FORGED','published','medium','General Understanding','[]','[]',library), 'Question authoring denied');
  perform pg_temp.expect_denied('learner direct official Topic insert',format('insert into public.library_nodes(library_id,parent_id,name,node_type) values(%L,%L,%L,%L)',library,root_id,'FORGED','topic'), 'row-level security|permission denied');
  perform pg_temp.expect_denied('learner direct official Concept insert',format('insert into public.concepts(name,created_by) values(%L,%L)','FORGED',learner), 'row-level security|permission denied');
  perform pg_temp.expect_denied('learner direct official Question insert','insert into public.questions default values', 'row-level security|permission denied');
  perform pg_temp.expect_denied('cross-owner Topic insert',format('insert into public.personal_topics(owner_id,name) values(%L,%L)',other_owner,'FORGED'), 'row-level security');
  perform pg_temp.expect_denied('cross-owner Concept insert',format('insert into public.personal_concepts(owner_id,topic_id,name) values(%L,%L,%L)',other_owner,topic_id,'FORGED'), 'row-level security|not owned');
  perform pg_temp.expect_denied('cross-owner Card insert',format('insert into public.personal_cards(owner_id,concept_id,question,answer) values(%L,%L,%L,%L)',other_owner,concept_id,'FORGED','FORGED'), 'row-level security|not owned');
  for table_name,target_id in select * from (values('personal_topics',topic_id),('personal_concepts',concept_id),('personal_cards',card_id)) as targets(t,id) loop
    execute format('update public.%I set owner_id=%L where id=%L',table_name,learner,target_id);
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'Cross-owner UPDATE succeeded: %',table_name; end if;
    execute format('delete from public.%I where id=%L',table_name,target_id);
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'Cross-owner DELETE succeeded: %',table_name; end if;
    insert into ownership_results values ('cross-owner update/delete '||table_name,'PASS');
  end loop;
  select id into own_topic from public.create_personal_topic('ZZ own',null,root_id,0);
  insert into public.personal_concepts(owner_id,topic_id,name) values(learner,own_topic,'ZZ own') returning id into own_concept;
  insert into public.personal_cards(owner_id,concept_id,question,answer) values(learner,own_concept,'ZZ own','answer') returning id into own_card;
  if not exists(select 1 from public.personal_cards where id=own_card and owner_id=learner) then raise exception 'Own creation failed'; end if;
  insert into ownership_results values('learner own Topic/Concept/Card persisted and re-read','PASS');
  update public.personal_cards set question='**still literal**', answer='Existing answer', source_reference='Owner reference' where id=own_card;
  insert into public.personal_cards(owner_id,personal_topic_id,question,answer,source_reference)
    values(learner,own_topic,'**formatted**','## Answer','Standalone reference') returning id into standalone;
  if not exists(select 1 from public.personal_cards where id=own_card and personal_cards.concept_id=own_concept and question='**still literal**' and source_reference='Owner reference')
     or not exists(select 1 from public.personal_cards where id=standalone and personal_cards.concept_id is null and question='**formatted**' and source_reference='Standalone reference')
  then raise exception 'Card identity/format/reference changed'; end if;
  insert into ownership_results values('legacy and standalone source bytes/references persist independently','PASS');
  select o.personal_concept_id into overlay_concept from public.create_personal_concept_overlay(own_topic,'Overlay','Original',root_id,null) o;
  perform public.save_personal_concept_with_overlay(overlay_concept,own_topic,'Renamed','Updated','Reference',root_id,null);
  if not exists(select 1 from public.personal_concepts where id=overlay_concept and name='Renamed' and source_reference='Reference')
    or not exists(select 1 from public.personal_concept_official_placements where personal_concept_id=overlay_concept and library_node_id=root_id)
  then raise exception 'Overlay save/reload failed'; end if;
  perform public.save_personal_concept_with_overlay(overlay_concept,own_topic,'Renamed','Updated','Reference',null,null);
  if exists(select 1 from public.personal_concept_official_placements where personal_concept_id=overlay_concept)
    or not exists(select 1 from public.personal_concepts where id=overlay_concept) then raise exception 'Overlay detach changed Concept'; end if;
  insert into ownership_results values('owner overlay creation, save, detach and reload preserve Concept identity','PASS');
  perform pg_temp.expect_denied('cross-owner overlay save',format('select public.save_personal_concept_with_overlay(%L,%L,%L,%L,null,null,null)',concept_id,own_topic,'Forged','Forged'),'not found for the signed-in owner');
  insert into public.personal_collections(owner_id,name) values(learner,'My Deck') returning id into collection;
  insert into public.personal_collection_cards(collection_id,owner_id,personal_card_id) values(collection,learner,own_card),(collection,learner,standalone);
  if (select count(*) from public.personal_collection_cards where collection_id=collection) <> 2 then raise exception 'Both Card types must support existing Deck membership'; end if;
  perform pg_temp.expect_denied('cross-owner Deck membership',format('insert into public.personal_collection_cards(collection_id,owner_id,personal_card_id) values(%L,%L,%L)',collection,learner,card_id),'foreign key');
  perform pg_temp.expect_denied('duplicate Deck membership',format('insert into public.personal_collection_cards(collection_id,owner_id,personal_card_id) values(%L,%L,%L)',collection,learner,own_card),'duplicate key');
  perform pg_temp.expect_denied('learner official media reservation',format('select public.reserve_media_upload(%L,%L,%L)',library,'official',gen_random_uuid()),'permission denied|Media upload reservation denied');
  update public.personal_collections set name='Renamed Deck' where id=collection;
  delete from public.personal_collection_cards where collection_id=collection and personal_card_id=own_card;
  if not exists(select 1 from public.personal_cards where id=own_card) then raise exception 'Deck membership removal removed Card'; end if;
  delete from public.personal_collections where id=collection;
  if exists(select 1 from public.personal_collection_cards where collection_id=collection) or not exists(select 1 from public.personal_cards where id=standalone) then raise exception 'Deck deletion corrupted Cards'; end if;
  insert into ownership_results values('Deck create/rename/membership/removal/delete preserve underlying Cards','PASS');
  if exists(select 1 from public.personal_review_attempts where user_id=learner)
    or exists(select 1 from public.review_attempts where user_id=learner)
    or exists(select 1 from public.user_personal_concept_state where user_id=learner)
  then raise exception 'Authoring generated learning evidence'; end if;
  insert into ownership_results values('authoring and Deck operations create no study or mastery evidence','PASS');

  perform pg_temp.expect_denied('owner cannot transfer Topic',format('update public.personal_topics set owner_id=%L where id=%L',other_owner,own_topic),'row-level security|owner|Owner');
  perform pg_temp.expect_denied('owner cannot transfer Concept',format('update public.personal_concepts set owner_id=%L where id=%L',other_owner,own_concept),'row-level security|owner|Owner');
  perform pg_temp.expect_denied('owner cannot transfer Card',format('update public.personal_cards set owner_id=%L where id=%L',other_owner,own_card),'row-level security|owner|Owner');
  perform set_config('ownership.own_topic',own_topic::text,true);
  perform set_config('ownership.own_concept',own_concept::text,true);
  perform set_config('ownership.own_card',own_card::text,true);
  perform set_config('ownership.standalone',standalone::text,true);
end $$;

-- Seed genuine historical rows in this rollback-only fixture, then test normal
-- authenticated editing. No privileged role is used for the operations under test.
reset role;
do $$
declare learner uuid := current_setting('ownership.learner')::uuid;
 library uuid := current_setting('ownership.library')::uuid; deck uuid; session uuid;
begin
 insert into public.study_decks(user_id,library_id) values(learner,library) returning id into deck;
 insert into public.study_sessions(user_id,library_id,study_deck_id,answered_count,ended_at)
 values(learner,library,deck,2,now()) returning id into session;
 insert into public.personal_review_attempts(user_id,study_session_id,study_deck_id,personal_card_id,personal_concept_id,result,sequence_position)
 values(learner,session,deck,current_setting('ownership.own_card')::uuid,current_setting('ownership.own_concept')::uuid,'easy',1),
 (learner,session,deck,current_setting('ownership.standalone')::uuid,null,'easy',2);
 insert into public.user_personal_concept_state(user_id,personal_concept_id,evidence_count,positive_evidence_count,negative_evidence_count,consecutive_success_count,consecutive_lapse_count,last_result,last_reviewed_at)
 values(learner,current_setting('ownership.own_concept')::uuid,1,1,0,1,0,'easy',now());
end $$;
create temporary table history_checkpoint as
 select jsonb_build_object(
 'attempts',(select jsonb_agg(to_jsonb(a) order by id) from public.personal_review_attempts a),
 'mastery',(select jsonb_agg(to_jsonb(a) order by user_id,personal_concept_id) from public.user_personal_concept_state a),
 'sessions',(select jsonb_agg(to_jsonb(a) order by id) from public.study_sessions a)) value;
grant select on history_checkpoint to authenticated;
set local role authenticated;
do $$
declare topic uuid := current_setting('ownership.own_topic')::uuid;
 concept uuid := current_setting('ownership.own_concept')::uuid;
 card uuid := current_setting('ownership.own_card')::uuid;
 standalone uuid := current_setting('ownership.standalone')::uuid;
 after_history jsonb;
begin
 update public.personal_cards set question='Edited after study',answer='Retained attribution',source_reference='New source' where id in(card,standalone);
 update public.personal_concepts set description='Edited explanation' where id=concept;
 update public.personal_topics set name='Renamed after study' where id=topic;
 perform pg_temp.expect_denied('studied Concept-backed Card reassignment blocked',format('update public.personal_cards set concept_id=null,personal_topic_id=%L where id=%L',topic,card),'Studied Card attribution cannot change');
 perform pg_temp.expect_denied('studied standalone Card reassignment blocked',format('update public.personal_cards set personal_topic_id=null,concept_id=%L where id=%L',concept,standalone),'Studied Card attribution cannot change');
 select jsonb_build_object(
 'attempts',(select jsonb_agg(to_jsonb(a) order by id) from public.personal_review_attempts a),
 'mastery',(select jsonb_agg(to_jsonb(a) order by user_id,personal_concept_id) from public.user_personal_concept_state a),
 'sessions',(select jsonb_agg(to_jsonb(a) order by id) from public.study_sessions a)) into after_history;
 if after_history is distinct from (select value from history_checkpoint) then raise exception 'Editing changed existing learning history'; end if;
 insert into ownership_results values('Card/Concept/Topic edits preserve existing attempts, mastery and sessions byte-for-byte','PASS');
end $$;
-- Check both established official-author roles with genuine database RPCs.
do $$
declare
  role_name text; staff uuid; library uuid := current_setting('ownership.library')::uuid;
  root_id uuid := current_setting('ownership.root')::uuid;
  topic_id uuid; concept_id uuid; question_id uuid; own_topic uuid; own_concept uuid; own_card uuid;
begin
  foreach role_name in array array['admin','editor'] loop
    staff := current_setting('ownership.'||role_name)::uuid;
    perform set_config('request.jwt.claim.sub',staff::text,true);
    perform set_config('request.jwt.claims',json_build_object('sub',staff,'role','authenticated')::text,true);
    select id into topic_id from public.create_library_node_in_library(library,root_id,'ZZ '||role_name);
    select (public.save_concept_with_prerequisites(null,'ZZ '||role_name,'Body',library,array[topic_id],array[]::uuid[],'published','[]','[]')->>'concept_id')::uuid into concept_id;
    select id into question_id from public.save_question_with_relationships_v2(null,concept_id,'short_answer','ZZ question',null,'published',null,0,'medium','General Understanding','[{"answer_text":"answer","is_primary":true}]','[]',null,null,library);
    if topic_id is null or concept_id is null or question_id is null then raise exception 'Staff creation failed'; end if;
    insert into ownership_results values(role_name||' official Topic/Concept/Question RPCs','PASS');
    if exists(select 1 from public.personal_cards where owner_id=current_setting('ownership.other')::uuid)
      or exists(select 1 from public.personal_concepts where owner_id=current_setting('ownership.other')::uuid)
    then raise exception 'Staff role leaked another owner private content'; end if;
    insert into ownership_results values(role_name||' cannot read other-owner personal content','PASS');
    -- Existing personal authority remains valid for staff. UI changes must not revoke it.
    select id into own_topic from public.create_personal_topic('ZZ staff personal',null,root_id,0);
    insert into public.personal_concepts(owner_id,topic_id,name) values(staff,own_topic,'Before') returning id into own_concept;
    insert into public.personal_cards(owner_id,concept_id,question,answer) values(staff,own_concept,'Before','answer') returning id into own_card;
    update public.personal_topics set name='After' where id=own_topic;
    update public.personal_concepts set name='After' where id=own_concept;
    update public.personal_cards set question='After' where id=own_card;
    if not exists(select 1 from public.personal_cards where id=own_card and owner_id=staff and question='After') then raise exception 'Staff personal editing failed'; end if;
    insert into ownership_results values(role_name||' existing own personal mutation authority preserved','PASS');
  end loop;
end $$;
select * from ownership_results;
select count(*) as passing_checks from ownership_results where result='PASS';
rollback;
