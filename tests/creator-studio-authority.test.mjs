import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { deriveCreatorCapabilities } from '../lib/creator-capabilities.ts';
import * as entityContracts from '../lib/creator-entity-contracts.ts';

const runtimeSource = readFileSync(
  new URL('../lib/creator-studio-runtime.ts', import.meta.url),
  'utf8'
);
const runtimeContext = {
  exports: {},
  require(name) {
    if (name === '@/lib/creator-entity-contracts') return entityContracts;
    if (name === '@/lib/creator-capabilities') return {};
    throw new Error(`Unexpected runtime import: ${name}`);
  },
};
vm.runInNewContext(
  ts.transpileModule(runtimeSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  runtimeContext
);
const {
  createOfficialConceptEditorState,
  createOfficialConceptIdentity,
  createOfficialCreatorPresentationAuthority,
  createOfficialQuestionEditorState,
  createOfficialQuestionIdentity,
  createOfficialTopicIdentity,
  createPersonalCardEditorState,
  createPersonalConceptEditorState,
  createPersonalTopicIdentity,
  officialConceptId,
  officialQuestionId,
  personalCardId,
  personalConceptId,
  resolveOfficialCreatorCommand,
} = runtimeContext.exports;
const { createCreatorEntityKey } = entityContracts;

const activeLibraryId = 'library-a';
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
function staffCapabilities(role = 'editor') {
  return deriveCreatorCapabilities({
    role,
    userId: `${role}-user`,
    library: {
      activeLibraryId,
      canAccessActiveLibrary: true,
      canManageActiveLibrary: true,
    },
  });
}

function learnerCapabilities() {
  return deriveCreatorCapabilities({
    role: 'learner',
    userId: 'learner-user',
    library: {
      activeLibraryId,
      canAccessActiveLibrary: true,
      canManageActiveLibrary: false,
    },
  });
}

function authority(role = 'editor') {
  return createOfficialCreatorPresentationAuthority(
    staffCapabilities(role),
    activeLibraryId
  );
}

test('official Concept and Question editor states use source-qualified identities', () => {
  const concept = createOfficialConceptEditorState('same-id', activeLibraryId);
  const question = createOfficialQuestionEditorState('question-a', activeLibraryId);
  const newConcept = createOfficialConceptEditorState(null, activeLibraryId);
  const newQuestion = createOfficialQuestionEditorState(null, activeLibraryId);

  assert.equal(concept.mode, 'official-concept');
  assert.equal(concept.identity.key, 'official:concept:same-id');
  assert.equal(officialConceptId(concept), 'same-id');
  assert.equal(question.mode, 'official-question');
  assert.equal(question.identity.key, 'official:question:question-a');
  assert.equal(officialQuestionId(question), 'question-a');
  assert.deepEqual(JSON.parse(JSON.stringify(newConcept)), {
    mode: 'new-official-concept',
    source: 'official',
    kind: 'concept',
    libraryId: activeLibraryId,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(newQuestion)), {
    mode: 'new-official-question',
    source: 'official',
    kind: 'question',
    libraryId: activeLibraryId,
  });
});

test('same raw UUID cannot collide across source-qualified future identities', () => {
  assert.notEqual(
    createCreatorEntityKey('official', 'concept', 'same-id'),
    createCreatorEntityKey('personal', 'concept', 'same-id')
  );
});

test('server pages derive capabilities from the already-resolved trusted Library context', () => {
  for (const source of [newPageSource, editPageSource]) {
    assert.match(source, /resolveActiveLibraryContext\(\{ failOnQueryError: true \}\)/);
    assert.match(source, /getServerCreatorCapabilityManifest\(\{\s*activeLibraryContext: context/);
    assert.match(source, /creatorCapabilities=\{capabilities\}/);
  }
});

test('editor and admin capabilities preserve current official presentation authority', () => {
  for (const role of ['editor', 'admin']) {
    const manifest = staffCapabilities(role);
    const presentation = authority(role);

    assert.equal(presentation.role, role);
    assert.equal(presentation.source, 'official');
    assert.equal(presentation.activeLibraryId, activeLibraryId);
    assert.equal(presentation.canSaveConcept, manifest.official.saveConcept);
    assert.equal(presentation.canSaveQuestion, manifest.official.saveQuestion);
    assert.equal(presentation.canManageTopicTree, true);
    assert.equal(presentation.canManageTags, true);
  }
});

test('learner presentation authority is published-only and has no official mutation capability', () => {
  const presentation = createOfficialCreatorPresentationAuthority(
    learnerCapabilities(),
    activeLibraryId
  );

  assert.equal(presentation.role, 'learner');
  assert.equal(presentation.canBrowsePublished, true);
  assert.equal(presentation.canReadUnpublished, false);
  assert.equal(presentation.canSaveConcept, false);
  assert.equal(presentation.canSaveQuestion, false);
  assert.equal(presentation.canManageTopicTree, false);
  assert.equal(presentation.canManageTags, false);
  assert.equal(presentation.canManagePrerequisites, false);
  assert.equal(presentation.canManageFormalSources, false);
});

test('learner authority denies every official command before an RPC target is returned', () => {
  const learner = createOfficialCreatorPresentationAuthority(
    learnerCapabilities(),
    activeLibraryId
  );
  const conceptState = createOfficialConceptEditorState('concept-a', activeLibraryId);
  const questionState = createOfficialQuestionEditorState('question-a', activeLibraryId);
  const topic = createOfficialTopicIdentity('topic-a');
  const concept = createOfficialConceptIdentity('concept-a');
  const question = createOfficialQuestionIdentity('question-a');
  const commands = [
    {
      type: 'save-concept', state: conceptState, libraryId: activeLibraryId,
      placementTopics: [topic], includes: ['prerequisites', 'formal-sources', 'tags'],
    },
    {
      type: 'save-question', state: questionState, libraryId: activeLibraryId,
      primaryConcept: concept, relatedConcepts: [], includes: ['relationships', 'testing-angles', 'tags'],
    },
    { type: 'create-topic', libraryId: activeLibraryId, parent: topic },
    { type: 'rename-topic', libraryId: activeLibraryId, topic },
    { type: 'move-topic', libraryId: activeLibraryId, topic },
    { type: 'inspect-delete', recordType: 'library_node', identity: topic },
    { type: 'delete-content', recordType: 'library_node', identity: topic },
    { type: 'delete-content', recordType: 'concept', identity: concept },
    { type: 'delete-content', recordType: 'question', identity: question },
    { type: 'delete-content', recordType: 'tag' },
    { type: 'create-tag' },
    { type: 'rename-tag' },
    { type: 'archive-tag' },
    { type: 'reactivate-tag' },
  ];

  for (const command of commands) {
    assert.throws(
      () => resolveOfficialCreatorCommand(command, learner),
      /not permitted by this Creator Studio authority/
    );
  }
});

test('learner data paths are published-only while staff authoring RPCs remain unchanged', () => {
  assert.match(creatorSource, /if \(isLearnerReadOnly\)/);
  assert.match(creatorSource, /\.eq\('status', 'published'\)/);
  assert.match(creatorSource, /\.eq\('concepts\.status', 'published'\)/);
  assert.match(creatorSource, /concepts!questions_concept_id_fkey!inner/);
  assert.match(creatorSource, /prompt, explanation, difficulty/);
  assert.match(creatorSource, /supabase\.rpc\('get_concept_prerequisites'/);
  assert.match(creatorSource, /supabase\.rpc\('search_creator_questions'/);
  assert.match(creatorSource, /supabase\.rpc\('get_creator_questions'/);
});

test('learner mode exposes read-only and disabled semantics without changing the shared tabs', () => {
  assert.match(creatorSource, /readOnly=\{isLearnerReadOnly\}/);
  assert.match(creatorSource, /disabled=\{isLearnerReadOnly \|\| isSaving/);
  assert.match(creatorSource, /disabled=\{isLearnerReadOnly \|\| isSavingQuestion/);
  assert.match(creatorSource, /Published official content · read-only/);
  for (const label of ['Content', 'Questions', 'Tags', 'Flagged']) {
    assert.match(creatorSource, new RegExp(`'${label.toLowerCase()}'`));
  }
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
  assert.match(creatorSource, /aria-label="Question explanation"/);
});

test('official Concept dispatch preserves the atomic versioned save target', () => {
  const command = resolveOfficialCreatorCommand(
    {
      type: 'save-concept',
      state: createOfficialConceptEditorState('concept-a', activeLibraryId),
      libraryId: activeLibraryId,
      placementTopics: [createOfficialTopicIdentity('topic-a')],
      includes: ['prerequisites', 'formal-sources', 'tags'],
    },
    authority()
  );

  assert.deepEqual(JSON.parse(JSON.stringify(command)), {
    source: 'official',
    transport: 'supabase-rpc',
    rpc: 'save_concept_with_prerequisites',
  });
});

test('official Question dispatch preserves relationships and its versioned save target', () => {
  const command = resolveOfficialCreatorCommand(
    {
      type: 'save-question',
      state: createOfficialQuestionEditorState('question-a', activeLibraryId),
      libraryId: activeLibraryId,
      primaryConcept: createOfficialConceptIdentity('concept-a'),
      relatedConcepts: [createOfficialConceptIdentity('concept-b')],
      includes: ['relationships', 'testing-angles', 'tags'],
    },
    authority()
  );

  assert.equal(command.rpc, 'save_question_with_relationships_v2');
});

test('official Topic and Tag commands resolve only their existing RPCs', () => {
  const auth = authority();
  const topic = createOfficialTopicIdentity('topic-a');
  const commands = [
    [{
        type: 'create-topic',
        libraryId: activeLibraryId,
        parent: topic,
      }, 'create_library_node_in_library'],
    [{ type: 'rename-topic', libraryId: activeLibraryId, topic }, 'rename_library_node_in_library'],
    [{ type: 'move-topic', libraryId: activeLibraryId, topic }, 'move_library_node_in_library'],
    [{ type: 'inspect-delete', recordType: 'library_node', identity: topic }, 'get_development_delete_summary'],
    [{ type: 'delete-content', recordType: 'library_node', identity: topic }, 'delete_development_content'],
    [{ type: 'create-tag' }, 'create_catalog_tag'],
    [{ type: 'rename-tag' }, 'rename_catalog_tag'],
    [{ type: 'archive-tag' }, 'archive_catalog_tag'],
    [{ type: 'reactivate-tag' }, 'reactivate_catalog_tag'],
  ];

  for (const [command, expectedRpc] of commands) {
    assert.equal(resolveOfficialCreatorCommand(command, auth).rpc, expectedRpc);
  }
});

test('staff role never overrides selected source and personal states fail closed', () => {
  const personalConceptState = {
    mode: 'personal-concept',
    identity: {
      source: 'personal',
      kind: 'concept',
      id: 'concept-a',
      key: 'personal:concept:concept-a',
    },
    ownerId: 'editor-user',
  };
  const personalCardState = {
    mode: 'personal-card',
    identity: {
      source: 'personal',
      kind: 'card',
      id: 'card-a',
      key: 'personal:card:card-a',
    },
    ownerId: 'editor-user',
  };

  assert.throws(
    () =>
      resolveOfficialCreatorCommand(
        {
          type: 'save-concept',
          state: personalConceptState,
          libraryId: activeLibraryId,
          placementTopics: [createOfficialTopicIdentity('topic-a')],
          includes: ['prerequisites', 'formal-sources', 'tags'],
        },
        authority()
      ),
    /Personal Concept state cannot dispatch an official Concept save/
  );
  assert.throws(
    () =>
      resolveOfficialCreatorCommand(
        {
          type: 'save-question',
          state: personalCardState,
          libraryId: activeLibraryId,
          primaryConcept: createOfficialConceptIdentity('concept-a'),
          relatedConcepts: [],
          includes: ['relationships', 'testing-angles', 'tags'],
        },
        authority('admin')
      ),
    /Personal Card state cannot dispatch an official Question save/
  );
});

test('source/kind and active-Library mismatches fail before an RPC target is returned', () => {
  const concept = createOfficialConceptEditorState('concept-a', activeLibraryId);
  const invalidState = {
    ...concept,
    identity: {
      source: 'personal',
      kind: 'concept',
      id: 'concept-a',
      key: 'personal:concept:concept-a',
    },
  };

  assert.throws(
    () =>
      resolveOfficialCreatorCommand(
        {
          type: 'save-concept',
          state: invalidState,
          libraryId: activeLibraryId,
          placementTopics: [createOfficialTopicIdentity('topic-a')],
          includes: ['prerequisites', 'formal-sources', 'tags'],
        },
        authority()
      ),
    /official concept identity/
  );
  assert.throws(
    () =>
      resolveOfficialCreatorCommand(
        {
          type: 'create-topic',
          libraryId: 'library-b',
          parent: createOfficialTopicIdentity('topic-a'),
        },
        authority()
      ),
    /active Library/
  );
  assert.throws(
    () =>
      resolveOfficialCreatorCommand(
        {
          type: 'save-concept',
          state: createOfficialConceptEditorState('concept-a', 'library-b'),
          libraryId: activeLibraryId,
          placementTopics: [createOfficialTopicIdentity('topic-a')],
          includes: ['prerequisites', 'formal-sources', 'tags'],
        },
        authority()
      ),
    /active Library/
  );
});

test('current real Creator Studio activates personal states inside the same shared workspaces', () => {
  assert.match(creatorSource, /createOfficialConceptEditorState/);
  assert.match(creatorSource, /createOfficialQuestionEditorState/);
  assert.match(creatorSource, /createPersonalConceptEditorState/);
  assert.match(creatorSource, /createPersonalCardEditorState/);
  assert.match(creatorSource, /resolveOfficialCreatorCommand/);
  assert.match(creatorSource, /personal_topics/);
  assert.match(creatorSource, /personal_concepts/);
  assert.match(creatorSource, /personal_cards/);
  assert.match(creatorSource, /personal_concept_official_placements/);
  assert.doesNotMatch(
    creatorSource,
    /UnifiedCreatorPrototypeClient|@\/lib\/unified-creator-prototype/
  );
});

test('personal Concept, Card, and Topic editor states retain source-qualified identity', () => {
  const concept = createPersonalConceptEditorState('same-id', 'owner-a');
  const card = createPersonalCardEditorState('same-id', 'owner-a');
  const topic = createPersonalTopicIdentity('same-id');

  assert.equal(concept.mode, 'personal-concept');
  assert.equal(concept.identity.key, 'personal:concept:same-id');
  assert.equal(personalConceptId(concept), 'same-id');
  assert.equal(card.mode, 'personal-card');
  assert.equal(card.identity.key, 'personal:card:same-id');
  assert.equal(personalCardId(card), 'same-id');
  assert.equal(topic.key, 'personal:topic:same-id');
});
