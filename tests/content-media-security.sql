-- Run only in media112 after real Auth fixtures and real Storage service fixture objects.
-- All behavioral probes roll back; no Production endpoints or credentials.
begin;
create temporary table media_checks(name text primary key);
grant insert,select on media_checks to authenticated;
create function pg_temp.ok(p_name text,p_ok boolean) returns void language plpgsql as $$
begin if p_ok is distinct from true then raise exception 'FAIL: %',p_name;end if;insert into media_checks values(p_name);end $$;
create function pg_temp.denied(p_name text,p_sql text,p_message text) returns void language plpgsql as $$
declare failed boolean:=false;
begin
 begin execute p_sql;exception when others then
  if sqlerrm not like '%'||p_message||'%' then raise exception 'Unexpected failure for %: %',p_name,sqlerrm;end if;failed:=true;
 end;
 perform pg_temp.ok(p_name,failed);
end $$;
select set_config('request.jwt.claim.sub','11200000-0000-4000-8000-000000000001',true);
set local role authenticated;
select pg_temp.ok('Direct Storage table read denied',not exists(select 1 from storage.objects where bucket_id='socrates-content-media'));
select pg_temp.denied('Direct Storage table insert denied', $$insert into storage.objects(bucket_id,name) values('socrates-content-media','guessed')$$,'row-level security');
select pg_temp.ok('Admin official access',public.m112_manage_asset('11200000-0000-4000-8000-000000000100'));
select pg_temp.ok('Admin cannot read learner-owned asset',not public.m112_manage_asset('11200000-0000-4000-8000-000000000101'));
select pg_temp.ok('Guessed asset denied',not public.m112_manage_asset('ffffffff-ffff-4fff-8fff-ffffffffffff'));
select pg_temp.denied('Normal table insert denied','insert into public.media_assets(library_id,created_by,scope,object_name) values(null,null,''official'',''x'')','permission denied');
select pg_temp.denied('Normal direct cleanup denied','select public.m112_queue_orphan(''11200000-0000-4000-8000-000000000100'')','permission denied');
select pg_temp.denied('Normal direct placement denied','delete from public.content_media_placements','permission denied');
select pg_temp.denied('Normal version mutation denied','delete from public.media_version_references','permission denied');
select set_config('request.jwt.claim.sub','11200000-0000-4000-8000-000000000002',true);
select pg_temp.ok('Editor official access',public.m112_manage_asset('11200000-0000-4000-8000-000000000100'));
select set_config('request.jwt.claim.sub','11200000-0000-4000-8000-000000000003',true);
select pg_temp.ok('Learner owner access',public.m112_manage_asset('11200000-0000-4000-8000-000000000101'));
select pg_temp.ok('Learner no official author access',not public.m112_manage_asset('11200000-0000-4000-8000-000000000100'));
select pg_temp.denied('Learner no official reserve', $$select public.reserve_media_upload('11200000-0000-4000-8000-000000000010','official','11200000-0000-4000-8000-000000000200')$$,'denied');
select pg_temp.denied('Cross-Library reserve denied', $$select public.reserve_media_upload('11200000-0000-4000-8000-000000000011','personal','11200000-0000-4000-8000-000000000200')$$,'denied');
select pg_temp.ok('Reservation idempotency',public.reserve_media_upload('11200000-0000-4000-8000-000000000010','personal','11200000-0000-4000-8000-000000000200')=public.reserve_media_upload('11200000-0000-4000-8000-000000000010','personal','11200000-0000-4000-8000-000000000200'));
select set_config('request.jwt.claim.sub','11200000-0000-4000-8000-000000000004',true);
select pg_temp.ok('Second learner denied',not public.m112_manage_asset('11200000-0000-4000-8000-000000000101'));
select pg_temp.ok('Owner RLS hides metadata',not exists(select 1 from public.media_assets where id='11200000-0000-4000-8000-000000000101'));
reset role;
select set_config('request.jwt.claim.sub','11200000-0000-4000-8000-000000000001',true);
select public.reserve_media_upload('11200000-0000-4000-8000-000000000010','official','11200000-0000-4000-8000-000000000202') as admin_reservation \gset
select pg_temp.denied('Idempotency cannot change Library', $$select public.reserve_media_upload('11200000-0000-4000-8000-000000000011','official','11200000-0000-4000-8000-000000000202')$$,'request differs');
select pg_temp.denied('Idempotency cannot change scope', $$select public.reserve_media_upload('11200000-0000-4000-8000-000000000010','personal','11200000-0000-4000-8000-000000000202')$$,'request differs');
insert into public.media_draft_leases(asset_id,actor_id,expires_at) values('11200000-0000-4000-8000-000000000104','11200000-0000-4000-8000-000000000001',clock_timestamp()+interval '1 hour');
select pg_temp.ok('Live draft lease prevents cleanup',not public.m112_queue_orphan('11200000-0000-4000-8000-000000000104') and (select unreferenced_since is null from public.media_assets where id='11200000-0000-4000-8000-000000000104'));
update public.media_draft_leases set expires_at=created_at+interval '1 microsecond' where asset_id='11200000-0000-4000-8000-000000000104';
select pg_temp.ok('Expired draft lease starts cleanup grace',not public.m112_queue_orphan('11200000-0000-4000-8000-000000000104'));
select pg_temp.denied('Immutable asset object', $$update public.media_assets set object_name='11200000-0000-4000-8000-000000000010/11200000-0000-4000-8000-000000000999' where id='11200000-0000-4000-8000-000000000100'$$,'Immutable');
select pg_temp.denied('Invalid lifecycle reversal', $$update public.media_assets set state='pending' where id='11200000-0000-4000-8000-000000000100'$$,'Invalid media');
select pg_temp.denied('Verified digest immutable', $$update public.media_assets set sha256=repeat('0',64) where id='11200000-0000-4000-8000-000000000100'$$,'Immutable');
select pg_temp.denied('Pending asset cannot attach', $$insert into public.content_media_placements(asset_id,library_id,concept_id,surface,ordinal,alt_text) values('11200000-0000-4000-8000-000000000103','11200000-0000-4000-8000-000000000010','11200000-0000-4000-8000-000000000030','concept',0,'Meaningful description')$$,'Authorized ready');
select pg_temp.denied('Cross-Library placement denied', $$insert into public.content_media_placements(asset_id,library_id,concept_id,surface,ordinal,alt_text) values('11200000-0000-4000-8000-000000000100','11200000-0000-4000-8000-000000000010','11200000-0000-4000-8000-000000000031','concept',0,'Description')$$,'target denied');
select pg_temp.denied('Guessed placement target denied', $$insert into public.content_media_placements(asset_id,library_id,concept_id,surface,ordinal,alt_text) values('11200000-0000-4000-8000-000000000100','11200000-0000-4000-8000-000000000010','ffffffff-ffff-4fff-8fff-ffffffffffff','concept',0,'Description')$$,'target denied');
select pg_temp.denied('Exactly one target', $$insert into public.content_media_placements(asset_id,library_id,concept_id,question_id,surface,ordinal,alt_text) values('11200000-0000-4000-8000-000000000100','11200000-0000-4000-8000-000000000010','11200000-0000-4000-8000-000000000030','11200000-0000-4000-8000-000000000040','concept',0,'Description')$$,'check constraint');
select pg_temp.denied('Concept surface constraint', $$insert into public.content_media_placements(asset_id,library_id,concept_id,surface,ordinal,alt_text) values('11200000-0000-4000-8000-000000000100','11200000-0000-4000-8000-000000000010','11200000-0000-4000-8000-000000000030','answer',0,'Description')$$,'check constraint');
select pg_temp.denied('Required alt text', $$insert into public.content_media_placements(asset_id,library_id,concept_id,surface,ordinal,alt_text) values('11200000-0000-4000-8000-000000000100','11200000-0000-4000-8000-000000000010','11200000-0000-4000-8000-000000000030','concept',0,' ')$$,'check constraint');
-- Successful placement and fresh immutable version are created together.
select public.append_concept_version_snapshot('11200000-0000-4000-8000-000000000030',null) as cv \gset
update public.concepts set current_version_id=:'cv' where id='11200000-0000-4000-8000-000000000030';
insert into public.content_media_placements(id,asset_id,library_id,concept_id,surface,ordinal,alt_text) values
 ('11200000-0000-4000-8000-000000000300','11200000-0000-4000-8000-000000000100','11200000-0000-4000-8000-000000000010','11200000-0000-4000-8000-000000000030','concept',0,'First figure'),
 ('11200000-0000-4000-8000-000000000301','11200000-0000-4000-8000-000000000100','11200000-0000-4000-8000-000000000010','11200000-0000-4000-8000-000000000030','concept',1,'Second figure');
