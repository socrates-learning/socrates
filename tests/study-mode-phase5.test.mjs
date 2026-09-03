import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const planner = await readFile(
  new URL('../components/StudyPlanner.tsx', import.meta.url),
  'utf8'
);
const migration = await readFile(
  new URL('../supabase/081_study_candidate_flags.sql', import.meta.url),
  'utf8'
);

test('official Add to this reuses one overlay without copying official content', () => {
  assert.match(planner, /matches\.length === 1 \? matches\[0\]\.personalConceptId/);
  assert.match(planner, /\.from\('personal_cards'\)[\s\S]*\.insert\(/);
  assert.match(planner, /Start with a blank private Card/);
  assert.doesNotMatch(
    planner.slice(
      planner.indexOf('async function saveAddToThisCard'),
      planner.indexOf('function openFlagModal')
    ),
    /\.from\('(questions|concepts|concept_placements)'\)/
  );
});

test('missing official overlay requires visible Topic and reuses Migration 078 RPC', () => {
  const addBody = planner.slice(
    planner.indexOf('async function saveAddToThisCard'),
    planner.indexOf('function openFlagModal')
  );
  assert.match(planner, /addToThisOverlayMatches\.length === 0/);
  assert.match(planner, /'create_personal_concept_overlay'/);
  assert.match(planner, /p_personal_topic_id: addToThisPersonalTopicId/);
  assert.match(planner, /p_official_concept_id: candidate\.conceptId/);
  assert.match(planner, /Create a personal Topic first/);
  assert.match(planner, /href="\/study-creator"/);
  assert.doesNotMatch(addBody, /\.from\('personal_topics'\)/);
});

test('ambiguous overlays and official placements require explicit selection', () => {
  assert.match(planner, /addToThisOverlayMatches\.length > 1/);
  assert.match(planner, /Choose a private Concept/);
  assert.match(planner, /officialCandidatePlacements\.length === 1/);
  assert.match(planner, /Choose the official location/);
  assert.match(
    planner,
    /setAddToThisConceptId\([\s\S]*matches\.length === 1[\s\S]*: ''/
  );
});

test('personal Add to this locks the sibling destination and avoids deck writes', () => {
  const addBody = planner.slice(
    planner.indexOf('async function saveAddToThisCard'),
    planner.indexOf('function openFlagModal')
  );
  assert.match(addBody, /candidate\.personalConceptId/);
  assert.match(planner, /Private Concept destination · locked/);
  assert.match(planner, /No Concept reassignment/);
  assert.doesNotMatch(
    addBody,
    /study_deck_personal_(topic|collection)_selections|personal_collection_cards/
  );
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

test('persistent controls do not reveal cards or change scheduling contracts', () => {
  const controls = planner.slice(
    planner.indexOf('const studyCardActions'),
    planner.indexOf('return (', planner.indexOf('const studyCardActions'))
  );
  assert.match(controls, /Add to this/);
  assert.match(controls, /Flag/);
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
