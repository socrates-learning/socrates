export type CanonicalConceptMasteryRow = {
  mastery_estimate: number | string;
  evidence_count: number;
  last_exposure_at: string;
};

export type ConceptMasteryPresentation = {
  percent: number | null;
  label: string;
  lastExposureAt: string | null;
};

export function presentCanonicalConceptMastery(
  row: CanonicalConceptMasteryRow | null
): ConceptMasteryPresentation {
  if (!row) {
    return {
      percent: null,
      label: 'Unseen',
      lastExposureAt: null,
    };
  }

  const estimate = Number(row.mastery_estimate);

  if (
    !Number.isFinite(estimate) ||
    estimate < 0 ||
    estimate > 1 ||
    !Number.isInteger(row.evidence_count) ||
    row.evidence_count < 1
  ) {
    throw new Error('Invalid canonical Concept mastery state.');
  }

  const percent = Math.round(estimate * 100);

  return {
    percent,
    label: `${percent}%`,
    lastExposureAt: row.last_exposure_at,
  };
}

export function calculateHistoricalAccuracyPercent(scores: number[]) {
  if (scores.length === 0) return null;

  return Math.round(
    scores.reduce((total, score) => total + score * 25, 0) / scores.length
  );
}

export function calculateSessionReviewScorePercent(scores: number[]) {
  if (scores.length === 0) return null;

  return Math.round(
    scores.reduce((total, score) => total + score * 25, 0) / scores.length
  );
}
