import type {
  CreatorPersonalTopic,
  CreatorPersonalTopicPlacement,
} from '@/lib/creator-personal-content';

function createTopicKey(source: 'official', id: string): `official:topic:${string}`;
function createTopicKey(source: 'personal', id: string): `personal:topic:${string}`;
function createTopicKey(
  source: 'official' | 'personal',
  id: string
): `official:topic:${string}` | `personal:topic:${string}` {
  return `${source}:topic:${id}`;
}

export type CreatorOfficialTopicInput = Readonly<{
  id: string;
  name: string;
  children: readonly CreatorOfficialTopicInput[];
}>;

export type UnifiedCreatorTopicNode = Readonly<{
  source: 'official' | 'personal';
  id: string;
  key: `official:topic:${string}` | `personal:topic:${string}`;
  name: string;
  sortOrder: number;
  canonicalParentKey:
    | `official:topic:${string}`
    | `personal:topic:${string}`
    | null;
  presentationParentKey:
    | `official:topic:${string}`
    | `personal:topic:${string}`
    | null;
  children: readonly UnifiedCreatorTopicNode[];
}>;

export type UnifiedCreatorTopicComposition = Readonly<{
  officialRoots: readonly UnifiedCreatorTopicNode[];
  unplacedPersonalRoots: readonly UnifiedCreatorTopicNode[];
  otherLibraryPersonalRoots: readonly UnifiedCreatorTopicNode[];
}>;

export function shouldShowPersonalCreatorTopics({
  editorSource,
  role,
}: {
  editorSource: 'official' | 'personal';
  role: 'learner' | 'editor' | 'admin';
}): boolean {
  // Learners keep the existing unified official + personal tree. Staff default
  // to the official tree, but their existing personal authoring mode remains
  // available whenever they open existing personal material.
  return (
    role === 'learner' ||
    editorSource === 'personal'
  );
}

function comparePersonalTopics(
  left: CreatorPersonalTopic,
  right: CreatorPersonalTopic
) {
  return (
    left.sort_order - right.sort_order ||
    left.name.localeCompare(right.name) ||
    left.id.localeCompare(right.id)
  );
}

