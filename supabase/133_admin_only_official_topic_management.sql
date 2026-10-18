-- 133: Admin-only official Topic management. Local candidate; not Production-applied.
-- Requires the unchanged Migration 132. No role-system rewrite or data backfill.
-- This does not retire Editor accounts, change role assignments, or alter Library reads.
-- Every authenticated official Topic/placement write requires an active Admin.
-- No bypass is introduced for service tokens or client-controlled settings.
-- Direct trusted database maintenance remains available without a user JWT.
-- Database login identity and the active database role are both required.
begin;
do $guard$ begin
 if current_user <> 'postgres' then raise exception '133 requires the authorized postgres migration role'; end if;
 if pg_catalog.pg_has_role('authenticator','postgres','MEMBER')
 or pg_catalog.pg_has_role('authenticator','socrates_migrator','MEMBER') then
  raise exception 'Unexpected Data API membership in a trusted database role';
 end if;
 if to_regclass('public.official_topic_locations') is null
 or md5(pg_get_functiondef('public.m132_require_revision(uuid,text)'::regprocedure)) <> '1921cf165ae9391c79813db45ed0f14e' then
  raise exception 'Approved Migration 132 authorization prerequisite mismatch';
 end if;
end $guard$;
CREATE OR REPLACE FUNCTION public.m132_require_revision(p_library uuid, p_revision text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not public.is_admin() then raise exception 'Administrator access is required to manage official Topics.' using errcode='42501'; end if;
 perform public.m122_require_library(p_library,true);
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'READ COMMITTED required' using errcode='40001'; end if;
 perform pg_catalog.pg_advisory_xact_lock(104,20260927);
 if p_revision is null or public.m132_graph_revision(p_library) is distinct from p_revision then
  raise exception 'The Topic Tree changed. Reload before trying again.' using errcode='PT409'; end if;
end $function$;
create function public.m133_admin_topic_write_guard() returns trigger
 language plpgsql security definer set search_path='' as $$
begin
 -- session_user is the authenticated database login, not a JWT or SECURITY
 -- DEFINER owner. Switching to an application role never grants this exception.
 if auth.uid() is null
 and coalesce(nullif(current_setting('role',true),''),'none') in ('none','postgres','socrates_migrator','supabase_admin')
 and (session_user in ('postgres','supabase_admin')
  or pg_catalog.pg_has_role(session_user,'postgres','MEMBER')
  or pg_catalog.pg_has_role(session_user,'socrates_migrator','MEMBER')) then
  return null;
 end if;
 if not public.is_admin() then
  raise exception 'Administrator access is required to manage official Topics.' using errcode='42501';
 end if;
 return null;
end $$;
revoke all on function public.m133_admin_topic_write_guard() from public,anon,authenticated,service_role;
grant execute on function public.m133_admin_topic_write_guard() to postgres,socrates_migrator;
create trigger a133_admin_topic_writes before insert or update or delete or truncate on public.library_nodes
 for each statement execute function public.m133_admin_topic_write_guard();
create trigger a133_admin_location_writes before insert or update or delete or truncate on public.official_topic_locations
 for each statement execute function public.m133_admin_topic_write_guard();
set local role socrates_migrator;
create trigger a133_admin_legacy_placement_writes before insert or update or delete or truncate on public.official_topic_placements
 for each statement execute function public.m133_admin_topic_write_guard();
set local role postgres;
do $installed$ declare table_name text; role_name text; begin
 foreach table_name in array array['library_nodes','official_topic_locations','official_topic_placements'] loop
  if not exists(select 1 from pg_trigger t where t.tgrelid=('public.'||table_name)::regclass
   and t.tgfoid='public.m133_admin_topic_write_guard()'::regprocedure and t.tgenabled='O' and not t.tgisinternal) then
   raise exception 'Missing Admin-only guard on %',table_name;
  end if;
 end loop;
 foreach role_name in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(role_name,'public.m133_admin_topic_write_guard()','EXECUTE') then
   raise exception 'Admin-only guard exposed to %',role_name;
  end if;
 end loop;
end $installed$;
notify pgrst,'reload schema';
commit;
