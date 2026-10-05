import { formatSaveResponse } from './fixtures/creator-role-workspaces.mjs';
import { questionImageBoundary } from './fixtures/question-media-authoring.mjs';
import { conceptMedia, conceptImageBoundary, conceptContentBoundary } from './fixtures/concept-media-authoring.mjs';
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
const exposed = [
  'saveConcept', 'saveQuestion', 'startNewQuestion', 'startNewConcept', 'selectExistingQuestion',
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

function editor({ editing = false, response, references = [], media } = {}) {
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
    async rpc(name, payload) {
      if (name === 'get_creator_questions_with_media') return { data: [], error: null };
      calls.push({ name, payload });
      if (response) return response(name, payload);
      return formatSaveResponse(name, payload);
    },
    from(table) {
      const query = {
        in() { assert.equal(table, 'tags'); return query; },
        range() { assert.equal(table, 'tags'); return query; },
        select() { return query; }, eq() { return query; },
        order(column, options) { orders.push({ table, column, ...options }); return query; },
        then(resolve) { return Promise.resolve({ data: [], error: null, ...(table === 'tags' ? { count: 0 } : {}) }).then(resolve); },
      };
      return query;
    },
  };
  const modules = {
    react: hooks,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'next/navigation': { useRouter: () => ({ push: path => routes.push(path), replace: path => routes.push(path), refresh: () => routes.push('refresh') }) },
    'lucide-react': {},
    '@/components/Header': {},
    '@/components/MarkdownContent': { cardMarkdownSummary: source => source, questionMarkdownSummary: source => source },
    './creator/QuestionMarkdownField': { QuestionMarkdownField() {} },
    './creator/OfficialVisualField': { __esModule: true, default: function OfficialVisualField() {} },
    '@/components/ConceptMediaContent': conceptContentBoundary,
    '@/components/creator/QuestionImageAuthoring': questionImageBoundary,
    '@/components/creator/ConceptImageAuthoring': media ? { ...conceptImageBoundary, useConceptImageAuthoring: () => media } : conceptImageBoundary,
    '@/lib/concept-media': conceptMedia,
    './creator/CreatorQuestionSearchPanel': { CreatorQuestionSearchPanel() {} },
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
    '@/lib/creator-command-contracts': { resolveCreatorCommandRoute: () => 'personal-owner-write' },
    '@/lib/creator-entity-contracts': { createCreatorEntityKey: (source, kind, id) => `${source}:${kind}:${id}` },
    '@/lib/creator-unified-topic-tree': {
      composeUnifiedCreatorTopicTree,
      flattenUnifiedCreatorTopics,
      shouldShowPersonalCreatorTopics,
    },
    '@/lib/creator-studio-runtime': {
      createOfficialConceptEditorState: (id, libraryId) => id ? { mode: 'official-concept', identity: { id }, libraryId } : { mode: 'new-official-concept', libraryId },
      createOfficialQuestionEditorState: (id, libraryId) => id ? { mode: 'official-question', identity: { id }, libraryId } : { mode: 'new-official-question', libraryId },
      createOfficialCreatorPresentationAuthority: () => ({}),
      createOfficialConceptIdentity: id => ({ id }),
      createOfficialQuestionIdentity: id => ({ id }),
      createOfficialTopicIdentity: id => ({ id }),
      createPersonalConceptEditorState: (id, ownerId) => id ? { mode: 'personal-concept', identity: { id }, ownerId } : { mode: 'new-personal-concept', ownerId },
      createPersonalCardEditorState: (id, ownerId) => id ? { mode: 'personal-card', identity: { id }, ownerId } : { mode: 'new-personal-card', ownerId },
      officialConceptId: state => state.mode === 'official-concept' ? state.identity.id : null,
      officialQuestionId: state => state.mode === 'official-question' ? state.identity.id : null,
      personalConceptId: state => state.mode === 'personal-concept' ? state.identity.id : null,
      personalCardId: state => state.mode === 'personal-card' ? state.identity.id : null,
      conceptEditorIdentityKey: state => state.identity ? `${state.mode}:${state.identity.id}` : state.mode,
      questionEditorIdentityKey: state => state.identity ? `${state.mode}:${state.identity.id}` : state.mode,
      isConceptEditorIdentity: (state, source, id) => source === 'official' ? state.mode === 'official-concept' && state.identity.id === id : state.mode === 'personal-concept' && state.identity.id === id,
      isQuestionEditorIdentity: (state, source, id) => source === 'official' ? state.mode === 'official-question' && state.identity.id === id : state.mode === 'personal-card' && state.identity.id === id,
      tryAcquireMutationLock: lock => lock.current ? false : (lock.current = true),
      releaseMutationLock: lock => { lock.current = false; },
      resolveOfficialCreatorCommand: command => ({ rpc: command.type === 'save-concept' ? 'save_concept_with_format' : command.type === 'save-question' ? 'save_question_with_format' : command.type === 'inspect-delete' ? 'get_development_delete_summary' : command.type === 'delete-content' ? 'delete_development_content' : '' }),
    },
    './CreatorAlgorithmDiagnostics': {},
    './CreatorTopicTreeInteraction': {},
    '@/lib/creator-topic-positioning': topicPositioning,
    '@/components/application-shell/SocratesShell': { useSocratesNavigationGuard() {} },
    './CreatorStudioV2Client.module.css': { default: {} },
  };
  const context = {
    exports: {}, capture: value => { api = value; },
    require(name) { assert.ok(name in modules, `Unexpected import: ${name}`); return modules[name]; },
    window: { confirm: () => true, history: { replaceState: (_a, _b, path) => routes.push(path) } },
  };
  vm.runInNewContext(compiled, context);
  const props = {
    activeLibraryId: 'library',
    creatorCapabilities: {
      subject: { userId: 'owner', role: 'editor' },
      library: { activeLibraryId: 'library', canAccessActiveLibrary: true, canManageActiveLibrary: true },
      official: {
        browsePublished: true, readUnpublished: true, saveConcept: true, saveQuestion: true,
        publishContent: true, manageTopicTree: true, manageTags: true,
        managePrerequisites: true, manageFormalSources: true,
        manageLibraries: true, manageArticles: true,
      },
      personal: {
        createTopic: true, createConcept: true, createCard: true,
        editOwnContent: true, deleteOwnContent: true,
        createOfficialContextOverlay: true, managePersonalDecks: true, manageFlags: true,
      },
      administration: { manageUsersAndRoles: false, manageLibraryMemberships: false },
    },
    initialTopics: [{ id: 'topic', name: 'Topic', children: [] }],
    initialConcept: { id: editing ? 'existing-concept' : null, name: '', bodyMarkdown: '', placementIds: ['topic'] },
    initialReferences: references,
    initialPersonalContent: { ownerId: 'owner', topics: [], concepts: [], cards: [], overlays: [], topicPlacements: [] },
  };
  function render() { cursor = 0; const tree = context.exports.CreatorStudioV2Client(props); return { ...api, tree }; }
  return { render, calls, orders, routes };
}

