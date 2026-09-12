import type {
  CreatorEntityIdentity,
  OfficialQuestionRowContract,
  PersonalCardRowContract,
} from '@/lib/creator-entity-contracts';

const officialQuestion: OfficialQuestionRowContract = {
  source: 'official',
  kind: 'question',
  id: 'question-a',
  key: 'official:question:question-a',
  prompt: 'What is the official answer?',
  conceptKey: 'official:concept:concept-a',
  difficulty: 'medium',
  testingAngles: ['Clinical Application'],
  relatedConceptKeys: [],
  ownership: { type: 'official', libraryId: 'library-a' },
  workflow: { type: 'official-lifecycle', status: 'published' },
};

const personalCard: PersonalCardRowContract = {
  source: 'personal',
  kind: 'card',
  id: 'card-a',
  key: 'personal:card:card-a',
  question: 'What is my answer?',
  answer: 'My answer',
  conceptKey: 'personal:concept:concept-a',
  sourceReference: null,
  ownership: { type: 'personal', ownerId: 'owner-a' },
  workflow: { type: 'owner-managed' },
};

const identities: readonly CreatorEntityIdentity[] = [
  officialQuestion,
  personalCard,
];

void identities;

const personalCardWithOfficialMetadata: PersonalCardRowContract = {
  ...personalCard,
  // @ts-expect-error Personal Cards cannot acquire official difficulty metadata.
  difficulty: 'hard',
};

void personalCardWithOfficialMetadata;

// @ts-expect-error Personal content uses Card, never the official Question kind.
const invalidPersonalQuestionIdentity: CreatorEntityIdentity = {
  source: 'personal',
  kind: 'question',
  id: 'question-a',
  key: 'personal:card:question-a',
};

void invalidPersonalQuestionIdentity;
