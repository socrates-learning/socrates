\set ON_ERROR_STOP on
begin read only;
set local search_path='';
do $$ declare r record; role_name text; begin
 if not (select relrowsecurity from pg_class where oid='public.account_deletion_state'::regclass) then raise exception 'Deletion state RLS missing'; end if;
 if not exists(select 1 from pg_constraint where conrelid='public.account_deletion_state'::regclass and contype='u' and pg_get_constraintdef(oid)='UNIQUE (receipt_hash)') then raise exception 'Deletion receipt identity must be unique'; end if;
 foreach role_name in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(role_name,'public.account_deletion_state','SELECT,INSERT,UPDATE,DELETE') then raise exception 'Deletion state exposed to %',role_name; end if;
 end loop;
 for r in select p.oid,p.proname,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and (p.proname like 'm127_%' or p.proname in ('account_is_active','begin_account_deletion','account_deletion_status')) loop
  if not r.prosecdef or not ('search_path=""'=any(r.proconfig)) then raise exception 'Unsafe helper configuration: %',r.proname; end if;
  if has_function_privilege('anon',r.oid,'EXECUTE') then raise exception 'Anonymous deletion helper exposed: %',r.proname; end if;
  if has_function_privilege('authenticated',r.oid,'EXECUTE') <> (r.proname='account_is_active') then raise exception 'Browser helper ACL: %',r.proname; end if;
  if has_function_privilege('service_role',r.oid,'EXECUTE') <> (r.proname in ('begin_account_deletion','account_deletion_status')) then raise exception 'Service helper ACL: %',r.proname; end if;
 end loop;
 for r in select c.oid,c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' and c.relname<>'account_deletion_state' loop
  if not exists(select 1 from pg_trigger where tgrelid=r.oid and tgname='a127_write_fence' and tgenabled='O') then raise exception 'Missing mutation fence: %',r.relname; end if;
  if r.relrowsecurity and not exists(select 1 from pg_policy where polrelid=r.oid and polname='account_deletion_fence' and not polpermissive and polcmd='*'
   and polroles=array['authenticated'::regrole::oid] and pg_get_expr(polqual,polrelid) like '%account_is_active()%'
   and pg_get_expr(polwithcheck,polrelid) like '%account_is_active()%') then raise exception 'Missing RLS fence: %',r.relname; end if;
 end loop;
 if not exists(select 1 from pg_trigger where tgrelid='auth.users'::regclass and tgname='a127_account_created' and tgenabled='O')
 or not exists(select 1 from pg_trigger where tgrelid='auth.users'::regclass and tgname='a127_delete_account' and tgenabled='O')
 or not exists(select 1 from pg_trigger where tgrelid='auth.users'::regclass and tgname='z127_account_deleted' and tgenabled='O' and tgdeferrable and tginitdeferred)
 or not exists(select 1 from pg_trigger where tgrelid='storage.objects'::regclass and tgname='a127_storage_fence' and tgenabled='O') then raise exception 'Lifecycle/Storage trigger missing'; end if;
 if exists(select 1 from auth.users u left join public.account_deletion_state s on s.user_id=u.id where s.user_id is null) then raise exception 'Auth user without deletion fence'; end if;
 if exists(select 1 from public.account_deletion_state s join auth.users u on u.id=s.user_id where s.state='complete') then raise exception 'Completed deletion retains Auth identity'; end if;
 if exists(select 1 from public.account_deletion_state where state='complete' and (objects<>'[]'::jsonb or purge_xid is not null or completed_at is null)) then raise exception 'Incomplete tombstone cleanup'; end if;
 if exists(select 1 from pg_proc where oid='public.normalize_topic_siblings_after_write()'::regprocedure and (prosecdef or proowner<>'socrates_migrator'::regrole)) then raise exception 'Topic normalization authority changed'; end if;
end $$;
select 'Migration 127 restricted lifecycle, ownership fences and cleanup contracts verified' result;
rollback;
