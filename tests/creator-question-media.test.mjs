import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { questionMedia as media, loadQuestionModule, hookHarness, jsx, ids, questionIds as q } from './fixtures/question-media-authoring.mjs';
const flush = () => new Promise(resolve => setImmediate(resolve));
const hint = { questionId: q.question, versionId: q.version, libraryId: ids.library, front: true, answer: true };
const placement = surface => ({ placementId: surface === 'front' ? q.placement : ids.placement, assetId: q.asset, surface, ordinal: 0, altText: `Synthetic ${surface}`, caption: '', mime: 'image/png', width: 2, height: 3, sha256: 'a'.repeat(64) });
function setup({ existing = false, reply, enabled = true } = {}) {
  const hooks = hookHarness(), calls = [];
  const props = { libraryId: ids.library, questionId: existing ? q.question : null, enabled, hint: existing ? hint : null, basePrompt: existing ? 'Prompt' : '', baseAnswer: existing ? 'Answer' : '' };
  const mod = loadQuestionModule('components/creator/QuestionImageAuthoring.tsx', { react: hooks.hooks, 'react/jsx-runtime': jsx, '@/components/VerifiedMediaImage': { default: 'image' }, '@/lib/question-media': media, '@/components/ConceptMedia.module.css': {} }, {
    crypto: webcrypto, requestAnimationFrame: fn => fn(), fetch: async (url, init = {}) => {
      const body = init.method === 'POST' ? JSON.parse(init.body) : null; calls.push({ url, init, body });
      const override = await reply?.({ url, init, body, calls }); if (override) return override;
      if (init.method === 'POST') {
        if (body.action === 'reserve') return Response.json({ reservationId: q.reservation });
        if (body.action === 'save') return Response.json({ id: q.question, current_version_id: q.version, prompt: body.payload.p_prompt, answer: body.payload.p_accepted_answers[0].answer_text, placements: [...body.payload.front, ...body.payload.answer].map(p => { const copy = { ...p }; delete copy.reservationId; return copy; }) });
        return Response.json({ draftId: body.draftId });
      }
      if (init.method === 'PUT') return Response.json({ ready: true, assetId: q.asset });
      if (init.method === 'DELETE') return Response.json({ cancelled: true });
      if (url.includes('metadata=1')) return Response.json({ assetId: q.asset, mime: 'image/png', width: 2, height: 3, sha256: 'a'.repeat(64) });
      return Response.json({ ...hint, prompt: 'Prompt', answer: 'Answer', placements: [placement('front'), placement('answer')] });
    },
  });
  const render = () => hooks.render(() => mod.useQuestionImageAuthoring(props));
  return { hooks, props, calls, render, mod };
}
async function insert(h, surface, alt = 'Synthetic alt') {
  h.render().open(surface); await h.render().upload(new Blob(['input'], { type: 'image/png' }));
  h.render().changeMetadata('alt', alt); h.render().changeMetadata('caption', 'Caption'); h.render().insert(); return h.render();
}
const payload = { p_prompt: 'Prompt', p_accepted_answers: [{ answer_text: 'Answer' }] };
function recovery(options = {}) {
  const reservations = [];
  const h = setup({ ...options, reply: async args => {
    const override = await options.reply?.(args); if (override) return override;
    if (args.body?.action === 'reserve') { const id = webcrypto.randomUUID(); reservations.push(id); return Response.json({ reservationId: id }); }
    if (args.init.method === 'PUT' && await args.init.body.text() === 'malformed') return Response.json({ error: 'Image rejected' }, { status: 422 });
  } });
  h.render(); h.hooks.effects(); return { ...h, reservations };
}
for (const existing of [false, true]) for (const surface of ['front', 'answer']) test(`${existing ? 'existing' : 'new'} Question reconciles failed ${surface} attempts with both current surfaces preserved`, async () => {
  const h = recovery({ existing }); await flush();
  await insert(h, surface === 'front' ? 'answer' : 'front', 'Retained current image');
  h.render().open(surface);
  await h.render().upload(new Blob(['malformed'])); await h.render().upload(new Blob(['malformed']));
  assert.equal(h.calls.filter(c => c.init.method === 'DELETE').length, 0);
  await h.render().upload(new Blob(['valid'])); h.render().changeMetadata('alt', 'Valid replacement'); h.render().insert();
  const fingerprint = media.questionMediaFingerprint(h.render().items);
  const saved = await h.render().save(payload); assert.equal(saved.error, null);
  assert.equal(media.questionMediaFingerprint(saved.data.placements), fingerprint);
  const deleted = h.calls.filter(c => c.init.method === 'DELETE').map(c => c.url.split('/').at(-1));
  assert.deepEqual(deleted, h.reservations.slice(1, 3));
  const saveAt = h.calls.findIndex(c => c.body?.action === 'save'); assert.ok(h.calls.filter(c => c.init.method === 'DELETE').every(c => h.calls.indexOf(c) < saveAt));
  assert.equal(h.calls.filter(c => c.body?.action === 'save').length, 1);
});
test('Question Remove reconciles only the removed reservation, and Cancel confirms failed attempts without losing the other surface', async () => {
  const h = recovery(); await insert(h, 'front'); await insert(h, 'answer');
  const front = h.render().items[0], answer = h.render().items[1]; h.render().remove(front.placementId);
  await h.render().save(payload);
  assert.deepEqual(h.calls.filter(c => c.init.method === 'DELETE').map(c => c.url.split('/').at(-1)), [front.reservationId]);
  assert.equal(h.render().items[0].reservationId, answer.reservationId);
  h.render().open('front'); await h.render().upload(new Blob(['malformed'])); await h.render().close();
  assert.equal(h.render().inspector, null); assert.equal(h.render().items[0].reservationId, answer.reservationId);
});
for (const failure of ['rejected', 'lost', 'timeout', 'unconfirmed']) test(`Question ${failure} cancellation prevents a save receipt until confirmed, preserving exact draft`, async () => {
  let deny = true;
  const h = recovery({ reply: ({ init }) => {
    if (init.method !== 'DELETE' || !deny) return;
    assert.ok(init.signal instanceof AbortSignal);
    if (failure === 'lost' || failure === 'timeout') throw new Error(failure);
    return failure === 'rejected' ? Response.json({ error: 'Unavailable' }, { status: 503 }) : Response.json({ cancelled: false });
  } });
  h.render().open('front'); await h.render().upload(new Blob(['malformed'])); await h.render().upload(new Blob(['valid']));
  h.render().changeMetadata('alt', 'Keep'); h.render().insert(); await insert(h, 'answer');
  const before = media.questionMediaFingerprint(h.render().items), context = h.render().context;
  assert.match((await h.render().save(payload)).error.message, /Retry Save or Cancel/);
  assert.equal(h.calls.filter(c => c.body?.action === 'save').length, 0); assert.equal(h.render().uncertain, false);
  assert.equal(h.render().dirty, true); assert.equal(h.render().context, context); assert.equal(media.questionMediaFingerprint(h.render().items), before);
  deny = false; assert.equal((await h.render().save(payload)).error, null);
  assert.equal(h.calls.filter(c => c.body?.action === 'save').length, 1);
  assert.deepEqual(h.calls.filter(c => c.init.method === 'DELETE').map(c => c.url.split('/').at(-1)), [h.reservations[0], h.reservations[0]]);
});
test('Question reconciliation protects its busy interval and never saves into a later Library context', async () => {
  let resolve;
  const h = recovery({ reply: ({ init }) => init.method === 'DELETE' ? new Promise(r => { resolve = r; }) : null });
  h.render().open('front'); await h.render().upload(new Blob(['malformed'])); await h.render().upload(new Blob(['valid']));
  h.render().changeMetadata('alt', 'Keep'); h.render().insert();
  const pending = h.render().save(payload); await flush(); assert.ok((await h.render().save(payload)).error);
  h.render().remove(h.render().items[0].placementId); assert.equal(h.render().items.length, 1);
  h.props.libraryId = ids.asset; h.render(); h.hooks.effects(); resolve(Response.json({ cancelled: true }));
  assert.match((await pending).error.message, /context changed/); assert.equal(h.calls.filter(c => c.body?.action === 'save').length, 0);
  assert.equal(h.render().context, null);
});
test('new no-image rendering has no request, draft, dirty state or text mutation', () => {
  const h = setup(); let c = h.render(); h.hooks.effects(); c = h.render();
  assert.equal(c.usesMedia, false); assert.equal(c.dirty, false); assert.deepEqual(h.calls, []);
  const learner = setup({ enabled: false }); learner.render().open('front'); assert.equal(learner.render().inspector, null); assert.equal(learner.calls.length, 0);
});
test('Front and Answer upload/insert independently; alt required; no interaction automatically saves', async () => {
  const h = setup(); h.render(); h.hooks.effects(); h.render().open('front');
  await h.render().upload(new Blob(['input'], { type: 'image/png' }));
  h.render().insert(); assert.equal(h.render().items.length, 0);
  h.render().changeMetadata('alt', 'Front label'); h.render().insert();
  await insert(h, 'answer', 'Answer label');
  assert.deepEqual(h.render().items.map(p => p.surface).join(','), 'front,answer');
  assert.equal(h.calls.filter(c => c.body?.action === 'save').length, 0);
  assert.equal(h.render().dirty, true); assert.equal(h.render().guardActive, true);
  const saved = await h.render().save(payload); assert.equal(saved.error, null);
  const body = h.calls.find(c => c.body?.action === 'save').body.payload;
  assert.equal(body.front.length, 1); assert.equal(body.answer.length, 1); assert.equal(body.front[0].altText, 'Front label');
  assert.equal(body.p_prompt, 'Prompt'); assert.equal(body.p_accepted_answers[0].answer_text, 'Answer');
  assert.equal(typeof h.calls.find(c => c.body?.action === 'create').body.draftId, 'string');
  h.render().reset(); assert.equal(h.render().items.length, 0); assert.equal(h.render().context, null); assert.equal(h.render().inspector, null);
});
test('existing hydration is current-only; ordering/removal/metadata edits stay surface-local', async () => {
  const h = setup({ existing: true }); h.render(); h.hooks.effects(); await flush(); let c = h.render();
  assert.equal(c.items.length, 2); assert.equal(c.dirty, false);
  c.open('front', c.items.find(p => p.surface === 'front')); h.render().changeMetadata('alt', 'Revised'); h.render().insert();
  assert.equal(h.render().items.find(p => p.surface === 'answer').altText, 'Synthetic answer');
  h.render().remove(q.placement); c = h.render(); assert.equal(c.items.length, 1); assert.equal(c.items[0].surface, 'answer'); assert.equal(c.dirty, true);
});
test('two Front images reorder without reordering or copying Answer', async () => {
  const h = setup(); h.render(); h.hooks.effects(); await insert(h, 'front', 'First'); await insert(h, 'front', 'Second'); await insert(h, 'answer', 'Back');
  let c = h.render(); const second = c.items[1].placementId; c.move(second, -1); c = h.render();
  assert.equal(c.items[0].altText, 'Second'); assert.equal(c.items[0].ordinal, 0); assert.equal(c.items[1].ordinal, 1); assert.equal(c.items[2].altText, 'Back');
});
test('known save failure retains both manifests; lost response reconciles the same receipt and payload', async () => {
  for (const lost of [false, true]) {
    let saves = 0;
    const h = setup({ reply: ({ body }) => { if (body?.action === 'save' && ++saves === 1) { if (lost) throw Error('Response lost'); return Response.json({ error: 'Rejected' }, { status: 422 }); } } });
    h.render(); h.hooks.effects(); await insert(h, 'front');
    const before = media.questionMediaFingerprint(h.render().items); const result = await h.render().save(payload);
    assert.equal(media.questionMediaFingerprint(h.render().items), before);
    assert.equal(Boolean(result.error), !lost); assert.equal(saves, lost ? 2 : 1);
    if (lost) { const requests = h.calls.filter(c => c.body?.action === 'save'); assert.deepEqual(requests[0].body, requests[1].body); }
  }
});
test('unresolved save freezes mutation and rejects changed-payload retry', async () => {
  const h = setup({ reply: ({ body }) => { if (body?.action === 'save') throw Error('Offline'); } });
  h.render(); h.hooks.effects(); await insert(h, 'front'); await h.render().save(payload);
  let c = h.render(); assert.equal(c.uncertain, true); const first = c.items[0].placementId; c.remove(first); assert.equal(h.render().items.length, 1);
  const calls = h.calls.length; const result = await h.render().save({ ...payload, p_prompt: 'Changed' }); assert.ok(result.error); assert.equal(h.calls.length, calls);
});
test('stale Library hydration never overwrites the new context; mismatched version blocks saving', async () => {
  let resolve;
  const h = setup({ existing: true, reply: ({ init }) => { if (!init.method) return new Promise(r => { resolve = r; }); } });
  h.render(); h.hooks.effects(); h.props.questionId = null; h.props.libraryId = ids.asset; h.props.hint = null; h.props.basePrompt = ''; h.props.baseAnswer = ''; h.render(); h.hooks.effects();
  resolve(Response.json({ ...hint, prompt: 'Prompt', answer: 'Answer', placements: [placement('front')] })); await flush(); assert.equal(h.render().items.length, 0);
  const wrong = setup({ existing: true, reply: ({ init }) => !init.method ? Response.json({ ...hint, versionId: 'wrong', prompt: 'Prompt', answer: 'Answer', placements: [] }) : null });
  wrong.render(); wrong.hooks.effects(); await flush(); assert.match(wrong.render().error, /changed/); assert.ok((await wrong.render().save(payload)).error);
});
test('cancel pending upload cancels its reservation; reset fences late upload result', async () => {
  let resolve;
  const h = setup({ reply: ({ init }) => init.method === 'PUT' ? new Promise(r => { resolve = r; }) : null });
  h.render(); h.hooks.effects(); h.render().open('front'); const work = h.render().upload(new Blob(['x'])); await flush();
  await h.render().close(); assert.ok(h.calls.some(c => c.init.method === 'DELETE')); h.render().reset();
  resolve(Response.json({ assetId: q.asset, ready: true })); await work; assert.equal(h.render().items.length, 0); assert.equal(h.render().context, null);
});
test('native image controls expose descriptive labels, required alt and no internal identifiers', () => {
  const h = setup(); const c = h.render(); c.open('answer');
  const tree = h.hooks.render(() => h.mod.default({ controller: h.render(), surface: 'answer', disabled: false }));
  const json = JSON.stringify(tree); assert.match(json, /Add Image to Answer/); assert.match(json, /Answer Image Alt Text/); assert.match(json, /"required":true/);
  assert.doesNotMatch(json, /socrates-content-media|assetId|placementId|reservationId/);
});

