-- Disposable / rollback-only integration verifier. Run after migration 083 locally.
\set ON_ERROR_STOP on
begin;
create temporary table phase7c_results (name text primary key, result text not null);
create function pg_temp.check_result(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL: %', label; end if;
  insert into phase7c_results values(label, 'PASS');
end $$;
create function pg_temp.expect_error(label text, statement text) returns void language plpgsql as $$
declare rejected boolean := false;
begin
  begin execute statement; exception when others then rejected := true; end;
  perform pg_temp.check_result(label, rejected);
end $$;
create temporary table phase7c_fixture as select gen_random_uuid() editor, gen_random_uuid() learner,
  gen_random_uuid() library, gen_random_uuid() other_library, gen_random_uuid() node,
  gen_random_uuid() other_node, gen_random_uuid() primary_concept, gen_random_uuid() related_a,
  gen_random_uuid() related_b, gen_random_uuid() related_c, gen_random_uuid() foreign_concept,
  gen_random_uuid() deck, gen_random_uuid() session;
insert into auth.users(id) select editor from phase7c_fixture union all select learner from phase7c_fixture;
insert into public.user_roles(user_id,role) select editor,'editor' from phase7c_fixture union all select learner,'learner' from phase7c_fixture;
select set_config('request.jwt.claim.sub',editor::text,true) from phase7c_fixture;
insert into public.libraries(id,name,slug,status) select library,'Phase7C','phase7c-'||library,'active' from phase7c_fixture union all select other_library,'Other','phase7c-'||other_library,'active' from phase7c_fixture;
insert into public.library_nodes(id,library_id,name,node_type) select node,library,'Local test root','section' from phase7c_fixture union all select other_node,other_library,'Other root','section' from phase7c_fixture;
insert into public.concepts(id,name,status,created_by)
  select id, label,'published',editor from phase7c_fixture cross join lateral (values
    (primary_concept,'Primary'),(related_a,'Related A'),(related_b,'Related B'),(related_c,'Related C'),(foreign_concept,'Other Library')) c(id,label);
insert into public.concept_placements(concept_id,library_node_id)
 select id,case when id=foreign_concept then other_node else node end from phase7c_fixture cross join lateral unnest(array[primary_concept,related_a,related_b,related_c,foreign_concept]) id;
insert into public.study_decks(id,user_id,library_id,name,is_active) select deck,editor,library,'Phase7C',false from phase7c_fixture;
insert into public.user_study_node_selections(user_id,library_id,node_id,deck_id) select editor,library,node,deck from phase7c_fixture;
insert into public.study_sessions(id,user_id,library_id,study_deck_id,selection_snapshot)
 select session,editor,library,deck,jsonb_build_object('selected_node_ids',jsonb_build_array(node),'node_preferences',jsonb_build_object(node::text,50)) from phase7c_fixture;
insert into public.concept_prerequisites(concept_id,prerequisite_concept_id,strength,created_by,updated_by)
 select primary_concept,related_a,'required',editor,editor from phase7c_fixture;
-- Sixty pre-existing scalar Questions require no link backfill or content change.
insert into public.questions(concept_id,question_type,prompt,status,created_by)
 select related_c,'short_answer','Scalar '||g,'draft',editor from phase7c_fixture cross join generate_series(1,60) g;
create temporary table scalar_before as select q.* from public.questions q,phase7c_fixture f where q.concept_id=f.related_c;
create function pg_temp.save(qid uuid, related uuid[] default null) returns public.questions language sql as $$
 select public.save_question_with_relationships(qid,primary_concept,'short_answer','Relationship fixture',null,'published',null,0,'medium','General Understanding','[{"answer_text":"Answer","sort_order":0}]',null,null,'{}',library,related) from phase7c_fixture;
$$;
create function pg_temp.versions() returns setof public.question_versions language sql security definer set search_path = '' as $$ select * from public.question_versions $$;
grant all on phase7c_fixture,phase7c_results,scalar_before to authenticated;
set local role authenticated;

do $$
declare f record; q public.questions; before_priority jsonb; before_candidates jsonb; before_deck jsonb; first_version uuid; versions integer; old_hash text;
begin
 select * into f from phase7c_fixture;
 q := pg_temp.save(null,array[f.related_a,f.related_b]); first_version := q.current_version_id;
 perform pg_temp.check_result('new Question has Primary plus two Related',q.concept_id=f.primary_concept and (select count(*) from public.question_related_concepts where question_id=q.id)=2);
 perform pg_temp.check_result('new save appends exactly one schema-3 complete snapshot',(select count(*)=1 and bool_and(snapshot_schema_version=3 and jsonb_array_length(related_concepts_snapshot)=2 and concept_id=f.primary_concept and jsonb_array_length(accepted_answers_snapshot)=1) from pg_temp.versions() where question_id=q.id));
 perform pg_temp.check_result('coherent related browse returns true Primary and both links',(select count(*)=1 and bool_and(x->>'concept_id'=f.primary_concept::text and jsonb_array_length(x->'related_concepts')=2) from public.get_creator_questions(f.library,f.related_a) x));
 select md5(to_jsonb(v)::text) into old_hash from pg_temp.versions() v where id=first_version;
 before_priority := public.select_next_study_question(f.session,true);
 select jsonb_agg(to_jsonb(c)) into before_candidates from public.resolve_study_candidates(f.deck) c;
 select jsonb_agg(to_jsonb(c)) into before_deck from public.resolve_study_deck(f.deck) c;
 q := pg_temp.save(q.id,array[f.related_a,f.related_c,f.related_c]);
 perform pg_temp.check_result('add/remove and duplicate normalization snapshot',(select jsonb_array_length(related_concepts_snapshot)=2 and related_concepts_snapshot @> jsonb_build_array(jsonb_build_object('concept_id',f.related_c)) and not related_concepts_snapshot @> jsonb_build_array(jsonb_build_object('concept_id',f.related_b)) from pg_temp.versions() where id=q.current_version_id));
 perform pg_temp.check_result('one candidate unchanged by related association edits',before_candidates=(select jsonb_agg(to_jsonb(c)) from public.resolve_study_candidates(f.deck) c) and (select count(*) from public.resolve_study_candidates(f.deck))=1);
 perform pg_temp.check_result('deck inclusion and Primary counts unchanged',before_deck=(select jsonb_agg(to_jsonb(c)) from public.resolve_study_deck(f.deck) c));
 perform pg_temp.check_result('priority and prerequisite debug unchanged',before_priority=public.select_next_study_question(f.session,true));
 perform pg_temp.check_result('browse deduplicated despite overlapping links',(select count(*)=count(distinct x->>'id') and count(*)=1 from public.get_creator_questions(f.library,f.primary_concept) x));
 q := public.save_question_with_version(q.id,f.primary_concept,'short_answer','Relationship fixture',null,'published',null,0,'medium','General Understanding',null,null,null,'{}');
 perform pg_temp.check_result('legacy 14-argument edit preserves both links',(select jsonb_array_length(related_concepts_snapshot)=2 from pg_temp.versions() where id=q.current_version_id));
 q := pg_temp.save(q.id);
 perform pg_temp.check_result('omitted related IDs preserve links',(select count(*)=2 from public.question_related_concepts where question_id=q.id));
 q := pg_temp.save(q.id,'{}');
 perform pg_temp.check_result('empty array clears and snapshots empty',(select count(*)=0 from public.question_related_concepts where question_id=q.id) and (select related_concepts_snapshot='[]'::jsonb from pg_temp.versions() where id=q.current_version_id));
 perform pg_temp.check_result('historical immutable snapshot unchanged',old_hash=(select md5(to_jsonb(v)::text) from pg_temp.versions() v where id=first_version));
 select count(*) into versions from pg_temp.versions() where question_id=q.id;
 perform pg_temp.expect_error('Primary cannot be Related',format('select pg_temp.save(%L,array[%L]::uuid[])',q.id,f.primary_concept));
 perform pg_temp.expect_error('invalid Concept rejected',format('select pg_temp.save(%L,array[%L]::uuid[])',q.id,gen_random_uuid()));
 perform pg_temp.expect_error('NULL array element rejected',format('select pg_temp.save(%L,array[null]::uuid[])',q.id));
 perform pg_temp.expect_error('cross-Library related Concept rejected',format('select pg_temp.save(%L,array[%L]::uuid[])',q.id,f.foreign_concept));
 perform pg_temp.check_result('rejected associations rollback content and version writes',versions=(select count(*) from pg_temp.versions() where question_id=q.id) and q.current_version_id=(select current_version_id from public.questions where id=q.id));
 perform pg_temp.expect_error('direct editor writes denied',format('insert into public.question_related_concepts values(%L,%L,%L,now())',q.id,f.related_b,f.editor));
 perform pg_temp.expect_error('Primary transfer rejected',format('select public.save_question_with_version(%L,%L,''short_answer'',''Moved'',null,''published'',null,0,''medium'',''General Understanding'',null,null,null,''{}'')',q.id,f.related_a));
 q := pg_temp.save(q.id,array[f.related_a,f.related_b]);
 perform set_config('request.jwt.claim.sub',f.learner::text,true);
 perform pg_temp.expect_error('learner cannot save',format('select pg_temp.save(%L,null)',q.id));
 perform pg_temp.expect_error('learner cannot browse authoring RPC',format('select public.get_creator_questions(%L,%L)',f.library,f.primary_concept));
 perform pg_temp.check_result('learner RLS does not expose related metadata',(select count(*)=0 from public.question_related_concepts where question_id=q.id));
 perform set_config('request.jwt.claim.sub',f.editor::text,true);
 perform pg_temp.expect_error('related Concept cannot receive attempt',format('select public.record_study_session_attempt(%L,%L,%L,''average'')',f.session,q.id,f.related_a));
 perform public.record_study_session_attempt(f.session,q.id,f.primary_concept,'average');
 perform pg_temp.check_result('one answer creates one Primary attempt',(select count(*)=1 and bool_and(concept_id=f.primary_concept) from public.review_attempts where study_session_id=f.session));
 perform pg_temp.check_result('one Primary mastery update only',(select count(*)=1 and bool_and(concept_id=f.primary_concept and evidence_count=1) from public.user_concept_mastery where user_id=f.editor));
 perform pg_temp.check_result('one Primary angle evidence update only',(select count(*)=1 and bool_and(concept_id=f.primary_concept and evidence_count=1) from public.user_concept_testing_angle_state where user_id=f.editor));
 perform pg_temp.check_result('60 scalar Questions unchanged without backfill',not exists ((select scalar_question.* from public.questions scalar_question where scalar_question.concept_id=f.related_c) except (select * from scalar_before)) and (select count(*)=60 from scalar_before));
end $$;
reset role;
do $$
declare f record; qid uuid; original_count integer;
begin
 select * into f from phase7c_fixture;
 select id into qid from public.questions where concept_id=f.primary_concept;
 perform pg_temp.expect_error('database trigger prevents Primary-as-Related even for privileged writers',format('insert into public.question_related_concepts values(%L,%L,%L,now())',qid,f.primary_concept,f.editor));
 perform pg_temp.expect_error('database trigger preserves canonical Primary',format('update public.questions set concept_id=%L where id=%L',f.related_a,qid));
 perform pg_temp.expect_error('related Concept deletion is restrictive',format('delete from public.concepts where id=%L',f.related_b));
 delete from public.question_related_concepts where question_id=qid and concept_id=f.related_b;
 perform pg_temp.check_result('unlinking Related Concept never deletes Question',exists(select 1 from public.questions where id=qid));
 perform pg_temp.check_result('anon and browser mutation ACLs closed',not has_table_privilege('anon','public.question_related_concepts','SELECT') and not has_table_privilege('authenticated','public.question_related_concepts','INSERT') and not has_table_privilege('authenticated','public.question_related_concepts','UPDATE') and not has_table_privilege('authenticated','public.question_related_concepts','DELETE'));
end $$;
select * from phase7c_results order by name;
select count(*) as passed from phase7c_results;
rollback;
