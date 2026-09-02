-- Align the pre-existing Production user_roles constraint with the canonical
-- Socrates role vocabulary. Preserve all role rows and function definitions;
-- harden only has_socrates_role() execution privileges.

begin;

lock table public.user_roles in access exclusive mode;

create temporary table migration_077_baseline (
  role_rows jsonb not null,
  role_count bigint not null,
  has_socrates_role_hash text not null,
  set_user_role_hash text not null,
  resolve_candidates_hash text not null,
  official_selector_hash text not null,
  unified_selector_hash text not null,
  official_attempt_hash text not null,
  personal_attempt_hash text not null
) on commit drop;

insert into migration_077_baseline
select
  coalesce(
    (
      select jsonb_agg(to_jsonb(role_row) order by role_row.user_id)
      from public.user_roles role_row
    ),
    '[]'::jsonb
  ),
  (select count(*) from public.user_roles),
  md5(pg_get_functiondef('public.has_socrates_role()'::regprocedure)),
  md5(pg_get_functiondef(
    'public.set_user_role_by_email(text,text)'::regprocedure
  )),
  md5(pg_get_functiondef(
    'public.resolve_study_candidates(uuid)'::regprocedure
  )),
  md5(pg_get_functiondef(
    'public.select_next_study_question(uuid,boolean)'::regprocedure
  )),
  md5(pg_get_functiondef(
    'public.select_next_study_candidate(uuid,boolean)'::regprocedure
  )),
  md5(pg_get_functiondef(
    'public.record_study_session_attempt(uuid,uuid,uuid,text)'::regprocedure
  )),
  md5(pg_get_functiondef(
    'public.record_personal_study_attempt(uuid,uuid,uuid,uuid,text)'::regprocedure
  ));

do $migration$
declare
  unexpected_roles text;
  constraint_count integer;
  baseline migration_077_baseline%rowtype;
begin
  select * into strict baseline from migration_077_baseline;

  if baseline.has_socrates_role_hash <> '721397d1c57682aeada6a32e2db17189' then
    raise exception 'Unexpected has_socrates_role() definition: %',
      baseline.has_socrates_role_hash;
  end if;

  if baseline.resolve_candidates_hash <> 'b7e0d11442750f119f38fc947ec8ee12'
     or baseline.official_selector_hash <> 'ee1b3ee7f5b660c0413cfdf2c9a52875'
     or baseline.unified_selector_hash <> '7d03e458e56b2e8fdb5daa8688bf7e25'
     or baseline.official_attempt_hash <> 'd0d88bafe7f070f80423b4fc4653d6f5'
     or baseline.personal_attempt_hash <> '83fa3e33a9b234c8018f745fc9b4d578' then
    raise exception 'Protected Phase 3/Stage 2 function baseline mismatch';
  end if;

  select string_agg(role || '=' || role_count, ', ' order by role)
  into unexpected_roles
  from (
    select role, count(*) as role_count
    from public.user_roles
    where role not in ('learner', 'editor', 'admin')
    group by role
  ) unexpected;

  if unexpected_roles is not null then
    raise exception
      'Migration 077 refuses student or unknown role rows: %',
      unexpected_roles;
  end if;

  select count(*) into constraint_count
  from pg_constraint constraint_row
  where constraint_row.conrelid = 'public.user_roles'::regclass
    and constraint_row.conname = 'user_roles_role_check'
    and constraint_row.contype = 'c';

  if constraint_count <> 1 then
    raise exception
      'Expected exactly one user_roles_role_check constraint; found %',
      constraint_count;
  end if;
end;
$migration$;

alter table public.user_roles
  drop constraint user_roles_role_check;

alter table public.user_roles
  add constraint user_roles_role_check
  check (role in ('learner', 'editor', 'admin'));

revoke all on function public.has_socrates_role()
  from public, anon, authenticated;
grant execute on function public.has_socrates_role()
  to authenticated, service_role, postgres;

do $migration$
declare
  baseline migration_077_baseline%rowtype;
  final_role_rows jsonb;
  final_role_count bigint;
  constraint_expression text;
  literal_count integer;
  public_execute boolean;
begin
  select * into strict baseline from migration_077_baseline;

  select
    coalesce(
      jsonb_agg(to_jsonb(role_row) order by role_row.user_id),
      '[]'::jsonb
    ),
    count(*)
  into final_role_rows, final_role_count
  from public.user_roles role_row;

  if final_role_rows <> baseline.role_rows
     or final_role_count <> baseline.role_count then
    raise exception 'Migration 077 unexpectedly changed user_roles data';
  end if;

  select pg_get_expr(constraint_row.conbin, constraint_row.conrelid)
  into constraint_expression
  from pg_constraint constraint_row
  where constraint_row.conrelid = 'public.user_roles'::regclass
    and constraint_row.conname = 'user_roles_role_check'
    and constraint_row.contype = 'c';

  select count(*) into literal_count
  from regexp_matches(constraint_expression, '''[^'']+''', 'g');

  if constraint_expression is null
     or constraint_expression not like '%''learner''%'
     or constraint_expression not like '%''editor''%'
     or constraint_expression not like '%''admin''%'
     or constraint_expression like '%''student''%'
     or literal_count <> 3 then
    raise exception 'Unexpected final user_roles_role_check: %',
      constraint_expression;
  end if;

  if md5(pg_get_functiondef('public.has_socrates_role()'::regprocedure))
       <> baseline.has_socrates_role_hash
     or md5(pg_get_functiondef(
       'public.set_user_role_by_email(text,text)'::regprocedure
     )) <> baseline.set_user_role_hash
     or md5(pg_get_functiondef(
       'public.resolve_study_candidates(uuid)'::regprocedure
     )) <> baseline.resolve_candidates_hash
     or md5(pg_get_functiondef(
       'public.select_next_study_question(uuid,boolean)'::regprocedure
     )) <> baseline.official_selector_hash
     or md5(pg_get_functiondef(
       'public.select_next_study_candidate(uuid,boolean)'::regprocedure
     )) <> baseline.unified_selector_hash
     or md5(pg_get_functiondef(
       'public.record_study_session_attempt(uuid,uuid,uuid,text)'::regprocedure
     )) <> baseline.official_attempt_hash
     or md5(pg_get_functiondef(
       'public.record_personal_study_attempt(uuid,uuid,uuid,uuid,text)'::regprocedure
     )) <> baseline.personal_attempt_hash then
    raise exception 'Migration 077 changed a protected function definition';
  end if;

  select exists (
    select 1
    from aclexplode(coalesce(
      procedure_row.proacl,
      acldefault('f', procedure_row.proowner)
    )) acl
    where acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) into public_execute
  from pg_proc procedure_row
  where procedure_row.oid = 'public.has_socrates_role()'::regprocedure;

  if public_execute
     or has_function_privilege(
       'anon', 'public.has_socrates_role()', 'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated', 'public.has_socrates_role()', 'EXECUTE'
     )
     or not has_function_privilege(
       'service_role', 'public.has_socrates_role()', 'EXECUTE'
     )
     or not has_function_privilege(
       'postgres', 'public.has_socrates_role()', 'EXECUTE'
     ) then
    raise exception 'Unexpected final has_socrates_role() execution ACL';
  end if;
end;
$migration$;

commit;
