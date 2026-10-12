-- Display names reuse Auth full_name metadata. Photos are private and owner-only.
begin;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('socrates-profile-photos', 'socrates-profile-photos', false, 3145728,
 array['image/jpeg', 'image/png', 'image/webp']);

-- Restrictive boundary protects this bucket even if a broader policy is added.
-- It does not change access to any existing bucket.
create policy m126_profile_photo_boundary on storage.objects as restrictive
for all to authenticated
using (bucket_id <> 'socrates-profile-photos' or
 (name = (select auth.uid())::text || '/avatar' and public.has_socrates_role()))
with check (bucket_id <> 'socrates-profile-photos' or
 (name = (select auth.uid())::text || '/avatar' and public.has_socrates_role()));

-- Anonymous users cannot invoke the approved-account helper. Keep their
-- boundary separate so existing non-profile Storage policies are unaffected.
create policy m126_profile_photo_anonymous on storage.objects as restrictive
for all to anon
using (bucket_id <> 'socrates-profile-photos')
with check (bucket_id <> 'socrates-profile-photos');

create policy m126_profile_photo_owner on storage.objects
for all to authenticated
using (bucket_id = 'socrates-profile-photos' and
 name = (select auth.uid())::text || '/avatar' and public.has_socrates_role())
with check (bucket_id = 'socrates-profile-photos' and
 name = (select auth.uid())::text || '/avatar' and public.has_socrates_role());

commit;
