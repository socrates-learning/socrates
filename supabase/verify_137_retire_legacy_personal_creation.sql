-- Read-only installed contract. Behavioral checks run with disposable records.
begin read only;
set local search_path = public, pg_catalog;
do $verify$
declare item record; p record;
begin
 for item in select * from (values
 ('personal_concepts','personal_concepts_legacy_insert_restriction','( SELECT (is_editor_or_admin() AND (NOT is_admin())))'),
 ('personal_collections','personal_collections_legacy_insert_restriction','( SELECT (is_editor_or_admin() AND (NOT is_admin())))'),
 ('personal_cards','personal_cards_legacy_insert_restriction','((concept_id IS NULL) OR ( SELECT (is_editor_or_admin() AND (NOT is_admin()))))')
 ) as expected(table_name,policy_name,expression) loop
  select * into p from pg_policy where polrelid=('public.'||item.table_name)::regclass and polname=item.policy_name;
  if not found or p.polpermissive or p.polcmd<>'a' or p.polqual is not null
     or p.polroles<>array['authenticated'::regrole::oid]
     or pg_get_expr(p.polwithcheck,p.polrelid)<>item.expression then
   raise exception '137: restrictive INSERT policy missing or changed: %',item.table_name;
  end if;
  if not exists(select 1 from pg_class where oid=p.polrelid and relrowsecurity)
     or not exists(select 1 from pg_policy where polrelid=p.polrelid and polname='account_deletion_fence'
       and polcmd='*' and not polpermissive
       and pg_get_expr(polwithcheck,polrelid)='( SELECT account_is_active() AS account_is_active)') then
   raise exception '137: existing RLS or active-account protection changed';
  end if;
 end loop;
 if md5(pg_get_functiondef('public.create_personal_concept_overlay(uuid,text,text,uuid,uuid,text)'::regprocedure)) <> 'c2121ba0c093b692559bfc9e887c935b' then
  raise exception '137: restricted overlay creation definition differs';
 end if;
 if not exists(select 1 from pg_proc where oid='public.create_personal_concept_overlay(uuid,text,text,uuid,uuid,text)'::regprocedure
   and prosecdef and proowner='postgres'::regrole and proconfig=array['search_path=""']
   and proacl::text='{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}') then
  raise exception '137: overlay function security or grants differ';
 end if;
end $verify$;
select 'Migration 137 installed contract PASS' as result;
commit;
