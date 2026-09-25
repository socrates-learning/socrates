import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { deriveCreatorCapabilities } from '../lib/creator-capabilities.ts';
import { resolveCreatorCommandRoute } from '../lib/creator-command-contracts.ts';
import { loadCreatorPersonalContent } from '../lib/creator-personal-content.ts';

const creatorSource = readFileSync(
  new URL('../components/CreatorStudioV2Client.tsx', import.meta.url),
  'utf8'
);
const newPageSource = readFileSync(
  new URL('../app/creator/concepts/new/page.tsx', import.meta.url),
  'utf8'
);
const editPageSource = readFileSync(
  new URL('../app/creator/concepts/[id]/page.tsx', import.meta.url),
  'utf8'
);
function capabilities(role = 'learner', userId = `${role}-owner`) {
  return deriveCreatorCapabilities({
    role,
    userId,
    library: {
      activeLibraryId: 'library-a',
      canAccessActiveLibrary: true,
      canManageActiveLibrary: role !== 'learner',
    },
  });
}

function personalRows(ownerId = 'learner-owner') {
  return {
    personal_topics: [{
      id: 'topic-a', owner_id: ownerId, parent_id: null, name: 'Mine',
      sort_order: 0, created_at: '2026-01-01', updated_at: '2026-01-01',
    }],
    personal_concepts: [{
      id: 'concept-a', owner_id: ownerId, topic_id: 'topic-a', name: 'Mine',
      description: 'Description', source_reference: 'Source',
      created_at: '2026-01-01', updated_at: '2026-01-01',
    }],
    personal_cards: [{
      id: 'card-a', owner_id: ownerId, concept_id: 'concept-a',
      question: 'Question', answer: 'Answer', source_reference: 'Reference',
      created_at: '2026-01-01', updated_at: '2026-01-01',
    }],
    personal_concept_official_placements: [{
      id: 'overlay-a', owner_id: ownerId, personal_concept_id: 'concept-a',
      library_node_id: 'node-a', official_concept_id: 'official-concept-a',
      created_at: '2026-01-01', updated_at: '2026-01-01',
    }],
    personal_topic_official_placements: [{
      id: 'topic-placement-a', owner_id: ownerId, personal_topic_id: 'topic-a',
      library_node_id: 'node-a',
      created_at: '2026-01-01', updated_at: '2026-01-01',
    }],
  };
}

