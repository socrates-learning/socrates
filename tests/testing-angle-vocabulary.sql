-- Rollback-only application contract checks on the explicitly disposable clone.
\set ON_ERROR_STOP on
begin;
do $$ begin
  if current_database() !~ '^testing_angle119(_[a-z]+)?$'
    or not exists(select 1 from public.libraries where slug='zz-home117-a')
    or exists(select 1 from auth.users where email not like 'zz-home117-%@example.invalid')
  then raise exception 'Testing Angle 119 synthetic clone required'; end if;
end $$;
create function pg_temp.check_true(ok boolean,label text) returns void language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'FAIL: %',label; end if;
  raise notice 'PASS: %',label;
end $$;
create function pg_temp.rejected(statement text,pattern text) returns void language plpgsql as $$ begin
  begin execute statement; exception when others then
    if sqlerrm !~ pattern then raise exception 'Unexpected rejection: %',sqlerrm; end if;
    return;
  end;
  raise exception 'Expected rejection: %',statement;
end $$;
create function pg_temp.history(p_question uuid) returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(v) order by id),'[]') from public.question_versions v where question_id=p_question;
$$;
create function pg_temp.payload(p_primary text,p_additional text[] default '{}') returns jsonb language sql as $$
 select jsonb_build_object('p_active_library_id','11700000-0000-4000-8000-000000000010','p_question_id',null,'p_concept_id','11700000-0000-4000-8000-000000000050',
  'p_question_type','short_answer','p_prompt','ZZ ANGLE119 contract Question','p_prompt_format','legacy',
  'p_explanation',null,'p_status','published','p_review_article_concept_id',null,'p_sort_order',0,
  'p_difficulty','medium','p_testing_angle',p_primary,
  'p_accepted_answers',jsonb_build_array(jsonb_build_object('answer_text','ZZ ANGLE119 Answer','answer_format','legacy','sort_order',0)),
  'p_options',null,'p_source_ids',null,'p_tag_ids','[]'::jsonb,'p_related_concept_ids','[]'::jsonb,
  'p_additional_testing_angles',to_jsonb(p_additional));
$$;
create function pg_temp.save(p_question uuid,p_primary text,p_additional text[] default '{}') returns jsonb language plpgsql as $$
declare q public.questions; payload jsonb:=pg_temp.payload(p_primary,p_additional); begin
 if p_question is not null then
  select * into q from public.questions where id=p_question;
  payload:=payload||jsonb_build_object('p_question_id',p_question,'p_prompt',q.prompt,
   'p_prompt_format',q.prompt_format,'p_explanation',q.explanation,'p_status',q.status,'p_sort_order',q.sort_order,'p_difficulty',q.difficulty);
 end if;
 return public.save_question_with_format('11700000-0000-4000-8000-000000000010',q.current_version_id,q.updated_at,payload);
end $$;

select set_config('request.jwt.claim.sub','11700000-0000-4000-8000-000000000001',true);
set local role authenticated;
select pg_temp.check_true(public.can_manage_testing_angle_vocabulary(),'Admin has explicit vocabulary authority');
select pg_temp.check_true((select count(*)=9 from public.get_testing_angle_vocabulary() where sort_order<9 and status='active'),'nine defaults active and ordered');
select pg_temp.rejected('select * from public.testing_angle_vocabulary','permission denied');

