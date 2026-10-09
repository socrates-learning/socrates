import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { deriveCreatorCapabilities } from '../lib/creator-capabilities.ts';
import { editor, nodes, expandChrome, text, question, row, settle } from './fixtures/creator-question-workflow.mjs';
import { passiveQuestionImages, questionContentBoundary } from './fixtures/question-media-authoring.mjs';

const plain = value => JSON.parse(JSON.stringify(value));
const fullRow = (overrides = {}) => row({
  question_type: 'short_answer', current_version_id: 'version-1', prompt: '**Front**', prompt_format: 'visual_markdown_v1',
  question_accepted_answers: [{ id: 'answer-1', answer_text: '*Answer*', answer_format: 'visual_markdown_v1', sort_order: 2 }],
  additional_testing_angles: ['Clinical Application'], testing_angle: 'General Understanding', difficulty: 'hard', status: 'archived',
  question_tags: [{ tag_id: 'tag', tags: { id: 'tag', name: 'Tag', slug: 'tag', status: 'archived' } }],
  question_media_hint: { versionId: 'version-1', front: true, answer: true },
  explanation: 'Preserved explanation', sort_order: 4, review_article_concept_id: 'review-concept', ...overrides,
});
function render(h) {
  const result = h.render();
  h.runEffect('flaggedQuestionCompletion.current =');
  return result;
}
function action(h) {
  const flagged = nodes(expandChrome(render(h).tree)).find(n => n.type?.name === 'StudyCreatorFlaggedBrowser');
  assert.ok(flagged, 'Actual Flagged wrapper must be mounted');
  return flagged.props.officialQuestionEditor;
}
function setup(options = {}) {
  const h = editor({ placed: true, ...options });
  h.render().setQuestionConceptsByTopicId({ topic: [{ id: 'primary', name: 'Primary' }, { id: 'related', name: 'Related' }] });
  h.render().setActiveCreatorTab('flagged'); render(h);
  return h;
}
function snapshot(h) {
  const e = render(h);
  return plain({ id: e.questionId, source: e.questionSource, front: e.questionPrompt, answer: e.questionAnswer,
    primary: e.primaryQuestionConceptId, related: e.questionRelatedConceptIds, angles: [e.questionTestingAngle, e.questionAdditionalTestingAngles],
    tags: e.questionTags, difficulty: e.questionDifficulty, status: e.questionRecordStatus,
    promptFormat: e.questionPromptFormat, answerFormat: e.questionAnswerFormat, canonical: e.questionCanonicalRecord,
    media: e.questionMediaRecord, fingerprint: e.currentQuestionFingerprint, saved: e.savedQuestionFingerprint, dirty: e.isQuestionDirty });
}
function dirty(h) {
  let e = render(h); e.selectQuestionSearchResult(question());
  e = render(h); e.setQuestionPrompt('ZZ FLAGGED unsaved Front'); e.setQuestionAnswer('ZZ FLAGGED unsaved Answer');
  e.setQuestionRelatedConceptIds(['related', 'another']); e.setQuestionAdditionalTestingAngles(['Clinical Application']);
  e.setQuestionTags([{ id: 'draft-tag', name: 'Draft Tag', slug: 'draft-tag', status: 'active' }]);
  e.setActiveCreatorTab('flagged');
  return snapshot(h);
}

const browseEffect = 'const options = questionConceptsByTopicId[questionTopicId]';
function syncBrowse(h) {
  // Exercise the real placement/Topic effect after each queued state update.
  for (let i = 0; i < 3; i++) { render(h); h.runEffect(browseEffect); }
}
function browseSnapshot(h) {
  const e = render(h);
  return plain({ topic: e.questionTopicId, activeTopic: e.activeTopicId,
    concept: e.questionConceptId, options: e.questionConceptOptions,
    existing: e.existingQuestions, editor: snapshot(h) });
}

