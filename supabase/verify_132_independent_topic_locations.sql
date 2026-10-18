-- Read-only installed-contract verification; no fixtures or application writes.
\set ON_ERROR_STOP on
begin transaction read only;
do $verify$
declare r record; role_name text; table_name text;
begin
 foreach table_name in array array['official_topic_locations','study_deck_location_selections'] loop
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=table_name and c.relrowsecurity) then
   raise exception 'Missing RLS on %',table_name; end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop
   if has_table_privilege(role_name,'public.'||table_name,'INSERT,UPDATE,DELETE,TRUNCATE') then
    raise exception 'Direct % write privilege for %',table_name,role_name; end if;
  end loop;
  if has_table_privilege('anon','public.'||table_name,'SELECT') then raise exception 'Anonymous location data exposure'; end if;
  if not has_table_privilege('authenticated','public.'||table_name,'SELECT') then raise exception 'Missing authorized read'; end if;
 end loop;
 for r in select p.oid,p.proname,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and
  (p.proname like 'm132_%' or p.proname in('change_official_topic_location','create_official_topic_at_location','set_study_deck_location_selection','set_study_deck_location_preference','save_placement_study_goal')) loop
  if not r.prosecdef or not 'search_path=""'=any(r.proconfig) then raise exception 'Unsafe function configuration: %',r.proname; end if;
  if has_function_privilege('anon',r.oid,'EXECUTE') or has_function_privilege('service_role',r.oid,'EXECUTE') then raise exception 'Unapproved execute privilege: %',r.proname; end if;
  if r.proname like 'm132_%' and has_function_privilege('authenticated',r.oid,'EXECUTE') then raise exception 'Internal helper exposed: %',r.proname; end if;
 end loop;
 for r in select signature from (values
  ('change_official_topic_location(uuid,uuid,uuid,text,text,boolean,uuid,text)'),
  ('create_official_topic_at_location(uuid,uuid,text,text,text)'),
  ('set_study_deck_location_selection(uuid,uuid,boolean,text)'),
  ('set_study_deck_location_preference(uuid,uuid,uuid,integer,text)'),
  ('save_placement_study_goal(uuid,text,date,text,uuid[],uuid[],uuid,bigint)')) x(signature) loop
  if not has_function_privilege('authenticated',('public.'||r.signature)::regprocedure,'EXECUTE') then raise exception 'Missing controlled entry point: %',r.signature; end if;
 end loop;
 if has_function_privilege('authenticated','public.add_official_topic_placement(uuid,uuid,uuid,text,text)','EXECUTE')
 or has_function_privilege('authenticated','public.position_official_topic_placement(uuid,text,uuid,uuid,text,text[],text[],text)','EXECUTE')
 or has_function_privilege('authenticated','public.remove_official_topic_placement(uuid,text,text,text)','EXECUTE') then raise exception 'Obsolete structural mutations exposed'; end if;
 if not exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name='study_goals' and c.column_name='official_location_ids' and c.udt_name='_uuid') then raise exception 'Missing Goal location scope'; end if;
 if not exists(select 1 from pg_trigger where tgname='m132_location_integrity' and tgdeferrable and tginitdeferred)
 or not exists(select 1 from pg_trigger where tgname='m132_canonical_location_integrity' and tgdeferrable and tginitdeferred)
 or not exists(select 1 from pg_trigger where tgname='m132_structure_lock') then raise exception 'Missing structural safeguards'; end if;
 if md5(pg_get_functiondef('public.delete_admin_inbox_message(uuid,uuid)'::regprocedure))<>'4d8799b055f061574b9820105dea26f5' then raise exception 'Unrelated released function changed: delete_admin_inbox_message(uuid,uuid)';end if;
 if md5(pg_get_functiondef('public.m123_goal_progress(uuid)'::regprocedure))<>'d9d33044b1baa1f7edb0ad241d1815c8' then raise exception 'Unrelated released function changed: m123_goal_progress(uuid)';end if;
 if md5(pg_get_functiondef('public.select_next_study_question_hardened(uuid,boolean)'::regprocedure))<>'6b291b269d7780be00946fa25d90a37f' then raise exception 'Unrelated released function changed: select_next_study_question_hardened(uuid,boolean)';end if;
 if md5(pg_get_functiondef('public.start_study_session(uuid,integer)'::regprocedure))<>'fbe62da3da3c6ec0f81e076b11767f4b' then raise exception 'Unrelated released function changed: start_study_session(uuid,integer)';end if;
 perform public.m132_check_locations(id) from public.libraries;
end $verify$;
select 'Migration 132 installed contract verified' as result;
rollback;
