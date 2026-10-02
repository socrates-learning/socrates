-- Disposable only: Auth users must first be created through the isolated real Auth service.
-- This file contains no credentials. Never run against Production.
begin;
insert into public.user_roles(user_id,role) values
 ('11200000-0000-4000-8000-000000000001','admin'),
 ('11200000-0000-4000-8000-000000000002','editor'),
 ('11200000-0000-4000-8000-000000000003','learner'),
 ('11200000-0000-4000-8000-000000000004','learner');
insert into public.libraries(id,name,slug,status) values
 ('11200000-0000-4000-8000-000000000010','Media disposable A','media112-a','active'),
 ('11200000-0000-4000-8000-000000000011','Media disposable B','media112-b','active');
insert into public.library_nodes(id,library_id,name,node_type) values
 ('11200000-0000-4000-8000-000000000020','11200000-0000-4000-8000-000000000010','Media root A','section'),
 ('11200000-0000-4000-8000-000000000021','11200000-0000-4000-8000-000000000011','Media root B','section');
insert into public.user_libraries(user_id,library_id) values
 ('11200000-0000-4000-8000-000000000003','11200000-0000-4000-8000-000000000010'),
 ('11200000-0000-4000-8000-000000000004','11200000-0000-4000-8000-000000000010');
insert into public.concepts(id,name,status,body_markdown) values
 ('11200000-0000-4000-8000-000000000030','Media Concept A','published','Synthetic'),
 ('11200000-0000-4000-8000-000000000031','Media Concept B','published','Synthetic');
insert into public.concept_placements(concept_id,library_node_id) values
 ('11200000-0000-4000-8000-000000000030','11200000-0000-4000-8000-000000000020'),
 ('11200000-0000-4000-8000-000000000031','11200000-0000-4000-8000-000000000021');
insert into public.questions(id,concept_id,question_type,prompt,status) values
 ('11200000-0000-4000-8000-000000000040','11200000-0000-4000-8000-000000000030','short_answer','Synthetic media question','draft');
insert into public.question_accepted_answers(question_id,answer_text,sort_order) values ('11200000-0000-4000-8000-000000000040','Synthetic answer',0);
update public.questions set status='published' where id='11200000-0000-4000-8000-000000000040';
commit;