for (const role of ['admin', 'editor']) {
  test(`${role}: cold Flagged handoff survives late placements and matches warm Search browsing context`, async () => {
    const placements = { topic: [], destination: [{ id: 'primary', name: 'Primary' }, { id: 'related', name: 'Related' }] };
    const response = () => ({ data: [fullRow()], error: null });
    const flagged = setup({ role, response });
    render(flagged).setQuestionConceptsByTopicId({});
    await action(flagged).open('q1', 'primary');
    const loaded = snapshot(flagged);
    syncBrowse(flagged);
    assert.equal(render(flagged).questionConceptId, 'primary', 'Pending placements must not replace the actual Primary');
    render(flagged).setQuestionConceptsByTopicId(placements); syncBrowse(flagged);
    assert.equal(render(flagged).questionTopicId, 'destination');
    assert.equal(render(flagged).activeTopicId, 'destination');
    assert.equal(render(flagged).questionConceptId, 'primary');
    assert.deepEqual(snapshot(flagged), loaded, 'Context synchronization must not change any Question data or dirty state');
    render(flagged); flagged.runEffect('async function loadExistingQuestions()'); await settle();
    assert.deepEqual(render(flagged).existingQuestions.map(q => q.id), ['q1']);
    const search = setup({ role, response }); render(search).setQuestionConceptsByTopicId(placements);
    render(search).selectQuestionSearchResult((await render(search).fetchExistingQuestions('primary', 'library'))[0]);
    syncBrowse(search); render(search); search.runEffect('async function loadExistingQuestions()'); await settle();
    assert.deepEqual(browseSnapshot(flagged), browseSnapshot(search));
    assert.equal(flagged.calls.length, 0);

    // An intentional later Concept browse must remain independent of the saved Primary.
    render(flagged).browseQuestionConcept('related', 'destination'); syncBrowse(flagged);
    render(flagged).setQuestionAnswer('Retained dirty Answer'); render(flagged).setActiveCreatorTab('flagged');
    const retained = browseSnapshot(flagged), reads = flagged.reads.length;
    await action(flagged).open('q1', 'primary'); syncBrowse(flagged);
    assert.deepEqual(browseSnapshot(flagged), retained);
    assert.equal(flagged.reads.length, reads); assert.equal(flagged.confirmations.length, 0);
  });

  test(`${role}: unavailable Primary placement is not substituted; replacement Cancel retains complete browsing context`, async () => {
    let accept = false;
    const h = setup({ role, confirm: () => accept, response: () => ({ data: [fullRow({ id: 'q2' })], error: null }) });
    dirty(h); const before = browseSnapshot(h);
    await action(h).open('q2', 'primary'); syncBrowse(h);
    assert.deepEqual(browseSnapshot(h), before);
    accept = true; render(h).setQuestionConceptsByTopicId({ topic: [{ id: 'unrelated', name: 'Unrelated' }] });
    await action(h).open('q2', 'primary'); syncBrowse(h);
    assert.equal(render(h).questionId, 'q2'); assert.equal(render(h).primaryQuestionConceptId, 'primary');
    assert.equal(render(h).questionConceptId, 'primary'); assert.equal(render(h).questionTopicId, '');
    assert.deepEqual(plain(render(h).questionConceptOptions), []);
    assert.equal(h.confirmations.length, 2); assert.equal(h.calls.length, 0);
  });
}

