-- Read-only installed contract verifier.
begin read only;
do $$
declare p record;
begin
 if to_regclass('public.study_goals') is null or not (select relrowsecurity from pg_class where oid='public.study_goals'::regclass) then raise exception 'Goal table RLS missing'; end if;
 if has_table_privilege('anon','public.study_goals','SELECT') or has_table_privilege('authenticated','public.study_goals','INSERT,UPDATE,DELETE') then raise exception 'Direct goal writes exposed'; end if;
 for p in select oid,proname,prosecdef,proconfig from pg_proc where pronamespace='public'::regnamespace and (proname like 'm123_%' or proname in ('get_study_goals','save_study_goal','delete_study_goal')) loop
  if not p.prosecdef or p.proconfig<>(case when p.proname in ('m123_goal_progress','get_study_goals') then array['search_path=""','TimeZone=UTC'] else array['search_path=""'] end) then raise exception 'Unsafe function %',p.proname; end if;
  if has_function_privilege('anon',p.oid,'execute') or (p.proname like 'm123_%' and has_function_privilege('authenticated',p.oid,'execute')) then raise exception 'Unexpected function exposure %',p.proname; end if;
  if p.proname not like 'm123_%' and not has_function_privilege('authenticated',p.oid,'execute') then raise exception 'Missing authenticated API %',p.proname; end if;
 end loop;
 if (select count(*) from pg_proc where pronamespace='public'::regnamespace and (proname like 'm123_%' or proname in ('get_study_goals','save_study_goal','delete_study_goal')))<>7 then raise exception 'Incomplete study goals API'; end if;
end $$;
select 'Migration 123 installed contracts verified' result;
rollback;
