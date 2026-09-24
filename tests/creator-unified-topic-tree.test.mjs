import assert from 'node:assert/strict';
import test from 'node:test';

import {
  composeUnifiedCreatorTopicTree,
  flattenUnifiedCreatorTopics,
} from '../lib/creator-unified-topic-tree.ts';

const ownerId = '11111111-1111-4111-8111-111111111111';
const sharedId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const officialChildId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const otherOfficialId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function personalTopic({
  id,
  name,
  parentId = null,
  sortOrder = 0,
  owner = ownerId,
}) {
  return {
    id,
    owner_id: owner,
    parent_id: parentId,
    name,
    sort_order: sortOrder,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function placement(personalTopicId, libraryNodeId, owner = ownerId) {
  return {
    id: `placement-${personalTopicId}`,
    owner_id: owner,
    personal_topic_id: personalTopicId,
    library_node_id: libraryNodeId,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

const officialTopics = [
  {
    id: sharedId,
    name: 'Official root with colliding UUID',
    children: [
      { id: officialChildId, name: 'Official child', children: [] },
    ],
  },
  { id: otherOfficialId, name: 'Second official root', children: [] },
];

test('placed roots compose beneath the exact official node and descendants follow parent_id', () => {
  const personalTopics = [
    personalTopic({ id: sharedId, name: 'My placed root', sortOrder: 2 }),
    personalTopic({ id: 'personal-child', name: 'My child', parentId: sharedId }),
    personalTopic({
      id: 'personal-grandchild',
      name: 'My grandchild',
      parentId: 'personal-child',
    }),
  ];
  const composed = composeUnifiedCreatorTopicTree({
    officialTopics,
    ownerId,
    personalTopics,
    topicPlacements: [placement(sharedId, officialChildId)],
  });

  const officialChild = composed.officialRoots[0].children[0];
  const personalRoot = officialChild.children[0];
  assert.equal(personalRoot.key, `personal:topic:${sharedId}`);
  assert.equal(personalRoot.presentationParentKey, `official:topic:${officialChildId}`);
  assert.equal(personalRoot.canonicalParentKey, null);
  assert.equal(personalRoot.children[0].canonicalParentKey, `personal:topic:${sharedId}`);
  assert.equal(
    personalRoot.children[0].children[0].canonicalParentKey,
    'personal:topic:personal-child'
  );
  assert.equal(composed.unplacedPersonalRoots.length, 0);
});

test('official and personal Topics with the same raw UUID never merge', () => {
  const composed = composeUnifiedCreatorTopicTree({
    officialTopics,
    ownerId,
    personalTopics: [personalTopic({ id: sharedId, name: 'Mine' })],
    topicPlacements: [placement(sharedId, otherOfficialId)],
  });
  const rows = flattenUnifiedCreatorTopics(composed.officialRoots);
  const collidingRows = rows.filter((row) => row.id === sharedId);
  assert.deepEqual(
    collidingRows.map((row) => row.key).sort(),
    [`official:topic:${sharedId}`, `personal:topic:${sharedId}`].sort()
  );
  assert.equal(new Set(collidingRows.map((row) => row.key)).size, 2);
});

test('official order is preserved and personal siblings append in stable sort order', () => {
  const personalTopics = [
    personalTopic({ id: 'personal-z', name: 'Zulu', sortOrder: 1 }),
    personalTopic({ id: 'personal-a', name: 'Alpha', sortOrder: 1 }),
    personalTopic({ id: 'personal-first', name: 'First', sortOrder: 0 }),
  ];
  const composed = composeUnifiedCreatorTopicTree({
    officialTopics,
    ownerId,
    personalTopics,
    topicPlacements: personalTopics.map((topic) => placement(topic.id, sharedId)),
  });

  assert.deepEqual(
    composed.officialRoots.map((row) => row.id),
    [sharedId, otherOfficialId]
  );
  assert.deepEqual(
    composed.officialRoots[0].children.map((row) => row.id),
    [officialChildId, 'personal-first', 'personal-a', 'personal-z']
  );
});

test('unplaced roots remain truthful and only exist when personal roots are unplaced', () => {
  const empty = composeUnifiedCreatorTopicTree({
    officialTopics,
    ownerId,
    personalTopics: [],
    topicPlacements: [],
  });
  assert.equal(empty.unplacedPersonalRoots.length, 0);

  const unplaced = composeUnifiedCreatorTopicTree({
    officialTopics,
    ownerId,
    personalTopics: [personalTopic({ id: 'unplaced', name: 'Unplaced' })],
    topicPlacements: [],
  });
  assert.equal(unplaced.unplacedPersonalRoots[0].key, 'personal:topic:unplaced');
});

test('placements for another Library are not mislabeled as unplaced', () => {
  const composed = composeUnifiedCreatorTopicTree({
    officialTopics,
    ownerId,
    personalTopics: [personalTopic({ id: 'elsewhere', name: 'Elsewhere' })],
    topicPlacements: [placement('elsewhere', 'node-from-another-library')],
  });
  assert.equal(composed.unplacedPersonalRoots.length, 0);
  assert.equal(composed.otherLibraryPersonalRoots[0].id, 'elsewhere');
});

test('composition fails closed on cross-owner rows, child placements, and cycles', () => {
  assert.throws(
    () => composeUnifiedCreatorTopicTree({
      officialTopics,
      ownerId,
      personalTopics: [personalTopic({ id: 'cross-owner', name: 'Other', owner: 'other' })],
      topicPlacements: [],
    }),
    /owner boundary/
  );

  assert.throws(
    () => composeUnifiedCreatorTopicTree({
      officialTopics,
      ownerId,
      personalTopics: [
        personalTopic({ id: 'root', name: 'Root' }),
        personalTopic({ id: 'child', name: 'Child', parentId: 'root' }),
      ],
      topicPlacements: [placement('child', sharedId)],
    }),
    /Only an owned root/
  );

  assert.throws(
    () => composeUnifiedCreatorTopicTree({
      officialTopics,
      ownerId,
      personalTopics: [
        personalTopic({ id: 'cycle-a', name: 'A', parentId: 'cycle-b' }),
        personalTopic({ id: 'cycle-b', name: 'B', parentId: 'cycle-a' }),
      ],
      topicPlacements: [],
    }),
    /cycle/
  );
});
