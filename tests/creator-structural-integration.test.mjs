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
  'createPersonalTopic', 'moveActiveTopic', 'setMoveDestinationId', 'personalTopics', 'personalTopicPlacements', 'activePersonalTopicId', 'personalTopicCreationContext',
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

function editor({ role = 'learner', editing = false, response, references = [], cards = true, structure, refreshed, refreshError = false } = {}) {
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
        then(resolve) { return Promise.resolve({ data: table === 'personal_topics' ? refreshed?.topics ?? [] : table === 'personal_topic_official_placements' ? refreshed?.placements ?? [] : [], error: refreshError ? { message: 'refresh failed' } : null }).then(resolve); },
      };
      return query;
    },
  };
  function rpcResult(name, payload) {
      if (name === 'get_creator_questions_with_media') name = 'get_creator_questions';
      if (name === 'get_creator_questions') return { data: [], error: null };
      calls.push({ name, payload });
      if (response) return response(name, payload);
      if (name === 'position_personal_topic') return {data:{topic_id:payload.p_topic_id},error:null};
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
    '@/components/MarkdownContent': { cardMarkdownSummary: source => source },
    '@/components/ConceptMediaContent': conceptContentBoundary,
    '@/components/creator/QuestionImageAuthoring': questionImageBoundary,
    '@/components/creator/ConceptImageAuthoring': conceptImageBoundary,
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
      topics: structure?.topics ?? [{ id: 'mine-topic', owner_id: 'owner', parent_id: null, name: 'Personal Topic', sort_order: 0 }],
      concepts: [{ id: 'mine-concept', owner_id: 'owner', topic_id: 'mine-topic', name: 'Personal Concept', description: 'Original body' }],
      cards: cards ? [{ id: 'mine-card', owner_id: 'owner', concept_id: 'mine-concept', question: 'Personal Question', answer: 'Original answer' }] : [],
      overlays: [], topicPlacements: structure?.placements ?? [],
    },
  };
  function render() { cursor = 0; const tree = context.exports.CreatorStudioV2Client(props); return { ...api, tree }; }
  return { render, calls, orders, routes };
}


const topic = (id, parent_id, sort_order) => ({ id, owner_id: 'owner', parent_id, sort_order, name: id });
const initial = () => ({ topics: [topic('p', null, 0), topic('q', null, 1), topic('a', 'p', 0), topic('b', 'p', 1)], placements: ['p','q'].map(id=>({id:'place-'+id,owner_id:'owner',personal_topic_id:id,library_node_id:'topic'})) });
const plain = value => JSON.parse(JSON.stringify(value));
test('actual Creator Move installs all final sibling rows, preserves selection and Add Subtopic target', async () => {
 const structure=initial();const refreshed={topics:structure.topics.map(t=>t.id==='b'?{...t,parent_id:'q',sort_order:0}:t),placements:structure.placements};
 const h=editor({structure,refreshed});let e=h.render();e.setActivePersonalTopicId('b');e.setMoveDestinationId('personal:topic:q');e=h.render();await e.moveActiveTopic();e=h.render();
 assert.deepEqual(plain(e.personalTopics),refreshed.topics);assert.equal(e.activePersonalTopicId,'b');assert.equal(new Set(e.personalTopics.map(t=>t.id)).size,4);
 e.openPersonalTopicDialog();e=h.render();assert.equal(e.personalTopicCreationContext.parentPersonalTopicId,'b');
 e.setMoveDestinationId('personal:topic:p');e=h.render();await e.moveActiveTopic();assert.equal(h.calls.at(-1).payload.p_expected_parent_id,'q');
});
for (const failure of ['stale sibling sequence','stale parent','normalization failure','placement failure']) test(`actual Creator ${failure} leaves tree and selection unchanged`,async()=>{
 const structure=initial();const h=editor({structure,refreshed:structure,response:()=>({data:null,error:{message:failure}})});let e=h.render();e.setActivePersonalTopicId('b');e.setMoveDestinationId('personal:topic:q');e=h.render();await e.moveActiveTopic();e=h.render();
 assert.deepEqual(plain(e.personalTopics),structure.topics);assert.deepEqual(plain(e.personalTopicPlacements),structure.placements);assert.equal(e.activePersonalTopicId,'b');assert.equal(e.status.message,failure);
});
test('actual Creator root relocation refreshes and Unplaced is rejected without a write',async()=>{
 const structure=initial();const refreshed={topics:structure.topics.map(t=>t.id==='p'?{...t,sort_order:0}:t),placements:[{id:'place',owner_id:'owner',personal_topic_id:'p',library_node_id:'topic'}]};
 const h=editor({structure,refreshed});let e=h.render();e.setActivePersonalTopicId('p');e.setMoveDestinationId('official:topic:topic');e=h.render();await e.moveActiveTopic();e=h.render();assert.deepEqual(plain(e.personalTopicPlacements),refreshed.placements);assert.equal(e.activePersonalTopicId,'p');
 const callsBefore=h.calls.length;e.setMoveDestinationId('unplaced');e=h.render();await e.moveActiveTopic();e=h.render();assert.deepEqual(plain(e.personalTopicPlacements),refreshed.placements);assert.equal(h.calls.length,callsBefore);assert.equal(e.status.tone,'error');
});
test('actual Creator committed Move with refresh failure reports it without optimistic corruption',async()=>{
 const structure=initial();const h=editor({structure,refreshed:structure,refreshError:true});let e=h.render();e.setActivePersonalTopicId('b');e.setMoveDestinationId('personal:topic:q');e=h.render();await e.moveActiveTopic();e=h.render();assert.deepEqual(plain(e.personalTopics),structure.topics);assert.match(e.status.message,/Topic moved, but the tree could not be refreshed/);
});


test('canonical Creator rejects missing placement before sending a creation RPC',async()=>{
 const h=editor({structure:initial(),refreshed:initial()});const e=h.render();
 assert.equal(await e.createPersonalTopic('Invalid root',{parentPersonalTopicId:null,officialLibraryNodeId:null}),false);
 assert.equal(h.calls.length,0);assert.match(h.render().status.message,/canonical tree/);
});
test('canonical Add Subtopic preserves the source-qualified parent in the atomic RPC',async()=>{
 const structure=initial();const h=editor({structure,refreshed:structure});const e=h.render();
 assert.equal(await e.createPersonalTopic('Nested',{parentPersonalTopicId:'a',officialLibraryNodeId:null}),true);
 assert.equal(h.calls[0].name,'create_personal_topic');assert.equal(h.calls[0].payload.p_parent_personal_topic_id,'a');
 assert.equal(h.calls[0].payload.p_official_library_node_id,null);
});
