import * as markdownEditing from '../../lib/markdown-editing.ts';
import * as topicSelection from '../../lib/topic-selection-presentation.ts';
import * as homeSettings from '../../lib/home-deck-settings.ts';
// Released Question workflow characterization. Explicit runEffect executes only a named
// actual effect; this harness does not simulate React scheduling or prove database RLS.
// Disposable in-memory characterization only. No Auth, network, or database is used.
// Adapted from the released role-workspace harness. Effects run only when explicitly
// requested; DOM geometry, real focus, RLS, and browser drag/drop are not proved here.
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
import { composeUnifiedCreatorTopicTree, flattenUnifiedCreatorTopics, shouldShowPersonalCreatorTopics, } from '../../lib/creator-unified-topic-tree.ts';
// Execute the actual component's save handlers with in-memory hooks and database
// responses. Named effects and cleanup callbacks are exercised explicitly; these
// are render/handler characterizations, not mounted browser or database integration tests.
export const source = readFileSync(new URL('../../components/CreatorStudioV2Client.tsx', import.meta.url), 'utf8');
const runtimeContext = { exports: {}, require: () => entityContracts };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../../lib/creator-studio-runtime.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, runtimeContext);
const exposed = [
    'browseQuestionConcept', 'associateQuestionConcept', 'makeQuestionConceptPrimary', 'draftQuestionPrimaryId', 'setNeedsQuestionsOnly',
    'questionTags', 'setQuestionTags', 'questionRelatedConceptIds', 'setQuestionRelatedConceptIds', 'questionAdditionalTestingAngles', 'setQuestionAdditionalTestingAngles', 'existingQuestions', 'setExistingQuestions', 'primaryQuestionConceptId', 'editingQuestionPrimary', 'questionTopicId', 'setQuestionTopicId', 'setQuestionConceptId', 'questionConceptOptions', 'questionSearchFilters', 'setQuestionSearchFilters', 'questionSearchCursor', 'questionSearchHasMore', 'questionSearchError', 'isSearchingQuestions', 'selectQuestionSearchResult', 'loadMoreQuestionSearchResults', 'submitQuestionSearch', 'clearQuestionSearch', 'fetchExistingQuestions', 'refreshExistingQuestionList', 'positioningContext', 'positionTopicFromTree', 'renderQuestionTopic', 'renderPersonalQuestionTopic',
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
const compiled = ts.transpileModule(source.replace('  return (\n    <>\n      <Header />', `  capture({ ${exposed} });\n  return (\n    <>\n      <Header />`), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
export function editor({ role = 'admin', editing = false, response, references = [], cards = true, placed = false, neutralFixture = false, readResponse, confirm = () => true } = {}) {
    const slots = [];
    let effects = [];
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
            if (!(index in slots))
                slots[index] = typeof initial === 'function' ? initial() : initial;
            return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
        },
        useRef(initial) {
            const index = cursor++;
            if (!(index in slots))
                slots[index] = { current: initial };
            return slots[index];
        },
        useMemo: fn => fn(),
        useCallback: fn => fn,
        useEffect: fn => { effects.push(fn); if (fn.toString().includes('warnBeforeUnload'))
            unloadEffect = fn;
        else if (fn.toString().includes('async function refresh()'))
            structureEffect = fn;
        else if (fn.toString().includes('learnerSelectionContext'))
            selectionEffect = fn; },
    };
    const database = {
        rpc(name, payload) {
            reads.push({ rpc: name, payload });
            const result = rpcResult(name, payload);
            return Object.assign(Promise.resolve(result), { single: async () => result });
        },
        from(table) {
            let mutation;
            const filters = [];
            reads.push({ table, filters });
            const query = {
                select() { return query; }, is(key, value) { filters.push([key, value]); return query; }, eq(key, value) { filters.push([key, value]); return query; },
                order(...args) { orders.push({ table, args }); return query; }, in(key, value) { filters.push([key, value]); return query; }, limit() { return query; }, ilike(key, value) { filters.push([key, value]); return query; },
                insert(values) { mutation = { table, operation: 'insert', values, filters }; calls.push(mutation); return query; },
                update(values) { mutation = { table, operation: 'update', values, filters }; calls.push(mutation); return query; },
                delete() { mutation = { table, operation: 'delete', filters }; calls.push(mutation); return query; },
                single: async () => ({ data: { id: filters.find(([key]) => key === 'id')?.[1] || 'saved-personal', ...mutation?.values }, error: null }),
                then(resolve) { return Promise.resolve(readResponse?.(table, filters) || { data: [], error: null }).then(resolve); },
            };
            return query;
        },
    };
    function rpcResult(name, payload) {
        if (name === 'get_creator_questions')
            return response?.(name, payload) || { data: [], error: null };
        calls.push({ name, payload });
        if (response) {
            const result = response(name, payload);
            if (result !== undefined)
                return result;
        }
        if (name === 'search_creator_questions')
            return { data: [], error: null };
        if (name === 'create_personal_topic')
            return { data: { id: 'new-topic', owner_id: 'owner', name: payload.p_name, parent_id: payload.p_parent_personal_topic_id }, error: null };
        if (name === 'create_library_node_in_library')
            return { data: { id: 'new-official-topic' }, error: null };
        if (name === 'save_personal_concept_with_overlay')
            return { data: { personal_concept_id: payload.p_personal_concept_id, owner_id: 'owner', topic_id: payload.p_personal_topic_id, concept_name: payload.p_name, concept_description: payload.p_description }, error: null };
        return { data: name === 'save_question_with_relationships_v2'
                ? { id: payload.p_question_id || 'saved-question' }
                : { concept_id: payload.p_concept_id || 'saved-concept', references: payload.p_references.map(r => ({
                        client_id: r.client_id, source_id: 'source', attribution_id: 'attribution',
                    })) }, error: null };
    }
    let shellGuard;
    const modules = {
        react: hooks,
        'react/jsx-runtime': { jsx: (type, props, key) => ({ type, key, props }), jsxs: (type, props, key) => ({ type, key, props }) },
        'next/navigation': { useRouter: () => ({ push: path => routes.push(path), replace: path => routes.push(path), refresh: () => routes.push('refresh') }) },
        'lucide-react': new Proxy({}, { get: (_target, key) => `icon:${String(key)}` }),
        '@/components/Header': {},
        '@/components/MarkdownContent': { cardMarkdownSummary: source => source },
        './creator/CreatorQuestionSearchPanel': { CreatorQuestionSearchPanel },
    './creator/CreatorLearnerQuestionsWorkspace': { CreatorLearnerQuestionsWorkspace() { } },
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
        '@/lib/tag-catalog-invalidation': { broadcastTagCatalogUsageInvalidation() { } },
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
        './CreatorTopicTreeInteraction': { CreatorTopicTreeInteraction() { }, TopicDropRow() { }, TopicDragHandle() { } },
        '@/lib/creator-topic-positioning': topicPositioning,
        '@/components/application-shell/SocratesShell': { useSocratesNavigationGuard(guard) { shellGuard = guard; } },
        './CreatorStudioV2Client.module.css': { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) },
    };
    const confirmations = [];
    class FocusTarget {
        count = 0;
        focus() { this.count++; }
    }
    const focusTarget = new FocusTarget();
    const context = {
        exports: {}, capture: value => { api = value; },
        require(name) { assert.ok(name in modules, `Unexpected import: ${name}`); return modules[name]; },
        document: { activeElement: focusTarget }, HTMLElement: FocusTarget,
        window: { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name), requestAnimationFrame: fn => fn(), confirm: message => { confirmations.push(message); return confirm(message); }, location: { pathname: '/creator' }, history: { replaceState: (_a, _b, path) => routes.push(path) } },
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
            overlays: [], topicPlacements: placed ? [{ id: 'placement', owner_id: 'owner', personal_topic_id: 'mine-topic', library_node_id: 'topic' }] : [],
        },
    };
    // Learner browsing now immediately sorts persisted Cards, whose timestamps are required.
    props.initialPersonalContent.cards.forEach(card => { card.created_at = '2026-01-01T00:00:00Z'; card.updated_at = card.created_at; });
    if (neutralFixture) {
        props.initialPersonalContent.topics[0].name = 'Topic';
        props.initialPersonalContent.concepts[0].name = 'Concept';
        props.initialPersonalContent.cards.forEach(card => { card.question = 'Question'; });
    }
    function render() { cursor = 0; effects = []; const tree = context.exports.CreatorStudioV2Client(props); return { ...api, tree }; }
    return { runEffect(marker) { const matches = effects.filter(fn => fn.toString().includes(marker)); assert.equal(matches.length, 1, `Expected one effect: ${marker}`); return matches[0](); }, runShellGuard: () => shellGuard(), render, calls, reads, orders, routes, confirmations, focusTarget, props, listeners, runUnloadEffect: () => unloadEffect(), runSelectionEffect: () => selectionEffect(), runStructureEffect: () => structureEffect() };
}
export function nodes(tree) {
    if (!tree || typeof tree !== 'object')
        return [];
    if (Array.isArray(tree))
        return tree.flatMap(nodes);
    if (tree.type === CreatorQuestionSearchPanel) return nodes(CreatorQuestionSearchPanel(tree.props));
  return [tree, ...nodes(tree.props?.children), ...(tree.type?.name === 'CreatorLearnerQuestionsWorkspace' ? [...nodes(tree.props.editor), ...nodes(tree.props.topicTree)] : [])];
}
const chromeSource = readFileSync(new URL('../../components/creator/CreatorStudioChrome.tsx', import.meta.url), 'utf8');
const chromeContext = { exports: {}, require(name) {
        if (name === 'react/jsx-runtime')
            return { jsx: (type, props, key) => ({ type, key, props }), jsxs: (type, props, key) => ({ type, key, props }) };
        if (name === '@/components/StudyCreatorFlaggedBrowser')
            return { StudyCreatorFlaggedBrowser() { } };
        if (name === '../CreatorStudioV2Client.module.css')
            return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
        throw new Error(`Unexpected chrome dependency: ${name}`);
    } };