test('Concept image confirmation waits for the media transaction and complete authoritative reference readback', async () => {
  for (const editing of [false, true]) for (const count of [1, 2]) {
    let finish;
    const media = { ...conceptImageBoundary.useConceptImageAuthoring(), usesMedia: true, items: Array(count).fill({}), save: () => new Promise(resolve => { finish = resolve; }) };
    const h = editor({ editing, media });
    h.render().setConcept('Concept with images');
    const pending = h.render().saveConcept();
    assert.doesNotMatch(h.render().status?.message || '', /Concept saved with image/);
    finish({ data: { concept_id: editing ? 'existing-concept' : 'saved-concept', version_id: 'version', updated_at: '2026-10-03T12:00:00Z', bodyMarkdown: 'Concept with images', body_format: editing ? 'legacy' : 'visual_markdown_v1', references: [], placements: media.items }, error: null });
    await pending;
    assert.equal(h.render().status.message, `Concept saved with ${count === 1 ? 'image' : 'images'}${editing ? '' : '. Ready for another Concept.'}`);
    assert.equal(h.calls.length, 0, 'No parallel legacy save');
  }
  for (const result of [{ data: null, error: { message: 'Uncertain media save' } }, { data: { concept_id: 'saved-concept', placements: [{}] }, error: null }]) {
    const media = { ...conceptImageBoundary.useConceptImageAuthoring(), usesMedia: true, items: [{}], save: async () => result };
    const h = editor({ media }); h.render().setConcept('Preserved media draft');
    await h.render().saveConcept();
    assert.equal(h.render().status.tone, 'error');
    assert.doesNotMatch(h.render().status.message, /Concept saved with image/);
    assert.equal(h.render().concept, 'Preserved media draft');
  }
});

