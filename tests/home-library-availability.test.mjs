import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const initialSource = readFileSync(new URL('../lib/study-planner-initial-data.ts', import.meta.url), 'utf8');
const planner = readFileSync(new URL('../components/StudyPlanner.tsx', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
async function load(selectedCounts) {
  const calls = [];
  const library = { id: 'nursing', name: 'Nursing', slug: 'nursing', status: 'active' };
  const exports = {};
  const bootstrap = {
    available_libraries: [library], nodes: [], placements: [],
    library_availability_question_counts: { first: 19, second: 25 },
    official_question_counts: selectedCounts,
  };
  vm.runInNewContext(ts.transpileModule(initialSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports,
    require(name) {
      if (name === 'server-only') return {};
      if (name === '@/lib/supabase-server') return {
        createSupabaseServerClient: async () => ({ rpc: async name => {
          calls.push(name);
          assert.equal(name, 'get_existing_home_study_bootstrap');
          return { data: { deck: { id: 'deck', library_id: 'nursing', is_active: true }, bootstrap }, error: null };
        } }),
      };
      throw new Error(name);
    },
  });
  return { data: await exports.loadStudyPlannerInitialData({ activeLibrary: library, role: 'learner' }), calls };
}

test('unselected deck bootstrap retains Library 19/25 availability and zero selected candidates', async () => {
  const { data, calls } = await load({});
  assert.deepEqual(plain(data.libraryAvailabilityQuestionCounts), { first: 19, second: 25 });
  assert.deepEqual(plain(data.selectedDeckQuestionCounts), {});
  assert.deepEqual(calls, ['get_existing_home_study_bootstrap']);
});

test('selected candidate counts remain independent when one Concept is excluded', async () => {
  const { data } = await load({ second: 25 });
  assert.deepEqual(plain(data.libraryAvailabilityQuestionCounts), { first: 19, second: 25 });
  assert.deepEqual(plain(data.selectedDeckQuestionCounts), { second: 25 });
});

test('Topic labels use availability while selected summaries use deck candidates', () => {
  const tree = planner.slice(planner.indexOf('function renderNode('), planner.indexOf('const rootNodes = nodes'));
  assert.match(tree, /libraryAvailabilityQuestionCounts\[conceptId\]/);
  assert.doesNotMatch(tree, /selectedDeckQuestionCounts\[conceptId\]/);
  const selectedSummary = planner.slice(planner.indexOf('const selectedNodeSummaries ='), planner.indexOf('const homeBootstrapView ='));
  assert.match(selectedSummary, /selectedDeckQuestionCounts\[conceptId\]/);
  assert.doesNotMatch(selectedSummary, /libraryAvailabilityQuestionCounts/);
});

test('deck refresh cannot overwrite Library availability with selected candidates', () => {
  const refresh = planner.slice(planner.indexOf('async function refreshResolvedDeck('), planner.indexOf('async function refreshLearnerProgress('));
  assert.match(refresh, /setSelectedDeckQuestionCounts/);
  assert.doesNotMatch(refresh, /setLibraryAvailabilityQuestionCounts/);
  assert.match(planner, /rpc\('get_library_official_availability_counts'/);
  assert.match(planner, /setLibraryAvailabilityQuestionCounts\(libraryAvailabilityResult\.data \|\| \{\}\)/);
});

test('browsing sums each Concept once even with multiple placements', () => {
  const start = planner.indexOf('  function descendantNodeIds(');
  const end = planner.indexOf('  function directConceptsForNode(', start);
  const functions = planner.slice(start, end);
  const compiled = ts.transpileModule(functions + '\nconst outcome = { ids: branchConceptIds("root"), count: branchAvailabilityQuestionCount("root") };', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = vm.createContext({
    nodes: [{ id: 'root', parent_id: null }, { id: 'a', parent_id: 'root' }, { id: 'b', parent_id: 'root' }],
    placements: [{ concept_id: 'first', library_node_id: 'a' }, { concept_id: 'first', library_node_id: 'b' }, { concept_id: 'second', library_node_id: 'b' }],
    libraryAvailabilityQuestionCounts: { first: 19, second: 25 },
    personalCards: [], activeLibrary: { id: 'nursing' },
  });
  vm.runInContext(compiled, context);
  assert.deepEqual(plain(vm.runInContext('outcome', context)), { ids: ['first', 'second'], count: 44 });
});
