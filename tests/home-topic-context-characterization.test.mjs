import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { locationSelection, mutateTopicSubtreePreference, requireHomeSettings } from '../lib/home-deck-settings.ts';
import { graphFromNodes } from './fixtures/shared-topic-branches.mjs';

// Preserve released row interactions; characterize the approved atomic preference boundary.
const require = createRequire(import.meta.url);
const planner = readFileSync(new URL('../components/StudyPlanner.tsx', import.meta.url), 'utf8');
function block(startMarker, endMarker) {
  const start = planner.indexOf(startMarker);
  const end = planner.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Missing boundary: ${startMarker}`);
  return planner.slice(start, end).trim();
}
function load(source, bindings) {
  const context = { exports: {}, require, Error, ...bindings };
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(`export ${source}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, context);
  return context;
}
const rowSource = block('  function renderNode(', '  let homeGroups:');
function elements(tree) {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  return tree?.props ? [tree, ...elements(tree.props.children)] : [];
}
function fixture(source = 'official') {
  const events = [];
  const node = { id: 'same', key: `${source === 'official' ? 'official' : 'personal'}:${source === 'collection' ? 'collection' : 'topic'}:same`, name: 'Topic', source, children: [] };
  const state = { checked: true, explicit: true, partial: false };
  const c = load(rowSource + '\n' + block('  function beginPreferenceGesture(', '  async function toggleSetupCramMode('), {
    configuredGroupKey: node.key, expandedNodeIds: new Set(), expandedPersonalTopicIds: new Set(),
    branchConceptIds: () => [], libraryAvailabilityQuestionCounts: {}, branchAvailabilityQuestionCount: () => 142,
    personalBranchCounts: () => ({ concepts: 2, cards: 8 }), personalCollections: [{ id: 'same', cardCount: 3 }],
    getTopicSelectionPresentation: () => state, groupSelection: () => state, locationSelection,
    nodes: [], placements: [], selectedNodeIds: new Set(), excludedNodeIds: new Set(), conceptOverrides: {},
    nodePreferences: {}, groupDrafts: {}, homeSettings: { unified_deck_settings: { topic_preference_state: { values: {} } }, personal_topic_preferences: {}, personal_collection_preferences: {} },
    isSaving: false, settingsError: '', isSetupCramMode: false,
    setConfiguredGroupKey: key => { c.configuredGroupKey = key; },
    toggleNodeSelection: (...args) => events.push(['official-selection', ...args]),
    saveGroupSetting: (...args) => events.push(['group-setting', ...args]),
    persistNodePreference: (group, value) => events.push(['official-preference', group.id, value]),
    preferenceGesture: { current: null },
    setNodePreferences: fn => { c.nodePreferences = fn(c.nodePreferences); },
    setGroupDrafts: fn => { c.groupDrafts = fn(c.groupDrafts); },
  });
  const render = () => c.exports.renderNode(node);
  const control = label => elements(render()).find(el => el.props['aria-label'] === label);
  return { c, node, events, state, render, control };
}

function settingsFixture(located = false) {
  const graph = graphFromNodes('library', ['root', 'requested', 'returned', 'excluded', 'old'].map(id => ({ id, name: id, parent_id: id === 'root' ? null : 'root' })));
  if (located) {
    graph.version = 132;
    graph.locations = [
      ...graph.nodes.map(n => ({ id: n.id, topic_id: n.id, library_id: graph.library_id, parent_location_id: n.parent_id, sort_order: n.sort_order, is_original: true })),
      { id: 'alias', topic_id: 'requested', library_id: graph.library_id, parent_location_id: 'returned', sort_order: 0, is_original: false },
    ];
  }
  return requireHomeSettings({
    official_topic_graph: graph,
    ...(located ? { location_selection: { version: 132, graph_revision: graph.revision, states: graph.locations.map(l => ({ location_id: l.id, topic_id: l.topic_id, included: true, direct: l.id === 'root', source_location_id: 'root', distance: l.id === 'root' ? 0 : 1 })) } } : {}),
    unified_deck_settings: { version: 109, topic_states: [], included_topic_ids: [], excluded_topic_ids: [], selected_collection_ids: [],
      topic_preference_state: { version: 122, deck_id: 'deck', library_id: 'library', revision: 'a'.repeat(32),
        values: { 'official:topic:root': 50, 'official:topic:requested': 73, 'official:topic:returned': 41, 'official:topic:excluded': 50, 'official:topic:old': 22 } } },
    personal_topic_preferences: {}, personal_collection_preferences: {},
  });
}

