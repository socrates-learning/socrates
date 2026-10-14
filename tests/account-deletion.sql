\set ON_ERROR_STOP on
begin;
do $$ begin if current_database() not like 'account127_%' then raise exception 'Disposable account127 database required'; end if; end $$;
create function pg_temp.id(n integer) returns uuid language sql as $$ select ('a1270000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function pg_temp.ok(value boolean,label text) returns void language plpgsql as $$ begin
 if value is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
create function pg_temp.reject(statement text,label text) returns void language plpgsql as $$ begin
 begin execute statement; exception when others then raise notice 'PASS: %',label;return;end;
 raise exception 'FAIL: %',label;
end $$;
insert into auth.users(id,email) values(pg_temp.id(1),'account127-author@example.invalid'),(pg_temp.id(2),'account127-other@example.invalid');
insert into public.user_roles(user_id,role) values(pg_temp.id(1),'admin'),(pg_temp.id(2),'learner');
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
select id as lib from public.libraries where status='active' order by id limit 1 \gset
select id as node from public.library_nodes where library_id=:'lib' order by id limit 1 \gset
insert into public.user_libraries(user_id,library_id) values(pg_temp.id(1),:'lib'),(pg_temp.id(2),:'lib');
insert into public.concepts(id,name,created_by,status) values(pg_temp.id(10),'Preserved official Concept',pg_temp.id(1),'published'),(pg_temp.id(11),'Related Concept',pg_temp.id(1),'published');
insert into public.concept_placements(concept_id,library_node_id,sort_order) values(pg_temp.id(10),:'node',7000),(pg_temp.id(11),:'node',7001);
insert into public.concept_versions(id,concept_id,version_number,name,body_markdown,created_by) values(pg_temp.id(12),pg_temp.id(10),1,'Immutable Concept','Preserved body',pg_temp.id(1));
insert into public.questions(id,concept_id,question_type,prompt,explanation,status,created_by) values(pg_temp.id(20),pg_temp.id(10),'short_answer','Preserved Question','Preserved Answer','draft',pg_temp.id(1));
insert into public.question_versions(id,question_id,concept_id,version_number,question_type,prompt,explanation,created_by) values(pg_temp.id(21),pg_temp.id(20),pg_temp.id(10),1,'short_answer','Preserved Question','Preserved Answer',pg_temp.id(1));
insert into public.question_related_concepts(question_id,concept_id,created_by) values(pg_temp.id(20),pg_temp.id(11),pg_temp.id(1));
insert into public.question_additional_testing_angles(question_id,testing_angle,created_by) values(pg_temp.id(20),'Application',pg_temp.id(1));
insert into public.articles(id,slug,title,owner_id) values(pg_temp.id(30),'account127-preserved','Preserved Article',pg_temp.id(1));
insert into public.article_versions(id,article_id,version_number,title,body_markdown,created_by) values(pg_temp.id(31),pg_temp.id(30),1,'Preserved Article','Preserved article body',pg_temp.id(1));
select id as topic from public.create_personal_topic('Private Topic',null,:'node',null) \gset
insert into public.personal_concepts(id,owner_id,topic_id,name) values(pg_temp.id(40),pg_temp.id(1),:'topic','Private Concept');
insert into public.personal_cards(id,owner_id,concept_id,question,answer) values(pg_temp.id(41),pg_temp.id(1),pg_temp.id(40),'Private Front','Private Back');
insert into public.personal_cards(id,owner_id,library_id,library_node_id,question,answer) values(pg_temp.id(42),pg_temp.id(1),:'lib',:'node','Standalone Front','Standalone Back');
insert into public.study_goals(user_id,library_id,name,objective,deadline,official_topic_ids) values(pg_temp.id(1),:'lib','Private goal','coverage',current_date,array[:'node'::uuid]);
insert into public.personal_question_notes(user_id,question_id,note) values(pg_temp.id(1),pg_temp.id(20),'My mnemonic'),(pg_temp.id(2),pg_temp.id(20),'Another learner mnemonic');
insert into public.study_candidate_flags(user_id,question_id,note) values(pg_temp.id(1),pg_temp.id(20),'Private flag'),(pg_temp.id(2),pg_temp.id(20),'Preserved other flag');
insert into public.study_sessions(id,user_id,library_id,answered_count) values(pg_temp.id(50),pg_temp.id(1),:'lib',1),(pg_temp.id(51),pg_temp.id(2),:'lib',1);
insert into public.review_attempts(user_id,concept_id,question_id,result,study_session_id,sequence_position) values(pg_temp.id(1),pg_temp.id(10),pg_temp.id(20),'easy',pg_temp.id(50),1),(pg_temp.id(2),pg_temp.id(10),pg_temp.id(20),'easy',pg_temp.id(51),1);
insert into public.media_assets(id,library_id,owner_id,created_by,scope,object_name) values
 (pg_temp.id(60),:'lib',pg_temp.id(1),pg_temp.id(1),'personal',:'lib'||'/'||pg_temp.id(60)::text),
 (pg_temp.id(61),:'lib',null,pg_temp.id(1),'official',:'lib'||'/'||pg_temp.id(61)::text);
-- Fake metadata exists only inside this rollback proof. Actual bytes are tested
-- separately through disposable Auth/Storage APIs, never SQL Storage cleanup.
insert into storage.objects(bucket_id,name) values('socrates-profile-photos',pg_temp.id(1)||'/avatar'),('socrates-content-media',:'lib'||'/'||pg_temp.id(60)::text),('socrates-content-media',:'lib'||'/'||pg_temp.id(61)::text);
create temp table official_before as select 'concept_versions' kind,id,to_jsonb(t)-'created_by' value from public.concept_versions t where id=pg_temp.id(12)
 union all select 'question_versions',id,to_jsonb(t)-'created_by' from public.question_versions t where id=pg_temp.id(21)
 union all select 'article_versions',id,to_jsonb(t)-'created_by' from public.article_versions t where id=pg_temp.id(31)
 union all select 'questions',id,to_jsonb(t)-'created_by' from public.questions t where id=pg_temp.id(20)
 union all select 'articles',id,to_jsonb(t)-'owner_id' from public.articles t where id=pg_temp.id(30);
create temp table other_before as select 'note' kind,to_jsonb(t) value from public.personal_question_notes t where user_id=pg_temp.id(2)
 union all select 'flag',to_jsonb(t) from public.study_candidate_flags t where user_id=pg_temp.id(2)
 union all select 'attempt',to_jsonb(t) from public.review_attempts t where user_id=pg_temp.id(2)
 union all select 'session',to_jsonb(t) from public.study_sessions t where user_id=pg_temp.id(2);
select pg_temp.reject(format('update public.concept_versions set created_by=null where id=%L',pg_temp.id(12)),'direct immutable-version anonymization remains forbidden');
set local role authenticated;
select pg_temp.reject(format('select public.begin_account_deletion(%L,%L)',pg_temp.id(2),repeat('a',64)),'browser cannot start deletion for another user');
select pg_temp.reject(format('select public.begin_account_deletion(%L,%L)',pg_temp.id(1),repeat('a',64)),'browser cannot bypass server reauthentication for itself');
select pg_temp.reject('select * from public.account_deletion_state','deletion ledger is private');
reset role;
select public.begin_account_deletion(pg_temp.id(1),repeat('a',64));
select pg_temp.ok((public.account_deletion_status(repeat('a',64))->'objects') @> jsonb_build_array(jsonb_build_object('bucket','socrates-profile-photos','name',pg_temp.id(1)||'/avatar')),'profile photo enumerated');
select pg_temp.ok(not ((public.account_deletion_status(repeat('a',64))->'objects') @> jsonb_build_array(jsonb_build_object('bucket','socrates-content-media','name',:'lib'||'/'||pg_temp.id(61)::text))),'official media excluded from deletion');
select pg_temp.reject(format('delete from auth.users where id=%L',pg_temp.id(1)),'Auth deletion fails atomically while Storage remains');
select pg_temp.ok(exists(select 1 from public.personal_cards where id=pg_temp.id(41)),'failed deletion retains application data');
set local role authenticated;
select pg_temp.ok(not public.has_socrates_role(),'pending account loses role-derived RPC authorization');
select pg_temp.ok((select count(*)=0 from public.personal_question_notes),'stale JWT cannot read own fenced notes');
select pg_temp.reject(format('insert into public.personal_cards(owner_id,concept_id,question,answer) values(%L,%L,''Late'',''Late'')',pg_temp.id(1),pg_temp.id(40)),'stale JWT cannot recreate personal data');
reset role;
select pg_temp.reject(format('insert into storage.objects(bucket_id,name) values(''socrates-profile-photos'',%L)',pg_temp.id(1)||'/avatar'),'late Storage write blocked even with privileged storage caller');
-- Rollback-only simulation of successful Storage API removal.
set local storage.allow_delete_query='true';
delete from storage.objects where (bucket_id='socrates-profile-photos' and name=pg_temp.id(1)||'/avatar') or (bucket_id='socrates-content-media' and name=:'lib'||'/'||pg_temp.id(60)::text);
set local storage.allow_delete_query='false';
delete from auth.users where id=pg_temp.id(1);
set constraints all immediate;
select pg_temp.ok(not exists(select 1 from auth.users where id=pg_temp.id(1)),'Auth identity removed');
select pg_temp.ok(public.account_deletion_status(repeat('a',64))->>'state'='complete','successful deletion has durable completion receipt');
select pg_temp.ok(public.account_deletion_status(repeat('a',64))->'objects'='[]','completed receipt retains no image path inventory');
select pg_temp.ok(not exists(select 1 from public.personal_cards where owner_id=pg_temp.id(1)),'personal Cards removed');
select pg_temp.ok(not exists(select 1 from public.personal_concepts where owner_id=pg_temp.id(1)),'personal Concepts removed');
select pg_temp.ok(not exists(select 1 from public.personal_topics where owner_id=pg_temp.id(1)),'personal Topics removed');
select pg_temp.ok(not exists(select 1 from public.study_goals where user_id=pg_temp.id(1)),'Study Goals removed');
select pg_temp.ok(not exists(select 1 from public.personal_question_notes where user_id=pg_temp.id(1)),'Personal Notes removed');
select pg_temp.ok(not exists(select 1 from public.study_sessions where user_id=pg_temp.id(1)),'study sessions removed');
select pg_temp.ok(not exists(select 1 from public.review_attempts where user_id=pg_temp.id(1)),'official attempts removed');
select pg_temp.ok(not exists(select 1 from public.media_assets where owner_id=pg_temp.id(1)),'personal media identities removed after bytes');
select pg_temp.ok(exists(select 1 from public.media_assets where id=pg_temp.id(61) and created_by is null),'official media identity preserved under neutral attribution');
select pg_temp.ok(exists(select 1 from storage.objects where name=:'lib'||'/'||pg_temp.id(61)::text),'shared official image remains');
do $$ declare r record; actual jsonb; n bigint; begin
 for r in select * from official_before loop
  execute format('select to_jsonb(t)-%L from public.%I t where id=$1',case when r.kind='articles' then 'owner_id' else 'created_by' end,r.kind) into actual using r.id;
  perform pg_temp.ok(actual=r.value,'official content/revision/timestamp unchanged: '||r.kind);
 end loop;
 for r in select c.conrelid::regclass t,a.attname col from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
 where c.contype='f' and c.confrelid='auth.users'::regclass and c.connamespace='public'::regnamespace loop
  execute format('select count(*) from %s where %I=$1',r.t,r.col) into n using pg_temp.id(1);
  perform pg_temp.ok(n=0,'no residual account reference: '||r.t||'.'||r.col);
 end loop;
end $$;
select pg_temp.ok(not exists((select * from other_before) except
 (select 'note',to_jsonb(t) from public.personal_question_notes t where user_id=pg_temp.id(2)
 union all select 'flag',to_jsonb(t) from public.study_candidate_flags t where user_id=pg_temp.id(2)
 union all select 'attempt',to_jsonb(t) from public.review_attempts t where user_id=pg_temp.id(2)
 union all select 'session',to_jsonb(t) from public.study_sessions t where user_id=pg_temp.id(2))),'other learner notes, flags, attempts and sessions unchanged');
select pg_temp.reject(format('insert into storage.objects(bucket_id,name) values(''socrates-profile-photos'',%L)',pg_temp.id(1)||'/avatar'),'completed deletion rejects delayed profile upload');
select pg_temp.reject(format('update public.question_versions set prompt=''tampered'' where id=%L',pg_temp.id(21)),'version content remains immutable after account removal');
rollback;
