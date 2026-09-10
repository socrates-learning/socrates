import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const client = await readFile(
  new URL('../components/StudyCreatorClient.tsx', import.meta.url),
  'utf8'
);
const flagged = await readFile(
  new URL('../components/StudyCreatorFlaggedBrowser.tsx', import.meta.url),
  'utf8'
);

test('Study Creator exposes Browse, Flagged, and Personal Decks only', () => {
  assert.match(client, />\s*Browse\s*<\/button>/);
  assert.match(client, />\s*Flagged\s*<\/button>/);
  assert.match(client, />\s*Personal Decks\s*<\/button>/);
  assert.doesNotMatch(client, />\s*My Topics\s*<\/button>/);
  assert.doesNotMatch(client, />\s*Socrates\s*<\/button>/);
});

test('Flagged browser reads and removes only owner-scoped flags', () => {
  assert.match(flagged, /\.from\('study_candidate_flags'\)/);
  assert.match(flagged, /\.eq\('user_id', ownerId\)/);
  assert.match(flagged, /\.delete\(\)/);
  assert.match(flagged, /'Unflag'/);
  assert.doesNotMatch(flagged, /\.insert\(|\.update\(|\.upsert\(/);
});

test('Flagged browser resolves official Questions and personal Cards without editing official content', () => {
  assert.match(flagged, /\.from\('questions'\)/);
  assert.match(flagged, /\.from\('concepts'\)/);
  assert.match(flagged, /material\.cards\.find/);
  assert.match(flagged, /styles\.officialOwnerMark/);
  assert.match(flagged, /styles\.personalOwnerMark/);
  assert.match(flagged, /'Socrates' : 'Mine'/);
  assert.doesNotMatch(flagged, /personal_cards'\)\s*\.update|questions'\)\s*\.update/);
});
