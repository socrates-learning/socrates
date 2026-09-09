import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const planner = readFileSync(new URL('../components/StudyPlanner.tsx', import.meta.url), 'utf8');
const handlers = planner.slice(planner.indexOf('  async function loadNextStudyCard('), planner.indexOf('  async function handleLogout()'));
const compiled = ts.transpileModule(handlers + '\nglobalThis.handlers = { persistFinalStudyResponse, retryNextStudyCard };', {}).outputText;
function harness({ kind = 'official', save, next } = {}) {
  const calls = [], statuses = [], cards = [];
  const context = {
    console: { error() {} }, crypto: { randomUUID },
    studyResponseSaveLock: { current: false }, studyResponseRecordedForCard: { current: false },
    studySubmission: { current: null }, studySessionIdRef: { current: 'session' },
    studyCandidate: { kind, questionId: 'question', conceptId: 'concept', cardId: 'card', personalConceptId: 'personal-concept' },
    userId: 'user', deck: { id: 'deck' },
    setStudySubmissionStatus: status => statuses.push(status),
    setStudyCandidate: card => cards.push(card),
    setIsStudySequenceComplete() {}, setIsAnswerVisible() {}, setStudyFeedback() {}, setStudyResponse() {}, resetStudyCardFeedback() {}, refreshLearnerProgress() {},
    supabase: { async rpc(name, payload) { calls.push({ name, payload }); return save ? save() : { error: null }; } },
    async recordPersonalStudyAttempt(client, payload) { calls.push({ name: 'personal', payload }); if (save) { const result = await save(); if (result.error) throw result.error; } },
    async selectNextStudyCandidate(client, session) { calls.push({ name: 'next', session }); return next ? next() : { candidateId: 'next' }; },
  };
  vm.createContext(context); vm.runInContext(compiled, context);
  return { context, calls, statuses, cards, ...context.handlers };
}
for (const kind of ['official', 'personal']) {
  test(`${kind}: an unconfirmed save retries its original identifier and rating`, async () => {
    let attempts = 0;
    const h = harness({ kind, save: () => ({ error: ++attempts === 1 ? new Error('Lost acknowledgement') : null }) });
    await h.persistFinalStudyResponse('easy');
    assert.equal(h.statuses.at(-1), 'save-error');
    assert.equal(h.calls.filter(c => c.name === 'next').length, 0);
    await h.persistFinalStudyResponse('forgot');
    assert.deepEqual(h.calls[0].payload, h.calls[1].payload);
    assert.equal(h.statuses.at(-1), 'idle');
    await h.persistFinalStudyResponse('average');
    const later = h.calls.filter(c => c.name !== 'next')[2].payload;
    const key = kind === 'official' ? 'p_submission_id' : 'submissionId';
    assert.notEqual(later[key], h.calls[0].payload[key]);
  });
}
test('repeated next-card failures keep the answer locked and retry only selection', async () => {
  let selections = 0;
  const h = harness({ next: () => { if (++selections < 3) throw new Error('Unavailable'); return { candidateId: 'next' }; } });
  await h.persistFinalStudyResponse('easy');
  assert.equal(h.statuses.at(-1), 'next-error');
  await h.persistFinalStudyResponse('forgot');
  assert.equal(h.calls.filter(c => c.name !== 'next').length, 1);
  await h.retryNextStudyCard();
  assert.equal(h.statuses.at(-1), 'next-error');
  await h.retryNextStudyCard();
  assert.equal(h.statuses.at(-1), 'idle');
  assert.equal(h.calls.filter(c => c.name !== 'next').length, 1);
  assert.equal(h.calls.filter(c => c.name === 'next').length, 3);
});
test('double-click while saving starts one request', async () => {
  let finish;
  const h = harness({ save: () => new Promise(resolve => { finish = resolve; }) });
  const first = h.persistFinalStudyResponse('easy');
  await h.persistFinalStudyResponse('easy');
  assert.equal(h.calls.length, 1);
  finish({ error: null }); await first;
});
test('a next-card request that finishes after Exit cannot replace the Home state', async () => {
  let finish;
  const h = harness({ next: () => new Promise(resolve => { finish = resolve; }) });
  const pending = h.persistFinalStudyResponse('easy');
  await new Promise(resolve => setImmediate(resolve));
  h.context.studySessionIdRef.current = null;
  finish({ candidateId: 'stale' }); await pending;
  assert.deepEqual(h.cards, []);
});
