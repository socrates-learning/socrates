import type { CreatorCapabilityManifest } from '@/lib/creator-capabilities';
import type {
  OfficialConceptKey,
  OfficialTopicKey,
  PersonalCardKey,
  PersonalConceptKey,
  PersonalTopicKey,
} from '@/lib/creator-entity-contracts';

export type CreatorCommand =
  | Readonly<{
      type: 'create-topic';
      target: 'personal';
      ownerId: string;
      parentTopicKey: PersonalTopicKey | null;
    }>
  | Readonly<{
      type: 'create-concept';
      target: 'official';
      libraryId: string;
      topicKeys: readonly OfficialTopicKey[];
    }>
  | Readonly<{
      type: 'create-concept';
      target: 'personal';
      ownerId: string;
      topicKey: PersonalTopicKey;
    }>
  | Readonly<{
      type: 'create-concept-overlay';
      target: 'personal';
      ownerId: string;
      officialTopicKey: OfficialTopicKey;
      officialConceptKey: OfficialConceptKey | null;
    }>
  | Readonly<{
      type: 'create-question';
      target: 'official';
      libraryId: string;
      conceptKey: OfficialConceptKey;
    }>
  | Readonly<{
      type: 'create-card';
      target: 'personal';
      ownerId: string;
      conceptKey: PersonalConceptKey;
    }>
  | Readonly<{
      type: 'update-topic' | 'delete-topic';
      target: 'personal';
      ownerId: string;
      topicKey: PersonalTopicKey;
    }>
  | Readonly<{
      type: 'update-concept' | 'delete-concept';
      target: 'personal';
      ownerId: string;
      conceptKey: PersonalConceptKey;
    }>
  | Readonly<{
      type: 'update-card' | 'delete-card';
      target: 'personal';
      ownerId: string;
      cardKey: PersonalCardKey;
    }>;

export type CreatorCommandRoute =
  | 'personal-topic-owner-write'
  | 'official-concept-versioned-save'
  | 'personal-concept-owner-write'
  | 'personal-concept-overlay-owner-write'
  | 'official-question-versioned-save'
  | 'personal-card-owner-write';

function assertOwnPersonalTarget(
  ownerId: string,
  capabilities: CreatorCapabilityManifest
) {
  if (ownerId !== capabilities.subject.userId) {
    throw new Error('Personal Creator commands may target only the signed-in owner.');
  }
}
function assertActiveOfficialLibrary(
  libraryId: string,
  capabilities: CreatorCapabilityManifest
) {
  if (libraryId !== capabilities.library.activeLibraryId) {
    throw new Error('Official Creator command does not target the active Library.');
  }
}

function assertCommandKey(
  key: string,
  expectedSource: 'official' | 'personal',
  expectedKind: 'topic' | 'concept' | 'question' | 'card'
) {
  const [source, kind, id, ...extra] = key.split(':');
  if (
    source !== expectedSource ||
    kind !== expectedKind ||
    !id ||
    extra.length > 0
  ) {
    throw new Error(
      `Creator command requires a ${expectedSource} ${expectedKind} identity.`
    );
  }
}

function assertNever(command: never): never {
  throw new Error(`Unsupported Creator command: ${JSON.stringify(command)}.`);
}

export function resolveCreatorCommandRoute(
  command: CreatorCommand,
  capabilities: CreatorCapabilityManifest
): CreatorCommandRoute {
  switch (command.type) {
    case 'create-topic':
      assertOwnPersonalTarget(command.ownerId, capabilities);
      if (command.parentTopicKey) {
        assertCommandKey(command.parentTopicKey, 'personal', 'topic');
      }
      if (!capabilities.personal.createTopic) {
        throw new Error('Personal Topic creation is not permitted.');
      }
      return 'personal-topic-owner-write';

    case 'create-concept':
      if (command.target === 'official') {
        assertActiveOfficialLibrary(command.libraryId, capabilities);
        command.topicKeys.forEach((key) =>
          assertCommandKey(key, 'official', 'topic')
        );
        if (!capabilities.official.saveConcept) {
          throw new Error('Official Concept creation is not permitted.');
        }
        return 'official-concept-versioned-save';
      }

      assertOwnPersonalTarget(command.ownerId, capabilities);
      assertCommandKey(command.topicKey, 'personal', 'topic');
      if (!capabilities.personal.createConcept) {
        throw new Error('Personal Concept creation is not permitted.');
      }
      return 'personal-concept-owner-write';

    case 'create-concept-overlay':
      assertOwnPersonalTarget(command.ownerId, capabilities);
      assertCommandKey(command.officialTopicKey, 'official', 'topic');
      if (command.officialConceptKey) {
        assertCommandKey(command.officialConceptKey, 'official', 'concept');
      }
      if (!capabilities.personal.createOfficialContextOverlay) {
        throw new Error('Personal overlay creation is not permitted.');
      }
      return 'personal-concept-overlay-owner-write';

    case 'create-question':
      assertActiveOfficialLibrary(command.libraryId, capabilities);
      assertCommandKey(command.conceptKey, 'official', 'concept');
      if (!capabilities.official.saveQuestion) {
        throw new Error('Official Question creation is not permitted.');
      }
      return 'official-question-versioned-save';

    case 'create-card':
      assertOwnPersonalTarget(command.ownerId, capabilities);
      assertCommandKey(command.conceptKey, 'personal', 'concept');
      if (!capabilities.personal.createCard) {
        throw new Error('Personal Card creation is not permitted.');
      }
      return 'personal-card-owner-write';

    case 'update-topic':
      assertOwnPersonalTarget(command.ownerId, capabilities);
      assertCommandKey(command.topicKey, 'personal', 'topic');
      if (!capabilities.personal.editOwnContent) {
        throw new Error('Personal Topic editing is not permitted.');
      }
      return 'personal-topic-owner-write';

    case 'delete-topic':
      assertOwnPersonalTarget(command.ownerId, capabilities);
      assertCommandKey(command.topicKey, 'personal', 'topic');
      if (!capabilities.personal.deleteOwnContent) {
        throw new Error('Personal Topic deletion is not permitted.');
      }
      return 'personal-topic-owner-write';

    case 'update-concept':
      assertOwnPersonalTarget(command.ownerId, capabilities);
      assertCommandKey(command.conceptKey, 'personal', 'concept');
      if (!capabilities.personal.editOwnContent) {
        throw new Error('Personal Concept editing is not permitted.');
      }
      return 'personal-concept-owner-write';

    case 'delete-concept':
      assertOwnPersonalTarget(command.ownerId, capabilities);
      assertCommandKey(command.conceptKey, 'personal', 'concept');
      if (!capabilities.personal.deleteOwnContent) {
        throw new Error('Personal Concept deletion is not permitted.');
      }
      return 'personal-concept-owner-write';

    case 'update-card':
      assertOwnPersonalTarget(command.ownerId, capabilities);
      assertCommandKey(command.cardKey, 'personal', 'card');
      if (!capabilities.personal.editOwnContent) {
        throw new Error('Personal Card editing is not permitted.');
      }
      return 'personal-card-owner-write';

    case 'delete-card':
      assertOwnPersonalTarget(command.ownerId, capabilities);
      assertCommandKey(command.cardKey, 'personal', 'card');
      if (!capabilities.personal.deleteOwnContent) {
        throw new Error('Personal Card deletion is not permitted.');
      }
      return 'personal-card-owner-write';

    default:
      return assertNever(command);
  }
}