for (const role of ['admin', 'editor']) {
  test(`${role}: Flagged resolves the exact complete official record through the existing Library reader and Search handoff`, async () => {
    const complete = fullRow();
    const h = setup({ role, response(name, payload) {
      assert.equal(name, 'get_creator_questions_with_media');
      assert.deepEqual(plain(payload), { p_active_library_id: 'library', p_concept_id: 'primary' });
      return { data: [fullRow({ id: 'unrelated' }), complete], error: null };
    } });
    await action(h).open('q1', 'primary');
    assert.equal(render(h).activeCreatorTab, 'questions');
    const actual = snapshot(h);
    assert.equal(actual.id, 'q1'); assert.equal(actual.primary, 'primary');
    assert.equal(actual.front, '**Front**'); assert.equal(actual.answer, '*Answer*');
    assert.deepEqual(actual.related, ['related']); assert.equal(actual.dirty, false);
    assert.equal(actual.canonical.currentVersionId, 'version-1'); assert.equal(actual.canonical.acceptedAnswerId, 'answer-1');
    assert.equal(actual.canonical.updatedAt, complete.updated_at); assert.equal(actual.canonical.reviewArticleConceptId, 'review-concept');
    assert.deepEqual(actual.media.hint, complete.question_media_hint);
    assert.equal(actual.promptFormat, 'visual_markdown_v1'); assert.equal(actual.answerFormat, 'visual_markdown_v1');
    const search = setup({ role, response: () => ({ data: [complete], error: null }) });
    const records = await render(search).fetchExistingQuestions('primary', 'library');
    render(search).selectQuestionSearchResult(records[0]);
    assert.deepEqual(actual, snapshot(search), 'Flagged must hydrate exactly like Search, including hidden and version fields');
    assert.equal(h.calls.length, 0); assert.equal(h.reads.filter(r => r.rpc === 'get_creator_questions_with_media').length, 1);
  });

  test(`${role}: same Question returns to its dirty visual/media draft without reading, prompting, resetting or writing`, async () => {
    const images = passiveQuestionImages(); let resets = 0; images.reset = () => resets++;
    const h = setup({ role, questionImages: images, confirm: () => false }); dirty(h);
    Object.assign(images, { items: [{ placementId: 'draft-front', surface: 'front', altText: 'Draft image' }], dirty: true, guardActive: true });
    const visual = { retained: 'visual selection and undo state' }; render(h).questionVisualMemory.current = visual;
    const before = snapshot(h), beforeResets = resets;
    await action(h).open('q1', 'primary');
    assert.equal(render(h).activeCreatorTab, 'questions'); assert.deepEqual(snapshot(h), before);
    assert.equal(render(h).questionVisualMemory.current, visual); assert.equal(resets, beforeResets);
    assert.equal(images.items[0].placementId, 'draft-front'); assert.equal(h.reads.length, 0);
    assert.equal(h.confirmations.length, 0); assert.equal(h.calls.length, 0);
  });

  test(`${role}: different Question uses one existing discard decision; Cancel retains Flagged and Confirm replaces exactly once`, async () => {
    let accept = false;
    const h = setup({ role, confirm: () => accept, response: () => ({ data: [fullRow({ id: 'q2' })], error: null }) });
    const before = dirty(h);
    await action(h).open('q2', 'primary');
    assert.equal(render(h).activeCreatorTab, 'flagged'); assert.deepEqual(snapshot(h), before);
    assert.deepEqual(h.confirmations, ['Discard the unsaved changes to this question?']);
    accept = true; await action(h).open('q2', 'primary');
    assert.equal(render(h).activeCreatorTab, 'questions'); assert.equal(render(h).questionId, 'q2');
    assert.equal(render(h).isQuestionDirty, false); assert.equal(h.confirmations.length, 2); assert.equal(h.calls.length, 0);
  });

  test(`${role}: Flagged retains a text-only Question in existing shell and unload guards`, () => {
    const h = setup({ role, confirm: () => false }); const before = dirty(h);
    assert.equal(render(h).isDirty, true); assert.equal(h.runShellGuard(), false);
    assert.deepEqual(h.confirmations, ['You have unsaved changes. Leave without saving?']);
    h.runUnloadEffect(); assert.equal(h.listeners.has('beforeunload'), true);
    assert.deepEqual(snapshot(h), before); assert.equal(h.calls.length, 0);
  });

  test(`${role}: existing format-aware save uses loaded identity, revision and fields, without any flag write`, async () => {
    const complete = fullRow({ question_media_hint: null });
    const h = setup({ role, response(name) { if (name === 'get_creator_questions_with_media') return { data: [complete], error: null }; } });
    await action(h).open('q1', 'primary'); render(h).setQuestionAnswer('Updated answer');
    await render(h).saveCurrentQuestion();
    const writes = h.calls.filter(call => call.name);
    assert.equal(writes.length, 1); assert.equal(writes[0].name, 'save_question_with_format');
    const args = writes[0].payload;
    assert.equal(args.p_expected_version, 'version-1'); assert.equal(args.p_expected_updated_at, complete.updated_at);
    assert.equal(args.p_payload.p_question_id, 'q1'); assert.equal(args.p_payload.p_concept_id, 'primary');
    assert.equal(args.p_payload.p_difficulty, 'hard'); assert.equal(args.p_payload.p_status, 'archived');
    assert.equal(args.p_payload.p_accepted_answers[0].id, 'answer-1');
    assert.deepEqual(plain(args.p_payload.p_related_concept_ids), ['related']);
    assert.deepEqual(plain(args.p_payload.p_additional_testing_angles), ['Clinical Application']);
    assert.deepEqual(plain(args.p_payload.p_tag_ids), ['tag']);
    assert.equal(h.calls.some(call => call.table === 'study_candidate_flags'), false);
  });
}

