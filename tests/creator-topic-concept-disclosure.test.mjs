import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveCreatorCapabilities } from '../lib/creator-capabilities.ts';
import { editor, nodes, text, expandChrome, question, row, settle } from './fixtures/creator-question-workflow.mjs';
import { planTopicPosition } from '../lib/creator-topic-positioning.ts';

const plain = value => JSON.parse(JSON.stringify(value));
const event = () => ({ stopPropagation() {} });
const placements = [
  { library_node_id: 'a', concepts: { id: 'shared', name: 'Shared Concept' } },
  { library_node_id: 'b', concepts: { id: 'shared', name: 'Shared Concept' } },
  { library_node_id: 'b', concepts: { id: 'unique', name: 'Unique Concept' } },
];
function fixture(options = {}) {
  const h = editor({ placed: true, ...options });
  h.props.initialTopics = [{ id: 'topic', name: 'Root', children: [
    { id: 'a', name: 'A', children: [] }, { id: 'b', name: 'B', children: [] }, { id: 'empty', name: 'Empty', children: [] },
  ] }];
  h.props.initialPersonalContent.topics.push({ id: 'mine-child', owner_id: 'owner', parent_id: 'mine-topic', name: 'Personal Child', sort_order: 0 });
  h.props.initialPersonalContent.concepts.push({ id: 'shared', owner_id: 'owner', topic_id: 'mine-child', name: 'Shared Concept', description: '' });
  h.props.initialPersonalContent.overlays.push({ id: 'overlay', owner_id: 'owner', personal_concept_id: 'shared', library_node_id: 'a' });
  h.render().setQuestionConceptsByTopicId({ topic: [], a: [{ id: 'shared', name: 'Shared Concept' }], b: [
    { id: 'shared', name: 'Shared Concept' }, { id: 'unique', name: 'Unique Concept' },
  ], empty: [] });
  h.render().setConceptPlacementStatus('ready');
  return h;
}
function topics(h) {
  const root = h.render().visibleTopicComposition.officialRoots[0];
  return { root, a: root.children.find(t => t.id === 'a'), b: root.children.find(t => t.id === 'b'), empty: root.children.find(t => t.id === 'empty'), personal: root.children.find(t => t.id === 'mine-topic') };
}
function tree(h, topic, workspace = 'content') {
  const e = h.render();
  return workspace === 'content' ? e.renderUnifiedTopic(topic) : e.renderUnifiedQuestionTopic(topic);
}
function countControl(h, topic, workspace = 'content') {
  return nodes(tree(h, topic, workspace)).find(n => n.props?.['data-concept-disclosure'] === workspace);
}
function toggle(h, topic, workspace = 'content') {
  const control = countControl(h, topic, workspace);
  assert.ok(control); assert.equal(control.props.disabled, false);
  control.props.onClick(event());
}
function list(h, topic, workspace = 'content') {
  return nodes(tree(h, topic, workspace)).find(n => n.props?.id === `${workspace}-concepts-${topic.key}`);
}
function draftSnapshot(e) {
  return plain({ concept: e.concept, conceptState: e.conceptEditorState, placements: Array.from(e.selectedTopicIds),
    front: e.questionPrompt, answer: e.questionAnswer, fingerprint: e.currentQuestionFingerprint,
    saved: e.savedQuestionFingerprint, state: e.questionEditorState, primary: e.primaryQuestionConceptId,
    related: e.questionRelatedConceptIds, browse: e.questionConceptId, topic: e.questionTopicId,
    contentDirty: e.isContentDirty, questionDirty: e.isQuestionDirty });
}