insert into public.media_version_references(asset_id,library_id,placement_id,concept_version_id,surface,ordinal,alt_text,caption)
 select asset_id,library_id,id,:'cv',surface,ordinal,alt_text,caption from public.content_media_placements;
set constraints all immediate;
select pg_temp.ok('Same-Library reuse and snapshot', (select count(*)=2 from public.media_version_references));
select pg_temp.denied('Historical references immutable','delete from public.media_version_references','historical references are immutable');
select pg_temp.ok('Historical/current references block GC',not public.m112_queue_orphan('11200000-0000-4000-8000-000000000100'));
select pg_temp.ok('First unreferenced check starts grace',not public.m112_queue_orphan('11200000-0000-4000-8000-000000000102'));
update public.media_assets set unreferenced_since=clock_timestamp()-interval '25 hours' where id='11200000-0000-4000-8000-000000000102';
select pg_temp.ok('Grace-complete orphan queues',public.m112_queue_orphan('11200000-0000-4000-8000-000000000102'));
select pg_temp.denied('Object must be deleted through Storage first', $$update public.media_assets set state='deleted' where id='11200000-0000-4000-8000-000000000102'$$,'Storage API deletion not confirmed');

-- Independent front/answer ordering without changing Question text or save RPCs.
set constraints all deferred;
select public.append_question_version_snapshot('11200000-0000-4000-8000-000000000040',null) as qv \gset
update public.questions set current_version_id=:'qv' where id='11200000-0000-4000-8000-000000000040';
insert into public.content_media_placements(id,asset_id,library_id,question_id,surface,ordinal,alt_text) values
 ('11200000-0000-4000-8000-000000000302','11200000-0000-4000-8000-000000000100','11200000-0000-4000-8000-000000000010','11200000-0000-4000-8000-000000000040','front',0,'Front description'),
 ('11200000-0000-4000-8000-000000000303','11200000-0000-4000-8000-000000000100','11200000-0000-4000-8000-000000000010','11200000-0000-4000-8000-000000000040','answer',0,'Answer description');
