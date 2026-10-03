-- Explicit isolated format116 fixtures only. Every content change below rolls back.
begin;
do $$ begin
 if current_database()<>'format116' or not exists(select 1 from public.libraries where slug='zz-format116-a')
  or exists(select 1 from auth.users where email not like 'zz-format116-%@example.test') then
  raise exception 'Fresh disposable format116 environment required';
 end if;
end $$;
create function pg_temp.check_true(ok boolean,message text) returns void language plpgsql as $$ begin
 if ok is distinct from true then raise exception '%',message; end if;
end $$;
create function pg_temp.must_fail(statement text,expected_message text default null) returns void language plpgsql as $$
declare rejected boolean:=false; detail text;
begin
 begin execute statement; exception when others then rejected:=true; detail:=sqlerrm; end;
 perform pg_temp.check_true(rejected,'Expected rejection: '||statement);
 if expected_message is not null then perform pg_temp.check_true(detail like '%'||expected_message||'%','Unexpected rejection: '||detail); end if;
end $$;
create function pg_temp.question_payload(target uuid default null) returns jsonb language sql as $$
 select jsonb_build_object('p_question_id',target,'p_active_library_id','11600000-0000-4000-8000-000000000010',
  'p_concept_id',coalesce(q.concept_id,'11600000-0000-4000-8000-000000000030'::uuid),'p_question_type',coalesce(q.question_type,'short_answer'),
  'p_prompt',coalesce(q.prompt,'ZZ FORMAT116 **new Front**'),'p_prompt_format',coalesce(q.prompt_format,'visual_markdown_v1'),
  'p_explanation',q.explanation,'p_status',coalesce(q.status,'published'),'p_review_article_concept_id',q.review_article_concept_id,
  'p_sort_order',coalesce(q.sort_order,0),'p_difficulty',coalesce(q.difficulty,'medium'),'p_testing_angle',coalesce(q.testing_angle,'General Understanding'),
  'p_accepted_answers',jsonb_build_array(jsonb_build_object('answer_text',coalesce(a.answer_text,'ZZ FORMAT116 new Answer'),'answer_format',coalesce(a.answer_format,'visual_markdown_v1'),'sort_order',0)),
  'p_options',null,'p_source_ids',null,'p_tag_ids','[]'::jsonb,'p_related_concept_ids','[]'::jsonb,'p_additional_testing_angles','[]'::jsonb)
 from (select 1) seed left join public.questions q on q.id=target
 left join lateral(select answer_text,answer_format from public.question_accepted_answers where question_id=q.id order by sort_order,id limit 1) a on true;
$$;
create function pg_temp.concept_payload(target uuid default null) returns jsonb language sql as $$
 select jsonb_build_object('p_concept_id',target,'p_active_library_id','11600000-0000-4000-8000-000000000010',
  'p_name',coalesce(c.name,'ZZ FORMAT116 new Concept'),'p_body_markdown',coalesce(c.body_markdown,'ZZ FORMAT116 **new body**'),
  'p_library_node_ids',jsonb_build_array('11600000-0000-4000-8000-000000000020'),'p_tag_ids','[]'::jsonb,
  'p_status',coalesce(c.status,'published'),'p_references','[]'::jsonb,'p_prerequisites','[]'::jsonb)
 from (select 1) seed left join public.concepts c on c.id=target;
$$;

-- Database metadata alone never changes authored bytes or old Answer JSON.
select pg_temp.check_true((select bool_and(body_format='legacy') from concepts),'Upgrade changed Concept interpretation');
select pg_temp.check_true((select bool_and(prompt_format='legacy' and not(accepted_answers_snapshot->0?'answer_format')) from question_versions),'Upgrade rewrote an old snapshot');

do $$
declare a uuid:='11600000-0000-4000-8000-000000000001'; e uuid:='11600000-0000-4000-8000-000000000002'; l uuid:='11600000-0000-4000-8000-000000000010';
 q public.questions; c public.concepts; saved jsonb; before_q jsonb; before_answer jsonb; old_v uuid; body jsonb; initial_count integer; initial_versions integer;
