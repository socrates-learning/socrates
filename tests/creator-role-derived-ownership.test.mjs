import { formatSaveResponse, visualFieldBoundary, OfficialVisualFieldBoundary } from './fixtures/creator-role-workspaces.mjs';
import { questionImageBoundary } from './fixtures/question-media-authoring.mjs';
import { conceptMedia, conceptImageBoundary, conceptContentBoundary } from './fixtures/concept-media-authoring.mjs';
import { CreatorQuestionSearchPanel } from './fixtures/creator-role-workspaces.mjs';
import * as markdownEditing from '../lib/markdown-editing.ts';
import * as topicSelection from '../lib/topic-selection-presentation.ts';
import * as homeSettings from '../lib/home-deck-settings.ts';
import * as standaloneCards from '../lib/standalone-custom-cards.ts';
import * as topicPositioning from '../lib/creator-topic-positioning.ts';
import * as personalStructure from '../lib/creator-personal-structure.ts';
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
  'loadQuestionSearchPage', 'questionSearchResults', 'deleteSelectedStandaloneCard', 'activeCreatorTab', 'standaloneEditorRef', 'closeStandaloneEditor', 'standaloneRequest', 'filterPersonalCardsForSearch', 'setStandaloneCards',
  'setContentConceptSearch', 'contentConceptSearchResults', 'setQuestionSearchResults',
  'renderUnifiedTopic', 'renderUnifiedConceptBrowseTopic', 'renderUnifiedQuestionTopic',
  'setQuestionCountsByConceptId', 'setExpandedPersonalTopicIds', 'setExpandedBrowseTopicIds', 'setQuestionConceptsByTopicId',
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

function editor({ role = 'admin', editing = false, response, references = [], cards = true, placed = false, neutralFixture = false } = {}) {
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
        range() { assert.equal(table, 'tags'); return query; },
        select() { return query; }, is(key,value) { filters.push([key,value]); return query; }, eq(key, value) { filters.push([key, value]); return query; },
        order() { return query; }, in() { return query; },
        insert(values) { mutation = { table, operation: 'insert', values, filters }; calls.push(mutation); return query; },
        update(values) { mutation = { table, operation: 'update', values, filters }; calls.push(mutation); return query; },
        delete() { mutation = { table, operation: 'delete', filters }; calls.push(mutation); return query; },
        single: async () => ({ data: { id: filters.find(([key]) => key === 'id')?.[1] || 'saved-personal', ...mutation?.values }, error: null }),
        then(resolve) { return Promise.resolve({ data: [], error: null, ...(table === 'tags' ? { count: 0 } : {}) }).then(resolve); },
      };
      return query;
    },
  };
  function rpcResult(name, payload) {
      if (name === 'get_creator_questions_with_media') name = 'get_creator_questions';
      if (name === 'get_creator_questions') return { data: [], error: null };
      calls.push({ name, payload });
      if (response) return response(name, payload);
      if (name === 'create_personal_topic') return { data: { id: 'new-topic', owner_id: 'owner', name: payload.p_name, parent_id: payload.p_parent_personal_topic_id }, error: null };
      if (name === 'create_library_node_in_library') return { data: { id: 'new-official-topic' }, error: null };
      if (name === 'save_personal_concept_with_overlay') return { data: { personal_concept_id: payload.p_personal_concept_id, owner_id: 'owner', topic_id: payload.p_personal_topic_id, concept_name: payload.p_name, concept_description: payload.p_description }, error: null };

      return formatSaveResponse(name, payload);
  }
  const modules = {
    react: hooks,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'next/navigation': { useRouter: () => ({ push: path => routes.push(path), replace: path => routes.push(path), refresh: () => routes.push('refresh') }) },
    'lucide-react': new Proxy({}, { get: (_target, key) => `icon:${String(key)}` }),
    '@/components/Header': {},
    '@/components/MarkdownContent': { cardMarkdownSummary: source => source, questionMarkdownSummary: source => source },
    './creator/QuestionMarkdownField': { QuestionMarkdownField() {} },
    './creator/OfficialVisualField': visualFieldBoundary,
    '@/components/ConceptMediaContent': conceptContentBoundary,
    '@/components/creator/QuestionImageAuthoring': questionImageBoundary,
    '@/components/creator/ConceptImageAuthoring': conceptImageBoundary,
    '@/lib/concept-media': conceptMedia,
    './creator/CreatorQuestionSearchPanel': { CreatorQuestionSearchPanel },
    './creator/CreatorLearnerQuestionsWorkspace': { CreatorLearnerQuestionsWorkspace() {} },
    './creator/StandaloneCustomCardWorkspace': { StandaloneCustomCardWorkspace: () => null },
    '@/lib/standalone-custom-cards': standaloneCards,
    '@/lib/markdown-editing': markdownEditing,
    '@/lib/topic-selection-presentation': topicSelection,
    '@/lib/home-deck-settings': homeSettings,
    '@/components/creator/CreatorStudioChrome': {
      CreatorStudioLocalHeader() {},
      CreatorStudioSaveToolbar() {},
      CreatorStudioTabs() {},
    },
    '@/lib/concept-topic-tree': { buildConceptTopicTree },
    '@/lib/supabase': { supabase: database },
    '@/lib/creator-personal-structure': personalStructure,
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
    './CreatorTopicTreeInteraction': {},
    '@/lib/creator-topic-positioning': topicPositioning,
    '@/components/application-shell/SocratesShell': { useSocratesNavigationGuard() {} },
    './CreatorStudioV2Client.module.css': { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) },
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
      overlays: [], topicPlacements: placed ? [{id:'placement',owner_id:'owner',personal_topic_id:'mine-topic',library_node_id:'topic'}] : [],
    },
  };
  // Learner browsing now immediately sorts persisted Cards, whose timestamps are required.
  if (role === 'learner') props.initialPersonalContent.cards.forEach(card => { card.created_at = '2026-01-01T00:00:00Z'; card.updated_at = card.created_at; });
  if (neutralFixture) {
    props.initialPersonalContent.topics[0].name = 'Topic';
    props.initialPersonalContent.concepts[0].name = 'Concept';
    props.initialPersonalContent.cards.forEach(card => { card.question = 'Question'; });
  }
  function render() { cursor = 0; const tree = context.exports.CreatorStudioV2Client(props); return { ...api, tree }; }
  return { render, calls, orders, routes };
}

