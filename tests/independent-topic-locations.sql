-- Disposable synthetic fixture only; every proof transaction rolls back.
\set ON_ERROR_STOP on
begin;
\o /dev/null
do $$ begin
 if current_database() !~ '^locations132_' or exists(select 1 from auth.users where email not like 'zz-shared122-%@example.invalid') then
 raise exception 'Dedicated synthetic locations132 database required'; end if;
end $$;
create function pg_temp.id(n integer) returns uuid language sql immutable as $$ select ('12200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create temp table checks(label text primary key);
grant insert,select on checks to authenticated,anon;
create function pg_temp.ok(value boolean,label text) returns void language plpgsql as $$begin if value is distinct from true then raise exception 'FAILED: %',label;end if;insert into checks values(label);end$$;
create function pg_temp.reject(statement text,state text,label text) returns void language plpgsql as $$declare failed boolean:=false;begin begin execute statement;exception when others then if sqlstate<>state then raise exception 'FAILED %: expected %, got %: %',label,state,sqlstate,sqlerrm;end if;failed:=true;end;perform pg_temp.ok(failed,label);end$$;
create function pg_temp.revision() returns text language sql as $$select public.get_official_topic_graph(pg_temp.id(10))->>'revision'$$;
create function pg_temp.change(source uuid,dest uuid,action text,scope text default 'this',children boolean default false,before_id uuid default null) returns jsonb language sql as $$
select public.change_official_topic_location(pg_temp.id(10),source,dest,action,scope,children,before_id,pg_temp.revision())$$;
create temp table saved(key text primary key,value uuid);
grant all on saved to authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
insert into public.user_concept_mastery(user_id,concept_id,mastery_estimate,retrievability,stability,uncertainty,evidence_count,last_exposure_at,last_result)
values(pg_temp.id(2),pg_temp.id(50),0.8,0.8,0.7,0.2,5,now(),'easy');
create temp table history_before as select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]')::text) hash from public.user_concept_mastery x;
create temp table algorithm_before as select md5(pg_get_functiondef('public.select_next_study_question_hardened(uuid,boolean)'::regprocedure)) hash;
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
set local role authenticated;
select pg_temp.change(pg_temp.id(21),pg_temp.id(26),'duplicate');
insert into saved select 'alias',id from public.official_topic_locations where topic_id=pg_temp.id(21) and parent_location_id=pg_temp.id(26);
select pg_temp.ok(not exists(select 1 from public.official_topic_locations where parent_location_id=(select value from saved where key='alias')),'Topic Only has no copied children');
select pg_temp.change(pg_temp.id(25),(select value from saved where key='alias'),'duplicate');
select pg_temp.ok((select count(*)=2 from public.official_topic_locations where topic_id=pg_temp.id(21)),'same canonical Topic in two locations');
select pg_temp.change(pg_temp.id(21),pg_temp.id(24),'duplicate','this',true);
insert into saved select 'full',id from public.official_topic_locations where topic_id=pg_temp.id(21) and parent_location_id=pg_temp.id(24);
select pg_temp.ok((select count(*)=2 from public.official_topic_locations where parent_location_id=(select value from saved where key='full')),'Include Children duplicates structure');
select pg_temp.ok((select count(*)=8 from public.library_nodes),'duplicates do not copy canonical Topics');
select pg_temp.reject(format('select pg_temp.change(%L,%L,''duplicate'')',pg_temp.id(21),pg_temp.id(22)),'23514','cycle rejected');
select pg_temp.reject(format('select pg_temp.change(%L,%L,''duplicate'')',pg_temp.id(21),pg_temp.id(24)),'23505','duplicate sibling rejected atomically');
select pg_temp.reject(format('select pg_temp.change(%L,%L,''duplicate'')',pg_temp.id(21),pg_temp.id(30)),'42501','cross-Library destination rejected');
select pg_temp.reject(format('select public.change_official_topic_location(%L,%L,%L,''move'',''this'',false,null,''stale'')',pg_temp.id(10),pg_temp.id(21),pg_temp.id(24)),'PT409','stale mutation rejected');
select public.create_official_topic_at_location(pg_temp.id(10),pg_temp.id(21),'Everywhere child','all',pg_temp.revision());
select pg_temp.ok((select count(*)=3 from public.official_topic_locations l join public.library_nodes n on n.id=l.topic_id where n.name='Everywhere child'),'all-location child creation');
select public.create_official_topic_at_location(pg_temp.id(10),(select value from saved where key='alias'),'Only here child','this',pg_temp.revision());
select pg_temp.ok((select count(*)=1 from public.official_topic_locations l join public.library_nodes n on n.id=l.topic_id where n.name='Only here child'),'single-location child creation');
select pg_temp.change((select l.id from public.official_topic_locations l join public.library_nodes n on n.id=l.topic_id where n.name='Everywhere child' and l.parent_location_id=pg_temp.id(21)),null,'remove');
select pg_temp.ok((select count(*)=2 from public.official_topic_locations l join public.library_nodes n on n.id=l.topic_id where n.name='Everywhere child'),'remove one child location preserves siblings');
select pg_temp.reject(format('select pg_temp.change(%L,null,''remove'')',(select value from saved where key='alias')),'23514','final descendant cannot be orphaned');
-- A move retains the chosen location identity and changes only its parent.
select pg_temp.change(pg_temp.id(23),pg_temp.id(26),'move');
select pg_temp.ok((select parent_location_id=pg_temp.id(26) from public.official_topic_locations where id=pg_temp.id(23)),'move preserves location identity');
select pg_temp.ok(exists(select 1 from public.official_topic_locations where topic_id=pg_temp.id(23) and parent_location_id=(select value from saved where key='full')),'move does not silently synchronize other child structures');
-- Explicit all-location operations either preserve every structure or roll back.
savepoint all_scope;
select public.create_official_topic_at_location(pg_temp.id(10),pg_temp.id(21),'Shared destination','all',pg_temp.revision());
select pg_temp.change((select l.id from public.official_topic_locations l join public.library_nodes n on n.id=l.topic_id where n.name='Everywhere child' order by l.id limit 1),
 (select d.id from public.official_topic_locations d join public.library_nodes n on n.id=d.topic_id where n.name='Shared destination' and d.parent_location_id=
  (select l.parent_location_id from public.official_topic_locations l join public.library_nodes n on n.id=l.topic_id where n.name='Everywhere child' order by l.id limit 1)),
 'move','all');
