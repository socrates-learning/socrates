import test from 'node:test';
import assert from 'node:assert/strict';
import { topicGraphOccurrences } from '../lib/topic-placement-graph.ts';
import { composeHomeGroups } from '../lib/home-deck-settings.ts';
import { composeUnifiedCreatorTopicTree } from '../lib/creator-unified-topic-tree.ts';

// Independent display oracle for study-goal-topic-ordering.sql. These are the
// existing Home/Creator implementations, not another copy of the SQL sorter.
const rows = [
  ['root', null, 'Library', 0],
  ['first', 'root', 'Zulu first', 2],
  ['tie-a', 'first', 'Zulu tied first', 0],
  ['tie-b', 'first', 'Alpha tied second', 0],
  ['deep', 'tie-a', 'Deep descendant', 0],
  ['last', 'root', 'Alpha last', 10],
];
const graph = {
  version: 132, library_id: 'library', revision: 'a'.repeat(32), root_id: 'root',
  nodes: rows.map(([id, parent_id, name, sort_order]) => ({ id, parent_id, name, sort_order })),
  edges: rows.filter(([, parent]) => parent).map(([id, parent_id, , sort_order]) => ({
    edge_key: `primary:${id}`, topic_id: id, parent_id, sort_order, kind: 'primary',
  })),
  locations: [
    ...rows.map(([id, parent_location_id, , sort_order]) => ({
      id, topic_id: id, parent_location_id, sort_order, library_id: 'library', is_original: true,
    })),
    { id: 'alias', topic_id: 'first', parent_location_id: 'last', sort_order: 0, library_id: 'library', is_original: false },
  ],
};
const flatten = nodes => nodes.flatMap(n => [n, ...flatten(n.children)]);
const expected = ['root', 'first', 'tie-a', 'deep', 'tie-b', 'last', 'alias'].map(id => `location:${id}`);

for (const after134 of [false, true]) test(`existing Topic Tree order ${after134 ? 'after' : 'before'} 134 is depth-first saved position, then placement ID`, () => {
  const input = structuredClone(graph);
  // A database row order is deliberately not a display-order guarantee.
  input.locations.reverse();
  if (after134) {
    Object.assign(input, { detachment_version: 134, unassigned_topic_ids: [], detached_original_topic_ids: [] });
    input.locations.forEach(l => Object.assign(l, { detached_at: null, detachment_id: null }));
  }
  const official = topicGraphOccurrences(input);
  const creator = composeUnifiedCreatorTopicTree({ officialTopics: official, ownerId: 'owner', personalTopics: [], topicPlacements: [], canonicalOrder: true });
  assert.deepEqual(flatten(official).map(n => n.occurrenceKey), expected);
  assert.deepEqual(flatten(creator.officialRoots).map(n => n.occurrenceKey), expected);
  assert.deepEqual(flatten(composeHomeGroups(input.nodes, [], [], [], input)).map(n => n.occurrenceKey), expected);
  const alias = flatten(official).find(n => n.occurrenceKey === 'location:alias');
  assert.equal(alias.id, 'first');
  assert.deepEqual(alias.children, []);
});

test('personal sibling ordering uses saved positions before the established name tie break', () => {
  const topics = [
    ['personal-root', null, 'Personal', 0],
    ['p-first', 'personal-root', 'Zulu first', 2],
    ['p-last', 'personal-root', 'Alpha last', 10],
    ['p-zulu', 'p-first', 'Zulu tie', 0],
    ['p-alpha', 'p-first', 'Alpha tie', 0],
    ['p-deep', 'p-zulu', 'Deep', 0],
  ].map(([id, parent_id, name, sort_order]) => ({ id, parent_id, name, sort_order, owner_id: 'owner' }));
  const tree = composeUnifiedCreatorTopicTree({ officialTopics: topicGraphOccurrences(graph), ownerId: 'owner',
    personalTopics: topics.reverse(), topicPlacements: [{ personal_topic_id: 'personal-root', library_node_id: 'root', owner_id: 'owner' }], canonicalOrder: true });
  assert.deepEqual(flatten(tree.officialRoots).filter(n => n.source === 'personal').map(n => n.id),
    ['personal-root', 'p-first', 'p-alpha', 'p-zulu', 'p-deep', 'p-last']);
});