function nodes(tree) {
  if (tree?.type === OfficialVisualFieldBoundary) return nodes(OfficialVisualFieldBoundary(tree.props));
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (tree.type === CreatorQuestionSearchPanel) return nodes(CreatorQuestionSearchPanel(tree.props));
  return [tree, ...nodes(tree.props?.children), ...(tree.type?.name === 'CreatorLearnerQuestionsWorkspace' ? [...nodes(tree.props.editor), ...nodes(tree.props.topicTree)] : [])];
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
      destination === 'personal' ? 'personal_concepts' : 'save_concept_with_format');
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
      destination === 'personal' ? 'personal_cards' : 'save_question_with_format');
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
    assert.equal(e.showPersonalCreatorTopics, true);
    e.startNewQuestion();
    assert.equal(h.render().questionSource, destination);
    h.render().startNewConcept();
    assert.equal(h.render().conceptSource, destination);
  });
  test(`${role}: owned records are discoverable before search and after starting a new draft`, () => {
    const h = editor({ role }); let e = h.render();
    assert.equal(e.showPersonalCreatorTopics, true);
    e.setIsConceptBrowseOpen(true); e = h.render();
    assert.ok(nodes(e.tree).some(node => node.props?.children === 'Personal Topic'));
    assert.equal(e.visibleTopicComposition.unplacedPersonalRoots[0].id, 'mine-topic');
    e.setSearchQuery('Personal Topic'); e = h.render();
    assert.equal(e.visibleTopicComposition.unplacedPersonalRoots[0].id, 'mine-topic');
    e.setSearchQuery(''); e.openPersonalConcept('mine-concept'); e = h.render();
    assert.equal(e.showPersonalCreatorTopics, true);
    e.startNewConcept(); e = h.render();
    assert.equal(e.showPersonalCreatorTopics, true);
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
    e = h.render(); assert.match(e.status.message, /current authoring permissions/);
    e.setQuestionEditorState(runtimeContext.exports.createPersonalCardEditorState(null, 'owner'));
    e.setQuestionPrompt('Must not create'); e.setQuestionAnswer('Text');
    await h.render().saveCurrentQuestion();
    assert.match(h.render().questionStatus.message, /current authoring permissions/);
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
    assert.match(e.status.message, /Select an eligible Topic/);
    assert.equal(h.calls.length, 0);
  });
}