begin
 perform set_config('request.jwt.claim.sub',a::text,true);
 select * into q from questions where id='11600000-0000-4000-8000-000000000040';
 old_v:=q.current_version_id; before_q:=to_jsonb(q); select to_jsonb(x) into before_answer from question_accepted_answers x where question_id=q.id;
 body:=pg_temp.question_payload(q.id)||jsonb_build_object('p_prompt',E'ZZ FORMAT116 **edited** literal \u005c\u005c_underscore\u005c\u005c_','p_prompt_format','visual_markdown_v1');
 set local role authenticated;
 saved:=public.save_question_with_format(l,q.current_version_id,q.updated_at,body);
 reset role;
 perform pg_temp.check_true(saved->>'prompt_format'='visual_markdown_v1','Front did not convert');
 perform pg_temp.check_true((saved->'question_accepted_answers'->0->>'answer_format')='legacy','Untouched Answer converted');
 perform pg_temp.check_true((select prompt_format='legacy' and prompt=before_q->>'prompt' and not(accepted_answers_snapshot->0?'answer_format') from question_versions where id=old_v),'Prior version meaning changed');
 perform pg_temp.check_true((select prompt_format='visual_markdown_v1' and accepted_answers_snapshot->0->>'answer_format'='legacy' from question_versions where id=(saved->>'current_version_id')::uuid),'Mixed version formats not captured');
 perform pg_temp.check_true((saved-array['prompt','prompt_format','updated_at','current_version_id','official_version_id','question_accepted_answers'])=(before_q-array['prompt','prompt_format','updated_at','current_version_id','official_version_id']),'Unexposed Question metadata changed');
 perform pg_temp.check_true((select answer_text=before_answer->>'answer_text' from question_accepted_answers where question_id=q.id),'Untouched Answer bytes changed');
 perform pg_temp.check_true((select count(*) from question_sources where question_id=q.id)=1,'Creator reset hidden Sources');
 perform pg_temp.must_fail(format('select save_question_with_format(%L,%L,%L,%L::jsonb)',l,q.current_version_id,q.updated_at,body),'reload');
 -- Stale Article forms and low-level full writers reject after conversion.
 perform pg_temp.must_fail(format('select update_question(%L,''short_answer'',''overwrite'',null,''published'',null,0,''medium'',''General Understanding'')',q.id),'Creator Studio');
 perform pg_temp.must_fail(format('select replace_question_accepted_answers(%L,''[{"answer_text":"overwrite"}]''::jsonb)',q.id),'Creator Studio');
 perform pg_temp.must_fail(format('select replace_question_options(%L,''[]''::jsonb)',q.id),'Creator Studio');
 perform pg_temp.must_fail(format('select save_question_with_version(%L,%L,''short_answer'',''overwrite'',null,''published'',null,0,''medium'',''General Understanding'',''[{"answer_text":"overwrite"}]''::jsonb,null,null::uuid[])',q.id,q.concept_id),'Creator Studio');
 select * into q from questions where id=q.id;
 body:=pg_temp.question_payload(q.id);
 perform pg_temp.must_fail(format('select save_question_with_format(%L,%L,%L,%L::jsonb)',l,q.current_version_id,q.updated_at,body||jsonb_build_object('p_prompt_format','legacy')),'downgraded');
 perform pg_temp.must_fail(format('select save_question_with_format(%L,%L,%L,%L::jsonb)',l,q.current_version_id,q.updated_at,body||jsonb_build_object('p_prompt_format','html')),'Unsupported official text format');
 perform pg_temp.must_fail(format('select save_question_with_format(%L,%L,%L,%L::jsonb)',l,q.current_version_id,q.updated_at,body||jsonb_build_object('p_explanation',null)),'Unexposed');
 before_q:=to_jsonb(q); select count(*) into initial_versions from question_versions where question_id=q.id;
 perform pg_temp.must_fail(format('select save_question_with_format(%L,%L,%L,%L::jsonb)',l,q.current_version_id,q.updated_at,body||jsonb_build_object('p_related_concept_ids',jsonb_build_array(gen_random_uuid()))));
 perform pg_temp.check_true((select to_jsonb(x) from questions x where id=q.id)=before_q and (select count(*) from question_versions where question_id=q.id)=initial_versions,'Failed save changed current/version state');
 body:=jsonb_set(body,'{p_accepted_answers,0,answer_text}','"ZZ FORMAT116 **edited Answer**"');
 body:=jsonb_set(body,'{p_accepted_answers,0,answer_format}','"visual_markdown_v1"');
 set local role authenticated;
 saved:=public.save_question_with_format(l,q.current_version_id,q.updated_at,body);
 reset role;
 perform pg_temp.check_true(saved->>'prompt'=q.prompt and saved->'question_accepted_answers'->0->>'answer_format'='visual_markdown_v1','Answer edit altered Front or failed conversion');
 perform pg_temp.check_true((select accepted_answers_snapshot->0->>'answer_format'='visual_markdown_v1' from question_versions where id=(saved->>'current_version_id')::uuid),'Answer format snapshot missing');

 -- New Questions explicitly retain medium/published compatibility defaults.
 set local role authenticated;
 saved:=public.save_question_with_format(l,null,null,pg_temp.question_payload());
 reset role;
 perform pg_temp.check_true(saved->>'difficulty'='medium' and saved->>'status'='published' and saved->>'prompt_format'='visual_markdown_v1','New Question defaults');
 perform pg_temp.must_fail(format('select save_question_with_format(%L,null,null,%L::jsonb)',l,pg_temp.question_payload()||jsonb_build_object('p_difficulty','hard')),'defaults');
 select count(*) into initial_count from questions;
 perform pg_temp.must_fail(format('select save_question_with_format(%L,null,null,%L::jsonb)',l,pg_temp.question_payload()||jsonb_build_object('p_question_type','multiple_choice')),'shape');
 perform pg_temp.must_fail(format('select save_question_with_format(%L,null,null,%L::jsonb)',l,pg_temp.question_payload()||jsonb_build_object('p_accepted_answers','[{"answer_text":"a","answer_format":"legacy"},{"answer_text":"b","answer_format":"legacy"}]'::jsonb)),'shape');
 perform pg_temp.check_true((select count(*) from questions)=initial_count,'Unsupported save created content');

 -- Concept conversion preserves hidden canonical fields and prerequisites; old version remains legacy.
 select * into c from concepts where id='11600000-0000-4000-8000-000000000030';
 body:=pg_temp.concept_payload(c.id)||jsonb_build_object('p_body_markdown','## ZZ FORMAT116 converted Concept');
 old_v:=c.current_version_id;
 set local role authenticated;
 saved:=public.save_concept_with_format(l,c.current_version_id,c.updated_at,'visual_markdown_v1',body);
 reset role;
 perform pg_temp.check_true(saved->>'body_format'='visual_markdown_v1','Concept conversion missing');
 perform pg_temp.check_true((select body_format='legacy' and body_markdown=c.body_markdown from concept_versions where id=old_v),'Legacy Concept history changed');
 perform pg_temp.check_true((select body_format='visual_markdown_v1' and summary=c.summary and why_it_matters=c.why_it_matters from concepts where id=c.id),'Concept metadata lost');
 perform pg_temp.must_fail(format('select save_concept_with_format(%L,%L,%L,''visual_markdown_v1'',%L::jsonb)',l,old_v,c.updated_at,body),'reload');
 perform pg_temp.must_fail(format('select save_concept_draft(%L,''overwrite'',''overwrite'',%L,array[%L::uuid],array[]::text[])',c.id,l,'11600000-0000-4000-8000-000000000020'),'format-aware');
 perform set_config('request.jwt.claim.sub',e::text,true);
 set local role authenticated;
 saved:=public.save_concept_with_format(l,null,null,'visual_markdown_v1',pg_temp.concept_payload());
 reset role;
 perform pg_temp.check_true(saved->>'body_format'='visual_markdown_v1','Editor authority lost');
