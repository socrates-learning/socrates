-- Unified Deck Settings backend foundation. LOCAL CANDIDATE ONLY.
-- Existing five guarded boundaries retained by explicit authority decision.
-- New objects: socrates_migrator owned; new functions SECURITY INVOKER only.
begin;
create temporary table m109_security_before on commit drop as
select 'role' kind,oid::text id,to_jsonb(r)::text val from pg_roles r
union all select 'membership',oid::text,to_jsonb(m)::text from pg_auth_members m
union all select 'default',oid::text,to_jsonb(d)::text from pg_default_acl d
union all select 'policy',oid::text,to_jsonb(p)::text from pg_policy p
union all select 'schema',oid::text,jsonb_build_array(nspowner,nspacl)::text from pg_namespace
union all select 'relation',oid::text,jsonb_build_array(relowner,relacl,relrowsecurity,relforcerowsecurity)::text from pg_class where relnamespace='public'::regnamespace
union all select 'column',concat(attrelid,':',attnum),coalesce(attacl::text,'NULL') from pg_attribute where attrelid in ('public.study_decks'::regclass,'public.personal_topics'::regclass,'public.personal_collections'::regclass)
union all select 'function',oid::text,jsonb_build_array(proowner,proacl,prosecdef,proconfig,pg_get_functiondef(oid))::text from pg_proc where pronamespace='public'::regnamespace;
create temporary table m109_approved_functions on commit drop as
select oid from pg_proc where pronamespace='public'::regnamespace and proname in ('start_study_session','start_study_session_with_candidate','select_next_personal_study_card','resolve_study_candidates','get_home_study_bootstrap');
do $preflight$ begin
 if current_user<>'postgres' or session_user<>'postgres' then raise exception '109 requires postgres installer'; end if;
 if exists(select 1 from pg_class where relnamespace='public'::regnamespace and relname in ('study_deck_personal_topic_exclusions','study_deck_personal_topic_preferences','study_deck_personal_collection_preferences')) then raise exception '109 already or partially installed'; end if;
 if (select count(*) from m109_approved_functions)<>5 then raise exception '109 unexpected function overloads'; end if;
 if not exists(select 1 from pg_roles where rolname='socrates_migrator' and not rolcanlogin and not rolsuper and not rolcreaterole and not rolcreatedb and not rolinherit and not rolbypassrls)
 or not has_schema_privilege('socrates_migrator','public','CREATE') then raise exception '109 requires 103 role contract'; end if;
 if (select count(*) from pg_auth_members where roleid='socrates_migrator'::regrole)<>2 or exists(select 1 from pg_auth_members where member='socrates_migrator'::regrole) or pg_has_role('postgres','socrates_migrator','USAGE') or not pg_has_role('postgres','socrates_migrator','SET') then raise exception '109 requires exact 103 membership boundary';end if;
 if has_table_privilege('authenticated','public.study_sessions','INSERT') or has_table_privilege('authenticated','public.study_sessions','UPDATE') then raise exception '109 unexpected session authority'; end if;
 if exists(select 1 from m109_approved_functions a join pg_proc p on p.oid=a.oid where p.proowner<>'postgres'::regrole or not p.prosecdef or p.proconfig is distinct from array['search_path=""']) then raise exception '109 guarded boundary mismatch'; end if;
 if exists(select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a where d.defaclrole='socrates_migrator'::regrole and a.grantee<>d.defaclrole) then raise exception '109 unexpected migrator defaults'; end if;
end $preflight$;

do $protected$ begin if md5(pg_get_functiondef('public.get_library_official_availability_counts(uuid)'::regprocedure))<>'f631afc2c50cd906c5f65bdc08805949' then raise exception '109 requires protected function get_library_official_availability_counts(uuid)';end if;end $protected$;

do $protected$ begin if md5(pg_get_functiondef('public.position_library_node_in_library(uuid,uuid,uuid,uuid,uuid,uuid[],uuid[])'::regprocedure))<>'0db5be4c83bcbc14c799057e3b302409' then raise exception '109 requires protected function position_library_node_in_library(uuid,uuid,uuid,uuid,uuid,uuid[],uuid[])';end if;end $protected$;

do $protected$ begin if md5(pg_get_functiondef('public.position_personal_topic(uuid,uuid,uuid,uuid,uuid,uuid,uuid[],uuid[])'::regprocedure))<>'420c5fe6c20eea93f915028912b1da86' then raise exception '109 requires protected function position_personal_topic(uuid,uuid,uuid,uuid,uuid,uuid,uuid[],uuid[])';end if;end $protected$;

do $protected$ begin if md5(pg_get_functiondef('public.record_personal_study_attempt(uuid,uuid,uuid,uuid,text)'::regprocedure))<>'83fa3e33a9b234c8018f745fc9b4d578' then raise exception '109 requires protected function record_personal_study_attempt(uuid,uuid,uuid,uuid,text)';end if;end $protected$;

do $protected$ begin if md5(pg_get_functiondef('public.record_personal_study_attempt(uuid,uuid,uuid,uuid,text,uuid)'::regprocedure))<>'ece1269d20531b538daf33b6c18a2901' then raise exception '109 requires protected function record_personal_study_attempt(uuid,uuid,uuid,uuid,text,uuid)';end if;end $protected$;

do $protected$ begin if md5(pg_get_functiondef('public.select_next_study_candidate(uuid,boolean)'::regprocedure))<>'f45f053db74a7bbb84fb89fbee483de2' then raise exception '109 requires protected function select_next_study_candidate(uuid,boolean)';end if;end $protected$;

do $protected$ begin if md5(pg_get_functiondef('public.select_next_study_question_hardened(uuid,boolean)'::regprocedure))<>'5774237a9890e1064d1bed53adfb9d4f' then raise exception '109 requires protected function select_next_study_question_hardened(uuid,boolean)';end if;end $protected$;

do $protected$ begin if md5(pg_get_functiondef('public.validate_question_child_publish()'::regprocedure))<>'35f5f1461da2f25b8b3a8bd6b2b8ae98' then raise exception '109 requires protected function validate_question_child_publish()';end if;end $protected$;

do $protected$ begin if md5(pg_get_functiondef('public.validate_question_publish()'::regprocedure))<>'293f86c1af5701c6afca7a3e80cd9518' then raise exception '109 requires protected function validate_question_publish()';end if;end $protected$;

do $check$ begin if md5(pg_get_functiondef('public.get_home_study_bootstrap(uuid,uuid)'::regprocedure))<>'95eb3cf6b5baeb775efc9f6ffff9da1b' then raise exception '109 unexpected baseline get_home_study_bootstrap'; end if; end $check$;

do $check$ begin if md5(pg_get_functiondef('public.resolve_study_candidates(uuid)'::regprocedure))<>'b16bfaf85219fa6e9c6e3bc4480bbfc1' then raise exception '109 unexpected baseline resolve_study_candidates'; end if; end $check$;

do $check$ begin if md5(pg_get_functiondef('public.select_next_personal_study_card(uuid,boolean)'::regprocedure))<>'5d568f3de156bc29a1f2babeda64a4c1' then raise exception '109 unexpected baseline select_next_personal_study_card'; end if; end $check$;

do $check$ begin if md5(pg_get_functiondef('public.start_study_session(uuid,integer)'::regprocedure))<>'76533e7094e46c5dda6cee244e8f7554' then raise exception '109 unexpected baseline start_study_session'; end if; end $check$;

do $check$ begin if md5(pg_get_functiondef('public.start_study_session_with_candidate(uuid,integer,uuid,boolean)'::regprocedure))<>'0736647663cb5e1d1128ae48ca2f407d' then raise exception '109 unexpected baseline start_study_session_with_candidate'; end if; end $check$;

-- Installer-only column REFERENCES; all three ACLs restored before commit.
grant references(id,user_id,library_id) on public.study_decks to socrates_migrator;
grant references(id,owner_id) on public.personal_topics to socrates_migrator;
grant references(id,owner_id) on public.personal_collections to socrates_migrator;
set local role socrates_migrator;

