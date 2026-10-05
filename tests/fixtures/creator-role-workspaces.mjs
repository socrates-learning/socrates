import * as officialFormat from '../../lib/official-content-format.ts';
import React from 'react';
import * as reactJsx from 'react/jsx-runtime';
import { questionImageBoundary } from './question-media-authoring.mjs';
import { conceptMedia, conceptImageBoundary, conceptContentBoundary } from './concept-media-authoring.mjs';
import * as markdownEditing from '../../lib/markdown-editing.ts';
import * as topicSelection from '../../lib/topic-selection-presentation.ts';
import * as homeSettings from '../../lib/home-deck-settings.ts';
// Disposable in-memory characterization only. No Auth, network, or database is used.
// Adapted from the existing role-derived-ownership harness. Effects are deliberately
// excluded; DOM geometry, real focus, RLS, and browser drag/drop are not proved here.
import * as standaloneCards from '../../lib/standalone-custom-cards.ts';
import * as topicPositioning from '../../lib/creator-topic-positioning.ts';
import * as personalStructure from '../../lib/creator-personal-structure.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { deriveCreatorCapabilities } from '../../lib/creator-capabilities.ts';
import { resolveCreatorCommandRoute } from '../../lib/creator-command-contracts.ts';
import * as entityContracts from '../../lib/creator-entity-contracts.ts';
import { buildConceptTopicTree } from '../../lib/concept-topic-tree.ts';
import {
  composeUnifiedCreatorTopicTree,
  flattenUnifiedCreatorTopics,
  shouldShowPersonalCreatorTopics,
} from '../../lib/creator-unified-topic-tree.ts';

// Execute the actual component's save handlers with in-memory hooks and database
// responses. Effects are intentionally excluded: these are transaction/state
// regression tests, not browser or database integration tests.
export const source = readFileSync(new URL('../../components/CreatorStudioV2Client.tsx', import.meta.url), 'utf8');
export const testingAngleVocabulary = [
  'General Understanding', 'Recognition / Definition', 'Mechanism / Pathophysiology',
  'Clinical Manifestations', 'Assessment / Interpretation', 'Clinical Application',
  'Intervention / Management', 'Complications / Outcomes', 'Differentiation / Comparison',
].map((name, index) => ({ id: `angle-${index}`, storage_key: name, display_name: name, status: 'active',
  reserved_names: [name.toLowerCase()], sort_order: index, revision: 1 }));