end $$;
select 'PASS source/format atomicity, independent surfaces, legacy history, compatibility metadata, stale/failure rollback and staff authority';

do $$
declare a uuid:='11600000-0000-4000-8000-000000000001'; l uuid:='11600000-0000-4000-8000-000000000010'; article uuid:='11600000-0000-4000-8000-000000000050';
 q public.questions; before_q jsonb; before_answers jsonb; before_options jsonb; saved jsonb; revision uuid; touched timestamptz;
begin
 perform set_config('request.jwt.claim.sub',a::text,true);
 select * into q from questions where id='11600000-0000-4000-8000-000000000040';
 before_q:=to_jsonb(q);
 select jsonb_agg(to_jsonb(x) order by id) into before_answers from question_accepted_answers x where question_id=q.id;
 select jsonb_agg(to_jsonb(x) order by id) into before_options from question_options x where question_id=q.id;
 set local role authenticated;
 saved:=public.save_article_question_metadata(l,article,q.id,q.current_version_id,q.updated_at,'{"status":"archived","source_ids":[],"review_article_concept_id":null}');
 reset role;
 perform pg_temp.check_true(saved->>'status'='archived' and saved->'source_ids'='[]'::jsonb and saved->'review_article_concept_id'='null'::jsonb,'Article metadata did not save');
 perform pg_temp.check_true((saved-array['status','review_article_concept_id','source_ids','updated_at','current_version_id','official_version_id'])=(before_q-array['status','review_article_concept_id','updated_at','current_version_id','official_version_id']),'Article altered protected text/format/metadata');
 perform pg_temp.check_true((select jsonb_agg(to_jsonb(x) order by id) from question_accepted_answers x where question_id=q.id)=before_answers,'Article altered Answer identity');
 perform pg_temp.check_true((select jsonb_agg(to_jsonb(x) order by id) from question_options x where question_id=q.id) is not distinct from before_options,'Article altered Options');
 perform pg_temp.check_true(saved->>'current_version_id'<>q.current_version_id::text,'Article metadata omitted immutable version');
 perform pg_temp.must_fail(format('select save_article_question_metadata(%L,%L,%L,%L,%L,''{"status":"published"}''::jsonb)',l,article,q.id,q.current_version_id,q.updated_at),'reload');
 select * into q from questions where id=q.id;
 perform pg_temp.must_fail(format('select save_article_question_metadata(%L,%L,%L,%L,%L,''{"prompt":"overwrite"}''::jsonb)',l,article,q.id,q.current_version_id,q.updated_at),'Unsupported');
 perform pg_temp.must_fail(format('select save_article_question_metadata(%L,%L,%L,%L,%L,''{"status":"published"}''::jsonb)',l,gen_random_uuid(),q.id,q.current_version_id,q.updated_at),'context denied');
 perform pg_temp.must_fail(format('select save_article_question_metadata(%L,%L,%L,%L,%L,''{"source_ids":["11600000-0000-4000-8000-000000000099"]}''::jsonb)',l,article,q.id,q.current_version_id,q.updated_at),'source not found');
 perform pg_temp.check_true((select status from questions where id=q.id)='archived','Failed Article edit published content');