test('Home row keeps separate native controls without a count badge or row-wide action', () => {
  const f = fixture();
  for (const el of elements(f.render())) {
    if (el.type === 'div' || el.type === 'span') assert.equal(el.props.onClick, undefined);
  }
  const name = f.control('Configure Topic New to Mastery balance');
  assert.equal(name.type, 'button'); assert.equal(name.props.type, 'button');
  assert.equal(name.props['aria-pressed'], true);
  assert.equal(name.props.onKeyDown, undefined); // Native Enter/Space, not tree-arrow navigation.
  assert.equal(f.control('Expand Topic').props.disabled, true);
  assert.equal(f.control('Include Topic in Study').props.type, 'checkbox');
  const badge = elements(f.render()).find(el => el.props.title === 'Study-ready questions in this branch');
  assert.equal(badge, undefined); assert.deepEqual(f.events, []);
});

test('personal Topic badges are absent while labeled legacy collection counts remain', () => {
  const topic = fixture('personal');
  const collection = fixture('collection');
  for (const f of [topic, collection]) {
    assert.equal(elements(f.render()).some(el => el.props.title === 'Study-ready questions in this branch'), false);
    assert.equal(f.control('Include Topic in Study').props.type, 'checkbox');
    assert.equal(f.control('Configure Topic New to Mastery balance').type, 'button');
    assert.deepEqual(f.events, []);
  }
  const text = elements(collection.render()).find(el => el.type === 'span' && el.props.className === 'muted');
  assert.deepEqual(Array.from(text.props.children), [3, ' ', 'Cards']);
  assert.equal(collection.control('Include Topic in Study').props['aria-describedby'], 'topic-selection-personal:collection:same');
});

test('configuration remains local even during saving; writes and slider are disabled by released state', () => {
  const f = fixture(); f.c.isSaving = true;
  const name = f.control('Configure Topic New to Mastery balance');
  assert.notEqual(name.props.disabled, true); name.props.onClick();
  assert.equal(f.c.configuredGroupKey, f.node.key); assert.deepEqual(f.events, []);
  assert.equal(f.control('Include Topic in Study').props.disabled, true);
  assert.equal(f.control('Topic New to Mastery balance').props.disabled, true);
  f.c.isSaving = false; f.c.settingsError = 'Readback uncertain';
  assert.equal(f.control('Include Topic in Study').props.disabled, true);
  assert.equal(f.control('Topic New to Mastery balance').props.disabled, true);
});

test('source-qualified personal and collection controls dispatch their existing group path only', () => {
  for (const source of ['personal', 'collection']) {
    const f = fixture(source);
    f.control('Configure Topic New to Mastery balance').props.onClick();
    assert.deepEqual(f.events, []);
    f.control('Include Topic in Study').props.onChange({ currentTarget: { checked: false } });
    assert.deepEqual(f.events, [['group-setting', f.node, false]]);
    f.control('Topic New to Mastery balance').props.onChange({ target: { value: '64' } });
    assert.equal(f.c.groupDrafts[f.node.key], 64);
    assert.equal(f.events.length, 1);
  }
});

test('one gesture commits once across pointer-up, key-up and blur; activation is not a commit', () => {
  const f = fixture(); const range = f.control('Topic New to Mastery balance');
  range.props.onPointerDown();
  for (const event of ['onPointerUp', 'onKeyUp', 'onBlur']) range.props[event]({ currentTarget: { value: '50' } });
  assert.deepEqual(f.events, [['official-preference', 'same', 50]]);
  range.props.onPointerDown(); range.props.onPointerUp({ currentTarget: { value: '50' } });
  assert.equal(f.events.length, 2); // An intentional same-value recommit resets descendants again.
  f.c.isSetupCramMode = true;
  assert.equal(f.control('Topic New to Mastery balance').props.disabled, true);
  assert.equal(f.control('Include Topic in Study').props.disabled, false);
});

