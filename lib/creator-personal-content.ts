import type { SupabaseClient } from '@supabase/supabase-js';

export type CreatorPersonalTopic = {
  id: string;
  owner_id: string;
  parent_id: string | null;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type CreatorPersonalConcept = {
  id: string;
  owner_id: string;
  topic_id: string;
  name: string;
  description: string | null;
  source_reference: string | null;
  created_at: string;
  updated_at: string;
};

export type CreatorPersonalCard = {
  id: string;
  owner_id: string;
  concept_id: string;
  question: string;
  answer: string;
  source_reference: string | null;
  created_at: string;
  updated_at: string;
};

export type CreatorPersonalOverlay = {
  id: string;
  owner_id: string;
  personal_concept_id: string;
  library_node_id: string;
  official_concept_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CreatorPersonalTopicPlacement = {
  id: string;
  owner_id: string;
  personal_topic_id: string;
  library_node_id: string;
  created_at: string;
  updated_at: string;
};

export type CreatorPersonalContent = {
  ownerId: string;
  topics: CreatorPersonalTopic[];
  concepts: CreatorPersonalConcept[];
  cards: CreatorPersonalCard[];
  overlays: CreatorPersonalOverlay[];
  topicPlacements: CreatorPersonalTopicPlacement[];
};

export function emptyCreatorPersonalContent(ownerId: string): CreatorPersonalContent {
  return {
    ownerId,
    topics: [],
    concepts: [],
    cards: [],
    overlays: [],
    topicPlacements: [],
  };
}

export async function loadCreatorPersonalContent(
  supabase: SupabaseClient,
  ownerId: string
): Promise<CreatorPersonalContent> {
  const [
    topicResult,
    conceptResult,
    cardResult,
    overlayResult,
    topicPlacementResult,
  ] = await Promise.all([
    supabase
      .from('personal_topics')
      .select('id, owner_id, parent_id, name, sort_order, created_at, updated_at')
      .eq('owner_id', ownerId)
      .order('sort_order')
      .order('created_at'),
    supabase
      .from('personal_concepts')
      .select('id, owner_id, topic_id, name, description, source_reference, created_at, updated_at')
      .eq('owner_id', ownerId)
      .order('created_at'),
    supabase
      .from('personal_cards')
      .select('id, owner_id, concept_id, question, answer, source_reference, created_at, updated_at')
      .eq('owner_id', ownerId)
      .order('created_at'),
    supabase
      .from('personal_concept_official_placements')
      .select('id, owner_id, personal_concept_id, library_node_id, official_concept_id, created_at, updated_at')
      .eq('owner_id', ownerId)
      .order('created_at'),
    supabase
      .from('personal_topic_official_placements')
      .select('id, owner_id, personal_topic_id, library_node_id, created_at, updated_at')
      .eq('owner_id', ownerId)
      .order('created_at')
      .order('id'),
  ]);

  const error = [
    topicResult.error,
    conceptResult.error,
    cardResult.error,
    overlayResult.error,
    topicPlacementResult.error,
  ].find(Boolean);
  if (error) throw new Error(`Unable to load personal Creator material: ${error.message}`);

  const ownerScopedRows = [
    ...(topicResult.data ?? []),
    ...(conceptResult.data ?? []),
    ...(cardResult.data ?? []),
    ...(overlayResult.data ?? []),
    ...(topicPlacementResult.data ?? []),
  ];
  if (ownerScopedRows.some((row) => row.owner_id !== ownerId)) {
    throw new Error('Personal Creator material crossed the authenticated owner boundary.');
  }

  return {
    ownerId,
    topics: (topicResult.data ?? []) as CreatorPersonalTopic[],
    concepts: (conceptResult.data ?? []) as CreatorPersonalConcept[],
    cards: (cardResult.data ?? []) as CreatorPersonalCard[],
    overlays: (overlayResult.data ?? []) as CreatorPersonalOverlay[],
    topicPlacements: (topicPlacementResult.data ?? []) as CreatorPersonalTopicPlacement[],
  };
}