end $$;
select 'PASS Article Policy A allowlist, context, revision guard, Answer identity and immutable snapshot';

do $$
declare l uuid:='11600000-0000-4000-8000-000000000010'; actor uuid; body jsonb; f record;
begin
 body:=pg_temp.question_payload();
 foreach actor in array array['11600000-0000-4000-8000-000000000003'::uuid,'11600000-0000-4000-8000-000000000004'::uuid,null::uuid] loop
  perform set_config('request.jwt.claim.sub',coalesce(actor::text,''),true);
  set local role authenticated;
  perform pg_temp.must_fail(format('select save_question_with_format(%L,null,null,%L::jsonb)',l,body),'authoring denied');
  perform pg_temp.must_fail(format('select save_concept_with_format(%L,null,null,''visual_markdown_v1'',%L::jsonb)',l,pg_temp.concept_payload()));
  reset role;
 end loop;
 perform set_config('request.jwt.claim.sub','11600000-0000-4000-8000-000000000001',true);
 perform pg_temp.must_fail(format('select save_question_with_format(%L,null,null,%L::jsonb)',l,body||jsonb_build_object('p_concept_id','11600000-0000-4000-8000-000000000031')));
 for f in select oid,proname from pg_proc where pronamespace='public'::regnamespace and proname like 'm116_%' loop
  perform pg_temp.check_true(not has_function_privilege('authenticated',f.oid,'EXECUTE') and not has_function_privilege('service_role',f.oid,'EXECUTE') and not has_function_privilege('anon',f.oid,'EXECUTE'),'Private implementation exposed: '||f.proname);
 end loop;
 set local role anon;
 perform pg_temp.must_fail(format('select save_question_with_format(%L,null,null,%L::jsonb)',l,body),'permission denied');
 reset role;