for (const [label, response] of [
  ['read failure', () => ({ data: null, error: { message: 'Denied' } })],
  ['transport failure', () => Promise.reject(new Error('Offline'))],
  ['wrong Library / unavailable', () => ({ data: [], error: null })],
  ['wrong Question UUID', () => ({ data: [fullRow({ id: 'another-question' })], error: null })],
  ['wrong Primary UUID', () => ({ data: [fullRow({ concept_id: 'other-primary' })], error: null })],
  ['unsupported type', () => ({ data: [fullRow({ question_type: 'multiple_choice' })], error: null })],
  ['multiple accepted Answers', () => ({ data: [fullRow({ question_accepted_answers: [{ answer_text: 'One' }, { answer_text: 'Two' }] })], error: null })],
]) test(`${label}: no replacement, confirmation, navigation or write`, async () => {
  const h = setup({ response }); const before = dirty(h);
  // Use q2 as the old identity, so q1 is a genuine replacement request.
  render(h).selectQuestionSearchResult(question({ id: 'q2' })); render(h).setQuestionPrompt(before.front);
  render(h).setActiveCreatorTab('flagged'); const retained = snapshot(h), prompts = h.confirmations.length;
  await action(h).open('q1', 'primary');
  assert.equal(render(h).activeCreatorTab, 'flagged'); assert.deepEqual(snapshot(h), retained);
  assert.equal(h.confirmations.length, prompts); assert.equal(action(h).pending, false);
  assert.match(action(h).error, /current draft is unchanged/); assert.equal(h.calls.length, 0);
});

test('out-of-order reads and explicit selection cancellation cannot navigate or clear a newer pending read', async () => {
  const finishes = [];
  const h = setup({ response: () => new Promise(resolve => finishes.push(resolve)) });
  const first = action(h).open('q1', 'primary'); assert.equal(action(h).pending, true);
  const second = action(h).open('q2', 'primary');
  finishes[0]({ data: [fullRow()], error: null }); await first;
  assert.equal(render(h).activeCreatorTab, 'flagged'); assert.equal(action(h).pending, true);
  finishes[1]({ data: [fullRow({ id: 'q2' })], error: null }); await second;
  assert.equal(render(h).questionId, 'q2');
  render(h).setActiveCreatorTab('flagged'); const third = action(h).open('q1', 'primary');
  action(h).cancel(); finishes[2]({ data: [fullRow()], error: null }); await third;
  assert.equal(render(h).activeCreatorTab, 'flagged'); assert.equal(render(h).questionId, 'q2'); assert.equal(action(h).pending, false);
});

