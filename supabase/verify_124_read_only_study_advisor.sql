begin read only;
do $$
declare p record;
begin
 select * into p from pg_proc where oid=to_regprocedure('public.get_study_advisor(uuid)');
 if p.oid is null or not p.prosecdef or p.provolatile<>'s' or p.proconfig<>array['search_path=""','TimeZone=UTC'] then
  raise exception 'Study Advisor read-only authority contract missing';
 end if;
 if has_function_privilege('anon',p.oid,'execute') or has_function_privilege('service_role',p.oid,'execute')
 or not has_function_privilege('authenticated',p.oid,'execute') then raise exception 'Unexpected Advisor ACL'; end if;
 if p.prosrc not like '%public.m123_require_library(p_library_id)%' or p.prosrc not like '%public.m117_preference_state(deck_id)%' then
  raise exception 'Advisor missing Library authorization or released preference projection';
 end if;
end $$;
select 'Migration 124 installed contracts verified' result;
rollback;
