export const SUGGESTION_CATEGORIES = ['Content Correction', 'New Topic', 'Feature Suggestion', 'Other'] as const;
export const SUGGESTION_LIMIT = 4000;
export type StudySuggestion = {
  requestId: string; libraryId: string; questionId: string | null;
  category: typeof SUGGESTION_CATEGORIES[number]; message: string;
};
export type SuggestionReceipt = { id: string; submittedAt: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseStudySuggestion(value: unknown): StudySuggestion {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid suggestion.');
  const input = value as StudySuggestion;
  if (Object.keys(input).sort().join() !== 'category,libraryId,message,questionId,requestId'
    || typeof input.requestId !== 'string' || !uuid.test(input.requestId)
    || typeof input.libraryId !== 'string' || !uuid.test(input.libraryId)
    || !(input.questionId === null || typeof input.questionId === 'string' && uuid.test(input.questionId))
    || !SUGGESTION_CATEGORIES.includes(input.category)
    || typeof input.message !== 'string' || input.message.includes('\0')
    || !input.message.trim() || input.message.length > SUGGESTION_LIMIT) throw new Error('Choose a category and enter a message of 1–4,000 characters.');
  return { ...input, message: input.message.trim() };
}
export function requireSuggestionReceipt(value: unknown): SuggestionReceipt {
  const result = value as SuggestionReceipt;
  if (!result || typeof result.id !== 'string' || !uuid.test(result.id)
    || typeof result.submittedAt !== 'string' || !Number.isFinite(Date.parse(result.submittedAt))) throw new Error('Suggestion receipt unavailable.');
  return { id: result.id, submittedAt: result.submittedAt };
}
