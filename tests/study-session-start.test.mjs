import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EMPTY_STUDY_DECK_ERROR,
  classifyStudySessionStart,
} from '../lib/study-session-start.ts';

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