for (const role of ['learner','editor','admin']) test(`${role}: owned placed content appears in normal canonical browsing without search`,()=>{
 const h=editor({role,placed:true});const e=h.render();
 const rows=flattenUnifiedCreatorTopics(e.visibleTopicComposition.officialRoots);
 const owned=rows.find(t=>t.key==='personal:topic:mine-topic');
 assert.ok(owned);assert.equal(owned.presentationParentKey,'official:topic:topic');
 assert.equal(e.creationDestination,role==='learner'?'personal':'official');
 assert.equal(e.visibleTopicComposition.unplacedPersonalRoots.length,0);
});

// Presentation-only fixtures use the real canonical component and its renderers.
function visibleText(tree) {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (!tree || typeof tree !== 'object') return '';
  if (Array.isArray(tree)) return tree.map(visibleText).join(' ');
  if (tree.type === 'code') return ''; // Raw entity IDs are identity, not ownership labels.
  return [tree.props?.['aria-label'], tree.props?.title, visibleText(tree.props?.children)].filter(Boolean).join(' ');
}
function paint(tree) {
  if (!tree || typeof tree !== 'object') return tree;
  if (Array.isArray(tree)) return tree.map(paint);
  const { children, className, style, title } = tree.props || {};
  return { type: tree.type, className, style, title, children: paint(children) };
}
for (const role of ['admin', 'editor', 'learner']) {
  test(`${role}: placed synthetic content stays source-neutral in browsing, search and editors`, () => {
    const h = editor({ role, placed: true, neutralFixture: true }); let e = h.render();
    assert.equal(e.visibleTopicComposition.officialRoots[0].children.filter(t => t.source === 'personal').length, 1);
    for (const tab of ['content', 'questions', 'tags', 'flagged']) {
      e.setActiveCreatorTab(tab); e = h.render();
      assert.doesNotMatch(visibleText(e.tree), /\b(Mine|Personal|Official|Socrates material|My Topic|owner-only)\b/i);
      assert.equal(nodes(e.tree).filter(n => n.props?.className === 'sourceBadge').length, 0);
    }
    e.setActiveCreatorTab('content'); e.setSearchQuery('Concept'); e = h.render();
    assert.doesNotMatch(visibleText(e.tree), /\b(Mine|Personal|Official)\b/i);
    e.openPersonalConcept('mine-concept'); e = h.render();
    assert.equal(e.conceptEditorState.identity.key, 'personal:concept:mine-concept');
    assert.doesNotMatch(visibleText(e.tree), /\b(Mine|Personal|Official|owner-only)\b/i);
    e.selectExistingQuestion({ source: 'personal', id: 'mine-card', conceptId: 'mine-concept' }); e = h.render();
    assert.equal(e.questionEditorState.identity.key, 'personal:card:mine-card');
    assert.doesNotMatch(visibleText(e.tree), /\b(Mine|Personal|Official|owner-only)\b/i);
  });
}
test('equivalent Topic activation rows have identical text, icons and paint, with distinct internal keys', () => {
  const h = editor({ placed: true, neutralFixture: true }); const e = h.render();
  const official = { id: 'topic', key: 'official:topic:topic', name: 'Topic', source: 'official', children: [] };
  const personal = { id: 'mine-topic', key: 'personal:topic:mine-topic', name: 'Topic', source: 'personal', children: [] };
  const activation = topic => nodes(e.renderUnifiedTopic(topic, 2)).find(n => n.props?.className === 'topicActivationButton');
  // Ignore functional selection/authority controls: compare only source-independent paint.
  assert.ok(activation(official)); assert.ok(activation(personal));
  assert.deepEqual(paint(activation(official)), paint(activation(personal)));
  assert.notEqual(official.key, personal.key);
  const browse = topic => e.renderUnifiedConceptBrowseTopic(topic, 2);
  assert.doesNotMatch(visibleText(browse(personal)), /Mine|Personal|Official/);
});

