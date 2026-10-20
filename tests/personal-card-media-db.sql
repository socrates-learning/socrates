-- Included after the unchanged synthetic movement fixture; no hosted database.
grant select on fixtures,libraries to service_role;
grant select,insert on checks to service_role;
insert into storage.buckets(id,name,public) values('socrates-content-media','socrates-content-media',false) on conflict(id) do nothing;
-- SQL contract fixture only. HTTP tests separately prove real Storage bytes.
create function pg_temp.storage_fixture(path text) returns void language sql security definer as $$
 insert into storage.objects(bucket_id,name,metadata) values('socrates-content-media',path,'{"size":100,"mimetype":"image/png"}')
$$;
create function pg_temp.upload(actor uuid,lib uuid,card uuid) returns uuid language plpgsql as $$
declare reservation uuid;claim jsonb;stage jsonb;promotion jsonb;result jsonb;
begin
 reservation:=(public.m136_reserve(actor,lib,card,gen_random_uuid())->>'reservationId')::uuid;
 claim:=public.m136_upload(actor,lib,card,reservation,'claim');
 stage:=public.m136_upload(actor,lib,card,reservation,'commit-bytes',(claim->>'token')::uuid,
 jsonb_build_object('inputDigest',repeat('1',64),'outputDigest',repeat('2',64),'mime','image/png','size',100,'width',10,'height',10));
 perform public.m136_upload(actor,lib,card,reservation,'dispatch-stage',(claim->>'token')::uuid,stage);
 promotion:=public.m136_upload(actor,lib,card,reservation,'stage-verified',(claim->>'token')::uuid,stage);
 result:=public.m136_upload(actor,lib,card,reservation,'dispatch-promotion',(claim->>'token')::uuid,promotion);
 perform pg_temp.storage_fixture(result->>'object');
 result:=public.m136_upload(actor,lib,card,reservation,'publish',(claim->>'token')::uuid,promotion);
 return (result->>'assetId')::uuid;
end$$;
create temp table media_fixture(card uuid,asset uuid,reference uuid,payload jsonb,revision timestamptz,receipt uuid);
grant all on media_fixture to service_role,authenticated;
create temp table protected_cards as select jsonb_agg(to_jsonb(c) order by id) data from public.personal_cards c where id<>(select topic_card from fixtures where role_name='learner');
set local role service_role;
do $$declare actor uuid;card uuid;lib uuid;asset uuid;reference uuid:=gen_random_uuid();payload jsonb;revision timestamptz;receipt uuid:=gen_random_uuid();saved jsonb;
begin
 select owner_id,topic_card into actor,card from fixtures where role_name='learner';select id into lib from libraries where kind='allowed';
 asset:=pg_temp.upload(actor,lib,card);
 revision:=(public.m136_manifest(actor,lib,card)->>'revision')::timestamptz;
 payload:=jsonb_build_object('front','**Historical Markdown front**','back','Historical back','sourceReference','Synthetic source',
 'images',jsonb_build_array(jsonb_build_object('id',reference,'assetId',asset,'side','front','description','A synthetic diagram')));
 saved:=public.m136_save(actor,lib,card,revision,receipt,payload);
 perform pg_temp.ok(saved->>'id'=card::text,'Save retains the existing Card identity');
 perform pg_temp.ok(public.m136_save(actor,lib,card,revision,receipt,payload)=saved,'Lost save acknowledgment retries return the same committed Card');
 perform pg_temp.ok(jsonb_array_length(public.m136_manifest(actor,lib,card)->'images')=1,'Fresh manifest returns the saved image');
 perform pg_temp.ok(public.m136_delivery(actor,lib,card,reference)->>'assetId'=asset::text,'Owner delivery resolves the exact saved asset');
 perform pg_temp.reject(format('select public.m136_save(%L,%L,%L,%L,%L,%L)',actor,lib,card,revision-interval '1 microsecond',gen_random_uuid(),payload),'40001','Stale edits cannot overwrite Card images or text');
 insert into media_fixture values(card,asset,reference,payload,(saved->>'updated_at')::timestamptz,receipt);
