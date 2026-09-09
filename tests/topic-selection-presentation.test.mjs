import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getEffectiveTopicNodeIds,
  getTopicSelectionPresentation as state,
} from '../lib/topic-selection-presentation.ts';

const nodes = [
  { id: 'root', parent_id: null },
  { id: 'child', parent_id: 'root' },
  { id: 'leaf', parent_id: 'child' },
  { id: 'other', parent_id: 'root' },
];
const placements = [
  { concept_id: 'a', library_node_id: 'leaf' },
  { concept_id: 'b', library_node_id: 'other' },
];
const display = (id, selected = [], excluded = [], overrides = {}) =>
  state(
    id,
    nodes,
    placements,
    new Set(selected),
    new Set(excluded),
    overrides,
  );

test('parent selection includes descendants without descendant selection rows', () => {
  const selected = new Set(['root']);
  assert.deepEqual(display('leaf', ['root']), {
    explicit: false,
    excluded: false,
    excludedByAncestor: false,
    inherited: true,
    effective: true,
    checked: true,
    partial: false,
  });
  assert.deepEqual([...selected], ['root']);
  assert.equal(display('root', ['root']).checked, true);
});

test('descendant exclusion removes its subtree and makes the parent partial', () => {
  const effective = getEffectiveTopicNodeIds(
    nodes,
    new Set(['root']),
    new Set(['child']),
  );
  assert.deepEqual([...effective].sort(), ['other', 'root']);
  assert.equal(display('root', ['root'], ['child']).partial, true);
  assert.deepEqual(display('child', ['root'], ['child']), {
    explicit: false,
    excluded: true,
    excludedByAncestor: false,
    inherited: false,
    effective: false,
    checked: false,
    partial: false,
  });
  assert.equal(display('leaf', ['root'], ['child']).checked, false);
  assert.equal(
    display('leaf', ['root'], ['child']).excludedByAncestor,
    true,
  );
  assert.equal(display('other', ['root'], ['child']).checked, true);
});

test('more-specific include can restore a subtree under an excluded branch', () => {
  const effective = getEffectiveTopicNodeIds(
    nodes,
    new Set(['root', 'leaf']),
    new Set(['child']),
  );
  assert.deepEqual([...effective].sort(), ['leaf', 'other', 'root']);
  assert.equal(display('child', ['root', 'leaf'], ['child']).partial, true);
  assert.equal(display('leaf', ['root', 'leaf'], ['child']).checked, true);
});

test('selected child leaves root partial and sibling empty', () => {
  assert.equal(display('root', ['child']).partial, true);
  assert.equal(display('leaf', ['child']).checked, true);
  assert.equal(display('other', ['child']).checked, false);
});

test('concept exclusion makes ancestors and affected inherited topic partial', () => {
  for (const id of ['root', 'child', 'leaf']) {
    assert.equal(display(id, ['root'], [], { a: 'excluded' }).partial, true);
  }
  assert.equal(display('other', ['root'], [], { a: 'excluded' }).checked, true);
});

test('explicit Concept include restores content inside an excluded branch', () => {
  assert.equal(
    display('child', ['root'], ['child'], { a: 'included' }).partial,
    true,
  );
  assert.equal(
    display('leaf', ['root'], ['child'], { a: 'included' }).partial,
    true,
  );
});

test('multiply placed Concept follows effective placement and explicit override', () => {
  const shared = [
    ...placements,
    { concept_id: 'a', library_node_id: 'other' },
  ];
  assert.equal(
    state(
      'leaf',
      nodes,
      shared,
      new Set(['root']),
      new Set(['child']),
      {},
    ).checked,
    false,
  );
  assert.equal(
    state(
      'root',
      nodes,
      shared,
      new Set(['root']),
      new Set(['child']),
      {},
    ).partial,
    true,
  );
});

test('empty inherited topics are checked and malformed cycles terminate', () => {
  assert.equal(
    state('leaf', nodes, [], new Set(['root']), new Set(), {}).checked,
    true,
  );
  assert.equal(
    state(
      'x',
      [
        { id: 'x', parent_id: 'y' },
        { id: 'y', parent_id: 'x' },
      ],
      [],
      new Set(),
      new Set(),
      {},
    ).checked,
    false,
  );
});