const runtimeContext = { exports: {}, require: () => entityContracts };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../../lib/creator-studio-runtime.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, runtimeContext);
const exposed = [
  'testingAngleCatalog', 'setTestingAngleCatalog', 'loadTestingAngleCatalog', 'mutateTestingAngleCatalog',
  'testingAngleCatalogStatus', 'testingAngleCatalogBusy', 'setTestingAngleNameDraft', 'setTestingAngleRename',
  'testingAngleLabel', 'resolveTestingAngleFilter', 'questionAdditionalTestingAngles', 'setQuestionAdditionalTestingAngles',
    'questionMarkdownState', 'setQuestionMarkdownState', 'answerMarkdownState', 'setAnswerMarkdownState',
    'browseQuestionConcept', 'associateQuestionConcept', 'makeQuestionConceptPrimary', 'draftQuestionPrimaryId', 'setNeedsQuestionsOnly',
  'navigateFromCreator', 'goBackFromCreator', 'isDirty', 'confirmDiscardQuestionChanges',
  'learnerDeck', 'setLearnerDeck', 'learnerSelectionError', 'learnerSelectionBusy', 'saveLearnerTopicSelection', 'renderLearnerStudyCheckbox', 'learnerSelectionContext',
  'personalQuestionConceptId', 'closeTopicDialog', 'creatorAuthority', 'loadQuestionSearchPage', 'questionSearchResults', 'deleteSelectedStandaloneCard', 'activeCreatorTab', 'standaloneEditorRef', 'closeStandaloneEditor', 'standaloneRequest', 'filterPersonalCardsForSearch', 'setStandaloneCards',
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
const renderMarker = '  return (\n    <>\n      <Header />';
assert.equal(source.split(renderMarker).length, 2, 'Expected one main Creator render boundary');
const compiled = ts.transpileModule(source.replace(
  '  return (\n    <>\n      <Header />',
  `  capture({ ${exposed} });\n  return (\n    <>\n      <Header />`,
), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;

// Released editor-only representation, used solely for original whole-workspace
// hashes. Real visual editing is exercised separately; surrounding JSX is current.
const releasedConceptEditor = "              <div\n                aria-label=\"Concept formatting tools\"\n                style={{\n                  display: 'flex',\n                  flexWrap: 'wrap',\n                  gap: 8,\n                  alignItems: 'center',\n                }}\n              >\n                {[\n                  ['bold', 'Bold'],\n                  ['italic', 'Italic'],\n                  ['heading', 'Heading'],\n                  ['bulleted-list', 'Bulleted List'],\n                  ['numbered-list', 'Numbered List'],\n                  ['link', 'Link'],\n                  ['quote', 'Quote'],\n                  ...(conceptSource === 'official' && creatorAuthority.canSaveConcept ? [['image', 'Image']] : []),\n                ].map(([format, label]) => (\n                  <button\n                    className={styles.toolButton}\n                    key={format}\n                    type=\"button\"\n                    disabled={isCurrentContentReadOnly || (format === 'image' && (isSaving || conceptImages.pending))}\n                    data-concept-image-action={format === 'image' ? 'true' : undefined}\n                    onClick={() => format === 'image' ? conceptImages.open(conceptImageEditorRef.current?.selection().end ?? conceptEditorRef.current?.selectionEnd ?? concept.length) : applyMarkdownFormat(format as MarkdownFormat, () => conceptImageEditorRef.current)}\n                  >\n                    {label}\n                  </button>\n                ))}\n                <span style={{ flex: 1 }} />\n                {(['write', 'preview'] as const).map((mode) => (\n                  <button\n                    className={\n                      editorMode === mode\n                        ? styles.primaryButton\n                        : styles.secondaryButton\n                    }\n                    key={mode}\n                    type=\"button\"\n                    onClick={() => setEditorMode(mode)}\n                  >\n                    {mode === 'write' ? 'Write' : 'Preview'}\n                  </button>\n                ))}\n              </div>\n              {conceptSource === 'official' && creatorAuthority.canSaveConcept ? <ConceptImageAuthoring controller={conceptImages} disabled={isSaving} /> : null}\n              {editorMode === 'write' ? (\n                conceptSource === 'official' && concept.includes('[[socrates-media:') ? (\n                  <ConceptImageWriteEditor source={concept} controller={conceptImages} disabled={isCurrentContentReadOnly || isSaving}\n                    className={styles.conceptEditor} editorRef={conceptImageEditorRef} onChange={value => { setConcept(value); setStatus(null); }} />\n                ) : (\n                <textarea\n                  ref={conceptEditorRef}\n                  className={styles.conceptEditor}\n                  value={concept}\n                  readOnly={isCurrentContentReadOnly}\n                  maxLength={conceptSource === 'personal' ? 1000 : undefined}\n                  onChange={(event) => {\n                    setConcept(event.target.value);\n                    setStatus(null);\n                  }}\n                  placeholder=\"Write your concept or explanation here...\"\n                  aria-label=\"Concept or explanation\"\n                />\n                )\n              ) : (\n                <div\n                  className={styles.conceptEditor}\n                  style={{\n                    overflow: 'auto',\n                    whiteSpace: 'normal',\n                  }}\n                  aria-label=\"Concept preview\"\n                >\n                  {concept.trim() ? (\n                    conceptSource === 'official' && conceptImages.usesMedia\n                      ? <ConceptMediaContent markdown={concept} conceptId={conceptId} libraryId={activeLibraryId} context={conceptImages.context} placements={conceptImages.items} />\n                      : <MarkdownContent markdown={concept} />\n                  ) : (\n                    <p className=\"muted\">Nothing to preview yet.</p>\n                  )}\n                </div>\n              )}\n";
const creatorAst = ts.createSourceFile('Creator.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const editorExpressions = [];
function visitEditor(node) {
  if (ts.isJsxExpression(node) && node.getText(creatorAst).startsWith("{conceptSource === 'official' ? <OfficialVisualField")) editorExpressions.push(node);
  ts.forEachChild(node, visitEditor);
}
visitEditor(creatorAst);
assert.equal(editorExpressions.length, 1, 'Only the approved Concept editing expression may be projected');
const editorExpression = editorExpressions[0];
export const conceptVisualExpression = editorExpression.getText(creatorAst);
const projectedSource = source.slice(0, editorExpression.getStart(creatorAst)) + releasedConceptEditor.trim() + source.slice(editorExpression.end);
const projectedCompiled = ts.transpileModule(projectedSource.replace(renderMarker, `  capture({ ${exposed} });\n  return (\n    <>\n      <Header />`), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

export function editor({ projectOfficialTextEditor = false, role = 'admin', editing = false, response, references = [], cards = true, placed = false, neutralFixture = false, confirm = () => true, vocabulary = testingAngleVocabulary } = {}) {
  const slots = [];
  let unloadEffect;
  const listeners = new Map();
  let selectionEffect;
  let structureEffect;
  let cursor = 0;
  let api;
  const calls = [];
  const reads = [];
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
    useEffect: fn => { if (fn.toString().includes('warnBeforeUnload')) unloadEffect = fn; else if (fn.toString().includes('async function refresh()')) structureEffect = fn; else if (fn.toString().includes('learnerSelectionContext')) selectionEffect = fn; },
  };
  const database = {
    rpc(name, payload) {
      reads.push({ rpc: name });
      const result = rpcResult(name, payload);
      return Object.assign(Promise.resolve(result), { single: async () => result });
    },
    from(table) {
      reads.push({ table });
      let mutation; const filters = [];
      const query = {
        select() { return query; }, is(key,value) { filters.push([key,value]); return query; }, eq(key, value) { filters.push([key, value]); return query; },
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
      if (name === 'get_creator_questions_with_media') return { data: [], error: null };
      if (name === 'get_testing_angle_vocabulary') return response?.(name, payload) ?? { data: structuredClone(vocabulary), error: null };
      calls.push({ name, payload });
      if (response) return response(name, payload);
      if (name === 'create_personal_topic') return { data: { id: 'new-topic', owner_id: 'owner', name: payload.p_name, parent_id: payload.p_parent_personal_topic_id }, error: null };
      if (name === 'create_library_node_in_library') return { data: { id: 'new-official-topic' }, error: null };
      if (name === 'save_personal_concept_with_overlay') return { data: { personal_concept_id: payload.p_personal_concept_id, owner_id: 'owner', topic_id: payload.p_personal_topic_id, concept_name: payload.p_name, concept_description: payload.p_description }, error: null };

      return formatSaveResponse(name, payload);
  }
  let shellGuard;
  const modules = {
    react: hooks,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'next/navigation': { useRouter: () => ({ push: path => routes.push(path), replace: path => routes.push(path), refresh: () => routes.push('refresh') }) },
    'lucide-react': new Proxy({}, { get: (_target, key) => `icon:${String(key)}` }),
    '@/components/Header': {},
    '@/components/MarkdownContent': { cardMarkdownSummary: source => source, questionMarkdownSummary: questionMarkdown.questionMarkdownSummary },
    './creator/QuestionMarkdownField': questionField,
    './creator/OfficialVisualField': visualFieldBoundary,
    '@/components/ConceptMediaContent': conceptContentBoundary,
    '@/components/creator/ConceptImageAuthoring': conceptImageBoundary,
    '@/components/creator/QuestionImageAuthoring': questionImageBoundary,
    '@/lib/concept-media': conceptMedia,
    './creator/CreatorQuestionSearchPanel': { CreatorQuestionSearchPanel },
    './creator/CreatorLearnerQuestionsWorkspace': { CreatorLearnerQuestionsWorkspace() {} },
    './creator/StandaloneCustomCardWorkspace': { StandaloneCustomCardWorkspace: () => null },
    '@/lib/standalone-custom-cards': standaloneCards,
    '@/lib/markdown-editing': markdownEditing,
    '@/lib/topic-selection-presentation': topicSelection,
    '@/lib/home-deck-settings': homeSettings,
    '@/components/creator/CreatorStudioChrome': {
      ...chrome,
    },
    '@/lib/concept-topic-tree': { buildConceptTopicTree },
    '@/lib/supabase': { supabase: database },
    '@/lib/creator-personal-structure': personalStructure,
    '@/lib/safe-navigation': { navigateBackOrFallback: () => routes.push('back-or-fallback') },
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
    './CreatorTopicTreeInteraction': { CreatorTopicTreeInteraction() {}, TopicDropRow() {}, TopicDragHandle() {} },
    '@/lib/creator-topic-positioning': topicPositioning,
    '@/components/application-shell/SocratesShell': { useSocratesNavigationGuard(guard) { shellGuard = guard; } },
    './CreatorStudioV2Client.module.css': { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) },
  };
  const confirmations = [];
  class FocusTarget { count = 0; focus() { this.count++; } }
  const focusTarget = new FocusTarget();
  const context = {
    exports: {}, capture: value => { api = value; },
    require(name) { assert.ok(name in modules, `Unexpected import: ${name}`); return modules[name]; },
    document: { activeElement: focusTarget }, HTMLElement: FocusTarget,
    window: { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name), requestAnimationFrame: fn => fn(), confirm: message => { confirmations.push(message); return confirm(message); }, location: { pathname: '/creator' }, history: { replaceState: (_a, _b, path) => routes.push(path) } },
  };
  vm.runInNewContext(projectOfficialTextEditor ? projectedCompiled : compiled, context);
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
  let vocabularyInitialized = false;
  function render() {
    cursor = 0; const tree = context.exports.CreatorStudioV2Client(props);
    if (!vocabularyInitialized) {
      vocabularyInitialized = true;
      api.setTestingAngleCatalog(role === 'learner' ? [] : structuredClone(vocabulary));
      return render();
    }
    return { ...api, tree };
  }
  return { runShellGuard: () => shellGuard(), render, calls, reads, orders, routes, confirmations, focusTarget, props, listeners, runUnloadEffect: () => unloadEffect(), runSelectionEffect: () => selectionEffect(), runStructureEffect: () => structureEffect() };
}

export function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (tree.type === CreatorQuestionSearchPanel) return nodes(CreatorQuestionSearchPanel(tree.props));
  if (tree.type === OfficialVisualFieldBoundary) return nodes(OfficialVisualFieldBoundary(tree.props));
  if (tree.type === questionField.QuestionMarkdownField) return [tree, ...nodes(questionField.QuestionMarkdownField(tree.props))];
  return [tree, ...nodes(tree.props?.children), ...(tree.type?.name === 'CreatorLearnerQuestionsWorkspace' ? [...nodes(tree.props.editor), ...nodes(tree.props.topicTree)] : [])];
}

const chromeSource = readFileSync(new URL('../../components/creator/CreatorStudioChrome.tsx', import.meta.url), 'utf8');
const chromeContext = { exports: {}, require(name) {
  if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
  if (name === '@/components/StudyCreatorFlaggedBrowser') return { StudyCreatorFlaggedBrowser() {} };
  if (name === '../CreatorStudioV2Client.module.css') return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
  throw new Error(`Unexpected chrome dependency: ${name}`);
} };
vm.runInNewContext(ts.transpileModule(chromeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, chromeContext);
export const chrome = chromeContext.exports;
export function expandChrome(tree) {
  if (!tree || typeof tree !== 'object') return tree;
  if (Array.isArray(tree)) return tree.map(expandChrome);
  if (tree.type === CreatorQuestionSearchPanel) return expandChrome(CreatorQuestionSearchPanel(tree.props));
  if (tree.type === OfficialVisualFieldBoundary) return expandChrome(OfficialVisualFieldBoundary(tree.props));
  if (tree.type === questionField.QuestionMarkdownField) return expandChrome(questionField.QuestionMarkdownField(tree.props));
  if (Object.values(chrome).includes(tree.type)) return expandChrome(tree.type(tree.props));
  return { ...tree, props: { ...tree.props, children: expandChrome(tree.props?.children) } };
}
export function text(tree) {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (!tree) return '';
  if (Array.isArray(tree)) return tree.map(text).join(' ');
  return text(tree.props?.children);
}
export function button(tree, label) {
  const matches = nodes(expandChrome(tree)).filter(n => n.type === 'button' && text(n).trim() === label);
  assert.equal(matches.length, 1, `Expected one button: ${label}`);
  return matches[0];
}
export const roles = ['admin', 'editor', 'learner'];
export const currentTabLabels = ['Content', 'Questions', 'Tags', 'Flagged', 'Search'];

// Frozen from released a48ea5fb Creator source, verified byte-identical to HEAD.
// Rendered attributes/styles/text and child-component props; functions retain names,
// while callback behavior is asserted separately. Never regenerate to mask a change.
export const releasedStaffRenderHashes = {
  "admin": {
    "content": "5f3606757750b8c505ebf00f92118a92ae4fb21552883df5a74ea95c3fe720ec",
    "questions": "fcd03e32a744203c05acdcb2b11f4219c8ae239ad40e58fc81cb8efd7fc22b30",
    "tags": "7e52b64f57320a28c1b1964e9bba6e8f7733abc5776ef6e6df6fd88ece700e4f",
    "flagged": "a28674503b404993811f3cea30189ff3781d04126f4cb37ac869928a41f5b66c"
  },
  "editor": {
    "content": "5f3606757750b8c505ebf00f92118a92ae4fb21552883df5a74ea95c3fe720ec",
    "questions": "fcd03e32a744203c05acdcb2b11f4219c8ae239ad40e58fc81cb8efd7fc22b30",
    "tags": "7e52b64f57320a28c1b1964e9bba6e8f7733abc5776ef6e6df6fd88ece700e4f",
    "flagged": "a28674503b404993811f3cea30189ff3781d04126f4cb37ac869928a41f5b66c"
  }
};

// Exercise the real Search presentation while keeping its parent-owned callbacks observable.
const markdownContext = { exports: {}, URL, require(name) {
  if (name === '@/lib/official-content-format') return officialFormat;
  if (name === 'react') return React;
  if (name === 'react/jsx-runtime') return reactJsx;
  if (name === './MarkdownContent.module.css') return { __esModule: true, default: { card: 'card', question: 'question' } };
  throw new Error(`Unexpected Markdown dependency: ${name}`);
} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../../components/MarkdownContent.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, markdownContext);
export const questionMarkdown = markdownContext.exports;
// Parent-workflow boundary only. The real React/ProseMirror field is mounted in
// official-visual-field tests; this controlled input makes no visual-editor claim.
export function OfficialVisualFieldBoundary(props) {
  const element = (type, props) => ({ type, props });
  return element('div', { children: [
    element('textarea', { 'aria-label': props.ariaLabel, value: props.value,
      disabled: props.disabled, readOnly: props.readOnly,
      onChange: event => { if (!props.disabled && !props.readOnly) props.onChange(event.target.value, props.format); } }),
    props.onImage ? element('button', { type: 'button', 'data-concept-image-action': 'true', children: 'Image', onClick: () => props.onImage(props.value.length) }) : null,
    props.between,
  ] });
}
export const visualFieldBoundary = { __esModule: true, default: OfficialVisualFieldBoundary };
// The actual controlled field renders against inert DOM refs here. Mounted focus is
// verified separately; source/presentation ownership remains the real parent's.
const fieldContext = { exports: {}, requestAnimationFrame: fn => fn(), require(name) {
  if (name === 'react') return { useId: () => 'question-field', useRef: value => ({ current: value }) };
  if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
  if (name === './OfficialVisualField') return visualFieldBoundary;
  if (name === '@/lib/markdown-editing') return markdownEditing;
  if (name === '@/components/MarkdownContent') return questionMarkdown;
  if (name === '../CreatorStudioV2Client.module.css') return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
  throw new Error(`Unexpected Question field dependency: ${name}`);
} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../../components/creator/QuestionMarkdownField.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, fieldContext);
export const questionField = fieldContext.exports;

const searchPanelContext = { exports: {}, require(name) {
  if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
  if (name === 'lucide-react') return { Search: 'icon:Search' };
  if (name === '@/components/MarkdownContent') return { questionMarkdownSummary: questionMarkdown.questionMarkdownSummary };
  if (name === '@/lib/creator-entity-contracts') return { createCreatorEntityKey: (source, kind, id) => `${source}:${kind}:${id}` };
  if (name === '../CreatorStudioV2Client.module.css') return { __esModule: true, default: new Proxy({}, {get: (_, key) => String(key)}) };
  throw new Error(`Unexpected Search dependency: ${name}`);
} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../../components/creator/CreatorQuestionSearchPanel.tsx', import.meta.url), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText, searchPanelContext);
export const CreatorQuestionSearchPanel = searchPanelContext.exports.CreatorQuestionSearchPanel;

// Exact format-aware transaction fixture. The envelope remains visible to every
// caller/assertion; no new RPC is aliased to a released legacy write command.
export function formatSaveResponse(name, envelope) {
  assert.ok(['save_concept_with_format', 'save_question_with_format'].includes(name), `Unexpected write RPC: ${name}`);
  assert.ok(envelope.p_active_library_id);
  assert.ok(Object.hasOwn(envelope, 'p_expected_version'));
  assert.ok(Object.hasOwn(envelope, 'p_expected_updated_at'));
  const p = envelope.p_payload;
  assert.ok(p && typeof p === 'object');
  if (name === 'save_concept_with_format') return { data: {
    concept_id: p.p_concept_id || 'saved-concept', version_id: 'saved-concept-version', updated_at: '2026-10-03T12:00:00Z',
    bodyMarkdown: p.p_body_markdown, body_format: envelope.p_body_format,
    references: p.p_references.map(r => ({ client_id: r.client_id, source_id: 'source', attribution_id: 'attribution' })),
  }, error: null };
  assert.equal(p.p_accepted_answers.length, 1);
  return { data: { id: p.p_question_id || 'saved-question', current_version_id: 'saved-question-version', updated_at: '2026-10-03T12:00:00Z',
    prompt: p.p_prompt, prompt_format: p.p_prompt_format,
    question_accepted_answers: p.p_accepted_answers.map(a => ({ ...a, id: a.id || 'saved-answer' })),
  }, error: null };
}

// Real DOM integration harness for the mounted shared field. Each dependency is
// explicit; no unknown module or RPC can silently fall back to a mock.
export async function mountVisualField(initial = {}) {
  const { JSDOM } = await import('jsdom');
  const { loadFoundation, pm } = await import('./official-authoring.mjs');
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true, url: 'https://disposable.example.test' });
  // JSDOM has no layout. Real scrolling/geometry is verified in browser UAT.
  dom.window.Range.prototype.getClientRects = () => [];
  dom.window.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
  const saved = new Map();
  for (const key of ['window', 'document', 'navigator', 'MutationObserver', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'HTMLElement', 'Event', 'KeyboardEvent']) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, value: typeof dom.window[key] === 'function' && ['getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'].includes(key) ? dom.window[key].bind(dom.window) : dom.window[key] });
  }
  saved.set('IS_REACT_ACT_ENVIRONMENT', Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT'));
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import('react-dom/client');
  const { createPortal } = await import('react-dom');
  const loaded = new Map();
  function component(name) {
    if (loaded.has(name)) return loaded.get(name);
    assert.ok(['OfficialAuthoringToolbar', 'OfficialVisualField', 'QuestionMarkdownField'].includes(name), name);
    const modules = {
      react: React, 'react/jsx-runtime': reactJsx, 'react-dom': { createPortal },
      '@/components/MarkdownContent': questionMarkdown,
      '@/lib/official-authoring/session': loadFoundation('session'),
      'prosemirror-view': pm('prosemirror-view'),
      '../CreatorStudioV2Client.module.css': { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) },
      './OfficialVisualField.module.css': { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) },
    };
    const context = { exports: {}, document: dom.window.document, requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), require(id) {
      if (id === './OfficialAuthoringToolbar') return component('OfficialAuthoringToolbar');
      if (id === './OfficialVisualField') return component('OfficialVisualField');
      assert.ok(Object.hasOwn(modules, id), `Unexpected mounted editor dependency: ${id}`); return modules[id];
    } };
    vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../../components/creator/${name}.tsx`, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText, context, { filename: name + '.tsx' });
    loaded.set(name, context.exports); return context.exports;
  }
  const Field = initial.wrapper ? component('QuestionMarkdownField').QuestionMarkdownField : component('OfficialVisualField').default;
  const writes = [], memory = { current: null }, handle = { current: null };
  let controls, current;
  const root = createRoot(dom.window.document.getElementById('root'));
  function Harness() {
    const [props, setProps] = React.useState({ label: 'Question', ariaLabel: 'Question front of card', placeholder: 'Front of card', value: 'Selected', format: 'visual_markdown_v1', flavor: 'question', documentKey: 'library:question:draft', mode: 'write', disabled: false, readOnly: false, ...initial });
    const [shown, setShown] = React.useState(true);
    React.useLayoutEffect(() => { current = props; controls = { setProps, setShown }; }, [props]);
    const onChange = (value, format) => { writes.push({ value, format }); setProps(p => ({ ...p, value, format })); };
    return shown ? React.createElement(Field, { ...props, memory, handle, onChange, onMode: mode => setProps(p => ({ ...p, mode })),
      state: { mode: props.mode, selectionStart: 0, selectionEnd: 0 }, onStateChange: state => setProps(p => ({ ...p, mode: state.mode })) }) : null;
  }
  async function act(action) { await React.act(async () => { await action?.(); await new Promise(resolve => setTimeout(resolve, 0)); }); }
  await act(() => root.render(React.createElement(Harness)));
  return { dom, writes, memory, handle, act, get props() { return current; },
    get view() { return memory.current?.view; }, get session() { return memory.current?.session; },
    button(label) { const candidates = [...dom.window.document.querySelectorAll('button')].filter(b => b.textContent === label); assert.equal(candidates.length, 1, label); return candidates[0]; },
    async click(label) { await act(() => this.button(label).click()); },
    async update(props) { await act(() => controls.setProps(p => ({ ...p, ...props }))); },
    async show(value) { await act(() => controls.setShown(value)); },
    async select(from, to = from) { await act(() => this.view.dispatch(this.view.state.tr.setSelection(pm('prosemirror-state').TextSelection.create(this.view.state.doc, from, to)))); },
    async type(text) { await act(() => this.view.dispatch(this.view.state.tr.insertText(text))); },
    async input(element, value) { await act(() => { const setter = Object.getOwnPropertyDescriptor(element.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype, 'value').set; setter.call(element, value); element.dispatchEvent(new dom.window.Event('input', { bubbles: true })); }); },
    async close() { await act(() => root.unmount()); dom.window.close(); for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } },
  };
}
