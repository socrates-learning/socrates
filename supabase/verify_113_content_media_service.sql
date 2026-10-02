begin;
do $$
declare f record; r text;
begin
 if not exists(select 1 from pg_class where oid='public.media_service_operations'::regclass and relrowsecurity) then raise exception 'Missing private operation RLS'; end if;
 foreach r in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(r,'public.media_service_operations','SELECT,INSERT,UPDATE,DELETE') then raise exception 'Broad operation grant to %',r; end if;
 end loop;
 for f in select oid,proname,prosecdef,proconfig from pg_proc where pronamespace='public'::regnamespace and proname like 'm113_%' loop
  if not f.prosecdef or not ('search_path=""'=any(f.proconfig)) then raise exception 'Unsafe function %',f.proname; end if;
  if has_function_privilege('anon',f.oid,'EXECUTE') or has_function_privilege('authenticated',f.oid,'EXECUTE') then raise exception 'Browser service access'; end if;
  if has_function_privilege('service_role',f.oid,'EXECUTE') <> (f.proname<>'m113_actor_target') then raise exception 'Unexpected service grant'; end if;
 end loop;
 if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname like 'm113_%')<>5 then raise exception 'Unexpected function set'; end if;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='media_service_operations' and column_name ~ 'caption|alt_text|filename|url|payload|content|image|bytes') then raise exception 'Content in operational table'; end if;
 foreach r in array array['parent_id','object_id','asset_scope','dispatched_at','confirmed_at','cleanup_state','cleanup_token','cleanup_after','cleanup_attempts'] loop
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='media_service_operations' and column_name=r) then raise exception 'Missing lifecycle column %',r; end if;
 end loop;
 if exists(select 1 from pg_policies where schemaname='public' and tablename='media_service_operations') then raise exception 'Operational table must not have browser policies'; end if;
 foreach r in array array['media_service_idempotency','media_service_attempt_generation','media_service_asset_operation','media_service_operations_object_id_key'] loop
  if not exists(select 1 from pg_index where indexrelid=to_regclass('public.'||r) and indisunique) then raise exception 'Missing lifecycle uniqueness %',r; end if;
 end loop;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='media_service_operations' and column_name in ('reservation_id','storage_url','signed_url')) then raise exception 'Obsolete direct-object reservation contract'; end if;
end $$;
rollback;
