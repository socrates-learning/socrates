import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EMPTY_STUDY_DECK_ERROR,
  classifyStudySessionStart,
} from '../lib/study-session-start.ts';
import { readFileSync } from 'node:fs';

test('the exact empty-deck domain exception gets the friendly classification', () => {
  assert.deepEqual(
    classifyStudySessionStart(null, { message: EMPTY_STUDY_DECK_ERROR }),
    { kind: 'empty-deck' }
  );
});

test('an unrelated RPC failure remains a genuine error', () => {
  assert.deepEqual(
    classifyStudySessionStart(null, { message: 'Database connection failed.' }),
    { kind: 'error' }
  );
});

test('a valid Study session start remains unchanged', () => {
  assert.deepEqual(classifyStudySessionStart('session-123', null), {
    kind: 'started',
    sessionId: 'session-123',
  });
});

test('a missing session ID without the domain exception remains an error', () => {
  assert.deepEqual(classifyStudySessionStart(null, null), { kind: 'error' });
});

test('Personal-Deck-only eligibility reaches the unchanged session start contract', () => {
  const migration = readFileSync(
    new URL('../supabase/080_personal_collection_study_selections.sql', import.meta.url),
    'utf8'
  );
  const planner = readFileSync(
    new URL('../components/StudyPlanner.tsx', import.meta.url),
    'utf8'
  );

  assert.match(migration, /eligible_personal_cards as/);
  assert.match(migration, /study_deck_personal_collection_selections/);
  assert.match(migration, /union[\s\S]*select membership\.personal_card_id/);
  assert.match(planner, /supabase\.rpc\('start_study_session'/);
  assert.doesNotMatch(migration, /create or replace function public\.start_study_session/);
});

test('empty Personal Deck membership cannot emit a false personal candidate', () => {
  const migration = readFileSync(
    new URL('../supabase/080_personal_collection_study_selections.sql', import.meta.url),
    'utf8'
  );

  assert.match(
    migration,
    /join public\.personal_collection_cards membership[\s\S]*membership\.collection_id = collection\.id/
  );
  assert.doesNotMatch(migration, /left join public\.personal_collection_cards/);
});
