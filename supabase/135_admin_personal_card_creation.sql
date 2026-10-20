-- Admin accounts author official content. Existing personal records stay editable.
-- Local candidate only: apply separately after explicit Production approval.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $preflight$
begin
 if not exists(select 1 from pg_class where oid='public.personal_cards'::regclass and relrowsecurity)
    or to_regprocedure('public.is_admin()') is null
    or not has_function_privilege('authenticated','public.is_admin()','EXECUTE') then
  raise exception '135 requires existing personal Card RLS and the authorized Admin helper';
 end if;
 if not exists(select 1 from pg_policy where polrelid='public.personal_cards'::regclass
   and polname='Users create own personal cards' and polcmd='a' and polpermissive)
    or not exists(select 1 from pg_policy where polrelid='public.personal_cards'::regclass
   and polname='account_deletion_fence' and polcmd='*' and not polpermissive) then
  raise exception '135 requires existing ownership and account-activity protections';
 end if;
 if exists(select 1 from pg_policy where polrelid='public.personal_cards'::regclass
   and polname='personal_cards_admin_insert_restriction') then
  raise exception '135 already or partially installed';
 end if;
end $preflight$;

-- RESTRICTIVE intersects with, and never replaces, existing permissive owner
-- checks, the active-account fence, and attachment/Library validation triggers.
-- The existing is_admin() reads account activity and database role assignments;
-- caller-provided role metadata cannot grant or avoid this restriction.
create policy personal_cards_admin_insert_restriction
 on public.personal_cards as restrictive
 for insert to authenticated
 with check (not (select public.is_admin()));

-- No records, grants, helpers, SELECT/UPDATE/DELETE policies, or other tables change.
commit;
