-- Isolated media112 only. All fixtures and ordinary transaction failures roll back.
begin;
do $$ begin
 if current_database()<>'media112' or not exists(select 1 from public.libraries where id='11200000-0000-4000-8000-000000000010' and name='Media disposable A')
 or exists(select 1 from auth.users where email not like '%@example.test') then raise exception 'Disposable media112 fixtures required'; end if;
end $$;
create function pg_temp.check_true(ok boolean, message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception '%',message; end if; end $$;
create function pg_temp.must_fail(statement text) returns void language plpgsql as $$
declare rejected boolean:=false;
begin begin execute statement; exception when others then rejected:=true; end;
 perform pg_temp.check_true(rejected,'Expected rejection: '||statement);
end $$;
do $$
declare a uuid:='11200000-0000-4000-8000-000000000001'; e uuid:='11200000-0000-4000-8000-000000000002'; l uuid:='11200000-0000-4000-8000-000000000010';
d uuid:=gen_random_uuid(); abandoned uuid:=gen_random_uuid(); expired uuid:=gen_random_uuid(); editor_draft uuid:=gen_random_uuid(); pending uuid:=gen_random_uuid(); r jsonb; result jsonb; repeated jsonb; payload jsonb; target uuid; v uuid; before_count bigint;
begin
 select count(*) into before_count from public.concepts;
 perform public.m114_draft(a,l,d,'create');
 perform public.m114_draft(e,l,editor_draft,'create');
 perform pg_temp.check_true((select count(*) from public.concepts)=before_count,'Reservation created content');
 perform pg_temp.must_fail(format('select public.m114_draft(%L,%L,%L,''read'')',e,l,d));
 perform pg_temp.must_fail(format('select public.m114_draft(%L,%L,%L,''read'')',a,'11200000-0000-4000-8000-000000000011',d));
 perform pg_temp.must_fail(format('select public.m114_draft(%L,%L,%L,''create'')','11200000-0000-4000-8000-000000000003',l,gen_random_uuid()));
 perform pg_temp.must_fail(format('select public.m114_draft(null,%L,%L,''create'')',l,gen_random_uuid()));
 perform public.m114_draft(a,l,abandoned,'create');
 perform public.m114_draft(a,l,abandoned,'abandon');
 perform pg_temp.must_fail(format('select public.m114_reserve(%L,%L,%L,%L)',a,l,abandoned,gen_random_uuid()));
 -- A separate expired draft fixture rolls back; no asset or orphan clock is altered.
 insert into public.concept_media_drafts(id,author_id,library_id,created_at,expires_at)
 values(expired,a,l,clock_timestamp()-interval '48 hours',clock_timestamp()-interval '25 hours');
 perform pg_temp.must_fail(format('select public.m114_draft(%L,%L,%L,''create'')',a,l,expired));
 perform pg_temp.must_fail(format('select public.m114_reserve(%L,%L,%L,%L)',a,l,expired,gen_random_uuid()));
 perform public.m114_draft(a,l,pending,'create');
 r:=public.m114_reserve(a,l,pending,gen_random_uuid());
 perform pg_temp.check_true(not (r ? 'assetId'),'Logical reservation created asset identity');
 perform pg_temp.must_fail(format('select public.m114_upload(%L,%L,%L,''claim'')',e,l,r->>'reservationId'));
 perform pg_temp.must_fail(format('select public.m114_preview(%L,%L,null,%L,%L)',a,l,pending,r->>'reservationId'));
 payload:=jsonb_build_object('p_active_library_id',l,'p_concept_id',null,'p_name','ZZ GATE4 SQL ATOMIC','p_body_markdown','Synthetic Concept body',
  'p_library_node_ids',jsonb_build_array('11200000-0000-4000-8000-000000000020'),'p_tag_ids','[]'::jsonb,'p_status','draft','p_references','[]'::jsonb,'p_prerequisites','[]'::jsonb,'placements','[]'::jsonb);
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform pg_temp.must_fail(format('select public.m114_save(%L,null,%L,null,%L::jsonb)',l,expired,payload));
 perform pg_temp.must_fail(format('select public.m114_save(%L,null,%L,null,%L::jsonb)',l,pending,payload));
 perform public.m114_upload(a,l,(r->>'reservationId')::uuid,'cancel');
 -- Failure after draft creation/placement setup must roll back the entire first save.
 perform pg_temp.must_fail(format('select public.m114_save(%L,null,%L,null,%L::jsonb)',l,d,payload||jsonb_build_object('p_prerequisites',jsonb_build_array(jsonb_build_object('target_type','concept','target_id',gen_random_uuid(),'strength','required')))));
 perform pg_temp.check_true((select count(*) from public.concepts)=before_count,'Failed first save left a Concept');
 perform pg_temp.check_true((select state from public.concept_media_drafts where id=d)='open','Failed first save consumed draft');
 perform set_config('request.jwt.claim.sub',a::text,true);
 result:=public.m114_save(l,null,d,null,payload); target:=(result->>'concept_id')::uuid; v:=(result->>'version_id')::uuid;
 perform pg_temp.check_true((select count(*) from public.concept_versions where concept_id=target)=1,'First save made more than one version');
 perform pg_temp.check_true((select current_version_id from public.concepts where id=target)=v,'Version pointer differs');
 repeated:=public.m114_save(l,null,d,null,payload);
 perform pg_temp.check_true((result->'concept_id')=(repeated->'concept_id') and (result->'version_id')=(repeated->'version_id')
  and (result->'bodyMarkdown')=(repeated->'bodyMarkdown') and (result->'placements')=(repeated->'placements') and (result->'references')=(repeated->'references'),'Same first-save retry changed receipt');
 perform pg_temp.must_fail(format('select public.m114_save(%L,null,%L,null,%L::jsonb)',l,d,payload||jsonb_build_object('p_name','Changed after consumption')));
 perform pg_temp.must_fail(format('select public.m114_save(%L,%L,null,%L,%L::jsonb)',l,target,gen_random_uuid(),payload));
 perform set_config('request.jwt.claim.sub',a::text,true);
 result:=public.m114_save(l,target,null,v,payload||jsonb_build_object('p_body_markdown','Revised synthetic body'));
 perform pg_temp.check_true((select count(*) from public.concept_versions where concept_id=target)=2,'Existing save did not append one version');
 perform pg_temp.check_true((select body_markdown from public.concept_versions where id=v)='Synthetic Concept body','Historical body changed');
 perform public.delete_development_content('concept',target);
 repeated:=public.m114_save(l,null,d,null,payload);
 perform pg_temp.check_true((repeated->>'terminal')::boolean,'Permanent deletion allowed first-save resurrection');
 perform pg_temp.check_true(not exists(select 1 from public.concepts where id=target),'Deleted Concept recreated');
 perform pg_temp.check_true(not exists(select 1 from public.concept_versions where concept_id=target),'Deleted Concept versions survived');
end $$;
set constraints all immediate;
select 'PASS draft authorization, first-save rollback, one-version creation, exact retry, existing versions and terminal deletion';
rollback;
