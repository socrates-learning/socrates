-- LOCAL ONLY: disposable Supabase-compatible database; every fixture rolls back.
\set ON_ERROR_STOP on
begin;
\o /dev/null
do $$begin
 if current_database() <> 'learner_card_movement_search' or exists(
  select 1 from auth.users where email !~ '@(example|preview)\.invalid$'
 ) then raise exception 'Isolated synthetic database required'; end if;
end$$;
create temp table checks(label text primary key);
create temp table fixtures(role_name text primary key, owner_id uuid, topic_id uuid, concept_id uuid, legacy_card uuid, topic_card uuid, official_card uuid);
create temp table libraries(kind text primary key, id uuid, root_id uuid);
grant select,insert on checks to authenticated,anon;
grant select on fixtures,libraries to authenticated,anon;
create function pg_temp.ok(value boolean,label text) returns void language plpgsql as $$begin
 if value is distinct from true then raise exception 'FAILED: %',label;end if;
 insert into checks values(label);
end$$;
create function pg_temp.reject(statement text,expected text,label text) returns void language plpgsql as $$
declare failed boolean:=false;
begin
 begin execute statement;exception when others then
  if sqlstate<>expected then raise exception 'FAILED %: expected %, got %: %',label,expected,sqlstate,sqlerrm;end if;
  failed:=true;
 end;
 perform pg_temp.ok(failed,label);
end$$;
create function pg_temp.sign_in(id uuid) returns void language plpgsql as $$begin
 perform set_config('request.jwt.claim.sub',coalesce(id::text,''),true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','authenticated')::text,true);
end$$;

-- Trusted fixture setup represents pre-existing historical personal Cards.
-- All tested commands below run as the ordinary authenticated database role.
insert into fixtures(role_name,owner_id) select role_name,gen_random_uuid()
 from unnest(array['admin','learner','editor','other','inactive','inactive_admin','unapproved']) role_name;
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 select owner_id,'authenticated','authenticated','zz-card135-'||owner_id||'@example.invalid','',now(),'{}','{}',now(),now() from fixtures;
insert into public.user_roles(user_id,role)
 select owner_id,case when role_name in('other','inactive') then 'learner' when role_name='inactive_admin' then 'admin' else role_name end from fixtures where role_name<>'unapproved';
insert into libraries select kind,gen_random_uuid(),gen_random_uuid() from unnest(array['allowed','foreign','inactive']) kind;
select pg_temp.sign_in((select owner_id from fixtures where role_name='admin'));
insert into public.libraries(id,name,slug,status) select id,'ZZ Card135 '||kind,'zz-card135-'||id,'active' from libraries;
insert into public.library_nodes(id,library_id,parent_id,name,node_type) select root_id,id,null,'ZZ Card135 root','section' from libraries;
insert into public.user_libraries(user_id,library_id,is_primary,assigned_by)
 select f.owner_id,l.id,true,(select owner_id from fixtures where role_name='admin') from fixtures f cross join libraries l where l.kind='allowed';
do $$declare f record;t uuid;c uuid;legacy uuid;personal uuid;official uuid;
begin
 for f in select * from fixtures where role_name<>'unapproved' loop
  perform pg_temp.sign_in(f.owner_id);
  select id into t from public.create_personal_topic('ZZ owned Topic',null,(select root_id from libraries where kind='allowed'),0);
  insert into public.personal_concepts(owner_id,topic_id,name) values(f.owner_id,t,'ZZ historical Concept') returning id into c;
  insert into public.personal_cards(owner_id,concept_id,question,answer) values(f.owner_id,c,'Historical literal front','Historical literal back') returning id into legacy;
  insert into public.personal_cards(owner_id,personal_topic_id,question,answer) values(f.owner_id,t,'**Historical Markdown front**','Historical back') returning id into personal;
  insert into public.personal_cards(owner_id,library_node_id,library_id,question,answer)
   select f.owner_id,root_id,id,'Historical official-context Card','Historical back' from libraries where kind='allowed' returning id into official;
  update fixtures set topic_id=t,concept_id=c,legacy_card=legacy,topic_card=personal,official_card=official where owner_id=f.owner_id;
 end loop;
end$$;
update public.libraries set status='inactive' where id=(select id from libraries where kind='inactive');
insert into public.testing_angle_vocabulary(storage_key,display_name,status,reserved_names,sort_order)
 values('General Understanding','General Understanding','active',array['general understanding'],0) on conflict do nothing;

create temp table movement_fixture(destination uuid, shared_topic uuid, shared_location uuid, deck uuid);
select pg_temp.sign_in((select owner_id from fixtures where role_name='learner'));
update public.personal_cards set source_reference='Synthetic handbook / original reference' where id=(select topic_card from fixtures where role_name='learner');
grant select on movement_fixture to authenticated;
do $$declare f record; l uuid; r uuid; a uuid; b uuid; shared uuid; destination uuid; deck uuid; session uuid; c uuid;
begin
 select id,root_id into l,r from libraries where kind='allowed';
 select * into f from fixtures where role_name='learner';
 perform pg_temp.sign_in((select owner_id from fixtures where role_name='admin'));
 select id into a from public.create_library_node_in_library(l,r,'ZZ Branch A');
 select id into b from public.create_library_node_in_library(l,r,'ZZ Branch B');
 select id into shared from public.create_library_node_in_library(l,a,'ZZ Shared Topic');
 perform public.change_official_topic_location(l,shared,b,'duplicate','this',false,null,public.m132_graph_revision(l));
 c:=(public.save_concept_with_prerequisites(null,'ZZ protected official Concept','Synthetic explanation',l,array[shared],array[]::uuid[],'published','[]','[]')->>'concept_id')::uuid;
 perform public.save_question_with_relationships_v2(null,c,'short_answer','ZZ protected Question',null,'published',null,0,'medium','General Understanding','[{"answer_text":"Synthetic answer","is_primary":true}]','[]',null,null,l);
 perform pg_temp.sign_in(f.owner_id);
 select id into destination from public.create_personal_topic('ZZ nested destination',f.topic_id,null,0);
 insert into public.study_decks(user_id,library_id,name) values(f.owner_id,l,'ZZ Movement deck') returning id into deck;
 perform public.set_study_deck_location_selection(deck,r,true,public.m132_graph_revision(l));
 perform public.set_study_deck_personal_topic_selection(deck,f.topic_id,true);
 insert into public.study_sessions(user_id,library_id,study_deck_id,answered_count,ended_at)
 values(f.owner_id,l,deck,2,now()) returning id into session;
 insert into public.personal_review_attempts(user_id,study_session_id,study_deck_id,personal_card_id,personal_concept_id,result,sequence_position)
 values(f.owner_id,session,deck,f.legacy_card,f.concept_id,'easy',1),(f.owner_id,session,deck,f.topic_card,null,'easy',2);
 insert into public.user_personal_concept_state(user_id,personal_concept_id,evidence_count,positive_evidence_count,negative_evidence_count,consecutive_success_count,consecutive_lapse_count,last_result,last_reviewed_at)
 values(f.owner_id,f.concept_id,1,1,0,1,0,'easy',now());
 insert into movement_fixture values(destination,shared,(select id from public.official_topic_locations where topic_id=shared and not is_original),deck);
end$$;
create function pg_temp.protected_data() returns jsonb language plpgsql as $$
declare t text; data jsonb; result jsonb:='{}';
begin
 foreach t in array array['library_nodes','official_topic_locations','concepts','concept_placements','questions','question_accepted_answers',
 'personal_topics','personal_concepts','personal_topic_official_placements','personal_concept_official_placements',
 'personal_review_attempts','review_attempts','user_personal_concept_state','user_concept_mastery','user_concept_testing_angle_state','study_sessions',
 'study_decks','study_deck_location_selections','user_study_node_selections','study_deck_personal_topic_selections'] loop
  execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]'') from public.%I t',t) into data;
  result:=result||jsonb_build_object(t,data);
 end loop;
 return result;
