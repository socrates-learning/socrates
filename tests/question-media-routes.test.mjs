import test from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { questionMedia, ids, loadQuestionModule } from './fixtures/question-media-authoring.mjs';
const question = '11400000-0000-4000-8000-000000000030';
const server = loadQuestionModule('lib/content-media/server.ts', { 'server-only': {}, '@supabase/supabase-js': {}, 'node:crypto': crypto, '@/lib/supabase-server': {}, '@/lib/library-context': {} });
function setup(overrides = {}) {
  const calls = [];
  const api = { ...server, actorContext: async (_request, mutation) => { calls.push(['auth', mutation]); if (overrides.denied) throw new server.MediaError(401, 'Authentication required'); return { actor: ids.admin, library: ids.library }; }, serviceClient: () => ({}), rpc: async (_client, name, args) => { calls.push([name, args]); return { draftId: ids.placement }; } };
  const authoring = {
    saveQuestionImages: async (...args) => { calls.push(['save', ...args]); if (overrides.saveError) throw overrides.saveError; return { question_id: question }; },
    questionPreview: async (...args) => { calls.push(['preview', ...args.slice(1)]); return { metadata: { assetId: ids.asset, mime: 'image/png' }, bytes: Buffer.from('image') }; },
    uploadQuestionDraft: async (...args) => { calls.push(['upload', ...args.slice(1, 3)]); return { assetId: ids.asset, ready: true, bucket: 'private', object: 'secret' }; },
  };
  const modules = { '@/lib/content-media/server': api, '@/lib/content-media/question-authoring': authoring };
  return { calls, root: loadQuestionModule('app/api/content-media/questions/[questionId]/route.ts', modules), draft: loadQuestionModule('app/api/content-media/questions/[questionId]/drafts/[reservationId]/route.ts', modules) };
}
const route = (questionId = 'new') => ({ params: Promise.resolve({ questionId, reservationId: ids.asset }) });
const post = (body, method = 'POST') => new Request('http://localhost/api', { method, body: JSON.stringify(body) });
const payload = { libraryId: ids.library, draftId: ids.placement, action: 'create' };
test('all Question media handlers authenticate before parsing, uploading or saving', async () => {
  for (const [group, method] of [['root', 'GET'], ['root', 'POST'], ['draft', 'GET'], ['draft', 'PUT'], ['draft', 'DELETE']]) {
    const s = setup({ denied: true });
    const response = await s[group][method](new Request('http://localhost'), route());
    assert.equal(response.status, 401); assert.deepEqual(s.calls, [['auth', method !== 'GET']]);
  }
});
test('unsaved draft create/reserve routes use verified actor and active Library, never browser-supplied identity', async () => {
  const s = setup();
  assert.equal((await s.root.POST(post({ ...payload, actor: ids.learner }), route())).status, 200);
  assert.equal(s.calls[1][0], 'm115_draft'); assert.equal(s.calls[1][1].p_actor, ids.admin);
  const result = await s.root.POST(post({ ...payload, action: 'reserve', idempotencyKey: ids.asset }), route());
  assert.equal(result.status, 200); assert.equal(s.calls.at(-1)[0], 'm115_reserve');
  for (const invalid of [{ ...payload, libraryId: ids.asset }, { ...payload, draftId: undefined }, { ...payload, action: 'unsupported' }]) assert.notEqual((await s.root.POST(post(invalid), route())).status, 200);
  assert.equal((await s.root.POST(post(payload), route(question))).status, 200);
  assert.equal(s.calls.at(-1)[1].p_question, question);
});
test('first save and existing save keep their actual target and version contexts; errors remain sanitized', async () => {
  const s = setup();
  await s.root.POST(post({ ...payload, action: 'save', payload: { placements: [] } }), route());
  assert.deepEqual(s.calls.at(-1).slice(0, 5), ['save', ids.library, null, ids.placement, null]);
  await s.root.POST(post({ libraryId: ids.library, draftId: ids.placement, action: 'save', versionId: ids.asset, payload: {} }), route(question));
  assert.deepEqual(s.calls.at(-1).slice(0, 5), ['save', ids.library, question, ids.placement, ids.asset]);
  const failed = setup({ saveError: new Error('credential=private; internal storage path') });
  const response = await failed.root.POST(post({ ...payload, action: 'save' }), route());
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /credential|storage path/);
});
test('manifest and draft preview require actual Library context and never return private object paths', async () => {
  const s = setup();
  assert.equal((await s.root.GET(new Request(`http://localhost?libraryId=${ids.library}`), route())).status, 403);
  assert.equal((await s.root.GET(new Request(`http://localhost?libraryId=${ids.asset}`), route(question))).status, 403);
  const preview = await s.draft.GET(new Request(`http://localhost?libraryId=${ids.library}&draftId=${ids.placement}`), route());
  assert.equal(preview.status, 200); assert.equal(preview.headers.get('cache-control'), 'private, no-store');
  assert.equal(preview.headers.get('content-type'), 'image/png'); assert.match(preview.headers.get('content-security-policy'), /sandbox/);
  const uploaded = await s.draft.PUT(new Request('http://localhost'), route());
  assert.deepEqual(await uploaded.json(), { assetId: ids.asset, ready: true, terminal: false });
  assert.equal((await s.draft.PUT(new Request('http://localhost'), route(question))).status, 200);
  assert.equal(s.calls.at(-1)[1].question, question);
  assert.equal((await s.draft.DELETE(new Request('http://localhost'), route(question))).status, 200);
  assert.equal(s.calls.at(-1)[1].p_question, question);
});
test('Question media endpoints cannot encode a fake saved Question for a draft', () => {
  assert.equal(questionMedia.questionMediaEndpoint({ questionId: null }), '/api/content-media/questions/new');
  assert.equal(questionMedia.questionMediaEndpoint({ questionId: question }), `/api/content-media/questions/${question}`);
});
