import assert from 'node:assert/strict';
import test from 'node:test';
import { editor, nodes, expandChrome, text, question, row, settle } from './fixtures/creator-question-workflow.mjs';
import { deriveCreatorCapabilities } from '../lib/creator-capabilities.ts';
import { passiveQuestionImages } from './fixtures/question-media-authoring.mjs';

function render(h) {
  const e = h.render();
  h.runEffect('conceptNavigationLive.current =');
  return e;
}
function setup(options = {}) {
  const h = editor({
    placed: true,
    response(name) {
      if (name === 'get_concept_tags' || name === 'get_concept_prerequisites') return { data: [], error: null };
      if (name === 'get_creator_questions_with_media') return { data: [row()], error: null };
    },
    readResponse(table, filters) {
      const id = filters.find(([key]) => key === 'id')?.[1] || 'primary';
      if (table === 'concepts') return { data: { id, name: 'Correct Concept', body_markdown: '**Saved explanation**',
        body_format: 'visual_markdown_v1', status: 'published', current_version_id: 'concept-version',
        updated_at: '2026-10-20T10:00:00Z' }, error: null };
      if (table === 'concept_placements') return { data: [{ library_node_id: 'topic' }], error: null };
      return { data: [], error: null };
    },
    ...options,
  });
  render(h).setQuestionConceptsByTopicId({ topic: [{ id: 'primary', name: 'Primary' }, { id: 'related', name: 'Related' }] });
  render(h).selectQuestionSearchResult(question({ currentVersionId: 'v1', promptFormat: 'visual_markdown_v1', answerFormat: 'visual_markdown_v1' }));
  render(h);
  return h;
}
const mutations = h => h.calls.filter(c => c.table || !/^(get_|search_)/.test(c.name));
function questionSnapshot(h) {
  const e = render(h);
  return JSON.stringify([e.questionId, e.questionPrompt, e.questionAnswer, e.currentQuestionFingerprint, e.savedQuestionFingerprint,
    e.questionCanonicalRecord, e.questionRelatedConceptIds, e.questionTags, e.questionTopicId, e.questionConceptId]);
}

for (const origin of ['questions', 'flagged']) {
  test(`${origin}: exact existing Concept and Library open without writes; origin and focus return`, async () => {
    const authorizations = [];
    const h = setup({ authorizeNavigation: async input => { authorizations.push(input); return true; } });
    render(h).setActiveCreatorTab(origin);
    const before = questionSnapshot(h);
    await render(h).openConceptForEditing('primary', 'q1', `${origin}-trigger`);
    let e = render(h);
    assert.equal(e.activeCreatorTab, 'content');
    assert.equal(e.conceptId, 'primary');
    assert.equal(e.concept, '**Saved explanation**');
    assert.equal(e.isContentDirty, false);
    assert.deepEqual(JSON.parse(JSON.stringify(authorizations)), [{ conceptId: 'primary', questionId: 'q1', libraryId: 'library' }]);
    assert.ok(h.reads.some(r => r.table === 'concept_placements' && r.filters.some(([k, v]) => k === 'library_nodes.library_id' && v === 'library')));
    if (origin === 'flagged') {
      const retained = nodes(e.tree).find(n => n.type === 'div' && n.props.hidden === true);
      assert.ok(retained, 'Flagged workspace stays mounted to preserve selection and search');
    }
    assert.equal(mutations(h).length, 0);
    e.returnFromConcept(); e = render(h);
    assert.equal(e.activeCreatorTab, origin);
    assert.equal(questionSnapshot(h), before);
    h.runEffect('if (!conceptNavigationFocus.current)');
    assert.equal(h.focusTarget.count, 1);
    assert.equal(h.routes.length, 0);
  });
}

test('Admin gets distinct View and Edit actions; Editor retains only existing View and Learner gets neither', () => {
  for (const role of ['admin', 'editor', 'learner']) {
    const h = setup({ role });
    const controls = nodes(render(h).renderQuestionConceptPreviewAction('official', 'primary', 'Primary'));
    const labels = controls.filter(n => n.type === 'button').map(n => text(n).trim());
    assert.deepEqual(labels, role === 'admin' ? ['View Concept', 'Edit Concept'] : role === 'editor' ? ['View Concept'] : []);
    const flagged = nodes(expandChrome(render(h).tree)).filter(n => n.type?.name === 'StudyCreatorFlaggedBrowser');
    assert.equal(flagged.length, 0);
    render(h).setActiveCreatorTab('flagged');
    const browser = nodes(expandChrome(render(h).tree)).find(n => n.type?.name === 'StudyCreatorFlaggedBrowser');
    assert.equal(Boolean(browser.props.officialConceptEditor), role === 'admin');
  }
});