do $$ declare a public.testing_angle_vocabulary; b public.testing_angle_vocabulary; q jsonb; qid uuid;
  original_versions jsonb; original_primary text; count_before integer; begin
 a:=public.create_testing_angle('ZZ ANGLE119 Recall');
 b:=public.create_testing_angle('ZZ ANGLE119 Application');
 perform pg_temp.check_true(a.status='active' and a.display_name=a.storage_key and a.revision=1,'Add creates stable active identity');
 perform pg_temp.rejected($q$select public.create_testing_angle(' zz angle119 recall ')$q$,'already used or reserved');
 perform pg_temp.rejected($q$select public.create_testing_angle('  ')$q$,'name must be');
 q:=pg_temp.save(null,a.storage_key,array[b.storage_key]); qid:=(q->>'id')::uuid;
 perform pg_temp.check_true(q->>'testing_angle'=a.storage_key and q->>'status'='published','format-aware first save and readback');
 original_versions:=pg_temp.history(qid);
 count_before:=jsonb_array_length(original_versions);
 a:=public.rename_testing_angle(a.id,'ZZ ANGLE119 Renamed Recall',a.revision);
 perform pg_temp.check_true(a.storage_key='ZZ ANGLE119 Recall' and a.display_name='ZZ ANGLE119 Renamed Recall'
   and a.reserved_names @> array['zz angle119 recall','zz angle119 renamed recall'],'Rename preserves key and reserves both names');
 perform pg_temp.check_true((select testing_angle from public.questions where id=qid)='ZZ ANGLE119 Recall','Rename does not rewrite current Question');
 perform pg_temp.rejected($q$select public.create_testing_angle('ZZ ANGLE119 Recall')$q$,'already used or reserved');
 perform pg_temp.rejected(format('select public.rename_testing_angle(%L,%L,%s)',b.id,'ZZ ANGLE119 Recall',b.revision),'already used or reserved');
 perform pg_temp.rejected(format('select public.rename_testing_angle(%L,%L,1)',a.id,'ZZ ANGLE119 stale'),'changed; reload');
 perform pg_temp.check_true(jsonb_array_length(pg_temp.history(qid))=count_before,'management appends no Question version');
 a:=public.set_testing_angle_retired(a.id,true,a.revision);
 b:=public.set_testing_angle_retired(b.id,true,b.revision);
 perform pg_temp.check_true(a.status='retired' and b.status='retired','Remove safely retires both entries');
 perform pg_temp.rejected(format('select pg_temp.save(null,%L)',a.storage_key),'removed from future availability');
 perform pg_temp.rejected(format('select pg_temp.save(null,%L,array[%L])','General Understanding',b.storage_key),'removed from future availability');
 q:=pg_temp.save(qid,a.storage_key,array[b.storage_key]);
 perform pg_temp.check_true(q->>'testing_angle'=a.storage_key,'unrelated edit retains retired Primary and Additional');
 q:=pg_temp.save(qid,b.storage_key,array[a.storage_key]);
 perform pg_temp.check_true(q->>'testing_angle'=b.storage_key and exists(select 1 from public.question_additional_testing_angles where question_id=qid and testing_angle=a.storage_key),'retired promotion preserves former Primary as Additional');
 q:=pg_temp.save(qid,b.storage_key,null);
 perform pg_temp.check_true(exists(select 1 from public.question_additional_testing_angles where question_id=qid and testing_angle=a.storage_key),'omitted Additional preserves existing retired value');
 q:=pg_temp.save(qid,b.storage_key,'{}');
 perform pg_temp.check_true(not exists(select 1 from public.question_additional_testing_angles where question_id=qid),'empty Additional clears');
 perform pg_temp.rejected(format('select pg_temp.save(%L,%L,array[%L])',qid,b.storage_key,a.storage_key),'removed from future availability');
 a:=public.set_testing_angle_retired(a.id,false,a.revision);
 q:=pg_temp.save(qid,b.storage_key,array[a.storage_key]);
 perform pg_temp.check_true(a.status='active' and a.storage_key='ZZ ANGLE119 Recall','Restore reuses identity and permits assignment');
 perform pg_temp.check_true(pg_temp.history(qid) @> original_versions,'all preceding immutable versions remain byte-equivalent');
 perform pg_temp.check_true(not exists(select 1 from public.question_additional_testing_angles where question_id=qid and lower(btrim(testing_angle))=lower(btrim(b.storage_key))),'Primary stays excluded from Additional');
 perform pg_temp.rejected(format('select public.set_testing_angle_retired(%L,true,0)',b.id),'changed; reload');
 perform pg_temp.rejected($q$select pg_temp.save(null,'ZZ ANGLE119 not registered')$q$,'unavailable; add it');
 select * into a from public.get_testing_angle_vocabulary() where storage_key='General Understanding';
 perform pg_temp.rejected(format('select public.set_testing_angle_retired(%L,true,%s)',a.id,a.revision),'protected New Question default');
end $$;
reset role;

-- Exact history checks require the database verifier role; ordinary browsers have
-- no version-table grant, and the application must not gain one for management.
select set_config('request.jwt.claim.sub','11700000-0000-4000-8000-000000000004',true);
set local role authenticated;
select pg_temp.check_true(public.can_manage_testing_angle_vocabulary(),'Editor has explicit vocabulary authority');
select pg_temp.check_true((public.create_testing_angle('ZZ ANGLE119 Editor')).created_by=auth.uid(),'Editor Add is independently authorized');
select set_config('request.jwt.claim.sub','11700000-0000-4000-8000-000000000002',true);
select pg_temp.check_true(not public.can_manage_testing_angle_vocabulary(),'learner has no vocabulary authority');
select pg_temp.rejected('select public.get_testing_angle_vocabulary()','Only authorized');
select pg_temp.rejected($q$select public.create_testing_angle('ZZ learner')$q$,'Only authorized');
select pg_temp.rejected($q$select public.rename_testing_angle(gen_random_uuid(),'ZZ learner',1)$q$,'Only authorized');
select pg_temp.rejected($q$select public.set_testing_angle_retired(gen_random_uuid(),true,1)$q$,'Only authorized');
select pg_temp.rejected($q$insert into public.testing_angle_vocabulary(storage_key,display_name,status,reserved_names,sort_order) values('bad','bad','active','{bad}',100)$q$,'permission denied');
select set_config('request.jwt.claim.sub','',true);
select pg_temp.rejected('select public.get_testing_angle_vocabulary()','Only authorized');
reset role;
set local role anon;
select pg_temp.rejected('select public.get_testing_angle_vocabulary()','permission denied');
reset role;
select pg_temp.check_true(not has_function_privilege('authenticated','public.m119_validate_question_angles(uuid,text,text[])','execute'),'private validation helper is not browser callable');
select pg_temp.rejected($q$update public.testing_angle_vocabulary set storage_key='changed' where storage_key='General Understanding'$q$,'identity and order are immutable');
select pg_temp.rejected($q$delete from public.testing_angle_vocabulary where storage_key='ZZ ANGLE119 Editor'$q$,'retired, not deleted');
rollback;
