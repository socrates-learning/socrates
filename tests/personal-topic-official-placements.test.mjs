import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migrationSource = readFileSync(
  new URL('../supabase/099_personal_topic_official_placements.sql', import.meta.url),
  'utf8'
);
const bootstrapSource = readFileSync(
  new URL('../lib/creator-personal-content.ts', import.meta.url),
  'utf8'
);

test('Migration 099 adds one canonical placement per personal root Topic', () => {
  assert.match(migrationSource, /create table public\.personal_topic_official_placements/);
  assert.match(migrationSource, /unique \(personal_topic_id\)/);
  assert.match(migrationSource, /generated always as \(parent_id is null\) stored/);
  assert.match(
    migrationSource,
    /foreign key \([\s\S]*personal_topic_id,[\s\S]*owner_id,[\s\S]*official_placement_root_required[\s\S]*references public\.personal_topics/
  );
  assert.match(migrationSource, /check \(official_placement_root_required\)/);
});

test('official node deletion removes only placement metadata', () => {
  assert.match(
    migrationSource,
    /personal_topic_official_placements_node_fkey[\s\S]*references public\.library_nodes\(id\)[\s\S]*on delete cascade/
  );
  assert.match(
    migrationSource,
    /personal_topic_official_placements_root_owner_fkey[\s\S]*references public\.personal_topics[\s\S]*on update restrict[\s\S]*on delete cascade/
  );
  assert.doesNotMatch(migrationSource, /delete from public\.personal_topics/);
});

test('one hardened idempotent RPC sets moves and removes owned placements', () => {
  assert.match(
    migrationSource,
    /create function public\.set_personal_topic_official_placement\([\s\S]*security definer[\s\S]*set search_path = ''/
  );
  assert.match(migrationSource, /caller_id uuid := \(select auth\.uid\(\)\)/);
  assert.match(migrationSource, /where topic\.id = p_personal_topic_id[\s\S]*topic\.owner_id = caller_id[\s\S]*for update/);
  assert.match(migrationSource, /on conflict on constraint personal_topic_official_placements_topic_key do update/);
  assert.match(migrationSource, /if p_library_node_id is null then[\s\S]*delete from public\.personal_topic_official_placements/);
  assert.match(migrationSource, /library_record\.status = 'active'/);
  assert.match(migrationSource, /membership\.user_id = caller_id/);
});

test('placement table and RPC are owner-scoped with minimum client ACLs', () => {
  for (const operation of ['read', 'create', 'update', 'delete']) {
    assert.match(
      migrationSource,
      new RegExp(`Users ${operation} own personal Topic official placements`)
    );
  }
  assert.match(
    migrationSource,
    /revoke all on table public\.personal_topic_official_placements[\s\S]*from public, anon, authenticated/
  );
  assert.match(
    migrationSource,
    /revoke all on function public\.set_personal_topic_official_placement\(uuid, uuid\)[\s\S]*from public, anon, authenticated/
  );
  assert.match(
    migrationSource,
    /grant execute on function public\.set_personal_topic_official_placement\(uuid, uuid\)[\s\S]*to authenticated/
  );
});

test('Creator personal bootstrap adds one bounded placement read without per-Topic requests', () => {
  assert.match(bootstrapSource, /export type CreatorPersonalTopicPlacement/);
  assert.match(bootstrapSource, /topicPlacements: CreatorPersonalTopicPlacement\[\]/);
  assert.match(bootstrapSource, /Promise\.all\(\[/);
  assert.match(bootstrapSource, /\.from\('personal_topic_official_placements'\)/);
  assert.match(bootstrapSource, /\.eq\('owner_id', ownerId\)/);
  assert.doesNotMatch(bootstrapSource, /personalTopics\.map\([\s\S]{0,180}personal_topic_official_placements/);
});