test('View Concept remains a read-only preview and never calls the new editing gate', () => {
  let reads = 0;
  const h = setup({ authorizeNavigation: async () => { reads++; return true; } });
  const e = render(h), before = questionSnapshot(h);
  const view = nodes(e.renderQuestionConceptPreviewAction('official', 'primary', 'Primary')).find(n => n.type === 'button' && text(n) === 'View Concept');
  view.props.onClick({ stopPropagation() {} });
  assert.equal(render(h).questionConceptPreview.target.id, 'primary');
  assert.equal(questionSnapshot(h), before); assert.equal(reads, 0); assert.equal(mutations(h).length, 0);
});

test('canceling Question discard preserves every draft and does not load the Concept', async () => {
  const h = setup({ confirm: () => false });
  render(h).setQuestionPrompt('Unsaved question');
  const before = questionSnapshot(h);
  await render(h).openConceptForEditing('primary', 'q1', 'trigger');
  assert.equal(render(h).activeCreatorTab, 'questions');
  assert.equal(questionSnapshot(h), before);
  assert.deepEqual(h.confirmations, ['Discard the unsaved changes to this question?']);
  assert.equal(h.reads.filter(r => r.table === 'concepts').length, 0);
});

test('explicit Question discard restores the saved Question; saving first retains the saved revision', async () => {
  for (const saveFirst of [false, true]) {
    const h = setup(); render(h).setQuestionPrompt('Edited question');
    if (saveFirst) await render(h).saveCurrentQuestion();
    const writesBefore = mutations(h).length;
    await render(h).openConceptForEditing('primary', 'q1', 'trigger');
    render(h).returnFromConcept();
    const e = render(h);
    assert.equal(e.questionPrompt, saveFirst ? 'Edited question' : 'Question?');
    assert.equal(e.isQuestionDirty, false);
    assert.equal(h.confirmations.length, saveFirst ? 0 : 1);
    assert.equal(mutations(h).length, writesBefore, 'navigation does not save automatically');
  }
});

test('discard after a previous save reloads the latest persisted metadata, not stale editor metadata', async () => {
  const saved = row({ prompt: 'Latest saved Question', difficulty: 'hard', status: 'archived',
    related_concepts: [], additional_testing_angles: ['Clinical Application'],
    question_tags: [{ tags: { id: 'saved-tag', name: 'Saved tag', slug: 'saved-tag', status: 'active' } }] });
  const h = setup({ response: name => name === 'get_creator_questions_with_media' ? { data: [saved], error: null }
    : ['get_concept_tags', 'get_concept_prerequisites'].includes(name) ? { data: [], error: null } : undefined });
  render(h).setQuestionPrompt('Latest saved Question'); await render(h).saveCurrentQuestion();
  render(h).setQuestionPrompt('Second unsaved edit');
  await render(h).openConceptForEditing('primary', 'q1', 'trigger'); render(h).returnFromConcept();
  const e = render(h);
  assert.equal(e.questionPrompt, 'Latest saved Question'); assert.equal(e.questionDifficulty, 'hard');
  assert.equal(e.questionRecordStatus, 'archived'); assert.equal(e.questionTags[0].id, 'saved-tag');
  assert.deepEqual([...e.questionAdditionalTestingAngles], ['Clinical Application']);
  assert.equal(e.isQuestionDirty, false);
});

test('failed Question save retains draft and canceling navigation retains it again', async () => {
  const h = setup({ confirm: () => false, response: name => name === 'save_question_with_format' ? { data: null, error: { message: 'Save unavailable' } } : undefined });
  render(h).setQuestionAnswer('Retained answer');
  await render(h).saveCurrentQuestion();
  assert.equal(render(h).isQuestionDirty, true);
  await render(h).openConceptForEditing('primary', 'q1', 'trigger');
  assert.equal(render(h).questionAnswer, 'Retained answer');
  assert.equal(render(h).activeCreatorTab, 'questions');
});

test('Concept return cancels safely, saves explicitly, or discards only after confirmation', async () => {
  for (const disposition of ['cancel', 'save', 'discard', 'failed-save']) {
    const h = setup({ confirm: () => disposition === 'discard',
      ...(disposition === 'failed-save' ? { response: name => name === 'save_concept_with_format'
        ? { data: null, error: { message: 'Save unavailable' } } : { data: [], error: null } } : {}) });
    await render(h).openConceptForEditing('primary', 'q1', 'trigger');
    render(h).setConcept('Changed explanation');
    if (disposition.includes('save')) await render(h).saveCurrentConcept();
    const before = mutations(h).length;
    render(h).returnFromConcept();
    const e = render(h);
    assert.equal(e.activeCreatorTab, ['cancel', 'failed-save'].includes(disposition) ? 'content' : 'questions');
    if (['cancel', 'failed-save'].includes(disposition)) {
      assert.equal(e.concept, 'Changed explanation'); assert.equal(e.isContentDirty, true);
    }
    assert.equal(mutations(h).length, before);
  }
});

