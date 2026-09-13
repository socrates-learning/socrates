import type { CreatorCapabilityManifest } from '@/lib/creator-capabilities';
import {
  assertCreatorEntityIdentity,
  createCreatorEntityKey,
  type CreatorEntityIdentity,
  type OfficialConceptKey,
  type OfficialQuestionKey,
  type OfficialTopicKey,
  type PersonalConceptKey,
  type PersonalCardKey,
  type PersonalTopicKey,
} from '@/lib/creator-entity-contracts';

export type OfficialConceptIdentity = Readonly<{
  source: 'official';
  kind: 'concept';
  id: string;
  key: OfficialConceptKey;
}>;

export type PersonalConceptIdentity = Readonly<{
  source: 'personal';
  kind: 'concept';
  id: string;
  key: PersonalConceptKey;
}>;

export type OfficialQuestionIdentity = Readonly<{
  source: 'official';
  kind: 'question';
  id: string;
  key: OfficialQuestionKey;
}>;

export type PersonalCardIdentity = Readonly<{
  source: 'personal';
  kind: 'card';
  id: string;
  key: PersonalCardKey;
}>;

export type PersonalTopicIdentity = Readonly<{
  source: 'personal';
  kind: 'topic';
  id: string;
  key: PersonalTopicKey;
}>;

export type CreatorConceptEditorState =
  | Readonly<{
      mode: 'official-concept';
      identity: OfficialConceptIdentity;
      libraryId: string;
    }>
  | Readonly<{
      mode: 'personal-concept';
      identity: PersonalConceptIdentity;
      ownerId: string;
    }>
  | Readonly<{
      mode: 'new-official-concept';
      source: 'official';
      kind: 'concept';
      libraryId: string;
    }>
  | Readonly<{
      mode: 'new-personal-concept';
      source: 'personal';
      kind: 'concept';
      ownerId: string;
    }>
  | Readonly<{ mode: 'none' }>;

export type CreatorQuestionEditorState =
  | Readonly<{
      mode: 'official-question';
      identity: OfficialQuestionIdentity;
      libraryId: string;
    }>
  | Readonly<{
      mode: 'personal-card';
      identity: PersonalCardIdentity;
      ownerId: string;
    }>
  | Readonly<{
      mode: 'new-official-question';
      source: 'official';
      kind: 'question';
      libraryId: string;
    }>
  | Readonly<{
      mode: 'new-personal-card';
      source: 'personal';
      kind: 'card';
      ownerId: string;
    }>
  | Readonly<{ mode: 'none' }>;

export type OfficialConceptEditorState = Extract<
  CreatorConceptEditorState,
  { mode: 'official-concept' | 'new-official-concept' }
>;

export type OfficialQuestionEditorState = Extract<
  CreatorQuestionEditorState,
  { mode: 'official-question' | 'new-official-question' }
>;

function officialIdentity(
  kind: 'concept',
  id: string
): OfficialConceptIdentity;
function officialIdentity(
  kind: 'question',
  id: string
): OfficialQuestionIdentity;
function officialIdentity(kind: 'topic', id: string): OfficialTopicIdentity;
function officialIdentity(
  kind: 'concept' | 'question' | 'topic',
  id: string
): OfficialConceptIdentity | OfficialQuestionIdentity | OfficialTopicIdentity {
  return Object.freeze({
    source: 'official',
    kind,
    id,
    key: createCreatorEntityKey('official', kind, id),
  }) as OfficialConceptIdentity | OfficialQuestionIdentity | OfficialTopicIdentity;
}

function personalIdentity(kind: 'concept', id: string): PersonalConceptIdentity;
function personalIdentity(kind: 'card', id: string): PersonalCardIdentity;
function personalIdentity(kind: 'topic', id: string): PersonalTopicIdentity;
function personalIdentity(
  kind: 'concept' | 'card' | 'topic',
  id: string
): PersonalConceptIdentity | PersonalCardIdentity | PersonalTopicIdentity {
  return Object.freeze({
    source: 'personal',
    kind,
    id,
    key: createCreatorEntityKey('personal', kind, id),
  }) as PersonalConceptIdentity | PersonalCardIdentity | PersonalTopicIdentity;
}

export function createOfficialConceptEditorState(
  id: string | null,
  libraryId: string
): OfficialConceptEditorState {
  return id
    ? Object.freeze({
        mode: 'official-concept',
        identity: officialIdentity('concept', id),
        libraryId,
      })
    : Object.freeze({
        mode: 'new-official-concept',
        source: 'official',
        kind: 'concept',
        libraryId,
      });
}

export function createOfficialConceptIdentity(
  id: string
): OfficialConceptIdentity {
  return officialIdentity('concept', id);
}

