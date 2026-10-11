import type { SupabaseClient } from '@supabase/supabase-js';
import type { OfficialContentFormat } from './official-content-format';
import type { QuestionMediaHint } from './question-media';
import { loadOfficialStudyConceptReview, type StudyConceptReview } from './study-concept-review';

export type ReviewFlag = {
  id: string; user_id: string; question_id: string | null; personal_card_id: string | null;
  note: string | null; created_at: string;
};
type Answer = { id: string; answer_text: string; answer_format: OfficialContentFormat; sort_order: number | null };
type Question = {
  id: string; concept_id: string; prompt: string; prompt_format: OfficialContentFormat;
  explanation: string | null; question_media_hint: QuestionMediaHint | null;
  concepts: { id: string; name: string; status: string } | { id: string; name: string; status: string }[];
  question_accepted_answers: Answer[];
};
type Card = { id: string; owner_id: string; concept_id: string | null; question: string; answer: string };
export type FlaggedReviewItem = {
  flag: ReviewFlag; source: 'official' | 'personal'; title: string;
  question: Question | null; card: Card | null;
};
function one<T>(value: T | T[]): T | undefined { return Array.isArray(value) ? value[0] : value; }

// Existing authenticated Data API/RLS, scoped to the signed-in flag owner. Read
// every bounded page so the provider's row limit cannot silently hide old flags.
// Official content uses the active Library. Personal content retains Creator's
// established owner-global contract; no new personal Library rule is introduced.
export async function loadFlaggedReview(client: SupabaseClient, ownerId: string, libraryId: string, signal: AbortSignal): Promise<FlaggedReviewItem[]> {
  if (!ownerId || !libraryId) throw new Error('Flagged Review is unavailable.');
  const items: FlaggedReviewItem[] = [];
  for (let offset = 0; ; offset += 100) {
    const flags = await client.from('study_candidate_flags')
      .select('id, user_id, question_id, personal_card_id, note, created_at')
      .eq('user_id', ownerId).order('created_at', { ascending: false }).order('id')
      .range(offset, offset + 99).abortSignal(signal);
    if (flags.error) throw flags.error;
    const rows = (flags.data || []) as ReviewFlag[];
    if (rows.some(row => row.user_id !== ownerId || Boolean(row.question_id) === Boolean(row.personal_card_id))) throw new Error('Flag identity is unavailable.');
    const questionIds = rows.flatMap(row => row.question_id ? [row.question_id] : []);
    const cardIds = rows.flatMap(row => row.personal_card_id ? [row.personal_card_id] : []);
    const [questions, cards] = await Promise.all([
      questionIds.length ? client.from('questions').select(`id, concept_id, prompt, prompt_format, explanation, question_media_hint,
        concepts!questions_concept_id_fkey!inner(id, name, status),
        question_accepted_answers(id, answer_text, answer_format, sort_order)`)
        .in('id', questionIds).eq('status', 'published').eq('concepts.status', 'published').abortSignal(signal) : { data: [], error: null },
      cardIds.length ? client.from('personal_cards').select('id, owner_id, concept_id, question, answer')
        .in('id', cardIds).eq('owner_id', ownerId).abortSignal(signal) : { data: [], error: null },
    ]);
    if (questions.error || cards.error) throw questions.error || cards.error;
    const questionRows = (questions.data || []) as unknown as Question[];
    const cardRows = (cards.data || []) as Card[];
    if (cardRows.some(card => card.owner_id !== ownerId || !cardIds.includes(card.id))) throw new Error('Card owner is unavailable.');
    const conceptIds = [...new Set(questionRows.map(question => question.concept_id))];
    const placements = conceptIds.length ? await client.from('concept_placements')
      .select('concept_id, library_nodes!inner(library_id)').in('concept_id', conceptIds)
      .eq('library_nodes.library_id', libraryId).abortSignal(signal) : { data: [], error: null };
    if (placements.error) throw placements.error;
    const inLibrary = new Set((placements.data || []).filter(row => one(row.library_nodes)?.library_id === libraryId).map(row => row.concept_id));
    for (const flag of rows) {
      const question = questionRows.find(row => row.id === flag.question_id) || null;
      // Do not display another Library's official content or reuse an unrelated
      // record as a fallback. Unavailable flags still permit removing one's flag.
      if (question && !inLibrary.has(question.concept_id)) continue;
      if (question && one(question.concepts)?.id !== question.concept_id) throw new Error('Question identity is unavailable.');
      const card = cardRows.find(row => row.id === flag.personal_card_id) || null;
      items.push({ flag, source: flag.question_id ? 'official' : 'personal', question, card,
        title: question?.prompt ?? card?.question ?? 'Material no longer available' });
    }
    if (rows.length < 100) break;
  }
  return items;
}

export function reviewAnswers(item: FlaggedReviewItem): Answer[] {
  return [...(item.question?.question_accepted_answers || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id.localeCompare(b.id));
}

export async function loadFlaggedConcept(client: SupabaseClient, item: FlaggedReviewItem, ownerId: string, libraryId: string, signal: AbortSignal): Promise<StudyConceptReview | null> {
  if (item.flag.user_id !== ownerId) throw new Error('Concept review is unavailable.');
  if (item.question) return loadOfficialStudyConceptReview(client, { conceptId: item.question.concept_id, libraryId });
  if (!item.card?.concept_id || item.card.owner_id !== ownerId) return null;
  const { data, error } = await client.from('personal_concepts')
    .select('id, owner_id, name, description, source_reference').eq('id', item.card.concept_id)
    .eq('owner_id', ownerId).abortSignal(signal).maybeSingle();
  if (error) throw error;
  if (!data || data.id !== item.card.concept_id || data.owner_id !== ownerId) return null;
  return { conceptId: data.id, name: data.name, summary: null, whyItMatters: null,
    bodyMarkdown: data.description || '', bodyFormat: 'legacy', sources: data.source_reference ? [{
      id: data.id, title: 'Source reference', author: null, sourceType: null, note: data.source_reference, url: null,
    }] : [] };
}

export function personalCardEditorHref(item: FlaggedReviewItem, ownerId: string, libraryId: string): string | null {
  if (!libraryId || item.source !== 'personal' || !item.card || item.card.owner_id !== ownerId ||
    item.flag.user_id !== ownerId || item.flag.personal_card_id !== item.card.id) return null;
  return `/creator?personalCard=${encodeURIComponent(item.card.id)}&reviewLibrary=${encodeURIComponent(libraryId)}`;
}
