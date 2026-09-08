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
  'setActiveCreatorTab', 'setQuestionAdditionalTestingAngles', 'questionAdditionalTestingAngles', 'saveConcept', 'saveQuestion', 'startNewConcept', 'selectExistingQuestion',
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
      return { data: name === 'save_question_with_relationships_v2'
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
    './CreatorAlgorithmDiagnostics': {},
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

test('Additional angle cluster participates in dirty state and survives rapid entry', async () => {
 const h=editor({editing:true}); let e=h.render();
 e.setQuestionAdditionalTestingAngles(['Recall','Application']); e.setQuestionTestingAngle('Mechanism');
 assert.equal(h.render().isQuestionDirty,true);
 e.setQuestionPrompt('One'); e.setQuestionAnswer('Answer'); await h.render().saveQuestion(); e=h.render();
 assert.deepEqual([...h.calls[0].payload.p_additional_testing_angles],['Recall','Application']);
 assert.equal(e.questionTestingAngle,'Mechanism'); assert.deepEqual([...e.questionAdditionalTestingAngles],['Recall','Application']);
 assert.equal(e.isQuestionDirty,false); assert.equal(e.questionPrompt,'');
 e.setQuestionAdditionalTestingAngles(['Application','Recall']); assert.equal(h.render().isQuestionDirty,false);
 e.setQuestionPrompt('Two');e.setQuestionAnswer('Answer');await h.render().saveQuestion();
 assert.equal(h.calls[1].payload.p_question_id,null);assert.equal(h.calls[1].payload.p_additional_testing_angles.length,2);
});
test('failed save preserves Additional angles and dirty form', async () => {
 const h=editor({editing:true,response:()=>({error:{message:'Rejected'}})});const e=h.render();
 e.setQuestionPrompt('Keep');e.setQuestionAnswer('Answer');e.setQuestionAdditionalTestingAngles(['Recall']);
 await h.render().saveQuestion();assert.deepEqual([...h.render().questionAdditionalTestingAngles],['Recall']);assert.equal(h.render().questionPrompt,'Keep');assert.equal(h.render().isQuestionDirty,true);
});
test('reload restores Additional and edits can clear them', async () => {
 const h=editor({editing:true,response:name=>({data:name==='get_creator_questions'?[{id:'q',concept_id:'existing-concept',prompt:'Question',testing_angle:'Mechanism',additional_testing_angles:['Recall','Application'],question_accepted_answers:[{answer_text:'Answer'}]}]:{id:'q'},error:null})});
 const [q]=await h.render().fetchExistingQuestions('existing-concept','library');
 h.render().selectExistingQuestion(q);assert.deepEqual([...h.render().questionAdditionalTestingAngles],['Recall','Application']);assert.equal(h.render().isQuestionDirty,false);
 h.render().setQuestionAdditionalTestingAngles([]);await h.render().saveQuestion();assert.equal(h.calls[0].payload.p_additional_testing_angles.length,0);assert.equal(h.render().isQuestionDirty,false);
});
function nodes(tree,predicate,result=[]) {if(!tree||typeof tree!=='object')return result;if(predicate(tree))result.push(tree);for(const child of [tree.props?.children].flat(Infinity))nodes(child,predicate,result);return result;}
test('Primary control promotion visibly removes Additional with case normalized identity',()=>{
 const h=editor({editing:true});h.render().setActiveCreatorTab('questions');h.render().setQuestionAdditionalTestingAngles(['Recall','Application']);
 let e=h.render();const controls=nodes(e.tree,n=>n.type==='select'&&n.props.value===e.questionTestingAngle);
 assert.equal(controls.length,1);controls[0].props.onChange({target:{value:'Recall'}});
 e=h.render();assert.equal(e.questionTestingAngle,'Recall');assert.deepEqual([...e.questionAdditionalTestingAngles],['Application']);
 assert.equal(nodes(e.tree,n=>n.type==='input'&&n.props.type==='search'&&n.props['aria-label']==='Search Additional Testing Angles').length,1);
});

test('Additional-only change is dirty, including clearing a retained batch cluster',async()=>{
 const h=editor({editing:true});h.render().setQuestionAdditionalTestingAngles(['Recall']);assert.equal(h.render().isQuestionDirty,true);
 h.render().setQuestionPrompt('Prompt');h.render().setQuestionAnswer('Answer');await h.render().saveQuestion();
 assert.equal(h.render().isQuestionDirty,false);h.render().setQuestionAdditionalTestingAngles([]);assert.equal(h.render().isQuestionDirty,true);
});
