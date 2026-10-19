-- Rollback-only synthetic proof. Never run against a hosted database.
\set ON_ERROR_STOP on
begin;
\o /dev/null
do $$begin
 if current_database() !~ '^topic_detachment_' or exists(select 1 from auth.users where email not like 'zz-shared122-%@example.invalid') then raise exception 'Isolated synthetic database required'; end if;
end$$;
create function pg_temp.id(n integer) returns uuid language sql immutable as $$select ('12200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create temp table checks(label text primary key);
grant select,insert on checks to authenticated,anon,service_role;
create function pg_temp.ok(value boolean,label text) returns void language plpgsql as $$begin if value is distinct from true then raise exception 'FAILED: %',label; end if; insert into checks values(label);end$$;
create function pg_temp.reject(statement text,state text,label text) returns void language plpgsql as $$declare failed boolean:=false;begin begin execute statement;exception when others then if sqlstate<>state then raise exception 'FAILED %: expected %, got %: %',label,state,sqlstate,sqlerrm;end if;failed:=true;end;perform pg_temp.ok(failed,label);end$$;
create temp table saved(key text primary key,value uuid);
grant all on saved to authenticated;
create function pg_temp.rev() returns text language sql as $$select public.get_official_topic_graph(pg_temp.id(10))->>'revision'$$;
create function pg_temp.detach(location uuid) returns jsonb language sql as $$select public.detach_official_topic_location(pg_temp.id(10),location,public.review_official_topic_detachment(pg_temp.id(10),location)->>'review_revision')$$;
create function pg_temp.fingerprints() returns table(name text,hash text) language plpgsql as $$declare t record;begin
 for t in select tablename from pg_tables where schemaname='public' and tablename<>'official_topic_locations' order by tablename loop
  return query execute format('select %L::text,md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),''[]'')::text) from public.%I r',t.tablename,t.tablename);
 end loop;
end$$;
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
set local role authenticated;
insert into saved values('parent',(public.create_official_topic_at_location(pg_temp.id(10),pg_temp.id(26),'Detachment proof parent','this',pg_temp.rev())->>'topic_id')::uuid);
insert into saved values('child',(public.create_official_topic_at_location(pg_temp.id(10),(select value from saved where key='parent'),'Detachment proof child','this',pg_temp.rev())->>'topic_id')::uuid);
insert into saved values('grandchild',(public.create_official_topic_at_location(pg_temp.id(10),(select value from saved where key='child'),'Detachment proof grandchild','this',pg_temp.rev())->>'topic_id')::uuid);
select public.change_official_topic_location(pg_temp.id(10),(select value from saved where key='parent'),pg_temp.id(24),'duplicate','this',false,null,pg_temp.rev());
insert into saved select 'alias',id from public.official_topic_locations where topic_id=(select value from saved where key='parent') and not is_original;
select public.change_official_topic_location(pg_temp.id(10),pg_temp.id(25),(select value from saved where key='alias'),'duplicate','this',false,null,pg_temp.rev());
reset role;
-- Genuine content, published revision, learning evidence and non-default preferences.
insert into public.concepts(id,name,body_markdown,status,created_by) values(pg_temp.id(150),'Detachment protected Concept','Synthetic protected explanation.','published',pg_temp.id(1));
insert into public.concept_placements(concept_id,library_node_id) values(pg_temp.id(150),(select value from saved where key='child'));
select public.append_concept_version_snapshot(pg_temp.id(150),pg_temp.id(1));
insert into public.questions(id,concept_id,question_type,prompt,status,difficulty,testing_angle,created_by) values(pg_temp.id(160),pg_temp.id(150),'short_answer','Synthetic preservation Question?','draft','medium','General Understanding',pg_temp.id(1));
insert into public.question_accepted_answers(question_id,answer_text,sort_order) values(pg_temp.id(160),'Synthetic answer.',0);
update public.questions set status='published' where id=pg_temp.id(160);
select public.append_question_version_snapshot(pg_temp.id(160),pg_temp.id(1));
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
insert into public.user_concept_mastery(user_id,concept_id,mastery_estimate,retrievability,stability,uncertainty,evidence_count,last_exposure_at,last_result) values(pg_temp.id(2),pg_temp.id(150),0.8,0.8,0.7,0.2,5,now(),'easy');
set local role authenticated;
select public.set_study_deck_location_selection(pg_temp.id(90),pg_temp.id(20),false,pg_temp.rev());
select public.set_study_deck_location_selection(pg_temp.id(90),(select value from saved where key='child'),true,pg_temp.rev());
select public.set_study_deck_location_preference(pg_temp.id(90),pg_temp.id(10),(select value from saved where key='child'),43,
 public.get_home_study_bootstrap(pg_temp.id(10),pg_temp.id(90))#>>'{unified_deck_settings,topic_preference_state,revision}');
insert into saved values('goal',public.save_placement_study_goal(pg_temp.id(10),'Detachment Goal',current_date+30,'coverage',array[(select value from saved where key='child')],'{}'));
select pg_temp.ok(exists(select 1 from public.resolve_study_deck(pg_temp.id(90)) where concept_id=pg_temp.id(150)),'selected content eligible before detachment');
reset role;
create temp table protected_before as select * from pg_temp.fingerprints();
create temp table locations_before as select * from public.official_topic_locations;
create temp table functions_before as select oid,md5(pg_get_functiondef(oid)) hash from pg_proc where oid in ('public.select_next_study_question_hardened(uuid,boolean)'::regprocedure,'public.m123_goal_progress(uuid)'::regprocedure,'public.delete_admin_inbox_message(uuid,uuid)'::regprocedure);
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
set local role authenticated;
select pg_temp.ok((public.review_official_topic_detachment(pg_temp.id(10),(select value from saved where key='parent'))->>'descendant_count')::int=2,'review counts nested descendants');
select pg_temp.ok((public.review_official_topic_detachment(pg_temp.id(10),(select value from saved where key='parent'))->>'other_placements')::int=1,'review identifies surviving shared placement');
select pg_temp.ok(jsonb_array_length(public.review_official_topic_detachment(pg_temp.id(10),(select value from saved where key='parent'))->'unassigned_topics')=2,'review names final-placement descendants');
select pg_temp.reject(format('select public.detach_official_topic_location(%L,%L,''stale'')',pg_temp.id(10),(select value from saved where key='parent')),'PT409','stale confirmation rejected');
select pg_temp.reject(format('select pg_temp.detach(%L)',pg_temp.id(20)),'22023','Library root protected');
select pg_temp.reject(format('select pg_temp.detach(%L)',pg_temp.id(30)),'22023','cross-Library source rejected');
select pg_temp.ok((public.review_official_topic_detachment(pg_temp.id(10),pg_temp.id(21))->>'blocked_by_personal_anchor')::boolean,'private anchors explicitly block original removal');
select pg_temp.reject(format('select pg_temp.detach(%L)',pg_temp.id(21)),'23514','personal material cannot be hidden');
select pg_temp.reject(format('select public.change_official_topic_location(%L,%L,null,''remove'',''all'',false,null,pg_temp.rev())',pg_temp.id(10),pg_temp.id(23)),'22023','legacy physical removal cannot bypass review');
select pg_temp.detach((select value from saved where key='parent'));
select pg_temp.ok(not exists(select 1 from public.official_topic_locations where id=(select value from saved where key='parent')),'RLS hides detached placement');
select pg_temp.ok((public.list_unassigned_official_topics(pg_temp.id(10),'Detachment proof',0)->>'total')::int=2,'Unassigned discovery includes both descendants');
select pg_temp.ok((public.list_unassigned_official_topics(pg_temp.id(10),'proof child',0)#>>'{topics,0,concept_count}')::int=1,'Unassigned search retains Concept association');
select pg_temp.ok((public.list_unassigned_official_topics(pg_temp.id(10),'proof child',0)#>>'{topics,0,question_count}')::int=1,'Unassigned search retains Question association');
select pg_temp.reject(format('select pg_temp.detach(%L)',(select value from saved where key='parent')),'22023','duplicate removal rejected without side effects');
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
select pg_temp.ok(not exists(select 1 from public.resolve_study_deck(pg_temp.id(90)) where concept_id=pg_temp.id(150)),'detached canonical content excluded from Study');
select pg_temp.ok(not exists(select 1 from jsonb_array_elements(public.get_home_study_bootstrap(pg_temp.id(10),pg_temp.id(90))#>'{location_selection,states}') s where s->>'topic_id'=(select value::text from saved where key='child')),'Home selection excludes retained inactive locations');
select pg_temp.ok(not exists(select 1 from jsonb_array_elements(public.get_library_learner_progress(pg_temp.id(10))->'nodes') n where n->>'library_node_id'=(select value::text from saved where key='child')),'Stats excludes detached locations without deleting evidence');
select pg_temp.ok(not exists(select 1 from jsonb_array_elements(public.get_study_advisor(pg_temp.id(10))->'topics') t where t->>'path' like '%Detachment proof child%'),'Advisor excludes detached locations');
select pg_temp.ok((select (g#>>'{progress,total_concepts}')::int=0 from jsonb_array_elements(public.get_study_goals(pg_temp.id(10))->'goals') g where g->>'id'=(select value::text from saved where key='goal')),'Goals retain saved scope without detached Study eligibility');
reset role;
select pg_temp.ok(not exists(select * from protected_before except select * from pg_temp.fingerprints()),'all non-placement tables unchanged after subtree removal');
select pg_temp.ok(not exists(select 1 from locations_before b join public.official_topic_locations a using(id) where b.id not in(select value from saved where key in('parent','child','grandchild')) and to_jsonb(a)<>to_jsonb(b)),'other shared branches byte-identical');
select pg_temp.ok((select count(*) from public.official_topic_locations)=(select count(*) from locations_before),'removed location records retained');
-- Authorization failures cannot mutate even retained records.
set local role authenticated;
select pg_temp.reject(format('select pg_temp.detach(%L)',pg_temp.id(23)),'42501','Learner detachment denied');
select pg_temp.reject(format('select public.list_unassigned_official_topics(%L)',pg_temp.id(10)),'42501','Learner Unassigned management denied');
select pg_temp.reject(format('select public.reassign_official_topic(%L,%L,%L,pg_temp.rev())',pg_temp.id(10),(select value from saved where key='child'),pg_temp.id(26)),'42501','Learner reassignment denied');
select pg_temp.reject(format('delete from public.official_topic_locations where id=%L',pg_temp.id(23)),'42501','browser DELETE privilege absent');
select set_config('request.jwt.claim.sub',pg_temp.id(4)::text,true);
select pg_temp.reject(format('select pg_temp.detach(%L)',pg_temp.id(23)),'42501','Editor detachment denied');
select pg_temp.reject(format('select public.list_unassigned_official_topics(%L)',pg_temp.id(10)),'42501','Editor Unassigned management denied');
select set_config('request.jwt.claim.sub','',true);
set local role anon;
select pg_temp.reject(format('select public.review_official_topic_detachment(%L,%L)',pg_temp.id(10),pg_temp.id(23)),'42501','anonymous RPC denied');
set local role service_role;
select pg_temp.reject(format('select public.detach_official_topic_location(%L,%L,''x'')',pg_temp.id(10),pg_temp.id(23)),'42501','service-token detachment denied');
reset role;
savepoint inactive;
insert into public.account_deletion_state(user_id,state,receipt_hash,requested_at) values(pg_temp.id(1),'pending',repeat('a',64),now()) on conflict(user_id) do update set state='pending',receipt_hash=repeat('a',64),requested_at=now();
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
set local role authenticated;
select pg_temp.reject(format('select pg_temp.detach(%L)',pg_temp.id(23)),'42501','inactive Admin denied');
\o
select 'Inactive Admin denial passed' as result;
\o /dev/null
rollback to inactive;
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
set local role authenticated;
select pg_temp.reject(format('select public.reassign_official_topic(%L,%L,%L,pg_temp.rev())',pg_temp.id(10),(select value from saved where key='child'),pg_temp.id(30)),'42501','cross-Library reassignment denied');
select pg_temp.reject(format('select public.reassign_official_topic(%L,%L,%L,pg_temp.rev())',pg_temp.id(10),(select value from saved where key='child'),(select value from saved where key='grandchild')),'42501','inactive descendant destination denied');
select pg_temp.reject(format('select public.reassign_official_topic(%L,%L,%L,''stale'')',pg_temp.id(10),(select value from saved where key='child'),pg_temp.id(26)),'PT409','stale reassignment denied');
insert into saved values('reassigned',(public.reassign_official_topic(pg_temp.id(10),(select value from saved where key='child'),pg_temp.id(26),pg_temp.rev())->>'location_id')::uuid);
select pg_temp.ok((select value from saved where key='child')<>(select value from saved where key='reassigned'),'reassignment does not revive old selection identity');
select pg_temp.ok((public.list_unassigned_official_topics(pg_temp.id(10),'Detachment proof',0)->>'total')::int=1,'former children remain explicitly Unassigned');
select pg_temp.reject(format('select public.reassign_official_topic(%L,%L,%L,pg_temp.rev())',pg_temp.id(10),(select value from saved where key='child'),pg_temp.id(26)),'22023','duplicate reassignment rejected');
select pg_temp.reject(format('select public.change_official_topic_location(%L,%L,%L,''move'',''this'',false,null,pg_temp.rev())',pg_temp.id(10),pg_temp.id(26),(select value from saved where key='reassigned')),'23514','cycle rejected after reassignment');
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
select pg_temp.ok(not exists(select 1 from public.resolve_study_deck(pg_temp.id(90)) where concept_id=pg_temp.id(150)),'new unselected parent does not restore old explicit inclusion');
reset role;
select pg_temp.ok(not exists(select * from protected_before except select * from pg_temp.fingerprints()),'all non-placement tables unchanged after reassignment');
select pg_temp.ok((select new_mastery_balance=43 from public.study_deck_node_preferences where deck_id=pg_temp.id(90) and library_node_id=(select value from saved where key='child')),'stored non-default preference survives removal and reassignment');
set local role authenticated;
select public.set_study_deck_location_selection(pg_temp.id(90),(select value from saved where key='reassigned'),true,pg_temp.rev());
select pg_temp.ok(exists(select 1 from public.resolve_study_deck(pg_temp.id(90)) where concept_id=pg_temp.id(150)),'reassigned content studies through normal explicit selection');
reset role;
select pg_temp.ok(not exists(select 1 from functions_before where hash<>md5(pg_get_functiondef(oid))),'algorithms and Inbox deletion unchanged');
-- Trusted maintenance is still permitted; no-op DELETE triggers execute safely.
select set_config('request.jwt.claim.sub','',true);
delete from public.official_topic_locations where false;
delete from public.library_nodes where false;
select pg_temp.ok(true,'trusted maintenance remains available');
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
select pg_temp.reject('delete from public.library_nodes where false','42501','legacy canonical DELETE blocked even with Admin JWT');
set local role authenticated;
insert into saved values('legacy-empty',(public.create_official_topic_at_location(pg_temp.id(10),pg_temp.id(26),'Legacy deletion guard proof','this',pg_temp.rev())->>'topic_id')::uuid);
select pg_temp.reject(format('select public.delete_official_topic_with_impact(%L,%L,public.get_official_topic_delete_impact(%L,%L)->>''revision'')',pg_temp.id(10),(select value from saved where key='legacy-empty'),pg_temp.id(10),(select value from saved where key='legacy-empty')),'42501','old canonical deletion RPC cannot bypass retention');
select pg_temp.ok(exists(select 1 from public.library_nodes where id=(select value from saved where key='legacy-empty')),'blocked legacy RPC preserves canonical identity');
reset role;
select public.m132_check_locations(id) from public.libraries;
set constraints all immediate;
\o
select jsonb_build_object('passed',count(*),'checks',jsonb_agg(label order by label)) from checks;
rollback;