end $$;
select 'PASS learner/second-learner/anonymous/cross-Library denial and private implementation ACL';

-- Database transaction fixtures use the real installed Storage schema, within
-- this rollback only. This proves reference/version atomicity, not image bytes
-- or the unchanged upload service (covered by the media lifecycle suites).
insert into storage.buckets(id,name,public) values('socrates-content-media','socrates-content-media',false);
create function pg_temp.ready_media(kind text,draft uuid) returns jsonb language plpgsql as $$
declare a uuid:='11600000-0000-4000-8000-000000000001'; l uuid:='11600000-0000-4000-8000-000000000010'; r jsonb; claim jsonb; stage jsonb; promotion jsonb; dest jsonb; asset jsonb;
begin
 if kind='concept' then r:=public.m114_reserve(a,l,draft,gen_random_uuid());
 else r:=public.m115_reserve(a,l,draft,null,gen_random_uuid()); end if;
 -- The shared operation primitive is unchanged. Draft-target authorization is
 -- checked by its existing wrapper on each ordinary transition.
 if kind='concept' then
  claim:=public.m114_upload(a,l,(r->>'reservationId')::uuid,'claim');
  stage:=public.m114_upload(a,l,(r->>'reservationId')::uuid,'commit-bytes',(claim->>'token')::uuid,jsonb_build_object('inputDigest',repeat('a',64),'outputDigest',repeat('b',64),'mime','image/png','size',100,'width',10,'height',10));
  perform public.m114_upload(a,l,(r->>'reservationId')::uuid,'dispatch-stage',(claim->>'token')::uuid,stage);
  promotion:=public.m114_upload(a,l,(r->>'reservationId')::uuid,'stage-verified',(claim->>'token')::uuid,stage);
  dest:=public.m114_upload(a,l,(r->>'reservationId')::uuid,'dispatch-promotion',(claim->>'token')::uuid,promotion);
 else
  claim:=public.m115_upload(a,l,(r->>'reservationId')::uuid,'claim');
  stage:=public.m115_upload(a,l,(r->>'reservationId')::uuid,'commit-bytes',(claim->>'token')::uuid,jsonb_build_object('inputDigest',repeat('a',64),'outputDigest',repeat('b',64),'mime','image/png','size',100,'width',10,'height',10));
  perform public.m115_upload(a,l,(r->>'reservationId')::uuid,'dispatch-stage',(claim->>'token')::uuid,stage);
  promotion:=public.m115_upload(a,l,(r->>'reservationId')::uuid,'stage-verified',(claim->>'token')::uuid,stage);
  dest:=public.m115_upload(a,l,(r->>'reservationId')::uuid,'dispatch-promotion',(claim->>'token')::uuid,promotion);
 end if;
 insert into storage.objects(bucket_id,name) values(dest->>'bucket',dest->>'object');
 if kind='concept' then asset:=public.m114_upload(a,l,(r->>'reservationId')::uuid,'publish',(claim->>'token')::uuid,promotion);
 else asset:=public.m115_upload(a,l,(r->>'reservationId')::uuid,'publish',(claim->>'token')::uuid,promotion); end if;
 return jsonb_build_object('assetId',asset->>'assetId','reservationId',r->>'reservationId','placementId',gen_random_uuid(),'altText','ZZ FORMAT116 image','caption','Synthetic contract fixture','ordinal',0);
end $$;
do $$
declare a uuid:='11600000-0000-4000-8000-000000000001'; l uuid:='11600000-0000-4000-8000-000000000010';
 d uuid:=gen_random_uuid(); qd uuid:=gen_random_uuid(); edit_d uuid:=gen_random_uuid(); item jsonb; front jsonb; answer jsonb; body jsonb; saved jsonb; repeated jsonb; target uuid; old_v uuid; counts jsonb;
