import test from 'node:test';
import assert from 'node:assert/strict';
import { loadMediaModule } from './fixtures/content-media-images.mjs';

const profile = loadMediaModule('lib/personal-profile.ts');
function fixture(options = {}) {
  const calls = [];
  const user = { id: 'profile-owner', email: 'owner@example.invalid' };
  const client = { auth: {
    getUser: async () => ({ data: { user: options.anonymous ? null : user }, error: null }),
    updateUser: async (...args) => { calls.push(['update', ...args]); return { error: options.updateError || null }; },
    reauthenticate: async () => { calls.push(['reauthenticate']); return { error: null }; },
  }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'learner' } }) }) }) }) };
  const check = { auth: {
    signInWithPassword: async input => { calls.push(['verify', input.email]); return { data: { user: { id: options.wrongUser ? 'other' : user.id }, session: options.wrongPassword ? null : {} }, error: options.wrongPassword ? {} : null }; },
    signOut: async input => { calls.push(['revoke', input.scope]); return { error: options.cleanupError ? {} : null }; },
  } };
  const server = loadMediaModule('lib/personal-profile-server.ts', { 'server-only': {}, '@/lib/supabase-server': { createSupabaseServerClient: async () => client } });
  const route = loadMediaModule('app/api/profile/security/route.ts', {
    '@/lib/personal-profile-server': server,
    '@supabase/supabase-js': { createClient: (_url, _key, config) => { assert.equal(config.auth.persistSession, false); assert.equal(config.auth.autoRefreshToken, false); return check; } },
  });
  return { calls, post: (body, origin = 'https://fixture.invalid') => route.POST(new Request('https://fixture.invalid/api/profile/security', { method: 'POST', headers: { origin, host: 'fixture.invalid' }, body: JSON.stringify(body) })) };
}
const password = { action: 'password', currentPassword: 'disposable-current', password: 'disposable-next-password', confirmPassword: 'disposable-next-password' };
test('profile details are bounded private metadata and reject unauthorized fields', () => {
  const details = { username: ' Alex_123 ', location: '  Boise  ', age: 26, language: 'en', timeZone: 'America/Boise' };
  const result = profile.normalizePersonalDetails(details);
  assert.equal(result.username, 'alex_123'); assert.equal(result.location, 'Boise');
  for (const invalid of [{ ...details, role: 'admin' }, { ...details, age: -1 }, { ...details, age: 1.5 }, { ...details, timeZone: 'Not/a-zone' }, { ...details, language: 'bad' }, { ...details, username: '<script>' }]) assert.throws(() => profile.normalizePersonalDetails(invalid));
  assert.equal(profile.profilePersonalDetails({}).age, null);
});
test('password change verifies current credentials and revokes only check session before updating original session', async () => {
  const f = fixture(), response = await f.post(password);
  assert.equal(response.status, 200);
  assert.deepEqual(f.calls.map(c => c[0]), ['verify', 'revoke', 'update']);
  assert.equal(f.calls[1][1], 'local'); assert.equal(f.calls[2][1].current_password, password.currentPassword);
});
for (const options of [{ wrongPassword: true }, { wrongUser: true }, { cleanupError: true }]) test(`credential or cleanup failure never updates account: ${JSON.stringify(options)}`, async () => {
  const f = fixture(options); assert.ok((await f.post(password)).status >= 400); assert.ok(!f.calls.some(c => c[0] === 'update'));
});
test('email uses supported verification redirect and does not overwrite metadata or tables', async () => {
  const f = fixture(), response = await f.post({ action: 'email', email: 'new@example.invalid', currentPassword: 'disposable-current' });
  assert.equal(response.status, 200); assert.match((await response.json()).message, /until verification/);
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls[2].slice(1))), [{ email: 'new@example.invalid' }, { emailRedirectTo: 'https://fixture.invalid/auth/callback?next=/profile' }]);
});
test('origin, unauthenticated, field and password validation reject before changing credentials', async () => {
  assert.equal((await fixture().post(password, 'https://other.invalid')).status, 403);
  assert.equal((await fixture({ anonymous: true }).post(password)).status, 401);
  for (const input of [{ ...password, confirmPassword: 'mismatch' }, { ...password, password: 'short' }, { ...password, currentPassword: '' }, { ...password, role: 'admin' }]) {
    const f = fixture(); assert.equal((await f.post(input)).status, 400); assert.equal(f.calls.length, 0);
  }
});
test('provider reauthentication requirements remain enforced and nonce is forwarded', async () => {
  const f = fixture({ updateError: { code: 'reauthentication_needed' } }), response = await f.post(password);
  assert.equal(response.status, 403); assert.equal((await response.json()).reauthenticationRequired, true);
  const success = fixture(); assert.equal((await success.post({ ...password, nonce: '123456' })).status, 200); assert.equal(success.calls[2][1].nonce, '123456');
  assert.equal((await success.post({ action: 'reauthenticate' })).status, 200);
});