test('official selection uses returned directives before resolver refresh, never guessed optimistic selection', async () => {
  const events = []; let selected; let excluded; let preferences = { old: 22 };
  const homeSettings = settingsFixture(); let confirmed;
  const c = load(block('  async function toggleNodeSelection(', '  async function saveGroupSetting('), {
    activeLibrary: { id: 'library' }, deck: { id: 'deck' }, userId: 'owner', homeSettings,
    settingsRequest: { current: false }, settingsContext: { current: 'deck:library:owner' }, isSaving: false, settingsError: '',
    setHomeSettings: value => { confirmed = value; }, setGroupDrafts: () => {}, setSettingsError: () => {}, requireHomeSettings,
    setIsSaving: value => events.push(['busy', value]), setMessage: () => {},
    supabase: { rpc: async (name, args) => { events.push([name, args]); assert.ok(['set_study_deck_node_selection', 'get_home_study_bootstrap'].includes(name)); return { data: name === 'get_home_study_bootstrap' ? homeSettings : { selected_node_ids: ['returned'], excluded_node_ids: ['excluded'] }, error: null }; } },
    setSelectedNodeIds: value => { selected = [...value]; events.push(['selected']); },
    setExcludedNodeIds: value => { excluded = [...value]; },
    setNodePreferences: fn => { preferences = fn(preferences); },
    refreshResolvedDeck: async () => events.push(['resolve']), router: { refresh: () => events.push(['refresh']) },
  });
  await c.exports.toggleNodeSelection('requested', true);
  assert.deepEqual(selected, ['returned']); assert.deepEqual(excluded, ['excluded']);
  assert.equal(preferences.returned, 50); assert.equal(preferences.old, 22);
  assert.equal(confirmed, homeSettings);
  assert.deepEqual(JSON.parse(JSON.stringify(events[1][1])), { p_deck_id: 'deck', p_node_id: 'requested', p_should_include: true });
  assert.deepEqual(events.map(e => e[0]), ['busy', 'set_study_deck_node_selection', 'selected', 'get_home_study_bootstrap', 'resolve', 'refresh', 'busy']);
});

test('location selection targets one occurrence and preserves existing canonical preferences through readback', async () => {
  const before = settingsFixture(true), readback = structuredClone(before), calls = [];
  Object.assign(readback.location_selection.states.find(s => s.location_id === 'alias'), { included: false, direct: true, source_location_id: 'alias' });
  let preferences = { requested: 73, returned: 41, old: 22 }, selected, confirmed;
  const c = load(block('  async function toggleNodeSelection(', '  async function saveGroupSetting('), {
    activeLibrary: { id: 'library' }, deck: { id: 'deck' }, userId: 'owner', homeSettings: before,
    settingsRequest: { current: false }, settingsContext: { current: 'deck:library:owner' }, isSaving: false, settingsError: '',
    setHomeSettings: value => { confirmed = value; }, setGroupDrafts: () => {}, setSettingsError: assert.fail, requireHomeSettings,
    setIsSaving: () => {}, setMessage: () => {},
    supabase: { rpc: async (name, args) => {
      calls.push([name, JSON.parse(JSON.stringify(args))]);
      if (name === 'set_study_deck_location_selection') return { data: { selected_node_ids: ['requested', 'returned'], excluded_node_ids: [] }, error: null };
      assert.equal(name, 'get_home_study_bootstrap'); return { data: structuredClone(readback), error: null };
    } },
    setSelectedNodeIds: value => { selected = [...value]; }, setExcludedNodeIds: value => assert.equal(value.size, 0),
    setNodePreferences: fn => { preferences = fn(preferences); }, refreshResolvedDeck: async () => {}, router: { refresh: () => {} },
  });
  await c.exports.toggleNodeSelection('requested', false, 'location:alias');
  assert.deepEqual(calls, [
    ['set_study_deck_location_selection', { p_deck_id: 'deck', p_location_id: 'alias', p_expected_revision: before.official_topic_graph.revision, p_should_include: false }],
    ['get_home_study_bootstrap', { p_library_id: 'library', p_deck_id: 'deck' }],
  ]);
  assert.deepEqual(selected, ['requested', 'returned']);
  assert.deepEqual(JSON.parse(JSON.stringify(preferences)), { requested: 73, returned: 41, old: 22 });
  assert.deepEqual(confirmed.unified_deck_settings.topic_preference_state.values, before.unified_deck_settings.topic_preference_state.values);
  assert.equal(locationSelection({ occurrenceKey: 'location:alias' }, confirmed).checked, false);
  assert.equal(locationSelection({ occurrenceKey: 'location:requested' }, confirmed).checked, true);
  assert.equal(c.settingsRequest.current, false);
});

