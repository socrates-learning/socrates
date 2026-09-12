import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  assertCreatorEntityIdentity,
  assertTopicParentCompatibility,
  createCreatorEntityKey,
  parseCreatorEntityKey,
} from '../lib/creator-entity-contracts.ts';
import { deriveCreatorCapabilities } from '../lib/creator-capabilities.ts';
import { resolveCreatorCommandRoute } from '../lib/creator-command-contracts.ts';

const creatorClientSource = readFileSync(
  new URL('../components/CreatorStudioV2Client.tsx', import.meta.url),
  'utf8'
);
const studyCreatorClientSource = readFileSync(
  new URL('../components/StudyCreatorClient.tsx', import.meta.url),
  'utf8'
);
const creatorLayoutSource = readFileSync(
  new URL('../app/creator/layout.tsx', import.meta.url),
  'utf8'
);
const studyCreatorPageSource = readFileSync(
  new URL('../app/study-creator/page.tsx', import.meta.url),
  'utf8'
);
const primitiveSource = readFileSync(
  new URL('../components/creator/CreatorPresentationPrimitives.tsx', import.meta.url),
  'utf8'
);
const serverCapabilitySource = readFileSync(
  new URL('../lib/server-creator-capabilities.ts', import.meta.url),
  'utf8'
);

const library = Object.freeze({
  activeLibraryId: 'library-a',
  canAccessActiveLibrary: true,
  canManageActiveLibrary: true,
});

function capabilities(role, userId = `${role}-user`) {
  return deriveCreatorCapabilities({ role, userId, library });
}

test('source-qualified keys reject bare and impossible source/kind identities', () => {
  assert.equal(
    createCreatorEntityKey('official', 'concept', 'concept-a'),
    'official:concept:concept-a'
  );
  assert.deepEqual(
    parseCreatorEntityKey('personal:card:card-a'),
    {
      source: 'personal',
      kind: 'card',
      id: 'card-a',
      key: 'personal:card:card-a',
    }
  );
  assert.throws(() => parseCreatorEntityKey('concept-a'), /source-qualified/);
  assert.throws(() => parseCreatorEntityKey('personal:question:question-a'), /source-qualified/);
  assert.throws(
    () =>
      assertCreatorEntityIdentity({
        source: 'official',
        kind: 'concept',
        id: 'concept-a',
        key: 'personal:concept:concept-a',
      }),
    /does not match/
  );
});

test('Topic adapter boundary forbids official/personal cross-parentage', () => {
  const officialParent = {
    source: 'official',
    kind: 'topic',
    id: 'official-parent',
    key: 'official:topic:official-parent',
    name: 'Official parent',
    parentKey: null,
    sortOrder: 0,
    ownership: { type: 'official', libraryId: 'library-a' },
  };
  const personalChild = {
    source: 'personal',
    kind: 'topic',
    id: 'personal-child',
    key: 'personal:topic:personal-child',
    name: 'Personal child',
    parentKey: 'personal:topic:personal-parent',
    sortOrder: 0,
    ownership: { type: 'personal', ownerId: 'learner-user' },
  };

  assert.throws(
    () => assertTopicParentCompatibility(personalChild, officialParent),
    /cannot share a parent/
  );
});

test('learner receives published browse and own-personal capabilities only', () => {
  const manifest = capabilities('learner');

  assert.equal(manifest.official.browsePublished, true);
  assert.equal(manifest.official.readUnpublished, false);
  assert.equal(manifest.official.saveConcept, false);
  assert.equal(manifest.official.saveQuestion, false);
  assert.equal(manifest.official.publishContent, false);
  assert.equal(manifest.official.manageTopicTree, false);
  assert.equal(manifest.official.manageTags, false);
  assert.equal(manifest.official.managePrerequisites, false);
  assert.equal(manifest.official.manageFormalSources, false);
  assert.equal(manifest.official.manageLibraries, false);
  assert.equal(manifest.official.manageArticles, false);
  assert.equal(manifest.personal.createTopic, true);
  assert.equal(manifest.personal.createConcept, true);
  assert.equal(manifest.personal.createCard, true);
  assert.equal(manifest.personal.editOwnContent, true);
  assert.equal(manifest.personal.deleteOwnContent, true);
  assert.equal(manifest.personal.createOfficialContextOverlay, true);
  assert.equal(manifest.personal.managePersonalDecks, true);
  assert.equal(manifest.personal.manageFlags, true);
  assert.equal(manifest.administration.manageUsersAndRoles, false);
});

test('editor retains current official authoring while administration stays admin-only', () => {
  const manifest = capabilities('editor');

  assert.ok(Object.values(manifest.official).every(Boolean));
  assert.ok(Object.values(manifest.personal).every(Boolean));
  assert.equal(manifest.administration.manageUsersAndRoles, false);
  assert.equal(manifest.administration.manageLibraryMemberships, false);
});