create table public.study_deck_personal_topic_exclusions (
 deck_id uuid not null,user_id uuid not null,library_id uuid not null,personal_topic_id uuid not null,

 created_at timestamptz not null default now(),
 primary key(deck_id,personal_topic_id),
 foreign key(deck_id,user_id,library_id) references public.study_decks(id,user_id,library_id) on delete cascade,
 foreign key(personal_topic_id,user_id) references public.personal_topics(id,owner_id) on delete cascade
);
create index on public.study_deck_personal_topic_exclusions(personal_topic_id,user_id);
alter table public.study_deck_personal_topic_exclusions enable row level security;
create policy m109_owned_settings on public.study_deck_personal_topic_exclusions for all to authenticated
 using(user_id=(select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid) and public.has_socrates_role() and exists(select 1 from public.study_decks d where d.id=deck_id and d.user_id=study_deck_personal_topic_exclusions.user_id and d.library_id=study_deck_personal_topic_exclusions.library_id and d.is_active))
 with check(user_id=(select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid) and public.has_socrates_role() and exists(select 1 from public.study_decks d where d.id=deck_id and d.user_id=study_deck_personal_topic_exclusions.user_id and d.library_id=study_deck_personal_topic_exclusions.library_id and d.is_active and (public.is_editor_or_admin() or exists(select 1 from public.user_libraries l where l.user_id=(select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid) and l.library_id=d.library_id))));
revoke all on public.study_deck_personal_topic_exclusions from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.study_deck_personal_topic_exclusions to authenticated;
grant select on public.study_deck_personal_topic_exclusions to postgres;

create table public.study_deck_personal_topic_preferences (
 deck_id uuid not null,user_id uuid not null,library_id uuid not null,personal_topic_id uuid not null,
 new_mastery_balance smallint not null check(new_mastery_balance between 0 and 100),
 created_at timestamptz not null default now(),
 primary key(deck_id,personal_topic_id),
 foreign key(deck_id,user_id,library_id) references public.study_decks(id,user_id,library_id) on delete cascade,
 foreign key(personal_topic_id,user_id) references public.personal_topics(id,owner_id) on delete cascade
);
create index on public.study_deck_personal_topic_preferences(personal_topic_id,user_id);
alter table public.study_deck_personal_topic_preferences enable row level security;
create policy m109_owned_settings on public.study_deck_personal_topic_preferences for all to authenticated
 using(user_id=(select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid) and public.has_socrates_role() and exists(select 1 from public.study_decks d where d.id=deck_id and d.user_id=study_deck_personal_topic_preferences.user_id and d.library_id=study_deck_personal_topic_preferences.library_id and d.is_active))
 with check(user_id=(select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid) and public.has_socrates_role() and exists(select 1 from public.study_decks d where d.id=deck_id and d.user_id=study_deck_personal_topic_preferences.user_id and d.library_id=study_deck_personal_topic_preferences.library_id and d.is_active and (public.is_editor_or_admin() or exists(select 1 from public.user_libraries l where l.user_id=(select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid) and l.library_id=d.library_id))));
revoke all on public.study_deck_personal_topic_preferences from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.study_deck_personal_topic_preferences to authenticated;
grant select on public.study_deck_personal_topic_preferences to postgres;

create table public.study_deck_personal_collection_preferences (
 deck_id uuid not null,user_id uuid not null,library_id uuid not null,personal_collection_id uuid not null,
 new_mastery_balance smallint not null check(new_mastery_balance between 0 and 100),
 created_at timestamptz not null default now(),
 primary key(deck_id,personal_collection_id),
 foreign key(deck_id,user_id,library_id) references public.study_decks(id,user_id,library_id) on delete cascade,
 foreign key(personal_collection_id,user_id) references public.personal_collections(id,owner_id) on delete cascade
);
create index on public.study_deck_personal_collection_preferences(personal_collection_id,user_id);
alter table public.study_deck_personal_collection_preferences enable row level security;
create policy m109_owned_settings on public.study_deck_personal_collection_preferences for all to authenticated
 using(user_id=(select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid) and public.has_socrates_role() and exists(select 1 from public.study_decks d where d.id=deck_id and d.user_id=study_deck_personal_collection_preferences.user_id and d.library_id=study_deck_personal_collection_preferences.library_id and d.is_active))
 with check(user_id=(select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid) and public.has_socrates_role() and exists(select 1 from public.study_decks d where d.id=deck_id and d.user_id=study_deck_personal_collection_preferences.user_id and d.library_id=study_deck_personal_collection_preferences.library_id and d.is_active and (public.is_editor_or_admin() or exists(select 1 from public.user_libraries l where l.user_id=(select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid) and l.library_id=d.library_id))));
revoke all on public.study_deck_personal_collection_preferences from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.study_deck_personal_collection_preferences to authenticated;
grant select on public.study_deck_personal_collection_preferences to postgres;

create function public.m109_effective_topics(p_deck_id uuid) returns table(topic_id uuid,source_topic_id uuid,is_included boolean,distance integer)
language plpgsql stable security invoker set search_path='' as $m109$
declare u uuid:=auth.uid(); begin
 if u is null or not public.has_socrates_role() then raise exception 'Approved user required' using errcode='42501'; end if;
 return query
 with recursive deck as(select d.* from public.study_decks d where d.id=p_deck_id and d.user_id=u and (public.is_editor_or_admin() or exists(select 1 from public.user_libraries m where m.user_id=u and m.library_id=d.library_id))),
 roots as(
 select s.personal_topic_id id,s.personal_topic_id origin,true included from public.study_deck_personal_topic_selections s join deck d on d.id=s.deck_id and d.user_id=s.user_id and d.library_id=s.library_id
 union all select s.personal_topic_id,s.personal_topic_id,false from public.study_deck_personal_topic_exclusions s join deck d on d.id=s.deck_id and d.user_id=s.user_id and d.library_id=s.library_id),
 walk as(select r.*,0 distance,array[r.id] visited from roots r join public.personal_topics t on t.id=r.id and t.owner_id=u
 union all select t.id,w.origin,w.included,w.distance+1,w.visited||t.id from walk w join public.personal_topics t on t.parent_id=w.id and t.owner_id=u where not t.id=any(w.visited)),
 closest as(select distinct on(w.id) w.id,w.origin,w.included,w.distance from walk w order by w.id,w.distance,w.included,w.origin)
 select c.id,c.origin,c.included,c.distance from closest c;
end
$m109$;

revoke all on function public.m109_effective_topics(uuid) from public,anon,authenticated,service_role;
grant execute on function public.m109_effective_topics(uuid) to postgres;

create function public.m109_lock_settings_write() returns trigger
language plpgsql security invoker set search_path='' as $m109$
declare d uuid;u uuid; begin
 -- PostgreSQL FK cascades run as the referencing table owner. That owner has
 -- deliberately no authority on legacy study_decks. Cascades are consequences
 -- of an already-authorized parent deletion, not a new settings instruction.
 -- Parent/FK locks protect referential integrity; Topic structure/startup also
 -- share the existing 104 advisory lock. Never elevate the trigger context.
 if TG_OP='DELETE' and current_user='socrates_migrator' and pg_trigger_depth()>1 then return old;end if;
 d:=case when TG_OP='DELETE' then old.deck_id else new.deck_id end;
 u:=case when TG_OP='DELETE' then old.user_id else new.user_id end;
 if TG_OP='UPDATE' and (new.deck_id,new.user_id,new.library_id) is distinct from (old.deck_id,old.user_id,old.library_id) then raise exception 'Settings identity is immutable' using errcode='22023'; end if;
 perform 1 from public.study_decks where id=d and user_id=u for update;
 -- Cascading deletion may already have removed the parent; FK/RLS remain authoritative.
 if TG_OP='DELETE' then return old; end if;return new;
end
$m109$;

revoke all on function public.m109_lock_settings_write() from public,anon,authenticated,service_role;
grant execute on function public.m109_lock_settings_write() to postgres;