for (const change of ['draft', 'media', 'tab', 'Library', 'authority', 'unmount']) test(`a pending read cannot overwrite after ${change} changes`, async () => {
  let finish;
  const images = passiveQuestionImages();
  const h = setup({ questionImages: images, response: () => new Promise(resolve => { finish = resolve; }) });
  dirty(h); const cleanup = h.runEffect('cancelFlaggedQuestionEdit()');
  const pending = action(h).open('q2', 'primary');
  if (change === 'draft') render(h).setQuestionAnswer('Newer answer');
  if (change === 'media') images.pending = true;
  if (change === 'tab') render(h).setActiveCreatorTab('search');
  if (change === 'Library') {
    h.props.activeLibraryId = 'other-library';
    h.props.creatorCapabilities = deriveCreatorCapabilities({ role: 'admin', userId: 'owner', library: {
      activeLibraryId: 'other-library', canAccessActiveLibrary: true, canManageActiveLibrary: true,
    } });
  }
  if (change === 'authority') h.props.creatorCapabilities = deriveCreatorCapabilities({ role: 'learner', userId: 'owner', library: {
    activeLibraryId: 'library', canAccessActiveLibrary: true, canManageActiveLibrary: false,
  } });
  if (change === 'unmount') cleanup();
  const before = snapshot(h); finish({ data: [fullRow({ id: 'q2' })], error: null }); await pending;
  assert.deepEqual(snapshot(h), before); assert.equal(h.confirmations.length, 0); assert.equal(h.calls.length, 0);
});

test('busy media or an in-flight save blocks even a callback captured before the busy render', async () => {
  const images = passiveQuestionImages(); let finish;
  const h = setup({ questionImages: images, response(name) {
    if (name === 'save_question_with_format') return new Promise(resolve => { finish = resolve; });
  } });
  dirty(h); const edit = action(h); const saving = render(h).saveCurrentQuestion();
  await edit.open('q2', 'primary'); assert.equal(h.reads.filter(r => r.rpc === 'get_creator_questions_with_media').length, 0);
  finish({ data: null, error: { message: 'Synthetic save failure' } }); await saving;
  for (const state of [{ pending: true }, { pending: false, inspector: {} }, { inspector: null, uncertain: true }]) {
    Object.assign(images, state); await action(h).open('q2', 'primary');
    assert.equal(h.reads.filter(r => r.rpc === 'get_creator_questions_with_media').length, 0);
  }
  assert.equal(render(h).questionPrompt, 'ZZ FLAGGED unsaved Front');
});

test('learner has no official edit capability; colliding personal UUID never takes the same-official-Question shortcut', async () => {
  const learner = setup({ role: 'learner' }); assert.equal(action(learner), undefined);
  const h = setup({ response: () => ({ data: [fullRow({ id: 'mine-card' })], error: null }) });
  render(h).selectExistingQuestion(question({ source: 'personal', id: 'mine-card', conceptId: 'mine-concept' }));
  render(h).setQuestionAnswer('Unsaved personal answer'); render(h).setActiveCreatorTab('flagged');
  await action(h).open('mine-card', 'primary');
  assert.equal(h.confirmations.length, 1); assert.equal(render(h).questionSource, 'official');
  assert.equal(h.reads.filter(r => r.rpc === 'get_creator_questions_with_media').length, 1); assert.equal(h.calls.length, 0);
});