test('official and owner-qualified Concept choices share selection paint and question-count labels', () => {
  const h = editor({ placed: true, neutralFixture: true }); let e = h.render();
  e.setQuestionConceptsByTopicId({ topic: [{ id: 'concept', name: 'Concept' }] });
  e.setQuestionCountsByConceptId({ concept: 1 });
  e.setExpandedPersonalTopicIds(new Set(['mine-topic'])); e = h.render();
  const official = { id: 'topic', key: 'official:topic:topic', name: 'Topic', source: 'official', children: [] };
  const personal = { id: 'mine-topic', key: 'personal:topic:mine-topic', name: 'Topic', source: 'personal', children: [] };
  const choice = topic => nodes(e.renderUnifiedQuestionTopic(topic, 1)).find(n =>
    n.props?.style && visibleText(n).includes('Concept') &&
    [n.props.children].flat().some(child => child?.type === 'input' && child.props?.type === 'checkbox') &&
    (n.type === 'label' || nodes(n).some(child => child.props?.['aria-label'] === 'Browse Questions for Concept'))
  );
  const officialName = nodes(choice(official)).find(n => n.props?.['aria-label'] === 'Browse Questions for Concept');
  assert.ok(officialName);
  assert.equal(visibleText(officialName.props.children).replace(/\s+/g, ' ').trim(), visibleText(choice(personal)).replace(/\s+/g, ' ').trim());
  assert.doesNotMatch(visibleText(choice(official)) + visibleText(choice(personal)), /\b(Mine|Personal|Official)\b/);
  assert.deepEqual(choice(official).props.style, choice(personal).props.style);
  assert.ok(!choice(personal).props.className);
});

test('normal browsing and search use neutral Concept presentation while search keys remain source-qualified', () => {
  const h = editor({ placed: true, neutralFixture: true }); let e = h.render();
  e.setQuestionConceptsByTopicId({ topic: [{ id: 'mine-concept', name: 'Concept' }] });
  e.setContentConceptSearch('Concept'); e = h.render();
  assert.deepEqual(Array.from(e.contentConceptSearchResults, x => x.key).sort(), ['official:concept:mine-concept', 'personal:concept:mine-concept']);
  const results = nodes(e.tree).filter(n => n.type === 'button' && textWithoutIdentity(n).includes('Concept ID:'));
  assert.equal(results.length, 2);
  assert.equal(results[0].props.className, results[1].props.className);
  assert.deepEqual(results[0].props.style, results[1].props.style);
  for (const row of results) assert.doesNotMatch(textWithoutIdentity(row), /\b(Mine|Personal|Official)\b/i);
  // Opening a found owner-qualified record still targets its original entity.
  const personalResult = results.find(n => visibleText(n).includes('Topic > Topic')) || results[1];
  personalResult.props.onClick();
  assert.equal(h.render().conceptEditorState.identity.key, 'personal:concept:mine-concept');
});
function textWithoutIdentity(tree) {
  return visibleText(tree).replaceAll('mine-concept', 'entity-id');
}
test('Question search prompt styling is source-neutral and does not erase backend source identity', () => {
  const h = editor({ placed: true, neutralFixture: true }); let e = h.render();
  const common = {id:'question-id',conceptId:'concept',primaryConceptName:'Concept',relatedConcepts:[],prompt:'Equivalent Question',status:null,difficulty:null,testingAngle:null,additionalTestingAngles:[],tags:[]};
  e.setQuestionSearchResults([{...common,source:'official',kind:'question'},{...common,source:'personal',kind:'card'}]);
  e.setActiveCreatorTab('search'); e = h.render();
  const prompts=nodes(e.tree).filter(n => n.props?.className==='questionSearchPrompt');
  assert.equal(prompts.length,2);
  assert.deepEqual(paint(prompts[0]),paint(prompts[1]));
  assert.equal(visibleText(prompts[0]).trim(),'Equivalent Question');
});


