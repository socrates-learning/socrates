import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../supabase/100_atomic_personal_topic_creation.sql', import.meta.url),
  'utf8'
);
const creatorSource = readFileSync(
  new URL('../components/CreatorStudioV2Client.tsx', import.meta.url),
  'utf8'
);

test('Migration 100 is a function-only atomic Topic creation contract', () => {
  assert.match(migration, /^begin;/m);
  assert.match(migration, /create function public\.create_personal_topic\(/);
  assert.match(migration, /security definer\s+set search_path = ''/);
  assert.match(migration, /caller_id uuid := \(select auth\.uid\(\)\)/);
  assert.doesNotMatch(migration, /p_owner_id|create table|alter table/i);
  assert.match(migration, /insert into public\.personal_topics/);
  assert.match(migration, /public\.set_personal_topic_official_placement/);
  assert.match(migration, /A child personal Topic cannot have a direct official placement/);
  assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function[\s\S]*to authenticated/);
  assert.match(migration, /commit;\s*$/);
});

test('Creator uses one RPC for create plus optional placement, never two browser writes', () => {
  assert.match(creatorSource, /\.rpc\('create_personal_topic'/);
  assert.doesNotMatch(
    creatorSource,
    /\.from\('personal_topics'\)\s*\.insert/
  );
  assert.match(creatorSource, /p_parent_personal_topic_id:/);
  assert.match(creatorSource, /p_official_library_node_id:/);
  assert.match(creatorSource, /\.rpc\('set_personal_topic_official_placement'/);
});

test('Migration 100 does not touch Study, learner state, official content, or Migration 099 storage', () => {
  assert.doesNotMatch(
    migration,
    /review_attempts|study_sessions|study_decks|user_concept_mastery|user_concept_testing_angle_state|concepts|questions/
  );
  assert.doesNotMatch(
    migration,
    /insert into public\.personal_topic_official_placements|update public\.personal_topic_official_placements|delete from public\.personal_topic_official_placements/
  );
});
