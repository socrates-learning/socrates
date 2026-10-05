import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { composeHomeGroups, requireHomeSettings } from '../lib/home-deck-settings.ts';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const planner = read('components/StudyPlanner.tsx');
const initial = read('lib/study-planner-initial-data.ts');
const plain = value => JSON.parse(JSON.stringify(value));
const nodes = [
  { id: 'root', parent_id: null, name: 'Root' },
  { id: 'leaf', parent_id: 'root', name: 'Leaf' },
  { id: 'second', parent_id: 'root', name: 'Second' },
  { id: 'empty', parent_id: 'root', name: 'Empty' },
];
const topics = [
  { id: 'personal', parent_id: null, name: 'Personal', sort_order: 0 },
  { id: 'leaf', parent_id: 'personal', name: 'Personal leaf', sort_order: 0 },
  { id: 'empty', parent_id: 'personal', name: 'Empty personal', sort_order: 1 },
];
const legacy = { id: 'legacy', concept_id: 'mine', personal_topic_id: null, library_node_id: null, library_id: null };
const personal = { ...legacy, id: 'direct-personal', concept_id: null, personal_topic_id: 'leaf' };
const official = { ...legacy, id: 'direct-official', concept_id: null, library_node_id: 'leaf', library_id: 'A' };
const material = {
  personal_topics: topics,
  personal_topic_placements: [{ personal_topic_id: 'personal', library_node_id: 'leaf' }],
  personal_concepts: [{ id: 'mine', topic_id: 'leaf', name: 'Legacy' }],
  personal_cards: [legacy, personal, official],
};
const settings = {
  unified_deck_settings: { version: 109, topic_states: [], included_topic_ids: [], excluded_topic_ids: [], selected_collection_ids: [] },
  personal_topic_preferences: {}, personal_collection_preferences: {},
};
function counts(overrides = {}) {
  const a = planner.indexOf('  function descendantNodeIds(');
  const b = planner.indexOf('  async function refreshResolvedDeck(', a);
  const context = vm.createContext({
    nodes, activeLibrary: { id: 'A' }, personalTopics: topics,
    personalConcepts: material.personal_concepts, personalCards: material.personal_cards,
    placements: [{ concept_id: 'one', library_node_id: 'leaf' }, { concept_id: 'two', library_node_id: 'leaf' }, { concept_id: 'one', library_node_id: 'second' }],
    libraryAvailabilityQuestionCounts: { one: 1, two: 1 }, ...overrides,
  });
  vm.runInContext(ts.transpileModule(planner.slice(a,b), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return {
    official: id => vm.runInContext(`branchAvailabilityQuestionCount(${JSON.stringify(id)})`, context),
    personal: id => plain(vm.runInContext(`personalBranchCounts(${JSON.stringify(id)})`, context)),
  };
}

test('personal leaf and ancestors include Concept-backed and direct standalone Cards', () => {
  const c = counts();
  assert.deepEqual(c.personal('leaf'), { concepts: 1, cards: 2 });
  assert.deepEqual(c.personal('personal'), { concepts: 1, cards: 2 });
  assert.deepEqual(c.personal('empty'), { concepts: 0, cards: 0 });
});

test('official leaf/subtree include direct Cards and count multiply placed official Concepts once', () => {
  const c = counts();
  assert.equal(c.official('leaf'), 3);
  assert.equal(c.official('root'), 3);
  assert.equal(c.official('second'), 1);
  assert.equal(c.official('empty'), 0);
});

test('source-qualified attachments, duplicate rows and other-Library direct Cards do not inflate counts', () => {
  const c = counts({ personalCards: [...material.personal_cards, personal, official, { ...official, id: 'other-library', library_id: 'B' }] });
  assert.equal(c.official('root'), 3);
  assert.deepEqual(c.personal('personal'), { concepts: 1, cards: 2 });
});

test('availability stays independent of deck selections, exclusions and collection membership', () => {
  const c = counts({ selectedNodeIds: new Set(), excludedNodeIds: new Set(['root']), selectedPersonalTopicIds: new Set(), selectedPersonalCollectionIds: new Set(['collection']) });
  assert.equal(c.official('leaf'), 3);
  assert.deepEqual(c.personal('leaf'), { concepts: 1, cards: 2 });
});

async function serverLoad(libraryId, data) {
  const exports = {}, calls = [];
  vm.runInNewContext(ts.transpileModule(initial, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, require(name) {
      if (name === 'server-only') return {};
      if (name === '@/lib/supabase-server') return { createSupabaseServerClient: async () => ({
        rpc: async (name, args) => {
          calls.push([name,args]); assert.equal(name, 'get_existing_home_study_bootstrap');
          return { data: { deck: { id: `deck-${libraryId}`, user_id: 'owner', library_id: libraryId }, bootstrap: data }, error: null };
        },
        from: name => { throw new Error(`Unexpected unscoped read: ${name}`); },
      }) };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return { loaded: plain(await exports.loadStudyPlannerInitialData({ activeLibrary: { id: libraryId }, role: 'learner' })), calls };
}

test('fresh Library A → B → A loads use the scoped snapshot, preserve A and never fetch all owner Topics', async () => {
  const a = { ...settings, ...material, nodes, personal_collections: [{ id: 'collection', name: 'Owner-global collection', card_count: 3 }] };
  const b = { ...settings, personal_topics: [], personal_topic_placements: [], personal_concepts: [], personal_cards: [], nodes: [{ id: 'B-root', parent_id: null, name: 'B' }] };
  for (const [library, bootstrap] of [['A',a],['B',b],['A',a]]) {
    const { loaded, calls } = await serverLoad(library, bootstrap);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][1].p_library_id, library);
    assert.equal(loaded.settingsLoadError, '');
    const tree = composeHomeGroups(loaded.nodes, loaded.personalTopics, loaded.homeTopicPlacements, loaded.personalCollections);
    assert.equal(tree[0].id, library === 'A' ? 'root' : 'B-root');
    assert.deepEqual(loaded.personalCards, bootstrap.personal_cards);
    if (library === 'B') assert.equal(JSON.stringify(tree).includes('Personal'), false);
    else assert.equal(loaded.personalCollections[0].cardCount, 3);
  }
});

test('missing projection fails visibly; canonical missing-parent/unplaced/cycle checks remain enforced', async () => {
  const { loaded } = await serverLoad('A', { ...settings, personal_topics: topics });
  assert.match(loaded.settingsLoadError, /placements were not returned/);
  assert.equal(loaded.homeSettings, undefined);
  assert.throws(() => composeHomeGroups(nodes, topics, [], []), /no canonical placement/);
  assert.throws(() => composeHomeGroups(nodes, topics, [{ personal_topic_id: 'personal', library_node_id: 'foreign' }], []), /outside the loaded Library/);
  assert.throws(() => composeHomeGroups(nodes, [{ id: 'cycle', name: 'Cycle', parent_id: 'cycle', sort_order: 0 }], [], []), /unreachable/);
});

async function clientLoad(data, cancelled = false) {
  const a = planner.indexOf('    async function loadSettings()');
  const b = planner.indexOf('    void loadSettings();', a);
  const writes = [], calls = [], exports = {};
  const setters = Object.fromEntries(['HomeTopicPlacements','PersonalTopics','PersonalConcepts','PersonalCards','ExpandedPersonalTopicIds','HomeSettings','SettingsError'].map(key => [`set${key}`, value => writes.push([key,value instanceof Set ? [...value] : plain(value)])]));
  vm.runInNewContext(ts.transpileModule(planner.slice(a,b).replace('async function loadSettings()', 'export async function loadSettings()'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, ...setters, cancelled, settingsLibraryId: 'A', settingsDeckId: 'deck', requireHomeSettings,
    supabase: { rpc: async (name,args) => { calls.push([name,args]); return { data, error: null }; } },
  });
  await exports.loadSettings(); return { writes, calls };
}

test('client fallback uses one existing bootstrap for placements and all personal material; cancelled loads cannot overwrite', async () => {
  const { writes, calls } = await clientLoad({ ...settings, ...material });
  assert.equal(calls.length, 1); assert.equal(calls[0][0], 'get_home_study_bootstrap');
  assert.deepEqual(writes.find(([key]) => key === 'PersonalCards')[1], material.personal_cards);
  assert.deepEqual(writes.find(([key]) => key === 'HomeTopicPlacements')[1], material.personal_topic_placements);
  assert.equal(writes.at(-1)[0], 'HomeSettings');
  assert.deepEqual((await clientLoad({ ...settings, ...material }, true)).writes, []);
  assert.doesNotMatch(planner, /\.from\('personal_(topics|concepts|cards|topic_official_placements)'\)/);
});

test('Migration 118 is a guarded replacement of only the Home read model', () => {
  const sql = read('supabase/118_home_personal_material_projection.sql');
  assert.equal((sql.match(/CREATE OR REPLACE FUNCTION/g) || []).length, 1);
  assert.match(sql, /md5\(pg_get_functiondef\(oid\)\) = 'a1466f5a75f9c3249222f3335eb14e4e'/);
  assert.match(sql, /other_library_topics/);
  assert.match(sql, /'personal_topic_placements'/);
  assert.match(sql, /'library_node_id', card.library_node_id/);
  assert.doesNotMatch(sql, /\b(?:alter table|create table|create policy|grant |revoke |insert into|delete from|update public\.)/i);
});