create function public.set_study_deck_personal_topic_selection(p_deck_id uuid,p_topic_id uuid,p_include boolean) returns jsonb
language plpgsql security invoker set search_path='' as $m109$
declare u uuid:=auth.uid();d public.study_decks%rowtype;ids uuid[];inherited boolean;begin
 if u is null or not public.has_socrates_role() then raise exception 'Approved user required' using errcode='42501';end if;
 if p_include is null then raise exception 'Selection required' using errcode='22023';end if;
 perform pg_catalog.pg_advisory_xact_lock_shared(104,20260927);
 select * into d from public.study_decks where id=p_deck_id and user_id=u and is_active and (public.is_editor_or_admin() or exists(select 1 from public.user_libraries m where m.user_id=u and m.library_id=study_decks.library_id)) for update;
 if d.id is null then raise exception 'Owned active Deck required' using errcode='42501';end if;
 perform 1 from public.personal_topics where id=p_topic_id and owner_id=u for share;
 if not found then raise exception 'Owned Topic required' using errcode='42501';end if;
 with recursive tree as(select t.id,array[t.id] visited from public.personal_topics t where t.id=p_topic_id and t.owner_id=u
 union all select t.id,w.visited||t.id from tree w join public.personal_topics t on t.parent_id=w.id and t.owner_id=u where not t.id=any(w.visited)) select array_agg(id) into ids from tree;
 delete from public.study_deck_personal_topic_selections where deck_id=d.id and personal_topic_id=any(ids);
 delete from public.study_deck_personal_topic_exclusions where deck_id=d.id and personal_topic_id=any(ids);
 with recursive ancestors as(select t.id,t.parent_id,0 depth,array[t.id] visited from public.personal_topics t where t.id=p_topic_id and t.owner_id=u
 union all select t.id,t.parent_id,a.depth+1,a.visited||t.id from ancestors a join public.personal_topics t on t.id=a.parent_id and t.owner_id=u where not t.id=any(a.visited)),
 directives as(select a.depth,true included from ancestors a join public.study_deck_personal_topic_selections s on s.personal_topic_id=a.id and s.deck_id=d.id
 union all select a.depth,false from ancestors a join public.study_deck_personal_topic_exclusions s on s.personal_topic_id=a.id and s.deck_id=d.id)
 select included into inherited from directives order by depth,included limit 1;
 if p_include and not coalesce(inherited,false) then
 insert into public.study_deck_personal_topic_selections(deck_id,user_id,library_id,personal_topic_id) values(d.id,u,d.library_id,p_topic_id);
 elsif not p_include and coalesce(inherited,false) then
 insert into public.study_deck_personal_topic_exclusions(deck_id,user_id,library_id,personal_topic_id) values(d.id,u,d.library_id,p_topic_id);
 end if;
 return jsonb_build_object('selected_personal_topic_ids',(select coalesce(jsonb_agg(s.personal_topic_id order by s.personal_topic_id),'[]') from public.study_deck_personal_topic_selections s where s.deck_id=d.id),'excluded_personal_topic_ids',(select coalesce(jsonb_agg(s.personal_topic_id order by s.personal_topic_id),'[]') from public.study_deck_personal_topic_exclusions s where s.deck_id=d.id));
end
$m109$;

