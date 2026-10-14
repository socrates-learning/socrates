import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { loadConceptModule } from './fixtures/concept-media-authoring.mjs';
import { loadMediaModule } from './fixtures/content-media-images.mjs';

function fixture() {
  let authCalls = 0;
  const response = (kind, value) => ({ kind, value, headers: new Headers(), cookies: { set() {} } });
  const { proxy } = loadConceptModule('proxy.ts', {
    'next/server': { NextResponse: { next: value => response('next', value), redirect: value => response('redirect', value) } },
    '@supabase/ssr': { createServerClient: () => ({ auth: { getClaims: async () => { authCalls++; return { data: { claims: null } }; } } }) },
    '@/lib/request-auth-context': loadMediaModule('lib/request-auth-context.ts'),
    '@/lib/request-performance': loadMediaModule('lib/request-performance.ts'),
    '@/lib/creator-route-access': loadMediaModule('lib/creator-route-access.ts'),
    '@/lib/creator-data-access': loadMediaModule('lib/creator-data-access.ts'),
  }, { crypto: webcrypto, performance, Headers, process });
  return { calls: () => authCalls, async visit(path) {
    const nextUrl = new URL(`https://fixture.invalid${path}`); nextUrl.clone = () => new URL(nextUrl);
    return proxy({ nextUrl, url: nextUrl.href, headers: new Headers({ 'x-socrates-user-id': 'forged-owner', 'x-socrates-user-role': 'admin' }), cookies: { getAll: () => [], set() {} } });
  } };
}
test('only the two deletion routes bypass the navigation redirect, with forged identity headers stripped', async () => {
  const f = fixture();
  for (const path of ['/api/account/deletion', '/account/deletion']) {
    const result = await f.visit(path); assert.equal(result.kind, 'next');
    assert.equal(result.value.request.headers.get('x-socrates-user-id'), null);
    assert.equal(result.value.request.headers.get('x-socrates-user-role'), null);
  }
  assert.equal(f.calls(), 0);
});
test('deletion receipt route exception does not open Account, Profile or prefix lookalikes', async () => {
  const f = fixture();
  for (const path of ['/account', '/api/profile', '/profile', '/api/account/deletion-extra', '/api/account/deletion/other', '/account/deletion/other']) {
    const result = await f.visit(path); assert.equal(result.kind, 'redirect'); assert.equal(result.value.pathname, '/login');
  }
  assert.equal(f.calls(), 6);
});
