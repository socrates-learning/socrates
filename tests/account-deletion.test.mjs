import test from 'node:test';
import assert from 'node:assert/strict';
import { loadMediaModule } from './fixtures/content-media-images.mjs';

const core = loadMediaModule('lib/account-deletion.ts');
const request = { confirmation: 'DELETE', password: 'disposable-password' };
test('deletion requires exact confirmation and credentials, rejects identity injection', () => {
  assert.equal(core.deletionInput(request).password, request.password);
  for (const body of [null, [], {}, { ...request, confirmation: 'delete' }, { ...request, password: '' }, { ...request, password: 'a'.repeat(1025) }, { ...request, userId: 'other' }, { ...request, role: 'admin' }]) assert.throws(() => core.deletionInput(body));
});
function worker(options = {}) {
  const calls = []; let state = options.complete ? 'complete' : 'pending';
  const service = {
    async status() { return options.unknown ? null : { userId: 'server-derived-owner', state, objects: options.objects || [{ bucket: 'socrates-profile-photos', name: 'owner/avatar' }] }; },
    async recordIntent(id) { calls.push(['ledger', id]); if (options.ledgerFailure) throw new Error('Ledger unavailable'); },
    async remove(bucket, names) { calls.push(['storage', bucket, names]); if (options.storageFailure) throw new Error('Storage unavailable'); },
    async deleteIdentity(id) { calls.push(['auth', id]); if (!options.authFailure) state = 'complete'; if (options.authFailure || options.lostResponse) throw new Error('Auth unavailable'); },
  };
  return { calls, service, options };
}
test('Storage cleanup precedes hard Auth deletion and completion is verified', async () => {
  const f = worker(); await core.continueDeletion(f.service, 'hash');
  assert.deepEqual(f.calls.map(c => c[0]), ['ledger', 'storage', 'auth']); assert.equal(f.calls[2][1], 'server-derived-owner');
});
test('Storage failure never deletes Auth; retry finishes the already confirmed operation', async () => {
  const f = worker({ storageFailure: true }); await assert.rejects(core.continueDeletion(f.service, 'hash'));
  assert.ok(!f.calls.some(c => c[0] === 'auth')); f.options.storageFailure = false;
  await core.continueDeletion(f.service, 'hash'); assert.equal(f.calls.at(-1)[0], 'auth');
});
test('Auth failure remains pending and retries safely without reporting success', async () => {
  const f = worker({ authFailure: true }); await assert.rejects(core.continueDeletion(f.service, 'hash'));
  f.options.authFailure = false; await core.continueDeletion(f.service, 'hash');
  const count = f.calls.length; await core.continueDeletion(f.service, 'hash'); assert.equal(f.calls.length, count);
});
test('lost Auth response and duplicate completion reconcile against durable DB status', async () => {
  const f = worker({ lostResponse: true }); await core.continueDeletion(f.service, 'hash');
  const count = f.calls.length; await core.continueDeletion(f.service, 'hash'); assert.equal(f.calls.length, count);
});
test('unknown receipt cannot initiate any deletion', async () => {
  const f = worker({ unknown: true }); await assert.rejects(core.continueDeletion(f.service, 'unknown')); assert.equal(f.calls.length, 0);
});
test('Storage destinations come from the server inventory and are bounded into batches', async () => {
  const f = worker({ objects: Array.from({ length: 205 }, (_, i) => ({ bucket: 'socrates-content-media', name: `library/asset-${i}` })) });
  await core.continueDeletion(f.service, 'hash'); assert.deepEqual(f.calls.filter(c => c[0] === 'storage').map(c => c[2].length), [100, 100, 5]);
  const invalid = worker({ objects: [{ bucket: 'official-unrelated', name: 'arbitrary' }] });
  await assert.rejects(core.continueDeletion(invalid.service, 'hash')); assert.equal(invalid.calls.length, 0);
});

