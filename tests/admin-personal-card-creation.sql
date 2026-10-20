-- LOCAL ONLY: disposable Supabase-compatible database; every fixture rolls back.
\set ON_ERROR_STOP on
begin;
\o /dev/null
do $$begin
 if current_database() !~ '^admin_card135_' or exists(
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

set local role authenticated;
do $$declare f record; attachment text; statement text; card uuid; changed integer; foreign_owner uuid;
begin
 select owner_id into foreign_owner from fixtures where role_name='other';
 for f in select * from fixtures where role_name in('admin','learner','editor') order by role_name loop
  perform pg_temp.sign_in(f.owner_id);
  perform pg_temp.ok(public.account_is_active(),f.role_name||' account is active');
  foreach attachment in array array['concept','personal_topic','official_topic'] loop
   statement:=case attachment
    when 'concept' then format('insert into public.personal_cards(owner_id,concept_id,question,answer) values(%L,%L,''New front'',''New back'') returning id',f.owner_id,f.concept_id)
    when 'personal_topic' then format('insert into public.personal_cards(owner_id,personal_topic_id,question,answer) values(%L,%L,''New front'',''New back'') returning id',f.owner_id,f.topic_id)
    else format('insert into public.personal_cards(owner_id,library_node_id,library_id,question,answer) values(%L,%L,%L,''New front'',''New back'') returning id',f.owner_id,(select root_id from libraries where kind='allowed'),(select id from libraries where kind='allowed')) end;
   if f.role_name='admin' then
    perform pg_temp.reject(statement,'42501','Admin denied new '||attachment||' Card');
   else
    execute statement into card;
    perform pg_temp.ok(exists(select 1 from public.personal_cards where id=card and owner_id=f.owner_id),f.role_name||' creates and reads '||attachment||' Card');
    update public.personal_cards set question='Updated new front' where id=card;
    perform pg_temp.ok(exists(select 1 from public.personal_cards where id=card and question='Updated new front'),f.role_name||' edits '||attachment||' Card');
   end if;
  end loop;
  perform pg_temp.ok((select count(*)=3 from public.personal_cards where id in(f.legacy_card,f.topic_card,f.official_card)),f.role_name||' reads all historical Card formats');
  update public.personal_cards set answer='Edited historical answer',source_reference='Preserved reference' where id in(f.legacy_card,f.topic_card,f.official_card);
  get diagnostics changed=row_count;
  perform pg_temp.ok(changed=3 and (select count(*)=3 from public.personal_cards where id in(f.legacy_card,f.topic_card,f.official_card) and owner_id=f.owner_id and answer='Edited historical answer' and source_reference='Preserved reference'),f.role_name||' updates and rereads historical Cards');
  update public.personal_concepts set description='Edited historical explanation' where id=f.concept_id;
  update public.personal_topics set name='Edited historical Topic' where id=f.topic_id;
  perform pg_temp.ok(exists(select 1 from public.personal_concepts where id=f.concept_id and description='Edited historical explanation') and exists(select 1 from public.personal_topics where id=f.topic_id and name='Edited historical Topic'),f.role_name||' preserves historical Concept and Topic editing');
  perform pg_temp.ok(not exists(select 1 from public.personal_cards where owner_id=foreign_owner),f.role_name||' cannot read another owner Cards');
  update public.personal_cards set answer='FORGED' where owner_id=foreign_owner;
  get diagnostics changed=row_count;
  perform pg_temp.ok(changed=0,f.role_name||' cannot edit another owner Cards');
  delete from public.personal_cards where owner_id=foreign_owner;
  get diagnostics changed=row_count;
  perform pg_temp.ok(changed=0,f.role_name||' cannot delete another owner Cards');
  perform pg_temp.reject(format('insert into public.personal_cards(owner_id,concept_id,question,answer) values(%L,%L,''FORGED'',''FORGED'')',foreign_owner,(select concept_id from fixtures where role_name='other')),'42501',f.role_name||' cannot create for another owner');
  perform pg_temp.reject(format('update public.personal_cards set owner_id=%L where id=%L',foreign_owner,f.legacy_card),'42501',f.role_name||' cannot transfer historical Card ownership');
 end loop;
end$$;

-- Database roles, not caller-supplied application role metadata, decide the deny.
select pg_temp.sign_in((select owner_id from fixtures where role_name='admin'));
select set_config('request.jwt.claims',jsonb_build_object('sub',(select owner_id from fixtures where role_name='admin'),'role','authenticated','app_metadata',jsonb_build_object('role','learner'))::text,true);
select pg_temp.reject(format('insert into public.personal_cards(owner_id,concept_id,question,answer) values(%L,%L,''FORGED'',''FORGED'')',owner_id,concept_id),'42501','Admin cannot bypass insert restriction with learner metadata') from fixtures where role_name='admin';

-- Existing authorized official creation remains on the original versioned RPCs.
do $$declare f record;l uuid;r uuid;t uuid;c uuid;q uuid;
begin
 select id,root_id into l,r from libraries where kind='allowed';
 for f in select * from fixtures where role_name in('admin','editor') loop
  perform pg_temp.sign_in(f.owner_id);
  if f.role_name='admin' then
   select id into t from public.create_library_node_in_library(l,r,'ZZ official Admin Topic');
   perform pg_temp.ok(t is not null,'Admin official Topic creation preserved');
  else
   t:=r;
   perform pg_temp.reject(format('select public.create_library_node_in_library(%L,%L,''FORGED'')',l,r),'42501','Editor existing official Topic restriction preserved');
  end if;
  c:=(public.save_concept_with_prerequisites(null,'ZZ official '||f.role_name,'Synthetic explanation',l,array[t],array[]::uuid[],'published','[]','[]')->>'concept_id')::uuid;
  select id into q from public.save_question_with_relationships_v2(null,c,'short_answer','Synthetic Question',null,'published',null,0,'medium','General Understanding','[{"answer_text":"Synthetic answer","is_primary":true}]','[]',null,null,l);
  perform pg_temp.ok(c is not null and q is not null,f.role_name||' official Concept and Question creation preserved');
 end loop;
 perform pg_temp.sign_in((select owner_id from fixtures where role_name='learner'));
 perform pg_temp.reject(format('select public.create_library_node_in_library(%L,%L,''FORGED'')',l,r),'P0001','Learner cannot create official Topic');
 perform pg_temp.reject(format('insert into public.concepts(name,created_by) values(''FORGED'',%L)',(select owner_id from fixtures where role_name='learner')),'42501','Learner cannot create official Concept');
 perform pg_temp.reject('insert into public.questions default values','42501','Learner cannot create official Question');
 perform pg_temp.reject(format('insert into public.personal_cards(owner_id,library_node_id,library_id,question,answer) values(%L,%L,%L,''FORGED'',''FORGED'')',(select owner_id from fixtures where role_name='learner'),(select root_id from libraries where kind='foreign'),(select id from libraries where kind='foreign')),'42501','Learner cannot attach new Card to unauthorized Library');
 perform pg_temp.reject(format('update public.personal_cards set library_node_id=%L,library_id=%L where id=%L',(select root_id from libraries where kind='foreign'),(select id from libraries where kind='foreign'),(select official_card from fixtures where role_name='learner')),'42501','Learner cannot move existing Card to unauthorized Library');
 perform pg_temp.reject(format('insert into public.personal_cards(owner_id,library_node_id,library_id,question,answer) values(%L,%L,%L,''FORGED'',''FORGED'')',(select owner_id from fixtures where role_name='learner'),(select root_id from libraries where kind='inactive'),(select id from libraries where kind='inactive')),'23514','Learner cannot attach Card to inactive Library');
end$$;

-- The existing active-account fence remains necessary even when is_admin is false.
reset role;
update public.account_deletion_state set state='pending',receipt_hash=repeat('a',64),requested_at=now()
 where user_id=(select owner_id from fixtures where role_name='inactive');
update public.account_deletion_state set state='pending',receipt_hash=repeat('b',64),requested_at=now()
 where user_id=(select owner_id from fixtures where role_name='inactive_admin');
set local role authenticated;
do $$declare f record;changed integer;begin
 for f in select * from fixtures where role_name in('inactive','inactive_admin') loop
  perform pg_temp.sign_in(f.owner_id);
  perform pg_temp.ok(not public.account_is_active() and not public.is_admin(),f.role_name||' denied by existing active-account helpers');
  perform pg_temp.reject(format('insert into public.personal_cards(owner_id,concept_id,question,answer) values(%L,%L,''FORGED'',''FORGED'')',f.owner_id,f.concept_id),'42501',f.role_name||' cannot create Card');
  perform pg_temp.ok(not exists(select 1 from public.personal_cards),f.role_name||' cannot read Cards');
  update public.personal_cards set answer='FORGED' where id=f.legacy_card;
  get diagnostics changed=row_count;
  perform pg_temp.ok(changed=0,f.role_name||' cannot edit Cards');
 end loop;
end$$;
select pg_temp.sign_in((select owner_id from fixtures where role_name='unapproved'));
select pg_temp.reject(format('insert into public.personal_cards(owner_id,concept_id,question,answer) values(%L,%L,''FORGED'',''FORGED'')',(select owner_id from fixtures where role_name='unapproved'),(select concept_id from fixtures where role_name='learner')),'42501','unapproved account cannot create Card');
select pg_temp.sign_in(null);
set local role anon;
select pg_temp.reject(format('insert into public.personal_cards(owner_id,concept_id,question,answer) values(%L,%L,''FORGED'',''FORGED'')',owner_id,concept_id),'42501','anonymous insert denied') from fixtures where role_name='learner';
select pg_temp.reject('select * from public.personal_cards','42501','anonymous read denied');
reset role;
select pg_temp.sign_in(null);
set constraints all immediate;
\o
select count(*) as passing_checks from checks;
select label,'PASS' result from checks order by label;
rollback;
