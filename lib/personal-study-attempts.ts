import type { SupabaseClient } from '@supabase/supabase-js';

export const personalStudyResults = [
  'easy',
  'average',
  'hard',
  'didnt_know',
  'forgot',
  'too_hard',
] as const;

export type PersonalStudyResult = (typeof personalStudyResults)[number];

export type PersonalConceptState = {
  evidenceCount: number;
  positiveEvidenceCount: number;
  negativeEvidenceCount: number;
  consecutiveSuccessCount: number;
  consecutiveLapseCount: number;
  lastResult: PersonalStudyResult;
  lastReviewedAt: string;
};

export type PersonalStudyAttemptResult = {
  attemptId: string;
  sequencePosition: number;
  studySessionId: string;
  studyDeckId: string;
  personalCardId: string;
  personalConceptId: string;
  result: PersonalStudyResult;
  state: PersonalConceptState;
};

export type RecordPersonalStudyAttemptInput = {
  studySessionId: string;
  studyDeckId: string;
  personalCardId: string;
  personalConceptId: string;
  result: PersonalStudyResult;
};

function isPersonalStudyResult(value: unknown): value is PersonalStudyResult {
  return (
    typeof value === 'string'
    && personalStudyResults.includes(value as PersonalStudyResult)
  );
}

function requireString(
  source: Record<string, unknown>,
  key: string
): string {
  const value = source[key];

  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Personal Study attempt response is missing ${key}.`);
  }

  return value;
}

function requireNonNegativeInteger(
  source: Record<string, unknown>,
  key: string
): number {
  const value = source[key];

  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`Personal Study attempt response has invalid ${key}.`);
  }

  return value as number;
}

function adaptPersonalConceptState(value: unknown): PersonalConceptState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Personal Study attempt response is missing state.');
  }

  const state = value as Record<string, unknown>;
  const lastResult = state.lastResult;

  if (!isPersonalStudyResult(lastResult)) {
    throw new Error('Personal Study attempt response has invalid lastResult.');
  }

  const evidenceCount = requireNonNegativeInteger(state, 'evidenceCount');

  if (evidenceCount < 1) {
    throw new Error('Personal Study evidenceCount must be positive.');
  }

  const positiveEvidenceCount = requireNonNegativeInteger(
    state,
    'positiveEvidenceCount'
  );
  const negativeEvidenceCount = requireNonNegativeInteger(
    state,
    'negativeEvidenceCount'
  );
  const consecutiveSuccessCount = requireNonNegativeInteger(
    state,
    'consecutiveSuccessCount'
  );
  const consecutiveLapseCount = requireNonNegativeInteger(
    state,
    'consecutiveLapseCount'
  );

  if (evidenceCount !== positiveEvidenceCount + negativeEvidenceCount) {
    throw new Error('Personal Study evidence totals are inconsistent.');
  }

  if (consecutiveSuccessCount > 0 && consecutiveLapseCount > 0) {
    throw new Error('Personal Study response streaks are inconsistent.');
  }

  return {
    evidenceCount,
    positiveEvidenceCount,
    negativeEvidenceCount,
    consecutiveSuccessCount,
    consecutiveLapseCount,
    lastResult,
    lastReviewedAt: requireString(state, 'lastReviewedAt'),
  };
}

export function adaptPersonalStudyAttemptResult(
  value: unknown
): PersonalStudyAttemptResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Personal Study attempt RPC returned an invalid response.');
  }

  const response = value as Record<string, unknown>;
  const result = response.result;

  if (!isPersonalStudyResult(result)) {
    throw new Error('Personal Study attempt response has invalid result.');
  }

  const sequencePosition = requireNonNegativeInteger(
    response,
    'sequencePosition'
  );

  if (sequencePosition < 1) {
    throw new Error('Personal Study sequencePosition must be positive.');
  }

  return {
    attemptId: requireString(response, 'attemptId'),
    sequencePosition,
    studySessionId: requireString(response, 'studySessionId'),
    studyDeckId: requireString(response, 'studyDeckId'),
    personalCardId: requireString(response, 'personalCardId'),
    personalConceptId: requireString(response, 'personalConceptId'),
    result,
    state: adaptPersonalConceptState(response.state),
  };
}

export async function recordPersonalStudyAttempt(
  supabase: SupabaseClient,
  input: RecordPersonalStudyAttemptInput
): Promise<PersonalStudyAttemptResult> {
  const { data, error } = await supabase.rpc('record_personal_study_attempt', {
    p_study_session_id: input.studySessionId,
    p_study_deck_id: input.studyDeckId,
    p_personal_card_id: input.personalCardId,
    p_personal_concept_id: input.personalConceptId,
    p_result: input.result,
  });

  if (error) {
    throw new Error(`Unable to record personal Study response: ${error.message}`);
  }

  const response = adaptPersonalStudyAttemptResult(data);

  if (
    response.studySessionId !== input.studySessionId
    || response.studyDeckId !== input.studyDeckId
    || response.personalCardId !== input.personalCardId
    || response.personalConceptId !== input.personalConceptId
    || response.result !== input.result
  ) {
    throw new Error('Personal Study attempt response identity does not match the request.');
  }

  return response;
}
