// Explicit disposable application lifecycle only; never hosted/Production or provider probing.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { loadMediaModule, sampleImage } from './fixtures/content-media-images.mjs';
import { loadQuestionModule, ids, hookHarness, jsx, questionMedia } from './fixtures/question-media-authoring.mjs';
const url = process.env.MEDIA_DISPOSABLE_URL;
if (url !== 'http://127.0.0.1:56991' || process.env.MEDIA_DISPOSABLE_ACK !== 'media112-only') throw Error('Explicit isolated media112 environment required');
const key = process.env.MEDIA_DISPOSABLE_SERVICE_KEY, token = process.env.MEDIA_DISPOSABLE_ADMIN_TOKEN;
if (!key || !token) throw Error('Disposable credentials required');
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const user = await db.auth.getUser(token); assert.equal(user.error, null); assert.equal(user.data.user.id, ids.admin);
const caller = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
const actual = loadMediaModule('lib/content-media/server.ts', { 'server-only': {}, '@/lib/supabase-server': {}, '@/lib/library-context': {} });
const client = Object.assign(db, { mediaWrites: actual.createMediaWrites(url, key) });
const sql = statement => execFileSync('docker', ['exec', '-i', 'socrates-media112-db', 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'media112', '-v', 'ON_ERROR_STOP=1'], { input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
assert.equal(sql('select current_database();'), 'media112'); assert.equal(sql("select bool_and(email like '%@example.test') from auth.users;"), 't');
const rpc = async (client, name, args) => { const result = await client.rpc(name, args); if (result.error) throw Error(result.error.message); return result.data; };
const image = loadMediaModule('lib/content-media/image.ts');
const server = { ...actual, rpc };
const service = loadQuestionModule('lib/content-media/question-authoring.ts', { 'server-only': {}, 'node:crypto': { createHash }, '@/lib/supabase-server': { createSupabaseServerClient: async () => caller }, './image': image, './server': server });
const delivery = loadMediaModule('lib/content-media/service.ts', { 'server-only': {}, './image': image, './server': server });
const cleanup = loadMediaModule('lib/content-media/cleanup.ts', { 'server-only': {}, './server': server });
const evidence = { checks: [], assets: [], reservations: [], drafts: [], pendingGrace: [] };
const record = name => { evidence.checks.push(name); console.log('PASS', name); };
const actor = { actor: ids.admin, library: ids.library, question: null };
const snapshot = () => JSON.parse(sql("select jsonb_build_object('users',(select count(*) from auth.users),'questions',(select count(*) from questions),'versions',(select count(*) from question_versions),'objects',(select jsonb_agg(name order by name) from storage.objects),'gate4',(select jsonb_agg(row_to_json(c) order by c.id) from concepts c));"));
const before = snapshot(); let target = null;
async function draft(question = null, version = null) {
  const id = randomUUID(); evidence.drafts.push({ id, question, version });
  await rpc(client, 'm115_draft', { p_actor: ids.admin, p_library: ids.library, p_draft: id, p_question: question, p_expected_version: version, p_action: 'create' }); return id;
}
async function upload(draftId, question = null, format = 'png') {
  const reservation = await rpc(client, 'm115_reserve', { p_actor: ids.admin, p_library: ids.library, p_draft: draftId, p_question: question, p_key: randomUUID() }); evidence.reservations.push({ id: reservation.reservationId, question });
  const bytes = await sampleImage(format), request = () => new Request(url, { method: 'PUT', body: bytes });
  const result = await service.uploadQuestionDraft(client, { ...actor, question }, reservation.reservationId, request()); evidence.assets.push(result.assetId);
  const retry = await service.uploadQuestionDraft(client, { ...actor, question }, reservation.reservationId, request()); assert.equal(retry.assetId, result.assetId);
  const preview = await service.questionPreview(client, { ...actor, question }, question, draftId, reservation.reservationId);
  assert.equal(createHash('sha256').update(preview.bytes).digest('hex'), preview.metadata.sha256);
  await assert.rejects(service.questionPreview(client, { ...actor, actor: ids.editor, question }, question, draftId, reservation.reservationId));
  await assert.rejects(service.questionPreview(client, { ...actor, library: '11200000-0000-4000-8000-000000000011', question }, question, draftId, reservation.reservationId));
  return { ...preview.metadata, placementId: randomUUID(), reservationId: reservation.reservationId, altText: 'ZZ GATE5 synthetic image', caption: 'Synthetic image only', ordinal: 0, surface: 'front' };
}
async function controllerRecovery(basePayload) {
  let question = null, manifest = null;
  try {
    for (const editing of [false, true]) {
      const hooks = hookHarness(), requests = [], owned = [];
      let draftId = null;
      const hint = manifest ? { libraryId: ids.library, questionId: question, versionId: manifest.versionId, front: true, answer: true } : null;
      const props = { libraryId: ids.library, questionId: question, enabled: true, hint, basePrompt: manifest?.prompt || '', baseAnswer: manifest?.answer || '' };
      const authoring = loadQuestionModule('components/creator/QuestionImageAuthoring.tsx', { react: hooks.hooks, 'react/jsx-runtime': jsx, '@/components/VerifiedMediaImage': {}, '@/lib/question-media': questionMedia, '@/components/ConceptMedia.module.css': {} }, { crypto: { randomUUID }, fetch: async (path, init = {}) => {
        const body = typeof init.body === 'string' ? JSON.parse(init.body) : null, reservation = path.split('?')[0].split('/').at(-1);
        requests.push({ method: init.method, action: body?.action, reservation });
        try {
          let result;
          if (body?.action === 'create') {
            draftId = body.draftId; evidence.drafts.push({ id: draftId, question, version: body.versionId });
            result = await rpc(client, 'm115_draft', { p_actor: ids.admin, p_library: ids.library, p_draft: draftId, p_question: question, p_expected_version: body.versionId, p_action: 'create' });
          } else if (body?.action === 'reserve') {
            result = await rpc(client, 'm115_reserve', { p_actor: ids.admin, p_library: ids.library, p_draft: draftId, p_question: question, p_key: body.idempotencyKey });
            owned.push(result.reservationId); evidence.reservations.push({ id: result.reservationId, question });
          } else if (init.method === 'PUT') {
            result = await service.uploadQuestionDraft(client, { ...actor, question }, reservation, new Request(url, { method: 'PUT', body: init.body, signal: init.signal })); evidence.assets.push(result.assetId);
          } else if (init.method === 'DELETE') result = await rpc(client, 'm115_upload', { p_actor: ids.admin, p_library: ids.library, p_question: question, p_reservation: reservation, p_action: 'cancel' });
          else if (path.includes('metadata=1')) result = (await service.questionPreview(client, { ...actor, question }, question, draftId, reservation, true)).metadata;
          else if (body?.action === 'save') result = await service.saveQuestionImages(ids.library, question, draftId, body.versionId, body.payload);
          else result = await rpc(client, 'm115_manifest', { p_actor: ids.admin, p_library: ids.library, p_question: question });
          return Response.json(result);
        } catch (error) { return Response.json({ error: error.message }, { status: error.status || 422 }); }
      } });
      const render = () => hooks.render(() => authoring.useQuestionImageAuthoring(props)); render(); hooks.effects();
      while (render().pending) await new Promise(resolve => setTimeout(resolve, 5));
      assert.equal(render().error, '');
      for (const surface of ['front', 'answer']) {
        render().open(surface, editing ? render().items.find(p => p.surface === surface) : undefined, editing);
        for (let i = 0; i < 2; i++) { await render().upload(new Blob(['malformed'])); assert.match(render().error, /format or limits rejected/); }
        await render().upload(new Blob([await sampleImage()])); render().changeMetadata('alt', `ZZ recovered ${surface}`); render().insert();
      }
      assert.equal(requests.filter(r => r.method === 'DELETE').length, 0);
      const fingerprint = questionMedia.questionMediaFingerprint(render().items);
      const unknown = await rpc(client, 'm115_reserve', { p_actor: ids.admin, p_library: ids.library, p_draft: draftId, p_question: question, p_key: randomUUID() });
      const payload = { ...basePayload, p_question_id: question, p_prompt: 'ZZ GATE5 LIFECYCLE RECOVERY' }; delete payload.front; delete payload.answer;
      assert.ok((await render().save(payload)).error, 'Unknown pending operation still blocks both new and edit Save');
      assert.equal(sql(`select state from media_service_operations where id='${unknown.reservationId}';`), 'pending');
      assert.ok(!requests.some(r => r.method === 'DELETE' && r.reservation === unknown.reservationId));
      await rpc(client, 'm115_upload', { p_actor: ids.admin, p_library: ids.library, p_question: question, p_reservation: unknown.reservationId, p_action: 'cancel' });
      const saved = await render().save(payload); assert.equal(saved.error, null); question = saved.data.id;
      for (const id of owned.filter((_, i) => i % 3 !== 2)) assert.equal(sql(`select state from media_service_operations where id='${id}';`), 'cancelled');
      const fresh = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }), previous = manifest;
      manifest = await rpc(fresh, 'm115_manifest', { p_actor: ids.admin, p_library: ids.library, p_question: question });
      assert.equal(questionMedia.questionMediaFingerprint(manifest.placements), fingerprint); assert.equal(manifest.prompt, payload.p_prompt);
      if (previous) assert.equal(sql(`select count(*) from media_version_references where question_version_id='${previous.versionId}';`), '2');
      record(`${editing ? 'existing' : 'new'} real Question controller: malformed Front/Answer -> valid -> Insert -> confirmed cancellation -> Save -> fresh readback; unknown operation still rejected`);
    }
  } finally {
    if (question) sql(`begin;select set_config('request.jwt.claim.sub','${ids.admin}',true);select public.delete_development_content('question','${question}');commit;`);
  }
}
try {
  const d = await draft(); const front = await upload(d); const back = { ...await upload(d, null, 'jpeg'), surface: 'answer' };
  assert.equal(snapshot().questions, before.questions); assert.equal(snapshot().versions, before.versions);
  assert.equal(sql(`select count(*) from content_media_placements where asset_id in ('${front.assetId}','${back.assetId}');`), '0');
  await assert.rejects(rpc(client, 'm113_delivery', { p_actor: ids.admin, p_library: ids.library, p_reference: front.assetId }));
  record('unsaved Front/Answer normalize, private preview and identical retry without any Question/version/placement');
  const payload = { p_question_id: null, p_active_library_id: ids.library, p_concept_id: '11200000-0000-4000-8000-000000000030', p_question_type: 'short_answer', p_prompt: 'ZZ GATE5 IMAGE INTEGRATION', p_explanation: null, p_status: 'published', p_review_article_concept_id: null, p_sort_order: 0, p_difficulty: 'medium', p_testing_angle: 'General Understanding', p_accepted_answers: [{ answer_text: 'ZZ GATE5 ANSWER', sort_order: 0 }], p_options: null, p_source_ids: null, p_tag_ids: [], p_related_concept_ids: [], p_additional_testing_angles: [], front: [front, { ...front, placementId: randomUUID(), ordinal: 1, altText: 'Second Front placement' }], answer: [back] };
  const save = body => service.saveQuestionImages(ids.library, null, d, null, body);
  await assert.rejects(save({ ...payload, p_related_concept_ids: [randomUUID()] }));
  assert.equal(snapshot().questions, before.questions); assert.equal(sql(`select state from question_media_drafts where id='${d}';`), 'open');
  await assert.rejects(save({ ...payload, answer: [{ ...back, surface: 'front' }] }));
  await assert.rejects(save({ ...payload, front: [{ ...front, assetId: back.assetId }] }));
  const concurrent = await Promise.all([save(payload), save(payload)]); const saved = concurrent[0]; target = saved.id; evidence.question = target;
  assert.deepEqual(concurrent[0], concurrent[1]); assert.equal(saved.placements.length, 3);
  assert.equal(sql(`select count(*) from question_versions where question_id='${target}';`), '1');
  assert.equal(sql(`select count(*) from media_version_references where question_version_id='${saved.current_version_id}';`), '3');
  assert.deepEqual(await save(payload), saved); await assert.rejects(save({ ...payload, p_prompt: 'Different retry' }));
  record('atomic first-save rollback, independent surfaces/order, reusable asset, concurrent/identical receipt and changed-payload conflict');
  const fresh = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const manifest = await rpc(fresh, 'm115_manifest', { p_actor: ids.admin, p_library: ids.library, p_question: target });
  assert.equal(manifest.prompt, payload.p_prompt); assert.equal(manifest.answer, 'ZZ GATE5 ANSWER'); assert.equal(manifest.placements.length, 3);
  assert.ok((await delivery.deliverImage(client, { ...actor, actor: ids.learner }, front.placementId)).bytes.length);
  const computed = await caller.from('questions').select('id,current_version_id,question_media_hint').eq('id', target).single(); assert.equal(computed.error, null);
  assert.equal(computed.data.question_media_hint.front, true); assert.equal(computed.data.question_media_hint.answer, true); assert.equal(computed.data.question_media_hint.versionId, saved.current_version_id);
  record('fresh client save/reload, computed PostgREST hint and authorized learner delivery');
  const edit = await draft(target, saved.current_version_id), stale = await draft(target, saved.current_version_id);
  const replacement = await upload(edit, target, 'webp');
  const editPayload = { ...payload, p_question_id: target, front: [{ ...replacement, placementId: front.placementId }], answer: saved.placements.filter(p => p.surface === 'answer') };
  const replaced = await service.saveQuestionImages(ids.library, target, edit, saved.current_version_id, editPayload);
  assert.equal(replaced.placements.find(p => p.surface === 'front').assetId, replacement.assetId);
  assert.equal(sql(`select count(*) from media_version_references where question_version_id='${saved.current_version_id}';`), '3');
  await assert.rejects(service.saveQuestionImages(ids.library, target, stale, saved.current_version_id, editPayload));
  const remove = await draft(target, replaced.current_version_id);
  const removed = await service.saveQuestionImages(ids.library, target, remove, replaced.current_version_id, { ...editPayload, front: [], answer: [] });
  const current = await rpc(client, 'm115_manifest', { p_actor: ids.admin, p_library: ids.library, p_question: target });
  assert.equal(current.placements.length, 0); assert.equal(removed.placements.length, 0);
  assert.equal(sql(`select count(*) from media_version_references where question_version_id in ('${saved.current_version_id}','${replaced.current_version_id}');`), '5');
  for (const asset of evidence.assets) assert.equal((await cleanup.deleteOrphan(client, asset)).deleted, false);
  record('media-only replacement/removal versions, stale edit rejection, current-only readback and invisible historical protection');
  sql(`begin; select set_config('request.jwt.claim.sub','${ids.admin}',true); select public.delete_development_content('question','${target}'); commit;`);
  await assert.rejects(save(payload), /permanently deleted/);
  assert.equal(sql(`select count(*) from question_versions where question_id='${target}';`), '0');
  assert.equal(sql(`select count(*) from content_media_placements where question_id='${target}';`), '0');
  record('permanent Question/version/reference closure and terminal original-save retry');
  await controllerRecovery(payload);
} finally {
  if (target && sql(`select count(*) from questions where id='${target}' and prompt like 'ZZ GATE5%';`) === '1') sql(`begin; select set_config('request.jwt.claim.sub','${ids.admin}',true); select public.delete_development_content('question','${target}'); commit;`);
  for (const d of evidence.drafts) await rpc(client, 'm115_draft', { p_actor: ids.admin, p_library: ids.library, p_draft: d.id, p_question: d.question, p_expected_version: d.version, p_action: 'abandon' }).catch(() => undefined);
  for (const asset of evidence.assets) {
    await cleanup.deleteOrphan(client, asset);
    evidence.pendingGrace.push(JSON.parse(sql(`select row_to_json(x) from (select id,state,unreferenced_since,unreferenced_since+interval '24 hours' eligible_at from media_assets where id='${asset}') x;`)));
  }
  for (const r of evidence.reservations) {
    const attempts = JSON.parse(sql(`select coalesce(jsonb_agg(id),'[]') from media_service_operations where parent_id='${r.id}' and operation_type='staging';`));
    for (const attempt of attempts) await cleanup.cleanTemporary(client, attempt);
  }
  evidence.before = before; evidence.after = snapshot();
  if (process.env.MEDIA_DISPOSABLE_REPORT) writeFileSync(process.env.MEDIA_DISPOSABLE_REPORT, JSON.stringify(evidence, null, 2));
}
assert.equal(evidence.after.users, before.users); assert.equal(evidence.after.questions, before.questions); assert.equal(evidence.after.versions, before.versions); assert.deepEqual(evidence.after.gate4, before.gate4);
for (const object of before.objects || []) assert.ok(evidence.after.objects.includes(object), 'Pre-existing object preserved');
console.log('Gate 5 integration complete. Only new orphan assets await real grace; earlier Gate fixtures preserved.');