revoke all on function public.set_study_deck_personal_topic_selection(uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.set_study_deck_personal_topic_selection(uuid,uuid,boolean) to postgres,authenticated;

create function public.set_study_deck_personal_topic_preference(p_deck_id uuid,p_topic_id uuid,p_balance integer) returns jsonb
language plpgsql security invoker set search_path='' as $m109$
declare u uuid:=auth.uid();d public.study_decks%rowtype;begin
 if u is null or not public.has_socrates_role() then raise exception 'Approved user required' using errcode='42501';end if;
 if p_balance is null or p_balance not between 0 and 100 then raise exception 'Balance must be 0..100' using errcode='22023';end if;
 perform pg_catalog.pg_advisory_xact_lock_shared(104,20260927);
 select * into d from public.study_decks where id=p_deck_id and user_id=u and is_active and (public.is_editor_or_admin() or exists(select 1 from public.user_libraries m where m.user_id=u and m.library_id=study_decks.library_id)) for update;
 if d.id is null then raise exception 'Owned active Deck required' using errcode='42501';end if;
 perform 1 from public.personal_topics where id=p_topic_id and owner_id=u for share;
 if not found then raise exception 'Owned group required' using errcode='42501';end if;
 insert into public.study_deck_personal_topic_preferences(deck_id,user_id,library_id,personal_topic_id,new_mastery_balance) values(d.id,u,d.library_id,p_topic_id,p_balance)
 on conflict(deck_id,personal_topic_id) do update set new_mastery_balance=excluded.new_mastery_balance;
 return jsonb_build_object('group_key','personal:topic:'||p_topic_id::text,'new_mastery_balance',p_balance);
end
$m109$;

revoke all on function public.set_study_deck_personal_topic_preference(uuid,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.set_study_deck_personal_topic_preference(uuid,uuid,integer) to postgres,authenticated;

create function public.set_study_deck_personal_collection_preference(p_deck_id uuid,p_collection_id uuid,p_balance integer) returns jsonb
language plpgsql security invoker set search_path='' as $m109$
declare u uuid:=auth.uid();d public.study_decks%rowtype;begin
 if u is null or not public.has_socrates_role() then raise exception 'Approved user required' using errcode='42501';end if;
 if p_balance is null or p_balance not between 0 and 100 then raise exception 'Balance must be 0..100' using errcode='22023';end if;
 perform pg_catalog.pg_advisory_xact_lock_shared(104,20260927);
 select * into d from public.study_decks where id=p_deck_id and user_id=u and is_active and (public.is_editor_or_admin() or exists(select 1 from public.user_libraries m where m.user_id=u and m.library_id=study_decks.library_id)) for update;
 if d.id is null then raise exception 'Owned active Deck required' using errcode='42501';end if;
 perform 1 from public.personal_collections where id=p_collection_id and owner_id=u for share;
 if not found then raise exception 'Owned group required' using errcode='42501';end if;
 insert into public.study_deck_personal_collection_preferences(deck_id,user_id,library_id,personal_collection_id,new_mastery_balance) values(d.id,u,d.library_id,p_collection_id,p_balance)
 on conflict(deck_id,personal_collection_id) do update set new_mastery_balance=excluded.new_mastery_balance;
 return jsonb_build_object('group_key','personal:collection:'||p_collection_id::text,'new_mastery_balance',p_balance);
end
$m109$;

revoke all on function public.set_study_deck_personal_collection_preference(uuid,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.set_study_deck_personal_collection_preference(uuid,uuid,integer) to postgres,authenticated;

create function public.set_study_deck_personal_collection_selection(p_deck_id uuid,p_collection_id uuid,p_include boolean) returns jsonb
language plpgsql security invoker set search_path='' as $m109$
declare u uuid:=auth.uid();d public.study_decks%rowtype;begin
 if u is null or not public.has_socrates_role() then raise exception 'Approved user required' using errcode='42501';end if;
 if p_include is null then raise exception 'Selection required' using errcode='22023';end if;
 perform pg_catalog.pg_advisory_xact_lock_shared(104,20260927);
 select * into d from public.study_decks where id=p_deck_id and user_id=u and is_active and (public.is_editor_or_admin() or exists(select 1 from public.user_libraries m where m.user_id=u and m.library_id=study_decks.library_id)) for update;
 if d.id is null then raise exception 'Owned active Deck required' using errcode='42501';end if;
 perform 1 from public.personal_collections where id=p_collection_id and owner_id=u for share;
 if not found then raise exception 'Owned group required' using errcode='42501';end if;
 if p_include then insert into public.study_deck_personal_collection_selections(deck_id,user_id,library_id,personal_collection_id) values(d.id,u,d.library_id,p_collection_id) on conflict do nothing;
 else delete from public.study_deck_personal_collection_selections where deck_id=d.id and personal_collection_id=p_collection_id;end if;
 return jsonb_build_object('selected_collection_ids',(select coalesce(jsonb_agg(personal_collection_id order by personal_collection_id),'[]') from public.study_deck_personal_collection_selections where deck_id=d.id));
end
$m109$;

revoke all on function public.set_study_deck_personal_collection_selection(uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.set_study_deck_personal_collection_selection(uuid,uuid,boolean) to postgres,authenticated;

create function public.m109_topic_states(p_deck_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $m109$
declare u uuid:=auth.uid();r jsonb;begin
 with recursive effective as materialized(select * from public.m109_effective_topics(p_deck_id)),
 owned as materialized(select t.id,t.parent_id,coalesce(e.is_included,false) selected,e.distance,e.is_included from public.personal_topics t left join effective e on e.topic_id=t.id where t.owner_id=u),
 partial_nodes as(
 select p.id,p.parent_id from owned p join owned child on child.parent_id=p.id where p.selected is distinct from child.selected
 union
 select p.id,p.parent_id from partial_nodes n join owned p on p.id=n.parent_id)
 select coalesce(jsonb_agg(jsonb_build_object('group_key','personal:topic:'||t.id::text,'topic_id',t.id,'selected',t.selected,'direct',coalesce(t.is_included and t.distance=0,false),'inherited',coalesce(t.is_included and t.distance>0,false),'excluded',coalesce(not t.is_included,false),'partial',exists(select 1 from partial_nodes p where p.id=t.id)) order by t.id),'[]') into r from owned t;
 return r;end
$m109$;

revoke all on function public.m109_topic_states(uuid) from public,anon,authenticated,service_role;
grant execute on function public.m109_topic_states(uuid) to postgres;

create function public.m109_settings_snapshot(p_deck_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $m109$
declare u uuid:=auth.uid();r jsonb;begin
 if not exists(select 1 from public.study_decks d where d.id=p_deck_id and d.user_id=u) then raise exception 'Owned Deck required' using errcode='42501';end if;
 select jsonb_build_object('version',109,'calibration_version',1,
 'included_topic_ids',(select coalesce(jsonb_agg(s.personal_topic_id order by s.personal_topic_id),'[]') from public.study_deck_personal_topic_selections s where s.deck_id=p_deck_id and s.user_id=u),
 'excluded_topic_ids',(select coalesce(jsonb_agg(s.personal_topic_id order by s.personal_topic_id),'[]') from public.study_deck_personal_topic_exclusions s where s.deck_id=p_deck_id and s.user_id=u),
 'topic_states',public.m109_topic_states(p_deck_id),
 'effective_topic_sources',(select coalesce(jsonb_object_agg(e.topic_id,e.source_topic_id),'{}') from public.m109_effective_topics(p_deck_id) e where e.is_included),
 'effective_topics',(select coalesce(jsonb_agg(to_jsonb(e) order by e.topic_id),'[]') from public.m109_effective_topics(p_deck_id) e),
 'selected_collection_ids',(select coalesce(jsonb_agg(s.personal_collection_id order by s.personal_collection_id),'[]') from public.study_deck_personal_collection_selections s where s.deck_id=p_deck_id and s.user_id=u),
 'topic_preferences',(select coalesce(jsonb_object_agg(s.personal_topic_id,coalesce(p.new_mastery_balance,50)),'{}') from public.study_deck_personal_topic_selections s left join public.study_deck_personal_topic_preferences p using(deck_id,personal_topic_id) where s.deck_id=p_deck_id and s.user_id=u),
 'collection_preferences',(select coalesce(jsonb_object_agg(s.personal_collection_id,coalesce(p.new_mastery_balance,50)),'{}') from public.study_deck_personal_collection_selections s left join public.study_deck_personal_collection_preferences p using(deck_id,personal_collection_id) where s.deck_id=p_deck_id and s.user_id=u)) into r;
 return r;
end
$m109$;

revoke all on function public.m109_settings_snapshot(uuid) from public,anon,authenticated,service_role;
grant execute on function public.m109_settings_snapshot(uuid) to postgres;

create function public.m109_session_topic_sources(p_settings jsonb) returns jsonb
language plpgsql stable security invoker set search_path='' as $m109$
declare u uuid:=auth.uid();r jsonb;begin
 with recursive roots as(
 select t.id,t.id origin,true included from jsonb_array_elements_text(p_settings->'included_topic_ids') x join public.personal_topics t on t.id=x.value::uuid and t.owner_id=u
 union all
 select t.id,t.id,false from jsonb_array_elements_text(p_settings->'excluded_topic_ids') x join public.personal_topics t on t.id=x.value::uuid and t.owner_id=u),
 walk as(select r.*,0 distance,array[r.id] visited from roots r
 union all select t.id,w.origin,w.included,w.distance+1,w.visited||t.id from walk w join public.personal_topics t on t.parent_id=w.id and t.owner_id=u where not t.id=any(w.visited)),
 closest as(select distinct on(w.id) w.id,w.origin,w.included from walk w order by w.id,w.distance,w.included,w.origin)
 select coalesce(jsonb_object_agg(id,origin),'{}') into r from closest where included;
 return r;end
$m109$;

revoke all on function public.m109_session_topic_sources(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.m109_session_topic_sources(jsonb) to postgres;

create function public.m109_card_balance(p_card_id uuid,p_settings jsonb) returns double precision
language plpgsql stable security invoker set search_path='' as $m109$
declare u uuid:=auth.uid();b double precision;begin
 if p_settings->>'version' is distinct from '109' then return 50::double precision;end if;
 with contributions as(
 select 'personal:topic:'||(p_settings->'effective_topic_sources'->>pc.topic_id::text) key,
 coalesce((p_settings->'topic_preferences'->>(p_settings->'effective_topic_sources'->>pc.topic_id::text))::double precision,50) balance
 from public.personal_cards c join public.personal_concepts pc on pc.id=c.concept_id and pc.owner_id=u
 where c.id=p_card_id and c.owner_id=u and p_settings->'effective_topic_sources' ? pc.topic_id::text
 union
 select 'personal:collection:'||m.collection_id::text,coalesce((p_settings->'collection_preferences'->>m.collection_id::text)::double precision,50) from public.personal_collection_cards m join public.personal_collections c on c.id=m.collection_id and c.owner_id=u where m.owner_id=u and m.personal_card_id=p_card_id and p_settings->'selected_collection_ids' ? m.collection_id::text)
 select coalesce(avg(balance),50) into b from contributions;
 return b;
end
$m109$;

revoke all on function public.m109_card_balance(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.m109_card_balance(uuid,jsonb) to postgres;

reset role;

create trigger m109_settings_lock before insert or update or delete on public.study_deck_personal_topic_selections for each row execute function public.m109_lock_settings_write();

create trigger m109_settings_lock before insert or update or delete on public.study_deck_personal_collection_selections for each row execute function public.m109_lock_settings_write();

set local role socrates_migrator;

create trigger m109_settings_lock before insert or update or delete on public.study_deck_personal_topic_exclusions for each row execute function public.m109_lock_settings_write();

reset role;

set local role socrates_migrator;

create trigger m109_settings_lock before insert or update or delete on public.study_deck_personal_topic_preferences for each row execute function public.m109_lock_settings_write();

reset role;

set local role socrates_migrator;

create trigger m109_settings_lock before insert or update or delete on public.study_deck_personal_collection_preferences for each row execute function public.m109_lock_settings_write();

reset role;

CREATE OR REPLACE FUNCTION public.resolve_study_candidates(p_deck_id uuid)
 RETURNS TABLE(candidate_type text, candidate_id uuid, official_question_id uuid, official_concept_id uuid, personal_card_id uuid, personal_concept_id uuid, personal_topic_id uuid, prompt text, answer text, explanation text, difficulty text, testing_angle text, candidate_position bigint, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with recursive deck as (
    select
      study_deck.id,
      study_deck.user_id,
      study_deck.library_id
    from public.study_decks study_deck
    where study_deck.id = p_deck_id
      and study_deck.user_id = (select auth.uid())
      and public.has_socrates_role()
      and (
        public.is_editor_or_admin()
        or exists (
          select 1
          from public.user_libraries membership
          where membership.user_id = (select auth.uid())
            and membership.library_id = study_deck.library_id
        )
      )
  ),
  official_concepts as (
    select
      resolved.concept_id,
      row_number() over (
        order by lower(resolved.concept_name), resolved.concept_id
      ) as concept_position
    from deck
    cross join lateral public.resolve_study_deck(deck.id) resolved
  ),
  official_candidates as (
    select
      'official'::text as candidate_type,
      question.id as candidate_id,
      question.id as official_question_id,
      question.concept_id as official_concept_id,
      null::uuid as personal_card_id,
      null::uuid as personal_concept_id,
      null::uuid as personal_topic_id,
      question.prompt,
      accepted_answer.answer_text as answer,
      question.explanation,
      question.difficulty,
      question.testing_angle,
      0::integer as source_position,
      official_concept.concept_position,
      question.sort_order as item_sort_order,
      question.created_at
    from official_concepts official_concept
    join public.questions question
      on question.concept_id = official_concept.concept_id
    join lateral (
      select accepted.answer_text
      from public.question_accepted_answers accepted
      where accepted.question_id = question.id
      order by accepted.sort_order, accepted.id
      limit 1
    ) accepted_answer on true
    where question.status = 'published'
      and question.question_type = 'short_answer'
  ),
  selected_official_nodes as (
    select selection.node_id
    from deck
    join public.user_study_node_selections selection
      on selection.deck_id = deck.id
     and selection.user_id = deck.user_id
     and selection.library_id = deck.library_id
    join public.library_nodes node
      on node.id = selection.node_id
     and node.library_id = deck.library_id

    union

    select child.id
    from selected_official_nodes selected
    join public.library_nodes parent
      on parent.id = selected.node_id
    join public.library_nodes child
      on child.parent_id = parent.id
     and child.library_id = parent.library_id
    join deck on deck.library_id = child.library_id
  ),
  selected_personal_topics as (
    select e.topic_id as personal_topic_id from public.m109_effective_topics(p_deck_id) e where e.is_included
  ),
  eligible_personal_concepts as (
    select concept.id
    from selected_personal_topics selected
    join deck on true
    join public.personal_topics topic
      on topic.id = selected.personal_topic_id
     and topic.owner_id = deck.user_id
    join public.personal_concepts concept
      on concept.topic_id = topic.id
     and concept.owner_id = deck.user_id

    union

    select placement.personal_concept_id
    from deck
    join public.personal_concept_official_placements placement
      on placement.owner_id = deck.user_id
     and placement.official_concept_id is null
    join selected_official_nodes selected
      on selected.node_id = placement.library_node_id
    join public.library_nodes node
      on node.id = placement.library_node_id
     and node.library_id = deck.library_id

    union

    select placement.personal_concept_id
    from deck
    join public.personal_concept_official_placements placement
      on placement.owner_id = deck.user_id
     and placement.official_concept_id is not null
    join official_concepts official
      on official.concept_id = placement.official_concept_id
    join public.library_nodes node
      on node.id = placement.library_node_id
     and node.library_id = deck.library_id
  ),
  eligible_personal_cards as (
    select card.id
    from eligible_personal_concepts eligible
    join deck on true
    join public.personal_cards card
      on card.concept_id = eligible.id
     and card.owner_id = deck.user_id

    union

    select membership.personal_card_id
    from deck
    join public.study_deck_personal_collection_selections selection
      on selection.deck_id = deck.id
     and selection.user_id = deck.user_id
     and selection.library_id = deck.library_id
    join public.personal_collections collection
      on collection.id = selection.personal_collection_id
     and collection.owner_id = deck.user_id
    join public.personal_collection_cards membership
      on membership.collection_id = collection.id
     and membership.owner_id = deck.user_id
  ),
  personal_candidate_rows as (
    select
      card.id,
      card.owner_id,
      card.concept_id,
      concept.topic_id,
      card.question,
      card.answer,
      topic.sort_order as topic_sort_order,
      topic.name as topic_name,
      concept.name as concept_name,
      concept.created_at as concept_created_at,
      card.created_at
    from eligible_personal_cards eligible
    join deck on true
    join public.personal_cards card
      on card.id = eligible.id
     and card.owner_id = deck.user_id
    join public.personal_concepts concept
      on concept.id = card.concept_id
     and concept.owner_id = deck.user_id
    join public.personal_topics topic
      on topic.id = concept.topic_id
     and topic.owner_id = deck.user_id
  ),
  personal_candidates as (
    select
      'personal'::text as candidate_type,
      personal_card.id as candidate_id,
      null::uuid as official_question_id,
      null::uuid as official_concept_id,
      personal_card.id as personal_card_id,
      personal_card.concept_id as personal_concept_id,
      personal_card.topic_id as personal_topic_id,
      personal_card.question as prompt,
      personal_card.answer,
      null::text as explanation,
      null::text as difficulty,
      null::text as testing_angle,
      1::integer as source_position,
      dense_rank() over (
        order by
          personal_card.topic_sort_order,
          lower(personal_card.topic_name),
          personal_card.topic_id,
          lower(personal_card.concept_name),
          personal_card.concept_created_at,
          personal_card.concept_id
      ) as concept_position,
      0::integer as item_sort_order,
      personal_card.created_at
    from personal_candidate_rows personal_card
  ),
  combined_candidates as (
    select * from official_candidates
    union all
    select * from personal_candidates
  ),
  positioned_candidates as (
    select
      combined.*,
      row_number() over (
        order by
          combined.source_position,
          combined.concept_position,
          combined.item_sort_order,
          combined.created_at,
          combined.candidate_id
      ) as candidate_position
    from combined_candidates combined
  )
  select
    positioned.candidate_type,
    positioned.candidate_id,
    positioned.official_question_id,
    positioned.official_concept_id,
    positioned.personal_card_id,
    positioned.personal_concept_id,
    positioned.personal_topic_id,
    positioned.prompt,
    positioned.answer,
    positioned.explanation,
    positioned.difficulty,
    positioned.testing_angle,
    positioned.candidate_position,
    positioned.created_at
  from positioned_candidates positioned
  order by positioned.candidate_position;
$function$
;

CREATE OR REPLACE FUNCTION public.select_next_personal_study_card(p_study_session_id uuid, p_include_debug boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_user_id uuid := (select auth.uid());
  target_session public.study_sessions%rowtype;
  selection_result jsonb;
begin
  if current_user_id is null or not public.has_socrates_role() then
    raise exception 'Not authorized to select a personal Study Card.';
  end if;

  select session_row.*
  into target_session
  from public.study_sessions session_row
  where session_row.id = p_study_session_id
    and session_row.user_id = current_user_id
    and session_row.ended_at is null
  for share;

  if target_session.id is null then
    raise exception 'Active study session not found.';
  end if;

  with
  personal_candidates as (
    select candidate.*
    from public.resolve_study_candidates(target_session.study_deck_id) candidate
    where candidate.candidate_type = 'personal'
  ),
  card_history as (
    select
      candidate.personal_card_id,
      count(attempt.id)::integer as total_attempt_count,
      count(attempt.id) filter (
        where attempt.result in ('easy', 'average', 'hard')
      )::integer as positive_attempt_count,
      count(attempt.id) filter (
        where attempt.result in ('didnt_know', 'forgot', 'too_hard')
      )::integer as negative_attempt_count,
      count(attempt.id) filter (
        where attempt.study_session_id = target_session.id
      )::integer as session_attempt_count,
      max(attempt.sequence_position) filter (
        where attempt.study_session_id = target_session.id
      ) as session_latest_position,
      max(attempt.created_at) as last_attempt_at,
      (
        array_agg(attempt.result order by attempt.created_at desc, attempt.id desc)
          filter (where attempt.id is not null)
      )[1] as latest_card_result
    from personal_candidates candidate
    left join public.personal_review_attempts attempt
      on attempt.personal_card_id = candidate.personal_card_id
     and attempt.user_id = current_user_id
    group by candidate.personal_card_id
  ),
  personal_traversal as (
    select min(history.session_attempt_count) as minimum_attempt_count
    from card_history history
  ),
  personal_inputs as (
    select
      candidate.*,
      history.total_attempt_count,
      history.positive_attempt_count,
      history.negative_attempt_count,
      history.session_attempt_count,
      history.session_latest_position,
      history.last_attempt_at,
      history.latest_card_result,
      traversal.minimum_attempt_count,
      state.evidence_count,
      state.positive_evidence_count,
      state.negative_evidence_count,
      state.consecutive_success_count,
      state.consecutive_lapse_count,
      state.last_result,
      state.last_reviewed_at,
      (state.personal_concept_id is null) as is_unseen_concept,
      case state.last_result
        when 'easy' then 0.00::double precision
        when 'average' then 0.15::double precision
        when 'hard' then 0.30::double precision
        when 'didnt_know' then 0.85::double precision
        when 'forgot' then 1.00::double precision
        when 'too_hard' then 0.70::double precision
        else 0.00::double precision
      end as latest_result_need
    from personal_candidates candidate
    join card_history history
      on history.personal_card_id = candidate.personal_card_id
    cross join personal_traversal traversal
    left join public.user_personal_concept_state state
      on state.user_id = current_user_id
     and state.personal_concept_id = candidate.personal_concept_id
  ),
  personal_metrics as (
    select
      input.*,
      case
        when input.is_unseen_concept then 0.70::double precision
        else least(
          1::double precision,
          greatest(
            0::double precision,
            0.40::double precision * (
              (input.negative_evidence_count + 1)::double precision
                / (input.evidence_count + 2)::double precision
            )
            + 0.25::double precision * input.latest_result_need
            + 0.15::double precision * (
              least(input.consecutive_lapse_count, 3)::double precision / 3
            )
            + 0.10::double precision / sqrt(
              (input.evidence_count + 1)::double precision
            )
            + 0.10::double precision * (
              1::double precision - exp(
                -greatest(
                  0::double precision,
                  extract(epoch from (now() - input.last_reviewed_at))
                    / 86400::double precision
                ) / 21::double precision
              )
            )
            - 0.15::double precision * (
              least(input.consecutive_success_count, 5)::double precision / 5
            )
          )
        )
      end as personal_concept_need,
      case
        when input.total_attempt_count = 0 then 1::double precision
        else 0::double precision
      end as card_new_component,
      case
        when input.total_attempt_count = 0 then 1::double precision
        else
          1::double precision - exp(
            -greatest(
              0::double precision,
              extract(epoch from (now() - input.last_attempt_at))
                / 86400::double precision
            ) / 14::double precision
          )
      end as card_revisit_need,
      case
        when input.total_attempt_count = 0 then 1::double precision
        else least(
          1::double precision,
          greatest(
            0::double precision,
            0.70::double precision * (
              (input.negative_attempt_count + 1)::double precision
                / (input.total_attempt_count + 2)::double precision
            )
            + 0.30::double precision * (
              case input.latest_card_result
                when 'easy' then 0.00::double precision
                when 'average' then 0.15::double precision
                when 'hard' then 0.30::double precision
                when 'didnt_know' then 0.85::double precision
                when 'forgot' then 1.00::double precision
                when 'too_hard' then 0.70::double precision
                else 0.00::double precision
              end
            )
          )
        )
      end as card_outcome_need,
      case
        when input.is_unseen_concept then 0.85::double precision
        else least(
          1::double precision,
          greatest(
            0::double precision,
            0.55::double precision * (
              (input.negative_evidence_count + 1)::double precision
                / (input.evidence_count + 2)::double precision
            )
            + 0.30::double precision * input.latest_result_need
            + 0.15::double precision * (
              least(input.consecutive_lapse_count, 3)::double precision / 3
            )
          )
        )
      end as personal_cram_need,
      (
        (
          input.last_result = 'forgot'
          and input.last_reviewed_at >= now() - interval '7 days'
        )
        or coalesce(input.consecutive_lapse_count, 0) >= 2
      ) as is_critical_personal
    from personal_inputs input
  ),
  personal_scores as (
    select
      metric.*,
      least(
        1::double precision,
        greatest(
          0::double precision,
          0.60::double precision * metric.personal_concept_need
            + 0.20::double precision * metric.card_new_component
            + 0.15::double precision * metric.card_outcome_need
            + 0.05::double precision * metric.card_revisit_need
        )
      ) as personal_priority,
      count(*) filter (
        where metric.session_attempt_count = metric.minimum_attempt_count
      ) over () as traversal_pool_count,
      max(metric.session_latest_position) over () as latest_personal_position
    from personal_metrics metric
  ),
  session_preference_context as materialized (
    select case when target_session.cram_mode or target_session.selection_snapshot->'unified_deck_settings'->>'version' is distinct from '109'
      then target_session.selection_snapshot->'unified_deck_settings'
      else (target_session.selection_snapshot->'unified_deck_settings') || jsonb_build_object('effective_topic_sources',
        public.m109_session_topic_sources(target_session.selection_snapshot->'unified_deck_settings')) end as settings
  ),
  calibrated_scores as (
    select score.*, case
      when target_session.cram_mode or balance.effective_balance=50 then score.personal_priority
      else least(1::double precision,greatest(0::double precision,
        score.personal_priority + 0.20::double precision * (balance.effective_balance/100::double precision - 0.5::double precision)
        * ((case when score.card_new_component=1 then 0::double precision else
          (0.60::double precision*score.personal_concept_need+0.15::double precision*score.card_outcome_need+0.05::double precision*score.card_revisit_need)/0.80::double precision end)-score.card_new_component)
        * 4::double precision*score.personal_priority*(1::double precision-score.personal_priority)))
      end as adjusted_priority,balance.effective_balance
    from personal_scores score
    cross join session_preference_context preference_context
    cross join lateral (select case when target_session.cram_mode then 50::double precision
      else public.m109_card_balance(score.personal_card_id,preference_context.settings) end as effective_balance) balance
  ),
  selected_personal as (
    select score.*
    from calibrated_scores score
    where score.session_attempt_count = score.minimum_attempt_count
    order by
      case
        when score.traversal_pool_count > 1
          and score.session_latest_position = score.latest_personal_position
          and score.latest_personal_position is not null
          then 1
        else 0
      end,
      case
        when target_session.cram_mode then score.personal_cram_need
        else score.adjusted_priority
      end desc,
      score.total_attempt_count,
      score.last_attempt_at asc nulls first,
      score.candidate_position,
      score.personal_card_id
    limit 1
  )
  select
    jsonb_build_object(
      'candidate_type', 'personal',
      'candidate_id', selected.candidate_id,
      'official_question_id', null,
      'official_concept_id', null,
      'personal_card_id', selected.personal_card_id,
      'personal_concept_id', selected.personal_concept_id,
      'personal_topic_id', selected.personal_topic_id,
      'prompt', selected.prompt,
      'answer', selected.answer,
      'explanation', null,
      'difficulty', null,
      'testing_angle', null,
      'candidate_position', selected.candidate_position,
      'created_at', selected.created_at
    )
    || case
      when coalesce(p_include_debug, false) then jsonb_build_object(
        'personal_priority', selected.adjusted_priority,
        'personal_concept_need', selected.personal_concept_need,
        'personal_cram_need', selected.personal_cram_need,
        'card_new_component', selected.card_new_component,
        'card_outcome_need', selected.card_outcome_need,
        'card_revisit_need', selected.card_revisit_need,
        'card_positive_attempt_count', selected.positive_attempt_count,
        'card_negative_attempt_count', selected.negative_attempt_count,
        'card_latest_result', selected.latest_card_result,
        'personal_evidence_count', selected.evidence_count,
        'personal_positive_evidence_count', selected.positive_evidence_count,
        'personal_negative_evidence_count', selected.negative_evidence_count,
        'personal_consecutive_success_count',
          selected.consecutive_success_count,
        'personal_consecutive_lapse_count', selected.consecutive_lapse_count,
        'personal_latest_result', selected.last_result,
        'personal_is_critical', selected.is_critical_personal,
        'personal_session_attempt_count', selected.session_attempt_count,
        'personal_traversal_minimum_count', selected.minimum_attempt_count,
        'selection_reason', case
          when target_session.cram_mode then 'personal_cram_need'
          when selected.is_unseen_concept then 'personal_unseen_concept'
          when selected.is_critical_personal then 'personal_lapse_priority'
          when selected.card_new_component > 0 then 'personal_new_card'
          else 'personal_priority'
        end
      )
      else '{}'::jsonb
    end
  || case when coalesce(p_include_debug,false) and not target_session.cram_mode then jsonb_build_object('personal_base_priority',selected.personal_priority,'effective_new_mastery_balance',selected.effective_balance) else '{}'::jsonb end
  into selection_result
  from selected_personal selected;

  return selection_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.start_study_session(p_study_deck_id uuid, p_new_mastery_balance integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_user_id uuid := (select auth.uid());
  target_deck public.study_decks%rowtype;
  snapshot jsonb;
  session_balance integer;
  new_session_id uuid;
begin
  if current_user_id is null or not public.has_socrates_role() then
    raise exception 'Not authorized to start a study session.';
  end if;

  if p_new_mastery_balance is null or p_new_mastery_balance not between 0 and 100 then
    raise exception 'Study balance must be between 0 and 100.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock_shared(104,20260927);

  select deck.*
  into target_deck
  from public.study_decks deck
  where deck.id = p_study_deck_id
    and deck.user_id = current_user_id
    and deck.is_active
  for share;

  if target_deck.id is null then
    raise exception 'Active study deck not found.';
  end if;

  if not exists (
    select 1
    from public.resolve_study_candidates(target_deck.id) candidate
  ) then
    raise exception 'No eligible Study candidates are available for this deck.';
  end if;

  select coalesce(
    round(avg(coalesce(preference.new_mastery_balance, 50)))::integer,
    p_new_mastery_balance
  )
  into session_balance
  from public.user_study_node_selections selection
  left join public.study_deck_node_preferences preference
    on preference.deck_id = selection.deck_id
   and preference.library_node_id = selection.node_id
  where selection.deck_id = target_deck.id
    and selection.user_id = current_user_id
    and selection.library_id = target_deck.library_id;

  select jsonb_build_object(
    'selected_node_ids',
    coalesce(
      (
        select jsonb_agg(selection.node_id order by selection.node_id::text)
        from public.user_study_node_selections selection
        where selection.deck_id = target_deck.id
          and selection.user_id = current_user_id
          and selection.library_id = target_deck.library_id
      ),
      '[]'::jsonb
    ),
    'excluded_node_ids',
    coalesce(
      (
        select jsonb_agg(exclusion.node_id order by exclusion.node_id::text)
        from public.study_deck_node_exclusions exclusion
        where exclusion.deck_id = target_deck.id
          and exclusion.user_id = current_user_id
          and exclusion.library_id = target_deck.library_id
      ),
      '[]'::jsonb
    ),
    'concept_overrides',
    coalesce(
      (
        select jsonb_object_agg(
          override.concept_id::text,
          override.selection_state
          order by override.concept_id::text
        )
        from public.user_study_concept_overrides override
        where override.deck_id = target_deck.id
          and override.user_id = current_user_id
          and override.library_id = target_deck.library_id
      ),
      '{}'::jsonb
    ),
    'node_preferences',
    coalesce(
      (
        select jsonb_object_agg(
          selection.node_id::text,
          coalesce(preference.new_mastery_balance, 50)
          order by selection.node_id::text
        )
        from public.user_study_node_selections selection
        left join public.study_deck_node_preferences preference
          on preference.deck_id = selection.deck_id
         and preference.library_node_id = selection.node_id
        where selection.deck_id = target_deck.id
          and selection.user_id = current_user_id
          and selection.library_id = target_deck.library_id
      ),
      '{}'::jsonb
    ),
    'cram_mode', target_deck.cram_mode
  )
  into snapshot;

  snapshot := snapshot || jsonb_build_object('unified_deck_settings',public.m109_settings_snapshot(target_deck.id));

  insert into public.study_sessions (
    user_id,
    library_id,
    study_deck_id,
    new_mastery_balance,
    cram_mode,
    selection_snapshot
  )
  values (
    current_user_id,
    target_deck.library_id,
    target_deck.id,
    session_balance::smallint,
    target_deck.cram_mode,
    snapshot
  )
  returning id into new_session_id;

  return new_session_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.start_study_session_with_candidate(p_study_deck_id uuid, p_new_mastery_balance integer, p_session_id uuid, p_include_debug boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_user_id uuid := (select auth.uid());
  target_deck public.study_decks%rowtype;
  existing_session public.study_sessions%rowtype;
  snapshot jsonb;
  session_balance integer;
  first_candidate jsonb;
begin
  if current_user_id is null or not public.has_socrates_role() then
    raise exception 'Not authorized to start a study session.';
  end if;

  if p_session_id is null then
    raise exception 'Study session request ID is required.';
  end if;

  if p_new_mastery_balance is null or p_new_mastery_balance not between 0 and 100 then
    raise exception 'Study balance must be between 0 and 100.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock_shared(104,20260927);

  select session_row.*
  into existing_session
  from public.study_sessions session_row
  where session_row.id = p_session_id
  for share;

  if existing_session.id is not null then
    if existing_session.user_id <> current_user_id
        or existing_session.study_deck_id <> p_study_deck_id
        or existing_session.ended_at is not null then
      raise exception 'Study session request ID is already in use.';
    end if;

    first_candidate := public.select_next_study_candidate(
      existing_session.id,
      p_include_debug
    );

    if first_candidate is null then
      raise exception 'No eligible Study candidates are available for this deck.';
    end if;

    return jsonb_build_object(
      'session_id', existing_session.id,
      'candidate', first_candidate
    );
  end if;

  select deck.*
  into target_deck
  from public.study_decks deck
  where deck.id = p_study_deck_id
    and deck.user_id = current_user_id
    and deck.is_active
  for share;

  if target_deck.id is null then
    raise exception 'Active study deck not found.';
  end if;

  select coalesce(
    round(avg(coalesce(preference.new_mastery_balance, 50)))::integer,
    p_new_mastery_balance
  )
  into session_balance
  from public.user_study_node_selections selection
  left join public.study_deck_node_preferences preference
    on preference.deck_id = selection.deck_id
   and preference.library_node_id = selection.node_id
  where selection.deck_id = target_deck.id
    and selection.user_id = current_user_id
    and selection.library_id = target_deck.library_id;

  select jsonb_build_object(
    'selected_node_ids',
    coalesce(
      (
        select jsonb_agg(selection.node_id order by selection.node_id::text)
        from public.user_study_node_selections selection
        where selection.deck_id = target_deck.id
          and selection.user_id = current_user_id
          and selection.library_id = target_deck.library_id
      ),
      '[]'::jsonb
    ),
    'excluded_node_ids',
    coalesce(
      (
        select jsonb_agg(exclusion.node_id order by exclusion.node_id::text)
        from public.study_deck_node_exclusions exclusion
        where exclusion.deck_id = target_deck.id
          and exclusion.user_id = current_user_id
          and exclusion.library_id = target_deck.library_id
      ),
      '[]'::jsonb
    ),
    'concept_overrides',
    coalesce(
      (
        select jsonb_object_agg(
          override.concept_id::text,
          override.selection_state
          order by override.concept_id::text
        )
        from public.user_study_concept_overrides override
        where override.deck_id = target_deck.id
          and override.user_id = current_user_id
          and override.library_id = target_deck.library_id
      ),
      '{}'::jsonb
    ),
    'node_preferences',
    coalesce(
      (
        select jsonb_object_agg(
          selection.node_id::text,
          coalesce(preference.new_mastery_balance, 50)
          order by selection.node_id::text
        )
        from public.user_study_node_selections selection
        left join public.study_deck_node_preferences preference
          on preference.deck_id = selection.deck_id
         and preference.library_node_id = selection.node_id
        where selection.deck_id = target_deck.id
          and selection.user_id = current_user_id
          and selection.library_id = target_deck.library_id
      ),
      '{}'::jsonb
    ),
    'cram_mode', target_deck.cram_mode
  )
  into snapshot;

  snapshot := snapshot || jsonb_build_object('unified_deck_settings',public.m109_settings_snapshot(target_deck.id));

  insert into public.study_sessions (
    id,
    user_id,
    library_id,
    study_deck_id,
    new_mastery_balance,
    cram_mode,
    selection_snapshot
  )
  values (
    p_session_id,
    current_user_id,
    target_deck.library_id,
    target_deck.id,
    session_balance::smallint,
    target_deck.cram_mode,
    snapshot
  );

  first_candidate := public.select_next_study_candidate(
    p_session_id,
    p_include_debug
  );

  if first_candidate is null then
    -- Raising after the insert rolls back the Session and snapshot together.
    raise exception 'No eligible Study candidates are available for this deck.';
  end if;

  return jsonb_build_object(
    'session_id', p_session_id,
    'candidate', first_candidate
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_home_study_bootstrap(p_library_id uuid, p_deck_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_user_id uuid := (select auth.uid());
  target_deck public.study_decks%rowtype;
  result jsonb;
begin
  if current_user_id is null or not public.has_socrates_role() then
    raise exception 'Not authorized to load Home study data.';
  end if;

  select deck.*
  into target_deck
  from public.study_decks deck
  where deck.id = p_deck_id
    and deck.library_id = p_library_id
    and deck.user_id = current_user_id
    and deck.is_active;

  if target_deck.id is null then
    raise exception 'Active study deck not found.';
  end if;

  if not public.is_editor_or_admin()
    and not exists (
      select 1
      from public.user_libraries membership
      where membership.user_id = current_user_id
        and membership.library_id = p_library_id
    )
  then
    raise exception 'Not authorized for this Library.';
  end if;

  select jsonb_build_object(
    'available_libraries',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', library.id,
              'name', library.name,
              'slug', library.slug,
              'description', library.description,
              'status', library.status
            )
            order by library.name, library.id
          )
          from public.libraries library
          where library.status = 'active'
            and (
              public.is_editor_or_admin()
              or library.id = p_library_id
            )
        ),
        '[]'::jsonb
      ),
    'nodes',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', node.id,
              'name', node.name,
              'node_type', node.node_type,
              'parent_id', node.parent_id
            )
            order by node.name, node.id
          )
          from public.library_nodes node
          where node.library_id = p_library_id
        ),
        '[]'::jsonb
      ),
    'placements',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'concept_id', placement.concept_id,
              'library_node_id', placement.library_node_id,
              'concepts', jsonb_build_object(
                'id', concept.id,
                'name', concept.name,
                'concept_type', concept.concept_type,
                'summary', concept.summary
              )
            )
            order by placement.library_node_id, placement.concept_id
          )
          from public.concept_placements placement
          join public.library_nodes node
            on node.id = placement.library_node_id
           and node.library_id = p_library_id
          join public.concepts concept
            on concept.id = placement.concept_id
           and concept.status = 'published'
        ),
        '[]'::jsonb
      ),
    'selected_node_ids',
      coalesce(
        (
          select jsonb_agg(selection.node_id order by selection.node_id)
          from public.user_study_node_selections selection
          where selection.deck_id = target_deck.id
            and selection.user_id = current_user_id
            and selection.library_id = p_library_id
        ),
        '[]'::jsonb
      ),
    'excluded_node_ids',
      coalesce(
        (
          select jsonb_agg(exclusion.node_id order by exclusion.node_id)
          from public.study_deck_node_exclusions exclusion
          where exclusion.deck_id = target_deck.id
            and exclusion.user_id = current_user_id
            and exclusion.library_id = p_library_id
        ),
        '[]'::jsonb
      ),
    'node_preferences',
      coalesce(
        (
          select jsonb_object_agg(
            preference.library_node_id::text,
            preference.new_mastery_balance
            order by preference.library_node_id::text
          )
          from public.study_deck_node_preferences preference
          where preference.deck_id = target_deck.id
            and preference.user_id = current_user_id
            and preference.library_id = p_library_id
        ),
        '{}'::jsonb
      ),
    'concept_overrides',
      coalesce(
        (
          select jsonb_object_agg(
            override.concept_id::text,
            override.selection_state
            order by override.concept_id::text
          )
          from public.user_study_concept_overrides override
          where override.deck_id = target_deck.id
            and override.user_id = current_user_id
            and override.library_id = p_library_id
        ),
        '{}'::jsonb
      ),
    'resolved_concepts',
      coalesce(
        (
          select jsonb_agg(
            to_jsonb(resolved)
            order by lower(resolved.concept_name), resolved.concept_id
          )
          from public.resolve_study_deck(target_deck.id) resolved
        ),
        '[]'::jsonb
      ),
    'library_availability_question_counts',
      public.get_library_official_availability_counts(p_library_id),
    -- Retained wire field: selected-deck candidates, never Library availability.
    'official_question_counts',
      coalesce(
        (
          select jsonb_object_agg(
            count_row.concept_id::text,
            count_row.question_count
            order by count_row.concept_id::text
          )
          from (
            select
              candidate.official_concept_id as concept_id,
              count(distinct candidate.official_question_id)::integer
                as question_count
            from public.resolve_study_candidates(target_deck.id) candidate
            where candidate.candidate_type = 'official'
              and candidate.official_concept_id is not null
              and candidate.official_question_id is not null
            group by candidate.official_concept_id
          ) count_row
        ),
        '{}'::jsonb
      ),
    'learner_progress',
      public.get_library_learner_progress(p_library_id),
    'personal_topics',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', topic.id,
              'parent_id', topic.parent_id,
              'name', topic.name,
              'sort_order', topic.sort_order
            )
            order by topic.sort_order, topic.name, topic.id
          )
          from public.personal_topics topic
          where topic.owner_id = current_user_id
        ),
        '[]'::jsonb
      ),
    'personal_concepts',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', concept.id,
              'topic_id', concept.topic_id,
              'name', concept.name
            )
            order by concept.name, concept.id
          )
          from public.personal_concepts concept
          where concept.owner_id = current_user_id
        ),
        '[]'::jsonb
      ),
    'personal_cards',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', card.id,
              'concept_id', card.concept_id
            )
            order by card.created_at, card.id
          )
          from public.personal_cards card
          where card.owner_id = current_user_id
        ),
        '[]'::jsonb
      ),
    'selected_personal_topic_ids',
      coalesce(
        (
          select jsonb_agg(
            selection.personal_topic_id
            order by selection.personal_topic_id
          )
          from public.study_deck_personal_topic_selections selection
          where selection.deck_id = target_deck.id
            and selection.user_id = current_user_id
            and selection.library_id = p_library_id
        ),
        '[]'::jsonb
      ),
    'personal_collections',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', collection.id,
              'name', collection.name,
              'card_count', (
                select count(*)::integer
                from public.personal_collection_cards membership
                where membership.collection_id = collection.id
                  and membership.owner_id = current_user_id
              )
            )
            order by collection.name, collection.id
          )
          from public.personal_collections collection
          where collection.owner_id = current_user_id
        ),
        '[]'::jsonb
      ),
    'selected_personal_collection_ids',
      coalesce(
        (
          select jsonb_agg(
            selection.personal_collection_id
            order by selection.personal_collection_id
          )
          from public.study_deck_personal_collection_selections selection
          where selection.deck_id = target_deck.id
            and selection.user_id = current_user_id
            and selection.library_id = p_library_id
        ),
        '[]'::jsonb
      )
  )
  into result;

  result := result || jsonb_build_object('unified_deck_settings',public.m109_settings_snapshot(target_deck.id),
    'personal_topic_preferences',(select coalesce(jsonb_object_agg(personal_topic_id,new_mastery_balance),'{}') from public.study_deck_personal_topic_preferences where deck_id=target_deck.id),
    'personal_collection_preferences',(select coalesce(jsonb_object_agg(personal_collection_id,new_mastery_balance),'{}') from public.study_deck_personal_collection_preferences where deck_id=target_deck.id),
    'personal_collection_groups',(select coalesce(jsonb_agg(jsonb_build_object('group_key','personal:collection:'||c.id::text,'collection_id',c.id,'selected',exists(select 1 from public.study_deck_personal_collection_selections cs where cs.deck_id=target_deck.id and cs.personal_collection_id=c.id)) order by c.id),'[]') from public.personal_collections c where c.owner_id=current_user_id),
    'unified_deck_capabilities',jsonb_build_object('branch_selection',true,'group_balance',true,'calibration_version',1));
  return result;