for (const role of ['admin', 'editor']) {
  test(`${role}: subtree counts match deduplicated lists and retain source-qualified placement identities`, () => {
    const h = fixture({ role }); const t = topics(h);
    for (const workspace of ['content', 'questions']) {
      for (const [topic, expected] of [[t.root, 2], [t.a, 2], [t.b, 2], [t.personal, 2], [t.empty, 0]]) {
        assert.equal(text(countControl(h, topic, workspace)), expected ? `${expected} concepts` : 'No concepts');
        assert.equal(list(h, topic, workspace), undefined, 'Every list starts collapsed, including expanded roots/leaves');
        if (!expected) { assert.equal(countControl(h, topic, workspace).props.disabled, true); continue; }
        toggle(h, topic, workspace);
        const entries = [list(h, topic, workspace).props.children].flat();
        assert.equal(entries.length, expected);
        assert.equal(new Set(entries.map(e => e.key)).size, expected);
        assert.equal(countControl(h, topic, workspace).props['aria-expanded'], true);
        toggle(h, topic, workspace); assert.equal(list(h, topic, workspace), undefined);
      }
    }
    assert.deepEqual(plain(h.render().conceptsForTopicDisclosure(t.root).map(c => [c.id, c.topicId])), [['shared', 'a'], ['unique', 'b']]);
    assert.deepEqual(plain(h.render().conceptsForTopicDisclosure(t.a).map(c => [c.source, c.id, c.topicId])), [
      ['official', 'shared', 'a'], ['personal', 'shared', 'mine-child'],
    ]);
    assert.equal(h.calls.length, 0); assert.equal(h.reads.length, 0);
  });

  test(`${role}: disclosures are independent of hierarchy, activation, placement, section and dirty state`, () => {
    const h = fixture({ role }); const { root } = topics(h);
    h.render().setConcept('Unsaved Concept');
    h.render().selectQuestionSearchResult(question({ conceptId: 'shared' }));
    h.render().setQuestionAnswer('Unsaved Answer');
    const before = draftSnapshot(h.render());
    const hierarchy = Array.from(h.render().expandedTopicIds);
    const active = h.render().activeTopicId;
    toggle(h, root); assert.ok(list(h, root));
    assert.deepEqual(Array.from(h.render().expandedTopicIds), hierarchy);
    assert.equal(h.render().activeTopicId, active);
    assert.equal(list(h, root, 'questions'), undefined);
    toggle(h, root, 'questions');
    h.render().toggleExpanded('topic');
    assert.ok(list(h, root)); assert.ok(list(h, root, 'questions'));
    toggle(h, root); assert.equal(list(h, root), undefined); assert.ok(list(h, root, 'questions'));
    assert.deepEqual(draftSnapshot(h.render()), before);
    assert.equal(h.calls.length, 0); assert.equal(h.reads.length, 0); assert.equal(h.confirmations.length, 0);
    const control = countControl(h, root, 'questions');
    assert.equal(control.type, 'button'); assert.equal(control.props.type, 'button');
    assert.equal(control.props['aria-controls'], list(h, root, 'questions').props.id);
    assert.equal(control.props.onKeyDown, undefined, 'Native Enter/Space behavior is retained');
    const dropRow = nodes(tree(h, root)).find(n => n.type?.name === 'TopicDropRow');
    assert.equal(nodes(dropRow).filter(n => n.type?.name === 'TopicDragHandle').length, 1);
    assert.equal(nodes(list(h, root, 'questions')).filter(n => n.type?.name === 'TopicDropRow' || n.type?.name === 'TopicDragHandle').length, 0);
  });

  test(`${role}: Content disclosures reuse official opening and owner-qualified personal opening with existing discard guards`, async () => {
    let approve = false;
    const h = fixture({ role, confirm: () => approve }); const t = topics(h);
    toggle(h, t.root);
    h.render().setConcept('Dirty Concept');
    const open = () => nodes(list(h, t.root)).find(n => n.type === 'button' && n.key === 'official:concept:unique').props.onClick();
    await open(); assert.equal(h.routes.length, 0); assert.equal(h.render().concept, 'Dirty Concept');
    approve = true; await open(); assert.equal(h.routes.at(-1), '/creator/concepts/unique');
    assert.equal(h.calls.length, 0);
    toggle(h, t.personal);
    nodes(list(h, t.personal)).find(n => n.key === 'personal:concept:shared').props.onClick();
    assert.equal(h.render().conceptEditorState.identity.key, 'personal:concept:shared');
    assert.equal(h.render().conceptEditorState.ownerId, 'owner');
  });

  test(`${role}: descendant Question browsing uses its real placement; associations and duplicate placements stay synchronized`, () => {
    const h = fixture({ role }); const t = topics(h);
    h.render().setActiveCreatorTab('questions');
    toggle(h, t.root, 'questions'); toggle(h, t.b, 'questions');
    let view = list(h, t.root, 'questions');
    nodes(view).find(n => n.props?.['aria-label'] === 'Associate Shared Concept with Question').props.onChange({ target: { checked: true } });
    view = list(h, t.root, 'questions');
    nodes(view).find(n => n.props?.['aria-label'] === 'Associate Unique Concept with Question').props.onChange({ target: { checked: true } });
    h.render().setQuestionPrompt('Draft'); h.render().setQuestionAnswer('Answer');
    const before = draftSnapshot(h.render());
    nodes(list(h, t.root, 'questions')).find(n => n.props?.['aria-label'] === 'Browse Questions for Unique Concept').props.onClick();
    assert.equal(h.render().questionConceptId, 'unique'); assert.equal(h.render().questionTopicId, 'b');
    assert.equal(h.render().primaryQuestionConceptId, before.primary); assert.equal(h.render().currentQuestionFingerprint, before.fingerprint);
    nodes(list(h, t.root, 'questions')).find(n => n.props?.['aria-label'] === 'Make Unique Concept Primary').props.onClick();
    assert.equal(h.render().primaryQuestionConceptId, 'unique'); assert.deepEqual(plain(h.render().questionRelatedConceptIds), ['shared']);
    for (const topic of [t.root, t.b]) {
      const primary = nodes(list(h, topic, 'questions')).find(n => n.props?.['aria-label'] === 'Associate Unique Concept with Question');
      assert.equal(primary.props.checked, true); assert.equal(primary.props.disabled, true);
    }
    assert.equal(h.calls.length, 0); assert.equal(h.confirmations.length, 0);
  });

  test(`${role}: Needs Questions and Topic search preserve totals and associations without opening lists`, () => {
    const h = fixture({ role }); const { root } = topics(h);
    h.render().setQuestionCountsByConceptId({ shared: 2, unique: 0 });
    h.render().setNeedsQuestionsOnly(true); h.render().setSearchQuery('Root');
    assert.equal(list(h, root, 'questions'), undefined);
    toggle(h, root, 'questions');
    assert.equal(text(countControl(h, root, 'questions')), '2 concepts');
    assert.equal(nodes(list(h, root, 'questions')).filter(n => n.props?.['aria-label']?.startsWith('Associate ')).length, 1);
    h.render().associateQuestionConcept('shared', true);
    assert.equal(nodes(list(h, root, 'questions')).filter(n => n.props?.['aria-label']?.startsWith('Associate ')).length, 2);
    toggle(h, root, 'questions'); assert.equal(list(h, root, 'questions'), undefined);
  });
}

