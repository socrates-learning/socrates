-- New deletion requests must leave an active Administrator. Pending cleanup and
-- independently verified isolated recovery retain the released deletion core.
begin;
do $preflight$
begin
 if current_user <> 'postgres'
    or to_regnamespace('account_deletion_private') is not null
    or not exists(select 1 from pg_proc where oid=to_regprocedure('public.begin_account_deletion(uuid,text)')
      and md5(pg_get_functiondef(oid))='c281b1cb14e1082a47c0127cadb51a3a'
      and proowner='postgres'::regrole)
    or not exists(select 1 from pg_proc where oid=to_regprocedure('public.m138_require_active_admin()')
      and md5(pg_get_functiondef(oid))='bba974b166a34550bbc1703aabe3ba68')
    or not exists(select 1 from pg_proc where oid=to_regprocedure('public.m127_delete_account()')
      and md5(pg_get_functiondef(oid))='3cb33c5e930efbfe623d2894cec40a83')
 then raise exception '139 requires the verified 138 and account-deletion contracts'; end if;
end $preflight$;

create schema account_deletion_private authorization postgres;
revoke all on schema account_deletion_private from public,anon,authenticated,service_role;

-- Preserve the exact preparation body (including receipt retries and Storage
-- ownership checks). No ordinary application credential can call this core.
alter function public.begin_account_deletion(uuid,text) set schema account_deletion_private;
alter function account_deletion_private.begin_account_deletion(uuid,text) rename to prepare_account_deletion;
alter function account_deletion_private.prepare_account_deletion(uuid,text) security invoker;
revoke all on function account_deletion_private.prepare_account_deletion(uuid,text) from public,anon,authenticated,service_role;

create function public.begin_account_deletion(p_user uuid,p_receipt_hash text) returns void
language plpgsql security definer set search_path='' as $$
declare account_state text; active_admins uuid[];
begin
 if p_receipt_hash is null or p_receipt_hash !~ '^[0-9a-f]{64}$' then
  raise exception 'Invalid deletion receipt';
 end if;
 -- Match Migration 138's order: role-writer serialization before account rows.
 -- Hold the lock through the active -> pending transition, not just counting.
 lock table public.user_roles in share row exclusive mode;
 select state into account_state from public.account_deletion_state where user_id=p_user for update;
 if account_state='active' then
  -- Lock actual role/state rows so stale REPEATABLE READ snapshots fail safely
  -- after concurrent demotions/deletions instead of counting obsolete Admins.
  perform 1 from public.user_roles where user_id=p_user for share;
  select coalesce(array_agg(a.user_id),'{}'::uuid[]) into active_admins from (
   select r.user_id from public.user_roles r
   join public.account_deletion_state s on s.user_id=r.user_id
   where r.role='admin' and s.state='active'
   order by r.user_id for share of r,s
  ) a;
  if p_user=any(active_admins) and cardinality(active_admins)<2 then
   raise exception using errcode='P1391',message='Another active Administrator must remain before account deletion';
  end if;
 end if;
 -- Accepted pending requests must finish even when an older restore has no
 -- remaining Admin. This never changes an active account into pending on denial.
 perform account_deletion_private.prepare_account_deletion(p_user,p_receipt_hash);
end $$;
alter function public.begin_account_deletion(uuid,text) owner to postgres;
revoke all on function public.begin_account_deletion(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.begin_account_deletion(uuid,text) to service_role;

-- Auth's final purge also touches user_roles. Take the same lock at statement
-- entry, before Auth/account row locks, to avoid inversion with role changes or
-- receipt retries. No existing purge, attribution or history logic is replaced.
create function account_deletion_private.lock_account_delete() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 lock table public.user_roles in share row exclusive mode;
 return null;
end $$;
alter function account_deletion_private.lock_account_delete() owner to postgres;
revoke all on function account_deletion_private.lock_account_delete() from public,anon,authenticated,service_role;
create trigger a139_account_delete_lock before delete on auth.users
for each statement execute function account_deletion_private.lock_account_delete();
commit;
