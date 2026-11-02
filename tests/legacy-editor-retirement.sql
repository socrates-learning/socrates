-- LOCAL ONLY. Requires this suite's disposable fixture; all behavior rolls back.
begin;
set local search_path=public,pg_catalog;
do $$begin
 if current_database() not like 'editor140_run_%' or exists(
  select 1 from auth.users where email !~ '@(example|preview)\.invalid$'
 ) then raise exception 'Synthetic Editor-retirement database required'; end if;
end$$;

create temp table official140(concept uuid, question uuid, source uuid, article uuid);
grant select on official140 to authenticated,anon,service_role;
grant insert,update on official140 to authenticated;
select pg_temp.sign_in((select owner_id from fixtures where role_name='admin'));
set local role authenticated;
do $$declare c uuid;q uuid;s uuid;a uuid;begin
 c := (public.save_concept_with_prerequisites(null,'ZZ 140 private draft','**Synthetic explanation**',
  (select id from libraries where kind='allowed'),array[(select root_id from libraries where kind='allowed')],
  array[]::uuid[],'draft','[{"client_id":"synthetic-ref","title":"Disposable source","url":"https://example.invalid/source"}]','[]')->>'concept_id')::uuid;
 perform public.save_question_with_relationships_v2(null,c,'short_answer','ZZ 140 private Question',null,'draft',
  null,0,'medium','General Understanding','[{"answer_text":"Synthetic answer","is_primary":true}]',
  '[]',null,null,(select id from libraries where kind='allowed'));
 select id into q from public.questions where concept_id=c;
 select source_id into s from public.content_source_notes where concept_id=c;
 a:=(public.save_article_draft(null,'ZZ 140 Article',null,'**Synthetic Article**',
  (select id from libraries where kind='allowed'),array[(select root_id from libraries where kind='allowed')],
  (select root_id from libraries where kind='allowed'),array[]::uuid[],false)->>'article_id')::uuid;
 insert into official140(concept,question,source,article) values(c,q,s,a);
 perform pg_temp.ok(s is not null and a is not null,'Administrator source creation, attribution and Article drafting preserved');
 perform public.save_article_draft(null,'ZZ 140 Published Article',null,'Published synthetic Article',
  (select id from libraries where kind='allowed'),array[(select root_id from libraries where kind='allowed')],
  (select root_id from libraries where kind='allowed'),array[]::uuid[],true);
 perform pg_temp.ok(exists(select 1 from public.articles where title='ZZ 140 Published Article' and status='published'),'Active Administrator Article publishing remains functional');
 perform pg_temp.ok(c is not null and q is not null,'Active Administrator creates official Concepts and Questions');
 perform public.create_catalog_tag('ZZ 140 disposable tag');
 perform public.create_testing_angle('ZZ 140 disposable testing angle');
 perform pg_temp.ok(public.can_manage_testing_angle_vocabulary(),'Active Administrator manages Tags and Testing Angles');
 perform public.reserve_media_upload((select id from libraries where kind='allowed'),'official',gen_random_uuid());
 perform pg_temp.ok(true,'Active Administrator reserves official media under existing Library authorization');
end$$;
reset role;

-- Run the real service-side author checks with disposable actor identities. The
-- public media wrappers and private helper grants are also checked by the verifier.
select public.m114_author((select owner_id from fixtures where role_name='admin'),(select id from libraries where kind='allowed'));
select public.m115_author((select owner_id from fixtures where role_name='admin'),(select id from libraries where kind='allowed'));
select pg_temp.ok(true,'Administrator Concept and Question image authorization retained');