function routeFixture(options = {}) {
  const calls = [], jar = new Map(); const user = { id: 'owner', email: 'owner@example.invalid', factors: options.mfa ? [{ status: 'verified' }] : [] };
  const client = { auth: {
    getUser: async () => ({ data: { user: options.anonymous ? null : options.otherSignedIn ? { ...user, id: 'other' } : user }, error: null }),
    mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: options.aal2 ? 'aal2' : 'aal1' }, error: null }) },
    signOut: async () => { calls.push('browser-signout'); return { error: null }; },
  } };
  const check = { auth: {
    signInWithPassword: async input => { calls.push(['reauth', input.email]); return { data: { user: { id: options.wrongUser ? 'other' : user.id }, session: options.wrongPassword ? null : {} }, error: null }; },
    signOut: async input => { calls.push(['cleanup', input.scope]); return { error: options.cleanupFailure ? {} : null }; },
  } };
  let pending = false, complete = false;
  const admin = { rpc: async (name, args) => {
    calls.push([name, args]);
    const error = options.finalAdmin ? { code: 'P1391', message: 'private database detail' } : options.databaseFailure ? {} : null;
    if (!error) pending = true;
    return { error };
  } };
  const service = { status: async () => pending ? { userId: 'owner', state: complete ? 'complete' : 'pending', objects: [] } : null,
    recordIntent: async id => { calls.push(['ledger', id]); },
    remove: async () => { calls.push('remove'); }, deleteIdentity: async id => { calls.push(['delete', id]); complete = true; } };
  const server = loadMediaModule('lib/personal-profile-server.ts', { 'server-only': {}, '@/lib/supabase-server': { createSupabaseServerClient: async () => client } });
  const deletion = loadMediaModule('lib/account-deletion-server.ts', { 'server-only': {}, '@supabase/supabase-js': {}, './account-deletion-ledger.mjs': { createDeletionLedger: () => ({ assertReady: async () => { if (options.ledgerFailure) throw new Error('Unavailable'); } }), ledgerConfig: () => ({}) } });
  const route = loadMediaModule('app/api/account/deletion/route.ts', {
    'next/headers': { cookies: async () => ({ get: key => jar.get(key), set: (key, value, config) => { calls.push(['cookie', config]); jar.set(key, { value }); } }) },
    '@supabase/supabase-js': { createClient: () => check },
    '@/lib/supabase-server': { createSupabaseServerClient: async () => client },
    '@/lib/personal-profile-server': server, '@/lib/account-deletion': core,
    '@/lib/account-deletion-server': { ...deletion, deletionAdmin: () => admin, deletionService: () => service },
  });
  const http = (method, body, origin = 'https://fixture.invalid') => new Request('https://fixture.invalid/api/account/deletion', { method, headers: { origin, host: 'fixture.invalid' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { calls, jar, options, post: (body = request, origin) => route.POST(http('POST', body, origin)), finish: origin => route.DELETE(http('DELETE', null, origin)), get: route.GET };
}
test('start verifies current owner and revokes temporary session before issuing a restricted HttpOnly receipt', async () => {
  const f = routeFixture(); const response = await f.post(); assert.equal(response.status, 200);
  assert.deepEqual(f.calls.slice(0, 2), [['reauth', 'owner@example.invalid'], ['cleanup', 'local']]);
  const args = f.calls.find(c => Array.isArray(c) && c[0] === 'begin_account_deletion')[1]; assert.equal(args.p_user, 'owner'); assert.match(args.p_receipt_hash, /^[0-9a-f]{64}$/);
  const config = f.calls.find(c => Array.isArray(c) && c[0] === 'cookie')[1]; assert.equal(config.httpOnly, true); assert.equal(config.secure, true); assert.equal(config.sameSite, 'strict');
  assert.ok(!JSON.stringify(await response.json()).includes('owner')); assert.ok(!f.calls.some(c => c[0] === 'delete'));
});
for (const option of ['anonymous', 'wrongPassword', 'wrongUser', 'cleanupFailure', 'databaseFailure', 'ledgerFailure', 'mfa']) test(`${option} cannot proceed to deletion`, async () => {
  const f = routeFixture({ [option]: true }); assert.ok((await f.post()).status >= 400); assert.equal(f.jar.size, 0); assert.ok(!f.calls.some(c => c[0] === 'delete'));
});
test('MFA accounts retain the existing AAL2 requirement as well as current-password proof', async () => {
  const f = routeFixture({ mfa: true, aal2: true }); assert.equal((await f.post()).status, 200); assert.equal(f.calls[0][0], 'reauth');
});
test('final Administrator refusal is actionable, leaves no receipt or deletion and preserves the session', async () => {
  const f = routeFixture({ finalAdmin: true });
  const response = await f.post();
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'Your account has not been deleted. Another authorized active Administrator must exist before you can delete this account.' });
  assert.equal(f.jar.size, 0);
  assert.deepEqual(await (await f.get()).json(), { state: 'none' });
  assert.ok(!f.calls.some(c => ['ledger', 'delete', 'cookie'].includes(c[0]) || ['remove', 'browser-signout'].includes(c)));
  assert.deepEqual(f.calls.slice(0, 2), [['reauth', 'owner@example.invalid'], ['cleanup', 'local']]);
  f.options.finalAdmin = false;
  assert.equal((await f.post()).status, 200);
});
test('request parameters cannot activate a recovery bypass', async () => {
  for (const key of ['recovery', 'skipAdminCheck', 'confirmedLedger', 'metadata']) {
    const f = routeFixture({ finalAdmin: true });
    assert.equal((await f.post({ ...request, [key]: true })).status, 400);
    assert.equal(f.calls.length, 0);
  }
});
test('CSRF, target injection, and missing receipt fail before deletion', async () => {
  const f = routeFixture(); assert.equal((await f.post(request, 'https://evil.invalid')).status, 403);
  assert.equal((await f.post({ ...request, userId: 'victim' })).status, 400); assert.equal((await f.finish()).status, 401); assert.equal(f.calls.length, 0);
});
test('a receipt completes only the confirmed operation and repeat requests are idempotent', async () => {
  const f = routeFixture(); await f.post(); assert.equal((await f.finish('https://evil.invalid')).status, 403);
  assert.equal((await f.finish()).status, 200); assert.equal((await f.finish()).status, 200);
  assert.equal(f.calls.filter(c => Array.isArray(c) && c[0] === 'delete').length, 1);
  const response = await f.get(); assert.deepEqual(await response.json(), { state: 'complete' });
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});
test('a well-formed but unknown receipt is unauthorized and makes no mutation', async () => {
  const f = routeFixture(); f.jar.set('socrates-account-deletion', { value: 'a'.repeat(64) });
  assert.equal((await f.finish()).status, 401); assert.deepEqual(await (await f.get()).json(), { state: 'none' });
  assert.equal(f.calls.length, 0);
});
test('a receipt cannot affect a different account later signed into the same browser', async () => {
  const f = routeFixture(); await f.post(); f.options.otherSignedIn = true;
  assert.equal((await f.finish()).status, 403);
  assert.ok(!f.calls.some(c => c[0] === 'delete' || c === 'browser-signout'));
  assert.deepEqual(await (await f.get()).json(), { state: 'none' });
  assert.equal(f.jar.get('socrates-account-deletion').value, '');
});
test('the receipt can retry after the original Auth identity is unavailable', async () => {
  const f = routeFixture(); await f.post(); f.options.anonymous = true;
  assert.equal((await f.finish()).status, 200);
  assert.deepEqual(await (await f.get()).json(), { state: 'complete' });
});

test('independent ledger failure prevents every destructive step and retry succeeds', async () => {
  const f = worker({ ledgerFailure: true });
  await assert.rejects(core.continueDeletion(f.service, 'hash'));
  assert.deepEqual(f.calls.map(c => c[0]), ['ledger']);
  f.options.ledgerFailure = false; await core.continueDeletion(f.service, 'hash');
  assert.deepEqual(f.calls.map(c => c[0]), ['ledger', 'ledger', 'storage', 'auth']);
});