vm.runInNewContext(ts.transpileModule(chromeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, chromeContext);
export const chrome = chromeContext.exports;
export function expandChrome(tree) {
    if (!tree || typeof tree !== 'object')
        return tree;
    if (Array.isArray(tree))
        return tree.map(expandChrome);
    if (tree.type === CreatorQuestionSearchPanel) return expandChrome(CreatorQuestionSearchPanel(tree.props));
  if (Object.values(chrome).includes(tree.type))
        return expandChrome(tree.type(tree.props));
    return { ...tree, props: { ...tree.props, children: expandChrome(tree.props?.children) } };
}
export function text(tree) {
    if (typeof tree === 'string' || typeof tree === 'number')
        return String(tree);
    if (!tree)
        return '';
    if (Array.isArray(tree))
        return tree.map(text).join(' ');
    return text(tree.props?.children);
}
export function button(tree, label) {
    const matches = nodes(expandChrome(tree)).filter(n => n.type === 'button' && text(n).trim() === label);
    assert.equal(matches.length, 1, `Expected one button: ${label}`);
    return matches[0];
}
export const roles = ['admin', 'editor', 'learner'];
export const currentTabLabels = ['Content', 'Questions', 'Tags', 'Flagged'];
export const emptyFilters = { text: '', difficulty: '', primaryTestingAngle: '', additionalTestingAngle: '', primaryConceptId: '', relatedConceptId: '', status: '', tagId: '' };
export const settle = () => new Promise(resolve => setImmediate(resolve));
export function question(overrides = {}) {
    return { source: 'official', kind: 'question', id: 'q1', conceptId: 'primary', primaryConceptName: 'Primary', relatedConcepts: [{ id: 'related', name: 'Related' }], relatedConceptIds: ['related'], prompt: 'Question?', answer: 'Answer', explanation: '', difficulty: 'medium', testingAngle: 'General Understanding', additionalTestingAngles: [], status: 'published', tags: [], createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', ...overrides };
}
export function row(overrides = {}) {
    return { id: 'q1', concept_id: 'primary', primary_concept_name: 'Primary', related_concepts: [{ id: 'related', name: 'Related' }], prompt: 'Question?', question_accepted_answers: [{ answer_text: 'Answer', sort_order: 0 }], difficulty: 'medium', testing_angle: 'General Understanding', additional_testing_angles: [], status: 'published', question_tags: [], created_at: '2026-01-02T00:00:00Z', updated_at: '2026-01-02T00:00:00Z', ...overrides };
}

// Exercise the real Search presentation while keeping its parent-owned callbacks observable.
const searchPanelContext = { exports: {}, require(name) {
  if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
  if (name === 'lucide-react') return { Search: 'icon:Search' };
  if (name === '@/lib/creator-entity-contracts') return { createCreatorEntityKey: (source, kind, id) => `${source}:${kind}:${id}` };
  if (name === '../CreatorStudioV2Client.module.css') return { __esModule: true, default: new Proxy({}, {get: (_, key) => String(key)}) };
  throw new Error(`Unexpected Search dependency: ${name}`);
} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../../components/creator/CreatorQuestionSearchPanel.tsx', import.meta.url), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText, searchPanelContext);
export const CreatorQuestionSearchPanel = searchPanelContext.exports.CreatorQuestionSearchPanel;
