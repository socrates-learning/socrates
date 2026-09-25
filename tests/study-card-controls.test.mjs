import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const planner = readFileSync(
  new URL('../components/StudyPlanner.tsx', import.meta.url),
  'utf8'
);
const feedbackMigration = readFileSync(
  new URL('../supabase/066_study_card_feedback.sql', import.meta.url),
  'utf8'
);
const controls = planner.slice(
  planner.indexOf('const studyCardActions'),
  planner.indexOf('return (', planner.indexOf('const studyCardActions'))
);
const questionFront = planner.slice(
  planner.indexOf(') : !isAnswerVisible ? ('),
  planner.indexOf(') : (', planner.indexOf(') : !isAnswerVisible ? ('))
);
const feedbackControls = planner.slice(
  planner.indexOf('{studyFeedback === null ? ('),
  planner.indexOf(") : studyFeedback === 'more' ? (")
);
const backHandler = planner.slice(
  planner.indexOf('  function returnToStudyQuestion()'),
  planner.indexOf('  async function loadStudyConceptReview')
);

test('front controls contain Flag and one clean Exit but no Study Add to this entry point', () => {
  assert.match(controls, /isCandidateFlagLoading \? 'Loading…' : 'Flag'/);
  assert.match(controls, />\s*Exit\s*<\/button>/);
  assert.equal((controls.match(/>\s*Exit\s*<\/button>/g) || []).length, 1);
  assert.doesNotMatch(controls, /Add to this|openAddToThis|Close study mode|>\s*×\s*<\/button>/);
});

test('question front removes visible reveal copy but retains pointer and keyboard reveal', () => {
  assert.doesNotMatch(questionFront, /Tap to reveal answer/);
  assert.match(questionFront, /study-v2-sr-only/);
  assert.match(questionFront, /Press Enter or Space, or activate the card, to reveal the answer/);
  assert.match(planner, /onClick=\{[\s\S]*?setIsAnswerVisible\(true\)/);
  assert.match(planner, /event\.key === 'Enter' \|\| event\.key === ' '/);
  assert.match(planner, /role=\{!hasStudyCandidate \|\| isAnswerVisible \? undefined : 'button'\}/);
  assert.match(planner, /tabIndex=\{!hasStudyCandidate \|\| isAnswerVisible \? undefined : 0\}/);
});

test('Back restores the same question view using UI state only', () => {
  const compiled = ts.transpileModule(
    `${backHandler}\nglobalThis.returnToStudyQuestion = returnToStudyQuestion;`,
    {}
  ).outputText;
  const calls = [];
  const context = {
    studySubmissionStatus: 'idle',
    studyResponseSaveLock: { current: false },
    studyResponseRecordedForCard: { current: false },
    resetStudyCardFeedback: () => calls.push('reset-feedback'),
    setStudyFeedback: (value) => calls.push(['feedback', value]),
    setStudyResponse: (value) => calls.push(['response', value]),
    setIsAnswerVisible: (value) => calls.push(['answer-visible', value]),
  };
  vm.createContext(context);
  vm.runInContext(compiled, context);
  context.returnToStudyQuestion();
  assert.deepEqual(calls, [
    'reset-feedback',
    ['feedback', null],
    ['response', null],
    ['answer-visible', false],
  ]);
  assert.doesNotMatch(
    backHandler,
    /supabase|rpc\(|review_attempts|mastery|testing_angle|answered_count|selectNextStudyCandidate|persistFinalStudyResponse/
  );
});

test('Back is fail-closed after a response save begins', () => {
  const compiled = ts.transpileModule(
    `${backHandler}\nglobalThis.returnToStudyQuestion = returnToStudyQuestion;`,
    {}
  ).outputText;
  const calls = [];
  const context = {
    studySubmissionStatus: 'saving',
    studyResponseSaveLock: { current: true },
    studyResponseRecordedForCard: { current: false },
    resetStudyCardFeedback: () => calls.push('reset-feedback'),
    setStudyFeedback: () => calls.push('feedback'),
    setStudyResponse: () => calls.push('response'),
    setIsAnswerVisible: () => calls.push('answer-visible'),
  };
  vm.createContext(context);
  vm.runInContext(compiled, context);
  context.returnToStudyQuestion();
  assert.deepEqual(calls, []);
});

test('answer controls expose Back without changing the candidate identity', () => {
  assert.match(controls, /hasStudyCandidate && isAnswerVisible/);
  assert.match(controls, /aria-label="Back to question"/);
  assert.match(controls, /returnToStudyQuestion\(\)/);
  assert.doesNotMatch(backHandler, /setStudyCandidate|setIsStudySequenceComplete/);
});

test('feedback controls show compact emoji, Other, emoji pattern with accessible names', () => {
  assert.match(feedbackControls, /\['up', 'Thumbs up'\]/);
  assert.match(feedbackControls, /\['more', 'Other'\]/);
  assert.match(feedbackControls, /\['down', 'Thumbs down'\]/);
  assert.match(feedbackControls, /aria-label=\{label\}/);
  assert.match(feedbackControls, /title=\{label\}/);
  assert.doesNotMatch(feedbackControls, /<span>\{label\}<\/span>/);
  assert.match(planner, /type === 'up' \? '👍' : '👎'/);
  assert.match(
    planner,
    /\.study-v2-feedback-emoji \{[\s\S]*?font-size: 24px;[\s\S]*?height: 30px;[\s\S]*?width: 30px;/
  );
  assert.match(planner, /\.study-v2-feedback-row button \{[\s\S]*?min-height: 80px;/);
});

test('Other reuses the established error and suggestion reporting workflow', () => {
  assert.match(planner, /function openStudyCardMorePanel\(\)/);
  assert.match(planner, /Report an error/);
  assert.match(planner, /Suggest an improvement/);
  assert.match(planner, /\.rpc\('submit_study_card_feedback'/);
  assert.match(feedbackMigration, /feedback_type in \('error', 'suggestion'\)/);
  assert.match(feedbackMigration, /insert into public\.study_card_feedback/);
  assert.match(feedbackMigration, /grant execute on function public\.submit_study_card_feedback/);
  assert.doesNotMatch(
    feedbackMigration,
    /record_study_session_attempt|review_attempts|user_concept_mastery|user_concept_testing_angle_state|answered_count/
  );
});

test('narrow layouts retain horizontal feedback controls and usable targets', () => {
  const narrowStyles = planner.slice(planner.indexOf('@media (max-width: 900px)'));
  assert.doesNotMatch(
    narrowStyles,
    /\.study-v2-feedback-row \{\s*grid-template-columns: 1fr;/
  );
  assert.match(planner, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(planner, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(
    planner,
    /\.study-v2-question-content \{[\s\S]*?min-height: 0;[\s\S]*?overflow-y: auto;/
  );
  assert.match(planner, /\.study-v2-answer-body \{[\s\S]*?overflow-y: auto;/);
});

test('six-response persistence and Review Concept remain on their existing paths', () => {
  for (const response of [
    'easy',
    'average',
    'hard',
    'didnt_know',
    'forgot',
    'too_hard',
  ]) {
    assert.match(planner, new RegExp(`'${response}'`));
  }
  assert.match(planner, /\.rpc\('record_study_session_attempt'/);
  assert.match(planner, /recordPersonalStudyAttempt\(supabase/);
  assert.match(planner, />\s*Review Concept\s*<\/button>/);
});
