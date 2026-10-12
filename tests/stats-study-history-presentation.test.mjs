import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import * as graph from '../lib/topic-placement-graph.ts';
import { loadConceptModule, jsx } from './fixtures/concept-media-authoring.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
const elements = node => Array.isArray(node) ? node.flatMap(elements) : node && typeof node === 'object' ? [node, ...elements(node.props?.children)] : [];
const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : typeof node === 'string' || typeof node === 'number' ? String(node) : '';
class FixtureDate extends Date {
  toLocaleString() { return super.toLocaleString('en-US', { timeZone: 'UTC' }); }
}
const { PlannerStats } = loadConceptModule('components/study-planner/PlannerStats.tsx', {
  'react/jsx-runtime': jsx,
  '@/lib/topic-placement-graph': graph,
  './StatsProgress.module.css': { __esModule: true, default: new Proxy({}, { get: (_target, key) => key }) },
}, { Date: FixtureDate });
const zero = { total_concepts: 0, assessed_concepts: 0, unseen_concepts: 0, assessed_mastery_percent: null, coverage_adjusted_progress_percent: 0, evidence_count: 0, questions_answered: 0 };
const sessions = [
  { id: 'newest', deck_name: 'Current Deck', started_at: '2026-10-11T23:59:59Z', ended_at: null, answered_count: 0 },
  { id: 'finished-empty', deck_name: null, started_at: '2026-10-10T00:00:00Z', ended_at: '2026-10-10T00:01:00Z', answered_count: 0 },
  { id: 'one', deck_name: 'One response', started_at: '2026-10-09T12:01:02Z', ended_at: '2026-10-09T12:02:00Z', answered_count: 1 },
  { id: 'older-a', deck_name: 'Long deck — 日本語 & <literal text> '.repeat(5), started_at: '2026-10-08T12:00:00Z', ended_at: null, answered_count: 22 },
  { id: 'older-b', deck_name: '', started_at: '2026-10-08T12:00:00Z', ended_at: null, answered_count: 3 },
];
const fixture = (patch = {}) => ({
  activeTab: 'history', onTabChange() {}, libraryName: 'Nursing & Clinical Practice',
  progress: { summary: { ...zero, recent_session_count: 94 }, recent_sessions: sessions }, progressError: '',
  nodes: [], rootNodes: [], progressByNodeId: new Map(), fallbackProgressMetric: zero,
  expandedNodeIds: new Set(), onToggleNode() {}, showAlgorithmTab: false, algorithmPanel: null, ...patch,
});
const history = props => elements(PlannerStats(props)).find(node => node.props['aria-labelledby'] === 'study-history-title');

test('History styling preserves the complete frozen Stats component and all route loading logic', () => {
  // Approved Progress candidate before this task; its source is not changed or projected away.
  assert.equal(hash(read('components/study-planner/PlannerStats.tsx')), 'b278abce1d1067fd68fba2b83eb36db3d87f041365fdf3a7185d7aba2ee54664');
  const route = read('app/page.tsx'), addition = "import './study-history.css';\n";
  assert.equal(route.split(addition).length, 2);
  // Original released route bytes at decf5db; exclude only the stylesheet import.
  assert.equal(hash(route.replace(addition, '')), '65b909dcfeb440b7e3b607f6c5086ec42ae87cb51eadc5ec097e86c30ac99642');
});

test('all five returned sessions keep exact server order, local date formatting and recorded counts', () => {
  const props = fixture(), before = JSON.stringify(props.progress), panel = history(props), nodes = elements(panel);
  const rows = nodes.filter(node => node.type === 'article');
  assert.deepEqual(rows.map(node => node.key), sessions.map(session => session.id));
  assert.equal(rows.length, 5);
  const dates = nodes.filter(node => node.type === 'time');
  assert.deepEqual(dates.map(node => node.props.dateTime), sessions.map(session => session.started_at));
  assert.deepEqual(dates.map(text), sessions.map(session => new FixtureDate(session.started_at).toLocaleString()));
  assert.ok(dates.every(node => node.props.suppressHydrationWarning === true));
  assert.deepEqual(rows.map(row => text(elements(row).find(node => node.type === 'span'))), ['0 responses', '0 responses', '1 response', '22 responses', '3 responses']);
  assert.equal(JSON.stringify(props.progress), before);
});

