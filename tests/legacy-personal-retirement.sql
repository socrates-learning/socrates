-- Included only after a trusted, synthetic historical fixture and Migration 137.
begin;
grant select on fixtures,libraries to service_role;
grant select,insert on checks to service_role;
set local search_path=public,pg_catalog;
set local role authenticated;
do $$declare f record;c uuid;d uuid;k uuid;n integer;begin
 for f in select * from fixtures where role_name in ('admin','learner') loop
  perform pg_temp.sign_in(f.owner_id);
  perform pg_temp.reject(format('insert into public.personal_concepts(owner_id,topic_id,name) values(%L,%L,%L)',f.owner_id,f.topic_id,'Forbidden Concept'),'42501',f.role_name||' new Concept denied');
  perform pg_temp.reject(format('insert into public.personal_collections(owner_id,name) values(%L,%L)',f.owner_id,'Forbidden Deck'),'42501',f.role_name||' new Deck denied');
  perform pg_temp.reject(format('insert into public.personal_cards(owner_id,concept_id,question,answer) values(%L,%L,%L,%L)',f.owner_id,f.concept_id,'Forbidden','Back'),'42501',f.role_name||' new Concept-backed Card denied');
  perform pg_temp.reject(format('select * from public.create_personal_concept_overlay(%L,%L,%L,%L)',f.topic_id,'Forbidden overlay','Body',(select root_id from libraries where kind='allowed')),'42501',f.role_name||' privileged overlay creation denied');
  perform pg_temp.ok(exists(select 1 from public.personal_concepts where id=f.concept_id),f.role_name||' historical Concept readable');
  perform pg_temp.ok(exists(select 1 from public.personal_cards where id=f.legacy_card),f.role_name||' historical Card readable');
  update public.personal_concepts set description='**Edited historical explanation**',source_reference='https://example.invalid/reference' where id=f.concept_id;
  get diagnostics n=row_count;perform pg_temp.ok(n=1,f.role_name||' historical Concept editable');
  update public.personal_cards set answer='Updated historical Back' where id=f.legacy_card;
  get diagnostics n=row_count;perform pg_temp.ok(n=1,f.role_name||' historical legacy Card editable');
  update public.personal_collections set name='Renamed historical Deck' where owner_id=f.owner_id;
  get diagnostics n=row_count;perform pg_temp.ok(n=1,f.role_name||' historical Deck rename retained');
  perform public.save_personal_concept_with_overlay(f.concept_id,f.topic_id,'Historical Concept','Edited explanation','Original reference',(select root_id from libraries where kind='allowed'),null);
  perform pg_temp.ok(exists(select 1 from public.personal_concept_official_placements where personal_concept_id=f.concept_id),f.role_name||' existing Concept overlay save retained');
 end loop;
 -- Successful official authoring is checked in a nested disposable transaction.
 -- Roll back those test creations before the final preservation comparison.
 begin
  perform pg_temp.sign_in((select owner_id from fixtures where role_name='admin'));
  select id into k from public.create_library_node_in_library((select id from libraries where kind='allowed'),(select root_id from libraries where kind='allowed'),'ZZ post137 official Topic');
  c:=(public.save_concept_with_prerequisites(null,'ZZ post137 official Concept','Explanation',(select id from libraries where kind='allowed'),array[k],array[]::uuid[],'published','[]','[]')->>'concept_id')::uuid;
  perform public.save_question_with_relationships_v2(null,c,'short_answer','ZZ post137 official Question',null,'published',null,0,'medium','General Understanding','[{"answer_text":"Synthetic answer","is_primary":true}]','[]',null,null,(select id from libraries where kind='allowed'));
  if not exists(select 1 from public.questions where concept_id=c) then raise exception 'Official authoring failed';end if;
  raise exception using errcode='Z1370',message='Rollback disposable official authoring';
 exception when sqlstate 'Z1370' then
  perform pg_temp.ok(true,'Authorized Admin official Topic Concept and Question creation retained');
 end;
 select * into f from fixtures where role_name='learner';perform pg_temp.sign_in(f.owner_id);
 insert into public.personal_cards(owner_id,personal_topic_id,question,answer) values(f.owner_id,f.topic_id,'New standalone','Back') returning id into k;
 perform pg_temp.ok(exists(select 1 from public.personal_cards where id=k and concept_id is null),'Learner standalone creation retained');
 insert into public.personal_collection_cards(collection_id,owner_id,personal_card_id) select id,f.owner_id,k from public.personal_collections where owner_id=f.owner_id;
 perform pg_temp.ok(exists(select 1 from public.personal_collection_cards where personal_card_id=k),'Historical Deck membership add retained');
 delete from public.personal_collection_cards where personal_card_id=k;
 perform pg_temp.ok(not exists(select 1 from public.personal_collection_cards where personal_card_id=k),'Historical Deck membership remove retained');
 perform pg_temp.reject(format('insert into public.personal_cards(owner_id,personal_topic_id,question,answer) values(%L,%L,%L,%L)',(select owner_id from fixtures where role_name='other'),(select topic_id from fixtures where role_name='other'),'Foreign owner','Back'),'42501','Standalone cross-owner creation denied');
 perform pg_temp.reject(format('insert into public.personal_cards(owner_id,library_node_id,library_id,question,answer) values(%L,%L,%L,%L,%L)',f.owner_id,(select root_id from libraries where kind='foreign'),(select id from libraries where kind='foreign'),'Foreign Library','Back'),'42501','Standalone cross-Library creation denied');
 perform pg_temp.reject(format('select * from public.save_personal_concept_with_overlay(%L,%L,%L,%L,%L,%L)',f.concept_id,f.topic_id,'Historical Concept','Body','Source',(select root_id from libraries where kind='foreign')),'P0001','Historical overlay cross-Library denied');
 update public.personal_concepts set description='Forbidden foreign edit' where id=(select concept_id from fixtures where role_name='other');get diagnostics n=row_count;perform pg_temp.ok(n=0,'Cross-owner Concept update denied');
 update public.personal_cards set answer='Forbidden foreign edit' where id=(select legacy_card from fixtures where role_name='other');get diagnostics n=row_count;perform pg_temp.ok(n=0,'Cross-owner Card update denied');
 update public.personal_collections set name='Forbidden foreign rename' where owner_id=(select owner_id from fixtures where role_name='other');get diagnostics n=row_count;perform pg_temp.ok(n=0,'Cross-owner Deck update denied');
 perform pg_temp.ok(not exists(select 1 from public.personal_concepts where owner_id<>f.owner_id),'Foreign historical Concepts remain private');
 perform pg_temp.reject(format('select * from public.save_personal_concept_with_overlay(null,%L,%L,%L,%L,%L)',f.topic_id,'Not historical','Body','Source',(select root_id from libraries where kind='allowed')),'P0001','Historical overlay saver cannot create a new Concept');
 -- Legacy Editor permissions deliberately remain unchanged in this release.
 select * into f from fixtures where role_name='editor';perform pg_temp.sign_in(f.owner_id);
 insert into public.personal_concepts(owner_id,topic_id,name) values(f.owner_id,f.topic_id,'Editor compatibility') returning id into c;
 insert into public.personal_collections(owner_id,name) values(f.owner_id,'Editor compatibility') returning id into d;
 insert into public.personal_cards(owner_id,concept_id,question,answer) values(f.owner_id,c,'Editor compatibility','Back');
 perform public.create_personal_concept_overlay(f.topic_id,'Editor overlay','Body',(select root_id from libraries where kind='allowed'));
 perform pg_temp.ok(exists(select 1 from public.personal_concepts where id=c) and exists(select 1 from public.personal_collections where id=d),'Legacy Editor creation exception unchanged');
 perform pg_temp.reject(format('insert into public.personal_concepts(owner_id,topic_id,name) values(%L,%L,%L)',(select owner_id from fixtures where role_name='learner'),(select topic_id from fixtures where role_name='learner'),'Editor foreign owner'),'42501','Editor exception cannot bypass ownership');
