import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  calculateHistoricalAccuracyPercent,
  calculateSessionReviewScorePercent,
  presentCanonicalConceptMastery,
} from '../lib/concept-page-mastery.ts';

const review = readFileSync(
  new URL('../components/ConceptReview.tsx', import.meta.url),
  'utf8'
);
const tabs = readFileSync(
  new URL('../components/ConceptTabs.tsx', import.meta.url),
  'utf8'
);
const notes = readFileSync(
  new URL('../components/ConceptNotes.tsx', import.meta.url),
  'utf8'
);
const notePersistence = readFileSync(
  new URL('../lib/concept-notes.ts', import.meta.url),
  'utf8'
);

test('Concept Review names its current-session metric as a review score', () => {
  assert.match(review, /Session Review Score/);
  assert.match(review, /Average of your 1–4 self-ratings in this review\./);
  assert.doesNotMatch(review, /Session Mastery|mastery score|mastered/i);
});

test('the 1–4 current-session average remains unchanged', () => {
  assert.equal(calculateSessionReviewScorePercent([]), null);
  assert.equal(calculateSessionReviewScorePercent([1]), 25);
  assert.equal(calculateSessionReviewScorePercent([2, 3]), 63);
  assert.equal(calculateSessionReviewScorePercent([1, 2, 3, 4]), 63);
  assert.equal(calculateSessionReviewScorePercent([4, 4]), 100);
});

test('Concept Review preserves its legacy owner-scoped attempt insert', () => {
  assert.match(review, /supabase\.auth\.getUser\(\)/);
  assert.match(review, /supabase\.from\('review_attempts'\)\.insert\(\{/);
  assert.match(review, /user_id: userData\.user\.id/);
  assert.match(review, /concept_id: conceptId/);
  assert.match(review, /learn_section_id: currentSection\.id/);
  assert.match(review, /score,/);
  assert.match(review, /result,/);
  assert.doesNotMatch(
    review,
    /record_study_session_attempt|apply_user_concept_evidence|user_concept_mastery|user_concept_testing_angle_state/
  );
});

test('Concept Review responses retain the legacy result mapping', () => {
  assert.match(
    review,
    /score >= 4 \? 'knew' : score >= 2 \? 'guessed' : 'missed'/
  );
  assert.match(review, />\s*1 Forgot\s*</);
  assert.match(review, />\s*2 Hard\s*</);
  assert.match(review, />\s*3 Good\s*</);
  assert.match(review, />\s*4 Easy\s*</);
});

test('canonical Overall Mastery remains independent of the Review score', () => {
  assert.deepEqual(
    presentCanonicalConceptMastery({
      mastery_estimate: 0.82,
      evidence_count: 3,
      last_exposure_at: '2026-09-25T10:00:00.000Z',
    }),
    {
      percent: 82,
      label: '82%',
      lastExposureAt: '2026-09-25T10:00:00.000Z',
    }
  );
  assert.equal(calculateSessionReviewScorePercent([1, 1]), 25);
});

test('Review scores cannot overwrite canonical mastery through this component', () => {
  assert.doesNotMatch(review, /\.from\('user_concept_mastery'\)/);
  assert.doesNotMatch(review, /\.update\(|\.upsert\(|\.rpc\(/);
});

test('Historical Section Accuracy remains a separate legacy metric', () => {
  assert.match(tabs, /Historical Section Accuracy/);
  assert.match(tabs, /historical accuracy/);
  assert.equal(calculateHistoricalAccuracyPercent([1, 4]), 63);
});

test('unseen canonical mastery remains distinct from zero percent', () => {
  assert.deepEqual(presentCanonicalConceptMastery(null), {
    percent: null,
    label: 'Unseen',
    lastExposureAt: null,
  });
});

test('Concept Notes remain outside the Review semantic change', () => {
  assert.match(tabs, /<ConceptNotes conceptId=\{conceptId\}/);
  assert.match(notes, /loadConceptNote/);
  assert.match(notes, /saveConceptNote/);
  assert.match(notePersistence, /user_notes/);
  assert.doesNotMatch(review, /ConceptNotes|user_notes/);
});