test('zero-response sessions retain their actual completion state, names and Library context', () => {
  const panel = history(fixture()), nodes = elements(panel);
  assert.deepEqual(nodes.filter(node => node.type === 'small').map(text), ['In progress', 'Completed', 'Completed', 'In progress', 'In progress']);
  assert.deepEqual(nodes.filter(node => node.type === 'strong').map(text), ['Current Deck', 'Study Session', 'One response', sessions[3].deck_name, 'Study Session']);
  assert.match(text(panel), /Nursing & Clinical Practice/);
  assert.equal(nodes.some(node => node.props.dangerouslySetInnerHTML), false);
});

test('rows stay read-only with no arrows, click callbacks, extra keyboard stops or new navigation', () => {
  for (const staff of [false, true]) {
    const calls = [], props = fixture({ showAlgorithmTab: staff, onTabChange: tab => calls.push(tab) });
    const panel = history(props), nodes = elements(panel);
    assert.equal(nodes.filter(node => ['button', 'a', 'input', 'select'].includes(node.type) || node.props.onClick || node.props.tabIndex !== undefined).length, 0);
    assert.doesNotMatch(text(panel), /[→›❯]/);
    assert.deepEqual(calls, []);
    const tabs = elements(PlannerStats(props)).filter(node => node.props.role === 'tab');
    tabs.find(node => text(node) === 'Study History').props.onClick();
    assert.deepEqual(calls, ['history']);
    assert.equal(tabs.some(node => text(node) === 'Algorithm'), staff);
  }
});

test('existing empty and read-error states retain their messages and never discard loaded history', () => {
  const empty = { summary: { ...zero, recent_session_count: 0 }, recent_sessions: [] };
  assert.match(text(history(fixture({ progress: empty }))), /No recorded Study Sessions in this Library yet\./);
  const failed = history(fixture({ progressError: 'Progress could not be loaded: offline' }));
  assert.match(text(failed), /Progress could not be loaded: offline/);
  assert.equal(elements(failed).filter(node => node.type === 'article').length, 5);
  assert.doesNotMatch(text(failed), /No recorded Study Sessions/);
  const emptyFailed = history(fixture({ progress: empty, progressError: 'Progress could not be loaded: offline' }));
  assert.match(text(emptyFailed), /offline/);
  assert.equal(elements(emptyFailed).filter(node => node.type === 'article').length, 0);
});

test('the existing read model keeps its owner/Library boundary, five-session limit and deterministic order', () => {
  const sql = read('supabase/122_shared_official_topic_placements.sql');
  const rows = sql.slice(sql.indexOf('recent_session_rows as ('), sql.indexOf('select jsonb_build_object', sql.indexOf('recent_session_rows as (')));
  assert.match(rows, /where session\.user_id = current_user_id\s+and session\.library_id = p_library_id\s+order by session\.started_at desc, session\.id\s+limit 5/);
  assert.doesNotMatch(rows, /answered_count\s*[><=]/);
  assert.match(sql, /order by recent_session\.started_at desc, recent_session\.id/);
});

test('every stylesheet selector is confined to History; no page locks, hidden rows, animation or interactive affordances', () => {
  const css = read('app/study-history.css');
  const dom = new JSDOM(`<style>${css}</style>`);
  function check(rules) {
    for (const rule of rules) {
      if (rule.cssRules) check(rule.cssRules);
      else {
        assert.ok(rule.selectorText.startsWith('.home-v2-shell-stats '), rule.selectorText);
        assert.match(rule.selectorText, /study-history-title|home-v2-history/);
        assert.doesNotMatch(rule.style.cssText, /cursor:\s*pointer|display:\s*none|visibility:\s*hidden|overflow[^:]*:\s*(hidden|clip)|position:\s*fixed|animation:|transition:/);
      }
    }
  }
  assert.ok(dom.window.document.styleSheets[0].cssRules.length > 0);
  check(dom.window.document.styleSheets[0].cssRules);
  dom.window.close();
});
