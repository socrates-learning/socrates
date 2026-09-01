import type { SupabaseClient } from '@supabase/supabase-js';

export type OfficialStudyCandidate = {
  kind: 'official';
  candidateId: string;
  questionId: string;
  conceptId: string;
  prompt: string;
  answer: string;
  explanation: string | null;
  difficulty: string;
  testingAngle: string;
  position: number;
  createdAt: string;
};

export type PersonalStudyCandidate = {
  kind: 'personal';
  candidateId: string;
  cardId: string;
  personalConceptId: string;
  personalTopicId: string;
  prompt: string;
  answer: string;
  position: number;
  createdAt: string;
};

export type StudyCandidate =
  | OfficialStudyCandidate
  | PersonalStudyCandidate;

export type StudyCandidateRow = {
  candidate_type: 'official' | 'personal';
  candidate_id: string;
  official_question_id: string | null;
  official_concept_id: string | null;
  personal_card_id: string | null;
  personal_concept_id: string | null;
  personal_topic_id: string | null;
  prompt: string;
  answer: string;
  explanation: string | null;
  difficulty: string | null;
  testing_angle: string | null;
  candidate_position: number;
  created_at: string;
};

function requireValue(
  value: string | null,
  field: keyof StudyCandidateRow,
  candidateId: string
): string {
  if (!value) {
    throw new Error(
      `Study candidate ${candidateId} is missing required ${field}.`
    );
  }

  return value;
}

function requireNull(
  value: string | null,
  field: keyof StudyCandidateRow,
  candidateId: string
) {
  if (value !== null) {
    throw new Error(
      `Study candidate ${candidateId} has incompatible ${field}.`
    );
  }
}

export function adaptStudyCandidateRow(row: StudyCandidateRow): StudyCandidate {
  if (row.candidate_type === 'official') {
    requireNull(row.personal_card_id, 'personal_card_id', row.candidate_id);
    requireNull(row.personal_concept_id, 'personal_concept_id', row.candidate_id);
    requireNull(row.personal_topic_id, 'personal_topic_id', row.candidate_id);

    const questionId = requireValue(
      row.official_question_id,
      'official_question_id',
      row.candidate_id
    );
    const conceptId = requireValue(
      row.official_concept_id,
      'official_concept_id',
      row.candidate_id
    );

    if (row.candidate_id !== questionId) {
      throw new Error(
        `Official candidate ${row.candidate_id} does not match its Question ID.`
      );
    }

    return {
      kind: 'official',
      candidateId: row.candidate_id,
      questionId,
      conceptId,
      prompt: row.prompt,
      answer: row.answer,
      explanation: row.explanation,
      difficulty: requireValue(
        row.difficulty,
        'difficulty',
        row.candidate_id
      ),
      testingAngle: requireValue(
        row.testing_angle,
        'testing_angle',
        row.candidate_id
      ),
      position: row.candidate_position,
      createdAt: row.created_at,
    };
  }

  if (row.candidate_type !== 'personal') {
    throw new Error(
      `Study candidate ${row.candidate_id} has unsupported candidate_type.`
    );
  }

  requireNull(row.official_question_id, 'official_question_id', row.candidate_id);
  requireNull(row.official_concept_id, 'official_concept_id', row.candidate_id);
  requireNull(row.explanation, 'explanation', row.candidate_id);
  requireNull(row.difficulty, 'difficulty', row.candidate_id);
  requireNull(row.testing_angle, 'testing_angle', row.candidate_id);

  const cardId = requireValue(
    row.personal_card_id,
    'personal_card_id',
    row.candidate_id
  );

  if (row.candidate_id !== cardId) {
    throw new Error(
      `Personal candidate ${row.candidate_id} does not match its Card ID.`
    );
  }

  return {
    kind: 'personal',
    candidateId: row.candidate_id,
    cardId,
    personalConceptId: requireValue(
      row.personal_concept_id,
      'personal_concept_id',
      row.candidate_id
    ),
    personalTopicId: requireValue(
      row.personal_topic_id,
      'personal_topic_id',
      row.candidate_id
    ),
    prompt: row.prompt,
    answer: row.answer,
    position: row.candidate_position,
    createdAt: row.created_at,
  };
}

export function adaptStudyCandidateRows(
  rows: StudyCandidateRow[]
): StudyCandidate[] {
  return rows.map(adaptStudyCandidateRow);
}

export async function resolveStudyCandidates(
  supabase: SupabaseClient,
  deckId: string
): Promise<StudyCandidate[]> {
  const { data, error } = await supabase.rpc('resolve_study_candidates', {
    p_deck_id: deckId,
  });

  if (error) {
    throw new Error(`Unable to resolve Study candidates: ${error.message}`);
  }

  return adaptStudyCandidateRows((data || []) as StudyCandidateRow[]);
}

export async function selectNextUnansweredPersonalCandidate(
  supabase: SupabaseClient,
  deckId: string,
  studySessionId: string,
  candidates?: StudyCandidate[]
): Promise<PersonalStudyCandidate | null> {
  const [resolvedCandidates, attemptsResult] = await Promise.all([
    candidates
      ? Promise.resolve(candidates)
      : resolveStudyCandidates(supabase, deckId),
    supabase
      .from('personal_review_attempts')
      .select('personal_card_id')
      .eq('study_session_id', studySessionId)
      .eq('study_deck_id', deckId),
  ]);

  if (attemptsResult.error) {
    throw new Error(
      `Unable to load personal Study progress: ${attemptsResult.error.message}`
    );
  }

  const answeredCardIds = new Set(
    (attemptsResult.data || []).map((attempt) => attempt.personal_card_id)
  );

  return (
    resolvedCandidates.find(
      (candidate): candidate is PersonalStudyCandidate =>
        candidate.kind === 'personal'
        && !answeredCardIds.has(candidate.cardId)
    ) || null
  );
}