for (const [name, options] of [
  ['gate denial', { authorizeNavigation: async () => false }],
  ['gate network failure', { authorizeNavigation: async () => { throw Error('Offline'); } }],
  ['missing Concept', { readResponse: () => ({ data: null, error: null }) }],
  ['inaccessible Concept', { readResponse: () => ({ data: null, error: { message: 'RLS denied' } }) }],
  ['wrong identity', { readResponse: table => ({ data: table === 'concepts' ? { id: 'other' } : [{ library_node_id: 'topic' }], error: null }) }],
  ['read transport failure', { readResponse: () => { throw Error('Offline'); } }],
]) test(`${name} preserves drafts and origin; never navigates or writes`, async () => {
  const h = setup(options); render(h).setQuestionPrompt('Unsaved');
  const before = questionSnapshot(h);
  await render(h).openConceptForEditing('primary', 'q1', 'trigger');
  assert.equal(render(h).activeCreatorTab, 'questions');
  assert.equal(questionSnapshot(h), before);
  assert.equal(mutations(h).length, 0);
});

test('stale authorization results, changed drafts and duplicate clicks cannot navigate', async () => {
  for (const change of ['draft', 'tab', 'library', 'actor', 'role']) {
    let resolve, requests = 0;
    const h = setup({ authorizeNavigation: () => { requests++; return new Promise(r => { resolve = r; }); } });
    const pending = render(h).openConceptForEditing('primary', 'q1', 'trigger');
    await render(h).openConceptForEditing('primary', 'q1', 'trigger');
    assert.equal(requests, 1);
    if (change === 'actor') {
      // The application remounts the owner-scoped workspace for another actor.
      // Exercise its cleanup before resolving the old actor's pending read.
      h.runEffect('() => cancelConceptNavigation()')();
      resolve(true); await pending;
      assert.equal(h.reads.filter(r => r.table === 'concepts').length, 0);
      assert.equal(render(h).activeCreatorTab, 'questions');
      continue;
    }
    if (change === 'draft') render(h).setQuestionPrompt('New draft during read');
    if (change === 'tab') render(h).setActiveCreatorTab('tags');
    if (change === 'library') h.props.activeLibraryId = 'elsewhere';
    if (['library', 'role'].includes(change)) h.props.creatorCapabilities = deriveCreatorCapabilities({
      role: change === 'role' ? 'editor' : 'admin', userId: 'owner',
      library: { activeLibraryId: h.props.activeLibraryId, canAccessActiveLibrary: true, canManageActiveLibrary: true },
    });
    render(h); resolve(true); await pending;
    assert.notEqual(render(h).activeCreatorTab, 'content');
    assert.equal(h.reads.filter(r => r.table === 'concepts').length, 0);
  }
});

test('stale Concept reads never overwrite a newly changed draft; safe retry succeeds', async () => {
  let finish;
  const h = setup({ readResponse: table => table === 'concepts' ? new Promise(r => { finish = r; })
    : { data: table === 'concept_placements' ? [{ library_node_id: 'topic' }] : table === 'questions' ? [row()] : [], error: null } });
  const pending = render(h).openConceptForEditing('primary', 'q1', 'trigger');
  await settle();
  render(h).setQuestionPrompt('Changed during destination read'); render(h);
  finish({ data: { id: 'primary', name: 'Correct', body_markdown: 'Body' }, error: null });
  await pending;
  assert.equal(render(h).activeCreatorTab, 'questions');
  assert.equal(render(h).questionPrompt, 'Changed during destination read');
  assert.equal(render(h).concept, '');
  const retry = render(h).openConceptForEditing('primary', 'q1', 'trigger'); await settle();
  finish({ data: { id: 'primary', name: 'Correct', body_markdown: 'Body' }, error: null }); await retry;
  assert.equal(render(h).activeCreatorTab, 'content');
});

test('non-Admin handlers, unassociated Concepts and busy saves cannot invoke navigation', async () => {
  for (const role of ['learner', 'editor']) {
    const h = setup({ role, authorizeNavigation: async () => { assert.fail('Unauthorized gate call'); } });
    await render(h).openConceptForEditing('primary', 'q1', 'trigger');
  }
  let called = false;
  const images = passiveQuestionImages(); images.pending = true;
  const h = setup({ questionImages: images, authorizeNavigation: async () => { called = true; return true; } });
  await render(h).openConceptForEditing('primary', 'q1', 'trigger');
  images.pending = false;
  await render(h).openConceptForEditing('unrelated', 'q1', 'trigger');
  assert.equal(called, false);
});