test('admin adds user and membership administration without cross-user personal authority', () => {
  const manifest = capabilities('admin', 'admin-user');

  assert.ok(Object.values(manifest.official).every(Boolean));
  assert.equal(manifest.administration.manageUsersAndRoles, true);
  assert.equal(manifest.administration.manageLibraryMemberships, true);
  assert.throws(
    () =>
      resolveCreatorCommandRoute(
        {
          type: 'create-card',
          target: 'personal',
          ownerId: 'another-user',
          conceptKey: 'personal:concept:concept-a',
        },
        manifest
      ),
    /only the signed-in owner/
  );
});

test('capability manifest is deeply immutable and Library-contextual authoring fails closed', () => {
  const manifest = deriveCreatorCapabilities({
    role: 'editor',
    userId: 'editor-user',
    library: {
      activeLibraryId: null,
      canAccessActiveLibrary: false,
      canManageActiveLibrary: false,
    },
  });

  assert.equal(Object.isFrozen(manifest), true);
  assert.equal(Object.isFrozen(manifest.official), true);
  assert.equal(Object.isFrozen(manifest.personal), true);
  assert.equal(manifest.official.saveConcept, false);
  assert.equal(manifest.official.manageTags, true);
  assert.equal(manifest.official.manageLibraries, true);
});

test('command routing keeps targets explicit for every role', () => {
  const learner = capabilities('learner', 'learner-user');
  const editor = capabilities('editor', 'editor-user');

  assert.throws(
    () =>
      resolveCreatorCommandRoute(
        {
          type: 'create-concept',
          target: 'official',
          libraryId: 'library-a',
          topicKeys: ['official:topic:topic-a'],
        },
        learner
      ),
    /not permitted/
  );
  assert.equal(
    resolveCreatorCommandRoute(
      {
        type: 'create-concept',
        target: 'personal',
        ownerId: 'editor-user',
        topicKey: 'personal:topic:topic-a',
      },
      editor
    ),
    'personal-concept-owner-write'
  );
  assert.equal(
    resolveCreatorCommandRoute(
      {
        type: 'create-question',
        target: 'official',
        libraryId: 'library-a',
        conceptKey: 'official:concept:concept-a',
      },
      editor
    ),
    'official-question-versioned-save'
  );
});

test('personal Card contract has no official Question-only metadata', () => {
  const personalCard = {
    source: 'personal',
    kind: 'card',
    id: 'card-a',
    key: 'personal:card:card-a',
    question: 'Question',
    answer: 'Answer',
    conceptKey: 'personal:concept:concept-a',
    sourceReference: null,
    ownership: { type: 'personal', ownerId: 'learner-user' },
    workflow: { type: 'owner-managed' },
  };

  assert.equal('difficulty' in personalCard, false);
  assert.equal('testingAngles' in personalCard, false);
  assert.equal('relatedConceptKeys' in personalCard, false);
  assert.equal('lifecycle' in personalCard, false);
});

test('server capability boundary reuses resolved context and never accepts a browser manifest', () => {
  assert.match(serverCapabilitySource, /import 'server-only'/);
  assert.match(serverCapabilitySource, /activeLibraryContext \?\?/);
  assert.match(serverCapabilitySource, /getVerifiedRequestAuthContext\(\)/);
  assert.doesNotMatch(serverCapabilitySource, /manifest\s*:/);
});

test('shared presentation primitives retain explicit accessibility semantics', () => {
  assert.match(primitiveSource, /role="tablist"/);
  assert.match(primitiveSource, /role="tab"/);
  assert.match(primitiveSource, /aria-selected=/);
  assert.match(primitiveSource, /aria-controls=/);
  assert.match(primitiveSource, /aria-current=/);
  assert.match(primitiveSource, /role=\{tone === 'error' \? 'alert' : 'status'\}/);
  assert.match(primitiveSource, /aria-modal="true"/);
  assert.match(primitiveSource, /aria-labelledby=\{titleId\}/);
  assert.match(primitiveSource, /aria-label=\{`Close \$\{title\}`\}/);
  assert.match(primitiveSource, /event\.key === 'Escape'/);
  assert.match(primitiveSource, /event\.key !== 'Tab'/);
  assert.match(primitiveSource, /previousFocus\?\.focus\(\)/);
  assert.match(primitiveSource, /role="menu"/);
});

test('existing Creator routes and clients remain separate and do not import the foundation', () => {
  assert.match(creatorLayoutSource, /role !== 'admin' && role !== 'editor'/);
  assert.match(
    studyCreatorPageSource,
    /roleData\?\.role !== 'learner'[\s\S]*roleData\?\.role !== 'editor'[\s\S]*roleData\?\.role !== 'admin'/
  );
  assert.doesNotMatch(creatorClientSource, /CreatorPresentationPrimitives|creator-capabilities/);
  assert.doesNotMatch(studyCreatorClientSource, /CreatorPresentationPrimitives|creator-capabilities/);
});
