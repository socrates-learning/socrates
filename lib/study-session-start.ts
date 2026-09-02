export const EMPTY_STUDY_DECK_ERROR =
  'No eligible Study candidates are available for this deck.';

export type StudySessionStartOutcome =
  | { kind: 'started'; sessionId: string }
  | { kind: 'empty-deck' }
  | { kind: 'error' };

export function classifyStudySessionStart(
  sessionId: string | null | undefined,
  error: { message?: string | null } | null
): StudySessionStartOutcome {
  if (error?.message === EMPTY_STUDY_DECK_ERROR) {
    return { kind: 'empty-deck' };
  }

  if (error || !sessionId) {
    return { kind: 'error' };
  }

  return { kind: 'started', sessionId };
}
