import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../supabase/079_personal_collections.sql', import.meta.url), 'utf8');
const client = await readFile(new URL('../components/StudyCreatorClient.tsx', import.meta.url), 'utf8');
const browser = await readFile(new URL('../components/PersonalDecksBrowser.tsx', import.meta.url), 'utf8');
const planner = await readFile(new URL('../components/StudyPlanner.tsx', import.meta.url), 'utf8');

test('migration creates owner-global collections and Card-only memberships', () => {
  assert.match(migration, /create table public\.personal_collections/);
  assert.match(migration, /create table public\.personal_collection_cards/);
  assert.doesNotMatch(migration, /library_id/);
  assert.doesNotMatch(migration, /personal_concept_id/);
  assert.match(migration, /foreign key \(collection_id, owner_id\)/);
  assert.match(migration, /foreign key \(personal_card_id, owner_id\)/);
  assert.match(migration, /grant select, insert, delete on table public\.personal_collection_cards/);
  assert.doesNotMatch(migration, /grant[^;]*update[^;]*personal_collection_cards/);
});

test('Study Creator adds Personal Decks as a peer without changing study selection', () => {
  assert.match(client, /'mine' \| 'socrates' \| 'decks'/);
  assert.match(client, />\s*Personal Decks\s*<\/button>/);
  assert.match(client, /<PersonalDecksBrowser/);
  assert.doesNotMatch(browser, /study_decks|resolve_study_candidates|library_id/);
});

test('Personal Deck UI keeps memberships Card-only and owner-scoped', () => {
  assert.match(browser, /\.from\('personal_collections'\)/);
  assert.match(browser, /\.from\('personal_collection_cards'\)/);
  assert.match(browser, /personal_card_id:/);
  assert.match(browser, /\.eq\('owner_id', ownerId\)/);
  assert.match(browser, /Future Cards are not added automatically/);
  assert.match(browser, /underlying Card, Concept, Topic, and learning-history record is preserved/);
});

test('Personal Deck content is grouped Topic then Concept', () => {
  assert.match(browser, /topicGroup/);
  assert.match(browser, /conceptGroup/);
  assert.match(browser, /topicPath\(group\.topic\.id\)/);
  assert.match(browser, /Search selected Personal Deck/);
  assert.match(browser, /Search available personal material/);
});

test('Study Creator mode switch remains a peer while Set Up Deck owns selection', () => {
  assert.match(client, /'mine' \| 'socrates' \| 'decks'/);
  assert.match(client, /My Topics/);
  assert.match(client, /Socrates/);
  assert.match(client, /Personal Decks/);
  assert.doesNotMatch(browser, /study_deck_personal_collection_selections/);
  assert.match(planner, /study_deck_personal_collection_selections/);
});
