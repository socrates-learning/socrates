-- Disposable synthetic fixture only; no Production data or persistent changes.
\set ON_ERROR_STOP on
begin;
\o /dev/null
set local role postgres;
do $$begin
 if current_database() !~ '^locations132_' or (select count(*) from auth.users)<>4
 or exists(select 1 from auth.users where email not like 'zz-shared122-%@example.invalid') then
  raise exception 'Dedicated synthetic locations132 database required';
 end if;
end$$;
create function pg_temp.id(n integer) returns uuid language sql immutable as $$select ('12200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
insert into public.library_nodes(id,library_id,parent_id,name,node_type,sort_order)
values(pg_temp.id(27),pg_temp.id(10),pg_temp.id(22),'Synthetic deep compatibility leaf','topic',0);
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
insert into public.study_deck_node_preferences(deck_id,user_id,library_id,library_node_id,new_mastery_balance,reset_source)
select pg_temp.id(90),pg_temp.id(2),pg_temp.id(10),pg_temp.id(n),v,pg_temp.id(n)
from (values(20,65),(21,35),(22,77),(27,22)) x(n,v)
on conflict(deck_id,library_node_id) do update set new_mastery_balance=excluded.new_mastery_balance,reset_source=excluded.reset_source,shared_compatibility_source=null;
create temp table saved_preferences as select to_jsonb(p) value from public.study_deck_node_preferences p where deck_id=pg_temp.id(90);
create temp table checks(label text primary key);
create function pg_temp.check_state(label text,topics integer[],states boolean[],expected integer[]) returns void language plpgsql as $$
declare actual integer[];i integer;s jsonb;
begin
 delete from public.study_deck_location_selections where deck_id=pg_temp.id(90);
 delete from public.user_study_node_selections where deck_id=pg_temp.id(90);
 delete from public.study_deck_node_exclusions where deck_id=pg_temp.id(90);
 for i in 1..coalesce(array_length(topics,1),0) loop
  perform public.set_study_deck_node_selection(pg_temp.id(90),pg_temp.id(topics[i]),states[i]);
 end loop;
 s:=public.m117_preference_state(pg_temp.id(90));
 select array_agg((s->'values'->>('official:topic:'||pg_temp.id(n)))::integer order by position)
 into actual from unnest(array[20,21,22,27]) with ordinality x(n,position);
 if actual is distinct from expected then raise exception 'FAILED %: expected %, got %',label,expected,actual;end if;
 if exists(select value from saved_preferences except select to_jsonb(p) from public.study_deck_node_preferences p where deck_id=pg_temp.id(90))
 or exists(select to_jsonb(p) from public.study_deck_node_preferences p where deck_id=pg_temp.id(90) except select value from saved_preferences) then
  raise exception 'Stored preferences changed during %',label;end if;
 insert into checks values(label);
end$$;
select pg_temp.check_state('no selected Topics retain effective 50','{}','{}',array[50,50,50,50]);
select pg_temp.check_state('selected parent preserves distinct saved descendants',array[20],array[true],array[65,35,77,22]);
select pg_temp.check_state('individually selected child beneath unchecked root',array[21],array[true],array[50,35,77,22]);
select pg_temp.check_state('deep selection beneath unchecked ancestors',array[27],array[true],array[50,50,50,22]);
select pg_temp.check_state('excluded child inherits selected ancestor balance',array[20,21],array[true,false],array[65,65,65,65]);
select pg_temp.check_state('explicitly excluded root permits child selection',array[20,21],array[false,true],array[50,35,77,22]);
select pg_temp.check_state('selected deep descendant beneath excluded child',array[20,21,27],array[true,false,true],array[65,65,65,22]);
select pg_temp.check_state('uncheck and recheck restore saved descendant balances',array[20,21,21],array[true,false,true],array[65,35,77,22]);
select pg_temp.check_state('second uncheck retains saved values',array[20,21,21,21],array[true,false,true,false],array[65,65,65,65]);
-- Exclusion controls Study eligibility independently of the displayed balance.
do $$begin
 if exists(select 1 from public.m122_effective_nodes(pg_temp.id(90)) where node_id in(pg_temp.id(21),pg_temp.id(22),pg_temp.id(27))) then
  raise exception 'Excluded subtree became eligible';end if;
end$$;
insert into checks values('excluded subtree remains excluded from Study');
\o
select jsonb_build_object('passed',count(*),'checks',jsonb_agg(label order by label)) from checks;
rollback;