select pg_temp.ok((select count(*)=2 from public.official_topic_locations l join public.library_nodes n on n.id=l.topic_id
 join public.official_topic_locations p on p.id=l.parent_location_id join public.library_nodes pn on pn.id=p.topic_id
 where n.name='Everywhere child' and pn.name='Shared destination'),'all-location reparent preserves each matched child structure');
select pg_temp.change((select l.id from public.official_topic_locations l where l.topic_id=pg_temp.id(23) and l.parent_location_id=(select value from saved where key='full')),null,'remove','all');
select pg_temp.ok((select count(*)=1 from public.official_topic_locations where topic_id=pg_temp.id(23)),'all-location removal preserves outside canonical location');
select pg_temp.change((select d.id from public.official_topic_locations d join public.library_nodes n on n.id=d.topic_id where n.name='Shared destination' and d.parent_location_id=pg_temp.id(21)),pg_temp.id(21),'move','all');
select pg_temp.ok((select count(*)=3 from public.official_topic_locations l join public.library_nodes n on n.id=l.topic_id where n.name='Shared destination'),'all-location reorder preserves locations');
insert into saved values('conflict-revision',md5(pg_temp.revision())::uuid);
select pg_temp.reject(format('select pg_temp.change(%L,%L,''duplicate'',''all'',true)',pg_temp.id(25),pg_temp.id(21)),'23505','conflicting all-location duplicate rejected');
select pg_temp.ok((select value from saved where key='conflict-revision')=md5(pg_temp.revision())::uuid,'failed multi-location operation rolls back every parent');
\o
select jsonb_build_object('all_scope_passed',count(*),'checks',jsonb_agg(label order by label)) from checks where label like 'all-location%' and label<>'all-location child creation' or label in ('conflicting all-location duplicate rejected','failed multi-location operation rolls back every parent');
\o /dev/null
rollback to all_scope;
-- Official placement authoring is Admin-only; legacy Editors remain denied.
select set_config('request.jwt.claim.sub',pg_temp.id(4)::text,true);
select pg_temp.reject(format('select public.create_official_topic_at_location(%L,%L,''Editor child'',''this'',pg_temp.revision())',pg_temp.id(10),pg_temp.id(26)),'42501','Editor cannot create official locations');
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
select pg_temp.reject(format('select pg_temp.change(%L,%L,''duplicate'')',pg_temp.id(21),pg_temp.id(26)),'42501','learner cannot change official locations');
select pg_temp.reject(format('delete from public.official_topic_locations where id=%L',pg_temp.id(21)),'42501','no direct browser placement writes');
select pg_temp.reject(format('select public.set_study_deck_location_selection(%L,%L,true,%L)',pg_temp.id(91),pg_temp.id(21),pg_temp.revision()),'42501','cross-account selection denied');
select public.set_study_deck_location_selection(pg_temp.id(90),pg_temp.id(20),false,pg_temp.revision());
select public.set_study_deck_location_selection(pg_temp.id(90),(select value from saved where key='alias'),true,pg_temp.revision());
select pg_temp.ok((select array_agg(concept_id order by concept_id)=array[pg_temp.id(50)] from public.resolve_study_deck(pg_temp.id(90))),'selected alias includes only its own descendant material');
select pg_temp.ok(not exists(select 1 from jsonb_array_elements(public.get_home_study_bootstrap(pg_temp.id(10),pg_temp.id(90))#>'{location_selection,states}') s where s->>'topic_id'=pg_temp.id(22)::text and (s->>'included')::boolean),'other-location-only child excluded');
select public.set_study_deck_location_selection(pg_temp.id(90),pg_temp.id(21),true,pg_temp.revision());
select pg_temp.ok((select count(*)=2 and count(distinct concept_id)=2 from public.resolve_study_deck(pg_temp.id(90))),'overlapping selections deduplicate canonical Concepts');
select pg_temp.ok((select count(*)=2 from public.get_library_learner_progress(pg_temp.id(10)) h,jsonb_array_elements(h->'nodes') n where n->>'library_node_id' in (pg_temp.id(25)::text,(select id::text from public.official_topic_locations where topic_id=pg_temp.id(25) and parent_location_id=(select value from saved where key='alias'))) and (n->>'assessed_mastery_percent')::numeric=80),'mastery appears at every location without copies');
insert into saved select 'goal',public.save_placement_study_goal(pg_temp.id(10),'Only alias',current_date+30,'coverage',array[(select value from saved where key='alias')],'{}');
reset role;
select pg_temp.ok(not exists(select 1 from public.m123_goal_items((select value from saved where key='goal')) where kind='personal' and id in(pg_temp.id(80),pg_temp.id(82))),'Goal excludes personal descendants anchored at another location');
set local role authenticated;
select pg_temp.ok((select (g#>>'{progress,total_concepts}')::integer=1 from jsonb_array_elements(public.get_study_goals(pg_temp.id(10))->'goals') g where g->>'id'=(select value::text from saved where key='goal')),'Goal scope follows selected location');
select pg_temp.ok(exists(select 1 from jsonb_array_elements(public.get_study_advisor(pg_temp.id(10))->'topics') t where t->>'path' like '%Unrelated branch%Branch A%Leaf B' and (t->>'selected')::boolean),'Advisor identifies selected location with shared evidence');
-- Canonical preferences stay shared; descendant reset scope follows the location.
select public.set_study_deck_location_preference(pg_temp.id(90),pg_temp.id(10),(select value from saved where key='alias'),70,
 public.get_home_study_bootstrap(pg_temp.id(10),pg_temp.id(90))#>>'{unified_deck_settings,topic_preference_state,revision}');
select pg_temp.ok((select new_mastery_balance=70 from public.study_deck_node_preferences where deck_id=pg_temp.id(90) and library_node_id=pg_temp.id(25)),'preference reset reaches this location descendants');
select pg_temp.ok(not exists(select 1 from public.study_deck_node_preferences where deck_id=pg_temp.id(90) and library_node_id=pg_temp.id(22) and new_mastery_balance=70),'preference reset excludes other-location-only children');
select pg_temp.reject('select public.m132_location_states('''||pg_temp.id(91)||''')','42501','internal cross-owner helper not exposed');
select set_config('request.jwt.claim.sub','',true);
set local role anon;
select pg_temp.reject('select * from public.official_topic_locations','42501','anonymous location access denied');
reset role;
select pg_temp.ok((select hash from history_before)=(select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]')::text) from public.user_concept_mastery x),'learning evidence unchanged');
select pg_temp.ok((select hash from algorithm_before)=md5(pg_get_functiondef('public.select_next_study_question_hardened(uuid,boolean)'::regprocedure)),'scheduler coefficients and implementation unchanged');
-- Released destructive workflows remain safe beside independent locations.
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
set local role authenticated;
select public.create_official_topic_at_location(pg_temp.id(10),pg_temp.id(21),'Only here child','this',pg_temp.revision());
set constraints all immediate;
select pg_temp.ok((select count(distinct n.id)=2 from public.library_nodes n join public.official_topic_locations l on l.topic_id=n.id where n.name='Only here child'),'independent parents may have different canonical children with the same name');
select pg_temp.ok(jsonb_array_length(public.get_official_topic_delete_impact(pg_temp.id(10),pg_temp.id(21))#>'{blockers,independent_locations}')>0,'canonical deletion reports independent structures instead of silently deleting them');
set constraints all deferred;
insert into saved select 'empty-delete', (public.create_official_topic_at_location(pg_temp.id(10),pg_temp.id(26),'Empty deletion compatibility','this',pg_temp.revision())->>'topic_id')::uuid;
select public.delete_official_topic_with_impact(pg_temp.id(10),(select value from saved where key='empty-delete'),public.get_official_topic_delete_impact(pg_temp.id(10),(select value from saved where key='empty-delete'))->>'revision');
select pg_temp.ok(not exists(select 1 from public.library_nodes where id=(select value from saved where key='empty-delete')) and not exists(select 1 from public.official_topic_locations where topic_id=(select value from saved where key='empty-delete')),'existing explicit deletion of an empty unshared Topic still works');
reset role;
\o
select jsonb_build_object('passed',count(*),'checks',jsonb_agg(label order by label)) from checks;
rollback;
