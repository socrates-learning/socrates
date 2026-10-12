import test from 'node:test';
import assert from 'node:assert/strict';
import { readAppearanceSource as readFileSync } from './fixtures/appearance.mjs';
import { createHash } from 'node:crypto';
import { loadMediaModule, sampleImage } from './fixtures/content-media-images.mjs';

const profile = loadMediaModule('lib/personal-profile.ts');
const image = loadMediaModule('lib/content-media/image.ts');
const actor = '12600000-0000-0000-0000-000000000001';
function fixture(options = {}) {
  const calls = [];
  const client = {
    auth: {
      getUser: async () => ({ data: { user: options.anonymous ? null : { id: actor, email: 'private@example.invalid' } }, error: null }),
      updateUser: async input => { calls.push(['updateUser', input]); return { error: options.updateError ? new Error('private provider detail') : null }; },
      refreshSession: async () => { calls.push(['refresh']); return { error: options.refreshError ? new Error('private refresh detail') : null }; },
    },
    from: table => { assert.equal(table, 'user_roles'); return { select: () => ({ eq: (key, value) => {
      assert.equal(key, 'user_id'); assert.equal(value, actor);
      return { maybeSingle: async () => ({ data: { role: options.role ?? 'learner' }, error: options.roleError ? new Error('role unavailable') : null }) };
    } }) }; },
    storage: { from: bucket => {
      assert.equal(bucket, 'socrates-profile-photos');
      return {
        download: async path => { calls.push(['download', path]); return { data: new Blob([await sampleImage()], { type: 'image/png' }), error: options.missing ? { statusCode: '404' } : options.storageError ? { statusCode: '503' } : null }; },
        upload: async (path, bytes, config) => { calls.push(['upload', path, config, bytes.length]); return { error: options.storageError ? new Error('private bucket detail') : null }; },
        remove: async paths => { calls.push(['remove', paths]); return { error: options.storageError ? new Error('private bucket detail') : null }; },
      };
    } },
  };
  const server = loadMediaModule('lib/personal-profile-server.ts', { 'server-only': {}, '@/lib/supabase-server': { createSupabaseServerClient: async () => client } });
  const bindings = { '@/lib/personal-profile': profile, '@/lib/personal-profile-server': server, '@/lib/content-media/image': image };
  return { calls, server, name: loadMediaModule('app/api/profile/route.ts', bindings), photo: loadMediaModule('app/api/profile/photo/route.ts', bindings) };
}
function request(method = 'PUT', body = JSON.stringify({ displayName: 'Alexandra' }), type = 'application/json', origin = 'https://fixture.invalid') {
  return new Request('https://fixture.invalid/api/profile?user_id=another-account', { method, body: method === 'DELETE' ? undefined : body, headers: { host: 'fixture.invalid', origin, 'content-type': type } });
}

