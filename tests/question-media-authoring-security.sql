-- Ordinary transaction contracts in isolated media112; fixtures roll back completely.
begin;
do $$ begin
 if current_database()<>'media112' or not exists(select 1 from libraries where id='11200000-0000-4000-8000-000000000010' and name='Media disposable A') or exists(select 1 from auth.users where email not like '%@example.test') then raise exception 'Disposable media112 only'; end if;
end $$;
create function pg_temp.check_true(ok boolean,message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception '%',message; end if; end $$;
create function pg_temp.must_fail(statement text) returns void language plpgsql as $$ declare rejected boolean:=false; begin begin execute statement; exception when others then rejected:=true; end; perform pg_temp.check_true(rejected,'Expected rejection: '||statement); end $$;
do $$
declare a uuid:='11200000-0000-4000-8000-000000000001'; e uuid:='11200000-0000-4000-8000-000000000002'; l uuid:='11200000-0000-4000-8000-000000000010'; c uuid:='11200000-0000-4000-8000-000000000030';
 d uuid:=gen_random_uuid(); ed uuid:=gen_random_uuid(); d2 uuid:=gen_random_uuid(); stale uuid:=gen_random_uuid(); abandoned uuid:=gen_random_uuid(); expired uuid:=gen_random_uuid(); pending uuid:=gen_random_uuid(); q uuid; v uuid; result jsonb; repeated jsonb; payload jsonb; r jsonb; count_before integer;
begin
 select count(*) into count_before from public.questions;
 perform public.m115_draft(a,l,d,null,null,'create');
 perform public.m115_draft(e,l,ed,null,null,'create');
 perform pg_temp.check_true((select count(*) from public.questions)=count_before,'Draft created hidden Question');
 perform pg_temp.must_fail(format('select public.m115_draft(%L,%L,%L,null,null,''read'')',e,l,d));
 perform pg_temp.must_fail(format('select public.m115_draft(%L,%L,%L,null,null,''read'')',a,'11200000-0000-4000-8000-000000000011',d));
 perform pg_temp.must_fail(format('select public.m115_draft(%L,%L,%L,null,null,''create'')','11200000-0000-4000-8000-000000000003',l,gen_random_uuid()));
 perform pg_temp.must_fail(format('select public.m115_draft(null,%L,%L,null,null,''create'')',l,gen_random_uuid()));
 perform public.m115_draft(a,l,abandoned,null,null,'create');
 perform public.m115_draft(a,l,abandoned,null,null,'abandon');
 perform pg_temp.must_fail(format('select public.m115_reserve(%L,%L,%L,null,%L)',a,l,abandoned,gen_random_uuid()));
 -- Independent expired receipt only; no asset/grace timestamp is changed.
 insert into public.question_media_drafts(id,author_id,library_id,created_at,expires_at) values(expired,a,l,clock_timestamp()-interval '48 hours',clock_timestamp()-interval '25 hours');
 perform pg_temp.must_fail(format('select public.m115_reserve(%L,%L,%L,null,%L)',a,l,expired,gen_random_uuid()));
 perform public.m115_draft(a,l,pending,null,null,'create');r:=public.m115_reserve(a,l,pending,null,gen_random_uuid());
 perform pg_temp.check_true(not(r?'assetId'),'Reservation created durable identity');
 perform pg_temp.must_fail(format('select public.m115_upload(%L,%L,%L,''claim'')',e,l,r->>'reservationId'));
 perform pg_temp.must_fail(format('select public.m115_preview(%L,%L,null,%L,%L)',a,l,pending,r->>'reservationId'));
 payload:=jsonb_build_object('p_question_id',null,'p_active_library_id',l,'p_concept_id',c,'p_question_type','short_answer','p_prompt','ZZ GATE5 SQL QUESTION','p_explanation',null,'p_status','published','p_review_article_concept_id',null,'p_sort_order',0,'p_difficulty','medium','p_testing_angle','General Understanding','p_accepted_answers',jsonb_build_array(jsonb_build_object('answer_text','ZZ GATE5 SQL ANSWER','sort_order',0)),'p_options',null,'p_source_ids',null,'p_tag_ids','[]'::jsonb,'p_related_concept_ids','[]'::jsonb,'p_additional_testing_angles','[]'::jsonb,'front','[]'::jsonb,'answer','[]'::jsonb);
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform pg_temp.must_fail(format('select public.m115_save(%L,null,%L,null,%L::jsonb)',l,pending,payload));
 perform public.m115_upload(a,l,(r->>'reservationId')::uuid,'cancel');
 -- Fail inside the delegated text/relationship save, after Question creation.
 perform pg_temp.must_fail(format('select public.m115_save(%L,null,%L,null,%L::jsonb)',l,d,payload||jsonb_build_object('p_related_concept_ids',jsonb_build_array(gen_random_uuid()))));
 perform pg_temp.check_true((select count(*) from public.questions)=count_before,'Failed save left Question');
 perform pg_temp.check_true((select state from public.question_media_drafts where id=d)='open','Failed save consumed receipt');
 result:=public.m115_save(l,null,d,null,payload);q:=(result->>'id')::uuid;v:=(result->>'current_version_id')::uuid;
 perform pg_temp.check_true(result->>'answer'='ZZ GATE5 SQL ANSWER','Answer receipt differs');
 perform pg_temp.check_true((select count(*) from public.question_versions where question_id=q)=1,'First save made multiple versions');
 repeated:=public.m115_save(l,null,d,null,payload);perform pg_temp.check_true(result=repeated,'Identical retry changed receipt');
 perform pg_temp.must_fail(format('select public.m115_save(%L,null,%L,null,%L::jsonb)',l,d,payload||jsonb_build_object('p_prompt','Changed consumed payload')));
 perform public.m115_draft(a,l,d2,q,v,'create');perform public.m115_draft(a,l,stale,q,v,'create');
 result:=public.m115_save(l,q,d2,v,payload||jsonb_build_object('p_question_id',q,'p_prompt','ZZ GATE5 SQL REVISED'));
 perform pg_temp.must_fail(format('select public.m115_save(%L,%L,%L,%L,%L::jsonb)',l,q,stale,v,payload||jsonb_build_object('p_question_id',q)));
 perform pg_temp.check_true((select count(*) from question_versions where question_id=q)=2,'Edit version count differs');
 perform pg_temp.check_true((select prompt from question_versions where id=v)='ZZ GATE5 SQL QUESTION','History changed');
 perform pg_temp.check_true((select jsonb_agg(x) from public.get_creator_questions(l,c) x)=(select jsonb_agg(x-'question_media_hint') from public.get_creator_questions_with_media(l,c) x),'Read wrapper changed result/order');
 perform pg_temp.check_true((select jsonb_agg(x) from public.search_creator_questions(l) x)=(select jsonb_agg(x-'question_media_hint') from public.search_creator_questions_with_media(l) x),'Search wrapper changed result/order');
 perform set_config('request.jwt.claim.sub','11200000-0000-4000-8000-000000000003',true);
 perform pg_temp.must_fail(format('select * from public.get_creator_questions_with_media(%L,%L)',l,c));
 perform pg_temp.must_fail(format('select * from public.search_creator_questions_with_media(%L)',l));
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform public.delete_development_content('question',q);
 repeated:=public.m115_save(l,null,d,null,payload);perform pg_temp.check_true((repeated->>'terminal')::boolean,'Deleted Question restarted');
 perform pg_temp.check_true(not exists(select 1 from questions where id=q) and not exists(select 1 from question_versions where question_id=q),'Permanent closure differs');
end $$;
set constraints all immediate;
select 'PASS Question draft authority, pending/expiry, atomic rollback, one-version save, identical/changed retry, stale edits, wrappers and terminal deletion';
rollback;
