-- Read-only installed contract. Behavioral and concurrency proofs are isolated.
begin read only;
do $verify$
declare r record;
begin
 for r in select * from (values
  ('public.set_user_role_by_email(text,text)','20646833352bb91114793e6b030d5e8d',true),
  ('public.provision_invited_learner(text)','03ae6272cfed4c2be62e3e889290838c',true),
  ('public.m138_require_active_admin()','bba974b166a34550bbc1703aabe3ba68',false),
  ('public.list_users_with_roles()','39d64b8e8e3d6b9af022f8741aa70bd1',true),
  ('public.m138_reject_new_editor()','273e6e7ca4c754ed2e6bb89bf23b1810',false)
 ) x(signature,fingerprint,definer) loop
  if not exists(select 1 from pg_proc where oid=to_regprocedure(r.signature)
   and md5(pg_get_functiondef(oid))=r.fingerprint and prosecdef=r.definer
   and proowner='postgres'::regrole and proconfig=array['search_path=""']) then
   raise exception '138: function contract differs: %',r.signature;
  end if;
 end loop;
 if not exists(select 1 from pg_trigger where tgrelid='public.user_roles'::regclass
  and tgname='b138_no_new_editor' and tgfoid='public.m138_reject_new_editor()'::regprocedure
  and tgtype=23 and tgenabled='O') then
  raise exception '138: insert/update Editor assignment guard missing';
 end if;
 if has_table_privilege('authenticated','public.user_roles','INSERT,UPDATE,DELETE')
  or has_table_privilege('anon','public.user_roles','INSERT,UPDATE,DELETE')
  or has_table_privilege('authenticated','public.approved_domains','INSERT,UPDATE,DELETE')
  or has_table_privilege('anon','public.approved_domains','INSERT,UPDATE,DELETE') then
  raise exception '138: unexpected browser role/domain writes';
 end if;
 if has_function_privilege('anon','public.set_user_role_by_email(text,text)','EXECUTE')
  or has_function_privilege('anon','public.list_users_with_roles()','EXECUTE')
  or not has_function_privilege('authenticated','public.set_user_role_by_email(text,text)','EXECUTE')
  or not has_function_privilege('authenticated','public.list_users_with_roles()','EXECUTE')
  or has_function_privilege('authenticated','public.m138_reject_new_editor()','EXECUTE')
  or has_function_privilege('service_role','public.m138_reject_new_editor()','EXECUTE') then
  raise exception '138: function grants differ';
 end if;
 if has_function_privilege('anon','public.provision_invited_learner(text)','EXECUTE')
  or not has_function_privilege('authenticated','public.provision_invited_learner(text)','EXECUTE')
  or has_function_privilege('authenticated','public.m138_require_active_admin()','EXECUTE')
  or has_function_privilege('service_role','public.m138_require_active_admin()','EXECUTE') then
  raise exception '138: internal gate and provisioning grants differ';
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.approved_domains'::regclass
  and conname='approved_domains_learner_only' and convalidated
  and pg_get_constraintdef(oid)='CHECK ((default_role = ''learner''::text))')
  or not exists(select 1 from pg_attrdef d join pg_attribute a on a.attrelid=d.adrelid and a.attnum=d.adnum
  where d.adrelid='public.approved_domains'::regclass and a.attname='default_role'
  and pg_get_expr(d.adbin,d.adrelid)='''learner''::text')
  or exists(select 1 from public.approved_domains where default_role<>'learner') then
  raise exception '138: domain defaults must be Learner only';
 end if;
 if not exists(select 1 from pg_class where oid='public.user_roles'::regclass and relrowsecurity)
  or not exists(select 1 from pg_policy where polrelid='public.user_roles'::regclass and polname='account_deletion_fence' and not polpermissive)
  or not exists(select 1 from pg_trigger where tgrelid='public.user_roles'::regclass and tgname='a127_write_fence' and tgenabled='O') then
  raise exception '138: existing account protections missing';
 end if;
end $verify$;
select 'Migration 138 installed contract PASS' as result;
commit;
