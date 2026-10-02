-- Read-only installed-contract verification, including frozen foundation bodies.
begin;
do $$
declare f record; r text; service_api text[]:=array['m114_draft','m114_reserve','m114_upload','m114_manifest','m114_preview'];
begin
 if not exists(select 1 from pg_class where oid='public.concept_media_drafts'::regclass and relrowsecurity) then raise exception 'Private draft RLS missing'; end if;
 foreach r in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(r,'public.concept_media_drafts','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then raise exception 'Direct draft authority granted to %',r; end if;
 end loop;
 if exists(select 1 from pg_policies where schemaname='public' and tablename='concept_media_drafts') then raise exception 'Private draft browser policy'; end if;
 if (select array_agg(column_name::text order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='concept_media_drafts')
  is distinct from array['id','author_id','library_id','state','expires_at','save_digest','bound_concept_id','bound_version_id','created_at','closed_at'] then raise exception 'Unexpected draft columns/content'; end if;
 if (select count(*) from pg_constraint where conrelid='public.concept_media_drafts'::regclass)<>7 then raise exception 'Unexpected draft constraints'; end if;
 if obj_description('public.concept_media_drafts'::regclass) is null then raise exception 'Missing draft retention contract comment'; end if;
 if to_regclass('public.concept_media_drafts_author') is null then raise exception 'Missing author context index'; end if;
 for f in select oid,proname,prosecdef,proconfig,provolatile from pg_proc where pronamespace='public'::regnamespace and proname like 'm114_%' loop
  if not ('search_path=""'=any(f.proconfig)) or (f.proname<>'m114_tokens' and not f.prosecdef) then raise exception 'Unsafe function %',f.proname; end if;
  if f.proname='m114_tokens' and (f.prosecdef or f.provolatile<>'i') then raise exception 'Token parser must be pure invoker'; end if;
  if has_function_privilege('anon',f.oid,'EXECUTE') then raise exception 'Anonymous authoring authority'; end if;
  if has_function_privilege('authenticated',f.oid,'EXECUTE') <> (f.proname='m114_save') then raise exception 'Unexpected browser function %',f.proname; end if;
  if has_function_privilege('service_role',f.oid,'EXECUTE') <> (f.proname=any(service_api)) then raise exception 'Unexpected service function %',f.proname; end if;
 end loop;
 if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname like 'm114_%')<>11 then raise exception 'Unexpected authoring function set'; end if;
 foreach r in array array['m114_concept_tokens','m114_placement_tokens'] loop
  if not exists(select 1 from pg_trigger where tgname=r and tgdeferrable and tginitdeferred and tgfoid='public.m114_token_boundary()'::regprocedure) then raise exception 'Missing deferred token boundary %',r; end if;
 end loop;
 if public.m114_tokens('[[socrates-media:11400000-0000-4000-8000-000000000001]]')<>array['11400000-0000-4000-8000-000000000001'::uuid] then raise exception 'Token parsing contract differs'; end if;
end $$;

-- These are the accepted pre-114 installed identities, not regenerated expectations.
do $$ declare expected record; actual record; begin
 for expected in select * from (values
  ('public.m112_asset_guard()','1c31ee57dfa9d1c68019c3a2f42d10e0','postgres','{postgres=X/postgres}'),
  ('public.m112_capture_version_media()','d932455be7a9123b772edeb8786a485e','postgres','{postgres=X/postgres}'),
  ('public.m112_lease_guard()','e1288b02e9b23563c0dbcc3fb4795f34','postgres','{postgres=X/postgres}'),
  ('public.m112_library_access(uuid)','0064ca9a7d6ac024b6b12d9e478c3fde','postgres','{postgres=X/postgres,authenticated=X/postgres}'),
  ('public.m112_manage_asset(uuid)','a65ea8c12104838aa0076d4ff12980bf','postgres','{postgres=X/postgres,authenticated=X/postgres}'),
  ('public.m112_queue_orphan(uuid)','20845940af62dc6f8109c9092e9a1571','postgres','{postgres=X/postgres}'),
  ('public.m112_reference_guard()','d6a26803bfffff8b8e8a89ba72d4e649','postgres','{postgres=X/postgres}'),
  ('public.m112_target_allowed(uuid,uuid,uuid,uuid,uuid,uuid)','a2c995cb6f93f085e2255dde64c895e2','postgres','{postgres=X/postgres}'),
  ('public.m112_version_boundary()','263992d9f33b442b288d0303c91a7cfc','postgres','{postgres=X/postgres}'),
  ('public.m113_actor_target(uuid,uuid,text,uuid)','f9a7d0dfc907bc085c8d95d489af3c41','postgres','{postgres=X/postgres}'),
  ('public.m113_cleanup(uuid,text,uuid)','b34733ac554fa66912f1e1c6a555dd44','postgres','{postgres=X/postgres,service_role=X/postgres}'),
  ('public.m113_delivery(uuid,uuid,uuid)','c847184d99a2562a03e35f10d522aeb4','postgres','{postgres=X/postgres,service_role=X/postgres}'),
  ('public.m113_reserve(uuid,uuid,text,uuid,uuid)','d5a4843c7e796d389e072ab369630c12','postgres','{postgres=X/postgres,service_role=X/postgres}'),
  ('public.m113_upload(uuid,uuid,uuid,text,uuid,jsonb)','a5b8035daf4246563b2e42f67b428982','postgres','{postgres=X/postgres,service_role=X/postgres}')) as frozen(signature,definition_md5,owner_name,acl) loop
  select md5(pg_get_functiondef(p.oid)) definition_md5,pg_get_userbyid(p.proowner) owner_name,p.proacl::text acl into actual
  from pg_proc p where p.oid=to_regprocedure(expected.signature);
  if not found or row(actual.definition_md5,actual.owner_name,actual.acl) is distinct from row(expected.definition_md5,expected.owner_name,expected.acl) then raise exception 'Frozen foundation changed: %',expected.signature; end if;
 end loop;
end $$;
select 'PASS Migration 114 installed contract and frozen 112/113 function identities';
rollback;
