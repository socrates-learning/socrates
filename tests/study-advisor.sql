\set ON_ERROR_STOP on
begin;
do $$ begin if current_database() not like 'advisor124_%' then raise exception 'Disposable advisor124 database required'; end if; end $$;
create function pg_temp.id(n int) returns uuid language sql immutable as $$ select ('12300000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function pg_temp.ok(v boolean,label text) returns text language plpgsql as $$ begin if v is distinct from true then raise exception 'FAIL: %',label; end if; return 'PASS: '||label; end $$;
create function pg_temp.reject(q text,code text) returns text language plpgsql as $$ begin execute q; raise exception 'Unexpected success: %',q; exception when others then if sqlstate=code then return 'PASS: rejected '||code; else raise; end if; end $$;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change)
select pg_temp.id(n),'00000000-0000-0000-0000-000000000000','authenticated','authenticated','goals123-'||n||'@example.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','' from generate_series(1,4) n;
insert into public.user_roles(user_id,role) values(pg_temp.id(1),'admin'),(pg_temp.id(2),'learner'),(pg_temp.id(3),'learner'),(pg_temp.id(4),'editor');
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
insert into public.libraries(id,name,slug,status) values(pg_temp.id(10),'Goal proof A','goals123-a','active'),(pg_temp.id(11),'Goal proof B','goals123-b','active');
insert into public.user_libraries(user_id,library_id,is_primary,assigned_by) values(pg_temp.id(2),pg_temp.id(10),true,pg_temp.id(1)),(pg_temp.id(3),pg_temp.id(10),true,pg_temp.id(1)),(pg_temp.id(2),pg_temp.id(11),false,pg_temp.id(1));
insert into public.library_nodes(id,library_id,parent_id,name,node_type,sort_order) values
(pg_temp.id(20),pg_temp.id(10),null,'Subject','section',0),(pg_temp.id(21),pg_temp.id(10),pg_temp.id(20),'A','topic',0),(pg_temp.id(22),pg_temp.id(10),pg_temp.id(21),'Leaf','topic',0),(pg_temp.id(24),pg_temp.id(10),pg_temp.id(20),'B','topic',1),(pg_temp.id(25),pg_temp.id(10),pg_temp.id(20),'Empty','topic',2),(pg_temp.id(30),pg_temp.id(11),null,'Other Library','section',0);
insert into public.concepts(id,name,body_markdown,status,created_by) select pg_temp.id(n),'Concept '||n,'Proof','published',pg_temp.id(1) from generate_series(50,52) n;
insert into public.concept_placements(concept_id,library_node_id,sort_order) values(pg_temp.id(50),pg_temp.id(22),0),(pg_temp.id(50),pg_temp.id(24),0),(pg_temp.id(51),pg_temp.id(22),1),(pg_temp.id(52),pg_temp.id(24),1);
insert into public.questions(id,concept_id,question_type,prompt,status,difficulty,testing_angle,created_by)
select pg_temp.id(n),pg_temp.id(case when n=63 then 50 else n-10 end),'short_answer','Goal question '||n,'draft','medium','General Understanding',pg_temp.id(1) from generate_series(60,63) n;
insert into public.question_accepted_answers(question_id,answer_text,sort_order) select pg_temp.id(n),'Proof answer',0 from generate_series(60,63) n;
update public.questions set status='published' where id between pg_temp.id(60) and pg_temp.id(63);
insert into public.questions(id,concept_id,question_type,prompt,status,difficulty,testing_angle,created_by) values(pg_temp.id(64),pg_temp.id(50),'short_answer','Draft excluded','draft','medium','General Understanding',pg_temp.id(1));
insert into public.personal_topics(id,owner_id,parent_id,name,sort_order) values(pg_temp.id(40),pg_temp.id(2),null,'My branch',0),(pg_temp.id(41),pg_temp.id(2),pg_temp.id(40),'My leaf',0),(pg_temp.id(42),pg_temp.id(3),null,'Other owner',0),(pg_temp.id(43),pg_temp.id(2),null,'Other Library personal',0);
select set_config('request.jwt.claim.sub',pg_temp.id(3)::text,true);
insert into public.personal_topic_official_placements(personal_topic_id,owner_id,library_node_id) values(pg_temp.id(42),pg_temp.id(3),pg_temp.id(21));
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
insert into public.personal_topic_official_placements(personal_topic_id,owner_id,library_node_id) values(pg_temp.id(40),pg_temp.id(2),pg_temp.id(21)),(pg_temp.id(43),pg_temp.id(2),pg_temp.id(30));
insert into public.personal_concepts(id,owner_id,topic_id,name) values(pg_temp.id(70),pg_temp.id(2),pg_temp.id(41),'Personal Concept');
insert into public.personal_cards(id,owner_id,concept_id,question,answer) values(pg_temp.id(80),pg_temp.id(2),pg_temp.id(70),'Concept Card','Back');
insert into public.personal_cards(id,owner_id,personal_topic_id,question,answer) values(pg_temp.id(81),pg_temp.id(2),pg_temp.id(41),'Standalone','Back'),(pg_temp.id(83),pg_temp.id(2),pg_temp.id(43),'Other Library','Back');
insert into public.personal_cards(id,owner_id,library_id,library_node_id,question,answer) values(pg_temp.id(82),pg_temp.id(2),pg_temp.id(10),pg_temp.id(22),'Official Topic standalone','Back');
insert into public.study_decks(id,user_id,library_id,name,is_active) values(pg_temp.id(90),pg_temp.id(2),pg_temp.id(10),'Goal proof',true);
-- Deliberately no selected Topic: goals must not change eligibility or selections.
insert into public.study_sessions(id,user_id,library_id,study_deck_id,started_at,ended_at,answered_count)
select pg_temp.id(100+n),pg_temp.id(2),pg_temp.id(10),pg_temp.id(90),now()-make_interval(days=>n*3),now()-make_interval(days=>n*3)+interval '6 minutes',6 from generate_series(1,3) n;
insert into public.review_attempts(id,user_id,question_id,concept_id,result,study_session_id,sequence_position,testing_angle,created_at)
select pg_temp.id(200+n*10+q),pg_temp.id(2),pg_temp.id(60+q),pg_temp.id(50+q),'easy',pg_temp.id(100+n),q+1,'General Understanding',now()-make_interval(days=>n*3)+interval '1 minute' from generate_series(1,3) n cross join generate_series(0,2) q;
insert into public.personal_review_attempts(user_id,study_session_id,study_deck_id,personal_card_id,personal_concept_id,result,sequence_position,created_at)
select pg_temp.id(2),pg_temp.id(100+n),pg_temp.id(90),pg_temp.id(80+c),case when c=0 then pg_temp.id(70) else null end,'easy',c+4,now()-make_interval(days=>n*3)+interval '2 minutes' from generate_series(1,3) n cross join generate_series(0,2) c;
insert into public.user_concept_mastery(user_id,concept_id,mastery_estimate,retrievability,stability,uncertainty,evidence_count,last_exposure_at,last_result)
select pg_temp.id(2),pg_temp.id(50+n),case when n=2 then .75 else .8 end,.8,.5,.2,3,now(),'easy' from generate_series(0,2) n;
set constraints all immediate;
-- The initial fixtures intentionally match the preserved Goal Dates proof.
-- Additional history is synthetic and the complete proof rolls back.
insert into public.user_study_node_selections(user_id,deck_id,library_id,node_id) values(pg_temp.id(2),pg_temp.id(90),pg_temp.id(10),pg_temp.id(20));
select public.set_study_deck_topic_subtree_preference(pg_temp.id(90),pg_temp.id(10),'official:topic:'||pg_temp.id(20),80,public.m117_preference_state(pg_temp.id(90))->>'revision') is not null;
insert into public.official_topic_placements(library_id,parent_node_id,topic_id,sort_order) values(pg_temp.id(10),pg_temp.id(24),pg_temp.id(22),0);
insert into public.questions(id,concept_id,question_type,prompt,status,difficulty,testing_angle,created_by)
select pg_temp.id(n),pg_temp.id(51),'short_answer','Unseen '||n,'draft','medium','General Understanding',pg_temp.id(1) from generate_series(400,409) n;
insert into public.question_accepted_answers(question_id,answer_text,sort_order) select pg_temp.id(n),'Answer',0 from generate_series(400,409) n;
update public.questions set status='published' where id between pg_temp.id(400) and pg_temp.id(409);
insert into public.study_sessions(id,user_id,library_id,study_deck_id,started_at,ended_at,answered_count)
select pg_temp.id(500+n),pg_temp.id(2),pg_temp.id(10),pg_temp.id(90),now()-make_interval(days=>n),now()-make_interval(days=>n)+interval '3 minutes',3 from generate_series(1,5) n;
insert into public.review_attempts(user_id,question_id,concept_id,result,study_session_id,sequence_position,testing_angle,created_at)
select pg_temp.id(2),pg_temp.id(60+q),pg_temp.id(50+q),'forgot',pg_temp.id(500+n),q+1,'General Understanding',now()-make_interval(days=>n)+interval '1 minute' from generate_series(1,5) n cross join generate_series(0,1) q;
insert into public.personal_review_attempts(user_id,study_session_id,study_deck_id,personal_card_id,personal_concept_id,result,sequence_position,created_at)
select pg_temp.id(2),pg_temp.id(500+n),pg_temp.id(90),pg_temp.id(82),null,'too_hard',3,now()-make_interval(days=>n)+interval '2 minutes' from generate_series(1,5) n;
-- First-day retries are coverage activity, never retention observations.
insert into public.review_attempts(user_id,question_id,concept_id,result,study_session_id,sequence_position,testing_angle,created_at)
select pg_temp.id(2),pg_temp.id(400),pg_temp.id(51),'didnt_know',pg_temp.id(501),n,'General Understanding',now()-interval '1 hour'+make_interval(secs=>n) from generate_series(4,6) n;
set constraints all immediate;
create temp table advisor_before as select md5(string_agg(row::text,'' order by row::text)) h from (
 select to_jsonb(r) row from public.review_attempts r union all select to_jsonb(r) from public.personal_review_attempts r
 union all select to_jsonb(r) from public.user_concept_mastery r union all select to_jsonb(r) from public.study_goals r
 union all select to_jsonb(r) from public.user_study_node_selections r union all select to_jsonb(r) from public.study_deck_node_preferences r
 union all select to_jsonb(r) from public.study_sessions r union all select to_jsonb(r) from public.official_topic_placements r) x;
