import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadMediaModule } from './fixtures/content-media-images.mjs';
const source = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
test('media API bypass strips forged identity before independent handler authentication', () => {
  const proxy = source('proxy.ts');
  assert.ok(proxy.indexOf('requestHeaders.delete(REQUEST_USER_ID_HEADER)') < proxy.indexOf("pathname.startsWith('/api/content-media/')"));
  for (const path of ['reservations', 'uploads/[reservationId]', 'delivery/[referenceId]']) assert.match(source(`app/api/content-media/${path}/route.ts`), /await actorContext\(request,/);
  assert.match(source('lib/content-media/server.ts'), /auth\.auth\.getUser\(\)/);
  assert.match(source('app/api/content-media/maintenance/route.ts'), /maintenanceAuthorized\(request\)/);
});
test('upload handler rejects unauthorized requests before consuming their body or invoking processing', async () => {
  let consumed = false;
  const route = loadMediaModule('app/api/content-media/uploads/[reservationId]/route.ts', {
    '@/lib/content-media/server': { mediaResponse: async fn => { try { return await fn(); } catch { return new Response(null, { status: 403 }); } }, actorContext: async () => { throw Error('denied'); } },
    '@/lib/content-media/service': { uploadImage: async () => { consumed = true; } },
  });
  assert.equal((await route.PUT(new Request('http://localhost'), { params: Promise.resolve({ reservationId: 'guessed' }) })).status, 403);
  assert.equal(consumed, false);
});
test('private delivery never returns a signed or canonical Storage URL', () => {
  const route = source('app/api/content-media/delivery/[referenceId]/route.ts');
  assert.match(route, /new Uint8Array\(image.bytes\)/);
  assert.match(source('lib/content-media/server.ts'), /private, no-store/);
  assert.doesNotMatch(source('lib/content-media/service.ts'), /createSignedUrl|getPublicUrl/);
});
test('origin validation uses Host authority despite Next internal hostname and denies cross-origin writes', async () => {
  let authCalls = 0;
  const server = loadMediaModule('lib/content-media/server.ts', {
    'server-only': {},
    '@/lib/supabase-server': { createSupabaseServerClient: async () => ({ auth: { getUser: async () => { authCalls++; return { data: { user: { id: 'actor' } } }; } } }) },
    '@/lib/library-context': { resolveActiveLibraryContext: async () => ({ library: { id: 'library' }, user: { id: 'actor' } }) },
  });
  const request = origin => new Request('http://localhost:3218/api/content-media/reservations', { headers: { host: '127.0.0.1:3218', origin } });
  assert.equal((await server.actorContext(request('http://127.0.0.1:3218'), true)).actor, 'actor');
  for (const origin of ['http://attacker.test', 'null', 'https://127.0.0.1:3218', 'http://127.0.0.1:3218/path', '']) await assert.rejects(server.actorContext(request(origin), true));
  assert.equal(authCalls, 1);
});
function writers(transport) {
  return loadMediaModule('lib/content-media/server.ts', {
    'server-only': {}, '@/lib/supabase-server': {}, '@/lib/library-context': {},
  }).createMediaWrites('http://disposable.invalid', 'synthetic-key', transport);
}
const library = '11200000-0000-4000-8000-000000000010';
const operation = '11300000-0000-4000-8000-000000000001';
const attempt = '11300000-0000-4000-8000-000000000002';
const bucket = 'socrates-content-media';
const object = `${library}/${attempt}`;
const staging = `_staging/${library}/${operation}/${attempt}`;
test('single-dispatch adapter writes only staging bytes and copies only into fresh same-Library destinations', async () => {
  const calls = [];
  const write = writers(async (url, options) => { calls.push({ url, options }); return new Response('{}'); });
  await write.stage({ bucket, object: staging }, Buffer.from('normalized'), 'image/png');
  await write.promote({ bucket, source: staging, object });
  assert.equal(calls.length, 2);
  assert.ok(calls[0].url.endsWith(`object/${bucket}/${staging}`));
  assert.ok(calls[1].url.endsWith('object/copy'));
  assert.deepEqual(JSON.parse(calls[1].options.body), { bucketId: bucket, sourceKey: staging, destinationKey: object });
  for (const { options } of calls) { assert.equal(options.method, 'POST'); assert.equal(options.redirect, 'error'); assert.equal(options.headers['x-upsert'], 'false'); }
  await assert.rejects(write.stage({ bucket, object }, Buffer.from('invalid'), 'image/png'));
  await assert.rejects(write.promote({ bucket, source: staging, object: `11200000-0000-4000-8000-000000000011/${attempt}` }));
  assert.equal(calls.length, 2);
});
test('uncertain copy/upload outcome never retries a consumed destination inside the transport adapter', async () => {
  for (const response of [() => new Response('', { status: 503 }), () => { throw new Error('Synthetic transport interruption'); }]) {
    let calls = 0;
    const write = writers(async () => { calls++; return response(); });
    await assert.rejects(write.stage({ bucket, object: staging }, Buffer.from('normalized'), 'image/png'));
    assert.equal(calls, 1);
    await assert.rejects(write.promote({ bucket, source: staging, object }));
    assert.equal(calls, 2);
  }
});
test('reservation route exposes only a logical reservation and expiry; maintenance distinguishes temporary cleanup', () => {
  const reservation = source('app/api/content-media/reservations/route.ts');
  assert.match(reservation, /reservationId: result.reservationId/);
  assert.doesNotMatch(reservation, /assetId:|object:|createSignedUrl/);
  const maintenance = source('app/api/content-media/maintenance/route.ts');
  assert.match(maintenance, /body.kind === 'temporary'/);
  assert.ok(maintenance.indexOf('maintenanceAuthorized(request)') < maintenance.indexOf('await cleanTemporaryBatch(client)'));
});
