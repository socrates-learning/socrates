-- Read-only installed-contract verification; no bucket or content creation.
begin read only;
do $$ declare t text; begin
 foreach t in array array['media_assets','media_upload_sessions','media_draft_leases','content_media_placements','media_version_references','media_deletion_jobs'] loop
  if not (select relrowsecurity from pg_class where oid=('public.'||t)::regclass) then raise exception 'Missing RLS: %',t;end if;
  if has_table_privilege('authenticated','public.'||t,'INSERT,UPDATE,DELETE') or has_table_privilege('anon','public.'||t,'INSERT,UPDATE,DELETE') then raise exception 'Unexpected direct media write: %',t;end if;
 end loop;
 if has_function_privilege('authenticated','public.m112_queue_orphan(uuid)','EXECUTE') or has_function_privilege('service_role','public.m112_queue_orphan(uuid)','EXECUTE') then raise exception 'Cleanup exposed without separate authorization';end if;
 if not has_function_privilege('authenticated','public.reserve_media_upload(uuid,text,uuid)','EXECUTE') or has_function_privilege('anon','public.reserve_media_upload(uuid,text,uuid)','EXECUTE') then raise exception 'Reservation ACL mismatch';end if;
 if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='m112_private_media_boundary' and permissive='RESTRICTIVE') then raise exception 'Storage boundary missing';end if;
 if exists(select 1 from storage.buckets where id='socrates-content-media' and public) then raise exception 'Media bucket must be private';end if;
 if (select count(*) from pg_constraint where conrelid='public.media_version_references'::regclass and confrelid in ('public.concept_versions'::regclass,'public.question_versions'::regclass) and confdeltype='c')<>2 then raise exception 'Permanent deletion must close version references';end if;
 if exists(select 1 from pg_proc where pronamespace='public'::regnamespace and (proname like 'm112_%' or proname='reserve_media_upload') and (not prosecdef or not ('search_path=""'=any(proconfig)))) then raise exception 'Media function security configuration mismatch';end if;
end $$;
rollback;