test('Content loads authorized placements without Browse Concepts; incomplete/failed reads never show confirmed zero', async () => {
  let resolveRead;
  const h = editor({ readResponse: table => table === 'concept_placements' ? new Promise(resolve => { resolveRead = resolve; }) : undefined });
  const root = h.render().visibleTopicComposition.officialRoots[0];
  assert.equal(h.render().isConceptBrowseOpen, false);
  assert.equal(text(countControl(h, root)), 'Loading concepts…'); assert.equal(countControl(h, root).props.disabled, true);
  h.runEffect('async function loadQuestionConceptPlacements'); await settle();
  assert.deepEqual(h.reads.find(r => r.table === 'concept_placements').filters, [['library_node_id', ['topic']]]);
  resolveRead({ data: null, error: { message: 'offline' } }); await settle();
  assert.equal(text(countControl(h, root)), 'Concepts unavailable'); assert.equal(countControl(h, root).props.disabled, true);
  h.render(); h.runEffect('async function loadQuestionConceptPlacements'); await settle();
  resolveRead({ data: [], error: null }); await settle();
  assert.equal(text(countControl(h, root)), 'No concepts');
  assert.equal(h.calls.length, 0);
});

test('stale placement reads cannot become accepted counts; ready reads are reused across staff sections', async () => {
  const pending = [];
  const h = editor({ readResponse: table => table === 'concept_placements' ? new Promise(resolve => pending.push(resolve)) : undefined });
  h.render(); const cancel = h.runEffect('async function loadQuestionConceptPlacements'); await settle(); cancel();
  h.props.activeLibraryId = 'next-library';
  h.props.creatorCapabilities = deriveCreatorCapabilities({role:'admin',userId:'owner',library:{activeLibraryId:'next-library',canAccessActiveLibrary:true,canManageActiveLibrary:true}}); h.render(); h.runEffect('async function loadQuestionConceptPlacements'); await settle();
  pending[1]({ data: [{ library_node_id: 'topic', concepts: { id: 'new', name: 'New Library Concept' } }], error: null }); await settle();
  pending[0]({ data: [{ library_node_id: 'topic', concepts: { id: 'stale', name: 'Stale Concept' } }], error: null }); await settle();
  assert.deepEqual(plain(h.render().questionConceptsByTopicId.topic), [{ id: 'new', name: 'New Library Concept' }]);
  h.render().setActiveCreatorTab('questions'); h.render(); h.runEffect('async function loadQuestionConceptPlacements'); await settle();
  assert.equal(pending.length, 2); assert.equal(h.render().conceptPlacementStatus, 'ready');
});

