-- Read-only installed-contract verification. No records are changed.
\set ON_ERROR_STOP on
begin transaction read only;
do $verify$ declare r record; role_name text; t text; begin
 if to_regclass('public.m134_active_topic_locations') is null
 or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='official_topic_locations' and column_name='detached_at' and data_type='timestamp with time zone')
 or not exists(select 1 from pg_constraint where conrelid='public.official_topic_locations'::regclass and conname='m134_detachment_pair') then raise exception 'Missing retained-location contract'; end if;
 if not exists(select 1 from pg_class where oid='public.official_topic_locations'::regclass and relrowsecurity) then raise exception 'Location RLS required'; end if;
 if not exists(select 1 from pg_policy where polrelid='public.official_topic_locations'::regclass and polname='official_topic_locations_read' and pg_get_expr(polqual,polrelid) like '%detached_at IS NULL%') then raise exception 'Active-only RLS required'; end if;
 if not exists(select 1 from pg_index where indexrelid='public.m134_active_location_pair'::regclass and indisunique and pg_get_expr(indpred,indrelid)='(detached_at IS NULL)') then raise exception 'Active sibling uniqueness required'; end if;
 foreach role_name in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(role_name,'public.official_topic_locations','INSERT,UPDATE,DELETE,TRUNCATE') then raise exception 'Unrestricted location write: %',role_name; end if;
  if has_table_privilege(role_name,'public.m134_active_topic_locations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') then raise exception 'Internal active view exposed: %',role_name; end if;
 end loop;
 for r in select p.oid,p.proname,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and
  (p.proname like 'm134_%' or p.proname in('review_official_topic_detachment','detach_official_topic_location','list_unassigned_official_topics','reassign_official_topic')) loop
  if not r.prosecdef or not 'search_path=""'=any(r.proconfig) then raise exception 'Unsafe function: %',r.proname; end if;
  if has_function_privilege('anon',r.oid,'EXECUTE') or has_function_privilege('service_role',r.oid,'EXECUTE') then raise exception 'Unauthorized function access: %',r.proname; end if;
  if has_function_privilege('authenticated',r.oid,'EXECUTE') is distinct from (r.proname not like 'm134_%') then raise exception 'Incorrect browser entry point: %',r.proname; end if;
 end loop;
 foreach t in array array['library_nodes','official_topic_locations'] loop
  if not exists(select 1 from pg_trigger where tgrelid=('public.'||t)::regclass and tgfoid='public.m134_preserve_topic_records()'::regprocedure and tgenabled='O') then raise exception 'Missing retained-record guard: %',t; end if;
  if not exists(select 1 from pg_trigger where tgrelid=('public.'||t)::regclass and tgfoid='public.m133_admin_topic_write_guard()'::regprocedure and tgenabled='O') then raise exception 'Missing active Admin guard: %',t; end if;
 end loop;
 foreach t in array array['personal_topic_official_placements','personal_concept_official_placements','personal_cards'] loop
  if not exists(select 1 from pg_trigger where tgrelid=('public.'||t)::regclass and tgfoid='public.m134_require_personal_anchor()'::regprocedure and tgenabled='O') then raise exception 'Missing owner-anchor race guard: %',t; end if;
 end loop;
 if position('if p_action=''remove'' then raise exception' in pg_get_functiondef('public.change_official_topic_location(uuid,uuid,uuid,text,text,boolean,uuid,text)'::regprocedure))=0 then raise exception 'Legacy physical removal still reachable'; end if;
 if md5(pg_get_functiondef('public.m132_require_revision(uuid,text)'::regprocedure))<>'7199144793cdb508b4ea601ff40b1d62' then raise exception 'Released Admin revision and locking boundary changed'; end if;
 perform public.m132_check_locations(id) from public.libraries;
end $verify$;
select 'Migration 134 installed contract verified' as result;
rollback;