test('standalone Cards use existing search, open without a Concept, and remain in their Library', () => {
  const h = editor({role:'learner',placed:true}); let e=h.render();
  const common={owner_id:'owner',concept_id:null,question:'Independent front',answer:'Independent back',source_reference:null,created_at:'2026',updated_at:'2026'};
  e.setStandaloneCards([
    {...common,id:'direct',library_node_id:'topic',library_id:'library',personal_topic_id:null},
    {...common,id:'custom',library_node_id:null,library_id:null,personal_topic_id:'mine-topic'},
    {...common,id:'foreign-library',library_node_id:'topic',library_id:'other-library',personal_topic_id:null},
  ]);e=h.render();
  const filters={text:'independent',difficulty:'',primaryTestingAngle:'',additionalTestingAngle:'',primaryConceptId:'',relatedConceptId:'',status:'',tagId:''};
  const found=e.filterPersonalCardsForSearch(filters);
  assert.deepEqual(Array.from(found,item=>item.id).sort(),['custom','direct']);
  assert.ok(found.every(item=>item.conceptId===null));
  e.selectExistingQuestion(found.find(item=>item.id==='direct'));e=h.render();
  assert.equal(e.standaloneRequest.card.id,'direct');
  assert.equal(e.standaloneRequest.attachment.source,'official');
  assert.equal(e.standaloneRequest.attachment.topicId,'topic');
  assert.equal(e.filterPersonalCardsForSearch({...filters,primaryConceptId:'mine-concept'}).length,0);
});


test('Add Custom Card reuses the Content left pane and retains the Topic Tree without navigation', () => {
  const h=editor({role:'admin',placed:true});let e=h.render();
  e.setActiveCreatorTab('content');e.setConcept('Existing draft');e=h.render();
  const control=nodes(e.tree).find(n=>n.props?.className==='treeControls');
  nodes(control).find(n=>n.type==='button' && visibleText(n)==='Add Custom Card').props.onClick();e=h.render();
  assert.equal(e.activeCreatorTab,'content');
  assert.equal(e.standaloneRequest.attachment.topicId,'topic');
  assert.ok(nodes(e.tree).some(n=>n.props?.['aria-label']==='Topic Tree'));
  assert.ok(nodes(e.tree).some(n=>n.props?.className==='panel topicPanel'));
  assert.equal(nodes(e.tree).filter(n=>n.props?.['aria-label']==='Concept or explanation').length,0);
  assert.equal(nodes(e.tree).filter(n=>n.props?.['aria-label']==='Search concepts').length,0);
  const left=nodes(e.tree).find(n=>n.props?.className==='panel conceptPanel');
  const cardEditor=nodes(left).find(n=>n.type?.name==='StandaloneCustomCardWorkspace');
  assert.ok(cardEditor);assert.equal(cardEditor.props.request,e.standaloneRequest);
  assert.equal(nodes(e.tree).filter(n=>n.type?.name==='StandaloneCustomCardWorkspace').length,1);
  cardEditor.props.onRequest(null);e=h.render();
  assert.equal(nodes(e.tree).find(n=>n.props?.['aria-label']==='Concept or explanation').props.value,'Existing draft');
  assert.ok(nodes(e.tree).some(n=>n.props?.['aria-label']==='Topic Tree'));
  assert.deepEqual(h.routes,[]);assert.equal(h.calls.length,0);
});

