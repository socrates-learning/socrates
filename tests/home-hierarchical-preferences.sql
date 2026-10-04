-- Local disposable proof; all test mutations roll back.
\set ON_ERROR_STOP on
begin;
do $$ begin
 if current_database() !~ '^home117($|_)' or not exists(select 1 from public.libraries where slug='zz-home117-a')
 or exists(select 1 from auth.users where email not like 'zz-home117-%@example.invalid') then raise exception 'Isolated HOME117 fixture required'; end if;
end $$;
create function pg_temp.id(n integer) returns uuid language sql immutable as $$ select ('11700000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function pg_temp.key(n integer,s text default 'official') returns text language sql immutable as $$ select s||':topic:'||pg_temp.id(n) $$;
create function pg_temp.check_true(ok boolean,label text) returns void language plpgsql as $$ begin
 if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label;
end $$;
create function pg_temp.denied(statement text,code text) returns void language plpgsql as $$
declare actual text; begin
 begin execute statement; exception when others then get stacked diagnostics actual=returned_sqlstate; end;
 if actual is distinct from code then raise exception 'Expected %, got %: %',code,actual,statement;end if;
end $$;
create function pg_temp.home() returns jsonb language sql as $$ select public.get_home_study_bootstrap(pg_temp.id(10),pg_temp.id(90)) $$;
create function pg_temp.state() returns jsonb language sql as $$ select pg_temp.home()#>'{unified_deck_settings,topic_preference_state}' $$;
create function pg_temp.reset(n integer,b integer,s text default 'official') returns jsonb language sql as $$
 select public.set_study_deck_topic_subtree_preference(pg_temp.id(90),pg_temp.id(10),pg_temp.key(n,s),b,pg_temp.state()->>'revision') $$;
create function pg_temp.value(n integer,s text default 'official') returns integer language sql as $$ select (pg_temp.state()->'values'->>pg_temp.key(n,s))::integer $$;
-- Execute the actual installed selector's balance CTEs, with its unchanged
-- eligibility resolver. This is a probe, not a second scheduler implementation.
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
 select jsonb_build_object('selected_node_ids',h->'selected_node_ids','excluded_node_ids',h->'excluded_node_ids','node_preferences',h->'node_preferences','unified_deck_settings',h->'unified_deck_settings') from (select pg_temp.home() h) q $$;
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);

-- Proven necessity: copied placement votes would change the released average.
select pg_temp.check_true((select avg(v) from (values(60),(80)) t(v))=70 and (select avg(v) from (values(60),(60),(80)) t(v))<>70,'reset-source deduplication is necessary');

