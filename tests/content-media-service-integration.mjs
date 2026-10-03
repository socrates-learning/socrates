// Explicit opt-in; ordinary lifecycle validation only, never a remote backend.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { loadMediaModule, sampleImage } from './fixtures/content-media-images.mjs';
const url = process.env.MEDIA_DISPOSABLE_URL;
if (url !== 'http://127.0.0.1:56991' || process.env.MEDIA_DISPOSABLE_ACK !== 'media112-only') throw Error('Explicit isolated media112 environment required');
const key = process.env.MEDIA_DISPOSABLE_SERVICE_KEY;
const token = process.env.MEDIA_DISPOSABLE_ADMIN_TOKEN;
if (!key || !token) throw Error('Disposable credentials required');
const actualServer = loadMediaModule('lib/content-media/server.ts', { 'server-only': {}, '@/lib/supabase-server': {}, '@/lib/library-context': {} });
const client = Object.assign(createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }), { mediaWrites: actualServer.createMediaWrites(url, key) });
const auth = await client.auth.getUser(token);
assert.equal(auth.error, null); assert.equal(auth.data.user.id, '11200000-0000-4000-8000-000000000001');
const context = { actor: auth.data.user.id, library: '11200000-0000-4000-8000-000000000010' };
const rpc = async (db, name, args) => { const r = await db.rpc(name, args); if (r.error) throw Error(r.error.message); return r.data; };
const server = { rpc, MediaError: actualServer.MediaError, boundedBody: actualServer.boundedBody };
const service = loadMediaModule('lib/content-media/service.ts', { 'server-only': {}, './image': loadMediaModule('lib/content-media/image.ts'), './server': server });
const cleanup = loadMediaModule('lib/content-media/cleanup.ts', { 'server-only': {}, './server': server });
const absenceNonces = new Set();
const cleanupClient = { rpc: client.rpc.bind(client), storage: { from: bucket => {
 const store = client.storage.from(bucket);
 return { remove: store.remove.bind(store), download: (path, options, fetchOptions) => {
  assert.match(options?.cacheNonce, /^[0-9a-f-]{36}$/); assert.equal(fetchOptions?.cache, 'no-store');
  assert.ok(!absenceNonces.has(options.cacheNonce)); absenceNonces.add(options.cacheNonce);
  return store.download(path, options, fetchOptions);
 } };
} } };
const sql = text => execFileSync('docker', ['exec', '-i', 'socrates-media112-db', 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'media112', '-v', 'ON_ERROR_STOP=1'], { input: text, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
assert.equal(sql('select current_database();').trim(), 'media112');
const args = reservation => ({ p_actor: context.actor, p_library: context.library, p_reservation: reservation });
const reserve = () => rpc(client, 'm113_reserve', { p_actor: context.actor, p_library: context.library, p_kind: 'concept', p_target: '11200000-0000-4000-8000-000000000030', p_key: randomUUID() });
const cancel = reservation => rpc(client, 'm113_upload', { ...args(reservation), p_action: 'cancel' });
const input = await sampleImage();
const request = () => new Request(url, { method: 'PUT', body: input });
const assets = [], reservations = [];
const trace = [];
function observed({ before, after, stage, promote } = {}) {
 return {
  storage: client.storage,
  rpc: async (name, parameters) => {
   if (before) await before(name, parameters);
   const result = await client.rpc(name, parameters);
   if (after) await after(name, parameters, result);
   return result;
  },
  mediaWrites: {
   stage: async (...parameters) => { trace.push({ type: 'stage', path: parameters[0].object }); await client.mediaWrites.stage(...parameters); if (stage) await stage(); },
   promote: async (...parameters) => { trace.push({ type: 'promote', path: parameters[0].object }); await client.mediaWrites.promote(...parameters); if (promote) await promote(); },
  },
 };
}
// Interruption injection is at application call boundaries. No provider races or
// delayed/adversarial Storage requests are needed to characterize recovery.
for (const phase of ['stage-response', 'promotion-response', 'before-publication', 'publication-response']) {
 const r = await reserve(); reservations.push(r.reservationId);
 assert.ok(!Object.hasOwn(r, 'assetId'));
 let once = true;
 const interrupted = observed({
  stage: async () => { if (phase === 'stage-response' && once) { once = false; throw Error('Synthetic lost staging response'); } },
  promote: async () => { if (phase === 'promotion-response' && once) { once = false; throw Error('Synthetic lost promotion response'); } },
  before: async (_name, parameters) => { if (phase === 'before-publication' && parameters.p_action === 'publish' && once) { once = false; throw Error('Synthetic interruption before publication'); } },
  after: async (_name, parameters, result) => { if (phase === 'publication-response' && parameters.p_action === 'publish' && once) { assert.equal(result.error, null); once = false; throw Error('Synthetic lost publication response'); } },
 });
 const start = trace.length;
 await assert.rejects(service.uploadImage(interrupted, context, r.reservationId, request()), /Synthetic/);
 const writesBeforeRetry = trace.length;
 const recovered = await service.uploadImage(observed(), context, r.reservationId, request()); assets.push(recovered.assetId);
 assert.equal(recovered.ready, true);
 if (phase === 'publication-response') assert.equal(trace.length, writesBeforeRetry);
 else assert.ok(trace.length > writesBeforeRetry);
 const paths = trace.slice(start).map(x => x.path);
 assert.equal(new Set(paths).size, paths.length, 'A consumed attempt path must never be written twice');
 const beforeRepeat = trace.length;
 assert.equal((await service.uploadImage(observed(), context, r.reservationId, request())).assetId, recovered.assetId);
 assert.equal(trace.length, beforeRepeat);
 console.log('PASS application recovery:', phase);
}
for (const phase of ['claim', 'commit-bytes', 'dispatch-stage', 'stage-write', 'stage-verified', 'dispatch-promotion', 'copy-write']) {
 const r = await reserve(); reservations.push(r.reservationId); let cancelled = false;
 const stop = async () => { if (!cancelled) { cancelled = true; await cancel(r.reservationId); } };
 const cancelling = observed({
  after: async (_name, parameters, result) => { if (parameters.p_action === phase && !result.error) await stop(); },
  stage: async () => { if (phase === 'stage-write') await stop(); },
  promote: async () => { if (phase === 'copy-write') await stop(); },
 });
 await assert.rejects(service.uploadImage(cancelling, context, r.reservationId, request()));
 assert.equal(cancelled, true);
 assert.equal(sql(`select asset_id is null from public.media_service_operations where id='${r.reservationId}';`).trim(), 't');
 await assert.rejects(service.uploadImage(client, context, r.reservationId, request()));
 console.log('PASS cancellation:', phase);
}
// New independent operation succeeds after all failed/cancelled operations.
const reserved = await reserve(); reservations.push(reserved.reservationId);
const firstClaim = await rpc(client, 'm113_upload', { ...args(reserved.reservationId), p_action: 'claim' });
sql(`update public.media_service_operations set claim_expires_at=clock_timestamp()-interval '1 second' where id='${reserved.reservationId}';`);
const published = await service.uploadImage(observed(), context, reserved.reservationId, request());
assert.equal(published.ready, true);
await assert.rejects(rpc(client, 'm113_upload', { ...args(reserved.reservationId), p_action: 'commit-bytes', p_token: firstClaim.token, p_data: {} }));
assert.equal((await service.uploadImage(client, context, reserved.reservationId, request())).assetId, published.assetId);
await assert.rejects(service.uploadImage(client, context, reserved.reservationId, new Request(url, { method: 'PUT', body: await sampleImage('jpeg') })));
const stored = await client.storage.from('socrates-content-media').download(`${context.library}/${published.assetId}`);
assert.equal(stored.error, null);
const digest = createHash('sha256').update(Buffer.from(await stored.data.arrayBuffer())).digest('hex');
assert.match(digest, /^[0-9a-f]{64}$/);
await assert.rejects(rpc(client, 'm113_delivery', { p_actor: context.actor, p_library: context.library, p_reference: published.assetId }));
const conceptFigure = randomUUID(); const concept = randomUUID(); const question = randomUUID(); const front = randomUUID(); const answer = randomUUID();
sql(`begin;
select set_config('request.jwt.claim.sub','${context.actor}',true);
insert into public.concepts(id,name,status,body_markdown) values('${concept}','Media113 disposable delivery','published','Synthetic');
insert into public.concept_placements(concept_id,library_node_id) values('${concept}','11200000-0000-4000-8000-000000000020');
insert into public.questions(id,concept_id,question_type,prompt,status) values('${question}','${concept}','short_answer','Synthetic image delivery','draft');
insert into public.question_accepted_answers(question_id,answer_text,sort_order) values('${question}','Synthetic answer',0);
update public.questions set status='published' where id='${question}';
do $$ declare v uuid; begin
v:=public.append_question_version_snapshot('${question}',null);
update public.questions set current_version_id=v where id='${question}';
insert into public.content_media_placements(id,asset_id,library_id,question_id,surface,ordinal,alt_text) values
('${front}','${published.assetId}','${context.library}','${question}','front',0,'Synthetic front'),
('${answer}','${published.assetId}','${context.library}','${question}','answer',0,'Synthetic answer');
insert into public.media_version_references(asset_id,library_id,placement_id,question_version_id,surface,ordinal,alt_text)
select asset_id,library_id,id,v,surface,ordinal,alt_text from public.content_media_placements where question_id='${question}';
end $$;
do $$ declare v uuid; begin
v:=public.append_concept_version_snapshot('${concept}',null);
update public.concepts set current_version_id=v where id='${concept}';
insert into public.content_media_placements(id,asset_id,library_id,concept_id,surface,ordinal,alt_text) values('${conceptFigure}','${published.assetId}','${context.library}','${concept}','concept',0,'Synthetic Concept figure');
insert into public.media_version_references(asset_id,library_id,placement_id,concept_version_id,surface,ordinal,alt_text)
select asset_id,library_id,id,v,surface,ordinal,alt_text from public.content_media_placements where concept_id='${concept}';
end $$;commit;`);
for (const actor of [context.actor, '11200000-0000-4000-8000-000000000002', '11200000-0000-4000-8000-000000000003']) {
 for (const reference of [conceptFigure, front, answer]) assert.equal((await service.deliverImage(client, { ...context, actor }, reference)).bytes.length, stored.data.size);
}
await assert.rejects(service.deliverImage(client, { ...context, library: '11200000-0000-4000-8000-000000000011' }, front));
await assert.rejects(service.deliverImage(client, { ...context, actor: null }, front));
const historical = sql(`select id from public.media_version_references where placement_id='${front}';`).trim();
await assert.rejects(service.deliverImage(client, context, historical));
await rpc(client, 'm113_upload', { p_actor: context.actor, p_library: context.library, p_reservation: reserved.reservationId, p_action: 'cancel' });
sql(`update public.media_assets set unreferenced_since=clock_timestamp()-interval '25 hours' where id='${published.assetId}';`);
assert.equal((await cleanup.deleteOrphan(client, published.assetId)).deleted, false);
assert.equal((await service.deliverImage(client, context, answer)).bytes.length, stored.data.size);
sql(`begin;select set_config('request.jwt.claim.sub','${context.actor}',true);select public.delete_development_content('concept','${concept}');commit;`);
assert.equal(sql(`select count(*) from public.content_media_placements where id in ('${front}','${answer}');`).trim(), '0');
assert.equal(sql(`select count(*) from public.media_version_references where asset_id='${published.assetId}';`).trim(), '0');
await assert.rejects(service.deliverImage(client, context, front));

assert.equal((await cleanup.deleteOrphan(client, published.assetId)).deleted, false);
await rpc(client, 'm113_upload', { p_actor: context.actor, p_library: context.library, p_reservation: reserved.reservationId, p_action: 'cancel' });
// Only this positively identified disposable database is aged to exercise the 24-hour grace.
assert.match(published.assetId, /^[0-9a-f-]{36}$/);
execFileSync('docker', ['exec', '-i', 'socrates-media112-db', 'psql', '-X', '-U', 'postgres', '-d', 'media112', '-v', 'ON_ERROR_STOP=1'], { input: `update public.media_assets set unreferenced_since=clock_timestamp()-interval '25 hours' where id='${published.assetId}';`, stdio: ['pipe', 'pipe', 'pipe'] });
const failedDelete = { rpc: client.rpc.bind(client), storage: { from: bucket => ({ remove: async paths => { await client.storage.from(bucket).remove(paths); return { error: new Error('Synthetic lost Storage deletion response') }; } }) } };
await assert.rejects(cleanup.deleteOrphan(failedDelete, published.assetId));
assert.equal(sql(`select state from public.media_deletion_jobs where asset_id='${published.assetId}';`).trim(), 'retry');
assert.equal((await cleanup.deleteOrphan(cleanupClient, published.assetId)).deleted, true);
const absent = await client.storage.from('socrates-content-media').download(`${context.library}/${published.assetId}`);
assert.ok(absent.error);

const beforeTerminal = trace.length;
const terminal = await service.uploadImage(observed(), context, reserved.reservationId, request());
assert.equal(terminal.assetId, published.assetId); assert.equal(terminal.terminal, true); assert.equal(terminal.ready, false); assert.equal(terminal.state, 'deleted');
assert.equal(trace.length, beforeTerminal);
for (const reservation of reservations) await cancel(reservation);
for (const asset of assets) {
 assert.match(asset, /^[0-9a-f-]{36}$/);
 assert.equal((await cleanup.deleteOrphan(client, asset)).deleted, false);
 sql(`update public.media_assets set unreferenced_since=clock_timestamp()-interval '25 hours' where id='${asset}';`);
 assert.equal((await cleanup.deleteOrphan(cleanupClient, asset)).deleted, true);
}
const temporaryIds = JSON.parse(sql(`select coalesce(json_agg(id),'[]') from public.media_service_operations where parent_id in (${reservations.map(id => `'${id}'`).join(',')}) and asset_id is null;`));
let unresolved = 0, closed = 0;
const settled = sql(`select id from media_service_operations where id in (${temporaryIds.map(id => `'${id}'`).join(',')}) and confirmed_at is not null limit 1;`).trim();
assert.ok(settled);
const cachedRead = { rpc: client.rpc.bind(client), storage: { from: bucket => ({ remove: paths => client.storage.from(bucket).remove(paths), download: async () => ({ data: new Blob(['cached successful bytes']), error: null }) }) } };
await assert.rejects(cleanup.cleanTemporary(cachedRead, settled), /absence not confirmed/);
assert.equal(sql(`select cleanup_state from media_service_operations where id='${settled}';`).trim(), 'retry');
// Advance only this test's disposable retry deadline; never a hosted or pre-existing operation.
sql(`update media_service_operations set cleanup_after=clock_timestamp() where id='${settled}';`);
assert.equal((await cleanup.cleanTemporary(cleanupClient, settled)).cleaned, true);
assert.equal(sql(`select cleanup_attempts from media_service_operations where id='${settled}';`).trim(), '2');
for (const id of temporaryIds) {
 await assert.rejects(rpc(client, 'm113_delivery', { p_actor: context.actor, p_library: context.library, p_reference: id }));
 if (id === settled) { closed++; continue; }
 const result = await cleanup.cleanTemporary(cleanupClient, id);
 if (result.unresolved) unresolved++;
 if (result.cleaned) closed++;
 assert.equal(result.observedAbsent, true);
}
assert.ok(unresolved > 0); assert.ok(closed > 0);
assert.ok(absenceNonces.size > 2);
const paths = trace.map(x => x.path);
assert.equal(new Set(paths).size, paths.length);
for (const path of paths) {
 const result = await client.storage.from('socrates-content-media').download(path);
 assert.equal(String(result.error?.statusCode), '404');
}
console.log(JSON.stringify({ result: 'PASS', reservations: reservations.length, publishedAssetsDeleted: assets.length + 1, uniqueWrites: paths.length, temporaryObservedAbsent: temporaryIds.length, temporaryClosed: closed, temporaryUnresolved: unresolved }));
console.log('PASS Auth, lifecycle, immutable retry, lease/shared/version protection, delivery, durable deletion and temporary maintenance; uncertain outcomes retain tombstones');
