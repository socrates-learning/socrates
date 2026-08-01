-- Phase 1B: harden role management for safer navigation and administration.

create or replace function public.set_user_role_by_email(
  target_email text,
  new_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
  target_current_role text;
  admin_count integer;
begin
  if not exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = 'admin'
  ) then
    raise exception 'Admin role required';
  end if;

  if new_role not in ('learner', 'editor', 'admin') then
    raise exception 'Invalid role';
  end if;

  select u.id into target_user_id
  from auth.users u
  where lower(u.email) = lower(target_email)
  limit 1;

  if target_user_id is null then
    raise exception 'User not found';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'Administrators cannot change their own role';
  end if;

  select ur.role into target_current_role
  from public.user_roles ur
  where ur.user_id = target_user_id;

  if target_current_role = 'admin' and new_role <> 'admin' then
    select count(*) into admin_count
    from public.user_roles ur
    where ur.role = 'admin';

    if admin_count <= 1 then
      raise exception 'Cannot remove the final admin role';
    end if;
  end if;

  insert into public.user_roles (user_id, role)
  values (target_user_id, new_role)
  on conflict (user_id) do update
    set role = excluded.role,
        updated_at = now();
end;
$$;

revoke all on function public.set_user_role_by_email(text, text) from public;
grant execute on function public.set_user_role_by_email(text, text) to authenticated;