insert into public.media_version_references(asset_id,library_id,placement_id,question_version_id,surface,ordinal,alt_text,caption)
 select asset_id,library_id,id,:'qv',surface,ordinal,alt_text,caption from public.content_media_placements where question_id is not null;
set constraints all immediate;
select pg_temp.ok('Front and Answer snapshot independent',(select count(*)=2 from public.media_version_references where question_version_id=:'qv'));
-- Existing append functions carry forward the exact media tuple without save-RPC changes.
set constraints all deferred;
select public.append_concept_version_snapshot('11200000-0000-4000-8000-000000000030',null) as carried_cv \gset
update public.concepts set current_version_id=:'carried_cv' where id='11200000-0000-4000-8000-000000000030';
select public.append_question_version_snapshot('11200000-0000-4000-8000-000000000040',null) as carried_qv \gset
update public.questions set current_version_id=:'carried_qv' where id='11200000-0000-4000-8000-000000000040';
set constraints all immediate;
select pg_temp.ok('Concept version carries both media references',(select count(*)=2 from public.media_version_references where concept_version_id=:'carried_cv'));
select pg_temp.ok('Question version carries Front and Answer',(select count(*)=2 from public.media_version_references where question_version_id=:'carried_qv'));
-- Replacement changes asset identity; retained versions still hold the old bytes/alt/order.
set constraints all deferred;
delete from public.content_media_placements where id='11200000-0000-4000-8000-000000000300';
insert into public.content_media_placements(id,asset_id,library_id,concept_id,surface,ordinal,alt_text) values('11200000-0000-4000-8000-000000000304','11200000-0000-4000-8000-000000000104','11200000-0000-4000-8000-000000000010','11200000-0000-4000-8000-000000000030','concept',0,'Replacement figure');
select public.append_concept_version_snapshot('11200000-0000-4000-8000-000000000030',null) as replacement_cv \gset
update public.concepts set current_version_id=:'replacement_cv' where id='11200000-0000-4000-8000-000000000030';
set constraints all immediate;
select pg_temp.ok('Replacement keeps old immutable tuple',(select asset_id='11200000-0000-4000-8000-000000000100' and alt_text='First figure' and ordinal=0 from public.media_version_references where concept_version_id=:'cv' and placement_id='11200000-0000-4000-8000-000000000300'));
select pg_temp.ok('Replacement snapshot uses new asset',(select asset_id='11200000-0000-4000-8000-000000000104' and alt_text='Replacement figure' from public.media_version_references where concept_version_id=:'replacement_cv' and ordinal=0));
set constraints all deferred;
delete from public.content_media_placements where concept_id is not null or question_id is not null;
select public.append_concept_version_snapshot('11200000-0000-4000-8000-000000000030',null) as cv2 \gset
update public.concepts set current_version_id=:'cv2' where id='11200000-0000-4000-8000-000000000030';
select public.append_question_version_snapshot('11200000-0000-4000-8000-000000000040',null) as qv2 \gset
update public.questions set current_version_id=:'qv2' where id='11200000-0000-4000-8000-000000000040';
set constraints all immediate;
select pg_temp.ok('Historical-only references prevent orphan classification',not public.m112_queue_orphan('11200000-0000-4000-8000-000000000100') and not exists(select 1 from public.content_media_placements));
select pg_temp.ok('Old snapshot retains alt/order',(select count(*)=10 from public.media_version_references));
select set_config('request.jwt.claim.sub','11200000-0000-4000-8000-000000000003',true);
set constraints all deferred;
insert into public.personal_topics(id,owner_id,name) values('11200000-0000-4000-8000-000000000050','11200000-0000-4000-8000-000000000003','Synthetic personal');
insert into public.personal_topic_official_placements(owner_id,personal_topic_id,library_node_id) values('11200000-0000-4000-8000-000000000003','11200000-0000-4000-8000-000000000050','11200000-0000-4000-8000-000000000020');
insert into public.personal_concepts(id,owner_id,topic_id,name) values('11200000-0000-4000-8000-000000000051','11200000-0000-4000-8000-000000000003','11200000-0000-4000-8000-000000000050','Synthetic personal Concept');
insert into public.personal_cards(id,owner_id,library_id,library_node_id,question,answer) values('11200000-0000-4000-8000-000000000052','11200000-0000-4000-8000-000000000003','11200000-0000-4000-8000-000000000010','11200000-0000-4000-8000-000000000020','Synthetic standalone','Synthetic');
insert into public.personal_cards(id,owner_id,concept_id,question,answer) values('11200000-0000-4000-8000-000000000053','11200000-0000-4000-8000-000000000003','11200000-0000-4000-8000-000000000051','Synthetic legacy','Synthetic');
select pg_temp.denied('Standalone Card attachment fails closed', $$insert into public.content_media_placements(asset_id,library_id,personal_card_id,surface,ordinal,alt_text) values('11200000-0000-4000-8000-000000000101','11200000-0000-4000-8000-000000000010','11200000-0000-4000-8000-000000000052','front',0,'Denied')$$,'target denied');
select pg_temp.denied('Legacy Card attachment fails closed', $$insert into public.content_media_placements(asset_id,library_id,personal_card_id,surface,ordinal,alt_text) values('11200000-0000-4000-8000-000000000101','11200000-0000-4000-8000-000000000010','11200000-0000-4000-8000-000000000053','answer',0,'Denied')$$,'target denied');
select pg_temp.denied('Personal Concept attachment fails closed', $$insert into public.content_media_placements(asset_id,library_id,personal_concept_id,surface,ordinal,alt_text) values('11200000-0000-4000-8000-000000000101','11200000-0000-4000-8000-000000000010','11200000-0000-4000-8000-000000000051','concept',0,'Owned diagram');$$,'target denied');
select set_config('request.jwt.claim.sub','11200000-0000-4000-8000-000000000004',true);
select pg_temp.denied('Other learner cannot bind owner asset', $$insert into public.content_media_placements(asset_id,library_id,personal_concept_id,surface,ordinal,alt_text) values('11200000-0000-4000-8000-000000000101','11200000-0000-4000-8000-000000000010','11200000-0000-4000-8000-000000000051','concept',1,'Attack')$$,'Authorized ready asset');
select set_config('request.jwt.claim.sub','11200000-0000-4000-8000-000000000003',true);
select public.reserve_media_upload('11200000-0000-4000-8000-000000000010','personal','11200000-0000-4000-8000-000000000201') as reserved \gset
select pg_temp.ok('Live upload lease blocks orphan',not public.m112_queue_orphan(:'reserved'));
-- Move fixture timestamps backward without changing asset identity to simulate elapsed wall time.
-- The upload-session identity guard protects created_at, so expiry is tested in a separate transaction harness.
select pg_temp.denied('Private object required before ready', $$update public.media_assets set state='ready',mime_type='image/png',byte_size=10,width=1,height=1,frame_count=1,sha256=repeat('a',64) where id='11200000-0000-4000-8000-000000000103'$$,'existing private Storage object');

