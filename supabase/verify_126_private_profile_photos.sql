\set ON_ERROR_STOP on
begin read only;
set local search_path = '';
do $$
begin
 if not exists(select 1 from storage.buckets where id='socrates-profile-photos'
  and not public and file_size_limit=3145728 and allowed_mime_types=array['image/jpeg','image/png','image/webp']) then
  raise exception 'Private photo bucket limits missing';
 end if;
 if not (select relrowsecurity from pg_class where oid='storage.objects'::regclass) then raise exception 'Storage RLS required'; end if;
 if not exists(select 1 from pg_policy where polrelid='storage.objects'::regclass and polname='m126_profile_photo_boundary' and not polpermissive and polcmd='*'
  and polroles=array['authenticated'::regrole::oid]
  and pg_get_expr(polqual,polrelid) like '%auth.uid()%'
  and pg_get_expr(polwithcheck,polrelid) like '%has_socrates_role()%') then raise exception 'Restrictive private photo boundary missing'; end if;
 if not exists(select 1 from pg_policy where polrelid='storage.objects'::regclass and polname='m126_profile_photo_owner' and polpermissive and polcmd='*'
  and polroles=array['authenticated'::regrole::oid]
  and pg_get_expr(polqual,polrelid) like '%auth.uid()%'
  and pg_get_expr(polwithcheck,polrelid) like '%has_socrates_role()%') then raise exception 'Owner photo policy missing'; end if;
 if not exists(select 1 from pg_policy where polrelid='storage.objects'::regclass and polname='m126_profile_photo_anonymous' and not polpermissive and polcmd='*'
  and polroles=array['anon'::regrole::oid]
  and pg_get_expr(polqual,polrelid) = '(bucket_id <> ''socrates-profile-photos''::text)'
  and pg_get_expr(polwithcheck,polrelid) = '(bucket_id <> ''socrates-profile-photos''::text)') then raise exception 'Anonymous private photo boundary missing'; end if;
end $$;
select 'Migration 126 private photo contracts verified' result;
rollback;