do $$
declare before_selection jsonb; old_state jsonb; old_session uuid; frozen jsonb; s jsonb; result jsonb; before_candidates jsonb;
begin
 set local role authenticated;
 old_state:=pg_temp.state();
 before_selection:=pg_temp.home()-array['node_preferences','personal_topic_preferences','unified_deck_settings'];
 select jsonb_agg(to_jsonb(c) order by candidate_type,candidate_id) into before_candidates from public.resolve_study_candidates(pg_temp.id(90)) c;
 old_session:=public.start_study_session(pg_temp.id(90),50);
 reset role;
 -- Represent an actual pre-117 session without the additive marker.
 update public.study_sessions set selection_snapshot=jsonb_set(selection_snapshot,'{unified_deck_settings}',(selection_snapshot->'unified_deck_settings')-'topic_preference_state') where id=old_session;
 select selection_snapshot into frozen from public.study_sessions where id=old_session;
 set local role authenticated;
 before_selection:=pg_temp.home()-array['node_preferences','personal_topic_preferences','unified_deck_settings'];
 perform pg_temp.reset(20,60);
 perform pg_temp.check_true((select bool_and(value::integer=60) from jsonb_each_text(pg_temp.state()->'values')),'root resets all current official and owned personal descendants');
 perform pg_temp.check_true(not(pg_temp.state()->'values' ? pg_temp.key(44,'personal')) and not(pg_temp.state()->'values' ? pg_temp.key(45,'personal')),'other owner and other Library excluded');
 perform pg_temp.reset(21,20);
 perform pg_temp.check_true(pg_temp.value(21)=20 and pg_temp.value(22)=20 and pg_temp.value(23)=20 and pg_temp.value(42,'personal')=20,'intermediate resets its full current subtree');
 perform pg_temp.check_true(pg_temp.value(20)=60 and pg_temp.value(24)=60 and pg_temp.value(26)=60,'child leaves parent, sibling and unrelated branch unchanged');
 perform pg_temp.reset(22,10);
 perform pg_temp.check_true(pg_temp.value(22)=10 and pg_temp.value(23)=20 and pg_temp.value(21)=20,'leaf changes only itself');
 perform pg_temp.reset(20,60);
 perform pg_temp.check_true(pg_temp.value(22)=60 and pg_temp.value(42,'personal')=60,'recommit unchanged parent resets customized descendants');
 perform pg_temp.reset(41,20,'personal');
 perform pg_temp.check_true(pg_temp.value(40,'personal')=60 and pg_temp.value(41,'personal')=20 and pg_temp.value(42,'personal')=20 and pg_temp.value(43,'personal')=60,'personal child resets only its subtree');
 perform pg_temp.check_true(before_selection=pg_temp.home()-array['node_preferences','personal_topic_preferences','unified_deck_settings'],'eligibility, counts and other Home fields unchanged');
 perform pg_temp.check_true(before_candidates=(select jsonb_agg(to_jsonb(c) order by candidate_type,candidate_id) from public.resolve_study_candidates(pg_temp.id(90)) c),'candidate eligibility and payloads unchanged');
 perform pg_temp.denied(format('select public.set_study_deck_topic_subtree_preference(%L,%L,%L,10,%L)',pg_temp.id(90),pg_temp.id(10),pg_temp.key(20),old_state->>'revision'),'40001');
 perform pg_temp.denied(format('update public.study_deck_node_preferences set new_mastery_balance=99 where deck_id=%L',pg_temp.id(90)),'42501');
 perform pg_temp.denied(format('update public.study_deck_personal_topic_preferences set new_mastery_balance=99 where deck_id=%L',pg_temp.id(90)),'42501');
 perform pg_temp.denied(format('select public.set_study_deck_personal_topic_preference(%L,%L,10)',pg_temp.id(90),pg_temp.id(40)),'42501');
 perform pg_temp.check_true(true,'stale revision and old preference writers fail closed');
 reset role;
 perform pg_temp.check_true((select selection_snapshot=frozen from public.study_sessions where id=old_session),'in-progress session snapshot remains exact');
 perform pg_temp.check_true((public.select_next_study_question_hardened(old_session,true)->>'selected_branch_balance')::numeric=50,'pre-117 session retains released preference interpretation');
 s:=pg_temp.snapshot();
 perform pg_temp.check_true(public.m111_card_balance(pg_temp.id(81),s,s->'unified_deck_settings')=60,'standalone official Topic Card consumes saved balance without a Concept');
 perform pg_temp.check_true(public.m111_card_balance(pg_temp.id(82),s,s->'unified_deck_settings')=20,'standalone personal Topic Card consumes saved balance');
 perform pg_temp.check_true(public.m109_card_balance(pg_temp.id(80),s->'unified_deck_settings')=20,'legacy Concept-backed personal Card consumes saved balance');
 set local role authenticated;
 perform public.set_study_deck_personal_collection_selection(pg_temp.id(90),pg_temp.id(85),true);
 perform public.set_study_deck_personal_collection_preference(pg_temp.id(90),pg_temp.id(85),80);
 reset role;
 s:=pg_temp.snapshot();
 perform pg_temp.check_true(public.m109_card_balance(pg_temp.id(80),s->'unified_deck_settings')=50 and public.m111_card_balance(pg_temp.id(81),s,s->'unified_deck_settings')=70,'independent collection contribution retains existing averaging');
 set local role authenticated;
 perform public.set_study_deck_personal_collection_selection(pg_temp.id(90),pg_temp.id(85),false);
 perform pg_temp.reset(21,60); perform pg_temp.reset(24,80);
 result:=pg_temp.balances(pg_temp.snapshot());
 perform pg_temp.check_true((result->>pg_temp.id(50)::text)::numeric=70,'two A placements plus one B retain distinct branch average 70');
 perform pg_temp.reset(22,20);
 result:=pg_temp.balances(pg_temp.snapshot());
 perform pg_temp.check_true((result->>pg_temp.id(50)::text)::numeric=50,'more-specific child suppresses equivalent ancestor contribution across placements');
 perform pg_temp.check_true((result->>pg_temp.id(51)::text)::numeric=20,'single placement uses most-specific child');
 reset role;
 -- Neither grouping nor weighting can create a new Cram path.
 update public.study_decks set cram_mode=true where id=pg_temp.id(90);
 set local role authenticated;
 old_session:=public.start_study_session(pg_temp.id(90),50);
 reset role;
 result:=public.select_next_study_question_hardened(old_session,true);
 perform pg_temp.check_true((result->>'cram_mode')::boolean and not(result ? 'selected_branch_balance'),'Cram bypasses normal preference calculation');
 update public.study_decks set cram_mode=false where id=pg_temp.id(90);
