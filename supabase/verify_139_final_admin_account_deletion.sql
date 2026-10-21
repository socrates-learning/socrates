-- Read-only installed contract; run after the unchanged Migration 138 verifier.
begin read only;
do $verify$
declare r record; role_name text;
begin
 for r in select * from (values
  ('public.begin_account_deletion(uuid,text)','e2f94b3d4c45c7a4a5b69b84f1125051',true),
  ('account_deletion_private.prepare_account_deletion(uuid,text)','de546f075d4e6e9c88692380fcf6a308',false),
  ('account_deletion_private.lock_account_delete()','43238623c7ee6114c6681d272fb0b644',true),
  ('public.m127_delete_account()','3cb33c5e930efbfe623d2894cec40a83',true),
  ('public.m127_account_deleted()','21202d9b53e262670b44a070f16eed87',true),
  ('public.m127_assert_writable(uuid)','ae7be8b2a01c3e3474ce561998eab7ea',true),
  ('public.m138_require_active_admin()','bba974b166a34550bbc1703aabe3ba68',false)
 ) x(signature,fingerprint,definer) loop
  if not exists(select 1 from pg_proc where oid=to_regprocedure(r.signature)
   and md5(pg_get_functiondef(oid))=r.fingerprint and prosecdef=r.definer
   and proowner='postgres'::regrole and proconfig=array['search_path=""']) then
   raise exception '139: function contract differs: %',r.signature;
  end if;
 end loop;
 if not exists(select 1 from pg_namespace where nspname='account_deletion_private'
  and nspowner='postgres'::regrole)
  or exists(select 1 from pg_namespace n, lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
   where n.nspname='account_deletion_private' and a.grantee<>n.nspowner) then
  raise exception '139: recovery schema must be database-owner only';
 end if;
 if exists(select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  where p.pronamespace='account_deletion_private'::regnamespace and a.grantee<>p.proowner)
  or exists(select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   where p.oid='public.begin_account_deletion(uuid,text)'::regprocedure
    and a.grantee not in(p.proowner,'service_role'::regrole)) then
  raise exception '139: unexpected deletion function grants';
 end if;
 foreach role_name in array array['anon','authenticated','service_role','authenticator','supabase_auth_admin','supabase_storage_admin'] loop
  if has_schema_privilege(role_name,'account_deletion_private','USAGE,CREATE')
   or has_function_privilege(role_name,'account_deletion_private.prepare_account_deletion(uuid,text)','EXECUTE')
   or has_function_privilege(role_name,'account_deletion_private.lock_account_delete()','EXECUTE')
   or pg_has_role(role_name,'postgres','MEMBER') then
   raise exception '139: ordinary application role can reach the recovery core: %',role_name;
  end if;
 end loop;
 if has_function_privilege('anon','public.begin_account_deletion(uuid,text)','EXECUTE')
  or has_function_privilege('authenticated','public.begin_account_deletion(uuid,text)','EXECUTE')
  or not has_function_privilege('service_role','public.begin_account_deletion(uuid,text)','EXECUTE') then
  raise exception '139: live initiation must retain the service-only boundary';
 end if;
 if not exists(select 1 from pg_trigger where tgrelid='auth.users'::regclass
  and tgname='a139_account_delete_lock' and tgfoid='account_deletion_private.lock_account_delete()'::regprocedure
  and tgtype=10 and tgenabled='O' and tgqual is null)
  or not exists(select 1 from pg_trigger where tgrelid='auth.users'::regclass
   and tgfoid='public.m127_delete_account()'::regprocedure and tgenabled='O')
  or not exists(select 1 from pg_trigger where tgrelid='auth.users'::regclass
   and tgfoid='public.m127_account_deleted()'::regprocedure and tgenabled='O') then
  raise exception '139: Auth deletion locking or existing cleanup trigger missing';
 end if;
end $verify$;
select 'Migration 139 installed contract PASS' as result;
commit;