function loaderDatabase(rows) {
  const calls = [];
  return {
    calls,
    from(table) {
      const query = {
        select(columns) { calls.push({ table, operation: 'select', columns }); return query; },
        eq(column, value) { calls.push({ table, operation: 'eq', column, value }); return query; },
        order(column) { calls.push({ table, operation: 'order', column }); return query; },
        then(resolve, reject) {
          return Promise.resolve({ data: rows[table] || [], error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

test('personal bootstrap is five bounded owner-scoped reads with no per-item wave', async () => {
  const database = loaderDatabase(personalRows());
  const loaded = await loadCreatorPersonalContent(database, 'learner-owner');

  assert.equal(loaded.ownerId, 'learner-owner');
  assert.equal(loaded.topics.length, 1);
  assert.equal(loaded.concepts.length, 1);
  assert.equal(loaded.cards.length, 1);
  assert.equal(loaded.overlays.length, 1);
  assert.equal(loaded.topicPlacements.length, 1);
  assert.deepEqual(
    [...new Set(database.calls.filter((call) => call.operation === 'select').map((call) => call.table))].sort(),
    ['personal_cards', 'personal_concept_official_placements', 'personal_concepts', 'personal_topic_official_placements', 'personal_topics']
  );
  assert.equal(database.calls.filter((call) => call.operation === 'select').length, 5);
  assert.equal(database.calls.filter((call) => call.operation === 'eq' && call.column === 'owner_id' && call.value === 'learner-owner').length, 5);
});

test('personal bootstrap fails closed if a backend response crosses the owner boundary', async () => {
  const rows = personalRows('learner-owner');
  rows.personal_cards[0].owner_id = 'second-learner';
  await assert.rejects(
    loadCreatorPersonalContent(loaderDatabase(rows), 'learner-owner'),
    /crossed the authenticated owner boundary/
  );
});

test('personal Topic placement bootstrap fails closed across the owner boundary', async () => {
  const rows = personalRows('learner-owner');
  rows.personal_topic_official_placements[0].owner_id = 'second-learner';
  await assert.rejects(
    loadCreatorPersonalContent(loaderDatabase(rows), 'learner-owner'),
    /crossed the authenticated owner boundary/
  );
});

test('every personal command requires owner, capability, and matching source-qualified kind', () => {
  const learner = capabilities();
  const validCommands = [
    { type: 'create-topic', target: 'personal', ownerId: 'learner-owner', parentTopicKey: null },
    { type: 'create-concept', target: 'personal', ownerId: 'learner-owner', topicKey: 'personal:topic:topic-a' },
    { type: 'create-card', target: 'personal', ownerId: 'learner-owner', conceptKey: 'personal:concept:concept-a' },
    { type: 'update-topic', target: 'personal', ownerId: 'learner-owner', topicKey: 'personal:topic:topic-a' },
    { type: 'delete-topic', target: 'personal', ownerId: 'learner-owner', topicKey: 'personal:topic:topic-a' },
    { type: 'update-concept', target: 'personal', ownerId: 'learner-owner', conceptKey: 'personal:concept:concept-a' },
    { type: 'delete-concept', target: 'personal', ownerId: 'learner-owner', conceptKey: 'personal:concept:concept-a' },
    { type: 'update-card', target: 'personal', ownerId: 'learner-owner', cardKey: 'personal:card:card-a' },
    { type: 'delete-card', target: 'personal', ownerId: 'learner-owner', cardKey: 'personal:card:card-a' },
  ];
  for (const command of validCommands) {
    assert.match(resolveCreatorCommandRoute(command, learner), /^personal-/);
  }

  assert.throws(
    () => resolveCreatorCommandRoute({
      type: 'update-card', target: 'personal', ownerId: 'second-learner',
      cardKey: 'personal:card:card-a',
    }, learner),
    /only the signed-in owner/
  );
  assert.throws(
    () => resolveCreatorCommandRoute({
      type: 'create-card', target: 'personal', ownerId: 'learner-owner',
      conceptKey: 'official:concept:concept-a',
    }, learner),
    /requires a personal concept identity/
  );
  assert.throws(
    () => resolveCreatorCommandRoute({
      type: 'update-concept', target: 'personal', ownerId: 'learner-owner',
      conceptKey: 'personal:card:card-a',
    }, learner),
    /requires a personal concept identity/
  );
});

test('staff personal commands remain on personal routes while official authority remains available', () => {
  for (const role of ['editor', 'admin']) {
    const staff = capabilities(role, `${role}-owner`);
    assert.equal(staff.official.saveConcept, true);
    assert.equal(staff.official.saveQuestion, true);
    assert.equal(resolveCreatorCommandRoute({
      type: 'update-concept', target: 'personal', ownerId: `${role}-owner`,
      conceptKey: 'personal:concept:concept-a',
    }, staff), 'personal-concept-owner-write');
    assert.equal(resolveCreatorCommandRoute({
      type: 'update-card', target: 'personal', ownerId: `${role}-owner`,
      cardKey: 'personal:card:card-a',
    }, staff), 'personal-card-owner-write');
  }
});

test('real Creator routes server-load personal data and pass one owner-qualified bootstrap', () => {
  for (const source of [newPageSource, editPageSource]) {
    assert.match(source, /loadCreatorPersonalContent/);
    assert.match(source, /initialPersonalContent=\{personalContent\}/);
  }
  assert.match(newPageSource, /Promise\.all/);
  assert.match(editPageSource, /Promise\.all/);
  assert.doesNotMatch(newPageSource + editPageSource, /service[_-]?role/i);
});

test('personal Concept and Card reuse the existing Content and Questions workspaces', () => {
  for (const heading of [
    '1. Concept / Explanation',
    '2. Topic Tree',
    '3. Selected Topics',
    '4. Sources / References',
    '1. Question / Answer',
    '3. Additional Options',
  ]) {
    assert.match(creatorSource, new RegExp(heading.replace(/[./]/g, '\\$&')));
  }
  for (const tab of ['content', 'questions', 'tags']) {
    assert.match(creatorSource, new RegExp(`'${tab}'`));
  }
  assert.doesNotMatch(creatorSource, /Browse\s*\|\s*Mine|Personal Decks/);
  assert.match(creatorSource, /activeCreatorTab === 'flagged'/);
  assert.doesNotMatch(
    creatorSource,
    /UnifiedCreatorPrototypeClient|from '@\/lib\/unified-creator-prototype'/
  );
});

test('creation source is explicit and personal unsupported metadata is never fabricated', () => {
  assert.match(creatorSource, /Create in/);
  assert.match(creatorSource, /Mine \(Personal\)/);
  assert.match(creatorSource, /Socrates \(Official\)/);
  assert.match(creatorSource, /Difficulty, Testing Angles, relationships, lifecycle, Tags, and version controls · Not applicable/);
  assert.match(creatorSource, /Difficulty · N\/A · Testing Angle · N\/A/);
  assert.match(creatorSource, /filters\.difficulty[\s\S]*filters\.tagId[\s\S]*return \[\]/);
  assert.doesNotMatch(creatorSource, /personal[^\n]{0,80}save_concept_with_prerequisites/i);
  assert.doesNotMatch(creatorSource, /personal[^\n]{0,80}save_question_with_relationships_v2/i);
});

test('personal Source Reference and overlay persistence use only existing owner paths', () => {
  assert.match(creatorSource, /\.from\('personal_concepts'\)/);
  assert.match(creatorSource, /\.from\('personal_cards'\)/);
  assert.match(creatorSource, /source_reference/);
  assert.match(creatorSource, /sourceReference \|\| null/);
  assert.match(creatorSource, /create_personal_concept_overlay/);
  assert.match(creatorSource, /personal_concept_official_placements/);
  assert.match(creatorSource, /Personal Concepts have one canonical personal Topic/);
  assert.match(creatorSource, /Sources catalog is not applicable to personal material/);
});

test('mixed browse and search identities are qualified against raw UUID collisions', () => {
  assert.match(creatorSource, /createCreatorEntityKey\('official', 'concept'/);
  assert.match(creatorSource, /createCreatorEntityKey\('personal', 'concept'/);
  assert.match(creatorSource, /`\$\{question\.source\}:\$\{question\.id\}`/);
  assert.match(creatorSource, /questionsById\.set\(`official:\$\{question\.id\}`/);
  assert.match(creatorSource, /questionsById\.set\(`personal:\$\{card\.id\}`/);
  assert.match(creatorSource, /question\.source === 'personal' && question\.id === savedCard\.id/);
});

test('personal mutations are owner-qualified and initial content is owner-validated', () => {
  assert.match(creatorSource, /initialPersonalContent\.ownerId !== creatorCapabilities\.subject\.userId/);
  assert.match(creatorSource, /\.eq\('owner_id', initialPersonalContent\.ownerId\)/);
  assert.match(creatorSource, /\.eq\('owner_id', ownerId\)/);
  assert.match(creatorSource, /resolveCreatorCommandRoute/);
});
