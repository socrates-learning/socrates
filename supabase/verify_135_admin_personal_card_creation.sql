-- Read-only installed-contract verification; behavioral checks use disposable data.
begin read only;
do $verify$
declare p record;
begin
 if not exists(select 1 from pg_class where oid='public.personal_cards'::regclass and relrowsecurity) then
  raise exception '135: personal Card RLS is disabled';
 end if;
 select * into p from pg_policy where polrelid='public.personal_cards'::regclass
   and polname='personal_cards_admin_insert_restriction';
 if not found or p.polpermissive or p.polcmd<>'a'
    or p.polroles<>array['authenticated'::regrole::oid] or p.polqual is not null
    or pg_get_expr(p.polwithcheck,p.polrelid)<>'(NOT ( SELECT is_admin() AS is_admin))' then
  raise exception '135: expected authenticated-only restrictive INSERT policy';
 end if;
 if not exists(select 1 from pg_policy where polrelid='public.personal_cards'::regclass
    and polname='Users create own personal cards' and polcmd='a' and polpermissive
    and pg_get_expr(polwithcheck,polrelid)='((owner_id = ( SELECT auth.uid() AS uid)) AND has_socrates_role())')
    or not exists(select 1 from pg_policy where polrelid='public.personal_cards'::regclass
    and polname='account_deletion_fence' and polcmd='*' and not polpermissive
    and pg_get_expr(polqual,polrelid)='( SELECT account_is_active() AS account_is_active)'
    and pg_get_expr(polwithcheck,polrelid)='( SELECT account_is_active() AS account_is_active)') then
  raise exception '135: existing ownership or activity policy missing or changed';
 end if;
 if not has_function_privilege('authenticated','public.is_admin()','EXECUTE') then
  raise exception '135: authenticated Admin helper unavailable';
 end if;
end $verify$;
select 'Migration 135 installed contract PASS' as result;
commit;
