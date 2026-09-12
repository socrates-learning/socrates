import type { CreatorCapabilityManifest } from '@/lib/creator-capabilities';
import type {
  OfficialConceptKey,
  OfficialTopicKey,
  PersonalConceptKey,
  PersonalTopicKey,
} from '@/lib/creator-entity-contracts';

export type CreatorCommand =
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
      officialConceptKey: OfficialConceptKey;
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
    }>;

export type CreatorCommandRoute =
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

function assertNever(command: never): never {
  throw new Error(`Unsupported Creator command: ${JSON.stringify(command)}.`);
}

export function resolveCreatorCommandRoute(
  command: CreatorCommand,
  capabilities: CreatorCapabilityManifest
): CreatorCommandRoute {
  switch (command.type) {
    case 'create-concept':
      if (command.target === 'official') {
        assertActiveOfficialLibrary(command.libraryId, capabilities);
        if (!capabilities.official.saveConcept) {
          throw new Error('Official Concept creation is not permitted.');
        }
        return 'official-concept-versioned-save';
      }

      assertOwnPersonalTarget(command.ownerId, capabilities);
      if (!capabilities.personal.createConcept) {
        throw new Error('Personal Concept creation is not permitted.');
      }
      return 'personal-concept-owner-write';

    case 'create-concept-overlay':
      assertOwnPersonalTarget(command.ownerId, capabilities);
      if (!capabilities.personal.createOfficialContextOverlay) {
        throw new Error('Personal overlay creation is not permitted.');
      }
      return 'personal-concept-overlay-owner-write';

    case 'create-question':
      assertActiveOfficialLibrary(command.libraryId, capabilities);
      if (!capabilities.official.saveQuestion) {
        throw new Error('Official Question creation is not permitted.');
      }
      return 'official-question-versioned-save';

    case 'create-card':
      assertOwnPersonalTarget(command.ownerId, capabilities);
      if (!capabilities.personal.createCard) {
        throw new Error('Personal Card creation is not permitted.');
      }
      return 'personal-card-owner-write';

    default:
      return assertNever(command);
  }
}
