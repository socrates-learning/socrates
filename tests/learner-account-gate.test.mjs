import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../supabase/097_authorized_learner_provisioning.sql', import.meta.url),
  'utf8'
);
const adminPage = readFileSync(
  new URL('../app/admin/users/page.tsx', import.meta.url),
  'utf8'
);
const libraryContext = readFileSync(
  new URL('../lib/library-context.ts', import.meta.url),
  'utf8'
);
const librarySwitcher = readFileSync(
  new URL('../components/LibrarySwitcher.tsx', import.meta.url),
  'utf8'
);
const switchRoute = readFileSync(
  new URL('../app/library/switch/route.ts', import.meta.url),
  'utf8'
);

test('provisioning is an explicit admin action, never an auth.users trigger', () => {
  assert.match(migration, /create or replace function public\.provision_invited_learner/);
  assert.match(migration, /caller_role\.role = 'admin'/);
  assert.doesNotMatch(migration, /create trigger[^;]+on auth\.users/is);
  assert.match(migration, /must not be attached to auth\.users/);
});

test('the provisioning contract cannot accept a role, user id, or Library id', () => {
  assert.match(migration, /provision_invited_learner\(\s*target_email text\s*\)/);
  assert.doesNotMatch(migration, /provision_invited_learner\([^)]*(role|user_id|library_id)/is);
  assert.match(migration, /values \(target_user_id, 'learner'\)/);
});

test('Nursing policy is represented by one protected database reference', () => {
  assert.match(migration, /create table public\.learner_account_defaults/);
  assert.match(migration, /default_library_id uuid not null unique/);
  assert.match(migration, /references public\.libraries\(id\) on delete restrict/);
  assert.match(migration, /fd6ba480-e665-4bfd-9f06-fe0f24ec4964/);
  assert.match(migration, /library_row\.slug = 'nursing'/);
  assert.match(migration, /library_row\.status = 'active'/);
  assert.match(migration, /revoke all on table public\.learner_account_defaults/);
});

test('the existing Admin role selector provisions only pending learners', () => {
  assert.match(adminPage, /role === 'learner' && !currentRole/);
  assert.match(adminPage, /supabase\.rpc\('provision_invited_learner'/);
  assert.match(adminPage, /supabase\.rpc\('set_user_role_by_email'/);
  assert.match(adminPage, /<option value="learner">Learner<\/option>/);
});

test('learner Library switching is membership-scoped end to end', () => {
  assert.match(libraryContext, /const canSwitch = memberships\.length > 1/);
  assert.match(libraryContext, /cookieMembership \|\| primaryMembership \|\| soleMembership/);
  assert.match(librarySwitcher, /from\('user_libraries'\)/);
  assert.match(librarySwitcher, /\.eq\('user_id', context\.user\?\.id \|\| ''\)/);
  assert.match(switchRoute, /role !== 'learner'/);
  assert.match(switchRoute, /from\('user_libraries'\)/);
  assert.match(switchRoute, /\.eq\('user_id', user\.id\)/);
  assert.match(switchRoute, /Library access denied/);
});

test('Creator learner cohort configuration remains independent', () => {
  const learnerAccountRelease = [
    migration,
    adminPage,
    libraryContext,
    librarySwitcher,
    switchRoute,
  ].join('\n');

  assert.doesNotMatch(
    learnerAccountRelease,
    /SOCRATES_CREATOR_LEARNER_USER_IDS|creator-route-access|creator-unified/
  );
});