end;
$function$
;

revoke references(id,user_id,library_id) on public.study_decks from socrates_migrator;
revoke references(id,owner_id) on public.personal_topics from socrates_migrator;
revoke references(id,owner_id) on public.personal_collections from socrates_migrator;
create temporary table m109_security_after on commit drop as
select 'role' kind,oid::text id,to_jsonb(r)::text val from pg_roles r
union all select 'membership',oid::text,to_jsonb(m)::text from pg_auth_members m
union all select 'default',oid::text,to_jsonb(d)::text from pg_default_acl d
union all select 'policy',oid::text,to_jsonb(p)::text from pg_policy p
union all select 'schema',oid::text,jsonb_build_array(nspowner,nspacl)::text from pg_namespace
union all select 'relation',oid::text,jsonb_build_array(relowner,relacl,relrowsecurity,relforcerowsecurity)::text from pg_class where relnamespace='public'::regnamespace
union all select 'column',concat(attrelid,':',attnum),coalesce(attacl::text,'NULL') from pg_attribute where attrelid in ('public.study_decks'::regclass,'public.personal_topics'::regclass,'public.personal_collections'::regclass)
union all select 'function',oid::text,jsonb_build_array(proowner,proacl,prosecdef,proconfig,pg_get_functiondef(oid))::text from pg_proc where pronamespace='public'::regnamespace;
do $final$ begin
 if exists(select 1 from m109_security_before b left join m109_security_after a using(kind,id)
 where (b.kind<>'function' or b.id::oid not in(select oid from m109_approved_functions)) and a.val is distinct from b.val) then raise exception '109 protected security/object state changed';end if;
 if exists(select 1 from m109_security_before b join m109_security_after a using(kind,id)
 where b.kind='function' and b.id::oid in(select oid from m109_approved_functions) and (b.val::jsonb - 4) is distinct from (a.val::jsonb - 4)) then raise exception '109 guarded function boundary changed';end if;
 if exists(select 1 from pg_proc p where p.pronamespace='public'::regnamespace and not exists(select 1 from m109_security_before b where b.kind='function' and b.id=p.oid::text) and (p.proowner<>'socrates_migrator'::regrole or p.prosecdef or p.proconfig is distinct from array['search_path=""'])) then raise exception '109 new function authority invalid';end if;
 if exists(select 1 from pg_class c where c.relname in ('study_deck_personal_topic_exclusions','study_deck_personal_topic_preferences','study_deck_personal_collection_preferences') and c.relnamespace='public'::regnamespace and (c.relowner<>'socrates_migrator'::regrole or not c.relrowsecurity)) then raise exception '109 new table authority invalid';end if;
end $final$;
commit;
