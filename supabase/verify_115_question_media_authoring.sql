-- Read-only installed contract. Frozen pre-115 functions retain body, owner and ACL.
begin;
do $$ declare f record; role_name text;
 service_api text[]:=array['m115_draft','m115_reserve','m115_upload','m115_manifest','m115_preview'];
 browser_api text[]:=array['m115_save','question_media_hint','get_creator_questions_with_media','search_creator_questions_with_media','select_next_study_candidate_with_media','start_study_session_with_candidate_and_media'];
begin
 if not exists(select 1 from pg_class where oid='public.question_media_drafts'::regclass and relrowsecurity) then raise exception 'Draft RLS missing'; end if;
 if (select array_agg(column_name::text order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='question_media_drafts') is distinct from array['id','author_id','library_id','question_id','expected_version_id','state','expires_at','save_digest','bound_question_id','bound_version_id','created_at','closed_at'] then raise exception 'Unexpected draft columns'; end if;
 if exists(select 1 from pg_policies where schemaname='public' and tablename='question_media_drafts') then raise exception 'Browser draft policy forbidden'; end if;
 foreach role_name in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(role_name,'public.question_media_drafts','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then raise exception 'Direct table authority'; end if;
 end loop;
 if to_regclass('public.question_media_drafts_author') is null or obj_description('public.question_media_drafts'::regclass) is null then raise exception 'Draft index/contract missing'; end if;
 for f in select oid,proname,prosecdef,proconfig from pg_proc where pronamespace='public'::regnamespace and (proname like 'm115_%' or proname=any(browser_api)) loop
  if not f.prosecdef or not ('search_path=""'=any(f.proconfig)) then raise exception 'Unsafe function %',f.proname; end if;
  if has_function_privilege('anon',f.oid,'EXECUTE') then raise exception 'Anonymous media API'; end if;
  if has_function_privilege('authenticated',f.oid,'EXECUTE') <> (f.proname=any(browser_api)) then raise exception 'Browser privilege differs: %',f.proname; end if;
  if has_function_privilege('service_role',f.oid,'EXECUTE') <> (f.proname=any(service_api)) then raise exception 'Service privilege differs: %',f.proname; end if;
 end loop;
 if (select count(*) from pg_proc where pronamespace='public'::regnamespace and (proname like 'm115_%' or proname=any(browser_api)))<>16 then raise exception 'Unexpected function set'; end if;
end $$;
do $$ declare expected record; actual record; begin
 for expected in select * from (values
  ('m114_tokens(text)','1ec590e6bf43445f407eefe4dd33cd72','postgres','{postgres=X/postgres}'),
  ('m112_asset_guard()','1c31ee57dfa9d1c68019c3a2f42d10e0','postgres','{postgres=X/postgres}'),
  ('m112_lease_guard()','e1288b02e9b23563c0dbcc3fb4795f34','postgres','{postgres=X/postgres}'),
  ('m114_token_boundary()','a591cf78b1f5709fbb6ce44881978682','postgres','{postgres=X/postgres}'),
  ('m112_reference_guard()','d6a26803bfffff8b8e8a89ba72d4e649','postgres','{postgres=X/postgres}'),
  ('m114_author(uuid,uuid)','b82d9e9cc006137a33024b2a6974efa3','postgres','{postgres=X/postgres}'),
  ('m112_manage_asset(uuid)','a65ea8c12104838aa0076d4ff12980bf','postgres','{postgres=X/postgres,authenticated=X/postgres}'),
  ('m112_queue_orphan(uuid)','20845940af62dc6f8109c9092e9a1571','postgres','{postgres=X/postgres}'),
  ('m112_version_boundary()','263992d9f33b442b288d0303c91a7cfc','postgres','{postgres=X/postgres}'),
  ('m112_library_access(uuid)','0064ca9a7d6ac024b6b12d9e478c3fde','postgres','{postgres=X/postgres,authenticated=X/postgres}'),
  ('m114_close_operations(uuid)','8a83a76436e715661bc77f2b0f53392f','postgres','{postgres=X/postgres}'),
  ('m112_capture_version_media()','d932455be7a9123b772edeb8786a485e','postgres','{postgres=X/postgres}'),
  ('m113_cleanup(uuid,text,uuid)','b34733ac554fa66912f1e1c6a555dd44','postgres','{postgres=X/postgres,service_role=X/postgres}'),
  ('m113_delivery(uuid,uuid,uuid)','c847184d99a2562a03e35f10d522aeb4','postgres','{postgres=X/postgres,service_role=X/postgres}'),
  ('m114_manifest(uuid,uuid,uuid)','441e2157347cbce07ba3936f5cf987ff','postgres','{postgres=X/postgres,service_role=X/postgres}'),
  ('m114_receipt(uuid,uuid,jsonb)','e213083be27df4a0863da687cd13fc55','postgres','{postgres=X/postgres}'),
  ('resolve_study_candidates(uuid)','ba74359f5e0a6dd517d7abeff1d00cb0','postgres','{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'),
  ('m114_draft(uuid,uuid,uuid,text)','358ef696b5b270c02c706004b370f845','postgres','{postgres=X/postgres,service_role=X/postgres}'),
  ('get_creator_questions(uuid,uuid)','a0e3bcedc96d8ade5c6d59a490a7868f','postgres','{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'),
  ('m114_reserve(uuid,uuid,uuid,uuid)','5713b0840d9aadb4d38284c446c78597','postgres','{postgres=X/postgres,service_role=X/postgres}'),
  ('_development_delete_question(uuid)','1c13d3ba1f0c9a762539c797915204ae','postgres','{postgres=X/postgres,service_role=X/postgres}'),
  ('m114_save(uuid,uuid,uuid,uuid,jsonb)','b5029856efd7b90e43c9332ee394c0fd','postgres','{postgres=X/postgres,authenticated=X/postgres}'),
  ('m113_actor_target(uuid,uuid,text,uuid)','f9a7d0dfc907bc085c8d95d489af3c41','postgres','{postgres=X/postgres}'),
  ('m113_reserve(uuid,uuid,text,uuid,uuid)','d5a4843c7e796d389e072ab369630c12','postgres','{postgres=X/postgres,service_role=X/postgres}'),
  ('m114_preview(uuid,uuid,uuid,uuid,uuid)','d7944ab2065a7123894ce8bd91f11aae','postgres','{postgres=X/postgres,service_role=X/postgres}'),
  ('select_next_study_candidate(uuid,boolean)','f45f053db74a7bbb84fb89fbee483de2','postgres','{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'),
  ('append_question_version_snapshot(uuid,uuid)','62fb2c3e0c2dcb79ed07e63260bdc3f6','postgres','{postgres=X/postgres,service_role=X/postgres}'),
  ('m113_upload(uuid,uuid,uuid,text,uuid,jsonb)','a5b8035daf4246563b2e42f67b428982','postgres','{postgres=X/postgres,service_role=X/postgres}'),
  ('m114_upload(uuid,uuid,uuid,text,uuid,jsonb)','1887180b6ee6e67037a4dc5d3f4f0e00','postgres','{postgres=X/postgres,service_role=X/postgres}'),
  ('m112_target_allowed(uuid,uuid,uuid,uuid,uuid,uuid)','a2c995cb6f93f085e2255dde64c895e2','postgres','{postgres=X/postgres}'),
  ('create_question(uuid,text,text,text,uuid,integer,text,text)','b3c5b781f3bd9dd6e00752dd84c48494','postgres','{postgres=X/postgres,service_role=X/postgres}'),
  ('start_study_session_with_candidate(uuid,integer,uuid,boolean)','d7ef0a9f9ff7f17fa64f04b3a91489fb','postgres','{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'),
  ('search_creator_questions(uuid,text,text,text,text,uuid,uuid,text,uuid,integer,timestamp with time zone,uuid)','da3facc70b3748dc8c6482790bf5afa4','postgres','{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'),
  ('save_question_with_relationships(uuid,uuid,text,text,text,text,uuid,integer,text,text,jsonb,jsonb,uuid[],uuid[],uuid,uuid[])','307d9203ba294f907730e5f503c49bfe','postgres','{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
  ('save_question_with_relationships_v2(uuid,uuid,text,text,text,text,uuid,integer,text,text,jsonb,jsonb,uuid[],uuid[],uuid,uuid[],text[])','ec5e3af353361d6c60ceefa6383f5531','postgres','{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}')) frozen(signature,definition_md5,owner_name,acl) loop
  select md5(pg_get_functiondef(p.oid)) definition_md5,pg_get_userbyid(p.proowner) owner_name,p.proacl::text acl into actual from pg_proc p where p.oid=to_regprocedure(expected.signature);
  if not found or row(actual.definition_md5,actual.owner_name,actual.acl) is distinct from row(expected.definition_md5,expected.owner_name,expected.acl) then raise exception 'Frozen contract changed: %',expected.signature; end if;
 end loop;
end $$;
select 'PASS Migration 115 installed authority and frozen 112/113/114/save/read/selector contracts';
rollback;
