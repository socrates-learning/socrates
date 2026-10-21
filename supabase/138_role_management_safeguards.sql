-- Phase 1 only: repair role assignment; retain historical Editor authority.
begin;

do $preflight$
begin
 if md5(pg_get_functiondef('public.set_user_role_by_email(text,text)'::regprocedure)) <> 'c8ab40eee10af7cfa3a96de8d71e2e27'
    or md5(pg_get_functiondef('public.list_users_with_roles()'::regprocedure)) <> '5b636f2e033ac377bf7bb447ad04ba66'
    or md5(pg_get_functiondef('public.provision_invited_learner(text)'::regprocedure)) <> '443044cee4682a698af717ba39d3b02c'
    or exists(select 1 from pg_attribute where attrelid='public.user_roles'::regclass and attname='updated_at' and not attisdropped)
    or to_regprocedure('public.m127_assert_writable(uuid)') is null then
  raise exception '138: expected role-assignment and active-account contract required';
 end if;
 if exists(select 1 from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f'
   and pg_get_functiondef(p.oid) ~* '\mapproved_domains\M') then
  raise exception '138: review unexpected active domain-provisioning dependency';
 end if;
 if has_table_privilege('authenticated','public.user_roles','INSERT,UPDATE,DELETE')
    or has_table_privilege('anon','public.user_roles','INSERT,UPDATE,DELETE') then
  raise exception '138: browser role writes must already be denied';
 end if;
end $preflight$;

-- Every SQL writer, including SECURITY DEFINER writers, must obey this rule.
-- Historical Editor rows can be read, retained or explicitly reassigned. An
-- unchanged Editor row cannot be transferred to a different account.
create function public.m138_reject_new_editor() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.role='editor' then
  if tg_op='INSERT' then
   raise exception using errcode='42501', message='New Editor assignments are disabled';
  elsif old.role is distinct from new.role or old.user_id is distinct from new.user_id then
   raise exception using errcode='42501', message='New Editor assignments are disabled';
  end if;
 end if;
 return new;
end $$;
alter function public.m138_reject_new_editor() owner to postgres;
revoke all on function public.m138_reject_new_editor() from public,anon,authenticated,service_role;
create trigger b138_no_new_editor before insert or update on public.user_roles
for each row execute function public.m138_reject_new_editor();

-- Shared only by the two existing User Management role-writing RPCs.
create function public.m138_require_active_admin() returns uuid
language plpgsql set search_path='' as $$
declare actor_id uuid:=auth.uid();
begin
 -- Serialize role writers before authorization/counting. Unlike an advisory
 -- convention, this also conflicts with other SQL writers to user_roles.
 lock table public.user_roles in share row exclusive mode;
 -- Lock the actual actor row, not only a cached helper result. A stale
 -- REPEATABLE READ transaction fails with 40001 if its actor was reassigned.
 perform 1 from public.user_roles ur
 join public.account_deletion_state a on a.user_id=ur.user_id
 where ur.user_id=actor_id and ur.role='admin' and a.state='active'
 for update of ur for share of a;
 if not found then
  raise exception using errcode='42501', message='Active Administrator required';
 end if;
 return actor_id;
end $$;
alter function public.m138_require_active_admin() owner to postgres;
revoke all on function public.m138_require_active_admin() from public,anon,authenticated,service_role;

create or replace function public.set_user_role_by_email(target_email text,new_role text)
returns void language plpgsql security definer set search_path='' as $$
declare
 caller_id uuid;
 target_user_id uuid;
 target_current_role text;
 admin_count integer;
begin
 caller_id:=public.m138_require_active_admin();
 if new_role is null or new_role not in ('learner','admin') then
  raise exception using errcode='22023', message='Choose Administrator or Learner';
 end if;
 if nullif(btrim(target_email),'') is null then
  raise exception using errcode='22023', message='Target email is required';
 end if;
 select u.id into target_user_id from auth.users u
 where lower(u.email)=lower(btrim(target_email)) limit 1;
 if target_user_id is null then
  raise exception using errcode='P0002', message='User not found';
 end if;
 if target_user_id=caller_id then
  raise exception using errcode='42501', message='Administrators cannot change their own role';
 end if;
 -- Preserve the existing pending/deleted-account write fence.
 perform public.m127_assert_writable(target_user_id);
 select ur.role into target_current_role from public.user_roles ur
 where ur.user_id=target_user_id for update;
 if target_current_role='admin' and new_role<>'admin' then
  select count(*) into admin_count from public.user_roles ur
  join public.account_deletion_state a on a.user_id=ur.user_id
  where ur.role='admin' and a.state='active';
  if admin_count<=1 then
   raise exception using errcode='42501', message='Cannot remove the final active Administrator';
  end if;
 end if;
 insert into public.user_roles(user_id,role) values(target_user_id,new_role)
 on conflict(user_id) do update set role=excluded.role;
