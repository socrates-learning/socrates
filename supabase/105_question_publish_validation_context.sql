-- LOCAL CANDIDATE ONLY. Migration 104 remains reserved and out of scope.
-- Deferred constraint triggers execute after the save RPC's SECURITY DEFINER
-- context has ended. Give the two fixed, read-only validation trigger functions
-- their existing owner's context; do not expose the internal validator as RPC.
-- No application function is created, replaced, re-owned, or granted privileges.
-- Migration 103's future-object creator/default contract remains unchanged.

begin;

do $preflight$
declare
  target record;
begin
  if session_user <> 'postgres' or current_user <> 'postgres' then
    raise exception 'Question validation context repair requires postgres';
  end if;
  if not exists (select 1 from pg_catalog.pg_roles
                 where rolname = 'socrates_migrator' and not rolcanlogin) then
    raise exception 'Installed Migration 103 role contract is required';
  end if;

  for target in
    select * from (values
      ('public.validate_question_publish()', '1948153dd1b8bca62397d5a3ce317c46'),
      ('public.validate_question_child_publish()', 'a02d12cead4a4f8e324fcf57f0d2e14b')
    ) expected(signature, body_md5)
  loop
    if not exists (
      select 1 from pg_catalog.pg_proc p
      join pg_catalog.pg_language l on l.oid = p.prolang
      where p.oid = to_regprocedure(target.signature)
        and p.proowner = 'postgres'::regrole
        and l.lanname = 'plpgsql'
        and p.prorettype = 'trigger'::regtype
        and p.proconfig = array['search_path=""']::text[]
        and md5(p.prosrc) = target.body_md5
        and not has_function_privilege('anon', p.oid, 'EXECUTE')
        and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
        and not exists (
          select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
          where a.grantee = 0 and a.privilege_type = 'EXECUTE'
        )
    ) then
      raise exception 'Unexpected trigger function contract: %', target.signature;
    end if;
  end loop;

  if has_function_privilege('anon', 'public.assert_question_publishable(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.assert_question_publishable(uuid)', 'EXECUTE') then
    raise exception 'Internal publishability validator must remain browser-inaccessible';
  end if;
end;
$preflight$;

alter function public.validate_question_publish() security definer;
alter function public.validate_question_child_publish() security definer;

commit;