export function composeUnifiedCreatorTopicTree({
  officialTopics,
  ownerId,
  personalTopics,
  topicPlacements,
}: {
  officialTopics: readonly CreatorOfficialTopicInput[];
  ownerId: string;
  personalTopics: readonly CreatorPersonalTopic[];
  topicPlacements: readonly CreatorPersonalTopicPlacement[];
}): UnifiedCreatorTopicComposition {
  if (
    personalTopics.some((topic) => topic.owner_id !== ownerId) ||
    topicPlacements.some((placement) => placement.owner_id !== ownerId)
  ) {
    throw new Error('Unified Creator Topic composition crossed the owner boundary.');
  }

  const personalById = new Map(personalTopics.map((topic) => [topic.id, topic]));
  const validatedPersonalTopicIds = new Set<string>();
  function validatePersonalLineage(
    topic: CreatorPersonalTopic,
    ancestry: ReadonlySet<string> = new Set()
  ) {
    if (validatedPersonalTopicIds.has(topic.id)) return;
    if (ancestry.has(topic.id)) {
      throw new Error('Personal Topic hierarchy contains a cycle.');
    }
    if (topic.parent_id) {
      const parent = personalById.get(topic.parent_id);
      if (!parent) {
        throw new Error('Personal Topic hierarchy contains an unavailable parent.');
      }
      validatePersonalLineage(parent, new Set(ancestry).add(topic.id));
    }
    validatedPersonalTopicIds.add(topic.id);
  }
  personalTopics.forEach((topic) => validatePersonalLineage(topic));

  const childrenByParentId = new Map<string, CreatorPersonalTopic[]>();
  personalTopics.forEach((topic) => {
    if (!topic.parent_id) return;
    const siblings = childrenByParentId.get(topic.parent_id) || [];
    siblings.push(topic);
    childrenByParentId.set(topic.parent_id, siblings);
  });
  childrenByParentId.forEach((siblings) => siblings.sort(comparePersonalTopics));

  function buildPersonalNode(
    topic: CreatorPersonalTopic,
    presentationParentKey: UnifiedCreatorTopicNode['presentationParentKey'],
    ancestry: ReadonlySet<string> = new Set()
  ): UnifiedCreatorTopicNode {
    if (ancestry.has(topic.id)) {
      throw new Error('Personal Topic hierarchy contains a cycle.');
    }
    const nextAncestry = new Set(ancestry).add(topic.id);
    const key = createTopicKey('personal', topic.id);
    const canonicalParentKey = topic.parent_id
      ? createTopicKey('personal', topic.parent_id)
      : null;

    return Object.freeze({
      source: 'personal' as const,
      id: topic.id,
      key,
      name: topic.name,
      sortOrder: topic.sort_order,
      canonicalParentKey,
      presentationParentKey,
      children: Object.freeze(
        (childrenByParentId.get(topic.id) || []).map((child) =>
          buildPersonalNode(child, key, nextAncestry)
        )
      ),
    });
  }

  const placementByTopicId = new Map<string, CreatorPersonalTopicPlacement>();
  topicPlacements.forEach((placement) => {
    if (placementByTopicId.has(placement.personal_topic_id)) {
      throw new Error('A personal Topic has more than one official placement.');
    }
    const topic = personalById.get(placement.personal_topic_id);
    if (!topic || topic.parent_id !== null) {
      throw new Error('Only an owned root personal Topic may be composed from a placement.');
    }
    placementByTopicId.set(placement.personal_topic_id, placement);
  });

  const placedRootsByOfficialId = new Map<string, UnifiedCreatorTopicNode[]>();
  const officialIds = new Set<string>();
  function collectOfficialIds(items: readonly CreatorOfficialTopicInput[]) {
    items.forEach((topic) => {
      officialIds.add(topic.id);
      collectOfficialIds(topic.children);
    });
  }
  collectOfficialIds(officialTopics);

  const unplacedPersonalRoots: UnifiedCreatorTopicNode[] = [];
  const otherLibraryPersonalRoots: UnifiedCreatorTopicNode[] = [];
  personalTopics
    .filter((topic) => topic.parent_id === null)
    .sort(comparePersonalTopics)
    .forEach((topic) => {
      const placement = placementByTopicId.get(topic.id);
      if (!placement) {
        unplacedPersonalRoots.push(buildPersonalNode(topic, null));
        return;
      }
      if (!officialIds.has(placement.library_node_id)) {
        otherLibraryPersonalRoots.push(buildPersonalNode(topic, null));
        return;
      }
      const officialKey = createTopicKey('official', placement.library_node_id);
      const roots = placedRootsByOfficialId.get(placement.library_node_id) || [];
      roots.push(buildPersonalNode(topic, officialKey));
      placedRootsByOfficialId.set(placement.library_node_id, roots);
    });

  function buildOfficialNode(
    topic: CreatorOfficialTopicInput,
    parentKey: `official:topic:${string}` | null,
    sortOrder: number
  ): UnifiedCreatorTopicNode {
    const key = createTopicKey('official', topic.id);
    const officialChildren = topic.children.map((child, index) =>
      buildOfficialNode(child, key, index)
    );
    const personalChildren = placedRootsByOfficialId.get(topic.id) || [];

    return Object.freeze({
      source: 'official' as const,
      id: topic.id,
      key,
      name: topic.name,
      sortOrder,
      canonicalParentKey: parentKey,
      presentationParentKey: parentKey,
      // Preserve the authoritative official order. Personal roots are stable
      // and deterministic after the existing official children.
      children: Object.freeze([...officialChildren, ...personalChildren]),
    });
  }

  return Object.freeze({
    officialRoots: Object.freeze(
      officialTopics.map((topic, index) => buildOfficialNode(topic, null, index))
    ),
    unplacedPersonalRoots: Object.freeze(unplacedPersonalRoots),
    otherLibraryPersonalRoots: Object.freeze(otherLibraryPersonalRoots),
  });
}

export function flattenUnifiedCreatorTopics(
  roots: readonly UnifiedCreatorTopicNode[]
): UnifiedCreatorTopicNode[] {
  return roots.flatMap((topic) => [
    topic,
    ...flattenUnifiedCreatorTopics(topic.children),
  ]);
}
