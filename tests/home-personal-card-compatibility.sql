-- Run only against a clone of the established HOME117 synthetic fixture.
-- Every fixture extension, selection and structural change rolls back.
\set ON_ERROR_STOP on
begin;
do $$ begin
  if current_database() <> 'home118_card_compatibility'
    or not exists(select 1 from public.libraries where slug='zz-home117-a')
    or exists(select 1 from auth.users where email not like 'zz-home117-%@example.invalid')
  then raise exception 'Isolated HOME118 compatibility clone required'; end if;
end $$;
create function pg_temp.id(n integer) returns uuid language sql immutable as $$
 select ('11700000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
create function pg_temp.check_true(ok boolean,label text) returns void language plpgsql as $$ begin
 if ok is distinct from true then raise exception 'FAIL: %',label; end if;
 raise notice 'PASS: %',label;
end $$;
create function pg_temp.home(b boolean default false) returns jsonb language sql as $$
 select public.get_home_study_bootstrap(pg_temp.id(case when b then 11 else 10 end),pg_temp.id(case when b then 92 else 90 end));
$$;
create function pg_temp.material(b boolean default false) returns jsonb language sql as $$
 select jsonb_build_object('topics',h->'personal_topics','placements',h->'personal_topic_placements',
   'concepts',h->'personal_concepts','cards',h->'personal_cards','official',h->'library_availability_question_counts')
 from (select pg_temp.home(b) h) s;
$$;
create function pg_temp.denied(statement text) returns void language plpgsql as $$
 begin execute statement; raise exception 'Unexpected authorization success';
 exception when others then
  if sqlerrm='Unexpected authorization success' then raise; end if;
  if sqlerrm not in ('Active study deck not found.','Not authorized for this Library.','Not authorized to load Home study data.') then raise; end if;
 end;
$$;

select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
insert into public.personal_topics(id,owner_id,parent_id,name,sort_order)
 values(pg_temp.id(45),pg_temp.id(2),null,'ZZ HOME118 Library B branch',0)
 on conflict(id) do nothing;
insert into public.personal_topic_official_placements(personal_topic_id,owner_id,library_node_id)
 values(pg_temp.id(45),pg_temp.id(2),pg_temp.id(30)) on conflict(personal_topic_id) do nothing;
insert into public.personal_topics(id,owner_id,parent_id,name,sort_order) values
 (pg_temp.id(46),pg_temp.id(2),pg_temp.id(45),'ZZ HOME118 Library B child',0)
 on conflict(id) do nothing;
insert into public.personal_cards(id,owner_id,personal_topic_id,question,answer) values
 (pg_temp.id(83),pg_temp.id(2),pg_temp.id(46),'ZZ HOME118 B personal','Synthetic');
insert into public.personal_cards(id,owner_id,library_id,library_node_id,question,answer) values
 (pg_temp.id(84),pg_temp.id(2),pg_temp.id(11),pg_temp.id(30),'ZZ HOME118 B official','Synthetic');
select set_config('request.jwt.claim.sub',pg_temp.id(3)::text,true);
insert into public.personal_cards(id,owner_id,personal_topic_id,question,answer) values
 (pg_temp.id(86),pg_temp.id(3),pg_temp.id(44),'ZZ HOME118 other owner','Synthetic');
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
set constraints all immediate;

do $$ declare a jsonb; b jsonb; before_material jsonb; before_b jsonb; begin
 set local role authenticated;
 a:=pg_temp.home(); b:=pg_temp.home(true);
 perform pg_temp.check_true(jsonb_array_length(a->'personal_topics')=5,'A has all five owned in-Library personal Topics across multiple branches');
 perform pg_temp.check_true(jsonb_array_length(b->'personal_topics')=2,'B contains only its personal root and child');
 perform pg_temp.check_true(jsonb_array_length(a->'personal_topic_placements')=2 and jsonb_array_length(b->'personal_topic_placements')=1,'placements are scoped with their Topics');
 perform pg_temp.check_true(not exists(select 1 from jsonb_array_elements(a->'nodes') n where n->>'id'=pg_temp.id(30)::text)
   and jsonb_array_length(b->'nodes')=1,'official Library trees remain isolated');
 perform pg_temp.check_true(jsonb_array_length(a->'personal_cards')=3 and jsonb_array_length(b->'personal_cards')=2,'Home Cards scoped to owned visible attachments');
 perform pg_temp.check_true(exists(select 1 from jsonb_array_elements(a->'personal_cards') c where c->>'id'=pg_temp.id(81)::text and c->>'concept_id' is null and c->>'library_node_id'=pg_temp.id(22)::text and c->>'library_id'=pg_temp.id(10)::text),'official direct Card attachment survives bootstrap');
 perform pg_temp.check_true(exists(select 1 from jsonb_array_elements(a->'personal_cards') c where c->>'id'=pg_temp.id(82)::text and c->>'concept_id' is null and c->>'personal_topic_id'=pg_temp.id(42)::text),'personal direct Card attachment survives bootstrap');
 perform pg_temp.check_true(a->'personal_collections'=b->'personal_collections' and (a#>>'{personal_collections,0,card_count}')::integer=3,'owner-global collection availability remains independent');
 perform pg_temp.check_true(a=pg_temp.home(),'A → B → A is a stable read without writes');
 perform pg_temp.check_true((select count(*) from public.resolve_study_candidates(pg_temp.id(90)) where personal_card_id in(pg_temp.id(80),pg_temp.id(81),pg_temp.id(82)))=3,'legacy and both standalone Cards remain eligible under existing selections');
 perform pg_temp.check_true((a#>>array['library_availability_question_counts',pg_temp.id(50)::text])::integer=1
   and (a#>>array['library_availability_question_counts',pg_temp.id(51)::text])::integer=1,'multiply placed official Concept counts remain unchanged');
 before_material:=pg_temp.material(); before_b:=pg_temp.material(true);
 perform public.set_study_deck_personal_topic_selection(pg_temp.id(90),pg_temp.id(42),false);
 perform pg_temp.check_true(not exists(select 1 from public.resolve_study_candidates(pg_temp.id(90)) where personal_card_id in(pg_temp.id(80),pg_temp.id(82))),'personal exclusion still controls candidate eligibility');
 perform pg_temp.check_true(before_material=pg_temp.material(),'personal exclusion does not replace availability counts with selected counts');
 reset role;
 insert into public.study_deck_node_exclusions(deck_id,user_id,library_id,node_id)
 values(pg_temp.id(90),pg_temp.id(2),pg_temp.id(10),pg_temp.id(22)) on conflict do nothing;
 set local role authenticated;
 perform pg_temp.check_true(not exists(select 1 from public.resolve_study_candidates(pg_temp.id(90)) where personal_card_id=pg_temp.id(81)),'official exclusion still removes direct standalone candidate');
 perform pg_temp.check_true(before_material=pg_temp.material(),'official exclusion leaves availability unchanged');
 perform public.set_study_deck_personal_collection_selection(pg_temp.id(90),pg_temp.id(85),true);
 perform pg_temp.check_true((select count(*) from public.resolve_study_candidates(pg_temp.id(90)) where personal_card_id in(pg_temp.id(80),pg_temp.id(81),pg_temp.id(82)))=3,'collection independently restores Cards once, without duplicate candidates');
 perform pg_temp.check_true(before_material=pg_temp.material() and before_b=pg_temp.material(true),'selection/collection changes do not leak or rewrite either Library projection');
 -- Keep the older owner-global personal-selection contract exactly as released.
 perform public.set_study_deck_personal_topic_selection(pg_temp.id(90),pg_temp.id(45),true);
 perform pg_temp.check_true(exists(select 1 from public.resolve_study_candidates(pg_temp.id(90)) where personal_card_id=pg_temp.id(83)),'owner-global personal Study contract remains unchanged');
 perform pg_temp.check_true(before_material=pg_temp.material(),'older Study contract does not import foreign branches into Home');
 reset role;
end $$;

do $$ declare before_material jsonb; begin
 before_material:=pg_temp.material();
 set local role authenticated;
 perform public.set_study_deck_personal_collection_selection(pg_temp.id(90),pg_temp.id(85),false);
 perform public.set_study_deck_personal_topic_selection(pg_temp.id(90),pg_temp.id(40),false);
 perform public.set_study_deck_personal_topic_selection(pg_temp.id(90),pg_temp.id(45),false);
 reset role;
 delete from public.user_study_node_selections where deck_id=pg_temp.id(90) and user_id=pg_temp.id(2);
 set local role authenticated;
 perform pg_temp.check_true(not exists(select 1 from public.resolve_study_candidates(pg_temp.id(90))),'unselected deck has no candidates');
 perform pg_temp.check_true(before_material=pg_temp.material(),'completely unselected deck retains availability of every branch');
 reset role;
end $$;

-- Structural mutations use the already-released optimistic-positioning command.
do $$ declare before_cards jsonb; begin
 set local role authenticated;
 before_cards:=pg_temp.home()->'personal_cards';
 perform public.position_personal_topic(pg_temp.id(42),pg_temp.id(41),pg_temp.id(43),null,null,null,array[pg_temp.id(42)],'{}'::uuid[]);
 perform pg_temp.check_true(exists(select 1 from jsonb_array_elements(pg_temp.home()->'personal_topics') t where t->>'id'=pg_temp.id(42)::text and t->>'parent_id'=pg_temp.id(43)::text),'move preserves authoritative parent in projection');
 perform pg_temp.check_true(pg_temp.home()->'personal_cards'=before_cards,'move retains identity-based Card attachments');
 perform public.position_personal_topic(pg_temp.id(43),pg_temp.id(40),pg_temp.id(40),null,null,pg_temp.id(41),array[pg_temp.id(41),pg_temp.id(43)],array[pg_temp.id(41),pg_temp.id(43)]);
 perform pg_temp.check_true(pg_temp.home()->'personal_cards'=before_cards,'sibling reorder retains Card identities');
 reset role;
end $$;

-- An empty Topic may be created/deleted without leaving Home projection residue.
insert into public.personal_topics(id,owner_id,parent_id,name,sort_order)
 values(pg_temp.id(47),pg_temp.id(2),pg_temp.id(40),'ZZ HOME118 empty',5);
select pg_temp.check_true(exists(select 1 from jsonb_array_elements(pg_temp.home()->'personal_topics') t where t->>'id'=pg_temp.id(47)::text),'empty Topic remains present');
delete from public.personal_topics where id=pg_temp.id(47) and owner_id=pg_temp.id(2);
select pg_temp.check_true(not exists(select 1 from jsonb_array_elements(pg_temp.home()->'personal_topics') t where t->>'id'=pg_temp.id(47)::text),'deleted empty Topic leaves no projection residue');

select set_config('request.jwt.claim.sub',pg_temp.id(3)::text,true);
set local role authenticated;
select pg_temp.check_true(jsonb_array_length(public.get_home_study_bootstrap(pg_temp.id(10),pg_temp.id(91))->'personal_topics')=1,'second owner sees only their own branch');
select pg_temp.denied(format('select public.get_home_study_bootstrap(%L,%L)',pg_temp.id(10),pg_temp.id(90)));
select pg_temp.denied(format('select public.get_home_study_bootstrap(%L,%L)',pg_temp.id(11),pg_temp.id(92)));
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role authenticated;
select pg_temp.denied(format('select public.get_home_study_bootstrap(%L,%L)',pg_temp.id(10),pg_temp.id(90)));
reset role;
select pg_temp.check_true(true,'foreign deck/Library and unauthenticated context rejected');

-- Do not hide a truly broken canonical root. Deferred invalid fixture is never committed.
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
set constraints all deferred;
insert into public.personal_topics(id,owner_id,parent_id,name,sort_order)
 values(pg_temp.id(48),pg_temp.id(2),null,'ZZ HOME118 deliberately unplaced',9);
select pg_temp.check_true(exists(select 1 from jsonb_array_elements(pg_temp.home()->'personal_topics') t where t->>'id'=pg_temp.id(48)::text)
 and not exists(select 1 from jsonb_array_elements(pg_temp.home()->'personal_topic_placements') p where p->>'personal_topic_id'=pg_temp.id(48)::text),'invalid unplaced root retained for canonical fail-closed check');
rollback;
