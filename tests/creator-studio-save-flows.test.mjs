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
  'questionConceptsByTopicId', 'status',
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
      calls.push({ name, payload });
      if (response) return response(name, payload);
      return { data: name === 'save_question_with_version'
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

for (const lifecycle of ['published', 'draft']) {
  test(`new Concept saves ${lifecycle} on first save, clears fields, and retains placement`, async () => {
    const h = editor({ references: [{ id: 'ref', sourceId: null, attributionId: null, title: 'Reference', author: '', url: '', notes: '' }] });
    let e = h.render();
    assert.equal(e.conceptRecordStatus, 'published');
    e.setConcept('# First concept');
    e.setConceptRecordStatus(lifecycle);
    await h.render().saveConcept();
    e = h.render();
    assert.equal(h.calls[0].payload.p_status, lifecycle);
    assert.equal(h.calls[0].payload.p_concept_id, null);
    assert.equal(e.conceptId, null);
    assert.equal(e.concept, '');
    assert.equal(e.references.length, 0);
    assert.deepEqual([...e.selectedTopicIds], ['topic']);
    assert.equal(e.isContentDirty, false);
    assert.equal(e.questionConceptsByTopicId.topic[0].id, 'saved-concept');
    assert.equal(h.routes.at(-1), '/creator/concepts/new');
    e.setConcept('# Second concept');
    await h.render().saveConcept();
    assert.equal(h.calls[1].payload.p_concept_id, null);
    assert.equal(h.calls[1].payload.p_status, 'published');
  });

  test(`new Question saves ${lifecycle}, clears only content, and retains authoring context`, async () => {
    const h = editor({ editing: true });
    let e = h.render();
    assert.equal(e.questionRecordStatus, 'published');
    e.setQuestionPrompt('First prompt'); e.setQuestionAnswer('First answer');
    e.setQuestionDifficulty('hard'); e.setQuestionTestingAngle('Clinical Application');
    e.setQuestionRecordStatus(lifecycle);
    await h.render().saveQuestion();
    e = h.render();
    assert.equal(h.calls[0].payload.p_status, lifecycle);
    assert.equal(h.calls[0].payload.p_accepted_answers[0].answer_text, 'First answer');
    assert.equal(e.questionId, null);
    assert.equal(e.questionPrompt, ''); assert.equal(e.questionAnswer, '');
    assert.equal(e.questionConceptId, 'existing-concept');
    assert.equal(e.questionDifficulty, 'hard');
    assert.equal(e.questionTestingAngle, 'Clinical Application');
    assert.equal(e.questionRecordStatus, lifecycle);
    assert.equal(e.isQuestionDirty, false);
    e.setQuestionPrompt('Second prompt'); e.setQuestionAnswer('Second answer');
    await h.render().saveQuestion();
    assert.equal(h.calls[1].payload.p_question_id, null);
    assert.equal(h.calls[1].payload.p_concept_id, 'existing-concept');
    assert.deepEqual(h.orders.filter(o => o.table === 'questions').slice(0, 2), [
      { table: 'questions', column: 'created_at', ascending: false },
      { table: 'questions', column: 'id', ascending: false },
    ]);
  });
}

test('edit-mode Concept and Question saves retain identity and content', async () => {
  const h = editor({ editing: true });
  let e = h.render(); e.setConcept('Edited Concept');
  await h.render().saveConcept();
  e = h.render(); assert.equal(e.concept, 'Edited Concept'); assert.notEqual(e.conceptId, null);
  e.selectExistingQuestion({ id: 'existing-question', prompt: 'Old', answer: 'Answer', difficulty: 'easy', testingAngle: 'Recall', status: 'draft', tags: [] });
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
  const h = editor({ response: () => ({ data: { concept_id: 'saved-concept' }, error: null }) });
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
  finish({ data: { concept_id: 'saved-concept', references: [] }, error: null });
  await saving; e = h.render(); assert.equal(e.isSaving, false); assert.equal(e.concept, '');
});