set local role authenticated;
do $$declare f record;t text;begin
 for f in select * from fixtures where role_name in ('learner','editor') loop
  perform pg_temp.sign_in(f.owner_id);
  perform pg_temp.ok(not exists(select 1 from public.concepts where id=(select concept from official140)),f.role_name||' cannot read draft Concepts');
  perform pg_temp.ok(not exists(select 1 from public.questions where id=(select question from official140)),f.role_name||' cannot read draft Questions');
  perform pg_temp.ok(not exists(select 1 from public.articles where id=(select article from official140)),f.role_name||' cannot read draft Articles');
  perform pg_temp.reject(format('select public.sync_concept_references(%L,''[]'')',(select concept from official140)),'42501',f.role_name||' direct private source writes denied');
  perform pg_temp.reject(format('select public.attach_question_source(%L,%L,null)',(select question from official140),(select source from official140)),'42501',f.role_name||' direct private source attribution writes denied');
  perform pg_temp.reject(format('select public.save_article_draft(%L,''Denied'',null,''Body'',%L,array[%L::uuid],%L,array[]::uuid[],true)',(select article from official140),(select id from libraries where kind='allowed'),(select root_id from libraries where kind='allowed'),(select root_id from libraries where kind='allowed')),'P0001',f.role_name||' Article publishing denied');
  perform pg_temp.ok(exists(select 1 from public.concepts where name='ZZ protected official Concept'),f.role_name||' retains published content access');
  perform pg_temp.reject(format('select public.save_concept_with_prerequisites(null,''Denied'',null,%L,array[%L::uuid],array[]::uuid[],''draft'',''[]'',''[]'')',
   (select id from libraries where kind='allowed'),(select root_id from libraries where kind='allowed')),'P0001',f.role_name||' official Concept creation denied');
  perform pg_temp.reject(format('select public.save_question_with_relationships_v2(null,%L,''short_answer'',''Denied'',null,''draft'',null,0,''medium'',''General Understanding'',''[]'',''[]'',null,null,%L)',
   (select concept from official140),(select id from libraries where kind='allowed')),'42501',f.role_name||' official Question creation denied');
  perform pg_temp.reject('select public.create_catalog_tag(''Denied tag'')','P0001',f.role_name||' Tag creation denied');
  perform pg_temp.reject('select public.create_testing_angle(''Denied angle'')','42501',f.role_name||' Testing Angle creation denied');
  perform pg_temp.reject(format('select public.create_library_group(%L,''Denied group'')',null),'P0001',f.role_name||' Library organization denied');
  perform pg_temp.reject(format('select public.reserve_media_upload(%L,''official'',gen_random_uuid())',(select id from libraries where kind='allowed')),'42501',f.role_name||' official media reservation denied');
  foreach t in array array['concepts','questions','sources','articles','learn_sections','concept_distinctions'] loop
   perform pg_temp.ok(not has_table_privilege('authenticated','public.'||t,'INSERT,UPDATE,DELETE'),f.role_name||' cannot bypass official RPCs on '||t);
  end loop;
  perform pg_temp.reject('select public.m114_author(auth.uid(),null)','42501',f.role_name||' cannot invoke private Concept image helper');
  perform pg_temp.reject('select public.m115_author(auth.uid(),null)','42501',f.role_name||' cannot invoke private Question image helper');
 end loop;
end$$;
reset role;
do $$declare f record;begin
 for f in select * from fixtures where role_name in('learner','editor') loop
  perform pg_temp.reject(format('select public.m114_author(%L,%L)',f.owner_id,(select id from libraries where kind='allowed')),'42501',f.role_name||' denied by service Concept image author gate');
  perform pg_temp.reject(format('select public.m115_author(%L,%L)',f.owner_id,(select id from libraries where kind='allowed')),'42501',f.role_name||' denied by service Question image author gate');
 end loop;
end$$;

-- Existing account activity fences are retained, not replaced by a role label.
select pg_temp.sign_in(null);
update public.account_deletion_state set state='pending',receipt_hash=repeat('e',64),requested_at=now()
 where user_id=(select owner_id from fixtures where role_name='inactive_admin');
select pg_temp.sign_in((select owner_id from fixtures where role_name='inactive_admin'));
set local role authenticated;
select pg_temp.ok(not public.is_admin(),'Inactive Administrator is not an active author');
select pg_temp.ok(not exists(select 1 from public.concepts),'Inactive Administrator cannot read official content');
select pg_temp.reject('select public.create_catalog_tag(''Inactive tag'')','P0001','Inactive Administrator Tag creation denied');
select pg_temp.reject(format('select public.reserve_media_upload(%L,''official'',gen_random_uuid())',(select id from libraries where kind='allowed')),'42501','Inactive Administrator official media denied');
reset role;

