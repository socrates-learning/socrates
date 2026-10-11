\set ON_ERROR_STOP on
begin read only;
do $$
declare p record; expected_owner oid; r record;
begin
 select relowner into expected_owner from pg_class where oid='public.personal_question_notes'::regclass and relrowsecurity;
 if expected_owner is null then raise exception 'Personal Question notes require RLS'; end if;
 if not has_table_privilege('authenticated','public.personal_question_notes','select') or
 has_table_privilege('anon','public.personal_question_notes','select') or
 has_table_privilege('service_role','public.personal_question_notes','select') or
 has_table_privilege('authenticated','public.personal_question_notes','insert,update,delete,truncate') then raise exception 'Unexpected note table ACL'; end if;
 if (select count(*) from pg_policy where polrelid='public.personal_question_notes'::regclass)<>1 or not exists(
 select 1 from pg_policy where polrelid='public.personal_question_notes'::regclass and polcmd='r'
 and pg_get_expr(polqual,polrelid) like '%auth.uid()%'
 and pg_get_expr(polqual,polrelid) like '%has_socrates_role()%') then raise exception 'Owner-only note policy missing'; end if;
 if not exists(select 1 from pg_constraint where conrelid='public.personal_question_notes'::regclass and contype='p' and pg_get_constraintdef(oid)='PRIMARY KEY (user_id, question_id)') then raise exception 'Canonical owner/Question key missing'; end if;
 if not exists(select 1 from pg_attribute where attrelid='public.personal_question_notes'::regclass and attname='revision' and atttypid='uuid'::regtype and attnotnull) then raise exception 'Opaque note revision missing'; end if;
 if (select count(*) from pg_constraint where conrelid='public.personal_question_notes'::regclass and contype='f' and confdeltype='c')<>2 then raise exception 'Owner/Question lifecycle references missing'; end if;
 for r in select * from (values
 ('public.m125_require_question(uuid,uuid)',false,'s'),
 ('public.get_my_question_note(uuid,uuid)',true,'s'),
 ('public.save_my_question_note(uuid,uuid,text,uuid)',true,'v'),
 ('public.delete_my_question_note(uuid,uuid,uuid)',true,'v')) x(signature,exposed,volatility)
 loop
  select * into p from pg_proc where oid=to_regprocedure(r.signature);
  if p.oid is null or not p.prosecdef or p.proowner<>expected_owner or p.provolatile::text<>r.volatility or p.proconfig<>array['search_path=""'] then raise exception 'Invalid note authority contract: %',r.signature; end if;
  if has_function_privilege('anon',p.oid,'execute') or has_function_privilege('service_role',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute')<>r.exposed then raise exception 'Unexpected note function ACL: %',r.signature; end if;
  if r.exposed and p.prosrc not like '%public.m125_require_question(p_library_id, p_question_id)%' then raise exception 'Missing official Question authorization'; end if;
 end loop;
end $$;
select 'Migration 125 installed contracts verified' result;
rollback;