begin
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform public.m114_draft(a,l,d,'create'); item:=pg_temp.ready_media('concept',d);
 body:=pg_temp.concept_payload()||jsonb_build_object('p_body_format','visual_markdown_v1','p_body_markdown',E'## ZZ FORMAT116 image\n\n[[socrates-media:'||(item->>'placementId')||E']]\n','placements',jsonb_build_array(item));
 counts:=jsonb_build_object('concepts',(select count(*) from concepts),'versions',(select count(*) from concept_versions),'references',(select count(*) from media_version_references));
 perform pg_temp.must_fail(format('select m114_save(%L,null,%L,null,%L::jsonb)',l,d,body||jsonb_build_object('p_prerequisites',jsonb_build_array(jsonb_build_object('target_type','concept','target_id',gen_random_uuid(),'strength','required')))));
 perform pg_temp.check_true(counts=jsonb_build_object('concepts',(select count(*) from concepts),'versions',(select count(*) from concept_versions),'references',(select count(*) from media_version_references)),'Failed Concept transaction left content/history/media');
 perform pg_temp.check_true((select state from concept_media_drafts where id=d)='open','Failed Concept save consumed draft');
 set local role authenticated;
 saved:=public.m114_save(l,null,d,null,body); repeated:=public.m114_save(l,null,d,null,body);
 reset role;
 target:=(saved->>'concept_id')::uuid; old_v:=(saved->>'version_id')::uuid;
 -- The released first receipt also includes current placement/Tag/prerequisite
 -- context; retry returns its immutable receipt subset. Preserve that contract.
 perform pg_temp.check_true(saved-array['tags','status','library_id','prerequisites','library_node_ids']=repeated and repeated->>'body_format'='visual_markdown_v1','Concept lost-response receipt changed');
 perform pg_temp.check_true((select count(*) from concept_versions where concept_id=target)=1 and (select count(*) from media_version_references where concept_version_id=old_v)=1,'First Concept format/media version mismatch');
 body:=body||jsonb_build_object('p_concept_id',target,'p_expected_updated_at',saved->>'updated_at','p_body_markdown','ZZ FORMAT116 removed image','placements','[]'::jsonb);
 saved:=public.m114_save(l,target,null,old_v,body);
 perform pg_temp.check_true((select count(*) from content_media_placements where concept_id=target)=0 and (select count(*) from media_version_references where concept_version_id=old_v)=1,'Concept removal lost history or retained current image');
 perform pg_temp.check_true(not public.m112_queue_orphan((item->>'assetId')::uuid),'Format edit lost protected image');

 perform public.m115_draft(a,l,qd,null,null,'create');
 front:=pg_temp.ready_media('question',qd)||jsonb_build_object('surface','front');
 answer:=pg_temp.ready_media('question',qd)||jsonb_build_object('surface','answer');
 body:=pg_temp.question_payload()||jsonb_build_object('front',jsonb_build_array(front),'answer',jsonb_build_array(answer));
 -- First save may contain different interpretation contracts on the two surfaces.
 body:=jsonb_set(body,'{p_accepted_answers,0,answer_format}','"legacy"');
 counts:=jsonb_build_object('questions',(select count(*) from questions),'versions',(select count(*) from question_versions),'references',(select count(*) from media_version_references));
 perform pg_temp.must_fail(format('select m115_save(%L,null,%L,null,%L::jsonb)',l,qd,body||jsonb_build_object('p_related_concept_ids',jsonb_build_array(gen_random_uuid()))));
 perform pg_temp.check_true(counts=jsonb_build_object('questions',(select count(*) from questions),'versions',(select count(*) from question_versions),'references',(select count(*) from media_version_references)),'Failed Question transaction left content/history/media');
 perform pg_temp.check_true((select state from question_media_drafts where id=qd)='open','Failed Question consumed draft');
 set local role authenticated;
 saved:=public.m115_save(l,null,qd,null,body); repeated:=public.m115_save(l,null,qd,null,body);
 reset role;
 target:=(saved->>'id')::uuid; old_v:=(saved->>'current_version_id')::uuid;
 perform pg_temp.check_true(saved=repeated and saved->>'prompt_format'='visual_markdown_v1' and saved->>'answer_format'='legacy','Question lost-response receipt changed formats');
 perform pg_temp.check_true((select count(*) from question_versions where question_id=target)=1 and (select count(*) from media_version_references where question_version_id=old_v)=2,'First Question format/media version mismatch');
 perform pg_temp.check_true(public.m115_manifest(a,l,target)->>'prompt_format'='visual_markdown_v1' and public.m115_manifest(a,l,target)->>'answer_format'='legacy','Readback format differs');
 perform public.m115_draft(a,l,edit_d,target,old_v,'create');
 body:=body||jsonb_build_object('p_question_id',target,'p_expected_updated_at',saved->>'updated_at','p_prompt','ZZ FORMAT116 **edited with images**');
 saved:=public.m115_save(l,target,edit_d,old_v,body);
 perform pg_temp.check_true((select count(*) from media_version_references where question_version_id=old_v)=2 and (select count(*) from media_version_references where question_version_id=(saved->>'current_version_id')::uuid)=2,'Question format edit lost current/history media');
 perform pg_temp.check_true(public.m115_receipt(target,old_v)->>'prompt'='ZZ FORMAT116 **new Front**','Historical receipt used current text');
 perform pg_temp.check_true((select jsonb_agg(x) from public.get_creator_questions(l,'11600000-0000-4000-8000-000000000030') x)=(select jsonb_agg(x-'question_media_hint') from public.get_creator_questions_with_media(l,'11600000-0000-4000-8000-000000000030') x),'Creator wrapper changed selector semantics');
 perform pg_temp.check_true((select jsonb_agg(x) from public.search_creator_questions(l) x)=(select jsonb_agg(x-'question_media_hint') from public.search_creator_questions_with_media(l) x),'Search wrapper changed selector semantics');
