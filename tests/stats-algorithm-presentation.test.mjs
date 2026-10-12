import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadConceptModule, hookHarness, jsx } from './fixtures/concept-media-authoring.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const source = read('components/CreatorAlgorithmDiagnostics.tsx');
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : [];
const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : typeof node === 'string' || typeof node === 'number' ? String(node) : '';
const expand = node => Array.isArray(node) ? node.map(expand) : node && typeof node === 'object' ? typeof node.type === 'function' ? expand(node.type(node.props)) : { ...node, props: { ...node.props, children: expand(node.props.children) } } : node;
const settle = () => new Promise(resolve => setImmediate(resolve));
const fixture = (patch = {}) => ({
  library: { id: 'library', name: 'Nursing' }, as_of: '2026-10-11T16:00:00Z',
  summary: { sessions: 94, attempts: 11, concepts_assessed: 3, concepts_in_library: 7 },
  concepts: Array.from({ length: 7 }, (_, i) => ({ id: `concept-${i}`, name: `Concept ${i}`, state: i === 6 ? null : { mastery_estimate: .591234, evidence_count: 5, last_exposure_at: '2026-10-10T12:00:00Z', last_result: 'too_hard' }, angles: i === 1 ? [
    { testing_angle: 'Mechanism', evidence_count: 2, last_result: 'easy', last_exposure_at: '2026-10-10T12:00:00Z' },
    { testing_angle: 'General Understanding', evidence_count: 3, last_result: 'too_hard', last_exposure_at: '2026-10-10T12:00:00Z' },
  ] : [] })),
  recent_attempts: [
    { id: 'recent', created_at: '2026-10-10T12:00:00Z', concept_name: 'Concept 1', current_prompt: '**Legacy source** remains literal', testing_angle: 'Mechanism', result: 'too_hard', study_session_id: 'session' },
    { id: 'older', created_at: '2026-10-09T12:00:00Z', concept_name: null, current_prompt: null, testing_angle: null, result: 'forgot', study_session_id: 'session' },
  ],
  session: { id: 'session', started_at: '2026-10-10T12:00:00Z', cram_mode: false },
  official_offer: { concept_id: 'concept-1', prompt: '<script>literal source</script>', testing_angle: 'Mechanism', selection_reason: 'repeated_lapse_history', concept_priority: .635789, new_component: .2, review_component: .4, angle_component: .1, prerequisite_priority_component: .03, urgent_review_component: .01, combined_lapse_priority_component: .1, recent_penalty: -.2 },
  selected_source: 'official', source_decision: 'existing scheduler decision', ...patch,
});
function setup(handler = () => ({ data: fixture(), error: null })) {
  const hooks = hookHarness(), calls = [];
  let props = { libraryId: 'library', requestScope: 'staff' };
  const { CreatorAlgorithmDiagnostics } = loadConceptModule('components/CreatorAlgorithmDiagnostics.tsx', {
    react: hooks.hooks, 'react/jsx-runtime': jsx,
    'lucide-react': Object.fromEntries(['Activity', 'BookOpen', 'Clock3', 'RefreshCw', 'Search', 'Target'].map(name => [name, () => null])),
    '@/lib/supabase': { supabase: { rpc: (name, args) => { calls.push({ name, args }); return Promise.resolve(handler(name, args)); } } },
    './CreatorAlgorithmDiagnostics.module.css': { __esModule: true, default: new Proxy({}, { get: (_target, key) => key }) },
  });
  const render = () => expand(hooks.render(() => CreatorAlgorithmDiagnostics(props)));
  return { hooks, calls, render, nodes: () => nodes(render()), text: () => text(render()), props: patch => { props = { ...props, ...patch }; },
    section: label => nodes(render()).find(n => n.props['aria-label'] === label),
    button: label => nodes(render()).find(n => n.type === 'button' && text(n).includes(label)),
    async load() { render(); hooks.effects(); await settle(); return render(); },
  };
}

test('all released diagnostics data loading, state, selectors, calculations and evidence color mappings remain byte-identical', () => {
  const prefix = source.slice(0, source.indexOf('  return (\n    <section className={styles.dashboard}'));
  // Original released source at decf5db; this is not a replacement fingerprint.
  assert.equal(createHash('sha256').update(prefix).digest('hex'), '06003529b9090499599ab6c73e3147ae59b4937759b4618283a25d7d958df637');
});

