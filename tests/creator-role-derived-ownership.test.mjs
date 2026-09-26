import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { deriveCreatorCapabilities } from '../lib/creator-capabilities.ts';
import { resolveCreatorCommandRoute } from '../lib/creator-command-contracts.ts';
import * as entityContracts from '../lib/creator-entity-contracts.ts';
import { buildConceptTopicTree } from '../lib/concept-topic-tree.ts';
import {
  composeUnifiedCreatorTopicTree,
  flattenUnifiedCreatorTopics,
  shouldShowPersonalCreatorTopics,
} from '../lib/creator-unified-topic-tree.ts';

// Execute the actual component's save handlers with in-memory hooks and database
// responses. Effects are intentionally excluded: these are transaction/state
// regression tests, not browser or database integration tests.
const source = readFileSync(new URL('../components/CreatorStudioV2Client.tsx', import.meta.url), 'utf8');
const runtimeContext = { exports: {}, require: () => entityContracts };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/creator-studio-runtime.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, runtimeContext);
const exposed = [
  'creationDestination', 'conceptEditorState', 'questionEditorState', 'conceptSource', 'questionSource',
  'openAddDialog', 'openPersonalTopicDialog', 'saveNameDialog', 'setNameDraft', 'dialogMode',
  'startNewQuestion', 'openPersonalConcept', 'selectPersonalQuestionConcept', 'selectQuestionConcept',
  'saveCurrentConcept', 'saveCurrentQuestion', 'clearDraft', 'setConceptName', 'setActivePersonalTopicId',
  'setActiveCreatorTab', 'showPersonalCreatorTopics', 'visibleTopicComposition',
  'setConceptEditorState', 'setQuestionEditorState', 'setSearchQuery', 'setIsConceptBrowseOpen',
  'openRenameDialog', 'setDialogMode',
  'isCurrentContentReadOnly', 'isCurrentQuestionReadOnly', 'questionStatus',

  'saveConcept', 'saveQuestion', 'startNewConcept', 'selectExistingQuestion',
  'setConcept', 'setConceptRecordStatus', 'setQuestionPrompt', 'setQuestionAnswer',
  'setQuestionDifficulty', 'setQuestionTestingAngle', 'setQuestionRecordStatus',
  'conceptId', 'concept', 'conceptRecordStatus', 'selectedTopicIds', 'references',
  'questionId', 'questionPrompt', 'questionAnswer', 'questionConceptId',
  'questionDifficulty', 'questionTestingAngle', 'questionRecordStatus',
  'isContentDirty', 'isQuestionDirty', 'isSaving', 'isSavingQuestion',
  'questionConceptsByTopicId', 'status',
].join(', ');
const compiled = ts.transpileModule(source.replace(
  '  return (\n    <>\n      <Header />',
  `  capture({ ${exposed} });\n  return (\n    <>\n      <Header />`,
), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;

function editor({ role = 'admin', editing = false, response, references = [], cards = true } = {}) {
  const slots = [];
  let cursor = 0;
  let api;
  const calls = [];
  const orders = [];
  const routes = [];
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useMemo: fn => fn(),
    useCallback: fn => fn,
    useEffect: () => {},
  };
  const database = {
    rpc(name, payload) {
      const result = rpcResult(name, payload);
      return Object.assign(Promise.resolve(result), { single: async () => result });
    },
    from(table) {
      let mutation; const filters = [];
      const query = {
        select() { return query; }, eq(key, value) { filters.push([key, value]); return query; },
        order() { return query; }, in() { return query; },
        insert(values) { mutation = { table, operation: 'insert', values, filters }; calls.push(mutation); return query; },
        update(values) { mutation = { table, operation: 'update', values, filters }; calls.push(mutation); return query; },
        delete() { mutation = { table, operation: 'delete', filters }; calls.push(mutation); return query; },
        single: async () => ({ data: { id: filters.find(([key]) => key === 'id')?.[1] || 'saved-personal', ...mutation?.values }, error: null }),
        then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); },
      };
      return query;
    },
  };
  function rpcResult(name, payload) {
      if (name === 'get_creator_questions') return { data: [], error: null };
      calls.push({ name, payload });
      if (response) return response(name, payload);
      if (name === 'create_personal_topic') return { data: { id: 'new-topic', owner_id: 'owner', name: payload.p_name, parent_id: payload.p_parent_personal_topic_id }, error: null };
      if (name === 'create_library_node_in_library') return { data: { id: 'new-official-topic' }, error: null };
      if (name === 'save_personal_concept_with_overlay') return { data: { personal_concept_id: payload.p_personal_concept_id, owner_id: 'owner', topic_id: payload.p_personal_topic_id, concept_name: payload.p_name, concept_description: payload.p_description }, error: null };

      return { data: name === 'save_question_with_relationships_v2'
        ? { id: payload.p_question_id || 'saved-question' }
        : { concept_id: payload.p_concept_id || 'saved-concept', references: payload.p_references.map(r => ({
          client_id: r.client_id, source_id: 'source', attribution_id: 'attribution',
        })) }, error: null };
  }
  const modules = {
    react: hooks,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'next/navigation': { useRouter: () => ({ push: path => routes.push(path), replace: path => routes.push(path), refresh: () => routes.push('refresh') }) },
    'lucide-react': {},
    '@/components/Header': {},
    '@/components/MarkdownContent': {},
    '@/components/creator/CreatorStudioChrome': {
      CreatorStudioLocalHeader() {},
      CreatorStudioSaveToolbar() {},
      CreatorStudioTabs() {},
    },
    '@/lib/concept-topic-tree': { buildConceptTopicTree },
    '@/lib/supabase': { supabase: database },
    '@/lib/safe-navigation': {},
    '@/lib/tag-catalog-invalidation': { broadcastTagCatalogUsageInvalidation() {} },
    '@/lib/creator-capabilities': {},
    '@/lib/creator-command-contracts': { resolveCreatorCommandRoute },
    '@/lib/creator-entity-contracts': { createCreatorEntityKey: (source, kind, id) => `${source}:${kind}:${id}` },
    '@/lib/creator-unified-topic-tree': {
      composeUnifiedCreatorTopicTree,
      flattenUnifiedCreatorTopics,
      shouldShowPersonalCreatorTopics,
    },
    '@/lib/creator-studio-runtime': runtimeContext.exports,
    './CreatorAlgorithmDiagnostics': {},
    './CreatorStudioV2Client.module.css': { default: {} },
  };
  const context = {
    exports: {}, capture: value => { api = value; },
    require(name) { assert.ok(name in modules, `Unexpected import: ${name}`); return modules[name]; },
    document: { activeElement: null }, HTMLElement: class {},
    window: { requestAnimationFrame: fn => fn(), confirm: () => true, history: { replaceState: (_a, _b, path) => routes.push(path) } },
  };
  vm.runInNewContext(compiled, context);
  const props = {
    activeLibraryId: 'library',
    creatorCapabilities: deriveCreatorCapabilities({ role, userId: 'owner', library: {
      activeLibraryId: 'library', canAccessActiveLibrary: true, canManageActiveLibrary: role !== 'learner',
    } }),
    initialTopics: [{ id: 'topic', name: 'Topic', children: [] }],
    initialConcept: { id: editing ? 'existing-concept' : null, name: '', bodyMarkdown: '', placementIds: ['topic'] },
    initialReferences: references,
    initialPersonalContent: { ownerId: 'owner',
      topics: [{ id: 'mine-topic', owner_id: 'owner', parent_id: null, name: 'Personal Topic', sort_order: 0 }],
      concepts: [{ id: 'mine-concept', owner_id: 'owner', topic_id: 'mine-topic', name: 'Personal Concept', description: 'Original body' }],
      cards: cards ? [{ id: 'mine-card', owner_id: 'owner', concept_id: 'mine-concept', question: 'Personal Question', answer: 'Original answer' }] : [],
      overlays: [], topicPlacements: [],
    },
  };
  function render() { cursor = 0; const tree = context.exports.CreatorStudioV2Client(props); return { ...api, tree }; }
  return { render, calls, orders, routes };
}

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
for (const role of ['learner', 'admin', 'editor']) {
  const destination = role === 'learner' ? 'personal' : 'official';
  test(`${role}: rendered Content/Questions have no source selector and new drafts derive from role`, () => {
    const h = editor({ role });
    let e = h.render();
    assert.equal(e.creationDestination, destination);
    assert.equal(e.conceptSource, destination);
    assert.equal(e.questionSource, destination);
    assert.equal(e.isContentDirty, false);
    assert.equal(e.isQuestionDirty, false);
    for (const tab of ['content', 'questions', 'tags', 'flagged']) {
      e.setActiveCreatorTab(tab); e = h.render();
      const rendered = JSON.stringify(e.tree);
      assert.doesNotMatch(rendered, /Create in|New Concept source|New Question or Card source/);
    }
  });
  for (const button of ['openAddDialog', 'openPersonalTopicDialog']) {
    test(`${role}: ${button} creates a ${destination} Topic`, async () => {
      const h = editor({ role }); let e = h.render();
      e[button](); e = h.render();
      assert.equal(e.dialogMode, destination === 'personal' ? 'add-personal' : 'add');
      e.setNameDraft('New Topic'); await h.render().saveNameDialog();
      assert.equal(h.calls[0].name, destination === 'personal' ? 'create_personal_topic' : 'create_library_node_in_library');
      if (destination === 'personal') assert.equal(h.calls[0].payload.p_official_library_node_id, 'topic');
    });
  }
  test(`${role}: New Concept after personal editing saves to ${destination}`, async () => {
    const h = editor({ role }); let e = h.render();
    e.openPersonalConcept('mine-concept'); e = h.render();
    assert.equal(e.conceptEditorState.identity.key, 'personal:concept:mine-concept');
    e.startNewConcept(); e = h.render();
    assert.equal(e.conceptSource, destination);
    // Select a canonical personal Topic or official placement as a real author would.
    if (destination === 'official') {
      // New official drafts intentionally start with no checked placements.
      e.setConceptEditorState(runtimeContext.exports.createOfficialConceptEditorState(null, 'library'));
      e = h.render();
      e.selectedTopicIds.add('topic');
    }
    e.setConceptName('New concept'); e.setConcept('New content');
    await h.render().saveCurrentConcept();
    assert.equal(h.calls[0].name || h.calls[0].table,
      destination === 'personal' ? 'personal_concepts' : 'save_concept_with_prerequisites');
  });
  test(`${role}: New Question/Card after personal editing saves to ${destination}`, async () => {
    const h = editor({ role, editing: true }); let e = h.render();
    e.selectExistingQuestion({ source: 'personal', id: 'mine-card', conceptId: 'mine-concept' });
    e = h.render(); assert.equal(e.questionEditorState.identity.key, 'personal:card:mine-card');
    e.startNewQuestion(); e = h.render();
    assert.equal(e.questionSource, destination);
    e.setQuestionPrompt('New question'); e.setQuestionAnswer('New answer');
    await h.render().saveCurrentQuestion();
    assert.equal(h.calls[0].name || h.calls[0].table,
      destination === 'personal' ? 'personal_cards' : 'save_question_with_relationships_v2');
  });
  test(`${role}: existing personal Concept/Card updates preserve identity and owner`, async () => {
    const h = editor({ role }); let e = h.render();
    e.openPersonalConcept('mine-concept'); e = h.render();
    e.clearDraft(); e = h.render();
    assert.equal(e.conceptEditorState.identity.key, 'personal:concept:mine-concept');
    e.setConceptName('Updated'); e.setConcept('Updated body');
    await h.render().saveCurrentConcept(); e = h.render();
    assert.equal(e.conceptEditorState.identity.key, 'personal:concept:mine-concept');
    assert.equal(h.calls[0].name, 'save_personal_concept_with_overlay');
    assert.equal(h.calls[0].payload.p_personal_concept_id, 'mine-concept');
    e.selectExistingQuestion({ source: 'personal', id: 'mine-card', conceptId: 'mine-concept' });
    e = h.render(); e.setQuestionAnswer('Updated answer'); await h.render().saveCurrentQuestion();
    const write = h.calls.find(call => call.table === 'personal_cards');
    assert.equal(write.operation, 'update');
    assert.deepEqual(write.filters, [['id', 'mine-card'], ['owner_id', 'owner']]);
    assert.equal(h.render().questionEditorState.identity.key, 'personal:card:mine-card');
  });
  test(`${role}: official records retain identity and learner remains read-only`, () => {
    const h = editor({ role, editing: true }); let e = h.render();
    assert.equal(e.conceptEditorState.identity.key, 'official:concept:existing-concept');
    assert.equal(e.isCurrentContentReadOnly, role === 'learner');
    e.setActivePersonalTopicId('mine-topic'); e = h.render();
    e.selectExistingQuestion({ source: 'official', id: 'official-q', conceptId: 'existing-concept',
      prompt: 'Official?', answer: 'Yes', explanation: '', difficulty: 'medium', testingAngle: 'General Understanding',
      status: 'published', tags: [], primaryConceptName: 'Official' });
    e = h.render();
    assert.equal(e.questionEditorState.identity.key, 'official:question:official-q');
    assert.equal(e.isCurrentQuestionReadOnly, role === 'learner');
    e.setActiveCreatorTab('questions'); e = h.render();
    assert.equal(e.showPersonalCreatorTopics, role === 'learner');
    e.startNewQuestion();
    assert.equal(h.render().questionSource, destination);
    h.render().startNewConcept();
    assert.equal(h.render().conceptSource, destination);
  });
  test(`${role}: tree defaults and explicit personal record discovery survive`, () => {
    const h = editor({ role }); let e = h.render();
    assert.equal(e.showPersonalCreatorTopics, role === 'learner');
    e.setIsConceptBrowseOpen(true); e = h.render();
    assert.ok(nodes(e.tree).some(node => node.props?.children === 'Personal Topic'));
    e.setSearchQuery('Personal Topic'); e = h.render();
    assert.equal(e.visibleTopicComposition.unplacedPersonalRoots[0].id, 'mine-topic');
    e.setSearchQuery(''); e.openPersonalConcept('mine-concept'); e = h.render();
    assert.equal(e.showPersonalCreatorTopics, true);
    e.startNewConcept(); e = h.render();
    assert.equal(e.showPersonalCreatorTopics, role === 'learner');
  });
}
test('learner cannot force official creation by supplying official editor state', async () => {
  const h = editor({ role: 'learner', editing: true }); let e = h.render();
  e.setConceptEditorState(runtimeContext.exports.createOfficialConceptEditorState(null, 'library'));
  e.setConcept('Forced official concept');
  await assert.rejects(h.render().saveCurrentConcept(), /not permitted/);
  e = h.render();
  e.setQuestionEditorState(runtimeContext.exports.createOfficialQuestionEditorState(null, 'library'));
  e.setQuestionPrompt('Forced official question'); e.setQuestionAnswer('Answer');
  await assert.rejects(h.render().saveCurrentQuestion(), /not permitted/);
  assert.equal(h.calls.length, 0);
});
for (const role of ['admin', 'editor']) {
  test(`${role}: selecting a personal Concept with no Cards cannot become personal creation`, async () => {
    const h = editor({ role, cards: false }); let e = h.render();
    e.selectPersonalQuestionConcept('mine-concept', 'mine-topic'); e = h.render();
    assert.equal(e.questionEditorState.mode, 'none');
    assert.equal(e.isCurrentQuestionReadOnly, true);
    await e.saveCurrentQuestion();
    assert.equal(h.calls.length, 0);
  });
  test(`${role}: stale personal creation drafts are rejected but personal edits remain allowed`, async () => {
    const h = editor({ role }); let e = h.render();
    e.setConceptEditorState(runtimeContext.exports.createPersonalConceptEditorState(null, 'owner'));
    e.setConceptName('Must not create'); e.setConcept('Text');
    await h.render().saveCurrentConcept();
    e = h.render(); assert.match(e.status.message, /belongs to Socrates/);
    e.setQuestionEditorState(runtimeContext.exports.createPersonalCardEditorState(null, 'owner'));
    e.setQuestionPrompt('Must not create'); e.setQuestionAnswer('Text');
    await h.render().saveCurrentQuestion();
    assert.match(h.render().questionStatus.message, /belongs to Socrates/);
    assert.equal(h.calls.length, 0);
  });
}
test('creation selectors and their mutable setters are absent; Flagged remains independent', () => {
  assert.doesNotMatch(source, /setConceptCreationSource|setQuestionCreationSource|Create in|styles.sourceChoice/);
  assert.match(source, /CreatorStudioFlaggedTab/);
  const flagged = readFileSync(new URL('../components/StudyCreatorFlaggedBrowser.tsx', import.meta.url), 'utf8');
  assert.match(flagged, /personal_card/);
  assert.match(flagged, /question/);
  assert.doesNotMatch(flagged, /creationDestination|CreationSource/);
});