-- Only NEW legacy creation is retired. Editing is still owner-qualified and
-- historical overlay upserts, Deck membership and learner Cards retain identity.
set local role authenticated;
do $$declare f record;k uuid;n integer;begin
 for f in select * from fixtures where role_name in ('admin','learner','editor') loop
  perform pg_temp.sign_in(f.owner_id);
  perform pg_temp.reject(format('insert into public.personal_concepts(owner_id,topic_id,name) values(%L,%L,''Denied'')',f.owner_id,f.topic_id),'42501',f.role_name||' new legacy Concept denied');
  perform pg_temp.reject(format('insert into public.personal_collections(owner_id,name) values(%L,''Denied'')',f.owner_id),'42501',f.role_name||' new Personal Deck denied');
  perform pg_temp.reject(format('insert into public.personal_cards(owner_id,concept_id,question,answer) values(%L,%L,''Denied'',''Back'')',f.owner_id,f.concept_id),'42501',f.role_name||' new Concept-backed Card denied');
  perform pg_temp.reject(format('select * from public.create_personal_concept_overlay(%L,''Denied'',null,%L)',f.topic_id,(select root_id from libraries where kind='allowed')),'42501',f.role_name||' privileged legacy creation denied');
  perform pg_temp.ok(exists(select 1 from public.personal_concepts where id=f.concept_id),f.role_name||' historical Concept readable');
  update public.personal_concepts set description='**Disposable historical edit**',source_reference='https://example.invalid/reference' where id=f.concept_id;
  get diagnostics n=row_count;perform pg_temp.ok(n=1,f.role_name||' historical Concept editing retained');
  update public.personal_cards set answer='Disposable legacy edit' where id=f.legacy_card;
  get diagnostics n=row_count;perform pg_temp.ok(n=1,f.role_name||' historical legacy Card editing retained');
  update public.personal_cards set answer='Disposable standalone edit' where id=f.topic_card;
  get diagnostics n=row_count;perform pg_temp.ok(n=1,f.role_name||' historical standalone Card editing retained');
  update public.personal_collections set name='Renamed historical Deck' where owner_id=f.owner_id;
  get diagnostics n=row_count;perform pg_temp.ok(n=1,f.role_name||' historical Deck rename retained');
  perform public.save_personal_concept_with_overlay(f.concept_id,f.topic_id,'Historical Concept','Edited explanation','Original reference',(select root_id from libraries where kind='allowed'),null);
  perform pg_temp.ok(exists(select 1 from public.personal_concept_official_placements where personal_concept_id=f.concept_id),f.role_name||' historical overlay management retained');
  if f.role_name='editor' then
   perform pg_temp.reject(format('select public.reserve_media_upload(%L,''personal'',gen_random_uuid())',(select id from libraries where kind='allowed')),'42501','Editor new unbound personal media reservation denied');
   perform pg_temp.reject(format('insert into public.personal_cards(owner_id,personal_topic_id,question,answer) values(%L,%L,''Denied standalone'',''Back'')',f.owner_id,f.topic_id),'42501','Editor new standalone Card denied');
   perform pg_temp.reject(format('insert into public.personal_topics(owner_id,parent_id,name) values(%L,%L,''Denied Topic'')',f.owner_id,f.topic_id),'42501','Editor direct custom Topic creation denied');
   perform pg_temp.reject(format('select * from public.create_personal_topic(''Denied Topic'',%L,null,0)',f.topic_id),'42501','Editor custom Topic command denied');
   update public.personal_topics set name='Edited historical Topic' where id=f.topic_id;
   get diagnostics n=row_count;perform pg_temp.ok(n=1,'Editor historical Topic editing retained');
  end if;
 end loop;
 select * into f from fixtures where role_name='learner';perform pg_temp.sign_in(f.owner_id);
 insert into public.personal_cards(owner_id,personal_topic_id,question,answer) values(f.owner_id,f.topic_id,'New standalone','Back') returning id into k;
 perform pg_temp.ok(exists(select 1 from public.personal_cards where id=k and concept_id is null),'Learner standalone Card creation retained');
 perform public.create_personal_topic('ZZ 140 learner custom Topic',f.topic_id,null,0);
 perform pg_temp.ok(exists(select 1 from public.personal_topics where name='ZZ 140 learner custom Topic'),'Learner custom Topic creation retained');
 update public.personal_cards set personal_topic_id=(select destination from movement_fixture) where id=k;
 perform pg_temp.ok((select personal_topic_id=(select destination from movement_fixture) from public.personal_cards where id=k),'Learner standalone Card movement retained');
 perform pg_temp.reject(format('update public.personal_cards set personal_topic_id=null,library_node_id=%L,library_id=%L where id=%L',(select root_id from libraries where kind='foreign'),(select id from libraries where kind='foreign'),k),'42501','Learner cross-Library movement denied');
 update public.personal_cards set answer='Forbidden foreign edit' where id=(select legacy_card from fixtures where role_name='other');get diagnostics n=row_count;
 perform pg_temp.ok(n=0,'Cross-owner historical Card editing denied');
 perform pg_temp.ok(not exists(select 1 from public.personal_cards where owner_id<>f.owner_id),'Other-owner Cards remain private');
end$$;
reset role;

set local role anon;
select pg_temp.sign_in(null);
select pg_temp.reject('select * from public.personal_concepts','42501','Anonymous historical content denied');
select pg_temp.reject('select public.create_catalog_tag(''Anonymous'')','42501','Anonymous official creation denied');
select pg_temp.reject('select * from public.create_personal_concept_overlay(null,''Anonymous'',null,null)','42501','Anonymous legacy creation denied');
reset role;
\o
select 'PASS: '||label from checks order by label;
select 'Behavior checks: '||count(*) from checks;
rollback;