export function createPersonalConceptEditorState(
  id: string | null,
  ownerId: string
): Extract<
  CreatorConceptEditorState,
  { mode: 'personal-concept' | 'new-personal-concept' }
> {
  return id
    ? Object.freeze({
        mode: 'personal-concept',
        identity: personalIdentity('concept', id),
        ownerId,
      })
    : Object.freeze({
        mode: 'new-personal-concept',
        source: 'personal',
        kind: 'concept',
        ownerId,
      });
}

export function createPersonalConceptIdentity(
  id: string
): PersonalConceptIdentity {
  return personalIdentity('concept', id);
}

export function createOfficialQuestionEditorState(
  id: string | null,
  libraryId: string
): OfficialQuestionEditorState {
  return id
    ? Object.freeze({
        mode: 'official-question',
        identity: officialIdentity('question', id),
        libraryId,
      })
    : Object.freeze({
        mode: 'new-official-question',
        source: 'official',
        kind: 'question',
        libraryId,
      });
}

export function createOfficialQuestionIdentity(
  id: string
): OfficialQuestionIdentity {
  return officialIdentity('question', id);
}

export function createPersonalCardEditorState(
  id: string | null,
  ownerId: string
): Extract<
  CreatorQuestionEditorState,
  { mode: 'personal-card' | 'new-personal-card' }
> {
  return id
    ? Object.freeze({
        mode: 'personal-card',
        identity: personalIdentity('card', id),
        ownerId,
      })
    : Object.freeze({
        mode: 'new-personal-card',
        source: 'personal',
        kind: 'card',
        ownerId,
      });
}

export function createPersonalCardIdentity(id: string): PersonalCardIdentity {
  return personalIdentity('card', id);
}

export function officialConceptId(
  state: CreatorConceptEditorState
): string | null {
  return state.mode === 'official-concept' ? state.identity.id : null;
}

export function officialQuestionId(
  state: CreatorQuestionEditorState
): string | null {
  return state.mode === 'official-question' ? state.identity.id : null;
}

export function personalConceptId(
  state: CreatorConceptEditorState
): string | null {
  return state.mode === 'personal-concept' ? state.identity.id : null;
}

export function personalCardId(
  state: CreatorQuestionEditorState
): string | null {
  return state.mode === 'personal-card' ? state.identity.id : null;
}

export function isConceptEditorIdentity(
  state: CreatorConceptEditorState,
  source: 'official' | 'personal',
  id: string
): boolean {
  return source === 'official'
    ? state.mode === 'official-concept' && state.identity.id === id
    : state.mode === 'personal-concept' && state.identity.id === id;
}

export function isQuestionEditorIdentity(
  state: CreatorQuestionEditorState,
  source: 'official' | 'personal',
  id: string
): boolean {
  return source === 'official'
    ? state.mode === 'official-question' && state.identity.id === id
    : state.mode === 'personal-card' && state.identity.id === id;
}

export function conceptEditorIdentityKey(
  state: CreatorConceptEditorState
): string {
  switch (state.mode) {
    case 'official-concept':
    case 'personal-concept':
      return state.identity.key;
    case 'new-official-concept':
      return `official:concept:new:${state.libraryId}`;
    case 'new-personal-concept':
      return `personal:concept:new:${state.ownerId}`;
    case 'none':
      return 'none';
  }
}

export function questionEditorIdentityKey(
  state: CreatorQuestionEditorState
): string {
  switch (state.mode) {
    case 'official-question':
    case 'personal-card':
      return state.identity.key;
    case 'new-official-question':
      return `official:question:new:${state.libraryId}`;
    case 'new-personal-card':
      return `personal:card:new:${state.ownerId}`;
    case 'none':
      return 'none';
  }
}

export type SynchronousMutationLock = { current: boolean };

export function tryAcquireMutationLock(lock: SynchronousMutationLock): boolean {
  if (lock.current) return false;
  lock.current = true;
  return true;
}

export function releaseMutationLock(lock: SynchronousMutationLock): void {
  lock.current = false;
}

export type CreatorStudioPresentationAuthority = Readonly<{
  source: 'official';
  subjectId: string;
  role: 'learner' | 'editor' | 'admin';
  activeLibraryId: string;
  canBrowsePublished: true;
  canReadUnpublished: boolean;
  canSaveConcept: boolean;
  canSaveQuestion: boolean;
  canManageTopicTree: boolean;
  canManageTags: boolean;
  canManagePrerequisites: boolean;
  canManageFormalSources: boolean;
}>;

