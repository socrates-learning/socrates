-- Read-only installed-contract check. Does not create messages or change data.
begin transaction read only;
do $$ declare r text; begin
 if not exists(select 1 from pg_class where oid='public.admin_inbox_messages'::regclass and relrowsecurity and pg_get_userbyid(relowner)='postgres') then raise exception 'Inbox RLS/owner mismatch'; end if;
 if (select count(*) from pg_policies where schemaname='public' and tablename='admin_inbox_messages')<>1
  or not exists(select 1 from pg_policies where schemaname='public' and tablename='admin_inbox_messages' and policyname='admin_inbox_admin_read' and cmd='SELECT' and qual like '%is_admin%') then raise exception 'Inbox read policy mismatch'; end if;
 foreach r in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(r,'public.admin_inbox_messages','INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES') then raise exception 'Unexpected direct Inbox write for %',r; end if;
  if has_table_privilege(r,'public.admin_inbox_messages','SELECT') <> (r='authenticated') then raise exception 'Unexpected Inbox read grant for %',r; end if;
  if has_schema_privilege(r,'admin_inbox_internal','USAGE') <> (r='service_role') then raise exception 'Private Inbox schema exposed to %',r; end if;
  if has_function_privilege(r,'admin_inbox_internal.create_message(text,text,text,text,text,text,uuid,uuid,uuid)','EXECUTE') <> (r='service_role') then raise exception 'Internal creation grant mismatch for %',r; end if;
  if has_function_privilege(r,'public.get_admin_inbox_messages()','EXECUTE') <> (r='authenticated') or has_function_privilege(r,'public.save_admin_inbox_message(uuid,text,text,uuid)','EXECUTE') <> (r='authenticated') then raise exception 'Inbox management grant mismatch for %',r; end if;
 end loop;
 if exists(select 1 from pg_proc where oid in ('public.get_admin_inbox_messages()'::regprocedure,'public.save_admin_inbox_message(uuid,text,text,uuid)'::regprocedure,'admin_inbox_internal.create_message(text,text,text,text,text,text,uuid,uuid,uuid)'::regprocedure)
  and (pg_get_userbyid(proowner)<>'postgres' or not coalesce(proconfig @> array['search_path=""'],false))) then raise exception 'Inbox function ownership/search path mismatch'; end if;
 if (select prosecdef from pg_proc where oid='public.get_admin_inbox_messages()'::regprocedure) then raise exception 'Inbox reads must enforce caller RLS'; end if;
 raise notice 'PASS: Migration 128 ownership, RLS, grants and private creation contract';
end $$;
rollback;
