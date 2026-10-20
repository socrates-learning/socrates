-- Read-only installed contract. Behavioral checks use disposable data separately.
begin;
set local statement_timeout='15s';
do $$declare f record;name text;begin
 if to_regclass('public.personal_card_media_saves') is null then raise exception '136 receipt table missing';end if;
 if not exists(select 1 from pg_class where oid='public.personal_card_media_saves'::regclass and relrowsecurity and relowner='postgres'::regrole) then raise exception '136 receipt privacy mismatch';end if;
 foreach name in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(name,'public.personal_card_media_saves','SELECT,INSERT,UPDATE,DELETE') then raise exception '136 receipt table exposed';end if;
 end loop;
 for f in select oid,oid::regprocedure signature,proname,prosecdef,proconfig,proowner from pg_proc where pronamespace='public'::regnamespace and proname like 'm136_%' loop
  if not f.prosecdef or f.proowner<>'postgres'::regrole or f.proconfig is distinct from array['search_path=""'] then raise exception '136 function boundary mismatch: %',f.signature;end if;
  if has_function_privilege('anon',f.oid,'EXECUTE') or has_function_privilege('authenticated',f.oid,'EXECUTE') then raise exception '136 browser RPC exposure: %',f.signature;end if;
  if has_function_privilege('service_role',f.oid,'EXECUTE') is distinct from (f.proname in ('m136_reserve','m136_upload','m136_manifest','m136_delivery','m136_save')) then raise exception '136 service capability mismatch: %',f.signature;end if;
 end loop;
 if not exists(select 1 from pg_policy where polrelid='storage.objects'::regclass and polname='m112_private_media_boundary' and not polpermissive and polcmd='*') then raise exception 'Private Storage boundary missing';end if;
 if not exists(select 1 from pg_policy where polrelid='public.personal_cards'::regclass and polname='personal_cards_admin_insert_restriction' and not polpermissive and polcmd='a') then raise exception 'Admin Card creation restriction missing';end if;
 if not exists(select 1 from pg_trigger where tgrelid='public.personal_cards'::regclass and tgname='m136_card_media_delete' and tgenabled='O')
 or not exists(select 1 from pg_trigger where tgrelid='public.content_media_placements'::regclass and tgname='m136_card_reference' and tgenabled='O')
 or not exists(select 1 from pg_trigger where tgrelid='public.personal_card_media_saves'::regclass and tgname='a127_write_fence' and tgenabled='O') then raise exception '136 lifecycle guard missing';end if;
 if position('public.m136_card_allowed(o.target_id,null,true)' in pg_get_functiondef('public.m113_upload(uuid,uuid,uuid,text,uuid,jsonb)'::regprocedure))=0 then raise exception '136 upload authorization missing';end if;
 if position('p_kind not in (''concept'',''question'')' in pg_get_functiondef('public.m113_actor_target(uuid,uuid,text,uuid)'::regprocedure))=0 then raise exception 'Official reservation boundary broadened';end if;
end$$;
select 'Migration 136 installed contract PASS' result;
rollback;
