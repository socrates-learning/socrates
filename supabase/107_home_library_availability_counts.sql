-- Local candidate: Library-wide availability for Home browsing only.
-- Migration 106 is independent and is neither required nor installed here.
begin;
do $preflight$
begin
 if session_user <> 'postgres' or current_user <> 'postgres' then raise exception 'Migration 107 requires postgres'; end if;
 if not exists(select 1 from pg_roles where rolname='socrates_migrator' and not rolcanlogin and not rolsuper and not rolinherit) then raise exception 'Migration 103 creator contract required'; end if;
 if to_regprocedure('public.get_library_official_availability_counts(uuid)') is not null then raise exception 'Availability RPC already exists'; end if;
 if md5(pg_get_functiondef('public.get_home_study_bootstrap(uuid,uuid)'::regprocedure)) <> 'ee67bf649271af7e8f74bce223a63050' then raise exception 'Unexpected Home bootstrap definition'; end if;
end $preflight$;

-- New application object follows Migration 103. INVOKER retains browser RLS;
-- the existing definer bootstrap calls it as postgres, with the same auth.uid.
set local role socrates_migrator;
create function public.get_library_official_availability_counts(p_library_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $availability$
declare current_user_id uuid := (select auth.uid()); result jsonb;
begin
 if current_user_id is null or not public.has_socrates_role() then raise exception 'Not authorized to read Library availability'; end if;
 if not exists(select 1 from public.libraries l where l.id=p_library_id and l.status='active') then raise exception 'Active Library not found'; end if;
 if not public.is_editor_or_admin() and not exists(select 1 from public.user_libraries m where m.user_id=current_user_id and m.library_id=p_library_id) then raise exception 'Not authorized for this Library'; end if;
 select coalesce(jsonb_object_agg(counts.concept_id::text,counts.question_count),'{}'::jsonb) into result
 from (
  select c.id concept_id,count(q.id)::integer question_count
  from public.concepts c
  join public.questions q on q.concept_id=c.id
   and q.status='published' and q.question_type='short_answer'
  where c.status='published'
   and exists(select 1 from public.concept_placements p join public.library_nodes n on n.id=p.library_node_id where p.concept_id=c.id and n.library_id=p_library_id)
   and exists(select 1 from public.question_accepted_answers a where a.question_id=q.id)
  group by c.id
 ) counts;
 return result;
end $availability$;
revoke all on function public.get_library_official_availability_counts(uuid) from public,anon,service_role;
grant execute on function public.get_library_official_availability_counts(uuid) to authenticated,postgres;
reset role;

do $bootstrap$
declare before_catalog jsonb; before_definition text; after_definition text;
 old_fragment constant text := $old$    'official_question_counts',$old$;
 new_fragment constant text := $new$    'library_availability_question_counts',
      public.get_library_official_availability_counts(p_library_id),
    -- Retained wire field: selected-deck candidates, never Library availability.
    'official_question_counts',$new$;
begin
 select to_jsonb(p),pg_get_functiondef(p.oid) into before_catalog,before_definition from pg_proc p where p.oid='public.get_home_study_bootstrap(uuid,uuid)'::regprocedure;
 if (length(before_definition)-length(replace(before_definition,old_fragment,'')))/length(old_fragment) <> 1 then raise exception 'Expected bootstrap count field missing or repeated'; end if;
 execute replace(before_definition,old_fragment,new_fragment);
 select pg_get_functiondef('public.get_home_study_bootstrap(uuid,uuid)'::regprocedure) into after_definition;
 if after_definition is distinct from replace(before_definition,old_fragment,new_fragment)
 or (select to_jsonb(p)-'prosrc' from pg_proc p where p.oid='public.get_home_study_bootstrap(uuid,uuid)'::regprocedure) is distinct from (before_catalog-'prosrc') then raise exception 'Bootstrap contract changed unexpectedly'; end if;
 if not exists(select 1 from pg_proc p where p.oid='public.get_library_official_availability_counts(uuid)'::regprocedure and p.proowner='socrates_migrator'::regrole and not p.prosecdef and p.proconfig=array['search_path=""']::text[])
 or has_function_privilege('anon','public.get_library_official_availability_counts(uuid)','EXECUTE')
 or has_function_privilege('service_role','public.get_library_official_availability_counts(uuid)','EXECUTE')
 or not has_function_privilege('authenticated','public.get_library_official_availability_counts(uuid)','EXECUTE')
 or exists(select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a where p.oid='public.get_library_official_availability_counts(uuid)'::regprocedure and a.grantee=0) then raise exception 'Availability RPC ownership/ACL contract mismatch'; end if;
end $bootstrap$;
commit;