export function createOfficialCreatorPresentationAuthority(
  capabilities: CreatorCapabilityManifest,
  activeLibraryId: string
): CreatorStudioPresentationAuthority {
  const role = capabilities.subject.role;
  const official = capabilities.official;
  if (
    capabilities.library.activeLibraryId !== activeLibraryId ||
    !capabilities.library.canAccessActiveLibrary ||
    !official.browsePublished
  ) {
    throw new Error('Creator Studio requires verified read authority for the active Library.');
  }

  return Object.freeze({
    source: 'official',
    subjectId: capabilities.subject.userId,
    role,
    activeLibraryId,
    canBrowsePublished: true,
    canReadUnpublished: official.readUnpublished,
    canSaveConcept: official.saveConcept,
    canSaveQuestion: official.saveQuestion,
    canManageTopicTree: official.manageTopicTree,
    canManageTags: official.manageTags,
    canManagePrerequisites: official.managePrerequisites,
    canManageFormalSources: official.manageFormalSources,
  });
}

export type OfficialTopicIdentity = Readonly<{
  source: 'official';
  kind: 'topic';
  id: string;
  key: OfficialTopicKey;
}>;

export function createOfficialTopicIdentity(id: string): OfficialTopicIdentity {
  return officialIdentity('topic', id);
}

export function createPersonalTopicIdentity(id: string): PersonalTopicIdentity {
  return personalIdentity('topic', id);
}

export type OfficialCreatorCommand =
  | Readonly<{
      type: 'save-concept';
      state: CreatorConceptEditorState;
      libraryId: string;
      placementTopics: readonly OfficialTopicIdentity[];
      includes: readonly ('prerequisites' | 'formal-sources' | 'tags')[];
    }>
  | Readonly<{
      type: 'save-question';
      state: CreatorQuestionEditorState;
      libraryId: string;
      primaryConcept: OfficialConceptIdentity;
      relatedConcepts: readonly OfficialConceptIdentity[];
      includes: readonly ('relationships' | 'testing-angles' | 'tags')[];
    }>
  | Readonly<{
      type: 'create-topic';
      libraryId: string;
      parent: OfficialTopicIdentity;
    }>
  | Readonly<{
      type: 'rename-topic' | 'move-topic';
      libraryId: string;
      topic: OfficialTopicIdentity;
    }>
  | Readonly<{
      type: 'inspect-delete' | 'delete-content';
      recordType: 'library_node' | 'concept' | 'question' | 'tag';
      identity?: OfficialTopicIdentity | OfficialConceptIdentity | OfficialQuestionIdentity;
    }>
  | Readonly<{
      type: 'create-tag' | 'rename-tag' | 'archive-tag' | 'reactivate-tag';
    }>;

type CreatorStudioRpc =
  | 'save_concept_with_prerequisites'
  | 'save_question_with_relationships_v2'
  | 'create_library_node_in_library'
  | 'rename_library_node_in_library'
  | 'move_library_node_in_library'
  | 'get_development_delete_summary'
  | 'delete_development_content'
  | 'create_catalog_tag'
  | 'rename_catalog_tag'
  | 'archive_catalog_tag'
  | 'reactivate_catalog_tag';

export type ResolvedOfficialCreatorCommand = Readonly<{
  source: 'official';
  transport: 'supabase-rpc';
  rpc: CreatorStudioRpc;
}>;

function assertOfficialIdentity(
  identity: CreatorEntityIdentity,
  expectedKind: 'topic' | 'concept' | 'question'
) {
  assertCreatorEntityIdentity(identity);
  if (identity.source !== 'official' || identity.kind !== expectedKind) {
    throw new Error(`Official Creator command requires an official ${expectedKind} identity.`);
  }
}

function assertActiveLibrary(
  libraryId: string,
  authority: CreatorStudioPresentationAuthority
) {
  if (libraryId !== authority.activeLibraryId) {
    throw new Error('Official Creator command does not target the active Library.');
  }
}

function rpc(rpc: CreatorStudioRpc): ResolvedOfficialCreatorCommand {
  return Object.freeze({ source: 'official', transport: 'supabase-rpc', rpc });
}

function assertCommandCapability(
  allowed: boolean,
  commandName: string
) {
  if (!allowed) {
    throw new Error(`${commandName} is not permitted by this Creator Studio authority.`);
  }
}

function assertIncludes(
  actual: readonly string[],
  expected: readonly string[],
  commandName: string
) {
  const actualSet = new Set(actual);
  if (
    actualSet.size !== expected.length ||
    expected.some((item) => !actualSet.has(item))
  ) {
    throw new Error(`${commandName} command is missing required atomic content.`);
  }
}

