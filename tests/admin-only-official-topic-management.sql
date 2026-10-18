-- Disposable fixtures only. Run under the rollback-only authorization proof runner.
do $fixture$ begin
 if (select count(*) from auth.users) <> 4 or not (select bool_and(email like 'zz-shared122-%@example.invalid') from auth.users) then
  raise exception 'Refusing role checks outside the isolated synthetic fixture';
 end if;
end $fixture$;
-- Executed only inside an enclosing rollback transaction on the synthetic clone.
create function pg_temp.id(n integer) returns uuid language sql immutable as $$
 select ('12200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
create temp table checks(label text primary key);
create temp table saved(key text primary key, value uuid);
grant all on checks,saved to authenticated,anon,service_role;
create function pg_temp.ok(value boolean,label text) returns void language plpgsql as $$
begin
 if value is distinct from true then raise exception 'FAILED: %',label;end if;
 insert into checks values(label);
end $$;
create function pg_temp.reject(statement text,expected text,label text) returns void language plpgsql as $$
declare rejected boolean:=false;
begin
 begin execute statement;
 exception when others then
  if sqlstate<>expected then raise exception 'FAILED %: expected %, got %',label,expected,sqlstate;end if;
  rejected:=true;
 end;
 perform pg_temp.ok(rejected,label);
end $$;
create function pg_temp.revision() returns text language sql as $$
 select public.get_official_topic_graph(pg_temp.id(10))->>'revision';
$$;
create function pg_temp.change(source uuid,destination uuid,action text) returns jsonb language sql as $$
 select public.change_official_topic_location(pg_temp.id(10),source,destination,action,'this',false,null,pg_temp.revision());
$$;

select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
set local role authenticated;
select pg_temp.ok(public.is_admin(),'active Administrator verified');
select public.create_official_topic_at_location(pg_temp.id(10),pg_temp.id(26),'Admin role review topic','this',pg_temp.revision());
insert into saved select 'new',id from public.library_nodes where name='Admin role review topic';
select pg_temp.ok((select count(*)=1 from saved where key='new'),'Administrator can create an official Topic');
select pg_temp.change(pg_temp.id(21),pg_temp.id(26),'duplicate');
insert into saved select 'alias',id from public.official_topic_locations where topic_id=pg_temp.id(21) and parent_location_id=pg_temp.id(26);
select pg_temp.ok((select count(*)=1 from saved where key='alias'),'Administrator can duplicate a placement');
select pg_temp.change(pg_temp.id(23),pg_temp.id(26),'move');
select pg_temp.ok((select parent_location_id=pg_temp.id(26) from public.official_topic_locations where id=pg_temp.id(23)),'Administrator can move a placement');
select pg_temp.change((select value from saved where key='alias'),null,'remove');
select pg_temp.ok(not exists(select 1 from public.official_topic_locations where id=(select value from saved where key='alias')),'Administrator can remove a duplicate placement');
select public.rename_library_node_in_library(pg_temp.id(10),(select value from saved where key='new'),'Admin renamed review topic');
select pg_temp.ok((select name='Admin renamed review topic' from public.library_nodes where id=(select value from saved where key='new')),'Administrator can rename an official Topic');
select pg_temp.reject(format('select pg_temp.change(%L,%L,''duplicate'')',pg_temp.id(21),pg_temp.id(30)),'42501','cross-Library destination remains denied');

select set_config('request.jwt.claim.sub',pg_temp.id(4)::text,true);
select pg_temp.ok(public.is_editor_or_admin() and not public.is_admin(),'legacy Editor role itself is unchanged');
select pg_temp.reject(format('select pg_temp.change(%L,%L,''duplicate'')',pg_temp.id(21),pg_temp.id(26)),'42501','Editor duplicate RPC denied');
select pg_temp.reject(format('select pg_temp.change(%L,%L,''move'')',pg_temp.id(22),pg_temp.id(26)),'42501','Editor move RPC denied');
select pg_temp.reject(format('select pg_temp.change(%L,null,''remove'')',pg_temp.id(22)),'42501','Editor remove RPC denied');
select pg_temp.reject(format('select public.create_official_topic_at_location(%L,%L,''Blocked child'',''this'',pg_temp.revision())',pg_temp.id(10),pg_temp.id(26)),'42501','Editor location-aware creation denied');
select pg_temp.reject(format('select public.create_library_node_in_library(%L,%L,''Blocked legacy child'',''topic'',0)',pg_temp.id(10),pg_temp.id(26)),'42501','Editor legacy creation denied');
select pg_temp.reject(format('select public.rename_library_node_in_library(%L,%L,''Blocked rename'')',pg_temp.id(10),(select value from saved where key='new')),'42501','Editor legacy rename denied');
select pg_temp.reject(format('select public.delete_empty_library_node_in_library(%L,%L)',pg_temp.id(10),(select value from saved where key='new')),'42501','Editor legacy deletion and cascading placement removal denied');
select pg_temp.reject(format('insert into public.library_nodes(library_id,parent_id,name,node_type,sort_order) values(%L,%L,''Blocked direct child'',''topic'',99)',pg_temp.id(10),pg_temp.id(26)),'42501','Editor direct Topic insert denied');
select pg_temp.reject(format('update public.library_nodes set name=''Blocked direct rename'' where id=%L',(select value from saved where key='new')),'42501','Editor direct Topic update denied');
select pg_temp.reject(format('delete from public.library_nodes where id=%L',(select value from saved where key='new')),'42501','Editor direct Topic delete denied');
select pg_temp.reject(format('delete from public.official_topic_locations where id=%L',pg_temp.id(22)),'42501','Editor direct placement delete denied');
select pg_temp.reject('truncate public.official_topic_locations cascade','42501','Editor placement truncation denied');

select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
select pg_temp.reject(format('select pg_temp.change(%L,%L,''duplicate'')',pg_temp.id(21),pg_temp.id(26)),'42501','User official placement RPC denied');
select pg_temp.reject(format('insert into public.library_nodes(library_id,parent_id,name,node_type,sort_order) values(%L,%L,''Blocked user child'',''topic'',99)',pg_temp.id(10),pg_temp.id(26)),'42501','User direct official Topic creation denied');
insert into saved select 'personal-topic',id from public.create_personal_topic('Owner role review topic',pg_temp.id(42),null,0);
select pg_temp.ok((select owner_id=pg_temp.id(2) from public.personal_topics where id=(select value from saved where key='personal-topic')),'User can create an owned personal Topic');
with card as (
 insert into public.personal_cards(owner_id,question,answer,personal_topic_id)
 values(pg_temp.id(2),'Synthetic role review question','Synthetic role review answer',(select value from saved where key='personal-topic')) returning id
) insert into saved select 'personal-card',id from card;
select pg_temp.ok((select count(*)=1 from personal_cards where id=(select value from saved where key='personal-card')),'User can create an owned personal Card');
update public.personal_cards set answer='Updated synthetic answer' where id=(select value from saved where key='personal-card');
select pg_temp.ok((select answer='Updated synthetic answer' from public.personal_cards where id=(select value from saved where key='personal-card')),'User can edit an owned personal Card');
update public.personal_topics set name='Updated owned review topic',parent_id=pg_temp.id(41) where id=(select value from saved where key='personal-topic');
select pg_temp.ok((select name='Updated owned review topic' and parent_id=pg_temp.id(41) from public.personal_topics where id=(select value from saved where key='personal-topic')),'User can rename and organize an owned personal Topic');
select pg_temp.reject(format('insert into public.personal_cards(owner_id,question,answer,personal_topic_id) values(%L,''Forged owner'',''Blocked'',%L)',pg_temp.id(3),pg_temp.id(44)),'42501','cross-account personal Card creation remains denied');
delete from public.personal_cards where id=(select value from saved where key='personal-card');
select pg_temp.ok(not exists(select 1 from public.personal_cards where id=(select value from saved where key='personal-card')),'User can delete an owned personal Card');
select pg_temp.ok(not exists(select 1 from public.official_topic_locations where library_id=pg_temp.id(999)),'unknown Library yields no placement rows');
select public.set_study_deck_location_selection(pg_temp.id(90),pg_temp.id(20),true,pg_temp.revision());
select pg_temp.ok((select included from public.study_deck_location_selections where deck_id=pg_temp.id(90) and location_id=pg_temp.id(20)),'User Study inclusion remains available');
select public.set_study_deck_location_preference(pg_temp.id(90),pg_temp.id(10),pg_temp.id(22),53,
 public.get_home_study_bootstrap(pg_temp.id(10),pg_temp.id(90))#>>'{unified_deck_settings,topic_preference_state,revision}');
select pg_temp.ok((select new_mastery_balance=53 from public.study_deck_node_preferences where deck_id=pg_temp.id(90) and library_node_id=pg_temp.id(22)),'User slider preference writes remain available');

select set_config('request.jwt.claim.sub','',true);
set local role anon;
select pg_temp.reject(format('select pg_temp.change(%L,%L,''duplicate'')',pg_temp.id(21),pg_temp.id(26)),'42501','anonymous placement management denied');
select pg_temp.reject('select * from public.official_topic_locations','42501','anonymous placement reads remain denied');
reset role;
set constraints all immediate;
savepoint inactive_admin;
update public.account_deletion_state set state='pending',receipt_hash=repeat('a',64),requested_at=now() where user_id=pg_temp.id(1);
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
set local role authenticated;
select pg_temp.reject(format('select pg_temp.change(%L,%L,''duplicate'')',pg_temp.id(21),pg_temp.id(26)),'42501','inactive Administrator is denied');
reset role;
-- Restore the active fixture before exercising trusted maintenance.
reset role;
rollback to inactive_admin;
-- Record inactive denial again outside its savepoint for the final count.
select pg_temp.ok(true,'inactive Administrator is denied (prior savepoint assertion passed)');
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
set constraints all deferred;
insert into public.library_nodes(library_id,parent_id,name,node_type,sort_order)
 values(pg_temp.id(10),pg_temp.id(26),'Trusted maintenance fixture','topic',99);
insert into saved select 'maintenance',id from public.library_nodes where name='Trusted maintenance fixture';
select pg_temp.ok((select count(*)=1 from saved where key='maintenance'),'direct trusted database maintenance can create canonical Topic and location');
update public.library_nodes set name='Trusted maintenance renamed' where id=(select value from saved where key='maintenance');
update public.official_topic_locations set sort_order=98 where id=(select value from saved where key='maintenance');
select pg_temp.ok((select name='Trusted maintenance renamed' from public.library_nodes where id=(select value from saved where key='maintenance')),'direct trusted database maintenance can update Topic');
select pg_temp.ok((select sort_order=98 from public.official_topic_locations where id=(select value from saved where key='maintenance')),'direct trusted database maintenance can update location');
set local role socrates_migrator;
update public.official_topic_placements set sort_order=sort_order where false;
reset role;
select pg_temp.ok(true,'existing migration-owner operations remain available');
set local role authenticated;
select pg_temp.reject('update public.library_nodes set name=name where false','42501','application role cannot borrow trusted postgres session without JWT');
select set_config('socrates.maintenance','true',true);
select set_config('request.jwt.claims','{"role":"postgres"}',true);
select pg_temp.reject('update public.library_nodes set name=name where false','42501','forged maintenance setting and JWT role cannot grant database maintenance');
reset role;
select set_config('request.jwt.claims','{}',true);
set local role service_role;
select pg_temp.reject('update public.library_nodes set name=name where false','42501','service-role token does not gain maintenance exception');
reset role;
select pg_temp.ok(not pg_has_role('authenticator','postgres','MEMBER') and not pg_has_role('authenticator','socrates_migrator','MEMBER'),'Data API login cannot become trusted maintenance');
select pg_temp.ok(not has_function_privilege('authenticated','public.m133_admin_topic_write_guard()','EXECUTE') and not has_function_privilege('anon','public.m133_admin_topic_write_guard()','EXECUTE') and not has_function_privilege('service_role','public.m133_admin_topic_write_guard()','EXECUTE'),'write guard is not callable by browser or service role');
-- A real Data API login cannot use a SECURITY DEFINER owner as maintenance identity.
set session authorization authenticator;
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id(4)::text,true);
select pg_temp.reject(format('select public.rename_library_node_in_library(%L,%L,''Blocked via actual API login'')',pg_temp.id(10),(select value from saved where key='new')),'42501','actual Data API login cannot use definer ownership as maintenance');
select set_config('request.jwt.claim.sub','',true);
select pg_temp.reject('update public.library_nodes set name=name where false','42501','actual Data API login without identity remains denied');
reset role;
reset session authorization;
-- Model the existing provider CLI login: membership is a database grant, never a JWT claim.
create role socrates_compatibility_backup_login nologin;
grant postgres to socrates_compatibility_backup_login;
set session authorization socrates_compatibility_backup_login;
set local role postgres;
update public.library_nodes set name='Trusted delegated maintenance' where id=(select value from saved where key='maintenance');
reset role;
reset session authorization;
select pg_temp.ok((select name='Trusted delegated maintenance' from public.library_nodes where id=(select value from saved where key='maintenance')),'authorized delegated database login retains maintenance access');
set constraints all immediate;

\o
select jsonb_build_object('passed',count(*),'checks',jsonb_agg(label order by label)) from checks;
\o /dev/null