-- No personal target, including a future Card target, can pass the binding predicate.
select pg_temp.ok('Personal Card attachment fails closed',not public.m112_target_allowed('11200000-0000-4000-8000-000000000010','11200000-0000-4000-8000-000000000003',null,null,null,'11200000-0000-4000-8000-000000000051'));
-- A privileged fixture can represent an expired lease; normal users cannot edit lease timestamps.
update public.media_upload_sessions set expires_at=created_at+interval '1 microsecond' where asset_id=:'reserved';
select pg_temp.denied('Expired reservation cannot be reused', $$select public.reserve_media_upload('11200000-0000-4000-8000-000000000010','personal','11200000-0000-4000-8000-000000000201')$$,'expired');
select pg_temp.ok('Expired pending upload begins grace',not public.m112_queue_orphan(:'reserved') and (select state='pending' from public.media_assets where id=:'reserved'));
update public.media_assets set unreferenced_since=clock_timestamp()-interval '25 hours' where id=:'reserved';
select pg_temp.ok('Expired pending upload becomes deletion job',public.m112_queue_orphan(:'reserved'));
select pg_temp.denied('Deleting asset cannot acquire new lease',format('insert into public.media_draft_leases(asset_id,actor_id,expires_at) values(%L,%L,clock_timestamp()+interval ''1 hour'')',:'reserved','11200000-0000-4000-8000-000000000003'),'lease denied');
update public.media_deletion_jobs set state='retry',attempts=attempts+1,last_error='Synthetic retry' where asset_id=:'reserved';
update public.media_assets set state='deleted' where id=:'reserved';
update public.media_deletion_jobs set state='complete',completed_at=clock_timestamp(),attempts=attempts+1,last_error=null where asset_id=:'reserved';
select pg_temp.ok('No-object expired reservation finalizes without replacement',(select state='deleted' and deleted_at is not null from public.media_assets where id=:'reserved'));
-- Exercise the existing approved deletion function, not a new delete authority.
select set_config('request.jwt.claim.sub','11200000-0000-4000-8000-000000000001',true);
set constraints all deferred;
select public.delete_development_content('question','11200000-0000-4000-8000-000000000040');
set constraints all immediate;
select pg_temp.ok('Permanent Question deletion closes its version media',not exists(select 1 from public.questions where id='11200000-0000-4000-8000-000000000040') and not exists(select 1 from public.media_version_references where question_version_id is not null));
select pg_temp.ok('Shared Concept history still protects asset',not public.m112_queue_orphan('11200000-0000-4000-8000-000000000100'));
set constraints all deferred;
select public.delete_development_content('concept','11200000-0000-4000-8000-000000000030');
set constraints all immediate;
select pg_temp.ok('Permanent Concept deletion closes all exclusive references',not exists(select 1 from public.concepts where id='11200000-0000-4000-8000-000000000030') and not exists(select 1 from public.media_version_references) and not exists(select 1 from public.content_media_placements));
select pg_temp.ok('Exclusive asset starts delayed cleanup after permanent closure',not public.m112_queue_orphan('11200000-0000-4000-8000-000000000100'));
update public.media_assets set unreferenced_since=clock_timestamp()-interval '25 hours' where id='11200000-0000-4000-8000-000000000100';
select pg_temp.ok('Exclusive asset queues after grace',public.m112_queue_orphan('11200000-0000-4000-8000-000000000100'));
set constraints all immediate;
select count(*) as passed_checks from media_checks;
rollback;
