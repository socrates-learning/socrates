export type CreatorSource = 'official' | 'personal';

export type OfficialCreatorKind = 'topic' | 'concept' | 'question';
export type PersonalCreatorKind = 'topic' | 'concept' | 'card';
export type CreatorKind = OfficialCreatorKind | PersonalCreatorKind;

export type OfficialTopicKey = `official:topic:${string}`;
export type OfficialConceptKey = `official:concept:${string}`;
export type OfficialQuestionKey = `official:question:${string}`;
export type PersonalTopicKey = `personal:topic:${string}`;
export type PersonalConceptKey = `personal:concept:${string}`;
export type PersonalCardKey = `personal:card:${string}`;

export type CreatorEntityKey =
  | OfficialTopicKey
  | OfficialConceptKey
  | OfficialQuestionKey
  | PersonalTopicKey
  | PersonalConceptKey
  | PersonalCardKey;

export type CreatorEntityIdentity =
  | Readonly<{
      source: 'official';
      kind: OfficialCreatorKind;
      id: string;
      key: OfficialTopicKey | OfficialConceptKey | OfficialQuestionKey;
    }>
  | Readonly<{
      source: 'personal';
      kind: PersonalCreatorKind;
      id: string;
      key: PersonalTopicKey | PersonalConceptKey | PersonalCardKey;
    }>;

export type OfficialOwnership = Readonly<{
  type: 'official';
  libraryId: string;
}>;

export type PersonalOwnership = Readonly<{
  type: 'personal';
  ownerId: string;
}>;

export type OfficialWorkflow = Readonly<{
  type: 'official-lifecycle';
  status: 'draft' | 'published' | 'archived';
}>;

export type PersonalWorkflow = Readonly<{
  type: 'owner-managed';
}>;

export type OfficialTopicContract = Readonly<{
  source: 'official';
  kind: 'topic';
  id: string;
  key: OfficialTopicKey;
  name: string;
  parentKey: OfficialTopicKey | null;
  sortOrder: number;
  ownership: OfficialOwnership;
}>;

export type PersonalTopicContract = Readonly<{
  source: 'personal';
  kind: 'topic';
  id: string;
  key: PersonalTopicKey;
  name: string;
  parentKey: PersonalTopicKey | null;
  sortOrder: number;
  ownership: PersonalOwnership;
}>;

export type CreatorTopicContract =
  | OfficialTopicContract
  | PersonalTopicContract;

export type CreatorTopicActions = Readonly<{
  canSelect: boolean;
  canCreateChild: boolean;
  canRename: boolean;
  canMove: boolean;
  canDelete: boolean;
}>;

export type OfficialConceptContract = Readonly<{
  source: 'official';
  kind: 'concept';
  id: string;
  key: OfficialConceptKey;
  name: string;
  placementKeys: readonly OfficialTopicKey[];
  ownership: OfficialOwnership;
  workflow: OfficialWorkflow;
}>;

export type PersonalConceptContract = Readonly<{
  source: 'personal';
  kind: 'concept';
  id: string;
  key: PersonalConceptKey;
  name: string;
  topicKey: PersonalTopicKey;
  description: string | null;
  ownership: PersonalOwnership;
  workflow: PersonalWorkflow;
}>;

export type CreatorConceptContract =
  | OfficialConceptContract
  | PersonalConceptContract;

export type OfficialQuestionRowContract = Readonly<{
  source: 'official';
  kind: 'question';
  id: string;
  key: OfficialQuestionKey;
  prompt: string;
  conceptKey: OfficialConceptKey;
  difficulty: 'easy' | 'medium' | 'hard';
  testingAngles: readonly string[];
  relatedConceptKeys: readonly OfficialConceptKey[];
  ownership: OfficialOwnership;
  workflow: OfficialWorkflow;
}>;

export type PersonalCardRowContract = Readonly<{
  source: 'personal';
  kind: 'card';
  id: string;
  key: PersonalCardKey;
  question: string;
  answer: string;
  conceptKey: PersonalConceptKey;
  sourceReference: string | null;
  ownership: PersonalOwnership;
  workflow: PersonalWorkflow;
}>;

export type CreatorQuestionCardRowContract =
  | OfficialQuestionRowContract
  | PersonalCardRowContract;

const VALID_SOURCE_KINDS: Readonly<Record<CreatorSource, readonly CreatorKind[]>> =
  Object.freeze({
    official: Object.freeze<CreatorKind[]>(['topic', 'concept', 'question']),
    personal: Object.freeze<CreatorKind[]>(['topic', 'concept', 'card']),
  });

function assertIdentifier(id: string) {
  if (!id.trim() || id.includes(':')) {
    throw new Error('Creator entity IDs must be non-empty and cannot contain colons.');
  }
}

export function isCreatorSourceKind(
  source: string,
  kind: string
): source is CreatorSource {
  return (
    (source === 'official' || source === 'personal') &&
    VALID_SOURCE_KINDS[source].includes(kind as CreatorKind)
  );
}

export function createCreatorEntityKey<
  Source extends CreatorSource,
  Kind extends Source extends 'official'
    ? OfficialCreatorKind
    : PersonalCreatorKind,
>(source: Source, kind: Kind, id: string): `${Source}:${Kind}:${string}` {
  assertIdentifier(id);

  if (!isCreatorSourceKind(source, kind)) {
    throw new Error(`Invalid Creator entity pairing: ${source}:${kind}.`);
  }

  return `${source}:${kind}:${id}`;
}

export function parseCreatorEntityKey(key: string): CreatorEntityIdentity {
  const [source, kind, id, ...extra] = key.split(':');

  if (extra.length || !id || !isCreatorSourceKind(source, kind)) {
    throw new Error(`Invalid source-qualified Creator entity key: ${key}.`);
  }

  assertIdentifier(id);
  return Object.freeze({ source, kind, id, key }) as CreatorEntityIdentity;
}

export function assertCreatorEntityIdentity(
  value: unknown
): asserts value is CreatorEntityIdentity {
  if (!value || typeof value !== 'object') {
    throw new Error('Creator entity identity must be an object.');
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.source !== 'string' ||
    typeof candidate.kind !== 'string' ||
    typeof candidate.id !== 'string' ||
    typeof candidate.key !== 'string'
  ) {
    throw new Error('Creator entity identity is missing required fields.');
  }

  const parsed = parseCreatorEntityKey(candidate.key);
  if (
    parsed.source !== candidate.source ||
    parsed.kind !== candidate.kind ||
    parsed.id !== candidate.id
  ) {
    throw new Error('Creator entity identity does not match its qualified key.');
  }
}

export function assertTopicParentCompatibility(
  child: CreatorTopicContract,
  parent: CreatorTopicContract | null
) {
  if (!parent) return;

  if (child.source !== parent.source) {
    throw new Error('Official and personal Topics cannot share a parent relationship.');
  }

  if (child.parentKey !== parent.key) {
    throw new Error('Topic parent does not match its source-qualified parent key.');
  }
}