for (const lifecycle of ['published', 'draft']) {
  test(`new Concept saves ${lifecycle} on first save, clears fields, and retains placement`, async () => {
    const h = editor({ references: [{ id: 'ref', sourceId: null, attributionId: null, title: 'Reference', author: '', url: '', notes: '' }] });
    let e = h.render();
    assert.equal(e.conceptRecordStatus, 'published');
    e.setConcept('# First concept');
    e.setConceptRecordStatus(lifecycle);
    await h.render().saveConcept();
    e = h.render();
    assert.equal(h.calls[0].payload.p_payload.p_status, lifecycle);
    assert.equal(h.calls[0].payload.p_payload.p_concept_id, null);
    assert.equal(e.conceptId, null);
    assert.equal(e.concept, '');
    assert.equal(e.references.length, 0);
    assert.deepEqual([...e.selectedTopicIds], ['topic']);
    assert.equal(e.isContentDirty, false);
    assert.equal(e.questionConceptsByTopicId.topic[0].id, 'saved-concept');
    assert.equal(h.routes.at(-1), '/creator/concepts/new');
    e.setConcept('# Second concept');
    await h.render().saveConcept();
    assert.equal(h.calls[1].payload.p_payload.p_concept_id, null);
    assert.equal(h.calls[1].payload.p_payload.p_status, 'published');
  });

  test(`new Question ignores stale ${lifecycle} status and resets hidden compatibility defaults`, async () => {
    const h = editor({ editing: true });
    let e = h.render();
    assert.equal(e.questionRecordStatus, 'published');
    e.setQuestionPrompt('First prompt'); e.setQuestionAnswer('First answer');
    e.setQuestionDifficulty('hard'); e.setQuestionTestingAngle('Clinical Application');
    e.setQuestionRecordStatus(lifecycle);
    await h.render().saveQuestion();
    e = h.render();
    assert.equal(h.calls[0].payload.p_payload.p_status, 'published');
    assert.equal(h.calls[0].payload.p_payload.p_difficulty, 'medium');
    assert.equal(h.calls[0].payload.p_payload.p_accepted_answers[0].answer_text, 'First answer');
    assert.equal(e.questionId, null);
    assert.equal(e.questionPrompt, ''); assert.equal(e.questionAnswer, '');
    assert.equal(e.questionConceptId, 'existing-concept');
    assert.equal(e.questionDifficulty, 'medium');
    assert.equal(e.questionTestingAngle, 'Clinical Application');
    assert.equal(e.questionRecordStatus, 'published');
    assert.equal(e.isQuestionDirty, false);
    e.setQuestionPrompt('Second prompt'); e.setQuestionAnswer('Second answer');
    await h.render().saveQuestion();
    assert.equal(h.calls[1].payload.p_payload.p_question_id, null);
    assert.equal(h.calls[1].payload.p_payload.p_status, 'published');
    assert.equal(h.calls[1].payload.p_payload.p_difficulty, 'medium');
    assert.equal(h.calls[1].payload.p_payload.p_concept_id, 'existing-concept');

  });
}

