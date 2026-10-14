// Real Next.js request test against the isolated application/Auth/Storage stack.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { loadMediaModule } from './fixtures/content-media-images.mjs';

// This mode exercises the real route handler without disposable or Production writes.
// The original full HTTP/provider proof below remains available without this flag.
if (process.argv.includes('--readiness-only')) {
  let passed = 0;
  for (const scenario of [
    { label: 'anonymous', anonymous: true, status: 401, calls: ['user'] },
    { label: 'invalid session', authError: true, status: 401, calls: ['user'] },
    { label: 'learner', role: 'learner', status: 403, calls: ['user', 'is_admin'] },
    { label: 'Editor', role: 'editor', status: 403, calls: ['user', 'is_admin'] },
    { label: 'role lookup failure', role: 'admin', roleError: true, status: 403, calls: ['user', 'is_admin'] },
    { label: 'non-boolean authority', role: 'admin', malformedRole: true, status: 403, calls: ['user', 'is_admin'] },
    { label: 'authorized Admin', role: 'admin', status: 200, calls: ['user', 'is_admin', 'ledger-status'] },
    { label: 'unavailable or invalid ledger', role: 'admin', unavailable: true, status: 503, calls: ['user', 'is_admin', 'ledger-status'] },
    { label: 'authentication transport failure', authThrows: true, status: 503, calls: ['user'] },
  ]) {
    const calls = [];
    const forbidden = () => { calls.push('forbidden-mutation-or-receipt'); throw new Error('Unexpected deletion path'); };
    const client = {
      auth: { async getUser() {
        calls.push('user');
        if (scenario.authThrows) throw new Error('Private diagnostic must not escape');
        return { data: { user: scenario.anonymous ? null : { id: 'synthetic-owner' } }, error: scenario.authError ? new Error('Invalid session') : null };
      } },
      async rpc(name) {
        calls.push(name); assert.equal(name, 'is_admin');
        return { data: scenario.malformedRole ? 'true' : scenario.role === 'admin', error: scenario.roleError ? new Error('Lookup failed') : null };
      },
    };
    const route = loadMediaModule('app/api/account/deletion/route.ts', {
      'next/headers': { cookies: forbidden },
      'node:crypto': { randomBytes: forbidden },
      '@supabase/supabase-js': { createClient: forbidden },
      '@/lib/supabase-server': { createSupabaseServerClient: async () => client },
      '@/lib/account-deletion': { deletionInput: forbidden, continueDeletion: forbidden },
      '@/lib/account-deletion-server': {
        deletionAdmin: forbidden, deletionService: forbidden, receiptHash: forbidden, validReceipt: forbidden,
        deletionLedger: () => ({ async assertReady() {
          calls.push('ledger-status');
          if (scenario.unavailable) throw new Error('Private connection information must not escape');
          return { source: 'private-source', ledger: 'private-identity', count: 42 };
        }, record: forbidden }),
      },
      '@/lib/personal-profile-server': { profilePrivateHeaders: { 'Cache-Control': 'private, no-store' }, profileBody: forbidden, requireProfileOrigin: forbidden },
    });
    const response = await route.GET(new Request('https://socrates.example/api/account/deletion?readiness=1'));
    assert.equal(response.status, scenario.status, scenario.label);
    assert.deepEqual(await response.json(), scenario.status === 200 ? { ready: true } : scenario.status === 503 ? { ready: false } : { error: 'Account request denied.' });
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('set-cookie'), null);
    assert.deepEqual(calls, scenario.calls, 'Only identity, server authority, and ledger status reads are permitted');
    passed++; console.log('PASS:', scenario.label);
  }
  console.log(JSON.stringify({ passed, failed: 0, readinessOnly: true, mutations: 0 }));
} else {
const env = Object.fromEntries(readFileSync(process.env.ACCOUNT_DELETION_DISPOSABLE_ENV, 'utf8').split('\n').filter(l => l && !l.startsWith('#')).map(l => { const at = l.indexOf('='); return [l.slice(0, at), l.slice(at + 1)]; }));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, 'http://127.0.0.1:58942');
const origin = 'http://localhost:3294';
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const sql = statement => execFileSync('docker', ['exec', '-i', 'socrates-creator-navy-uat-db', 'psql', '-U', 'postgres', '-d', 'account127_uat', '-XAt', '-v', 'ON_ERROR_STOP=1'], { input: statement, encoding: 'utf8' }).trim();
const literal = value => "'" + String(value).replaceAll("'", "''") + "'";
let passed = 0;
const check = (condition, label) => { assert.ok(condition, label); passed++; console.log('PASS:', label); };
async function http(jar, method, body, path = '/api/account/deletion', requestOrigin = origin) {
  const response = await fetch(origin + path, { method, redirect: 'manual', headers: { origin: requestOrigin, cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; '), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(';')[0], at = pair.indexOf('='); jar.set(pair.slice(0, at), pair.slice(at + 1));
  }
  return response;
}
async function fixture() {
  const password = randomBytes(24).toString('base64url'), email = `deletion-http-${randomBytes(6).toString('hex')}@example.invalid`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true }); assert.equal(created.error, null);
  const id = created.data.user.id, jar = new Map();
  sql(`insert into public.user_roles(user_id,role) values(${literal(id)},'learner'); insert into public.user_libraries(user_id,library_id) select ${literal(id)},id from public.libraries where status='active' order by id limit 1;`);
  const client = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: values => values.forEach(({ name, value }) => jar.set(name, value)) } });
  const login = await client.auth.signInWithPassword({ email, password }); assert.equal(login.error, null);
  return { id, password, jar };
}
const anonymous = new Map();
check((await http(anonymous, 'POST', { confirmation: 'DELETE', password: 'invalid' })).status === 401, 'anonymous request does not bypass identity verification');
check((await http(anonymous, 'DELETE')).status === 401, 'missing receipt does not authorize cleanup');
const recovery = await http(anonymous, 'GET', null, '/account/deletion');
check(recovery.status === 200 && (await recovery.text()).includes('Account Deletion'), 'recovery page remains reachable without an account');
const owner = await fixture();
try {
  check((await http(owner.jar, 'POST', { confirmation: 'DELETE', password: 'wrong-disposable-password' })).status === 403, 'real provider password failure does not start deletion');
  check(sql(`select state from public.account_deletion_state where user_id=${literal(owner.id)}`) === 'active', 'failed verification leaves account active');
  check((await http(owner.jar, 'POST', { confirmation: 'DELETE', password: owner.password, userId: 'another-account' })).status === 400, 'real route rejects client-selected account targets');
  check((await http(owner.jar, 'POST', { confirmation: 'DELETE', password: owner.password }, undefined, 'https://unrelated.invalid')).status === 403, 'cross-origin confirmation is rejected');
  const started = await http(owner.jar, 'POST', { confirmation: 'DELETE', password: owner.password });
  check(started.status === 200 && (await started.json()).state === 'pending', 'current-password confirmation starts durable cleanup');
  const cookie = started.headers.getSetCookie().find(value => value.startsWith('socrates-account-deletion='));
  check(cookie?.includes('HttpOnly') && cookie.includes('Path=/api/account/deletion') && /SameSite=strict/i.test(cookie), 'real response issues only a path-restricted HttpOnly receipt');
  const status = await http(owner.jar, 'GET');
  check(JSON.stringify(await status.json()) === '{"state":"pending"}', 'status response exposes no account identity or private object paths');
  check((await http(owner.jar, 'DELETE', null, undefined, 'https://unrelated.invalid')).status === 403, 'cross-origin retry is rejected');
  const completed = await http(owner.jar, 'DELETE');
  check(completed.status === 200 && (await completed.json()).state === 'complete', 'real route completes provider and application deletion');
  check(Boolean((await admin.auth.admin.getUserById(owner.id)).error), 'real provider confirms identity removal');
  check((await http(owner.jar, 'DELETE')).status === 200, 'duplicate real request safely reconciles completion');
  const receiptOnly = new Map([['socrates-account-deletion', owner.jar.get('socrates-account-deletion')]]);
  for (const path of ['/account', '/profile', '/api/profile', '/account/deletion/unrelated']) {
    const result = await http(receiptOnly, 'GET', null, path);
    check(result.status >= 300 && result.status < 400 && result.headers.get('location')?.includes('/login'), `receipt grants no access to ${path}`);
  }
  const state = await http(receiptOnly, 'GET');
  check((await state.json()).state === 'complete', 'completion remains verifiable after sign-out');
} finally {
  if ((await admin.auth.admin.getUserById(owner.id)).data.user) {
    const start = await http(owner.jar, 'POST', { confirmation: 'DELETE', password: owner.password });
    assert.equal(start.status, 200, 'disposable cleanup confirmation');
    assert.equal((await http(owner.jar, 'DELETE')).status, 200, 'disposable cleanup completion');
  }
}
console.log(JSON.stringify({ passed, failed: 0, disposableOnly: true }));
}
