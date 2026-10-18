-- Read-only installed contract checks. No fixtures or Production writes.
begin read only;
do $$
declare fn regprocedure := 'public.submit_study_suggestion_internal(uuid,uuid,uuid,uuid,text,text)'::regprocedure;
begin
 if not exists(select 1 from pg_class where oid='public.admin_inbox_messages'::regclass and relrowsecurity) then raise exception 'Inbox RLS required'; end if;
 if has_function_privilege('anon',fn,'execute') or has_function_privilege('authenticated',fn,'execute')
  or not has_function_privilege('service_role',fn,'execute') then raise exception 'Internal submission privileges incorrect'; end if;
 if has_table_privilege('authenticated','public.admin_inbox_messages','insert') or has_table_privilege('anon','public.admin_inbox_messages','select')
  or has_table_privilege('service_role','public.admin_inbox_messages','insert') then raise exception 'Direct Inbox access widened'; end if;
 if not exists(select 1 from pg_proc where oid=fn and prosecdef and proowner=(select oid from pg_roles where rolname='postgres') and proconfig=array['search_path=""']) then raise exception 'Definer ownership or search path incorrect'; end if;
 if not exists(select 1 from pg_constraint where conrelid='public.admin_inbox_messages'::regclass and conname='admin_inbox_submission_unique' and contype='u') then raise exception 'Idempotency uniqueness missing'; end if;
 if not exists(select 1 from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
  where c.conrelid='public.admin_inbox_messages'::regclass and c.confrelid='auth.users'::regclass and a.attname='sender_user_id' and c.confdeltype='n') then raise exception 'Sender unlink on account deletion missing'; end if;
 raise notice 'PASS: Study submission grants, RLS, idempotency and sender unlink contract';
end $$;
rollback;