function assertDeleteIdentity(
  command: Extract<
    OfficialCreatorCommand,
    { type: 'inspect-delete' | 'delete-content' }
  >
) {
  if (command.recordType === 'tag') {
    if (command.identity) {
      throw new Error('Global Tag deletion does not accept a content identity.');
    }
    return;
  }

  if (!command.identity) {
    throw new Error(`${command.recordType} deletion requires a source-qualified identity.`);
  }

  const expectedKind =
    command.recordType === 'library_node'
      ? 'topic'
      : command.recordType;
  assertOfficialIdentity(command.identity, expectedKind);
}

export function resolveOfficialCreatorCommand(
  command: OfficialCreatorCommand,
  authority: CreatorStudioPresentationAuthority
): ResolvedOfficialCreatorCommand {
  switch (command.type) {
    case 'save-concept':
      assertCommandCapability(authority.canSaveConcept, 'Official Concept save');
      assertActiveLibrary(command.libraryId, authority);
      if (
        command.state.mode !== 'official-concept' &&
        command.state.mode !== 'new-official-concept'
      ) {
        throw new Error('Personal Concept state cannot dispatch an official Concept save.');
      }
      if (command.state.mode === 'official-concept') {
        assertOfficialIdentity(command.state.identity, 'concept');
      }
      assertActiveLibrary(command.state.libraryId, authority);
      command.placementTopics.forEach((topic) => assertOfficialIdentity(topic, 'topic'));
      assertIncludes(
        command.includes,
        ['prerequisites', 'formal-sources', 'tags'],
        'Official Concept save'
      );
      return rpc('save_concept_with_prerequisites');

    case 'save-question':
      assertCommandCapability(authority.canSaveQuestion, 'Official Question save');
      assertActiveLibrary(command.libraryId, authority);
      if (
        command.state.mode !== 'official-question' &&
        command.state.mode !== 'new-official-question'
      ) {
        throw new Error('Personal Card state cannot dispatch an official Question save.');
      }
      if (command.state.mode === 'official-question') {
        assertOfficialIdentity(command.state.identity, 'question');
      }
      assertActiveLibrary(command.state.libraryId, authority);
      assertOfficialIdentity(command.primaryConcept, 'concept');
      command.relatedConcepts.forEach((concept) =>
        assertOfficialIdentity(concept, 'concept')
      );
      assertIncludes(
        command.includes,
        ['relationships', 'testing-angles', 'tags'],
        'Official Question save'
      );
      return rpc('save_question_with_relationships_v2');

    case 'create-topic':
      assertCommandCapability(authority.canManageTopicTree, 'Official Topic creation');
      assertActiveLibrary(command.libraryId, authority);
      assertOfficialIdentity(command.parent, 'topic');
      return rpc('create_library_node_in_library');

    case 'rename-topic':
      assertCommandCapability(authority.canManageTopicTree, 'Official Topic rename');
      assertActiveLibrary(command.libraryId, authority);
      assertOfficialIdentity(command.topic, 'topic');
      return rpc('rename_library_node_in_library');

    case 'move-topic':
      assertCommandCapability(authority.canManageTopicTree, 'Official Topic move');
      assertActiveLibrary(command.libraryId, authority);
      assertOfficialIdentity(command.topic, 'topic');
      return rpc('move_library_node_in_library');

    case 'inspect-delete':
      assertCommandCapability(
        command.recordType === 'tag'
          ? authority.canManageTags
          : command.recordType === 'question'
            ? authority.canSaveQuestion
            : command.recordType === 'concept'
              ? authority.canSaveConcept
              : authority.canManageTopicTree,
        'Official content deletion inspection'
      );
      assertDeleteIdentity(command);
      return rpc('get_development_delete_summary');

    case 'delete-content':
      assertCommandCapability(
        command.recordType === 'tag'
          ? authority.canManageTags
          : command.recordType === 'question'
            ? authority.canSaveQuestion
            : command.recordType === 'concept'
              ? authority.canSaveConcept
              : authority.canManageTopicTree,
        'Official content deletion'
      );
      assertDeleteIdentity(command);
      return rpc('delete_development_content');

    case 'create-tag':
      assertCommandCapability(authority.canManageTags, 'Tag creation');
      return rpc('create_catalog_tag');
    case 'rename-tag':
      assertCommandCapability(authority.canManageTags, 'Tag rename');
      return rpc('rename_catalog_tag');
    case 'archive-tag':
      assertCommandCapability(authority.canManageTags, 'Tag archive');
      return rpc('archive_catalog_tag');
    case 'reactivate-tag':
      assertCommandCapability(authority.canManageTags, 'Tag reactivation');
      return rpc('reactivate_catalog_tag');
  }
}