end$$;
create temp table preservation as select pg_temp.protected_data() data,
 (select jsonb_agg(to_jsonb(c) order by id) from public.personal_cards c where id<>(select topic_card from fixtures where role_name='learner')) other_cards;

set local role authenticated;
select pg_temp.sign_in((select owner_id from fixtures where role_name='learner'));
do $$declare f record;m record; original jsonb; changed integer; before_failure jsonb;
begin
 select * into f from fixtures where role_name='learner'; select * into m from movement_fixture;
 select to_jsonb(c)-'updated_at'-'personal_topic_id'-'library_node_id'-'library_id' into original from public.personal_cards c where id=f.topic_card;
 update public.personal_cards set personal_topic_id=m.destination,library_node_id=null,library_id=null
 where id=f.topic_card and owner_id=f.owner_id and concept_id is null and updated_at=(select updated_at from public.personal_cards where id=f.topic_card);
 get diagnostics changed=row_count;
 perform pg_temp.ok(changed=1,'Owner moves studied standalone Card to nested custom Topic');
 perform pg_temp.ok(exists(select 1 from public.personal_cards where id=f.topic_card and personal_topic_id=m.destination),'Fresh read returns custom destination');
 perform pg_temp.ok((select count(*)=1 from public.resolve_study_candidates(m.deck) where personal_card_id=f.topic_card),'Moved Card stays eligible once under selected custom branch');
 update public.personal_cards set personal_topic_id=null,library_node_id=m.shared_topic,library_id=(select id from libraries where kind='allowed')
 where id=f.topic_card and owner_id=f.owner_id and concept_id is null and updated_at=(select updated_at from public.personal_cards where id=f.topic_card);
 get diagnostics changed=row_count;
 perform pg_temp.ok(changed=1,'Owner moves studied standalone Card to authorized shared canonical Topic');
 perform pg_temp.ok((select count(*)=2 from public.official_topic_locations where topic_id=m.shared_topic),'Synthetic shared Topic has two distinct locations');
 perform pg_temp.ok((select count(*)=1 from public.resolve_study_candidates(m.deck) where personal_card_id=f.topic_card),'Two selected shared locations produce one Card candidate');
 perform pg_temp.ok(original=(select to_jsonb(c)-'updated_at'-'personal_topic_id'-'library_node_id'-'library_id' from public.personal_cards c where id=f.topic_card),'Card ID owner content formatting source and creation metadata preserved');
 select to_jsonb(c) into before_failure from public.personal_cards c where id=f.topic_card;
 perform pg_temp.reject(format('update public.personal_cards set personal_topic_id=null,library_node_id=%L,library_id=%L where id=%L',
 (select root_id from libraries where kind='foreign'),(select id from libraries where kind='foreign'),f.topic_card),'42501','Unauthorized Library movement denied');
 perform pg_temp.reject(format('update public.personal_cards set personal_topic_id=%L,library_node_id=null,library_id=null where id=%L',
 (select topic_id from fixtures where role_name='other'),f.topic_card),'23514','Other owner custom Topic destination denied');
 update public.personal_cards set personal_topic_id=m.destination,library_node_id=null,library_id=null where id=f.topic_card and updated_at='2000-01-01';
 get diagnostics changed=row_count;
 perform pg_temp.ok(changed=0,'Stale conditional movement changes no records');
 perform pg_temp.ok(before_failure=(select to_jsonb(c) from public.personal_cards c where id=f.topic_card),'Rejected moves preserve complete original Card row atomically');
 update public.personal_cards set personal_topic_id=m.destination,library_node_id=null,library_id=null where id=(select topic_card from fixtures where role_name='other');
 get diagnostics changed=row_count;
 perform pg_temp.ok(changed=0,'Another learner Card cannot be moved');
 perform pg_temp.ok(not exists(select 1 from public.personal_cards where owner_id<>f.owner_id),'Search reads remain limited to own Cards');
 perform pg_temp.reject(format('update public.personal_cards set owner_id=%L where id=%L',(select owner_id from fixtures where role_name='other'),f.topic_card),'42501','Card ownership cannot be transferred');
 perform pg_temp.reject(format('update public.personal_cards set concept_id=null,personal_topic_id=%L where id=%L',f.topic_id,f.legacy_card),'23514','Studied legacy Card cannot be converted to standalone');