test('authoritative structural readback updates subtree counts without changing placements, drafts or disclosure identity', async () => {
  const h = fixture({ response: name => name === 'position_library_node_in_library' ? { data: {}, error: null } : undefined,
    readResponse: table => ({ data: table === 'library_nodes' ? [
      { id: 'topic', parent_id: null, name: 'Root', sort_order: 0 },
      { id: 'a', parent_id: 'topic', name: 'A', sort_order: 0 },
      { id: 'b', parent_id: 'a', name: 'B', sort_order: 0 },
      { id: 'empty', parent_id: 'topic', name: 'Empty', sort_order: 1 },
    ] : table === 'concept_placements' ? placements : [], error: null }) });
  const t = topics(h); toggle(h, t.a); h.render().setConcept('Preserved draft');
  const before = draftSnapshot(h.render());
  await h.render().positionTopicFromTree(planTopicPosition(h.render().positioningContext, 'official:topic:b', 'official:topic:a', 'inside'));
  h.render(); h.runEffect('async function loadQuestionConceptPlacements'); await settle();
  const after = topics(h);
  assert.equal(after.a.children[0].id, 'b');
  assert.equal(text(countControl(h, after.a)), '3 concepts');
  assert.equal([list(h, after.a).props.children].flat().length, 3);
  assert.deepEqual(draftSnapshot(h.render()), before);
  assert.deepEqual(h.calls.map(c => c.name), ['position_library_node_in_library']);
});

test('learner workspace has no new authoring disclosure and does not load staff placement data', () => {
  const h = fixture({ role: 'learner' });
  assert.equal(nodes(expandChrome(h.render().tree)).filter(n => n.props?.['data-concept-disclosure'] || n.props?.['data-concept-list']).length, 0);
  h.runEffect('async function loadQuestionConceptPlacements'); assert.equal(h.reads.length, 0);
  assert.equal(h.render().creatorAuthority.canSaveConcept, false); assert.equal(h.render().creatorAuthority.canSaveQuestion, false);
});

test('Flagged handoff context and dirty same-Question retention coexist with collapsed disclosures', async () => {
  const h = fixture({ response: name => name === 'get_creator_questions_with_media' ? { data: [row({ concept_id: 'unique' })], error: null } : undefined });
  h.render().setActiveCreatorTab('flagged'); h.render(); h.runEffect('flaggedQuestionCompletion.current =');
  const flagged = nodes(expandChrome(h.render().tree)).find(n => n.type?.name === 'StudyCreatorFlaggedBrowser');
  await flagged.props.officialQuestionEditor.open('q1', 'unique');
  const e = h.render();
  assert.equal(e.questionId, 'q1'); assert.equal(e.primaryQuestionConceptId, 'unique'); assert.equal(e.questionTopicId, 'b');
  assert.equal(list(h, topics(h).root, 'questions'), undefined);
  e.setQuestionAnswer('Retained dirty Answer'); const before = draftSnapshot(h.render());
  toggle(h, topics(h).root, 'questions'); toggle(h, topics(h).root, 'questions');
  h.render().selectQuestionSearchResult(question({ conceptId: 'unique' }));
  assert.deepEqual(draftSnapshot(h.render()), before); assert.equal(h.calls.length, 0);
});
