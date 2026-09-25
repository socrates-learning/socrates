import type { SupabaseClient } from '@supabase/supabase-js';

export const USER_NOTE_CONFLICT_COLUMNS = 'user_id,concept_id';

export type ConceptNoteSaveInput = {
  userId: string;
  conceptId: string;
  note: string;
};

export async function loadConceptNote(
  database: SupabaseClient,
  userId: string,
  conceptId: string
) {
  return database
    .from('user_notes')
    .select('note')
    .eq('concept_id', conceptId)
    .eq('user_id', userId)
    .maybeSingle();
}

export async function saveConceptNote(
  database: SupabaseClient,
  { userId, conceptId, note }: ConceptNoteSaveInput
) {
  return database.from('user_notes').upsert(
    {
      user_id: userId,
      concept_id: conceptId,
      note,
      updated_at: new Date().toISOString(),
    },
    { onConflict: USER_NOTE_CONFLICT_COLUMNS }
  );
}
