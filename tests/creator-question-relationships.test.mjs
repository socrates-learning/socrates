import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { buildConceptTopicTree } from '../lib/concept-topic-tree.ts';

// Execute the actual component's save handlers with in-memory hooks and database
// responses. Effects are intentionally excluded: these are transaction/state
// regression tests, not browser or database integration tests.
const source = readFileSync(new URL('../components/CreatorStudioV2Client.tsx', import.meta.url), 'utf8');
const exposed = [
  'saveConcept', 'saveQuestion', 'startNewConcept', 'selectExistingQuestion',
  'setConcept', 'setConceptRecordStatus', 'setQuestionPrompt', 'setQuestionAnswer',
  'setQuestionDifficulty', 'setQuestionTestingAngle', 'setQuestionRecordStatus',
  'conceptId', 'concept', 'conceptRecordStatus', 'selectedTopicIds', 'references',
  'questionId', 'questionPrompt', 'questionAnswer', 'questionConceptId',
  'questionDifficulty', 'questionTestingAngle', 'questionRecordStatus',
  'isContentDirty', 'isQuestionDirty', 'isSaving', 'isSavingQuestion',
  'questionConceptsByTopicId', 'status', 'setQuestionRelatedConceptIds', 'questionRelatedConceptIds',
  'primaryQuestionConceptId', 'startNewQuestion', 'selectQuestionConcept', 'fetchExistingQuestions', 'refreshExistingQuestionList', 'questionCountsByConceptId',
].join(', ');
const compiled = ts.transpileModule(source.replace(
  '  return (\n    <>\n      <Header />',
  `  capture({ ${exposed} });\n  return (\n    <>\n      <Header />`,
), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;

function editor({ editing = false, response, references = [] } = {}) {
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
    useEffect: () => {},
  };
  const database = {
    async rpc(name, payload) {
      if (name === 'get_creator_questions') return response ? response(name, payload) : { data: [], error: null };
      calls.push({ name, payload });
      if (response) return response(name, payload);
      return { data: name === 'save_question_with_relationships'
        ? { id: payload.p_question_id || 'saved-question' }
        : { concept_id: payload.p_concept_id || 'saved-concept', references: payload.p_references.map(r => ({
          client_id: r.client_id, source_id: 'source', attribution_id: 'attribution',
        })) }, error: null };
    },
    from(table) {
      const query = {
        select() { return query; }, eq() { return query; },
        order(column, options) { orders.push({ table, column, ...options }); return query; },
        then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); },
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
    '@/components/MarkdownContent': {},
    '@/lib/concept-topic-tree': { buildConceptTopicTree },
    '@/lib/supabase': { supabase: database },
    '@/lib/safe-navigation': {},
    '@/lib/tag-catalog-invalidation': { broadcastTagCatalogUsageInvalidation() {} },
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
    initialTopics: [{ id: 'topic', name: 'Topic', children: [] }],
    initialConcept: { id: editing ? 'existing-concept' : null, name: '', bodyMarkdown: '', placementIds: ['topic'] },
    initialReferences: references,
  };
  function render() { cursor = 0; const tree = context.exports.CreatorStudioV2Client(props); return { ...api, tree }; }
  return { render, calls, orders, routes };
}

test('related selections participate in dirty state and persist across rapid saves', async () => {
  const h = editor({ editing: true });
  let e = h.render(); e.setQuestionRelatedConceptIds(['related-b', 'related-a']);
  assert.equal(h.render().isQuestionDirty, true);
  e.setQuestionPrompt('Batch 1'); e.setQuestionAnswer('Answer');
  await h.render().saveQuestion(); e = h.render();
  assert.deepEqual([...h.calls[0].payload.p_related_concept_ids], ['related-b', 'related-a']);
  assert.equal(h.calls[0].payload.p_active_library_id, 'library');
  assert.deepEqual([...e.questionRelatedConceptIds], ['related-b', 'related-a']);
  assert.equal(e.questionPrompt, ''); assert.equal(e.questionAnswer, '');
  assert.equal(e.isQuestionDirty, false);
  e.setQuestionRelatedConceptIds(['related-a', 'related-b']);
  assert.equal(h.render().isQuestionDirty, false, 'selection order is not a change');
  e.setQuestionPrompt('Batch 2'); e.setQuestionAnswer('Answer 2');
  await h.render().saveQuestion();
  assert.equal(h.calls[1].payload.p_question_id, null);
  assert.equal(h.calls[1].payload.p_related_concept_ids.length, 2);
});