end$$;
reset role;
select pg_temp.ok(data=pg_temp.protected_data(),'All Topic structures official content selections history mastery and sessions unchanged') from preservation;
select pg_temp.ok(other_cards=(select jsonb_agg(to_jsonb(c) order by id) from public.personal_cards c where id<>(select topic_card from fixtures where role_name='learner')),'Legacy other-owner and historical Admin Cards byte-identical') from preservation;

-- Study inclusion remains the released canonical attachment rule. Moving does
-- not alter selection; the following selection changes are disposable tests.
set local role authenticated;
select pg_temp.sign_in((select owner_id from fixtures where role_name='learner'));
do $$declare m record;l uuid;r uuid;card uuid;begin
 select * into m from movement_fixture;select id,root_id into l,r from libraries where kind='allowed';
 select topic_card into card from fixtures where role_name='learner';
 perform public.set_study_deck_location_selection(m.deck,r,false,public.get_official_topic_graph(l)->>'revision');
 perform pg_temp.ok(not exists(select 1 from public.resolve_study_candidates(m.deck) where personal_card_id=card),'Unchecked official destinations remain excluded from Study');
 perform public.set_study_deck_location_selection(m.deck,m.shared_location,true,public.get_official_topic_graph(l)->>'revision');
 perform pg_temp.ok((select count(*)=1 from public.resolve_study_candidates(m.deck) where personal_card_id=card),'Selecting only alternate shared location includes same Card once');
end$$;
reset role;
update public.account_deletion_state set state='pending',receipt_hash=repeat('a',64),requested_at=now()
 where user_id=(select owner_id from fixtures where role_name='inactive');
set local role authenticated;
select pg_temp.sign_in((select owner_id from fixtures where role_name='inactive'));
do $$declare changed integer;begin
 update public.personal_cards set personal_topic_id=null,library_node_id=(select root_id from libraries where kind='allowed'),library_id=(select id from libraries where kind='allowed') where id=(select topic_card from fixtures where role_name='inactive');
 get diagnostics changed=row_count;
 perform pg_temp.ok(changed=0 and not public.account_is_active(),'Inactive account movement denied');
end$$;
select pg_temp.sign_in(null);
set local role anon;
select pg_temp.reject('update public.personal_cards set personal_topic_id=null','42501','Anonymous movement denied');
reset role;
select pg_temp.sign_in(null);
set constraints all immediate;
\o
select label||'|PASS' from checks order by label;
select count(*)||' database checks passed' from checks;
rollback;
