// Dedicated synthetic-only recovery proof. No Production configuration is read.
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createHash,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {state,login,json,upload,bytes,payload} from './personal-card-media-http.integration.mjs';
import {continueDeletion} from '../lib/account-deletion.ts';
import {reconcileDeletions} from '../lib/account-deletion-recovery.mjs';
const {assert,randomUUID,sharp,dir,keys,fixtures}=state,require=createRequire(new URL('../package.json', import.meta.url));
const {createClient}=require('@supabase/supabase-js');
const opts={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const api=createClient(state.backend,keys.service,opts),bucket='socrates-content-media';
const q=x=>"'"+String(x).replaceAll("'","''")+"'",sha=x=>createHash('sha256').update(x).digest('hex');
const sql=(s,db='card136')=>execFileSync('docker',['exec','-i','socrates-card136-db-resumed','psql','-XqAt','-h','/tmp','-U','supabase_admin','-d',db,'-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8'}).trim();
assert.ok(fixtures.users.every(u=>u.email.endsWith('@example.invalid')));
assert.equal(sql("select count(*) from auth.users where email not like '%@example.invalid'"),'0');
const owner=fixtures.users.find(u=>u.role_name==='other'),other=fixtures.users.find(u=>u.role_name==='learner');
const officialTables=['library_nodes','official_topic_locations','concepts','concept_versions','concept_placements','questions','question_versions','question_accepted_answers','sources','question_sources'];
function preservation(db='card136'){
 const rows=officialTables.map(t=>`select '${t}:'||md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'')) from public.${t} t;`);
 for(const [t,c]of [['personal_cards','owner_id'],['personal_topics','owner_id'],['personal_review_attempts','user_id'],['review_attempts','user_id'],['user_concept_mastery','user_id'],['study_decks','user_id']])rows.push(`select '${t}:'||md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'')) from public.${t} t where ${c}<>${q(owner.owner_id)};`);
 return sql(rows.join('\n'),db);
}
function allFingerprint(db){
 const tables=JSON.parse(sql("select json_agg(format('%I.%I',schemaname,tablename) order by schemaname,tablename) from pg_tables where schemaname in('public','socrates_private')",db));
 return Object.fromEntries(tables.map(t=>[t,sql(`select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'')) from ${t} t`,db)]));
}
const ledgerFile=dir+'/synthetic-independent-deletion-ledger.json';
async function recordIntent(id){
 assert.equal(id,owner.owner_id);
 if(fs.existsSync(ledgerFile)){assert.equal(JSON.parse(fs.readFileSync(ledgerFile)).account,id);return;}
 const fd=fs.openSync(ledgerFile,'wx',0o600);fs.writeFileSync(fd,JSON.stringify({account:id,confirmedAt:new Date().toISOString()}));fs.fsyncSync(fd);fs.closeSync(fd);
}
const service=client=>({
 async status(hash){const r=await client.rpc('account_deletion_status',{p_receipt_hash:hash});assert.equal(r.error,null);return r.data;},recordIntent,
 async remove(b,names){const r=await client.storage.from(b).remove(names);assert.equal(r.error,null);},
 async deleteIdentity(id){const r=await client.auth.admin.deleteUser(id,false);if(r.error)throw new Error(r.error.message);}
});
const phase=process.argv[2];
if(phase==='backup-delete'){
 assert.ok(!fs.existsSync(dir+'/recovery-state.json'),'Do not repeat destructive fixture setup');
 const session=await login('other'),card=owner.topic_card;
 const png=await sharp({create:{width:40,height:32,channels:3,background:'#162b40'}}).png().toBuffer();
 let image,m;
if(process.argv[3]!=='resume'){
image=await upload(session,card,png);m=await json(session,card);
 await json(session,card,{action:'save',revision:m.revision,idempotencyKey:randomUUID(),payload:payload(m.front,m.back,[image])});
 // Three concurrent real reservations across two Cards share an owner lock.
 const reservations=await Promise.all([card,owner.official_card,card].map(c=>session.request('/api/content-media/cards/'+c,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'reserve',idempotencyKey:randomUUID()})})));
 assert.deepEqual(reservations.map(r=>r.status).sort(),[200,200,429]);
 for(let i=0;i<reservations.length;i++)if(reservations[i].status===200){const r=await reservations[i].json();await session.request(`/api/content-media/cards/${[card,owner.official_card,card][i]}/drafts/${r.reservationId}`,{method:'DELETE'});}
 console.log('PASS: simultaneous reservations enforce the two-upload owner quota');
 // Actual Card deletion leaves Storage bytes queued, never synchronously erased.
 const cardImage=await upload(session,owner.official_card,png);m=await json(session,owner.official_card);
 await json(session,owner.official_card,{action:'save',revision:m.revision,idempotencyKey:randomUUID(),payload:payload(m.front,m.back,[cardImage])});
 const deletion=await session.client.from('personal_cards').delete().eq('id',owner.official_card).select();assert.equal(deletion.error,null);assert.equal(deletion.data.length,1);
 assert.equal(sql(`select count(*) from public.content_media_placements where personal_card_id=${q(owner.official_card)}`),'0');
 const retainedPath=sql(`select object_name from public.media_assets where id=${q(cardImage.assetId)}`);assert.equal((await api.storage.from(bucket).download(retainedPath)).error,null);
 console.log('PASS: Card deletion atomically unlinks its references and retains physical bytes for guarded cleanup');
 }else{m=await json(session,card);image=m.images[0];assert.ok(image);}
 // A separately owned official reference must survive private account deletion.
 const lib=fixtures.libraries.find(l=>l.kind==='allowed'),admin=fixtures.users.find(u=>u.role_name==='admin'),asset=randomUUID(),ref=randomUUID(),name=lib.id+'/'+asset;
 const concept=randomUUID(),version=randomUUID();
 sql(`select set_config('request.jwt.claim.sub',${q(admin.owner_id)},false);insert into public.media_assets(id,library_id,created_by,scope,object_name) values(${q(asset)},${q(lib.id)},${q(admin.owner_id)},'official',${q(name)});`);
 assert.equal((await api.storage.from(bucket).upload(name,png,{contentType:'image/png'})).error,null);
 sql(`begin;select set_config('request.jwt.claim.sub',${q(admin.owner_id)},true);update public.media_assets set state='ready',mime_type='image/png',byte_size=${png.length},width=40,height=32,frame_count=1,sha256=${q(sha(png))} where id=${q(asset)};insert into public.concepts(id,name,status,created_by) values(${q(concept)},'Synthetic recovery diagram','published',${q(admin.owner_id)});insert into public.concept_placements(concept_id,library_node_id) values(${q(concept)},${q(lib.root_id)});insert into public.content_media_placements(id,asset_id,library_id,concept_id,surface,ordinal,alt_text) values(${q(ref)},${q(asset)},${q(lib.id)},${q(concept)},'concept',0,'Synthetic preserved official diagram');insert into public.concept_versions(id,concept_id,version_number,name,body_markdown,created_by) values(${q(version)},${q(concept)},1,'Synthetic recovery diagram','Synthetic explanation',${q(admin.owner_id)});update public.concepts set current_version_id=${q(version)} where id=${q(concept)};commit;`);
 const before=preservation(),fingerprints=allFingerprint('card136');
 const objects=JSON.parse(sql("select coalesce(json_agg(json_build_object('bucket',bucket_id,'name',name,'mime',metadata->>'mimetype')),'[]') from storage.objects"));
 for(const object of objects){const r=await api.storage.from(object.bucket).download(object.name);assert.equal(r.error,null);const data=Buffer.from(await r.data.arrayBuffer());object.data=data.toString('base64');object.sha256=sha(data);}
 const dump=execFileSync('docker',['exec','socrates-card136-db-resumed','pg_dump','-h','/tmp','-U','supabase_admin','-d','card136','-Fc','--no-publications','--no-subscriptions'],{maxBuffer:128*1024*1024});
 const plaintext=Buffer.from(JSON.stringify({dump:dump.toString('base64'),objects,fingerprints})),key=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 const encrypted=Buffer.concat([iv,cipher.update(plaintext),cipher.final(),cipher.getAuthTag()]);
 fs.writeFileSync(dir+'/synthetic-recovery.aes256gcm',encrypted,{mode:0o600,flag:'wx'});fs.writeFileSync(dir+'/synthetic-recovery.key',key,{mode:0o600,flag:'wx'});
 const checkpoint={isolated:true,source:'card136-disposable',backupSha256:sha(encrypted),createdAt:new Date().toISOString()};
 fs.writeFileSync(dir+'/recovery-state.json',JSON.stringify({checkpoint,owner:owner.owner_id,other:other.owner_id,before,official:{bucket,name,sha256:sha(png)},objects:objects.length}),{mode:0o600,flag:'wx'});
 console.log('PASS: encrypted database and every Storage object captured with content hashes');
 const hash=sha(randomBytes(32));assert.equal((await api.rpc('begin_account_deletion',{p_user:owner.owner_id,p_receipt_hash:hash})).error,null);
 const s=service(api),pending=await s.status(hash);assert.ok(pending.objects.some(o=>o.name.endsWith(image.assetId)));
 assert.ok((await api.auth.admin.deleteUser(owner.owner_id,false)).error,'Auth must refuse premature deletion');
 await assert.rejects(continueDeletion({...s,recordIntent:async()=>{throw new Error('Synthetic ledger outage');}},hash));
 assert.equal((await api.storage.from(bucket).download(sql(`select object_name from public.media_assets where id=${q(image.assetId)}`))).error,null);
 await assert.rejects(continueDeletion({...s,remove:async()=>{throw new Error('Synthetic Storage outage');}},hash));
 assert.equal((await api.auth.admin.getUserById(owner.owner_id)).error,null);
 assert.equal((await session.request(`/api/content-media/cards/${card}/delivery/${image.id}`)).status,403);
 console.log('PASS: ledger and Storage failures keep Auth/data intact; pending deletion denies stale image access');
 sql(`create table public.card136_test_blocker(user_id uuid references auth.users(id) on delete restrict);insert into public.card136_test_blocker values(${q(owner.owner_id)});`);
 await assert.rejects(continueDeletion(s,hash));assert.equal((await s.status(hash)).state,'pending');
 assert.equal(sql(`select count(*) from public.personal_cards where id=${q(card)}`),'1');
 sql('drop table public.card136_test_blocker');await continueDeletion(s,hash);await continueDeletion(s,hash);
 assert.equal((await s.status(hash)).state,'complete');assert.ok((await api.auth.admin.getUserById(owner.owner_id)).error);
 assert.equal(sql(`select (select count(*) from public.media_assets where owner_id=${q(owner.owner_id)})+(select count(*) from public.personal_card_media_saves where owner_id=${q(owner.owner_id)})`),'0');
 assert.equal(preservation(),before);const official=await api.storage.from(bucket).download(name);assert.equal(sha(Buffer.from(await official.data.arrayBuffer())),sha(png));
 const learner=await login('learner'),main=await json(learner,other.topic_card);await bytes(learner,other.topic_card,main.images[0]);
 console.log('PASS: account deletion retries cleanly; Card receipts and private media removed; official and other learner content preserved');
}
if(phase==='restore'){
 const file=fs.readFileSync(dir+'/synthetic-recovery.aes256gcm'),saved=JSON.parse(fs.readFileSync(dir+'/recovery-state.json'));assert.equal(sha(file),saved.checkpoint.backupSha256);
 const decipher=createDecipheriv('aes-256-gcm',fs.readFileSync(dir+'/synthetic-recovery.key'),file.subarray(0,12));decipher.setAuthTag(file.subarray(-16));
 const recovered=JSON.parse(Buffer.concat([decipher.update(file.subarray(12,-16)),decipher.final()]));
 assert.equal(sql("select count(*) from pg_database where datname='card136_recovery'",'postgres'),'0');
 execFileSync('docker',['exec','socrates-card136-db-resumed','createdb','-h','/tmp','-U','supabase_admin','-O','postgres','card136_recovery']);
 execFileSync('docker',['exec','-i','socrates-card136-db-resumed','pg_restore','-h','/tmp','-U','supabase_admin','-d','card136_recovery','--exit-on-error'],{input:Buffer.from(recovered.dump,'base64'),maxBuffer:8*1024*1024});
 assert.deepEqual(allFingerprint('card136_recovery'),recovered.fingerprints);
 fs.writeFileSync(dir+'/recovery-objects.local.json',JSON.stringify(recovered.objects),{mode:0o600});
 console.log('PASS: encrypted archive authentication, full database restoration and all application table fingerprints');
}
if(phase==='reconcile'){
 const saved=JSON.parse(fs.readFileSync(dir+'/recovery-state.json')),client=createClient('http://127.0.0.1:59946',keys.service,opts),objects=JSON.parse(fs.readFileSync(dir+'/recovery-objects.local.json'));
 if(process.argv[3]!=='resume')for(const o of objects){const b=Buffer.from(o.data,'base64');assert.equal(sha(b),o.sha256);assert.equal((await client.storage.from(o.bucket).upload(o.name,b,{contentType:o.mime||'image/png',upsert:true})).error,null);const r=await client.storage.from(o.bucket).download(o.name);assert.equal(r.error,null);assert.equal(sha(Buffer.from(await r.data.arrayBuffer())),o.sha256);}
 console.log('PASS: every restored Storage object is downloadable with its original content hash');
 const snapshot=async()=>{const b=fs.readFileSync(ledgerFile);return{source:'card136-disposable',digest:sha(b),records:[JSON.parse(b)]};};
 const target={
 async blockAccess(){fs.writeFileSync(dir+'/recovery-BLOCKED.json',JSON.stringify({isolated:true,ingress:'loopback only; no application server'}));},
 async preservationFingerprint(){return preservation('card136_recovery');},
 async reapply(id){assert.equal(id,saved.owner);const hash=sha(randomBytes(32));assert.equal((await client.rpc('begin_account_deletion',{p_user:id,p_receipt_hash:hash})).error,null);await continueDeletion(service(client),hash);},
 async verifyAbsent(id){assert.equal(sql(`select count(*) from auth.users where id=${q(id)}`,'card136_recovery'),'0');assert.equal(sql(`select count(*) from public.personal_card_media_saves where owner_id=${q(id)}`,'card136_recovery'),'0');},
 async identity(){return 'isolated card136_recovery';},
 async hasActiveAdministrator(){return sql("select exists(select 1 from public.user_roles r join public.account_deletion_state s on s.user_id=r.user_id where r.role='admin' and s.state='active')",'card136_recovery')==='t';},
 async writeReadiness(report){fs.writeFileSync(dir+'/recovery-READY.json',JSON.stringify(report,null,2));}
 };
 const report=await reconcileDeletions({ledger:{snapshot},target,checkpoint:saved.checkpoint});assert.equal(report.reconciled,1);assert.equal(report.state,'verified-isolated');assert.equal(preservation('card136_recovery'),saved.before);
 const official=await client.storage.from(saved.official.bucket).download(saved.official.name);assert.equal(official.error,null);assert.equal(sha(Buffer.from(await official.data.arrayBuffer())),saved.official.sha256);
 for(const o of objects){if(sql(`select count(*) from storage.objects where bucket_id=${q(o.bucket)} and name=${q(o.name)}`,'card136_recovery')==='1'){const r=await client.storage.from(o.bucket).download(o.name);assert.equal(r.error,null);assert.equal(sha(Buffer.from(await r.data.arrayBuffer())),o.sha256);}}
 console.log('PASS: independent durable deletion intent replayed after restore; deleted account stays absent; remaining media and educational data preserved');
 console.log('LIMIT: independent ledger uses a local durable fixture adapter; hosted ledger provider and Production were not accessed.');
}