test('related browse edits retain true Primary; empty selection clears explicitly', async () => {
  const h = editor({ editing: true });
  h.render().selectExistingQuestion({ id: 'question', conceptId: 'true-primary', primaryConceptName: 'Primary', relatedConceptIds: ['existing-concept', 'another'], prompt: 'Prompt', answer: 'Answer', difficulty: 'hard', testingAngle: 'Recall', status: 'published', tags: [] });
  let e = h.render();
  assert.equal(e.questionConceptId, 'existing-concept');
  assert.equal(e.primaryQuestionConceptId, 'true-primary');
  assert.equal(e.isQuestionDirty, false);
  e.setQuestionRelatedConceptIds([]); await h.render().saveQuestion();
  assert.equal(h.calls[0].payload.p_concept_id, 'true-primary');
  assert.equal(h.calls[0].payload.p_related_concept_ids.length, 0);
  assert.equal(h.render().isQuestionDirty, false);
  h.render().startNewQuestion();
  assert.equal(h.render().primaryQuestionConceptId, 'existing-concept');
  assert.equal(h.render().questionRelatedConceptIds.length, 0);
});

test('failed relationship save retains draft, true primary, and secondary choices', async () => {
  const h = editor({ editing: true, response: () => ({ error: { message: 'Rejected association' } }) });
  let e = h.render(); e.setQuestionPrompt('Keep'); e.setQuestionAnswer('Keep answer'); e.setQuestionRelatedConceptIds(['related']);
  await h.render().saveQuestion(); e = h.render();
  assert.equal(e.questionPrompt, 'Keep'); assert.equal(e.questionAnswer, 'Keep answer');
  assert.deepEqual([...e.questionRelatedConceptIds], ['related']);
  assert.equal(e.isQuestionDirty, true); assert.equal(e.isSavingQuestion, false);
});

test('coherent loader restores associations without inflating Primary counts', async () => {
  const h = editor({ editing: true, response: (name) => ({ data: name === 'get_creator_questions' ? [
    { id: 'one', concept_id: 'existing-concept', primary_concept_name: 'One', related_concepts: [{id:'related'}], prompt: 'Newest', status:'published' },
    { id: 'two', concept_id: 'other', primary_concept_name: 'Other', related_concepts: [{id:'existing-concept'}], prompt: 'Older', status:'published' },
  ] : [], error: null }) });
  const questions = await h.render().fetchExistingQuestions('existing-concept', 'library');
  assert.deepEqual(questions.map(q => q.id), ['one','two']);
  assert.equal(questions[1].conceptId, 'other');
  assert.deepEqual([...questions[1].relatedConceptIds], ['existing-concept']);
  await h.render().refreshExistingQuestionList('existing-concept');
  assert.equal(h.render().questionCountsByConceptId['existing-concept'], 1);
});

test('new browse context clears relationship context; list remains bounded', () => {
  const h = editor({ editing: true }); h.render().setQuestionRelatedConceptIds(['related']);
  h.render().selectQuestionConcept('new-primary');
  assert.equal(h.render().questionRelatedConceptIds.length, 0);
  assert.equal(h.render().primaryQuestionConceptId, 'new-primary');
  const css = readFileSync(new URL('../components/CreatorStudioV2Client.module.css', import.meta.url), 'utf8');
  assert.match(css, /\.existingQuestionList[\s\S]*?overflow(?:-y)?:\s*auto/);
  assert.match(source, /Related Question/);
});
