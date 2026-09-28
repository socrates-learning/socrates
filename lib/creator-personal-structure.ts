import type { SupabaseClient } from '@supabase/supabase-js';
import type { CreatorPersonalTopic, CreatorPersonalTopicPlacement } from './creator-personal-content';

export type PersonalStructure = {
  topics: CreatorPersonalTopic[];
  placements: CreatorPersonalTopicPlacement[];
};

// PostgreSQL COLLATE "C" compares UTF-8 bytes, not the browser locale.
function compareName(left: string, right: string): number {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

export function personalSiblingIds(
  state: PersonalStructure, ownerId: string, parentId: string | null, placementId: string | null
): string[] {
  return state.topics.filter((topic) => topic.owner_id === ownerId && topic.parent_id === parentId &&
    (parentId !== null || (state.placements.find((p) => p.personal_topic_id === topic.id)?.library_node_id ?? null) === placementId))
    .sort((a, b) => (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity) || compareName(a.name, b.name) || compareName(a.id, b.id))
    .map((topic) => topic.id);
}

export async function refreshPersonalStructure(client: SupabaseClient, ownerId: string): Promise<PersonalStructure> {
  const [topics, placements] = await Promise.all([
    client.from('personal_topics').select('id, owner_id, parent_id, name, sort_order, created_at, updated_at').eq('owner_id', ownerId),
    client.from('personal_topic_official_placements').select('id, owner_id, personal_topic_id, library_node_id, created_at, updated_at').eq('owner_id', ownerId),
  ]);
  if (topics.error || placements.error) throw new Error((topics.error || placements.error)!.message);
  const state = { topics: (topics.data ?? []) as CreatorPersonalTopic[], placements: (placements.data ?? []) as CreatorPersonalTopicPlacement[] };
  if ([...state.topics, ...state.placements].some((row) => row.owner_id !== ownerId)) throw new Error('Unexpected personal Topic owner.');
  return state;
}

export async function movePersonalStructure(
  client: SupabaseClient, state: PersonalStructure, ownerId: string, topicId: string,
  destinationParentId: string | null, destinationPlacementId: string | null, beforeSiblingId: string | null = null
): Promise<PersonalStructure> {
  const moving = state.topics.find((t) => t.id === topicId && t.owner_id === ownerId);
  if (!moving) throw new Error('Personal Topic was not found for the signed-in owner.');
  if (!destinationParentId && !destinationPlacementId) {
    throw new Error('Choose a canonical Topic destination.');
  }
  if (destinationParentId) {
    const seen = new Set<string>();
    let current: string | null = destinationParentId;
    let placed = false;
    while (current) {
      if (seen.has(current) || current === topicId) throw new Error('Invalid Topic destination.');
      seen.add(current);
      const topic = state.topics.find(t => t.id === current && t.owner_id === ownerId);
      if (!topic) throw new Error('Destination Topic was not found.');
      if (!topic.parent_id) placed = state.placements.some(p => p.personal_topic_id === topic.id && p.owner_id === ownerId);
      current = topic.parent_id;
    }
    if (!placed) throw new Error('Destination Topic needs a canonical placement.');
  }
  const sourcePlacementId = moving.parent_id === null
    ? state.placements.find((p) => p.personal_topic_id === topicId)?.library_node_id ?? null : null;
  const { error } = await client.rpc('position_personal_topic', {
    p_topic_id: topicId,
    p_expected_parent_id: moving.parent_id,
    p_destination_parent_id: destinationParentId,
    p_expected_official_node_id: sourcePlacementId,
    p_destination_official_node_id: destinationPlacementId,
    p_before_sibling_id: beforeSiblingId,
    p_expected_source_ids: personalSiblingIds(state, ownerId, moving.parent_id, sourcePlacementId),
    p_expected_destination_ids: personalSiblingIds(state, ownerId, destinationParentId, destinationPlacementId),
  });
  if (error) throw new Error(error.message);
  try {
    return await refreshPersonalStructure(client, ownerId);
  } catch (error) {
    throw new Error(`Topic moved, but the tree could not be refreshed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