for (const role of ['learner', 'admin', 'editor']) {
  test(`${role}: renaming an existing personal Topic preserves its owner-qualified target`, async () => {
    const h = editor({ role }); let e = h.render();
    e.setActivePersonalTopicId('mine-topic'); e = h.render();
    e.openRenameDialog(); e.setNameDraft('Renamed'); await h.render().saveNameDialog();
    const write = h.calls.find(call => call.table === 'personal_topics');
    assert.equal(write.operation, 'update');
    assert.deepEqual(write.filters, [['id', 'mine-topic'], ['owner_id', 'owner']]);
  });
}
test('a forged learner official Topic dialog is redirected to personal creation', async () => {
  const h = editor({ role: 'learner' }); let e = h.render();
  e.setDialogMode('add'); e.setNameDraft('Forced'); await h.render().saveNameDialog();
  assert.equal(h.calls.length, 0);
  assert.equal(h.render().dialogMode, 'add-personal');
  await h.render().saveNameDialog();
  assert.equal(h.calls[0].name, 'create_personal_topic');
});
for (const role of ['admin', 'editor']) {
  test(`${role}: selecting a personal Topic cannot change new Topic ownership`, async () => {
    const h = editor({ role }); let e = h.render();
    e.setActivePersonalTopicId('mine-topic'); e = h.render();
    e.openPersonalTopicDialog(); e = h.render();
    assert.equal(e.dialogMode, null);
    assert.match(e.status.message, /Select an official Topic/);
    assert.equal(h.calls.length, 0);
  });
}
