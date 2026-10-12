import test from 'node:test';
import assert from 'node:assert/strict';
import { readAppearanceSource as readFileSync } from './fixtures/appearance.mjs';
import { createHash } from 'node:crypto';
import { projectStatsProgress } from './fixtures/stats-progress-presentation.mjs';
import { loadConceptModule, jsx } from './fixtures/concept-media-authoring.mjs';
import * as graph from '../lib/topic-placement-graph.ts';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
const elements = node => Array.isArray(node) ? node.flatMap(elements) : node && typeof node === 'object' ? [node, ...elements(node.props?.children)] : [];
const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : typeof node === 'string' || typeof node === 'number' ? String(node) : '';
const expand = node => Array.isArray(node) ? node.map(expand) : node && typeof node === 'object' ? typeof node.type === 'function' ? expand(node.type(node.props)) : { ...node, props: { ...node.props, children: expand(node.props.children) } } : node;
const { PlannerStats } = loadConceptModule('components/study-planner/PlannerStats.tsx', {
  'react/jsx-runtime': jsx,
  '@/lib/topic-placement-graph': graph,
  './StatsProgress.module.css': { __esModule: true, default: new Proxy({}, { get: (_target, key) => key }) },
});
const zero = { total_concepts: 0, assessed_concepts: 0, unseen_concepts: 0, assessed_mastery_percent: null, coverage_adjusted_progress_percent: 0, questions_answered: 0, evidence_count: 0 };
const root = { id: 'root', name: 'Nursing', parent_id: null };
const child = { id: 'child', name: 'Clinical Practice', parent_id: 'root' };
const fixture = (patch = {}) => ({ activeTab: 'progress', onTabChange() {}, libraryName: 'Fixture Library', progress: { summary: { ...zero, total_concepts: 6, assessed_concepts: 3, unseen_concepts: 3, questions_answered: 11, recent_session_count: 19 }, recent_sessions: [] }, progressError: '', nodes: [root, child], rootNodes: [root], progressByNodeId: new Map([['root', { ...zero, total_concepts: 6, assessed_concepts: 3, unseen_concepts: 3, assessed_mastery_percent: 71.7, coverage_adjusted_progress_percent: 35.8 }]]), fallbackProgressMetric: zero, expandedNodeIds: new Set(['root']), onToggleNode() {}, showAlgorithmTab: true, algorithmPanel: null, ...patch });

// Original released bytes at decf5db, before the approved presentation exceptions.
const released = {
  "components/StudyPlanner.tsx": "e634fbaba1889595da2ec96ad8fbfae90bbdd9c29885bfa6513db2d0453bcd3d",
  "components/study-planner/PlannerStats.tsx": "d3f9f87fc2416d5586befa831a01e1c54890e3dc2b808605e3ef7658971425a3",
  "components/study-planner/StudyGoals.tsx": "d7a07ad933bf4601d9fe3f15932f53506f7b1c4ec9553c898be248abddb158d1",
  "components/study-planner/StudyAdvisor.tsx": "bf39234214b26a776b0a2b6df9dee5fc6b703da3526dd5b7518fd7047bc6c7ce"
};
for (const [path, fingerprint] of Object.entries(released)) test(`Stats presentation preserves all released behavior: ${path}`, () => {
  const current = read(path);
  assert.equal(hash(projectStatsProgress(path, current)), fingerprint);
  assert.notEqual(hash(projectStatsProgress(path, `${current}\n// unrelated change\n`)), fingerprint);
});

test('actual Progress rows retain authoritative summary, rounding, fallback and independent disclosure callbacks', () => {
  const toggles = [], props = fixture({ onToggleNode: id => toggles.push(id) });
  const tree = expand(PlannerStats(props));
  assert.match(text(tree), /3\/6 Concepts assessed · 3 unseen · 11 Questions answered · 19 recent sessions/);
  assert.match(text(tree), /3\/6 assessed · 3 unseen · 72% assessed average/);
  const bars = elements(tree).filter(n => n.props.role === 'progressbar');
  assert.deepEqual(bars.map(n => n.props['aria-valuenow']), [36, 0]);
  assert.deepEqual(bars.map(n => n.props.children.props.style.width), ['36%', '0%']);
  const buttons = elements(tree).filter(n => n.props.className === 'home-v2-chevron');
  assert.equal(buttons[0].props['aria-expanded'], true);
  assert.equal(buttons[1].props.disabled, true);
  assert.deepEqual(toggles, []);
  buttons[0].props.onClick(); assert.deepEqual(toggles, ['root']);
  assert.deepEqual([...props.expandedNodeIds], ['root']);
  assert.equal(elements(expand(PlannerStats(fixture({ expandedNodeIds: new Set() })))).filter(n => n.props.role === 'progressbar').length, 1);
});

test('navy tabs retain role authority, exact destinations and one existing callback per activation', () => {
  for (const staff of [true, false]) {
    const calls = [], tree = PlannerStats(fixture({ activeTab: 'flagged', showAlgorithmTab: staff, onTabChange: tab => calls.push(tab) }));
    const tabs = elements(tree).filter(n => n.props.role === 'tab');
    assert.deepEqual(tabs.map(text), staff ? ['Progress', 'Study History', 'Flagged Review', 'Algorithm'] : ['Progress', 'Study History', 'Flagged Review']);
    assert.equal(tabs.filter(n => n.props['aria-selected']).length, 1);
    assert.equal(text(tabs.find(n => n.props['aria-selected'])), 'Flagged Review');
    tabs.forEach(n => n.props.onClick());
    assert.deepEqual(calls, staff ? ['progress', 'history', 'flagged', 'algorithm'] : ['progress', 'history', 'flagged']);
    assert.equal(elements(tree).filter(n => n.props['aria-labelledby'] === 'tree-title').length, 0);
  }
});

test('shared Topic occurrences retain their canonical progress and distinct expansion identities', () => {
  const canonical = { ...root, children: [] };
  const left = { ...canonical, occurrenceKey: 'placement:left', children: [child] };
  const right = { ...canonical, occurrenceKey: 'placement:right', children: [child] };
  const calls = [], props = fixture({ rootNodes: [left, right], expandedNodeIds: new Set(), onToggleNode: key => calls.push(key) });
  const tree = expand(PlannerStats(props));
  assert.deepEqual(elements(tree).filter(n => n.props.role === 'progressbar').map(n => n.props['aria-valuenow']), [36, 36]);
  elements(tree).filter(n => n.props.className === 'home-v2-chevron').forEach(n => n.props.onClick());
  assert.deepEqual(calls, ['placement:left', 'placement:right']);
});

test('sidebar removal is Stats-only and keeps the released header, Home sidebar and keyed review mounts', () => {
  const planner = read('components/StudyPlanner.tsx');
  assert.doesNotMatch(planner, /<SocratesShell active="stats"/);
  assert.match(planner, /<SocratesShell variant="home" active="home"/);
  assert.match(planner, /<LearnerHeader classPrefix="home-v2"/);
  assert.match(planner, /statsTab === 'flagged' && userId && <StatsFlaggedReview key=/);
  assert.match(planner, /statsTab === 'progress' && userId && <StudyGoals key=/);
  assert.match(read('components/study-planner/StatsProgress.module.css'), /:global\(\.home-v2-header\):has\(\+ \.shell\)/);
  assert.doesNotMatch(read('components/study-planner/StatsProgress.module.css'), /home-v2-setup|position:\s*fixed|100vh|overflow-y:\s*hidden/);
});
