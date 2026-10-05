import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const studyStyles = await readFile(new URL('../components/study-planner/StudyModeStyles.tsx', import.meta.url), 'utf8');
const planner = await readFile(
  new URL('../components/StudyPlanner.tsx', import.meta.url),
  'utf8'
);
const migration = await readFile(
  new URL('../supabase/081_study_candidate_flags.sql', import.meta.url),
  'utf8'
);

test('retired Study authoring has no state, entry point, modal, or persistence path', () => {
  assert.doesNotMatch(planner, /AddToThis|addToThis|PersonalConceptOverlayMatch/);
  assert.doesNotMatch(planner, /getPersonalTopicPath|getOfficialCandidatePlacements|getOfficialCandidateConceptName/);
  assert.doesNotMatch(planner, /create_personal_concept_overlay|Start with a blank private Card|Choose a private Concept/);
  assert.doesNotMatch(planner, /\.insert\(/);
  // These Library-scoped bootstrap reads are not part of retired authoring.
  assert.match(planner, /setPersonalCards\(loaded\.personal_cards \|\| \[\]\)/);
  assert.match(planner, /setPersonalConcepts\(loaded\.personal_concepts \|\| \[\]\)/);
});

test('active Flag keeps its Escape handler and shared dialog presentation', () => {
  assert.match(planner, /if \(!isFlagModalOpen\) return;/);
  assert.match(planner, /if \(!isFlagSaving\) setIsFlagModalOpen\(false\);/);
  assert.match(planner, /\[isFlagModalOpen, isFlagSaving\]/);
  assert.match(planner, /className="study-v2-private-explainer"/);
  assert.match(studyStyles, /\.study-v2-private-explainer,/);
  for (const name of ['study-v2-modal-backdrop', 'study-v2-modal-form', 'study-v2-modal-footer']) {
    assert.ok(planner.includes(`className="${name}"`));
    assert.ok(studyStyles.includes(`.${name} {`));
  }
});

test('Study retains canonical candidate loading and official Concept Review', () => {
  assert.match(planner, /startStudySessionWithCandidate\(/);
  assert.match(planner, /selectNextStudyCandidate\(/);
  assert.match(planner, /loadOfficialStudyConceptReview\(/);
  assert.match(planner, /if \(candidate\?\.kind !== 'official' \|\| !activeLibrary\?\.id\) return;/);
});

test('official and personal responses retain their identity and evidence writers', () => {
  assert.match(planner, /record_study_session_attempt/);
  assert.match(planner, /recordPersonalStudyAttempt\(supabase,/);
  assert.match(planner, /personalConceptId: studyCandidate\.personalConceptId,/);
  assert.match(planner, /p_submission_id: submission\.id/);
  assert.match(planner, /submissionId: submission\.id/);
});

test('flag schema enforces target, note, uniqueness, ownership, and cascades', () => {
  assert.match(migration, /num_nonnulls\(question_id, personal_card_id\) = 1/);
  assert.match(migration, /nullif\(btrim\(coalesce\(new\.note, ''\)\), ''\)/);
  assert.match(migration, /char_length\(note\) <= 4000/);
  assert.match(migration, /unique \(user_id, question_id\)/);
  assert.match(migration, /unique \(user_id, personal_card_id\)/);
  assert.match(migration, /foreign key \(personal_card_id, user_id\)/);
  assert.match(migration, /references public\.personal_cards\(id, owner_id\)[\s\S]*on delete cascade/);
});

test('flag RLS is owner-only authenticated CRUD with no mutation RPC', () => {
  for (const operation of ['select', 'insert', 'update', 'delete']) {
    assert.match(migration, new RegExp(`for ${operation}[\\s\\S]*to authenticated`));
  }
  assert.match(migration, /user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /public\.has_socrates_role\(\)/);
  assert.match(migration, /revoke all on table public\.study_candidate_flags/);
  assert.match(migration, /grant select, insert, update, delete/);
  assert.doesNotMatch(migration, /security definer|create or replace function public\.(save|upsert|delete)_study_candidate_flag/);
});

test('Flag UX reloads per candidate and persists with RLS upsert and delete', () => {
  assert.match(planner, /useEffect\(\(\) => \{[\s\S]*loadCandidateFlag/);
  assert.match(planner, /\.from\('study_candidate_flags'\)[\s\S]*\.maybeSingle\(\)/);
  assert.match(planner, /\.upsert\(payload, \{ onConflict: `user_id,\$\{targetColumn\}` \}\)/);
  assert.match(planner, /Remove Flag/);
  assert.match(planner, /Save Changes/);
  assert.match(planner, /aria-live="polite"/);
  assert.match(planner, /study-v2-flag-action-active/);
});

test('Study controls remove Add to this while preserving Flag and scheduling contracts', () => {
  const controls = planner.slice(
    planner.indexOf('const studyCardActions'),
    planner.indexOf('return (', planner.indexOf('const studyCardActions'))
  );
  assert.doesNotMatch(controls, /Add to this|openAddToThis/);
  assert.match(controls, /Flag/);
  assert.match(controls, /Back to question/);
  assert.match(controls, />\s*Exit\s*<\/button>/);
  assert.doesNotMatch(controls, /Close study mode|>\s*×\s*<\/button>/);
  assert.match(controls, /event\.stopPropagation\(\)/);
  assert.match(controls, /onKeyDown=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(planner, /Report an error/);
  assert.match(planner, /Suggest an improvement/);
  const migrationStatements = migration.replace(/^--.*$/gm, '');
  assert.doesNotMatch(
    migrationStatements,
    /resolve_study_candidates|select_next_study_candidate|mastery|priority/
  );
});