grant select on advisor_before to authenticated;
set local role authenticated;
select public.get_study_advisor(pg_temp.id(10)) as evidence \gset
select pg_temp.ok(:'evidence'::jsonb->>'actor_id'=pg_temp.id(2)::text,'actor identity bound to authenticated user');
select pg_temp.ok(:'evidence'::jsonb->>'library_id'=pg_temp.id(10)::text,'Library identity bound to authorized request');
select pg_temp.ok((select count(*)=1 from jsonb_array_elements(:'evidence'::jsonb->'topics') t where t->>'key'='official:'||pg_temp.id(22)),'shared Topic appears once');
select pg_temp.ok((select (t->>'total_items')::int=14 from jsonb_array_elements(:'evidence'::jsonb->'topics') t where t->>'key'='official:'||pg_temp.id(22)),'direct Topic eligibility counts official and standalone Cards once');
select pg_temp.ok((select (t->>'review_responses')::int=21 from jsonb_array_elements(:'evidence'::jsonb->'topics') t where t->>'key'='official:'||pg_temp.id(22)),'same-day initial retries excluded from repeat reviews');
select pg_temp.ok((select (t->>'review_lapses')::int=15 and (t->>'repeated_lapse_items')::int=3 from jsonb_array_elements(:'evidence'::jsonb->'topics') t where t->>'key'='official:'||pg_temp.id(22)),'repeated official and standalone difficulty retained');
select pg_temp.ok((select (t->>'covered_items')::int=4 and (t->>'new_items')::int=4 from jsonb_array_elements(:'evidence'::jsonb->'topics') t where t->>'key'='official:'||pg_temp.id(22)),'unique coverage counts repeated item only once');
select pg_temp.ok((select (t->>'balance')::int=80 and (t->>'selected')::boolean from jsonb_array_elements(:'evidence'::jsonb->'topics') t where t->>'key'='official:'||pg_temp.id(22)),'released inherited preference and shared selection projection consumed');
select pg_temp.ok((select t->'related_keys' ? ('official:'||pg_temp.id(24)) and t->'related_keys' ? ('official:'||pg_temp.id(20)) from jsonb_array_elements(:'evidence'::jsonb->'topics') t where t->>'key'='official:'||pg_temp.id(22)),'overlapping material and ancestor conflict keys prevent contradictory advice');
select pg_temp.ok((select (t->>'total_items')::int=2 from jsonb_array_elements(:'evidence'::jsonb->'topics') t where t->>'key'='personal:'||pg_temp.id(41)),'owner Concept-backed and standalone Cards counted');
select pg_temp.ok(not exists(select 1 from jsonb_array_elements(:'evidence'::jsonb->'topics') t where t->>'key' in('personal:'||pg_temp.id(42),'personal:'||pg_temp.id(43),'official:'||pg_temp.id(30))),'other owner and other Library branches omitted');
select set_config('request.jwt.claim.sub',pg_temp.id(3)::text,true);
select pg_temp.ok(not exists(select 1 from jsonb_array_elements(public.get_study_advisor(pg_temp.id(10))->'topics') t where (t->>'responses')::int>0),'another learner cannot read owner history');
select pg_temp.reject(format('select public.get_study_advisor(%L)',pg_temp.id(11)),'42501');
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
select pg_temp.ok(not exists(select 1 from jsonb_array_elements(public.get_study_advisor(pg_temp.id(10))->'topics') t where (t->>'responses')::int>0),'Admin does not receive another learner evidence');
select set_config('request.jwt.claim.sub',pg_temp.id(4)::text,true);
select pg_temp.ok(not exists(select 1 from jsonb_array_elements(public.get_study_advisor(pg_temp.id(10))->'topics') t where (t->>'responses')::int>0),'Editor does not receive another learner evidence');
reset role;
select pg_temp.ok((select h from advisor_before)=(select md5(string_agg(row::text,'' order by row::text)) from (
 select to_jsonb(r) row from public.review_attempts r union all select to_jsonb(r) from public.personal_review_attempts r
 union all select to_jsonb(r) from public.user_concept_mastery r union all select to_jsonb(r) from public.study_goals r
 union all select to_jsonb(r) from public.user_study_node_selections r union all select to_jsonb(r) from public.study_deck_node_preferences r
 union all select to_jsonb(r) from public.study_sessions r union all select to_jsonb(r) from public.official_topic_placements r) x),'Advisor reads preserve goals history mastery selections preferences and shared structure');
set local role anon;
select pg_temp.reject(format('select public.get_study_advisor(%L)',pg_temp.id(10)),'42501');
reset role;
rollback;
