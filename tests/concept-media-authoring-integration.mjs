// Explicit opt-in ordinary application integration. No hosted targets, timing
// manipulation, provider investigation or writes to pre-existing fixtures.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { loadMediaModule, sampleImage } from './fixtures/content-media-images.mjs';
import { loadConceptModule, ids, conceptMedia, hookHarness, jsx } from './fixtures/concept-media-authoring.mjs';

const url = process.env.MEDIA_DISPOSABLE_URL;
if (url !== 'http://127.0.0.1:56991' || process.env.MEDIA_DISPOSABLE_ACK !== 'media112-only') throw Error('Explicit isolated media112 environment required');
const key = process.env.MEDIA_DISPOSABLE_SERVICE_KEY, token = process.env.MEDIA_DISPOSABLE_ADMIN_TOKEN;
if (!key || !token) throw Error('Disposable credentials required');
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const auth = await db.auth.getUser(token);
assert.equal(auth.error, null); assert.equal(auth.data.user.id, ids.admin);
const actor = { actor: ids.admin, library: ids.library };
const caller = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
const actualServer = loadMediaModule('lib/content-media/server.ts', { 'server-only': {}, '@/lib/supabase-server': {}, '@/lib/library-context': {} });
const client = Object.assign(db, { mediaWrites: actualServer.createMediaWrites(url, key) });
const sql = statement => execFileSync('docker', ['exec', '-i', 'socrates-media112-db', 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'media112', '-v', 'ON_ERROR_STOP=1'], { input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
assert.equal(sql('select current_database();'), 'media112');
assert.equal(sql("select bool_and(email like '%@example.test') from auth.users;"), 't');
const rpc = async (db, name, args) => { const r = await db.rpc(name, args); if (r.error) throw Error(r.error.message); return r.data; };
const image = loadMediaModule('lib/content-media/image.ts');
const server = { ...actualServer, rpc };
const service = loadConceptModule('lib/content-media/concept-authoring.ts', { 'server-only': {}, 'node:crypto': { createHash }, '@/lib/supabase-server': { createSupabaseServerClient: async () => caller }, './image': image, './server': server });
const existing = loadMediaModule('lib/content-media/service.ts', { 'server-only': {}, './image': image, './server': server });
const cleanup = loadMediaModule('lib/content-media/cleanup.ts', { 'server-only': {}, './server': server });
const evidence = { database: 'media112', library: ids.library, draft: randomUUID(), assets: [], reservations: [], checks: [], gracePending: [] };
const record = name => { evidence.checks.push(name); console.log('PASS', name); };
const snapshot = () => sql("select jsonb_build_object('users',(select count(*) from auth.users),'concepts',(select count(*) from concepts),'versions',(select count(*) from concept_versions),'objects',(select jsonb_agg(name order by name) from storage.objects));");
const before = JSON.parse(snapshot());
let concept, version;
async function controllerRecovery() {
  let savedConcept = null, manifest = null;
  const owned = [];
  try {
    for (const editing of [false, true]) {
      const hooks = hookHarness(), requests = [];
      let draftId = null;
      const props = { libraryId: ids.library, conceptId: savedConcept, enabled: true, source: manifest?.bodyMarkdown || '# ZZ LIFECYCLE RECOVERY', baseSource: manifest?.bodyMarkdown || '', initialVersionId: manifest?.versionId || null };
      props.onSource = value => { props.source = value; };
      const authoring = loadConceptModule('components/creator/ConceptImageAuthoring.tsx', { react: hooks.hooks, 'react/jsx-runtime': jsx, '@/lib/concept-media': conceptMedia, '@/components/ConceptMediaContent': {}, '@/components/ConceptMedia.module.css': {} }, { crypto: { randomUUID }, fetch: async (path, init = {}) => {
        const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
        const reservation = path.split('?')[0].split('/').at(-1);
        requests.push({ method: init.method, action: body?.action, reservation });
        try {
          let result;
          if (body?.action === 'create') {
            draftId = body.draftId; result = await rpc(client, 'm114_draft', { p_actor: ids.admin, p_library: ids.library, p_draft: draftId, p_action: 'create' });
          } else if (body?.action === 'reserve' || path === '/api/content-media/reservations') {
            result = await rpc(client, editing ? 'm113_reserve' : 'm114_reserve', { p_actor: ids.admin, p_library: ids.library, p_key: body.idempotencyKey, ...(editing ? { p_kind: 'concept', p_target: savedConcept } : { p_draft: draftId }) });
            owned.push({ id: result.reservationId, rpc: editing ? 'm113_upload' : 'm114_upload' });
          } else if (init.method === 'PUT') {
            result = await (editing ? existing.uploadImage : service.uploadConceptDraft)(client, actor, reservation, new Request(url, { method: 'PUT', body: init.body, signal: init.signal })); evidence.assets.push(result.assetId);
          } else if (init.method === 'DELETE') result = await rpc(client, editing ? 'm113_upload' : 'm114_upload', { p_actor: ids.admin, p_library: ids.library, p_reservation: reservation, p_action: 'cancel' });
          else if (path.includes('metadata=1')) result = (await service.conceptPreview(client, actor, savedConcept, draftId, reservation, true)).metadata;
          else if (body?.action === 'save') result = await service.saveConceptImages(ids.library, savedConcept, draftId, body.versionId, body.payload);
          else result = await rpc(client, 'm114_manifest', { p_actor: ids.admin, p_library: ids.library, p_concept: savedConcept });
          return Response.json(result);
        } catch (error) { return Response.json({ error: error.message }, { status: error.status || 422 }); }
      } });
      const render = () => hooks.render(() => authoring.useConceptImageAuthoring(props));
      render(); hooks.effects();
      while (render().pending) await new Promise(resolve => setTimeout(resolve, 5));
      assert.equal(render().error, '');
      render().open(props.source.length, editing ? render().items[0] : undefined, editing);
      const start = owned.length;
      for (let i = 0; i < 2; i++) { await render().upload(new Blob(['malformed'])); assert.match(render().error, /format or limits rejected/); }
      assert.equal(requests.filter(r => r.method === 'DELETE').length, 0);
      await render().upload(new Blob([await sampleImage()])); render().changeMetadata('alt', 'ZZ recovered Concept image'); render().insert();
      const current = render().items[0];
      const payload = { p_concept_id: savedConcept, p_name: 'ZZ LIFECYCLE RECOVERY', p_body_markdown: props.source, p_active_library_id: ids.library, p_library_node_ids: [ids.topic], p_tag_ids: [], p_status: 'published', p_references: [], p_prerequisites: [] };
      if (!editing) {
        const unknown = await rpc(client, 'm114_reserve', { p_actor: ids.admin, p_library: ids.library, p_draft: draftId, p_key: randomUUID() });
        owned.push({ id: unknown.reservationId, rpc: 'm114_upload' });
        assert.ok((await render().save(payload)).error, 'Unknown unresolved reservation must still block first save');
        assert.equal(sql(`select state from media_service_operations where id='${unknown.reservationId}';`), 'pending');
        assert.ok(!requests.some(r => r.method === 'DELETE' && r.reservation === unknown.reservationId));
        await rpc(client, 'm114_upload', { p_actor: ids.admin, p_library: ids.library, p_reservation: unknown.reservationId, p_action: 'cancel' });
      }
      const saved = await render().save(payload); assert.equal(saved.error, null); savedConcept = saved.data.concept_id;
      for (const failure of owned.slice(start, start + 2)) assert.equal(sql(`select state from media_service_operations where id='${failure.id}';`), 'cancelled');
      const fresh = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const previous = manifest;
      manifest = await rpc(fresh, 'm114_manifest', { p_actor: ids.admin, p_library: ids.library, p_concept: savedConcept });
      assert.equal(manifest.bodyMarkdown, props.source); assert.equal(manifest.placements.length, 1); assert.equal(manifest.placements[0].assetId, current.assetId);
      assert.equal(manifest.placements[0].altText, 'ZZ recovered Concept image');
      if (previous) assert.equal(sql(`select asset_id from media_version_references where concept_version_id='${previous.versionId}';`), previous.placements[0].assetId);
      record(`${editing ? 'existing' : 'new'} real Concept controller: repeated malformed -> valid -> Insert -> confirmed obsolete cancellation -> Save -> fresh readback`);
    }
  } finally {
    for (const r of owned) await rpc(client, r.rpc, { p_actor: ids.admin, p_library: ids.library, p_reservation: r.id, p_action: 'cancel' });
    if (savedConcept) sql(`begin;select set_config('request.jwt.claim.sub','${ids.admin}',true);select public.delete_development_content('concept','${savedConcept}');commit;`);
    for (const r of owned) {
      const attempts = JSON.parse(sql(`select coalesce(jsonb_agg(id),'[]') from media_service_operations where parent_id='${r.id}' and operation_type='staging';`));
      for (const id of attempts) await cleanup.cleanTemporary(client, id);
    }
  }
}
try {
  const p = { p_actor: ids.admin, p_library: ids.library, p_draft: evidence.draft };
  await rpc(client, 'm114_draft', { ...p, p_action: 'create' });
  const reservation = await rpc(client, 'm114_reserve', { ...p, p_key: randomUUID() }); evidence.reservations.push(reservation.reservationId);
  assert.equal(JSON.parse(snapshot()).concepts, before.concepts);
  const input = await sampleImage();
  const request = bytes => new Request(url, { method: 'PUT', body: bytes });
  const published = await service.uploadConceptDraft(client, actor, reservation.reservationId, request(input)); evidence.assets.push(published.assetId);
  assert.equal(published.ready, true);
  const again = await service.uploadConceptDraft(client, actor, reservation.reservationId, request(input)); assert.equal(again.assetId, published.assetId);
  const preview = await service.conceptPreview(client, actor, null, evidence.draft, reservation.reservationId);
  assert.equal(createHash('sha256').update(preview.bytes).digest('hex'), preview.metadata.sha256);
  await assert.rejects(service.conceptPreview(client, { ...actor, actor: ids.editor }, null, evidence.draft, reservation.reservationId));
  await assert.rejects(service.conceptPreview(client, { ...actor, library: '11200000-0000-4000-8000-000000000011' }, null, evidence.draft, reservation.reservationId));
  await assert.rejects(rpc(client, 'm113_delivery', { p_actor: ids.admin, p_library: ids.library, p_reference: published.assetId }));
  record('normalized unpublished draft preview, identity retry, author/Library isolation and no published delivery');
  const placementId = randomUUID();
  const body = `# ZZ GATE4 IMAGE INTEGRATION\n\nSynthetic authoring fixture.\n\n${conceptMedia.conceptMediaToken(placementId)}\n\nFinal paragraph.`;
  const payload = { p_concept_id: null, p_name: 'ZZ GATE4 IMAGE INTEGRATION', p_body_markdown: body, p_active_library_id: ids.library, p_library_node_ids: [ids.topic], p_tag_ids: [], p_status: 'published', p_references: [{ client_id: randomUUID(), source_id: null, title: 'ZZ synthetic reference', author: 'Synthetic', url: '', note: '' }], p_prerequisites: [], placements: [{ placementId, assetId: published.assetId, ordinal: 0, altText: 'Synthetic first image', caption: 'Synthetic caption', reservationId: reservation.reservationId }] };
  const save = data => service.saveConceptImages(ids.library, null, evidence.draft, null, data);
  await assert.rejects(save({ ...payload, p_prerequisites: [{ target_type: 'concept', target_id: randomUUID(), strength: 'required' }] }));
  assert.equal(sql(`select count(*) from concepts where name='ZZ GATE4 IMAGE INTEGRATION';`), '0');
  assert.equal(sql(`select count(*) from content_media_placements where id='${placementId}';`), '0');
  const saved = await save(payload); concept = saved.concept_id; version = saved.version_id; evidence.concept = concept; evidence.firstVersion = version;
  assert.equal(sql(`select count(*) from concept_versions where concept_id='${concept}';`), '1');
  assert.equal(sql(`select count(*) from media_version_references where concept_version_id='${version}';`), '1');
  const retry = await save(payload); assert.equal(retry.concept_id, concept); assert.equal(retry.version_id, version); assert.deepEqual(retry.references, saved.references);
  assert.equal(retry.bodyMarkdown, body); assert.equal(retry.placements[0].altText, payload.placements[0].altText);
  await assert.rejects(save({ ...payload, p_name: 'Different consumed request' }));
  await assert.rejects(service.conceptPreview(client, actor, null, evidence.draft, reservation.reservationId));
  record('first-save atomic rollback, exactly one initial matching version, reference receipt and lost-response retry');
  const fresh = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const manifest = await rpc(fresh, 'm114_manifest', { p_actor: ids.admin, p_library: ids.library, p_concept: concept });
  assert.equal(manifest.bodyMarkdown, body); assert.equal(manifest.placements[0].placementId, placementId);
  assert.equal((await existing.deliverImage(client, { ...actor, actor: ids.learner }, placementId)).bytes.length, preview.bytes.length);
  record('fresh-client saved source/placement readback and authorized learner delivery');
  const secondReservation = await rpc(client, 'm113_reserve', { p_actor: ids.admin, p_library: ids.library, p_kind: 'concept', p_target: concept, p_key: randomUUID() }); evidence.reservations.push(secondReservation.reservationId);
  const replacement = await existing.uploadImage(client, actor, secondReservation.reservationId, request(await sampleImage('jpeg'))); evidence.assets.push(replacement.assetId);
  const existingPayload = { ...payload, p_concept_id: concept, p_references: payload.p_references.map((r, i) => ({ ...r, source_id: saved.references[i].source_id })), placements: [{ ...payload.placements[0], assetId: replacement.assetId, reservationId: secondReservation.reservationId, altText: 'Replacement image', caption: '' }] };
  const replaced = await service.saveConceptImages(ids.library, concept, null, version, existingPayload);
  assert.equal(replaced.placements[0].placementId, placementId); assert.equal(replaced.placements[0].assetId, replacement.assetId);
  assert.equal(sql(`select asset_id from media_version_references where concept_version_id='${version}';`), published.assetId);
  await assert.rejects(service.saveConceptImages(ids.library, concept, null, version, existingPayload));
  const removed = await service.saveConceptImages(ids.library, concept, null, replaced.version_id, { ...existingPayload, p_body_markdown: '# ZZ GATE4 IMAGE INTEGRATION\n\nImages removed.', placements: [] });
  assert.equal(removed.placements.length, 0); assert.equal(sql(`select count(*) from content_media_placements where concept_id='${concept}';`), '0');
  assert.equal(sql(`select count(*) from media_version_references where asset_id in ('${published.assetId}','${replacement.assetId}');`), '2');
  for (const asset of evidence.assets) assert.equal((await cleanup.deleteOrphan(client, asset)).deleted, false);
  record('existing replacement/removal preserves stable placement and immutable historical assets; stale version rejects');
  await rpc(client, 'm113_upload', { p_actor: ids.admin, p_library: ids.library, p_reservation: secondReservation.reservationId, p_action: 'cancel' });
  sql(`begin; select set_config('request.jwt.claim.sub','${ids.admin}',true); select public.delete_development_content('concept','${concept}'); commit;`);
  assert.equal(sql(`select count(*) from concepts where id='${concept}';`), '0');
  assert.equal(sql(`select count(*) from concept_versions where concept_id='${concept}';`), '0');
  assert.equal(sql(`select count(*) from media_version_references where asset_id in ('${published.assetId}','${replacement.assetId}');`), '0');
  await assert.rejects(save(payload), /permanently deleted/);
  record('permanent Concept/reference/version closure; first-save retry cannot recreate deleted content');
  const abandoned = randomUUID();
  await rpc(client, 'm114_draft', { ...p, p_draft: abandoned, p_action: 'create' });
  const unused = await rpc(client, 'm114_reserve', { ...p, p_draft: abandoned, p_key: randomUUID() });
  await rpc(client, 'm114_draft', { ...p, p_draft: abandoned, p_action: 'abandon' });
  await assert.rejects(service.uploadConceptDraft(client, actor, unused.reservationId, request(input)));
  record('abandoned unsaved draft cannot upload or create a Concept');
  await controllerRecovery();
} finally {
  for (let i = 0; i < evidence.reservations.length; i++) await rpc(client, i === 0 ? 'm114_upload' : 'm113_upload', { p_actor: ids.admin, p_library: ids.library, p_reservation: evidence.reservations[i], p_action: 'cancel' }).catch(() => undefined);
  // Respect real orphan grace. Record pending ordinary maintenance explicitly.
  for (const asset of evidence.assets) {
    await cleanup.deleteOrphan(client, asset);
    evidence.gracePending.push(JSON.parse(sql(`select row_to_json(x) from (select id,state,unreferenced_since,unreferenced_since+interval '24 hours' eligible_at from media_assets where id='${asset}') x;`)));
  }
  for (const reservation of evidence.reservations) {
    const attempts = JSON.parse(sql(`select coalesce(jsonb_agg(id),'[]') from media_service_operations where parent_id='${reservation}' and operation_type='staging';`));
    for (const id of attempts) await cleanup.cleanTemporary(client, id);
  }
  evidence.after = JSON.parse(snapshot()); evidence.before = before;
  if (process.env.MEDIA_DISPOSABLE_REPORT) writeFileSync(process.env.MEDIA_DISPOSABLE_REPORT, JSON.stringify(evidence, null, 2));
}
assert.equal(evidence.after.users, before.users);
for (const object of before.objects || []) assert.ok(evidence.after.objects.includes(object), 'Pre-existing Storage object preserved');
console.log('Gate 4 local lifecycle complete; newly orphaned assets retain real grace pending ordinary maintenance.');