test('summary uses the same four authoritative values, qualifications and only the read RPC', async () => {
  const s = setup(); await s.load();
  assert.deepEqual(s.calls.map(c => [c.name, c.args.p_library_id]), [['get_creator_algorithm_diagnostics', 'library']]);
  const metrics = s.nodes().filter(n => n.props.className === 'metric');
  assert.deepEqual(metrics.map(n => text(nodes(n).find(child => child.type === 'strong'))), ['94', '11', '3', '7']);
  assert.deepEqual(metrics.map(n => text(nodes(n).find(child => child.type === 'small'))), ['All time in this Library', 'Self-rated responses · not accuracy', 'Recorded in attempt history', 'Current Library placements']);
  assert.equal(s.nodes().filter(n => n.type === 'a').length, 0);
});

test('recent activity preserves returned order, all50 rows, literal excerpts and unavailable fallbacks', async () => {
  const d = fixture(); d.recent_attempts.push(...Array.from({ length: 48 }, (_, i) => ({ ...d.recent_attempts[0], id: `attempt-${i}`, concept_name: `Ordered ${i}` })));
  const s = setup(() => ({ data: d, error: null })); await s.load();
  const panel = s.section('Recent study activity'), rows = nodes(panel).filter(n => n.type === 'tbody').flatMap(n => n.props.children);
  assert.equal(rows.length, 50); assert.equal(rows[0].key, 'recent'); assert.equal(rows[1].key, 'older'); assert.equal(rows[49].key, 'attempt-47');
  assert.match(text(panel), /Latest 50 \/ 50 official attempts/);
  assert.match(text(panel), /\*\*Legacy source\*\* remains literal/);
  assert.match(text(panel), /Unavailable ConceptPrompt unavailableNot recordedforgot/);
  assert.equal(s.section('Recent official attempt history').props.tabIndex, 0);
});

test('compact Spotlight retains exact mastery, evidence, date and current-offer priority; full details stay accessible', async () => {
  const s = setup(); await s.load(); const panel = s.section('Concept spotlight');
  assert.match(text(panel), /Concept 1Current mastery0\.591Evidence5/);
  assert.match(text(panel), /Offered Primary AngleMechanismPriority0\.636Current offer/);
  const meter = nodes(panel).find(n => n.props.role === 'meter'); assert.equal(meter.props['aria-valuenow'], .591234);
  assert.equal(meter.props.children.props.style.width, '59.123400000000004%');
  assert.ok(nodes(panel).some(n => n.type === 'summary' && text(n) === 'View full Concept details'));
  assert.match(text(panel), /Selected Concept detailsConcept 1Mastery: 0\.591234 · Last response: Too Hard/);
  assert.equal(s.section('Concept spotlight table').props.tabIndex, 0);
});

test('both existing selection paths, search, Show all and inspect-offer callbacks still select exactly the requested Concept', async () => {
  const s = setup(); await s.load();
  assert.equal(nodes(s.section('Concept mastery')).filter(n => n.props.className === 'progressRow').length, 6);
  s.button('View all 7').props.onClick();
  assert.equal(nodes(s.section('Concept mastery')).filter(n => n.props.className === 'progressRow').length, 7);
  s.nodes().find(n => n.props.className === 'progressRow' && text(n).startsWith('Concept 6')).props.onClick();
  assert.match(text(s.section('Concept spotlight')), /Concept 6Current mastery—Evidence—Last studiedNot yetPriority—/);
  s.nodes().find(n => n.type === 'input').props.onChange({ target: { value: 'Concept 0' } });
  assert.equal(nodes(s.section('Concept mastery')).filter(n => n.props.className === 'progressRow').length, 1);
  nodes(s.section('Concept spotlight table')).find(n => n.type === 'button').props.onClick();
  assert.match(text(s.section('Why this Concept')), /Concept 0/);
  s.button('Inspect current official offer').props.onClick();
  assert.equal(s.nodes().find(n => n.type === 'input').props.value, '');
  assert.match(text(s.section('Why this Concept')), /Concept 1/);
  assert.equal(s.calls.length, 1);
});

