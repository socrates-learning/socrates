-- Synthetic local-only fixture. Never install into a hosted/application DB.
-- Provenance matrix identities: 21/24 are independent A/B roots, 22/23/25
-- their descendants; 26 is a third independent branch. Concept 50 spans A/B,
-- Concept 51 and standalone Card 81 attach only to 22. The SQL proof reuses
-- these identities in rollback scopes to compare independent/subordinate
-- histories without changing the canonical content or inventing extra votes.
\set ON_ERROR_STOP on
begin;
do $$ begin
 if current_database() !~ '^shared122($|_)' or exists(select 1 from auth.users) or exists(select 1 from public.libraries) then
  raise exception 'Empty isolated shared122 database required';
 end if;
end $$;
with defaults(value,position) as (values
  ('General Understanding',0),('Recognition / Definition',1),
  ('Mechanism / Pathophysiology',2),('Clinical Manifestations',3),
  ('Assessment / Interpretation',4),('Clinical Application',5),
  ('Intervention / Management',6),('Complications / Outcomes',7),
  ('Differentiation / Comparison',8)
), observed(value,active,position,priority) as (
  select value,true,position,0 from defaults
  union all select testing_angle,true,null,1 from public.questions
  union all select testing_angle,true,null,1 from public.question_additional_testing_angles
  union all select testing_angle,false,null,2 from public.question_versions
  union all select a->>'testing_angle',false,null,2 from public.question_versions v
    cross join lateral jsonb_array_elements(coalesce(v.additional_testing_angles_snapshot,'[]'::jsonb)) a
  union all select testing_angle,false,null,2 from public.review_attempts
  union all select testing_angle,false,null,2 from public.user_concept_testing_angle_state
), grouped as (
  select lower(btrim(value)) normalized,
    (array_agg(btrim(value) order by priority,position,value collate "C"))[1] storage_key,
    bool_or(active) active,min(position) position
  from observed where nullif(btrim(value),'') is not null group by lower(btrim(value))
)
insert into public.testing_angle_vocabulary(storage_key,display_name,status,reserved_names,sort_order)
select storage_key,storage_key,case when active then 'active' else 'retired' end,
  array[normalized],(row_number() over(order by position nulls last,normalized collate "C")-1)::integer
