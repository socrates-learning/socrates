// Isolated recovery proof. Never accepts a hosted connection or Production DB.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const db=process.argv[2],dir=process.argv[3];
assert.match(db||'',/^legacy_personal137_run_[a-z0-9]+$/);assert.ok(dir?.startsWith('/'));
const container='socrates-admin-card135-recovery-20261020';
const info=JSON.parse(execFileSync('docker',['inspect',container]))[0];
assert.equal(info.HostConfig.NetworkMode,'none');assert.equal(Object.keys(info.NetworkSettings.Ports||{}).length,0);
const sql=(s,database=db)=>execFileSync('docker',['exec','-i',container,'psql','-X','-qAt','-h','/tmp','-U','supabase_admin','-d',database,'-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8',maxBuffer:16*1024*1024}).trim();
assert.equal(sql("select count(*) from auth.users where email !~ '@(example|preview)\\.invalid$'"),'0');
const quote=s=>"'"+s.replaceAll("'","''")+"'";
const sha=b=>createHash('sha256').update(b).digest('hex');
// Local Storage adapter: actual synthetic PNG bytes, isolated metadata and refs.
// This exercises archive recovery, not hosted Storage HTTP availability.
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN9sAAAAASUVORK5CYII=','base64');
let helpers=readFileSync(root+'/tests/personal-card-media-db.sql','utf8').split('create function pg_temp.storage_fixture')[1].split('create temp table media_fixture')[0];
helpers='create function pg_temp.storage_fixture'+helpers;
helpers=helpers.replaceAll("repeat('1',64)",quote(sha(png))).replaceAll("repeat('2',64)",quote(sha(png))).replace("'size',100,'width',10,'height',10",`'size',${png.length},'width',1,'height',1`).replace('"size":100',`"size":${png.length}`);
const media=sql(`begin;
insert into storage.buckets(id,name,public) values('socrates-content-media','socrates-content-media',false) on conflict(id) do nothing;
${helpers}
create temp table recovery_media(card uuid,asset uuid,reference uuid,actor uuid,library uuid);
do $$declare c record;a uuid;r uuid:=gen_random_uuid();revision timestamptz;begin
 select pc.id,pc.owner_id,pc.question,pc.answer,pc.source_reference,l.library_id into c from public.personal_cards pc join public.user_roles ur on ur.user_id=pc.owner_id and ur.role='learner' join public.user_libraries l on l.user_id=pc.owner_id where pc.concept_id is null and pc.personal_topic_id is not null order by pc.id limit 1;
 a:=pg_temp.upload(c.owner_id,c.library_id,c.id);
 revision:=(public.m136_manifest(c.owner_id,c.library_id,c.id)->>'revision')::timestamptz;
 perform public.m136_save(c.owner_id,c.library_id,c.id,revision,gen_random_uuid(),jsonb_build_object('front',c.question,'back',c.answer,'sourceReference',c.source_reference,'images',jsonb_build_array(jsonb_build_object('id',r,'assetId',a,'side','front','description','Synthetic recovery image'))));
 insert into recovery_media values(c.id,a,r,c.owner_id,c.library_id);
end$$;
select jsonb_build_object('card',m.card,'actor',m.actor,'library',m.library,'reference',m.reference,'bucket',a.bucket_id,'name',a.object_name) from recovery_media m join public.media_assets a on a.id=m.asset;
commit;`);
const identity=JSON.parse(media);
assert.equal(sql('select count(*) from storage.objects'),'1','Every Storage object must have recovery bytes');
const fingerprint=database=>JSON.parse(sql(`do $$begin end$$;
create or replace function pg_temp.recovery_fingerprint() returns jsonb language plpgsql as $$declare t record;v jsonb;r jsonb:='{}';begin
for t in select schemaname,tablename from pg_tables where schemaname in('public','auth','storage','private') order by 1,2 loop
execute format('select jsonb_build_object(''count'',count(*),''hash'',md5(coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),''[]'')::text)) from %I.%I x',t.schemaname,t.tablename) into v;r:=r||jsonb_build_object(t.schemaname||'.'||t.tablename,v);end loop;return r;end$$;
select pg_temp.recovery_fingerprint();`,database));
const before=fingerprint(db);
const dump=execFileSync('docker',['exec',container,'pg_dump','-h','/tmp','-U','supabase_admin','-d',db,'-Fc','--no-publications','--no-subscriptions'],{maxBuffer:128*1024*1024});
const payload=Buffer.from(JSON.stringify({dump:dump.toString('base64'),fingerprints:before,objects:[{...identity,data:png.toString('base64'),sha256:sha(png)}]}));
const key=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
const encrypted=Buffer.concat([iv,cipher.update(payload),cipher.final(),cipher.getAuthTag()]);
mkdirSync(dir,{recursive:true,mode:0o700});
writeFileSync(dir+'/synthetic-recovery.aes256gcm',encrypted,{mode:0o600,flag:'wx'});writeFileSync(dir+'/synthetic-recovery.key',key,{mode:0o600,flag:'wx'});
function decrypt(bytes){const d=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));d.setAuthTag(bytes.subarray(-16));return Buffer.concat([d.update(bytes.subarray(12,-16)),d.final()]);}
const damaged=Buffer.from(encrypted);damaged[30]^=1;assert.throws(()=>decrypt(damaged));
const recovered=JSON.parse(decrypt(readFileSync(dir+'/synthetic-recovery.aes256gcm')));
const restore=db+'_recovery';
assert.equal(sql(`select count(*) from pg_database where datname=${quote(restore)}`,'postgres'),'0');
execFileSync('docker',['exec',container,'createdb','-h','/tmp','-U','supabase_admin','-O','postgres',restore]);
execFileSync('docker',['exec','-i',container,'pg_restore','-h','/tmp','-U','supabase_admin','-d',restore,'--exit-on-error'],{input:Buffer.from(recovered.dump,'base64'),maxBuffer:16*1024*1024});
assert.deepEqual(fingerprint(restore),before);
for(const object of recovered.objects){
 const path=resolve(dir,'restored-storage',object.bucket,object.name);assert.ok(path.startsWith(resolve(dir,'restored-storage')+'/'));
 const bytes=Buffer.from(object.data,'base64');assert.equal(sha(bytes),object.sha256);mkdirSync(dirname(path),{recursive:true,mode:0o700});writeFileSync(path,bytes,{mode:0o600,flag:'wx'});assert.equal(sha(readFileSync(path)),object.sha256);
 const delivery=JSON.parse(sql(`select public.m136_delivery(${quote(object.actor)},${quote(object.library)},${quote(object.card)},${quote(object.reference)})`,restore));assert.ok(delivery.assetId);
}
sql(readFileSync(root+'/supabase/verify_137_retire_legacy_personal_creation.sql','utf8'),restore);
const report={isolated:true,databaseTables:Object.keys(before).length,storageObjects:recovered.objects.length,encryptedArchiveSha256:sha(encrypted),tamperRejected:true,databaseRowsAndFingerprintsIdentical:true,restoredPrivateImageAuthorization:true,productionAccess:false,storageAdapter:'Local bytes plus real database metadata; no hosted Storage HTTP service'};
writeFileSync(dir+'/recovery-result.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report,null,2));