test('edit-mode Concept and Question saves retain identity and content', async () => {
  const h = editor({ editing: true });
  let e = h.render(); e.setConcept('Edited Concept');
  await h.render().saveConcept();
  e = h.render(); assert.equal(e.concept, 'Edited Concept'); assert.notEqual(e.conceptId, null);
  e.selectExistingQuestion({ id: 'existing-question', conceptId: 'existing-concept', primaryConceptName: 'Existing Concept', relatedConceptIds: [], prompt: 'Old', answer: 'Answer', difficulty: 'easy', testingAngle: 'Recall', status: 'draft', tags: [] });
  e = h.render(); e.setQuestionPrompt('Edited Question');
  await h.render().saveQuestion();
  e = h.render(); assert.equal(e.questionId, 'existing-question');
  assert.equal(e.questionPrompt, 'Edited Question'); assert.equal(e.questionAnswer, 'Answer');
  assert.equal(e.questionRecordStatus, 'draft'); assert.equal(e.isQuestionDirty, false);
});

test('failed saves preserve new drafts and dirty state', async () => {
  const h = editor({ editing: true, response: () => ({ error: { message: 'Fixture failure' } }) });
  let e = h.render(); e.setConcept('Keep concept'); e.setQuestionPrompt('Keep prompt'); e.setQuestionAnswer('Keep answer');
  await h.render().saveConcept(); await h.render().saveQuestion();
  e = h.render(); assert.equal(e.concept, 'Keep concept'); assert.equal(e.questionPrompt, 'Keep prompt');
  assert.equal(e.questionAnswer, 'Keep answer'); assert.equal(e.isContentDirty, true); assert.equal(e.isQuestionDirty, true);
  assert.equal(e.isSaving, false); assert.equal(e.isSavingQuestion, false);
});

test('incomplete reference confirmation retains saved Concept identity for safe retry', async () => {
  const h = editor({ response: (name, payload) => { const result = formatSaveResponse(name, payload); delete result.data.references; return result; } });
  h.render().setConcept('Keep this'); await h.render().saveConcept();
  const e = h.render(); assert.equal(e.concept, 'Keep this'); assert.equal(e.conceptId, 'saved-concept');
  assert.equal(e.isContentDirty, true); assert.match(e.status.message, /incomplete/);
});

test('pending save disables editor and prevents another save handler from submitting', async () => {
  let finish;
  const h = editor({ response: () => new Promise(resolve => { finish = resolve; }) });
  h.render().setConcept('Pending');
  const saving = h.render().saveConcept();
  let e = h.render(); assert.equal(e.isSaving, true);
  const fieldset = e.tree.props.children[1].props.children;
  assert.equal(fieldset.type, 'fieldset'); assert.equal(fieldset.props.disabled, true);
  await e.saveConcept(); await e.saveQuestion(); assert.equal(h.calls.length, 1);
  finish(formatSaveResponse(h.calls[0].name, h.calls[0].payload));
  await saving; e = h.render(); assert.equal(e.isSaving, false); assert.equal(e.concept, '');
});

for (const difficulty of ['easy','medium','hard']) for (const status of ['draft','published','archived']) {
 test(`existing ${difficulty}/${status} Question preserves hidden metadata and identity`, async()=>{
  const h=editor({editing:true});
  h.render().selectExistingQuestion({id:'existing-question',conceptId:'existing-concept',primaryConceptName:'Existing',relatedConceptIds:[],prompt:'Old',answer:'Answer',difficulty,testingAngle:'Recall',status,tags:[]});
  h.render().setQuestionPrompt('Unrelated text edit');await h.render().saveQuestion();
  const e=h.render(),call=h.calls.find(c=>c.name==='save_question_with_format');
  assert.equal(call.payload.p_payload.p_question_id,'existing-question');assert.equal(call.payload.p_payload.p_difficulty,difficulty);assert.equal(call.payload.p_payload.p_status,status);
  assert.equal(e.questionId,'existing-question');assert.equal(e.questionDifficulty,difficulty);assert.equal(e.questionRecordStatus,status);assert.equal(e.isQuestionDirty,false);
  e.startNewQuestion();assert.equal(h.render().questionDifficulty,'medium');assert.equal(h.render().questionRecordStatus,'published');
 });
}
