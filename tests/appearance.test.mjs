import { projectAccountSunrise } from './fixtures/account-sunrise.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadMediaModule } from './fixtures/content-media-images.mjs';
import { projectAppearance } from './fixtures/appearance.mjs';

const appearance = loadMediaModule('lib/appearance.ts');
test('unknown and absent preferences remain Light; only System follows the device', () => {
  for (const value of [undefined, null, {}, { socrates_appearance: 'dark' }]) assert.equal(appearance.accountAppearance(value), 'light');
  for (const choice of ['light', 'navy', 'midnight']) for (const dark of [false, true]) assert.equal(appearance.resolvedAppearance(choice, dark), choice);
  assert.equal(appearance.resolvedAppearance('system', true), 'navy');
  assert.equal(appearance.resolvedAppearance('system', false), 'light');
});
function fixture(role = 'learner', signedIn = true, failed = false) {
  const writes = [];
  const client = { auth: { getUser: async () => ({ data: { user: signedIn ? { id: 'owner' } : null } }), updateUser: async value => { writes.push(value); return { error: failed ? {} : null }; } }, from: () => ({ select: () => ({ eq: (_key, owner) => { assert.equal(owner, 'owner'); return { maybeSingle: async () => ({ data: { role } }) }; } }) }) };
  const server = loadMediaModule('lib/personal-profile-server.ts', { 'server-only': {}, '@/lib/supabase-server': { createSupabaseServerClient: async () => client } });
  const route = loadMediaModule('app/api/profile/appearance/route.ts', { '@/lib/appearance': appearance, '@/lib/personal-profile-server': server });
  return { writes, put: (body, origin = 'https://fixture.invalid') => route.PUT(new Request('https://fixture.invalid/api/profile/appearance', { method: 'PUT', headers: { origin, host: 'fixture.invalid' }, body: JSON.stringify(body) })) };
}
for (const role of ['admin', 'editor', 'learner']) test(`${role} can save only their own cosmetic metadata`, async () => {
  const f = fixture(role);
  for (const choice of appearance.APPEARANCES) {
    const response = await f.put({ appearance: choice });
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(JSON.parse(JSON.stringify(f.writes.at(-1))), { data: { socrates_appearance: choice } });
  }
});
test('appearance rejects cross-origin, anonymous, unapproved and injected fields before writing', async () => {
  for (const f of [fixture('learner', false), fixture(null)]) { assert.ok((await f.put({ appearance: 'navy' })).status >= 400); assert.equal(f.writes.length, 0); }
  const f = fixture();
  assert.equal((await f.put({ appearance: 'navy' }, 'https://other.invalid')).status, 403);
  for (const body of [{ appearance: 'dark' }, { appearance: 'navy', user_id: 'other' }, { appearance: 'navy', role: 'admin' }, [], null]) assert.equal((await f.put(body)).status, 400);
  assert.equal(f.writes.length, 0);
  assert.equal((await fixture('learner', true, true).put({ appearance: 'navy' })).status, 503);
});
test('color-only projection cannot hide layout or behavior changes', () => {
  assert.equal(projectAppearance('color: var(--appearance-text, #08143b);'), 'color: #08143b;');
  assert.throws(() => projectAppearance('width: var(--appearance-text, 300px);'));
  assert.notEqual(projectAppearance('width: 301px; color: var(--appearance-text, #08143b);'), 'width: 300px; color: #08143b;');
});
test('Account keeps the existing read model, switch destination and reset component', () => {
  const source = projectAccountSunrise('app/account/page.tsx', readFileSync('app/account/page.tsx', 'utf8'));
  assert.match(source, /LibrarySwitcher context=\{context\} returnTo="\/account"/);
  assert.match(source, /<ResetStudyProgress/);
  assert.match(source, /href="\/profile\?section=security"/);
  assert.doesNotMatch(source, /<SocratesShell|<Header|profile\/photo|<ProfileSecurity/);
  assert.match(source, /\.eq\('user_id', context\.user\.id\)/);
});
test('dark palette text and controls retain accessible contrast', () => {
  const luminance = hex => {
    const values = hex.match(/\w\w/g).map(c => parseInt(c, 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
    return .2126 * values[0] + .7152 * values[1] + .0722 * values[2];
  };
  for (const surface of ['101e33', '192b43', '101114', '1c1e24']) for (const ink of ['edf2fa', 'b5c3d8', '9cc7ff', 'ffadb7', '94dfb2', 'ffd494']) {
    assert.ok((luminance(ink) + .05) / (luminance(surface) + .05) >= 4.5, `${ink} on ${surface}`);
  }
});
