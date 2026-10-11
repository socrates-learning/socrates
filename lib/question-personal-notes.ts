import type { SupabaseClient } from '@supabase/supabase-js';

export const QUESTION_NOTE_LIMIT = 4000;
export type QuestionPersonalNote = { question_id: string; note: string; revision: string };

function parseNote(value: unknown, questionId: string): QuestionPersonalNote | null {
  if (value === null) return null;
  const note = value as QuestionPersonalNote;
  if (!note || note.question_id !== questionId || typeof note.note !== 'string' ||
    typeof note.revision !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(note.revision)) throw new Error('Note identity is unavailable.');
  return note;
}

export async function loadQuestionPersonalNote(client: SupabaseClient, libraryId: string, questionId: string, signal: AbortSignal) {
  const { data, error } = await client.rpc('get_my_question_note', { p_library_id: libraryId, p_question_id: questionId }).abortSignal(signal);
  if (error) throw error;
  return parseNote(data, questionId);
}

export async function saveQuestionPersonalNote(client: SupabaseClient, libraryId: string, questionId: string, note: string, revision: string | null) {
  if (!note.trim() || note.length > QUESTION_NOTE_LIMIT) throw new Error('Enter a note of 1 to 4000 characters.');
  const { data, error } = await client.rpc('save_my_question_note', {
    p_library_id: libraryId, p_question_id: questionId, p_note: note.trim(), p_expected_revision: revision,
  });
  if (error) throw error;
  const saved = parseNote(data, questionId);
  if (!saved) throw new Error('The note save could not be confirmed.');
  return saved;
}

export async function deleteQuestionPersonalNote(client: SupabaseClient, libraryId: string, questionId: string, revision: string) {
  const { error } = await client.rpc('delete_my_question_note', {
    p_library_id: libraryId, p_question_id: questionId, p_expected_revision: revision,
  });
  if (error) throw error;
}