for (const role of ['admin','editor']) test(`${role}: explicit Add Custom uses identical owned Card action while normal destination stays role-derived`,()=>{
  const h=editor({role,placed:true});let e=h.render();
  const action=nodes(e.tree).find(n=>n.type==='button'&&visibleText(n)==='Add Custom Card');assert.ok(action);
  action.props.onClick();e=h.render();
  assert.equal(e.creationDestination,role==='learner'?'personal':'official');
  const cardEditor=nodes(e.tree).find(n=>n.type?.name==='StandaloneCustomCardWorkspace');
  assert.equal(cardEditor.props.ownerId,'owner');assert.equal(cardEditor.props.canCreate,true);
  assert.equal(cardEditor.props.request.card,null);assert.equal(cardEditor.props.request.attachment.topicId,'topic');
  assert.doesNotMatch(visibleText(nodes(e.tree).find(n=>n.props?.className==='treeControls')),/Personal|Official|Mine|Create in/);
  assert.deepEqual(h.routes,[]);
});

test('Card search opens the Content editor at its existing Topic and Topic changes respect busy state',()=>{
  const h=editor({role:'admin',placed:true});let e=h.render();
  e.setActiveCreatorTab('questions');
  e.setStandaloneCards([{id:'standalone',owner_id:'owner',concept_id:null,question:'Front',answer:'Back',library_node_id:null,library_id:null,personal_topic_id:'mine-topic'}]);e=h.render();
  e.selectExistingQuestion({source:'personal',id:'standalone',conceptId:null});e=h.render();
  assert.equal(e.activeCreatorTab,'content');
  assert.equal(e.standaloneRequest.attachment.topicId,'mine-topic');
  const activation=nodes(e.tree).find(n=>n.props?.['aria-label']==='Make Topic the active topic');
  e.standaloneEditorRef.current.busy=true;activation.props.onClick();e=h.render();assert.ok(e.standaloneRequest);
  e.standaloneEditorRef.current.busy=false;activation.props.onClick();e=h.render();assert.equal(e.standaloneRequest,null);
  assert.deepEqual(h.routes,[]);
});


test('contextual Delete Card removes only its owner-qualified identity and restores the Concept pane',async()=>{
 const h=editor({role:'admin',placed:true});let e=h.render();
 e.setConcept('Preserved Concept draft');
 e.setStandaloneCards([{id:'standalone',owner_id:'owner',concept_id:null,question:'Front',answer:'Back',library_node_id:'topic',library_id:'library',personal_topic_id:null,created_at:'2026',updated_at:'2026'}]);e=h.render();
 e.selectExistingQuestion({source:'personal',id:'standalone',conceptId:null});e=h.render();
 const treeControls=nodes(e.tree).find(n=>n.props?.className==='treeControls');
 assert.ok(nodes(treeControls).find(n=>n.type==='button'&&visibleText(n)==='Delete Card'));
 await e.deleteSelectedStandaloneCard();e=h.render();
 assert.equal(e.standaloneRequest,null);
 assert.equal(nodes(e.tree).find(n=>n.props?.['aria-label']==='Concept or explanation').props.value,'Preserved Concept draft');
 assert.equal(nodes(e.tree).filter(n=>n.props?.className==='questionSearchResult'&&visibleText(n)==='Front').length,0);
 const deletion=h.calls.find(c=>c.operation==='delete');assert.equal(deletion.table,'personal_cards');
 assert.deepEqual(JSON.parse(JSON.stringify(deletion.filters)),[['id','standalone'],['owner_id','owner'],['concept_id',null]]);
 assert.deepEqual(h.routes,[]);
});


test('learner search includes standalone Cards when the Library has no official Concepts',async()=>{
 const h=editor({role:'learner',placed:true});let e=h.render();
 e.setStandaloneCards([{id:'standalone',owner_id:'owner',concept_id:null,question:'Find without Concept',answer:'Back',library_node_id:'topic',library_id:'library',personal_topic_id:null,created_at:'2026',updated_at:'2026'}]);e=h.render();
 await e.loadQuestionSearchPage({text:'without',difficulty:'',primaryTestingAngle:'',additionalTestingAngle:'',primaryConceptId:'',relatedConceptId:'',status:'',tagId:''},null,false);e=h.render();
 assert.equal(e.questionSearchResults.length,1);assert.equal(e.questionSearchResults[0].id,'standalone');
 assert.equal(e.questionSearchResults[0].conceptId,null);assert.equal(h.calls.length,0);
});