test('saved location preference survives authoritative readback and a fresh component without duplicating canonical keys', async () => {
  const before = settingsFixture(true), saved = structuredClone(before), calls = [];
  saved.unified_deck_settings.topic_preference_state.revision = 'b'.repeat(32);
  saved.unified_deck_settings.topic_preference_state.values['official:topic:requested'] = 64;
  let confirmed, drafts = { 'official:topic:requested': 64 }, refreshes = 0;
  const c = load(block('  async function persistNodePreference(', '  function beginPreferenceGesture('), {
    activeLibrary: { id: 'library' }, deck: { id: 'deck' }, userId: 'owner', homeSettings: before,
    settingsRequest: { current: false }, settingsContext: { current: 'deck:library:owner' }, isSaving: false, isSetupCramMode: false, settingsError: '',
    setIsSaving: () => {}, setMessage: () => {}, setSettingsError: assert.fail,
    setGroupDrafts: value => { drafts = value; }, setHomeSettings: value => { confirmed = value; }, mutateTopicSubtreePreference,
    supabase: { rpc: async (name, args) => {
      calls.push([name, JSON.parse(JSON.stringify(args))]);
      if (name === 'set_study_deck_location_preference') return { data: structuredClone(saved.unified_deck_settings.topic_preference_state), error: null };
      assert.equal(name, 'get_home_study_bootstrap'); return { data: structuredClone(saved), error: null };
    } }, router: { refresh: () => { refreshes++; } },
  });
  await c.exports.persistNodePreference({ key: 'official:topic:requested', occurrenceKey: 'location:alias' }, 64);
  assert.deepEqual(calls, [
    ['set_study_deck_location_preference', { p_deck_id: 'deck', p_library_id: 'library', p_location_id: 'alias', p_balance: 64, p_expected_revision: 'a'.repeat(32) }],
    ['get_home_study_bootstrap', { p_library_id: 'library', p_deck_id: 'deck' }],
  ]);
  assert.equal(Object.keys(drafts).length, 0); assert.equal(refreshes, 1); assert.equal(c.settingsRequest.current, false);
  assert.deepEqual(confirmed.unified_deck_settings.topic_preference_state.values, { ...before.unified_deck_settings.topic_preference_state.values, 'official:topic:requested': 64 });
  const fresh = fixture();
  Object.assign(fresh.node, { id: 'requested', key: 'official:topic:requested', occurrenceKey: 'location:alias' });
  fresh.c.homeSettings = requireHomeSettings(JSON.parse(JSON.stringify(confirmed)));
  fresh.c.configuredGroupKey = 'location:alias';
  assert.equal(fresh.control('Topic New to Mastery balance').props.value, 64);
  assert.equal(Object.keys(fresh.c.groupDrafts).length, 0); assert.deepEqual(fresh.events, []);
  fresh.node.occurrenceKey = 'location:requested'; fresh.c.configuredGroupKey = 'location:requested';
  assert.equal(fresh.control('Topic New to Mastery balance').props.value, 64);
});

test('failed subtree preference preserves confirmed values, clears its tentative draft and fails visibly', async () => {
  const writes = []; const errors = []; const preferences = { same: 73 }; let drafts = { 'official:topic:same': 20 };
  const c = load(block('  async function persistNodePreference(', '  function beginPreferenceGesture('), {
    activeLibrary: { id: 'library' }, deck: { id: 'deck' }, userId: 'owner', homeSettings: {},
    settingsRequest: { current: false }, settingsContext: { current: 'deck:library:owner' },
    isSaving: false, isSetupCramMode: false, settingsError: '',
    setIsSaving: () => {}, setMessage: () => {}, nodePreferences: preferences,
    setGroupDrafts: value => { drafts = value; }, setSettingsError: value => errors.push(value),
    setHomeSettings: () => assert.fail('failed write cannot replace confirmed state'),
    supabase: { rpc: () => assert.fail('helper owns requests') },
    mutateTopicSubtreePreference: async (...args) => { writes.push(args.slice(1)); throw new Error('offline'); },
  });
  await c.exports.persistNodePreference({ key: 'official:topic:same' }, 20);
  assert.equal(writes.length, 1); assert.equal(preferences.same, 73);
  assert.equal(Object.keys(drafts).length, 0); assert.match(errors[0], /offline/);
  assert.equal(c.settingsRequest.current, false);
});
