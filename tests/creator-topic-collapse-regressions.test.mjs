import test from 'node:test';
import assert from 'node:assert/strict';
import { editor, nodes, expandChrome } from './fixtures/creator-question-workflow.mjs';
import { graphFromNodes } from './fixtures/shared-topic-branches.mjs';
import { occurrenceExpanded, toggleOccurrenceKey } from '../lib/topic-placement-graph.ts';
import { buildConceptTopicTree } from '../lib/concept-topic-tree.ts';

function fixture() {
  const g = graphFromNodes('library', [
    { id: 'root', name: 'Root', parent_id: null },
    { id: 'branch', name: 'Branch', parent_id: 'root' },
    { id: 'nested', name: 'Nested', parent_id: 'branch' },
    { id: 'deep', name: 'Deep', parent_id: 'nested' },
    { id: 'leaf', name: 'Leaf', parent_id: 'deep' },
    { id: 'other', name: 'Other', parent_id: 'root' },
  ]);
  g.version = 132;
  g.locations = g.nodes.map(n => ({ id: `place-${n.id}`, library_id: 'library', topic_id: n.id,
    parent_location_id: n.parent_id ? `place-${n.parent_id}` : null, is_original: true, sort_order: n.sort_order }));
  g.locations.push({ id: 'alias', library_id: 'library', topic_id: 'branch', parent_location_id: 'place-other', is_original: false, sort_order: 0 });
  const h = editor({ editing: true });
  h.props.initialTopics = buildConceptTopicTree(g.nodes, true);
  h.props.initialTopicGraph = g;
  h.props.initialConcept.placementIds = ['leaf'];
  return h;
}
const all = h => nodes(expandChrome(h.render().tree));
const arrow = (h, name) => all(h).find(n => n.type === 'button' && n.props['aria-label'] === name);
for (const name of ['Root', 'Branch', 'Nested', 'Deep']) {
  test(`original ${name} collapses and reopens without changing selection or draft`, () => {
    const h = fixture(); let e = h.render(); e.setConcept('Keep draft');
    arrow(h, `Collapse ${name}`).props.onClick({ stopPropagation() {} });
    assert.ok(arrow(h, `Expand ${name}`), 'the branch must actually collapse');
    assert.equal(arrow(h, 'Collapse Leaf'), undefined, 'descendants are hidden');
    arrow(h, `Expand ${name}`).props.onClick({ stopPropagation() {} });
    assert.ok(arrow(h, `Collapse ${name}`));
    e = h.render(); assert.deepEqual([...e.selectedTopicIds], ['leaf']);
    assert.equal(e.concept, 'Keep draft'); assert.equal(e.activeTopicId, 'leaf');
    assert.equal(h.calls.length, 0, 'expansion is presentation state only');
  });
}
test('collapsing an original location leaves other location expansion independent', () => {
  const h = fixture(); let e = h.render(); e.toggleExpanded('location:alias');
  arrow(h, 'Collapse Branch').props.onClick({ stopPropagation() {} });
  e = h.render(); assert.ok(!e.expandedTopicIds.has('branch'));
  assert.ok(e.expandedTopicIds.has('location:alias'));
});
test('legacy path keys retain their previous toggle behavior', () => {
  const node = { id: 'branch', occurrenceKey: 'primary:root/primary:branch', originalPath: true };
  let keys = new Set(['root', 'branch']);
  assert.equal(occurrenceExpanded(node, keys), true);
  keys = toggleOccurrenceKey(keys, node.occurrenceKey);
  assert.equal(occurrenceExpanded(node, keys), false); assert.ok(keys.has('root'));
  keys = toggleOccurrenceKey(keys, node.occurrenceKey);
  assert.equal(occurrenceExpanded(node, keys), true);
});
test('shared alias toggle does not consume the original canonical expansion seed', () => {
  const original = { id: 'branch', occurrenceKey: 'location:original', originalPath: true };
  const alias = { id: 'branch', occurrenceKey: 'location:alias', originalPath: false };
  let keys = new Set(['branch']);
  keys = toggleOccurrenceKey(keys, alias.occurrenceKey);
  assert.equal(occurrenceExpanded(alias, keys), true); assert.equal(occurrenceExpanded(original, keys), true);
  keys = toggleOccurrenceKey(keys, alias.occurrenceKey);
  assert.equal(occurrenceExpanded(alias, keys), false); assert.equal(occurrenceExpanded(original, keys), true);
});
test('Concept browse root collapses after its canonical initial expansion', () => {
  const h = fixture(); let e = h.render(); e.setIsConceptBrowseOpen(true);
  let button = all(h).find(n => n.type === 'button' && n.props.className === 'conceptBrowseTopicRow' && n.props['aria-expanded']);
  assert.ok(button); button.props.onClick();
  button = all(h).find(n => n.type === 'button' && n.props.className === 'conceptBrowseTopicRow');
  assert.equal(button.props['aria-expanded'], false);
  button.props.onClick();
  assert.equal(all(h).find(n => n.type === 'button' && n.props.className === 'conceptBrowseTopicRow').props['aria-expanded'], true);
});
test('prerequisite browse root collapses without changing linked prerequisites', () => {
  const h = fixture(); let e = h.render(); e.setIsPrerequisiteBrowseOpen(true);
  let button = all(h).find(n => n.type === 'button' && n.props.className === 'prerequisiteExpandButton');
  assert.ok(button); assert.equal(button.props['aria-expanded'], true); button.props.onClick();
  button = all(h).find(n => n.type === 'button' && n.props.className === 'prerequisiteExpandButton');
  assert.equal(button.props['aria-expanded'], false);
  assert.equal(h.render().prerequisites.length, 0); assert.equal(h.calls.length, 0);
});