from grouped;
create function pg_temp.id(n integer) returns uuid language sql immutable as $$
 select ('12200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.id(n),'authenticated','authenticated','zz-shared122-'||n||'@example.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now() from generate_series(1,4) n;
insert into public.user_roles(user_id,role) values(pg_temp.id(1),'admin'),(pg_temp.id(2),'learner'),(pg_temp.id(3),'learner'),(pg_temp.id(4),'editor');
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
insert into public.libraries(id,name,slug,status) values(pg_temp.id(10),'ZZ SHARED122 Library A','zz-shared122-a','active'),(pg_temp.id(11),'ZZ SHARED122 Library B','zz-shared122-b','active');
insert into public.user_libraries(user_id,library_id,is_primary,assigned_by)
select pg_temp.id(u),pg_temp.id(l),l=10,pg_temp.id(1) from generate_series(1,4) u cross join generate_series(10,11) l where u<>3 or l=10;
insert into public.library_nodes(id,library_id,parent_id,name,node_type,sort_order) values
 (pg_temp.id(20),pg_temp.id(10),null,'ZZ SHARED122 Root','section',0),
 (pg_temp.id(21),pg_temp.id(10),pg_temp.id(20),'Branch A','topic',0),
 (pg_temp.id(22),pg_temp.id(10),pg_temp.id(21),'Leaf A1','topic',0),
 (pg_temp.id(23),pg_temp.id(10),pg_temp.id(21),'Leaf A2','topic',1),
 (pg_temp.id(24),pg_temp.id(10),pg_temp.id(20),'Branch B','topic',1),
 (pg_temp.id(25),pg_temp.id(10),pg_temp.id(24),'Leaf B','topic',0),
 (pg_temp.id(26),pg_temp.id(10),pg_temp.id(20),'Unrelated branch','topic',2),
 (pg_temp.id(30),pg_temp.id(11),null,'ZZ SHARED122 Other Library','section',0);
insert into public.personal_topics(id,owner_id,parent_id,name,sort_order) values
 (pg_temp.id(40),pg_temp.id(2),null,'My branch',0),
 (pg_temp.id(41),pg_temp.id(2),pg_temp.id(40),'My intermediate',0),
 (pg_temp.id(42),pg_temp.id(2),pg_temp.id(41),'My leaf',0),
 (pg_temp.id(43),pg_temp.id(2),pg_temp.id(40),'My sibling',1),
 (pg_temp.id(44),pg_temp.id(3),null,'Another learner branch',0),
 (pg_temp.id(24),pg_temp.id(2),null,'Same UUID personal Topic',0),
 (pg_temp.id(45),pg_temp.id(2),null,'My other Library branch',0);
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
insert into public.personal_topic_official_placements(personal_topic_id,owner_id,library_node_id) values
 (pg_temp.id(40),pg_temp.id(2),pg_temp.id(21)),
 (pg_temp.id(24),pg_temp.id(2),pg_temp.id(24)),(pg_temp.id(45),pg_temp.id(2),pg_temp.id(30));
select set_config('request.jwt.claim.sub',pg_temp.id(3)::text,true);
insert into public.personal_topic_official_placements(personal_topic_id,owner_id,library_node_id) values(pg_temp.id(44),pg_temp.id(3),pg_temp.id(21));
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
insert into public.concepts(id,name,body_markdown,status,created_by) values
 (pg_temp.id(50),'ZZ SHARED122 Multi-placement','Synthetic only.','published',pg_temp.id(1)),
 (pg_temp.id(51),'ZZ SHARED122 Single placement','Synthetic only.','published',pg_temp.id(1));
insert into public.concept_placements(concept_id,library_node_id,sort_order) values
 (pg_temp.id(50),pg_temp.id(22),0),(pg_temp.id(50),pg_temp.id(23),0),(pg_temp.id(50),pg_temp.id(25),0),(pg_temp.id(51),pg_temp.id(22),1);
select public.append_concept_version_snapshot(id,pg_temp.id(1)) from public.concepts;
insert into public.questions(id,concept_id,question_type,prompt,status,difficulty,testing_angle,created_by) values
 (pg_temp.id(60),pg_temp.id(50),'short_answer','ZZ SHARED122 Multiple branches?','draft','medium','General Understanding',pg_temp.id(1)),
 (pg_temp.id(61),pg_temp.id(51),'short_answer','ZZ SHARED122 Single branch?','draft','medium','General Understanding',pg_temp.id(1));
insert into public.question_accepted_answers(question_id,answer_text,sort_order) values
 (pg_temp.id(60),'ZZ Synthetic multiple.',0),(pg_temp.id(61),'ZZ Synthetic single.',0);
update public.questions set status='published';
select public.append_question_version_snapshot(id,pg_temp.id(1)) from public.questions;
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
insert into public.personal_concepts(id,owner_id,topic_id,name) values(pg_temp.id(70),pg_temp.id(2),pg_temp.id(42),'ZZ SHARED122 Legacy Concept');
insert into public.personal_cards(id,owner_id,concept_id,question,answer) values(pg_temp.id(80),pg_temp.id(2),pg_temp.id(70),'ZZ SHARED122 Legacy Card','Synthetic');
insert into public.personal_cards(id,owner_id,library_id,library_node_id,personal_topic_id,question,answer) values
 (pg_temp.id(81),pg_temp.id(2),pg_temp.id(10),pg_temp.id(22),null,'ZZ SHARED122 Standalone official','Synthetic'),
 (pg_temp.id(82),pg_temp.id(2),null,null,pg_temp.id(42),'ZZ SHARED122 Standalone personal','Synthetic');
insert into public.personal_collections(id,owner_id,name) values(pg_temp.id(85),pg_temp.id(2),'ZZ SHARED122 Independent collection');
insert into public.personal_collection_cards(collection_id,owner_id,personal_card_id) values
 (pg_temp.id(85),pg_temp.id(2),pg_temp.id(80)),(pg_temp.id(85),pg_temp.id(2),pg_temp.id(81)),(pg_temp.id(85),pg_temp.id(2),pg_temp.id(82));
insert into public.study_decks(id,user_id,library_id,name,is_active) values
 (pg_temp.id(90),pg_temp.id(2),pg_temp.id(10),'ZZ SHARED122 Deck',true),
 (pg_temp.id(91),pg_temp.id(3),pg_temp.id(10),'ZZ SHARED122 Other owner',true),
 (pg_temp.id(92),pg_temp.id(2),pg_temp.id(11),'ZZ SHARED122 Other Library deck',true);
insert into public.user_study_node_selections(deck_id,user_id,library_id,node_id) values
 (pg_temp.id(90),pg_temp.id(2),pg_temp.id(10),pg_temp.id(20)),
 (pg_temp.id(92),pg_temp.id(2),pg_temp.id(11),pg_temp.id(30));
insert into public.study_deck_personal_topic_selections(deck_id,user_id,library_id,personal_topic_id) values
 (pg_temp.id(90),pg_temp.id(2),pg_temp.id(10),pg_temp.id(40));
-- Released Migration 073 source policy; no new scoring values.
insert into public.study_priority_source_policy (
  policy_name,
  official_source_weight,
  personal_source_weight,
  max_source_absence,
  max_official_run,
  max_personal_run
)
values ('normal_default', 2, 1, 4, 3, 2);
commit;
