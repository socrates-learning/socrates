import type { SupabaseClient } from '@supabase/supabase-js';

export type StandaloneCardAttachment =
  | { source: 'official'; topicId: string; libraryId: string }
  | { source: 'personal'; topicId: string };

export type CreatorStandaloneCard = {
  id: string;
  owner_id: string;
  concept_id: null;
  library_node_id: string | null;
  library_id: string | null;
  personal_topic_id: string | null;
  question: string;
  answer: string;
  source_reference: string | null;
  created_at: string;
  updated_at: string;
};

export function standaloneCardAttachment(card: CreatorStandaloneCard): StandaloneCardAttachment {
  if (card.concept_id !== null) throw new Error('Expected a standalone Card.');
  if (card.library_node_id && card.library_id && !card.personal_topic_id) {
    return { source: 'official', topicId: card.library_node_id, libraryId: card.library_id };
  }
  if (card.personal_topic_id && !card.library_node_id && !card.library_id) {
    return { source: 'personal', topicId: card.personal_topic_id };
  }
  throw new Error('Card has an invalid Topic attachment.');
}

export function standaloneCardMatchesTopic(card: CreatorStandaloneCard, target: StandaloneCardAttachment) {
  const attachment = standaloneCardAttachment(card);
  return attachment.source === target.source && attachment.topicId === target.topicId &&
    (attachment.source !== 'official' || target.source !== 'official' || attachment.libraryId === target.libraryId);
}

export async function saveStandaloneCard(client: SupabaseClient, ownerId: string,
  attachment: StandaloneCardAttachment, front: string, back: string, current: CreatorStandaloneCard | null,
  sourceReference?: string) {
  if (current && (current.owner_id !== ownerId || !standaloneCardMatchesTopic(current, attachment))) {
    throw new Error('Card identity or Topic attachment changed. Reload before saving.');
  }
  const question = front.trim();
  const answer = back.trim();
  if (!question || !answer) throw new Error('Front and Back are required.');
  if (question.length > 10000 || answer.length > 20000) throw new Error('Card text exceeds the field limits.');
  const payload = { question, answer, ...(sourceReference !== undefined ? {source_reference: sourceReference.trim() || null} : {}) };
  const query = current
    ? client.from('personal_cards').update(payload).eq('id', current.id).eq('owner_id', ownerId).is('concept_id', null).eq('updated_at', current.updated_at)
    : client.from('personal_cards').insert({ ...payload, owner_id: ownerId, concept_id: null,
      library_node_id: attachment.source === 'official' ? attachment.topicId : null,
      library_id: attachment.source === 'official' ? attachment.libraryId : null,
      personal_topic_id: attachment.source === 'personal' ? attachment.topicId : null });
  const { data, error } = await query.select('id,owner_id,concept_id,library_node_id,library_id,personal_topic_id,question,answer,source_reference,created_at,updated_at').single();
  if (error) throw new Error(error.code === 'PGRST116' ? 'This Card changed or is no longer available. Reload it before saving; your draft has been kept.' : error.message);
  const saved = data as CreatorStandaloneCard;
  if (saved.owner_id !== ownerId || !standaloneCardMatchesTopic(saved, attachment)) throw new Error('Saved Card identity mismatch.');
  return saved;
}

/** One conditional owner-scoped UPDATE. Existing RLS, attachment validation and
 * structure locks validate the destination; no privileged RPC or new grants. */
export async function moveStandaloneCard(client: SupabaseClient, ownerId: string,
  current: CreatorStandaloneCard, destination: StandaloneCardAttachment) {
  if (current.owner_id !== ownerId || !current.updated_at) throw new Error('An existing owned Card revision is required.');
  standaloneCardAttachment(current);
  if (standaloneCardMatchesTopic(current, destination)) throw new Error('Choose a different Topic.');
  const payload = {
    library_node_id: destination.source === 'official' ? destination.topicId : null,
    library_id: destination.source === 'official' ? destination.libraryId : null,
    personal_topic_id: destination.source === 'personal' ? destination.topicId : null,
  };
  const { data, error } = await client.from('personal_cards').update(payload)
    .eq('id', current.id).eq('owner_id', ownerId).is('concept_id', null).eq('updated_at', current.updated_at)
    .select('id,owner_id,concept_id,library_node_id,library_id,personal_topic_id,question,answer,source_reference,created_at,updated_at').single();
  if (error) throw new Error(error.code === 'PGRST116'
    ? 'This Card changed or is no longer available. Reload it before moving.'
    : 'The move could not be confirmed. Reload the Card before retrying; your content has been kept.');
  const moved = data as CreatorStandaloneCard;
  if (moved.id !== current.id || moved.owner_id !== ownerId || !standaloneCardMatchesTopic(moved, destination)
    || moved.question !== current.question || moved.answer !== current.answer
    || moved.source_reference !== current.source_reference || moved.created_at !== current.created_at) {
    throw new Error('The move could not be confirmed. Reload the Card before retrying.');
  }
  return moved;
}

export async function deleteStandaloneCard(client: SupabaseClient, ownerId: string, card: CreatorStandaloneCard) {
  if (card.owner_id !== ownerId) throw new Error('Only the Card owner may delete it.');
  standaloneCardAttachment(card);
  const { data, error } = await client.from('personal_cards').delete().eq('id', card.id)
    .eq('owner_id', ownerId).is('concept_id', null).select('id').single();
  if (error) throw new Error(error.message);
  if (data.id !== card.id) throw new Error('Deleted Card identity mismatch.');
}