end$$;
do $$declare f record;actor uuid;card uuid;lib uuid;foreign_lib uuid;begin
 select owner_id,topic_card into actor,card from fixtures where role_name='learner';select id into lib from libraries where kind='allowed';select id into foreign_lib from libraries where kind='foreign';
 for f in select * from fixtures where role_name in ('admin','editor','unapproved') loop
  perform pg_temp.reject(format('select public.m136_reserve(%L,%L,%L,%L)',f.owner_id,lib,coalesce(f.topic_card,card),gen_random_uuid()),'42501',f.role_name||' cannot reserve Card images');
 end loop;
 perform pg_temp.reject(format('select public.m136_reserve(%L,%L,%L,%L)',actor,foreign_lib,card,gen_random_uuid()),'42501','Wrong Library cannot reserve images');
 perform pg_temp.reject(format('select public.m136_manifest(%L,%L,%L)',(select owner_id from fixtures where role_name='other'),lib,card),'42501','Cross-owner manifest denied');
 perform pg_temp.reject(format('select public.m136_delivery(%L,%L,%L,%L)',(select owner_id from fixtures where role_name='other'),lib,card,(select reference from media_fixture)),'42501','Cross-owner image bytes denied');
 perform pg_temp.reject(format('select public.m136_manifest(null,%L,%L)',lib,card),'42501','Anonymous manifest denied');
 perform pg_temp.reject(format('select public.m136_reserve(%L,%L,%L,%L)',actor,lib,(select legacy_card from fixtures where role_name='learner'),gen_random_uuid()),'42501','Concept-backed Cards cannot acquire image tools');
 perform pg_temp.reject(format('select public.m136_save(%L,%L,%L,%L,%L,%L)',actor,lib,(select official_card from fixtures where role_name='learner'),
 (public.m136_manifest(actor,lib,(select official_card from fixtures where role_name='learner'))->>'revision'),gen_random_uuid(),(select mf.payload from media_fixture mf)),'42501','An owner cannot copy an image onto another Card');
end$$;
reset role;
set local role authenticated;
select pg_temp.sign_in((select owner_id from fixtures where role_name='learner'));
select pg_temp.reject('select public.m136_reserve(null,null,null,null)','42501','Browser cannot invoke privileged image reservation');
select pg_temp.reject('insert into public.content_media_placements(id) values(gen_random_uuid())','42501','Browser cannot forge media references');
update public.personal_cards set personal_topic_id=null,library_id=(select id from libraries where kind='allowed'),library_node_id=(select root_id from libraries where kind='allowed') where id=(select card from media_fixture);
reset role;
set local role service_role;
select pg_temp.ok(public.m136_delivery((select owner_id from fixtures where role_name='learner'),(select id from libraries where kind='allowed'),card,reference)->>'assetId'=asset::text,'Card movement preserves asset identity and authenticated delivery') from media_fixture;
do $$declare f record;lib uuid;r1 uuid;r2 uuid;begin
 select * into f from fixtures where role_name='other';select id into lib from libraries where kind='allowed';
 r1:=(public.m136_reserve(f.owner_id,lib,f.topic_card,gen_random_uuid())->>'reservationId')::uuid;
 r2:=(public.m136_reserve(f.owner_id,lib,f.topic_card,gen_random_uuid())->>'reservationId')::uuid;
 perform pg_temp.reject(format('select public.m136_reserve(%L,%L,%L,%L)',f.owner_id,lib,f.topic_card,gen_random_uuid()),'P0136','Two pending uploads are the enforced maximum');
 perform public.m136_upload(f.owner_id,lib,f.topic_card,r1,'cancel');perform public.m136_upload(f.owner_id,lib,f.topic_card,r2,'cancel');
 for i in 1..8 loop r1:=(public.m136_reserve(f.owner_id,lib,f.topic_card,gen_random_uuid())->>'reservationId')::uuid;perform public.m136_upload(f.owner_id,lib,f.topic_card,r1,'cancel');end loop;
 perform pg_temp.reject(format('select public.m136_reserve(%L,%L,%L,%L)',f.owner_id,lib,f.topic_card,gen_random_uuid()),'P0136','Cancelled uploads cannot bypass ten reservations per ten minutes');