end $$;
revoke all on function public.set_user_role_by_email(text,text) from public,anon;
grant execute on function public.set_user_role_by_email(text,text) to authenticated;

create or replace function public.list_users_with_roles()
returns table(user_id uuid,email text,role text,created_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() or not exists(
  select 1 from public.account_deletion_state a where a.user_id=auth.uid() and a.state='active'
 ) then
  raise exception using errcode='42501', message='Active Administrator required';
 end if;
 return query select u.id,u.email::text,ur.role,coalesce(ur.created_at,u.created_at)
 from auth.users u left join public.user_roles ur on ur.user_id=u.id
 order by u.created_at;
end $$;
revoke all on function public.list_users_with_roles() from public,anon;
grant execute on function public.list_users_with_roles() to authenticated;

-- The pending-Learner path also creates a role. Check its actor under the
-- same lock; all existing provisioning and membership logic stays unchanged.
CREATE OR REPLACE FUNCTION public.provision_invited_learner(target_email text)
 RETURNS TABLE(user_id uuid, email text, role text, library_id uuid, library_name text, library_slug text, is_primary boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  target_user_id uuid;
  target_user_email text;
  target_role text;
  configured_library public.libraries%rowtype;
  membership public.user_libraries%rowtype;
begin
  perform public.m138_require_active_admin();
  if caller_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.user_roles caller_role
    where caller_role.user_id = caller_id
      and caller_role.role = 'admin'
  ) then
    raise exception 'Admin role required';
  end if;

  if nullif(btrim(coalesce(target_email, '')), '') is null then
    raise exception 'Target email is required';
  end if;

  select auth_user.id, auth_user.email::text
  into target_user_id, target_user_email
  from auth.users auth_user
  where lower(auth_user.email) = lower(btrim(target_email))
  order by auth_user.created_at, auth_user.id
  limit 1
  for update;

  if target_user_id is null then
    raise exception 'Invited Auth user not found';
  end if;

  if target_user_id = caller_id then
    raise exception 'Administrators cannot provision their own account';
  end if;

  select user_role.role
  into target_role
  from public.user_roles user_role
  where user_role.user_id = target_user_id;

  if target_role is not null and target_role <> 'learner' then
    raise exception 'Target user already has staff role: %', target_role;
  end if;

  select library_row.*
  into configured_library
  from public.learner_account_defaults account_default
  join public.libraries library_row
    on library_row.id = account_default.default_library_id
  where account_default.singleton = true
    and library_row.status = 'active'
  for share of account_default, library_row;

  if configured_library.id is null then
    raise exception 'No active default learner Library is configured';
  end if;

  insert into public.user_roles (user_id, role)
  values (target_user_id, 'learner')
  on conflict do nothing;

  select user_role.role
  into strict target_role
  from public.user_roles user_role
  where user_role.user_id = target_user_id;

  if target_role <> 'learner' then
    raise exception 'Target user has incompatible role: %', target_role;
  end if;

  insert into public.user_libraries (
    user_id,
    library_id,
    is_primary,
    assigned_by
  )
  values (
    target_user_id,
    configured_library.id,
    not exists (
      select 1
      from public.user_libraries existing_membership
      where existing_membership.user_id = target_user_id
        and existing_membership.is_primary = true
    ),
    caller_id
  )
  on conflict on constraint user_libraries_pkey
  do update set
    is_primary = case
      when not exists (
        select 1
        from public.user_libraries existing_primary
        where existing_primary.user_id = excluded.user_id
          and existing_primary.is_primary = true
          and existing_primary.library_id <> excluded.library_id
      ) then true
      else public.user_libraries.is_primary
    end,
    assigned_by = coalesce(public.user_libraries.assigned_by, excluded.assigned_by)
  returning * into membership;

  return query
  select
    target_user_id,
    target_user_email,
    target_role,
    configured_library.id,
    configured_library.name,
    configured_library.slug,
    membership.is_primary;
end;
$function$
;

-- No deployed signup/provisioning function consumes this dormant configuration.
-- Remove privileged defaults without assigning or changing any account role.
alter table public.approved_domains alter column default_role set default 'learner';
update public.approved_domains set default_role='learner' where default_role<>'learner';
alter table public.approved_domains add constraint approved_domains_learner_only
 check(default_role='learner');

commit;
