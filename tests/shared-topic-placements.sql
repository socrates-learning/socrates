-- Run only with the synthetic shared-topic-placements fixture, inside a
-- transaction owned by the disposable proof runner. No hosted targets.
\set ON_ERROR_STOP on
do $$ begin
 if current_database() !~ '^shared122_' then raise exception 'Isolated shared122 database required';end if;
 if exists(select 1 from auth.users where email not like 'zz-shared122-%@example.invalid') then raise exception 'Synthetic users required';end if;
end $$;
create or replace function pg_temp.id(n integer) returns uuid language sql immutable as $$
 select ('12200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
create temporary table checks(label text primary key,passed boolean not null);
grant insert,select on checks to authenticated,anon;
create function pg_temp.ok(value boolean,label text) returns void language plpgsql as $$
begin
 if value is distinct from true then raise exception 'FAILED: %',label;end if;
 insert into checks values(label,true);
end $$;
create function pg_temp.reject(statement text,state text,label text) returns void language plpgsql as $$
declare rejected boolean:=false;
begin
 begin execute statement;
 exception when others then
  if sqlstate is distinct from state then raise exception 'FAILED: % expected %, received %: %',label,state,sqlstate,sqlerrm;end if;
  rejected:=true;
 end;
 perform pg_temp.ok(rejected,label);
end $$;

-- Nothing changes on installation: including the released revision and source
-- grouping, session projection, candidates and Home available-material counts.
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
select pg_temp.ok(public.m117_preference_state(pg_temp.id(90))=(select value from baseline_outputs where label='preferences'),'zero-edge preferences and revision unchanged');
select pg_temp.ok(public.get_home_study_bootstrap(pg_temp.id(10),pg_temp.id(90))=(select value from baseline_outputs where label='home'),'zero-edge Home unchanged');
select pg_temp.ok(public.get_library_learner_progress(pg_temp.id(10))=(select value from baseline_outputs where label='progress'),'zero-edge progress unchanged');
select pg_temp.ok((select jsonb_agg(to_jsonb(c) order by c.candidate_type,c.candidate_id) from public.resolve_study_candidates(pg_temp.id(90)) c)=(select value from baseline_outputs where label='candidates'),'zero-edge candidates unchanged');
select pg_temp.ok(not exists(select 1 from public.study_deck_node_preferences where shared_compatibility_source is not null),'no migration preference backfill');

-- Probe the installed scheduler's actual source-resolution CTEs, not a second
-- implementation of its averaging or most-specific-source rules.
create function pg_temp.balances(snapshot jsonb) returns jsonb language plpgsql as $$
declare body text; query text; result jsonb; begin
 body:=pg_get_functiondef('public.select_next_study_question_hardened(uuid,boolean)'::regprocedure);
 body:=substring(body from strpos(body,'  selected_node_ids as ('));
 body:=left(body,strpos(body,'  -- Keep the Library-wide Question pass narrow.')-1);
 body:=regexp_replace(body,',\s*$','');
 body:=replace(body,'target_session.selection_snapshot',format('%L::jsonb',snapshot));
 body:=replace(body,'target_session.library_id',format('%L::uuid',pg_temp.id(10)));
 query:='with recursive eligible_concepts as (select * from public.resolve_study_deck('||quote_literal(pg_temp.id(90))||')), '||body||' select jsonb_object_agg(concept_id,branch_balance) from concept_balances';
 execute query into result;return result;
end $$;
create function pg_temp.snapshot() returns jsonb language sql as $$
 select jsonb_build_object('selected_node_ids',h->'selected_node_ids','excluded_node_ids',h->'excluded_node_ids','node_preferences',h->'node_preferences','unified_deck_settings',h->'unified_deck_settings') from (select public.get_home_study_bootstrap(pg_temp.id(10),pg_temp.id(90)) h) q
$$;
-- Read contribution groups from the installed selector's same CTEs as the
-- numeric proof. Equal numeric results cannot conceal lost or duplicate groups.
create function pg_temp.contributions(snapshot jsonb) returns jsonb language plpgsql as $$
declare body text; result jsonb; begin
 body:=pg_get_functiondef('public.select_next_study_question_hardened(uuid,boolean)'::regprocedure);
 body:=substring(body from strpos(body,'  selected_node_ids as ('));
 body:=left(body,strpos(body,'  -- Keep the Library-wide Question pass narrow.')-1);
 body:=regexp_replace(body,',\s*$','');
 body:=replace(body,'target_session.selection_snapshot',format('%L::jsonb',snapshot));
 body:=replace(body,'target_session.library_id',format('%L::uuid',pg_temp.id(10)));
 execute 'with recursive eligible_concepts as (select * from public.resolve_study_deck('||quote_literal(pg_temp.id(90))||')), '||body||
  ' select jsonb_object_agg(concept_id,items) from (select concept_id,jsonb_agg(jsonb_build_object(''source'',source_key,''balance'',branch_balance) order by source_key,branch_balance) items from most_specific_sources group by concept_id) x' into result;
 return result;
end $$;
create function pg_temp.balance(topic integer,value integer) returns void language plpgsql as $$
declare actor text:=current_setting('request.jwt.claim.sub',true);begin
 perform set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
 perform public.set_study_deck_topic_subtree_preference(pg_temp.id(90),pg_temp.id(10),'official:topic:'||pg_temp.id(topic),value,public.m117_preference_state(pg_temp.id(90))->>'revision');
 perform set_config('request.jwt.claim.sub',actor,true);
end $$;
create function pg_temp.share(topic integer,parent integer) returns text language plpgsql as $$
declare actor text:=current_setting('request.jwt.claim.sub',true); edge text;begin
 perform set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
 perform public.add_official_topic_placement(pg_temp.id(10),pg_temp.id(topic),pg_temp.id(parent),null,public.get_official_topic_graph(pg_temp.id(10))->>'revision');
 select edge_key into edge from public.m122_edges(pg_temp.id(10)) where topic_id=pg_temp.id(topic) and parent_id=pg_temp.id(parent);
 perform set_config('request.jwt.claim.sub',actor,true);return edge;
end $$;
create function pg_temp.move(edge text,destination integer) returns void language plpgsql as $$
declare actor text:=current_setting('request.jwt.claim.sub',true);parent uuid;begin
 perform set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
 select parent_id into parent from public.m122_edges(pg_temp.id(10)) where edge_key=edge;
 perform public.position_official_topic_placement(pg_temp.id(10),edge,parent,pg_temp.id(destination),null,
  (select coalesce(array_agg(edge_key order by sort_order,edge_key),'{}') from public.m122_edges(pg_temp.id(10)) where parent_id=parent),
  (select coalesce(array_agg(edge_key order by sort_order,edge_key),'{}') from public.m122_edges(pg_temp.id(10)) where parent_id=pg_temp.id(destination)),
  public.get_official_topic_graph(pg_temp.id(10))->>'revision');
 perform set_config('request.jwt.claim.sub',actor,true);
end $$;
create function pg_temp.remove(edge text,replacement text default null) returns void language plpgsql as $$
declare actor text:=current_setting('request.jwt.claim.sub',true);begin
 perform set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
 perform public.remove_official_topic_placement(pg_temp.id(10),edge,replacement,public.get_official_topic_graph(pg_temp.id(10))->>'revision');
 perform set_config('request.jwt.claim.sub',actor,true);
end $$;
create function pg_temp.independent() returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
 perform public.set_study_deck_node_selection(pg_temp.id(90),pg_temp.id(20),false);
 perform public.set_study_deck_node_selection(pg_temp.id(90),pg_temp.id(21),true);
 perform public.set_study_deck_node_selection(pg_temp.id(90),pg_temp.id(24),true);
 perform public.set_study_deck_node_selection(pg_temp.id(90),pg_temp.id(26),true);
 perform pg_temp.balance(24,80);perform pg_temp.balance(21,60);
end $$;
create function pg_temp.same_sources(label text) returns void language plpgsql as $$
begin
 perform pg_temp.ok(pg_temp.balances(pg_temp.snapshot())=(select balances from source_before),label||': balances');
 perform pg_temp.ok(pg_temp.contributions(pg_temp.snapshot())=(select sources from source_before),label||': contribution groups');
end $$;

savepoint stage1_proof_start;
savepoint first_share_weighting;
set local role authenticated;
select public.set_study_deck_node_selection(pg_temp.id(90),pg_temp.id(20),false);
select public.set_study_deck_node_selection(pg_temp.id(90),pg_temp.id(21),true);
select public.set_study_deck_node_selection(pg_temp.id(90),pg_temp.id(24),true);
select public.set_study_deck_topic_subtree_preference(pg_temp.id(90),pg_temp.id(10),'official:topic:'||pg_temp.id(21),60,public.get_home_study_bootstrap(pg_temp.id(10),pg_temp.id(90))#>>'{unified_deck_settings,topic_preference_state,revision}') is not null;
select public.set_study_deck_topic_subtree_preference(pg_temp.id(90),pg_temp.id(10),'official:topic:'||pg_temp.id(24),80,public.get_home_study_bootstrap(pg_temp.id(10),pg_temp.id(90))#>>'{unified_deck_settings,topic_preference_state,revision}') is not null;
reset role;
create temporary table incomparable_before as select pg_temp.balances(pg_temp.snapshot()) value;
select pg_temp.ok((select (value->>pg_temp.id(50)::text)::numeric=70 from incomparable_before),'released incomparable source average is 70');
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
select public.add_official_topic_placement(pg_temp.id(10),pg_temp.id(22),pg_temp.id(24),null,public.get_official_topic_graph(pg_temp.id(10))->>'revision') is not null;
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
select (select value from incomparable_before) as before_sharing,
 pg_temp.balances(pg_temp.snapshot()) as after_sharing;
select pg_temp.ok(pg_temp.balances(pg_temp.snapshot())=(select value from incomparable_before),'first sharing preserves incomparable source weighting');
rollback to first_share_weighting;
select pg_temp.ok(true,'first sharing preserves incomparable source weighting');

-- Structural preservation: first/additional placement, edge-specific move,
-- removal, canonical promotion and return to one location preserve both source
-- groups and their balances, including a single-placement Concept and Card.
savepoint provenance_matrix;
select pg_temp.independent();
create temporary table source_before as select pg_temp.balances(pg_temp.snapshot()) balances,pg_temp.contributions(pg_temp.snapshot()) sources;
select pg_temp.ok((select jsonb_array_length(sources->pg_temp.id(50)::text)=2 and jsonb_array_length(sources->pg_temp.id(51)::text)=1 from source_before),'independent baseline has two groups and single-placement has one');
create temporary table test_edges(label text primary key,edge text);
insert into test_edges values('first',pg_temp.share(22,24));
select pg_temp.same_sources('first placement 60/80 remains 70 and single source remains 60');
select pg_temp.ok((select source_key=(public.m117_preference_state(pg_temp.id(90))#>>array['projection','official',pg_temp.id(22)::text,'source']) and balance=60 from public.m122_card_official_sources(pg_temp.id(81),pg_temp.snapshot()->'unified_deck_settings')),'standalone Card retains one original official contribution');
insert into test_edges values('additional',pg_temp.share(22,26));
select pg_temp.same_sources('additional placement');
select pg_temp.move((select edge from test_edges where label='additional'),25);
select pg_temp.same_sources('moving additional placement');
select pg_temp.remove((select edge from test_edges where label='additional'));
select pg_temp.same_sources('removing additional placement');
select pg_temp.remove('primary:'||pg_temp.id(22),(select edge from test_edges where label='first'));
select pg_temp.same_sources('original-location promotion and return to one location');
select pg_temp.ok(not exists(select 1 from public.official_topic_placements),'promotion returns to one placement');
select pg_temp.move('primary:'||pg_temp.id(22),26);
select pg_temp.same_sources('moving surviving original placement');
select pg_temp.ok((select shared_compatibility_source->>'version'='1' and shared_compatibility_source->>'origin'=pg_temp.id(21)::text
 and not exists(select 1 from jsonb_array_elements(shared_compatibility_source->'ancestors') a where a->>'origin'=pg_temp.id(24)::text)
 from public.study_deck_node_preferences where deck_id=pg_temp.id(90) and library_node_id=pg_temp.id(22)),'independent ancestry is not fabricated by new parent');
select jsonb_agg(to_jsonb(c)) as saved_checks from checks c \gset
rollback to provenance_matrix;
insert into checks select * from jsonb_to_recordset(:'saved_checks'::jsonb) x(label text,passed boolean) on conflict do nothing;

-- Histories formerly collided in the identity-only text representation. After
-- an identical final canonical A-under-B graph, independent and subordinate
-- source relationships must remain different in the persisted provenance.
savepoint provenance_histories;
select pg_temp.independent();
create temporary table source_before as select pg_temp.balances(pg_temp.snapshot()) balances,pg_temp.contributions(pg_temp.snapshot()) sources;
create temporary table promoted_edge as select pg_temp.share(21,24) edge;
select pg_temp.remove('primary:'||pg_temp.id(21),(select edge from promoted_edge));
select pg_temp.same_sources('independent ancestors remain independent after promotion');
select pg_temp.ok((pg_temp.balances(pg_temp.snapshot())->>pg_temp.id(50)::text)::numeric=70,'independent promoted result is 70');
select jsonb_agg(to_jsonb(c)) as saved_checks from checks c \gset
rollback to provenance_histories;
insert into checks select * from jsonb_to_recordset(:'saved_checks'::jsonb) x(label text,passed boolean) on conflict do nothing;
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
select public.move_library_node_in_library(pg_temp.id(10),pg_temp.id(21),pg_temp.id(24)) is not null;
select pg_temp.independent();
create temporary table source_before as select pg_temp.balances(pg_temp.snapshot()) balances,pg_temp.contributions(pg_temp.snapshot()) sources;
select pg_temp.ok((select (balances->>pg_temp.id(50)::text)::numeric=60 and jsonb_array_length(sources->pg_temp.id(50)::text)=1 from source_before),'subordinate baseline is 60 from one surviving group');
create temporary table promoted_edge as select pg_temp.share(21,20) edge;
select pg_temp.same_sources('subordinate sources after first placement');
select pg_temp.remove((select edge from promoted_edge));
select pg_temp.same_sources('subordinate sources after removal and return to single');
select pg_temp.ok((select exists(select 1 from jsonb_array_elements(shared_compatibility_source->'ancestors') a where a->>'source'=public.m117_preference_state(pg_temp.id(90))#>>array['projection','official',pg_temp.id(24)::text,'source'])
 from public.study_deck_node_preferences where deck_id=pg_temp.id(90) and library_node_id=pg_temp.id(21)),'subordinate source retains original ancestor source group');
select jsonb_agg(to_jsonb(c)) as saved_checks from checks c \gset
rollback to provenance_histories;
insert into checks select * from jsonb_to_recordset(:'saved_checks'::jsonb) x(label text,passed boolean) on conflict do nothing;

savepoint equal_and_multiple;
select pg_temp.independent();
select pg_temp.balance(24,60);
create temporary table source_before as select pg_temp.balances(pg_temp.snapshot()) balances,pg_temp.contributions(pg_temp.snapshot()) sources;
select pg_temp.share(22,24);
select pg_temp.same_sources('equal parents preserve two independent votes');
select pg_temp.ok(jsonb_array_length(pg_temp.contributions(pg_temp.snapshot())->pg_temp.id(50)::text)=2,'equal values do not collapse independent groups');
select jsonb_agg(to_jsonb(c)) as saved_checks from checks c \gset
rollback to equal_and_multiple;
insert into checks select * from jsonb_to_recordset(:'saved_checks'::jsonb) x(label text,passed boolean) on conflict do nothing;
select pg_temp.independent();
select pg_temp.balance(26,20);
insert into public.concept_placements(concept_id,library_node_id,sort_order) values(pg_temp.id(50),pg_temp.id(26),0);
create temporary table source_before as select pg_temp.balances(pg_temp.snapshot()) balances,pg_temp.contributions(pg_temp.snapshot()) sources;
select pg_temp.ok((select jsonb_array_length(sources->pg_temp.id(50)::text)=3 and abs((balances->>pg_temp.id(50)::text)::numeric-160::numeric/3)<0.000000001 from source_before),'three independent groups retain equal weighting');
select pg_temp.share(22,26);
select pg_temp.share(22,24);
select pg_temp.same_sources('multiple independent sources with additional placements');
select jsonb_agg(to_jsonb(c)) as saved_checks from checks c \gset
rollback to equal_and_multiple;
insert into checks select * from jsonb_to_recordset(:'saved_checks'::jsonb) x(label text,passed boolean) on conflict do nothing;

savepoint deliberate_resets;
select pg_temp.independent();
select pg_temp.share(22,24);
select pg_temp.balance(24,70);
select pg_temp.ok((pg_temp.balances(pg_temp.snapshot())->>pg_temp.id(50)::text)::numeric=65
 and (pg_temp.balances(pg_temp.snapshot())->>pg_temp.id(51)::text)::numeric=70,'explicit parent reset replaces shared child value and leaves independent A value');
select pg_temp.ok(jsonb_array_length(pg_temp.contributions(pg_temp.snapshot())->pg_temp.id(50)::text)=2,'reset parent is one group across all its placements');
select pg_temp.balance(22,20);
select pg_temp.ok((pg_temp.balances(pg_temp.snapshot())->>pg_temp.id(50)::text)::numeric=20
 and jsonb_array_length(pg_temp.contributions(pg_temp.snapshot())->pg_temp.id(50)::text)=1,'explicit child override suppresses its ancestor groups');
select pg_temp.ok((select new_mastery_balance=60 from public.study_deck_node_preferences where deck_id=pg_temp.id(90) and library_node_id=pg_temp.id(21))
 and (select new_mastery_balance=70 from public.study_deck_node_preferences where deck_id=pg_temp.id(90) and library_node_id=pg_temp.id(24)),'explicit child leaves both parents unchanged');
select pg_temp.balance(24,70);
select pg_temp.ok((pg_temp.balances(pg_temp.snapshot())->>pg_temp.id(50)::text)::numeric=65
 and jsonb_array_length(pg_temp.contributions(pg_temp.snapshot())->pg_temp.id(50)::text)=2,'same-value parent recommit restores its group after child override');
select pg_temp.reject(format('update public.study_deck_node_preferences set shared_compatibility_source=%L::jsonb where deck_id=%L and library_node_id=%L','{"version":2,"source":"invalid","origin":"not-a-topic","ancestors":[]}',pg_temp.id(90),pg_temp.id(22)),'23514','unknown or malformed provenance fails closed');
select jsonb_agg(to_jsonb(c)) as saved_checks from checks c \gset
rollback to deliberate_resets;
insert into checks select * from jsonb_to_recordset(:'saved_checks'::jsonb) x(label text,passed boolean) on conflict do nothing;

-- Capture an implicit inherited preference before sharing. Existing defaults
-- stored for unselected rows are not effective overrides.
update public.study_deck_node_preferences set new_mastery_balance=70 where deck_id=pg_temp.id(90) and library_node_id=pg_temp.id(20);
create temporary table preference_before as select public.m117_preference_state(pg_temp.id(90)) value;
create temporary table old_session as select public.start_study_session(pg_temp.id(90),50) id;
create temporary table old_session_before as select s.selection_snapshot from public.study_sessions s join old_session o using(id);
create temporary table old_offer_before as select public.select_next_study_question_hardened((select id from old_session),true) value;
insert into public.study_decks(id,user_id,library_id,name,is_active) values(pg_temp.id(93),pg_temp.id(2),pg_temp.id(10),'ZZ SHARED122 dormant deck',false);
insert into public.user_study_node_selections(deck_id,user_id,library_id,node_id) values(pg_temp.id(93),pg_temp.id(2),pg_temp.id(10),pg_temp.id(20));
update public.study_deck_node_preferences set new_mastery_balance=85 where deck_id=pg_temp.id(93) and library_node_id=pg_temp.id(20);
insert into public.study_decks(id,user_id,library_id,name,is_active) values(pg_temp.id(94),pg_temp.id(2),pg_temp.id(10),'ZZ SHARED122 dormant explicit preference',false);
insert into public.user_study_node_selections(deck_id,user_id,library_id,node_id) values(pg_temp.id(94),pg_temp.id(2),pg_temp.id(10),pg_temp.id(20));
insert into public.study_deck_node_preferences(deck_id,user_id,library_id,library_node_id,new_mastery_balance,reset_source) values(pg_temp.id(94),pg_temp.id(2),pg_temp.id(10),pg_temp.id(22),20,pg_temp.id(99));
insert into public.study_deck_node_exclusions(deck_id,user_id,library_id,node_id) values(pg_temp.id(94),pg_temp.id(2),pg_temp.id(10),pg_temp.id(22));
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
set local role authenticated;
select public.add_official_topic_placement(pg_temp.id(10),pg_temp.id(22),pg_temp.id(24),null,public.get_official_topic_graph(pg_temp.id(10))->>'revision') is not null as added;
reset role;
select pg_temp.ok((select count(*)=2 from public.m122_edges(pg_temp.id(10)) where topic_id=pg_temp.id(22)),'two locations one identity');
select pg_temp.ok((select count(*)=1 from public.library_nodes where id=pg_temp.id(22)),'no duplicate Topic record');
select pg_temp.ok((select count(*)=1 from public.m122_closure(pg_temp.id(10)) where ancestor_id=pg_temp.id(20) and topic_id=pg_temp.id(22)),'diamond closure deduplicates');
select pg_temp.ok((select array_agg(personal_topic_id order by personal_topic_id)=array[pg_temp.id(24),pg_temp.id(40),pg_temp.id(44),pg_temp.id(45)] from public.personal_topic_official_placements),'personal canonical anchors unchanged');
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
select pg_temp.ok(public.m117_preference_state(pg_temp.id(90))->'values'=(select value->'values' from preference_before),'first sharing preserves displayed values');
select pg_temp.ok(public.m117_preference_state(pg_temp.id(90))#>>array['projection','official',pg_temp.id(22)::text,'source']=(select value#>>array['projection','official',pg_temp.id(20)::text,'source'] from preference_before),'first sharing preserves source group');
select pg_temp.ok(public.m117_preference_state(pg_temp.id(90))->>'version'='122','shared projection explicitly versioned');
select pg_temp.ok((select new_mastery_balance=85 and shared_compatibility_source->>'source'='official:topic:'||pg_temp.id(20) from public.study_deck_node_preferences where deck_id=pg_temp.id(93) and library_node_id=pg_temp.id(22)),'inactive deck fallback and source preserved');
select pg_temp.ok((select new_mastery_balance=20 and reset_source=pg_temp.id(99) from public.study_deck_node_preferences where deck_id=pg_temp.id(94) and library_node_id=pg_temp.id(22)),'inactive excluded explicit adjustment is never overwritten by fallback');
select pg_temp.ok((select s.selection_snapshot from public.study_sessions s join old_session o using(id))=(select selection_snapshot from old_session_before),'old session snapshot never rewritten');
select pg_temp.ok(public.select_next_study_question_hardened((select id from old_session),true)=(select value from old_offer_before),'old session scoring and delivery unchanged by first sharing');
create temporary table shared_session as select public.start_study_session(pg_temp.id(90),50) id;
select pg_temp.ok((select selection_snapshot#>>'{unified_deck_settings,topic_preference_state,projection,version}'='122' from public.study_sessions where id=(select id from shared_session)),'new session receives version 122 projection');
select pg_temp.ok(public.select_next_study_question_hardened((select id from shared_session),true)=(select value from old_offer_before),'unchanged weighting and score components on first sharing');
select pg_temp.ok((select (x->>'total_concepts')::integer=2 from jsonb_array_elements(public.get_library_learner_progress(pg_temp.id(10))->'nodes') x where x->>'library_node_id'=pg_temp.id(20)::text),'root Concept progress count deduplicated');

-- Inclusive shared selection: either path or a direct canonical seed is enough.
delete from public.user_study_node_selections where deck_id=pg_temp.id(90);
delete from public.study_deck_node_exclusions where deck_id=pg_temp.id(90);
set local role authenticated;
select public.set_study_deck_node_selection(pg_temp.id(90),pg_temp.id(21),true);
reset role;
select pg_temp.ok(exists(select 1 from public.resolve_effective_study_nodes(pg_temp.id(90)) where node_id=pg_temp.id(22)),'original path includes shared Topic');
set local role authenticated;
select public.set_study_deck_node_selection(pg_temp.id(90),pg_temp.id(24),true);
select public.set_study_deck_node_selection(pg_temp.id(90),pg_temp.id(21),false);
reset role;
select pg_temp.ok(exists(select 1 from public.resolve_effective_study_nodes(pg_temp.id(90)) where node_id=pg_temp.id(22)),'other path survives original parent uncheck');
set local role authenticated;
select public.set_study_deck_node_selection(pg_temp.id(90),pg_temp.id(22),true);
select public.set_study_deck_node_selection(pg_temp.id(90),pg_temp.id(24),false);
reset role;
select pg_temp.ok(exists(select 1 from public.resolve_effective_study_nodes(pg_temp.id(90)) where node_id=pg_temp.id(22)),'independent shared seed survives parent uncheck');
set local role authenticated;
select public.set_study_deck_node_selection(pg_temp.id(90),pg_temp.id(22),false);
reset role;
select pg_temp.ok(not exists(select 1 from public.resolve_effective_study_nodes(pg_temp.id(90)) where node_id=pg_temp.id(22)),'no selected path means absent');
insert into public.study_deck_node_exclusions(deck_id,user_id,library_id,node_id) values(pg_temp.id(90),pg_temp.id(2),pg_temp.id(10),pg_temp.id(22));
set local role authenticated;
select public.set_study_deck_node_selection(pg_temp.id(90),pg_temp.id(24),true);
reset role;
select pg_temp.ok(exists(select 1 from public.resolve_effective_study_nodes(pg_temp.id(90)) where node_id=pg_temp.id(22)),'retained negative cannot veto another shared path');
select pg_temp.ok((select count(*)=count(distinct (candidate_type,candidate_id)) from public.resolve_study_candidates(pg_temp.id(90))),'candidate identities delivered once');
select pg_temp.ok(exists(select 1 from public.resolve_study_candidates(pg_temp.id(90)) where personal_card_id=pg_temp.id(81)),'standalone Card included through additional official path');

-- The existing explicit subtree reset remains atomic and canonical.
set local role authenticated;
select public.set_study_deck_topic_subtree_preference(pg_temp.id(90),pg_temp.id(10),'official:topic:'||pg_temp.id(24),60,public.get_home_study_bootstrap(pg_temp.id(10),pg_temp.id(90))#>>'{unified_deck_settings,topic_preference_state,revision}') is not null as reset_parent;
reset role;
select pg_temp.ok((select count(*)=3 and bool_and(new_mastery_balance=60) from public.study_deck_node_preferences where deck_id=pg_temp.id(90) and library_node_id in (pg_temp.id(24),pg_temp.id(25),pg_temp.id(22))),'parent reset reaches unique graph descendants');
select pg_temp.ok(public.m117_preference_state(pg_temp.id(90))#>>array['projection','official',pg_temp.id(22)::text,'source']=public.m117_preference_state(pg_temp.id(90))#>>array['projection','official',pg_temp.id(25)::text,'source'],'shared reset uses one contribution group across canonical and additional descendants');
set local role authenticated;
select public.set_study_deck_topic_subtree_preference(pg_temp.id(90),pg_temp.id(10),'official:topic:'||pg_temp.id(22),20,public.get_home_study_bootstrap(pg_temp.id(10),pg_temp.id(90))#>>'{unified_deck_settings,topic_preference_state,revision}') is not null as reset_child;
reset role;
select pg_temp.ok((select new_mastery_balance=60 from public.study_deck_node_preferences where deck_id=pg_temp.id(90) and library_node_id=pg_temp.id(24)),'child leaves parent preference unchanged');
set local role authenticated;
select public.set_study_deck_topic_subtree_preference(pg_temp.id(90),pg_temp.id(10),'official:topic:'||pg_temp.id(24),60,public.get_home_study_bootstrap(pg_temp.id(10),pg_temp.id(90))#>>'{unified_deck_settings,topic_preference_state,revision}') is not null as recommit_parent;
reset role;
select pg_temp.ok((select new_mastery_balance=60 from public.study_deck_node_preferences where deck_id=pg_temp.id(90) and library_node_id=pg_temp.id(22)),'same-value parent recommit resets customized child');
create temporary table atomic_before as select jsonb_agg(to_jsonb(p) order by library_node_id) value from public.study_deck_node_preferences p where deck_id=pg_temp.id(90);
create function pg_temp.fail_one_preference() returns trigger language plpgsql as $$
begin if new.library_node_id=pg_temp.id(22) then raise exception 'Synthetic write failure' using errcode='23514';end if; return new; end $$;
create trigger shared122_test_atomic before insert or update on public.study_deck_node_preferences for each row execute function pg_temp.fail_one_preference();
set local role authenticated;
select pg_temp.reject(format('select public.set_study_deck_topic_subtree_preference(%L,%L,%L,30,%L)',pg_temp.id(90),pg_temp.id(10),'official:topic:'||pg_temp.id(24),public.get_home_study_bootstrap(pg_temp.id(10),pg_temp.id(90))#>>'{unified_deck_settings,topic_preference_state,revision}'),'23514','one descendant failure rejects entire reset');
reset role;
drop trigger shared122_test_atomic on public.study_deck_node_preferences;
select pg_temp.ok((select jsonb_agg(to_jsonb(p) order by library_node_id) from public.study_deck_node_preferences p where deck_id=pg_temp.id(90))=(select value from atomic_before),'failed reset leaves every subtree row unchanged');

-- Guarded API authority, Library endpoints and direct table privileges.
set local role authenticated;
select pg_temp.reject(format('select public.add_official_topic_placement(%L,%L,%L,null,%L)',pg_temp.id(10),pg_temp.id(23),pg_temp.id(24),public.get_official_topic_graph(pg_temp.id(10))->>'revision'),'42501','learner cannot add official placement');
select pg_temp.reject(format('insert into public.official_topic_placements(library_id,parent_node_id,topic_id,sort_order) values(%L,%L,%L,0)',pg_temp.id(10),pg_temp.id(24),pg_temp.id(23)),'42501','learner direct table write denied');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
set local role authenticated;
select pg_temp.reject(format('select public.add_official_topic_placement(%L,%L,%L,null,%L)',pg_temp.id(10),pg_temp.id(21),pg_temp.id(22),public.get_official_topic_graph(pg_temp.id(10))->>'revision'),'23514','indirect cycle rejected');
select pg_temp.reject(format('select public.add_official_topic_placement(%L,%L,%L,null,%L)',pg_temp.id(10),pg_temp.id(22),pg_temp.id(24),public.get_official_topic_graph(pg_temp.id(10))->>'revision'),'23505','duplicate edge rejected');
select pg_temp.reject(format('select public.add_official_topic_placement(%L,%L,%L,null,%L)',pg_temp.id(10),pg_temp.id(22),pg_temp.id(30),public.get_official_topic_graph(pg_temp.id(10))->>'revision'),'22023','cross-Library placement rejected');
select pg_temp.reject(format('select public.add_official_topic_placement(%L,%L,%L,null,%L)',pg_temp.id(10),pg_temp.id(20),pg_temp.id(24),public.get_official_topic_graph(pg_temp.id(10))->>'revision'),'22023','root target rejected');
select pg_temp.reject(format('select public.add_official_topic_placement(%L,%L,%L,null,%L)',pg_temp.id(10),pg_temp.id(40),pg_temp.id(24),public.get_official_topic_graph(pg_temp.id(10))->>'revision'),'22023','personal Topic target rejected');
select pg_temp.reject(format('select public.add_official_topic_placement(%L,%L,%L,null,%L)',pg_temp.id(10),pg_temp.id(23),pg_temp.id(24),'stale'),'PT409','stale graph revision rejected');
reset role;

-- Original-location promotion preserves identity, content and settings, and
-- restores the ordinary exclusion contract after the final extra edge is gone.
create temporary table before_promotion as select
 (select jsonb_agg(to_jsonb(n) order by n.id) from public.concepts n) concepts,
 (select jsonb_agg(to_jsonb(n) order by n.id) from public.questions n) questions,
 (select jsonb_agg(to_jsonb(n) order by n.id) from public.question_versions n) versions;
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
create temporary table settings_before_promotion as select public.m117_preference_state(pg_temp.id(90))->'values' value;
select set_config('request.jwt.claim.sub',pg_temp.id(4)::text,true);
set local role authenticated;
select public.remove_official_topic_placement(pg_temp.id(10),'primary:'||pg_temp.id(22),
 (select e->>'edge_key' from jsonb_array_elements(public.get_official_topic_graph(pg_temp.id(10))->'edges') e where e->>'kind'='placement' and e->>'topic_id'=pg_temp.id(22)::text),
 public.get_official_topic_graph(pg_temp.id(10))->>'revision') is not null as promoted;
select pg_temp.reject(format('select public.remove_official_topic_placement(%L,%L,null,%L)',pg_temp.id(10),'primary:'||pg_temp.id(22),public.get_official_topic_graph(pg_temp.id(10))->>'revision'),'23514','last placement removal blocked');
reset role;
select pg_temp.ok((select parent_id=pg_temp.id(24) from public.library_nodes where id=pg_temp.id(22)),'Editor can promote chosen surviving parent');
select pg_temp.ok((select count(*)=1 from public.m122_edges(pg_temp.id(10)) where topic_id=pg_temp.id(22)),'promotion removes redundant extra edge');
select pg_temp.ok((select jsonb_agg(to_jsonb(n) order by n.id) from public.concepts n)=(select concepts from before_promotion)
 and (select jsonb_agg(to_jsonb(n) order by n.id) from public.questions n)=(select questions from before_promotion)
 and (select jsonb_agg(to_jsonb(n) order by n.id) from public.question_versions n)=(select versions from before_promotion),'promotion preserves content and immutable versions');
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
select pg_temp.ok(public.m117_preference_state(pg_temp.id(90))->'values'=(select value from settings_before_promotion),'promotion preserves effective slider values');
select pg_temp.ok(not exists(select 1 from public.resolve_effective_study_nodes(pg_temp.id(90)) where node_id=pg_temp.id(22)),'last sharing removal restores retained ordinary exclusion');

-- Move/reorder is edge-specific, checks both sibling lists, and preserves the
-- other incoming placement. Only synthetic structure is changed.
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
select public.add_official_topic_placement(pg_temp.id(10),pg_temp.id(23),pg_temp.id(24),null,public.get_official_topic_graph(pg_temp.id(10))->>'revision') is not null as added_for_move;
create temporary table moving_edge as select edge_key from public.m122_edges(pg_temp.id(10)) where topic_id=pg_temp.id(23) and kind='placement';
select public.position_official_topic_placement(pg_temp.id(10),(select edge_key from moving_edge),pg_temp.id(24),pg_temp.id(26),null,
 (select array_agg(edge_key order by sort_order,edge_key) from public.m122_edges(pg_temp.id(10)) where parent_id=pg_temp.id(24)),
 '{}'::text[],public.get_official_topic_graph(pg_temp.id(10))->>'revision') is not null as moved;
select pg_temp.ok((select parent_id=pg_temp.id(21) from public.library_nodes where id=pg_temp.id(23)),'moving additional edge preserves original parent');
select pg_temp.ok(exists(select 1 from public.m122_edges(pg_temp.id(10)) where parent_id=pg_temp.id(26) and topic_id=pg_temp.id(23)),'additional edge reaches requested parent');
select pg_temp.reject(format('select public.position_official_topic_placement(%L,%L,%L,%L,null,%L::text[],%L::text[],%L)',pg_temp.id(10),(select edge_key from moving_edge),pg_temp.id(26),pg_temp.id(24),'{}','{}',public.get_official_topic_graph(pg_temp.id(10))->>'revision'),'PT409','stale sibling arrays rejected');
select pg_temp.reject(format('select public.move_library_node_in_library(%L,%L,%L)',pg_temp.id(10),pg_temp.id(23),pg_temp.id(26)),'PT409','legacy move cannot bypass shared edge contract');

-- A canonical descendant with an external location is not silently deleted.
select pg_temp.ok(jsonb_array_length(public.get_official_topic_delete_impact(pg_temp.id(10),pg_temp.id(21))#>'{blockers,shared_descendants}')=1,'delete impact identifies externally shared descendant');
select pg_temp.reject(format('select public.delete_official_topic_with_impact(%L,%L,%L)',pg_temp.id(10),pg_temp.id(21),public.get_official_topic_delete_impact(pg_temp.id(10),pg_temp.id(21))->>'revision'),'23503','shared descendant prevents canonical branch deletion');
select pg_temp.reject(format('select public.delete_development_content(%L,%L)','library_node',pg_temp.id(21)),'PT409','legacy deletion cannot bypass reviewed impact');
select pg_temp.ok(jsonb_array_length(public.get_official_topic_delete_impact(pg_temp.id(10),pg_temp.id(22))#>'{blockers,standalone_cards}')=1,'delete impact retains standalone Card safeguard');
select pg_temp.reject(format('select public.delete_official_topic_with_impact(%L,%L,%L)',pg_temp.id(10),pg_temp.id(23),'stale'),'PT409','stale deletion impact rejected');
-- Deleting an alias-only parent removes its edge, not the target or its content.
select public.delete_official_topic_with_impact(pg_temp.id(10),pg_temp.id(26),public.get_official_topic_delete_impact(pg_temp.id(10),pg_temp.id(26))->>'revision');
select pg_temp.ok(exists(select 1 from public.library_nodes where id=pg_temp.id(23)),'deleting parent preserves external shared target');
select pg_temp.ok((select jsonb_agg(to_jsonb(n) order by n.id) from public.questions n)=(select questions from before_promotion),'Topic deletion retains Question records');

-- Direct writes still encounter the deferred database graph constraint.
select pg_temp.reject(format('insert into public.official_topic_placements(library_id,parent_node_id,topic_id,sort_order) values(%L,%L,%L,0); set constraints m122_official_graph_integrity immediate',pg_temp.id(10),pg_temp.id(23),pg_temp.id(21)),'23514','direct write cycle blocked at transaction boundary');
select set_config('request.jwt.claim.sub',pg_temp.id(3)::text,true);
set local role authenticated;
select pg_temp.reject(format('select public.get_official_topic_graph(%L)',pg_temp.id(11)),'42501','unassigned learner Library read rejected');
select pg_temp.reject(format('select public.m122_preserve_preferences(%L,%L)',pg_temp.id(10),pg_temp.id(21)),'42501','internal preference helper is not an API');
reset role;
set constraints all immediate;

-- Twenty diamond layers represent over a million root paths without creating
-- path rows. Counts/reachability must remain canonical and bounded.
set constraints all deferred;
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
do $$ declare layer integer; first_parent uuid:=pg_temp.id(20);second_parent uuid;begin
 for layer in 0..19 loop
  insert into public.library_nodes(id,library_id,parent_id,name,node_type,sort_order) values
   (pg_temp.id(200+layer*2),pg_temp.id(10),first_parent,'Diamond '||layer||' A','topic',0),
   (pg_temp.id(201+layer*2),pg_temp.id(10),first_parent,'Diamond '||layer||' B','topic',1);
  if second_parent is not null then
   insert into public.official_topic_placements(library_id,parent_node_id,topic_id,sort_order) values
    (pg_temp.id(10),second_parent,pg_temp.id(200+layer*2),0),(pg_temp.id(10),second_parent,pg_temp.id(201+layer*2),1);
  end if;
  first_parent:=pg_temp.id(200+layer*2);second_parent:=pg_temp.id(201+layer*2);
 end loop;
end $$;
select pg_temp.ok((select count(*)=39 from public.m122_closure(pg_temp.id(10)) where ancestor_id=pg_temp.id(200)),'diamond descendants are canonical pairs, not paths');
select pg_temp.ok((select count(*)=38 from public.m122_shared_nodes(pg_temp.id(10))),'shared zone includes descendants exactly once');
set constraints all immediate;
-- Reuse the untouched fixture for the existing explicit-Concept inclusion
-- contract. Preference coverage is distinct from Topic inclusion eligibility.
select jsonb_agg(to_jsonb(c)) as saved_checks from checks c \gset
rollback to stage1_proof_start;
insert into checks select * from jsonb_to_recordset(:'saved_checks'::jsonb) x(label text,passed boolean) on conflict do nothing;
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
update public.study_deck_node_preferences set new_mastery_balance=70 where deck_id=pg_temp.id(90) and library_node_id=pg_temp.id(20);
select public.set_study_deck_node_selection(pg_temp.id(90),pg_temp.id(22),false);
insert into public.user_study_concept_overrides(deck_id,user_id,library_id,concept_id,selection_state)
 values(pg_temp.id(90),pg_temp.id(2),pg_temp.id(10),pg_temp.id(51),'included');
select pg_temp.ok(not exists(select 1 from public.resolve_effective_study_nodes(pg_temp.id(90)) where node_id=pg_temp.id(22)),'override fixture Topic remains excluded');
select pg_temp.ok(exists(select 1 from public.resolve_study_deck(pg_temp.id(90)) where concept_id=pg_temp.id(51) and selection_source='included'),'override fixture Concept remains explicitly eligible');
create temporary table source_before as select pg_temp.balances(pg_temp.snapshot()) balances,pg_temp.contributions(pg_temp.snapshot()) sources;
select pg_temp.ok((select (balances->>pg_temp.id(51)::text)::numeric=70 and jsonb_array_length(sources->pg_temp.id(51)::text)=1 from source_before),'released explicit Concept inclusion retains selected ancestor contribution');
select pg_temp.share(23,24);
select jsonb_build_object('before_balances',(select balances from source_before),'after_balances',pg_temp.balances(pg_temp.snapshot()),'before_sources',(select sources from source_before),'after_sources',pg_temp.contributions(pg_temp.snapshot())) as explicit_concept_override_evidence;
select count(*) as passed_before_final_preservation_assertion from checks;
select pg_temp.same_sources('unrelated sharing preserves explicit Concept inclusion preference coverage');
-- A dormant explicit child value must not replace the selected ancestor's
-- released contribution while the child is excluded and only its Concept is included.
insert into public.study_deck_node_preferences(deck_id,user_id,library_id,library_node_id,new_mastery_balance,reset_source)
 values(pg_temp.id(90),pg_temp.id(2),pg_temp.id(10),pg_temp.id(22),20,pg_temp.id(905))
 on conflict(deck_id,library_node_id) do update set new_mastery_balance=excluded.new_mastery_balance,reset_source=excluded.reset_source;
select pg_temp.same_sources('dormant child adjustment preserves explicit inclusion ancestor');
select pg_temp.share(23,26);
select pg_temp.same_sources('additional unrelated sharing preserves explicit inclusion ancestor');
select pg_temp.ok((select new_mastery_balance=20 from public.study_deck_node_preferences where deck_id=pg_temp.id(90) and library_node_id=pg_temp.id(22)),'dormant child preference stays stored separately from inherited coverage');
-- Exercise the complete released startup/media wrapper as well as source CTEs.
create temporary table response_history_before as select
 (select count(*) from public.review_attempts) official,
 (select count(*) from public.personal_review_attempts) personal;
create temporary table normal_startup as select public.start_study_session_with_candidate_and_media(pg_temp.id(90),70,pg_temp.id(910),false) result;
select pg_temp.ok((select result->'candidate' is not null and result->>'session_id'=pg_temp.id(910)::text from normal_startup),'shared normal Study startup returns a complete real candidate');
update public.study_decks set cram_mode=true where id=pg_temp.id(90);
create temporary table cram_startup as select public.start_study_session_with_candidate_and_media(pg_temp.id(90),70,pg_temp.id(911),false) result;
select pg_temp.ok((select result->'candidate' is not null and result->>'session_id'=pg_temp.id(911)::text from cram_startup),'shared Cram startup returns a complete real candidate');
select pg_temp.ok((select count(*)=2 from public.study_sessions where id in (pg_temp.id(910),pg_temp.id(911)) and selection_snapshot#>>'{unified_deck_settings,topic_preference_state,projection,version}'='122'),'both startup modes retain the versioned shared preference snapshot');
select pg_temp.ok((select official=(select count(*) from public.review_attempts) and personal=(select count(*) from public.personal_review_attempts) from response_history_before),'shared startup never fabricates learning responses');
select count(*) as passed from checks;
