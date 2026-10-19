-- Rollback-only ordering regression, using the existing synthetic 132/133
-- baseline. Run before and after installing 134; the unordered reader fails
-- the saved-position assertion. Never run against a hosted database.
\set ON_ERROR_STOP on
begin;
\o /dev/null
do $$begin
 if current_database() !~ '^topic_detachment_' or not exists(select 1 from auth.users)
 or exists(select 1 from auth.users where email not like 'zz-shared122-%@example.invalid') then
  raise exception 'Isolated synthetic database required'; end if;
end$$;
create function pg_temp.id(n integer) returns uuid language sql immutable as $$select ('12200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create temp table checks(label text primary key);
grant select,insert on checks to authenticated;
create function pg_temp.ok(value boolean,label text) returns void language plpgsql as $$begin
 if value is distinct from true then raise exception 'FAILED: %',label; end if;
 insert into checks values(label);
end$$;
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
insert into public.library_nodes(id,library_id,parent_id,name,node_type,sort_order) values
 (pg_temp.id(200),pg_temp.id(10),pg_temp.id(26),'Ordering fixture','topic',4),
 (pg_temp.id(210),pg_temp.id(10),pg_temp.id(200),'Zulu first','topic',2),
 (pg_temp.id(211),pg_temp.id(10),pg_temp.id(210),'Zulu tied first','topic',0),
 (pg_temp.id(212),pg_temp.id(10),pg_temp.id(210),'Alpha tied second','topic',0),
 (pg_temp.id(213),pg_temp.id(10),pg_temp.id(211),'Deep descendant','topic',0),
 (pg_temp.id(220),pg_temp.id(10),pg_temp.id(200),'Alpha last','topic',10);
set local role authenticated;
select public.change_official_topic_location(pg_temp.id(10),pg_temp.id(210),pg_temp.id(220),'duplicate','this',false,null,
 public.get_official_topic_graph(pg_temp.id(10))->>'revision');
reset role;
create temp table fixture_alias as select id from public.official_topic_locations where topic_id=pg_temp.id(210) and not is_original;
grant select on fixture_alias to authenticated;
-- Source-qualified identities must also work when the UUIDs coincide.
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
insert into public.personal_topics(id,owner_id,parent_id,name,sort_order) values
 (pg_temp.id(200),pg_temp.id(2),null,'Personal ordering fixture',4),
 (pg_temp.id(410),pg_temp.id(2),pg_temp.id(200),'Zulu first',2),
 (pg_temp.id(420),pg_temp.id(2),pg_temp.id(200),'Alpha last',10),
 (pg_temp.id(411),pg_temp.id(2),pg_temp.id(410),'Zulu tie',0),
 (pg_temp.id(412),pg_temp.id(2),pg_temp.id(410),'Alpha tie',0),
 (pg_temp.id(413),pg_temp.id(2),pg_temp.id(411),'Deep personal descendant',0);
insert into public.personal_topic_official_placements(personal_topic_id,owner_id,library_node_id)
 values(pg_temp.id(200),pg_temp.id(2),pg_temp.id(26));
set constraints all immediate;
set local role authenticated;
select public.save_placement_study_goal(pg_temp.id(10),'Ordering proof goal',current_date+30,'coverage',array[pg_temp.id(210)],array[pg_temp.id(200)]);
reset role;
create temp table before_locations as select to_jsonb(l) data from public.official_topic_locations l;
create temp table before_preferences as select to_jsonb(p) data from public.study_deck_node_preferences p;
create temp table before_goals as select to_jsonb(g) data from public.study_goals g;
create temp table snapshots(label text primary key,value jsonb);
grant all on snapshots to authenticated;
set local role authenticated;
insert into snapshots values('first',public.get_study_goals(pg_temp.id(10)));
set local enable_hashjoin=off;
set local enable_seqscan=off;
insert into snapshots values('alternate_plan',public.get_study_goals(pg_temp.id(10)));
select pg_temp.ok((select value from snapshots where label='first')=(select value from snapshots where label='alternate_plan'),
 'Topic order and Goal progress remain stable across planner choices');
select pg_temp.ok((select array_agg((t->>'id')::uuid order by ord) from snapshots s,
 jsonb_array_elements(s.value->'topics') with ordinality a(t,ord) where s.label='first' and t->>'source'='official'
 and ((t->>'id')::uuid=any(array[pg_temp.id(200),pg_temp.id(210),pg_temp.id(211),pg_temp.id(212),pg_temp.id(213),pg_temp.id(220)])
 or (t->>'id')::uuid=(select id from fixture_alias)))=
 array[pg_temp.id(200),pg_temp.id(210),pg_temp.id(211),pg_temp.id(213),pg_temp.id(212),pg_temp.id(220),(select id from fixture_alias)],
 'Official Topics follow saved sibling positions and placement-ID ties in depth-first order');
select pg_temp.ok((select array_agg((t->>'id')::uuid order by ord) from snapshots s,
 jsonb_array_elements(s.value->'topics') with ordinality a(t,ord) where s.label='first' and t->>'source'='personal'
 and (t->>'id')::uuid=any(array[pg_temp.id(200),pg_temp.id(410),pg_temp.id(411),pg_temp.id(412),pg_temp.id(413),pg_temp.id(420)]))=
 array[pg_temp.id(200),pg_temp.id(410),pg_temp.id(412),pg_temp.id(411),pg_temp.id(413),pg_temp.id(420)],
 'Personal Topics follow saved positions and existing name ties without flattening descendants');
select pg_temp.ok((select count(*) from snapshots s,jsonb_array_elements(s.value->'topics') t
 where s.label='first' and t->>'id'=pg_temp.id(200)::text)=2,'Source-qualified UUID collision retains both Topics');
select pg_temp.ok((select t->>'parent_id'=pg_temp.id(220)::text and t->>'topic_id'=pg_temp.id(210)::text
 and t->>'path' like '%Alpha last › Zulu first' from snapshots s,jsonb_array_elements(s.value->'topics') t
 where s.label='first' and t->>'id'=(select id::text from fixture_alias)),
 'Shared location retains its distinct parent path and canonical identity');
select pg_temp.ok(not exists(select 1 from snapshots s,jsonb_array_elements(s.value->'topics') t
 where s.label='first' and t->>'parent_id'=(select id::text from fixture_alias)),
 'Shared placement does not acquire the original placement children');
-- The comparison helper is deliberately internal; do not grant it to clients.
reset role;
select pg_temp.ok((select jsonb_agg(t order by t->>'source',t->>'id') from snapshots s,jsonb_array_elements(s.value->'topics') t where s.label='first')=
 (select jsonb_agg(to_jsonb(t) order by t.source,t.id) from public.m132_goal_topics(pg_temp.id(10)) t),
 'Ordering preserves every Topic record field and adds no duplicate or missing rows');
set local role authenticated;
select pg_temp.ok(not exists(select 1 from snapshots s,jsonb_array_elements(s.value->'topics') t
 where s.label='first' and t->>'source'='personal' and t->>'id'=pg_temp.id(44)::text),
 'Ordering does not expose another learner personal Topics');
reset role;
select pg_temp.ok(not exists((select data from before_locations except select to_jsonb(l) from public.official_topic_locations l)
 union all (select to_jsonb(l) from public.official_topic_locations l except select data from before_locations)),
 'Goal reads leave canonical placement data unchanged');
select pg_temp.ok(not exists((select data from before_preferences except select to_jsonb(p) from public.study_deck_node_preferences p)
 union all (select to_jsonb(p) from public.study_deck_node_preferences p except select data from before_preferences)),
 'Goal reads leave all slider preferences unchanged');
select pg_temp.ok(not exists((select data from before_goals except select to_jsonb(g) from public.study_goals g)
 union all (select to_jsonb(g) from public.study_goals g except select data from before_goals)),
 'Goal reads leave selection and saved Goal records unchanged');
\o
select jsonb_build_object('passed',count(*),'checks',jsonb_agg(label order by label)) from checks;
rollback;