// Real Creator transition/save handlers with an explicit media-controller boundary.
// The controller itself is exercised above; these tests pin the parent's ownership.
test('media-only Question draft survives Search and same-result selection and remains guarded globally', async () => {
  const { editor, nodes, question } = await import('./fixtures/creator-question-workflow.mjs');
  const { passiveQuestionImages } = await import('./fixtures/question-media-authoring.mjs');
  let resets = 0;
  const images = { ...passiveQuestionImages(), reset() { resets++; } };
  const h = editor({ questionImages: images, confirm: () => false });
  h.render().setActiveCreatorTab('questions'); h.render().selectExistingQuestion(question());
  const initialResets = resets;
  Object.assign(images, { dirty: true, guardActive: true, usesMedia: true, entered: true, items: [placement('front')] });
  const select = tab => nodes(h.render().tree).find(n => n.type?.name === 'CreatorStudioTabs').props.onSelect(tab);
  select('search'); assert.equal(h.render().activeCreatorTab, 'search'); assert.equal(h.render().isDirty, true);
  assert.equal(h.confirmations.length, 0); assert.equal(h.runShellGuard(), false);
  h.render().selectQuestionSearchResult(question()); assert.equal(h.render().activeCreatorTab, 'questions');
  assert.equal(resets, initialResets); assert.equal(images.items.length, 1); assert.equal(h.render().isQuestionDirty, true);
  select('search'); h.render().selectQuestionSearchResult(question({ id: 'other' }));
  assert.equal(h.render().activeCreatorTab, 'search'); assert.equal(resets, initialResets); assert.equal(h.calls.length, 0);
});
test('new media save delegates once, carries non-media context, and clears both surfaces; failure preserves them', async () => {
  const { editor } = await import('./fixtures/creator-question-workflow.mjs');
  const { passiveQuestionImages } = await import('./fixtures/question-media-authoring.mjs');
  for (const fail of [false, true]) {
    const saves = []; let resets = 0;
    const images = { ...passiveQuestionImages(), reset() { resets++; this.items = []; this.usesMedia = false; this.dirty = false; this.context = null; this.inspector = null; }, async save(value) { saves.push(value); return fail ? { data: null, error: { message: 'Synthetic save rejection' } } : { data: { id: q.question }, error: null }; } };
    const h = editor({ questionImages: images }); h.render().setActiveCreatorTab('questions'); h.render().selectQuestionConcept('primary', 'topic');
    h.render().setQuestionPrompt('Media question'); h.render().setQuestionAnswer('Media answer');
    h.render().setQuestionTestingAngle('Priority'); h.render().setQuestionAdditionalTestingAngles(['Safety']);
    Object.assign(images, { usesMedia: true, dirty: true, guardActive: true, entered: true, items: [placement('front'), placement('answer')], context: { draftId: q.draft } });
    const before = resets; await h.render().saveCurrentQuestion();
    assert.equal(saves.length, 1); assert.equal(saves[0].p_concept_id, 'primary'); assert.equal(saves[0].p_difficulty, 'medium'); assert.equal(saves[0].p_status, 'published');
    assert.equal(h.calls.filter(c => c.name === 'save_question_with_relationships_v2').length, 0);
    assert.equal(images.items.length, fail ? 2 : 0); assert.equal(resets, before + (fail ? 0 : 1));
    assert.equal(h.render().questionPrompt, fail ? 'Media question' : ''); assert.equal(h.render().questionTestingAngle, 'Priority');
    assert.deepEqual(Array.from(h.render().questionAdditionalTestingAngles), ['Safety']);
    if (!fail) { assert.equal(images.context, null); assert.equal(images.inspector, null); }
  }
});