test('Testing Angle evidence keeps totals, shares, persisted qualifications and zero-evidence state', async () => {
  const s = setup(); await s.load(); let panel = s.section('Testing Angle Evidence');
  assert.match(text(panel), /5Total evidenceMechanism240%General Understanding360%/);
  assert.match(text(panel), /Additional classifications add no evidence\. Self-ratings are not accuracy\./);
  const disclosure = s.nodes().find(n => n.type === 'details' && text(n).startsWith('Concept Mastery and Testing Angle Evidence')); assert.ok(disclosure); assert.equal(disclosure.props.open, undefined);
  s.nodes().find(n => n.props.className === 'progressRow' && text(n).startsWith('Concept 0')).props.onClick();
  panel = s.section('Testing Angle Evidence'); assert.match(text(panel), /0Total evidenceNo Primary Testing Angle evidence/);
});

test('Insight retains authoritative signed factors, exact JSON and scheduler reasoning without new explanations', async () => {
  const d = fixture({ selected_source: 'personal' }), s = setup(() => ({ data: d, error: null })); await s.load(); const panel = s.section('Why this Concept');
  assert.match(text(panel), /The scheduler identifies repeated lapses in recent history\. Personal material is currently selected instead\./);
  assert.match(text(panel), /Recent Concept penalty-0\.2/);
  assert.match(text(panel), /Components are scheduler outputs, not an additive formula/);
  assert.match(text(panel), /existing scheduler decision/);
  assert.deepEqual(JSON.parse(text(nodes(panel).find(n => n.type === 'pre'))), d.official_offer);
  assert.match(text(panel), /Current Question: <script>literal source<\/script>/);
  assert.ok(nodes(panel).some(n => n.type === 'summary' && text(n) === 'Priority breakdown and diagnostics'));
  assert.ok(nodes(panel).some(n => n.type === 'summary' && text(n) === 'Advanced details'));
});

test('Cram and no-session qualifications remain truthful; no priority is invented', async () => {
  for (const cram of [false, true]) {
    const d = fixture(cram ? { session: { id: 'session', started_at: '2026-10-10T12:00:00Z', cram_mode: true } } : { session: null, official_offer: null });
    const s = setup(() => ({ data: d, error: null })); await s.load();
    assert.match(text(s.section('Why this Concept')), cram ? /Cram uses traversal rules; Normal Mode scores are unavailable/ : /No open Study session\. Start one in Study to inspect its current offer/);
    if (!cram) assert.doesNotMatch(text(s.section('Concept spotlight')), /Current offer/);
  }
});

test('loading, missing Library and failed read remain distinct; refresh retries without mutations', async () => {
  let fail = true; const s = setup(() => fail ? { data: null, error: { message: 'private error' } } : { data: fixture(), error: null });
  assert.match(s.text(), /Loading authoritative/); assert.equal(s.button('Refresh').props.disabled, true);
  await s.load(); assert.match(s.text(), /Diagnostics could not be loaded/); assert.doesNotMatch(s.text(), /private error|Study Sessions/);
  fail = false; s.button('Refresh').props.onClick(); await s.load(); assert.match(s.text(), /Study Sessions94/); assert.equal(s.calls.length, 2);
  s.props({ libraryId: null }); await s.load(); assert.match(s.text(), /Select a Library/); assert.doesNotMatch(s.text(), /Study Sessions/); assert.equal(s.calls.length, 2);
});

test('a cancelled Library read cannot overwrite the latest diagnostics, and refresh retains a valid selection', async () => {
  const pending = [], s = setup(() => new Promise(resolve => pending.push(resolve)));
  s.render(); s.hooks.effects(); const stale = pending.shift();
  s.props({ libraryId: 'new-library' }); s.render(); s.hooks.effects();
  pending.shift()({ data: fixture({ library: { id: 'new-library', name: 'Latest Library' } }), error: null }); await settle();
  stale({ data: fixture(), error: null }); await settle(); assert.match(s.text(), /Latest Library/); assert.doesNotMatch(s.text(), /Nursing/);
  s.nodes().find(n => n.props.className === 'progressRow' && text(n).startsWith('Concept 0')).props.onClick();
  s.button('Refresh').props.onClick(); s.render(); s.hooks.effects(); pending.shift()({ data: fixture(), error: null }); await settle();
  assert.match(text(s.section('Concept spotlight')), /Concept 0Current mastery/);
});