// Render and execute the real shared Flagged browser with strict, explicit imports.
function flaggedBrowser({ personal = false, learner = false, officialQuestionEditor } = {}) {
  const slots = [], reads = [], writes = []; let cursor = 0, load;
  const flag = { id: 'flag', question_id: personal ? null : 'q1', personal_card_id: personal ? 'q1' : null, note: 'Retained flag note', created_at: '2026-01-01T00:00:00Z' };
  let flags = [flag];
  const database = { from(table) {
    const filters = []; reads.push({ table, filters }); let deleting = false;
    const query = {
      select() { return query; }, eq(key, value) { filters.push([key, value]); return query; }, in(key, value) { filters.push([key, value]); return query; },
      order(key, value) { filters.push(['order', key, value]); return query; }, delete() { deleting = true; return query; },
      then(resolve) {
        if (deleting) { writes.push({ table, filters }); flags = []; }
        return Promise.resolve({ data: table === 'study_candidate_flags' ? flags : table === 'questions' ? [{ id: 'q1', concept_id: 'primary', prompt: 'Flagged Front' }] : [{ id: 'primary', name: 'Primary' }], error: null }).then(resolve);
      },
    }; return query;
  } };
  const modules = {
    react: { useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; }, useMemo: fn => fn(), useCallback: fn => { load = fn; return fn; }, useEffect() {} },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    '@/lib/supabase': { supabase: database }, '@/components/QuestionMediaContent': questionContentBoundary,
    '@/components/MarkdownContent': { cardMarkdownSummary: source => source, questionMarkdownSummary: source => source, questionMarkdownKind: () => 'plain', MarkdownContent: 'markdown' },
    './StudyCreatorIcon': { StudyCreatorIcon: 'icon' }, './StudyCreatorClient.module.css': { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) },
  };
  const context = { exports: {}, require(name) { assert.ok(name in modules, `Unexpected Flagged import: ${name}`); return modules[name]; } };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../components/StudyCreatorFlaggedBrowser.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  const props = { ownerId: 'owner', learnerPresentation: learner, neutralPresentation: true, officialQuestionEditor,
    material: { cards: [], standaloneCards: personal ? [{ id: 'q1', concept_id: null, question: 'Card Front', answer: 'Card Back' }] : [], concepts: [], topics: [], overlays: [] } };
  return { reads, writes, props, render() { cursor = 0; return context.exports.StudyCreatorFlaggedBrowser(props); }, async load() { await load(); } };
}
test('real Flagged Details exposes native Edit Question only for a resolved official Question with staff callback; listing and Unflag remain independent', async () => {
  const opened = []; let cancelled = 0;
  const capability = { open: async (...ids) => { opened.push(ids); }, cancel: () => cancelled++, pending: false, busy: false, error: '' };
  for (const options of [{}, { personal: true }, { learner: true }]) {
    const h = flaggedBrowser({ ...options, officialQuestionEditor: capability }); h.render(); await h.load();
    const buttons = nodes(h.render()).filter(n => n.type === 'button'); const edit = buttons.find(n => text(n) === 'Edit Question');
    assert.equal(Boolean(edit), !options.personal && !options.learner);
    if (edit) { assert.equal(edit.props.type, 'button'); edit.props.onClick(); assert.deepEqual(opened, [['q1', 'primary']]); }
    assert.match(text(h.render()), /Retained flag note/); assert.equal(h.writes.length, 0);
    assert.ok(h.reads.find(r => r.table === 'study_candidate_flags').filters.some(([key, value]) => key === 'user_id' && value === 'owner'));
    const rowButton = buttons.find(n => n.props.className?.startsWith('flaggedRow'));
    rowButton.props.onClick(); assert.ok(cancelled > 0); assert.equal(h.writes.length, 0);
    const search = nodes(h.render()).find(n => n.props['aria-label'] === 'Search flagged material');
    search.props.onChange({ target: { value: 'retained flag note' } }); assert.equal(nodes(h.render()).filter(n => n.props.className?.startsWith('flaggedRow')).length, 1);
    await buttons.find(n => text(n) === 'Unflag').props.onClick(); await settle();
    assert.equal(h.writes.length, 1); assert.deepEqual(plain(h.writes[0]), { table: 'study_candidate_flags', filters: [['id', 'flag'], ['user_id', 'owner']] });
  }
  const legacy = flaggedBrowser(); legacy.render(); await legacy.load();
  assert.equal(nodes(legacy.render()).some(n => text(n) === 'Edit Question'), false);
});

test('loading, busy and error states remain in Details without hiding existing notes or Unflag', async () => {
  const capability = { open: async () => {}, cancel() {}, pending: true, busy: false, error: '' };
  const h = flaggedBrowser({ officialQuestionEditor: capability }); h.render(); await h.load();
  const edit = () => nodes(h.render()).find(n => n.type === 'button' && /Opening Question|Edit Question/.test(text(n)));
  assert.equal(edit().props.disabled, true); assert.ok(nodes(h.render()).some(n => n.props.role === 'status'));
  capability.pending = false; capability.busy = true; assert.equal(edit().props.disabled, true);
  capability.busy = false; capability.error = 'Read failed; draft preserved'; assert.equal(edit().props.disabled, false);
  assert.ok(nodes(h.render()).some(n => n.props.role === 'alert' && text(n) === capability.error));
  assert.match(text(h.render()), /Retained flag note/); assert.ok(nodes(h.render()).some(n => n.type === 'button' && text(n) === 'Unflag'));
});