test('display name normalization, Unicode, blank fallback and limits', () => {
  assert.equal(profile.normalizeDisplayName('  Alexandra\n  López  '), 'Alexandra López');
  assert.equal(profile.normalizeDisplayName(' \t '), '');
  assert.equal(profile.normalizeDisplayName('👩🏽‍⚕️ Alex'), '👩🏽‍⚕️ Alex');
  assert.equal(profile.normalizeDisplayName('🦉'.repeat(80)), '🦉'.repeat(80));
  for (const value of ['x'.repeat(81), 'a\0b', 'a\u202eb', {}, null]) assert.throws(() => profile.normalizeDisplayName(value));
  assert.equal(profile.profileDisplayName({ full_name: ' Alex ' }), 'Alex');
  assert.equal(profile.profileDisplayName({ full_name: 3 }), '');
});
for (const type of profile.PROFILE_PHOTO_TYPES) test(`photo validation accepts ${type} within limits`, () => {
  profile.validateProfilePhoto({ type, size: profile.PROFILE_PHOTO_LIMIT });
});
test('empty, too-large, SVG, GIF and spoofed client types are rejected', () => {
  for (const file of [{ size: 0, type: 'image/png' }, { size: profile.PROFILE_PHOTO_LIMIT + 1, type: 'image/png' }, ...['image/svg+xml', 'image/gif', 'text/html', ''].map(type => ({ type, size: 10 }))]) assert.throws(() => profile.validateProfilePhoto(file));
});
for (const role of ['admin', 'editor', 'learner']) test(`${role} saves only own presentation metadata and refreshes the greeting claims`, async () => {
  const f = fixture({ role });
  const response = await f.name.PUT(request());
  assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /no-store/);
  assert.deepEqual(await response.json(), { displayName: 'Alexandra', refreshRequired: false });
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls)), [['updateUser', { data: { full_name: 'Alexandra' } }], ['refresh']]);
});
for (const options of [{ anonymous: true }, { role: 'pending' }, { roleError: true }]) test(`name and all photo operations reject unauthorized access ${JSON.stringify(options)}`, async () => {
  const f = fixture(options), expected = options.anonymous ? 401 : 403;
  for (const operation of [() => f.name.PUT(request()), () => f.photo.GET(), () => f.photo.PUT(request('PUT', 'invalid', 'image/png')), () => f.photo.DELETE(request('DELETE'))]) assert.equal((await operation()).status, expected);
  assert.deepEqual(f.calls, []);
});
test('cross-origin and missing origins cannot update names or photos', async () => {
  const f = fixture();
  for (const origin of ['', 'https://attacker.invalid', 'http://fixture.invalid', 'https://fixture.invalid/']) {
    assert.equal((await f.name.PUT(request('PUT', '{}', 'application/json', origin))).status, 403);
    assert.equal((await f.photo.DELETE(request('DELETE', undefined, '', origin))).status, 403);
  }
  assert.deepEqual(f.calls, []);
});
test('invalid and over-limit names, additional identity/role fields and oversized input never reach Auth', async () => {
  const f = fixture();
  for (const value of [{ displayName: 'x'.repeat(81) }, { displayName: 'Alex', role: 'admin' }, { displayName: 'Alex', user_id: actor }, { full_name: 'Alex' }, null, []]) assert.equal((await f.name.PUT(request('PUT', JSON.stringify(value)))).status, 400);
  assert.equal((await f.name.PUT(request('PUT', 'x'.repeat(4097)))).status, 413);
  assert.deepEqual(f.calls, []);
});
test('blank saves clear the name without changing the existing Home fallback', async () => {
  const f = fixture(); assert.equal((await f.name.PUT(request('PUT', JSON.stringify({ displayName: ' \t ' })))).status, 200);
  assert.equal(f.calls[0][1].data.full_name, '');
  const planner = readFileSync(new URL('../components/StudyPlanner.tsx', import.meta.url), 'utf8');
  assert.match(planner, /user\.user_metadata\?\.full_name[\s\S]*?user\.email\.split\('@'\)\[0\]/);
});
test('failed name writes do not report success or expose provider details', async () => {
  const f = fixture({ updateError: true }), response = await f.name.PUT(request());
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /private provider/);
  assert.equal(f.calls.length, 1);
});
test('committed name plus failed refresh is reported accurately', async () => {
  const response = await fixture({ refreshError: true }).name.PUT(request());
  assert.deepEqual(await response.json(), { displayName: 'Alexandra', refreshRequired: true });
});
for (const format of ['jpeg', 'png', 'webp']) test(`verified ${format} upload uses only the session owner destination`, async () => {
  const f = fixture(), bytes = await sampleImage(format);
  const response = await f.photo.PUT(request('PUT', bytes, `image/${format}`));
  assert.equal(response.status, 200);
  assert.equal(f.calls[0][0], 'upload'); assert.equal(f.calls[0][1], `${actor}/avatar`);
  assert.equal(f.calls[0][2].contentType, `image/${format}`); assert.equal(f.calls[0][2].upsert, true);
});
test('image bytes are decoded rather than trusted from the MIME header', async () => {
  const f = fixture();
  for (const data of ['<svg onload="alert(1)"/>', 'not an image']) assert.equal((await f.photo.PUT(request('PUT', data, 'image/png'))).status, 400);
  assert.equal((await f.photo.PUT(request('PUT', Buffer.alloc(profile.PROFILE_PHOTO_LIMIT + 1), 'image/png'))).status, 413);
  assert.deepEqual(f.calls, []);
});
test('private photo delivery, absence, safe errors and own removal', async () => {
  const f = fixture(), response = await f.photo.GET();
  assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'image/png');
  assert.match(response.headers.get('cache-control'), /private, no-store/); assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('content-security-policy'), /sandbox/);
  assert.equal(f.calls[0][1], `${actor}/avatar`);
  assert.equal((await fixture({ missing: true }).photo.GET()).status, 204);
  assert.equal((await fixture({ storageError: true }).photo.GET()).status, 503);
  assert.equal((await f.photo.DELETE(request('DELETE'))).status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls[1])), ['remove', [`${actor}/avatar`]]);
});
test('photo Storage failures never acknowledge a successful save/removal', async () => {
  const f = fixture({ storageError: true });
  for (const response of [await f.photo.PUT(request('PUT', await sampleImage(), 'image/png')), await f.photo.DELETE(request('DELETE'))]) {
    assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /private bucket detail/);
  }
});
test('approved Home navigation is preserved except its dedicated Profile destination', () => {
  const text = readFileSync(new URL('../components/StudyPlanner.tsx', import.meta.url), 'utf8');
  const current = "label: 'Profile', icon: 'account', href: '/profile'";
  assert.equal(text.split(current).length, 2);
  assert.equal(createHash('sha256').update(text.replace(current, "label: 'Profile', icon: 'account', href: '/account'")).digest('hex'), '1c5c7ae96c9dd0757d7b16a551a5ec4da8fba3d8e5eb8e7ca8d4739aa9a996fb');
});
test('new photo route traces the existing isolated decoder and native dependencies', () => {
  const config = readFileSync(new URL('../next.config.ts', import.meta.url), 'utf8');
  assert.match(config, /'\/api\/profile\/photo': \[[\s\S]*?decoder-worker\.cjs[\s\S]*?socrates-media-sharp/);
});