end $$;

-- Bounds/actor/Library/root authority and exclusion/reselection.
do $$ declare v jsonb; begin
 set local role authenticated;
 perform public.set_study_deck_node_selection(pg_temp.id(90),pg_temp.id(21),false);
 perform pg_temp.denied('select pg_temp.reset(22,10)','42501');
 perform pg_temp.reset(20,60);
 perform pg_temp.check_true(not((pg_temp.home()->'selected_node_ids') ? pg_temp.id(21)::text) and (pg_temp.home()->'excluded_node_ids') ? pg_temp.id(21)::text,'reset does not remove descendant exclusion');
 perform public.set_study_deck_node_selection(pg_temp.id(90),pg_temp.id(22),true);
 perform pg_temp.reset(22,20);
 perform pg_temp.check_true(pg_temp.value(22)=20,'explicit re-included leaf can configure');
 perform public.set_study_deck_personal_topic_selection(pg_temp.id(90),pg_temp.id(40),false);
 perform pg_temp.reset(20,60);
 perform pg_temp.check_true(not exists(select 1 from jsonb_array_elements(pg_temp.home()#>'{unified_deck_settings,topic_states}') t where (t->>'selected')::boolean),'official reset never selects personal Topics');
 perform pg_temp.denied('select pg_temp.reset(40,20,''personal'')','42501');
 perform pg_temp.denied('select pg_temp.reset(20,-1)','22023');
 perform pg_temp.denied('select pg_temp.reset(20,101)','22023');
 perform public.set_study_deck_personal_topic_selection(pg_temp.id(90),pg_temp.id(24),true);
 perform pg_temp.reset(24,0,'personal');
 perform pg_temp.check_true(pg_temp.value(24,'personal')=0 and pg_temp.value(24)=60,'identical UUIDs remain independent across official and personal sources');
 perform pg_temp.reset(24,100,'personal');
 perform pg_temp.check_true(pg_temp.value(24,'personal')=100 and pg_temp.value(24)=60,'both preference endpoints persist without crossing source identity');
 perform public.set_study_deck_personal_topic_selection(pg_temp.id(90),pg_temp.id(24),false);
 perform pg_temp.denied('select pg_temp.reset(44,20,''personal'')','42501');
 perform pg_temp.denied('select pg_temp.reset(30,20)','42501');
 perform pg_temp.denied(format('select public.set_study_deck_topic_subtree_preference(%L,%L,%L,20,%L)',pg_temp.id(92),pg_temp.id(10),pg_temp.key(20),pg_temp.state()->>'revision'),'42501');
 perform set_config('request.jwt.claim.sub',pg_temp.id(3)::text,true);
 perform pg_temp.denied(format('select public.set_study_deck_topic_subtree_preference(%L,%L,%L,20,''stale'')',pg_temp.id(90),pg_temp.id(10),pg_temp.key(20)),'42501');
 perform set_config('request.jwt.claim.sub','',true);
 perform pg_temp.denied(format('select public.set_study_deck_topic_subtree_preference(%L,%L,%L,20,''stale'')',pg_temp.id(90),pg_temp.id(10),pg_temp.key(20)),'42501');
 reset role;
 perform set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
 perform pg_temp.check_true(true,'authority, bounds, exclusions, re-inclusion and selection boundary');
end $$;

-- Failure after official writes must also roll back the entire subtree.
create function pg_temp.fail_descendant() returns trigger language plpgsql as $$ begin
 if new.personal_topic_id=pg_temp.id(42) then raise exception 'Synthetic descendant failure' using errcode='P0117'; end if;return new;
end $$;
set local role socrates_migrator;
create trigger zz_home117_failure before update on public.study_deck_personal_topic_preferences for each row execute function pg_temp.fail_descendant();
reset role;
do $$ declare before_state jsonb; begin
 set local role authenticated; before_state:=pg_temp.state();
 perform pg_temp.denied('select pg_temp.reset(20,77)','P0117');
 perform pg_temp.check_true(pg_temp.state()=before_state,'descendant failure rolls back both official and personal writes');reset role;
end $$;
set local role socrates_migrator;
drop trigger zz_home117_failure on public.study_deck_personal_topic_preferences;
reset role;

-- Stable identities, no create/move propagation, structural stale rejection.
do $$ declare old_revision text; before_balance integer; begin
 set local role authenticated;
 perform public.set_study_deck_node_selection(pg_temp.id(90),pg_temp.id(20),true);
 perform pg_temp.reset(20,60);perform pg_temp.reset(24,80);
 old_revision:=pg_temp.state()->>'revision';
 reset role;
 insert into public.library_nodes(id,library_id,parent_id,name,node_type,sort_order) values(pg_temp.id(27),pg_temp.id(10),pg_temp.id(24),'ZZ HOME117 New Topic','topic',2);
 perform pg_temp.check_true(not exists(select 1 from public.study_deck_node_preferences where library_node_id=pg_temp.id(27)),'creation does not copy parent preference');
 perform pg_temp.check_true(pg_temp.value(27)=60 and not(pg_temp.state()#>'{projection,official}' ? pg_temp.id(27)::text),'new descendant retains released selected-ancestor fallback, not unselected parent customization');
 set local role authenticated;
 perform pg_temp.denied(format('select public.set_study_deck_topic_subtree_preference(%L,%L,%L,60,%L)',pg_temp.id(90),pg_temp.id(10),pg_temp.key(20),old_revision),'40001');
 reset role;
 update public.library_nodes set parent_id=pg_temp.id(24),sort_order=1 where id=pg_temp.id(23);
 perform pg_temp.check_true((select new_mastery_balance=60 from public.study_deck_node_preferences where library_node_id=pg_temp.id(23)),'move beneath 80 retains identity preference 60');
 perform pg_temp.check_true(pg_temp.value(23)=60 and pg_temp.state()#>>array['projection','official',pg_temp.id(23)::text,'origin']=pg_temp.id(23)::text,'moved identity remains an effective preference source without destination inheritance');
 update public.library_nodes set sort_order=2 where id=pg_temp.id(23);
 perform pg_temp.check_true((select new_mastery_balance=60 from public.study_deck_node_preferences where library_node_id=pg_temp.id(23)),'reorder retains preference');
 set local role authenticated;perform pg_temp.reset(24,80);reset role;
 perform pg_temp.check_true((select bool_and(new_mastery_balance=80) from public.study_deck_node_preferences where library_node_id in(pg_temp.id(23),pg_temp.id(27))),'future reset includes moved and newly current descendants');
 perform pg_temp.denied(format('delete from public.library_nodes where id=%L',pg_temp.id(27)),'23503');
 perform set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
 set local role authenticated;
 perform public.delete_development_content('library_node',pg_temp.id(27));
 reset role;
 perform pg_temp.check_true(not exists(select 1 from public.study_deck_node_preferences where library_node_id=pg_temp.id(27)),'official restrictive FK and existing Creator deletion cleanup preserved');
 perform set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
 set local role authenticated;
 delete from public.personal_topics where id=pg_temp.id(43) and owner_id=pg_temp.id(2);
 reset role;
 perform pg_temp.check_true(not exists(select 1 from public.study_deck_personal_topic_preferences where personal_topic_id=pg_temp.id(43)),'personal Topic FK cleanup preserved');
end $$;
rollback;
