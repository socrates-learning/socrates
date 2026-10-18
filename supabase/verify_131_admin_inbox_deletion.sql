-- Read-only installed security contract; does not delete any record.
begin read only;
do $$
declare r text; fn regprocedure := 'public.delete_admin_inbox_message(uuid,uuid)'::regprocedure;
begin
 foreach r in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(r,fn,'execute') <> (r='authenticated') then raise exception 'Deletion RPC grants incorrect for %',r; end if;
  if has_table_privilege(r,'public.admin_inbox_messages','INSERT,UPDATE,DELETE,TRUNCATE')
   or has_table_privilege(r,'admin_inbox_internal.deleted_study_receipts','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') then
   raise exception 'Direct message/receipt privileges widened for %',r;
  end if;
 end loop;
 if not exists(select 1 from pg_proc where oid=fn and prosecdef and proowner=(select oid from pg_roles where rolname='postgres') and proconfig=array['search_path=""']) then raise exception 'Deletion definer ownership/search path mismatch'; end if;
 if not exists(select 1 from pg_class where oid='admin_inbox_internal.deleted_study_receipts'::regclass and relrowsecurity and pg_get_userbyid(relowner)='postgres')
  or exists(select 1 from pg_policies where schemaname='admin_inbox_internal' and tablename='deleted_study_receipts') then raise exception 'Receipt RLS/ownership mismatch'; end if;
 if (select array_agg(column_name::text order by ordinal_position) from information_schema.columns where table_schema='admin_inbox_internal' and table_name='deleted_study_receipts')
  <> array['sender_user_id','submission_key','submission_hash','message_id','submitted_at'] then raise exception 'Unexpected retained receipt fields'; end if;
 if not exists(select 1 from pg_constraint where conrelid='admin_inbox_internal.deleted_study_receipts'::regclass and confrelid='auth.users'::regclass and confdeltype='c') then raise exception 'Receipt cleanup on Auth deletion missing'; end if;
 if (select count(*) from pg_policies where schemaname='public' and tablename='admin_inbox_messages')<>1
  or not exists(select 1 from pg_policies where schemaname='public' and tablename='admin_inbox_messages' and cmd='SELECT' and qual like '%is_admin%') then raise exception 'Inbox RLS changed'; end if;
 raise notice 'PASS: Admin deletion grants, private content-free receipts and unchanged Inbox RLS';
end $$;
rollback;