end$$;
reset role;
-- Image edits leave all pre-existing Topic, content and learning records exact.
select pg_temp.ok(data=pg_temp.protected_data(),'Image save and movement preserve official content mastery history and selections') from preservation;
do $$declare f record;lib uuid;manifest jsonb;payload jsonb;images jsonb;begin
 select * into f from fixtures where role_name='learner';select id into lib from libraries where kind='allowed';
 manifest:=public.m136_manifest(f.owner_id,lib,f.topic_card);
 select jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'assetId',(select asset from media_fixture),'side',case when i<=4 then 'front' else 'answer' end,'description','Synthetic image '||i)) into images from generate_series(1,8) i;
 payload:=(select mf.payload from media_fixture mf)||jsonb_build_object('images',images);
 perform public.m136_save(f.owner_id,lib,f.topic_card,(manifest->>'revision')::timestamptz,gen_random_uuid(),payload);
 perform pg_temp.ok(jsonb_array_length(public.m136_manifest(f.owner_id,lib,f.topic_card)->'images')=8,'Four Front and four Back image references save');
 perform pg_temp.reject(format('select public.m136_save(%L,%L,%L,%L,%L,%L)',f.owner_id,lib,f.topic_card,
 (public.m136_manifest(f.owner_id,lib,f.topic_card)->>'revision'),gen_random_uuid(),
 payload||jsonb_build_object('images',images||jsonb_build_array(images->0))),'P0001','A ninth Card image is denied');
 select jsonb_agg(value||jsonb_build_object('side','front')) into images from jsonb_array_elements(images) with ordinality x(value,ord) where ord<=5;
 perform pg_temp.reject(format('select public.m136_save(%L,%L,%L,%L,%L,%L)',f.owner_id,lib,f.topic_card,
 (public.m136_manifest(f.owner_id,lib,f.topic_card)->>'revision'),gen_random_uuid(),payload||jsonb_build_object('images',images)),'P0001','A fifth image on one side is denied');
 perform public.m136_save(f.owner_id,lib,f.topic_card,(public.m136_manifest(f.owner_id,lib,f.topic_card)->>'revision')::timestamptz,gen_random_uuid(),(select mf.payload from media_fixture mf));
 perform pg_temp.ok(jsonb_array_length(public.m136_manifest(f.owner_id,lib,f.topic_card)->'images')=1,'Removal saves only the requested references');
end$$;
-- Current account and Library access, not upload-time grants, control delivery.
update public.account_deletion_state set state='pending',receipt_hash=repeat('a',64),requested_at=now()
 where user_id=(select owner_id from fixtures where role_name='inactive');
set local role service_role;
select pg_temp.reject(format('select public.m136_manifest(%L,%L,%L)',(select owner_id from fixtures where role_name='inactive'),(select id from libraries where kind='allowed'),(select topic_card from fixtures where role_name='inactive')),'42501','Inactive owner cannot read image metadata');
reset role;
select pg_temp.sign_in((select owner_id from fixtures where role_name='admin'));
delete from public.user_libraries where user_id=(select owner_id from fixtures where role_name='learner');
set local role service_role;
select pg_temp.reject(format('select public.m136_delivery(%L,%L,%L,%L)',(select owner_id from fixtures where role_name='learner'),(select id from libraries where kind='allowed'),card,reference),'42501','Revoking current Library access immediately denies delivery') from media_fixture;
reset role;
select pg_temp.sign_in((select owner_id from fixtures where role_name='admin'));
insert into public.user_libraries(user_id,library_id,is_primary,assigned_by) select (select owner_id from fixtures where role_name='learner'),id,true,(select owner_id from fixtures where role_name='admin') from libraries where kind='allowed';
select pg_temp.ok(data=(select jsonb_agg(to_jsonb(c) order by id) from public.personal_cards c where id<>(select topic_card from fixtures where role_name='learner')),'All other historical Admin Editor Learner and legacy Cards remain byte-identical') from protected_cards;
select pg_temp.sign_in((select owner_id from fixtures where role_name='learner'));
set local role authenticated;
delete from public.personal_cards where id=(select card from media_fixture);
reset role;
select pg_temp.ok(not exists(select 1 from public.content_media_placements where personal_card_id=(select card from media_fixture)),'Card deletion atomically removes only its image references');
select pg_temp.ok(exists(select 1 from public.media_assets where id=(select asset from media_fixture) and state='ready'),'Card deletion does not immediately delete Storage assets');
-- Trusted historical pending assets exercise the owner's aggregate quota.
insert into public.media_assets(id,library_id,owner_id,created_by,scope,object_name)
select x.id,l.id,f.owner_id,f.owner_id,'personal',l.id::text||'/'||x.id::text
from (select gen_random_uuid() id from generate_series(1,31)) x
cross join (select id from libraries where kind='allowed') l
cross join (select owner_id from fixtures where role_name='learner') f;
set local role service_role;
do $$declare f record;lib uuid;reservation uuid;begin
 select * into f from fixtures where role_name='learner';select id into lib from libraries where kind='allowed';
 reservation:=(public.m136_reserve(f.owner_id,lib,f.official_card,gen_random_uuid())->>'reservationId')::uuid;
 perform pg_temp.ok(reservation is not null,'Owner can reserve below the 100 MiB combined quota');
 perform pg_temp.reject(format('select public.m136_reserve(%L,%L,%L,%L)',f.owner_id,lib,f.official_card,gen_random_uuid()),'P0136','Live and pending quota denies reservations exceeding 100 MiB');
 perform public.m136_upload(f.owner_id,lib,f.official_card,reservation,'cancel');
end$$;
reset role;
set constraints all immediate;
\o
select label||'|PASS' from checks order by label;
rollback;