end$$;
reset role;
-- The account-deletion write/read fence still intersects with these policies.
update public.account_deletion_state set state='pending',receipt_hash=repeat('a',64),requested_at=now() where user_id=(select owner_id from fixtures where role_name='inactive');
set local role authenticated;
select pg_temp.sign_in((select owner_id from fixtures where role_name='inactive'));
select pg_temp.ok(not exists(select 1 from public.personal_concepts),'Inactive account historical reads denied');
select pg_temp.reject(format('insert into public.personal_cards(owner_id,personal_topic_id,question,answer) values(%L,%L,%L,%L)',owner_id,topic_id,'Inactive','Back'),'42501','Inactive account standalone creation denied') from fixtures where role_name='inactive';
reset role;
update public.account_deletion_state set state='pending',receipt_hash=repeat('b',64),requested_at=now() where user_id=(select owner_id from fixtures where role_name='editor');
set local role authenticated;
select pg_temp.sign_in((select owner_id from fixtures where role_name='editor'));
select pg_temp.reject(format('insert into public.personal_collections(owner_id,name) values(%L,%L)',owner_id,'Inactive Editor'),'42501','Inactive Editor cannot use the legacy creation exception') from fixtures where role_name='editor';
select pg_temp.reject(format('select * from public.create_personal_concept_overlay(%L,%L,%L,%L)',topic_id,'Inactive Editor','Body',(select root_id from libraries where kind='allowed')),'P0001','Inactive Editor privileged overlay denied') from fixtures where role_name='editor';
select pg_temp.sign_in((select owner_id from fixtures where role_name='learner'));
set local role service_role;
select pg_temp.reject(format('select * from public.create_personal_concept_overlay(%L,%L,%L,%L)',topic_id,'Privileged learner','Body',(select root_id from libraries where kind='allowed')),'42501','Privileged overlay cannot bypass retired learner creation') from fixtures where role_name='learner';
set local role anon;
select pg_temp.sign_in(null);
select pg_temp.reject('select * from public.personal_concepts','42501','Anonymous personal reads denied');
select pg_temp.reject('select * from public.personal_collections','42501','Anonymous Deck reads denied');
select pg_temp.reject('select * from public.create_personal_concept_overlay(null,''Anonymous'',null,null)','42501','Anonymous privileged overlay creation denied');
reset role;
-- None of the tested authorized edits may touch learning evidence or official data.
select pg_temp.ok(pg_temp.learning_snapshot()=(select learning from legacy_before),'Learning history, mastery, official content, selections and preferences unchanged');
\o
select 'PASS: '||label from checks order by label;
select 'Behavior checks: '||count(*) from checks;
rollback;