end $$;
select 'PASS media + format atomic first-save, rollback, identical retry, existing save, invisible historical protection and unchanged read wrappers';
-- Data-free bootstrap omits seed rows. Use the exact released Migration 073
-- policy for this rolled-back selector fixture; no scheduling policy is changed.
insert into study_priority_source_policy(policy_name,official_source_weight,personal_source_weight,max_source_absence,max_official_run,max_personal_run)
values('normal_default',2,1,4,3,2);
do $$
declare l uuid:='11600000-0000-4000-8000-000000000010'; deck public.study_decks; session_id uuid; candidate jsonb; q public.questions; answer public.question_accepted_answers; cram boolean;
begin
 perform set_config('request.jwt.claim.sub','11600000-0000-4000-8000-000000000003',true);
 deck:=public.get_or_create_active_study_deck(l);
 perform public.set_study_deck_node_selection(deck.id,'11600000-0000-4000-8000-000000000020',true);
 foreach cram in array array[false,true] loop
  update study_decks set cram_mode=cram where id=deck.id;
  set local role authenticated;
  session_id:=public.start_study_session(deck.id,50);
  candidate:=public.select_next_study_candidate_with_media(session_id,false);
  reset role;
  select * into q from questions where id=(candidate->>'official_question_id')::uuid;
  select * into answer from question_accepted_answers where question_id=q.id order by sort_order,id limit 1;
  perform pg_temp.check_true(q.id is not null,'Missing official Study/Cram candidate');
  perform pg_temp.check_true(candidate->>'prompt'=q.prompt and candidate->>'prompt_format'=q.prompt_format and candidate->>'answer'=answer.answer_text and candidate->>'answer_format'=answer.answer_format and candidate->>'question_version_id'=q.current_version_id::text,'Selected Study/Cram payload mixed source/format/version');
  perform pg_temp.check_true((select prompt=q.prompt and prompt_format=q.prompt_format and accepted_answers_snapshot->0->>'answer_format'=answer.answer_format from question_versions where id=q.current_version_id),'Selected snapshot format mismatch');
  perform public.end_study_session(session_id);
 end loop;
end $$;
select 'PASS normal Study/Cram selected text, independent formats and exact Question version share the same payload';
set constraints all immediate;
rollback;
