import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConceptModule, hookHarness, jsx } from './fixtures/concept-media-authoring.mjs';
import { loadMediaModule } from './fixtures/content-media-images.mjs';

const profile = loadMediaModule('lib/personal-profile.ts');
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };
function setup() {
  const h = hookHarness(), listeners = new Map(), calls = [], revoked = [];
  let serial = 0, authChanged, unsubscribed = false;
  let user = { id: 'owner-a', email: 'owner@example.invalid', user_metadata: { full_name: 'Alexandra' } };
  let transport = async () => new Response(null, { status: 204 });
  const events = { addEventListener: (n, fn) => listeners.set(n, fn), removeEventListener: n => listeners.delete(n) };
  const doc = { ...events, visibilityState: 'visible' };
  const component = loadConceptModule('components/HomeProfileAvatar.tsx', {
    react: h.hooks, 'react/jsx-runtime': jsx,
    'next/link': { __esModule: true, default: 'Link' },
    '@/lib/personal-profile': profile,
    '@/lib/supabase': { supabase: { auth: {
      getUser: async () => ({ data: { user }, error: null }),
      onAuthStateChange: fn => { authChanged = fn; return { data: { subscription: { unsubscribe() { unsubscribed = true; } } } }; },
    } } },
    './HomeProfileAvatar.module.css': { __esModule: true, default: { avatar: 'avatar' } },
  }, {
    window: events, document: doc, queueMicrotask,
    fetch: (url, init) => { calls.push({ url, ...init }); return transport(); },
    URL: { createObjectURL: () => `blob:private-${++serial}`, revokeObjectURL: url => revoked.push(url) },
  });
  const click = () => {};
  const render = () => h.render(() => component.HomeProfileAvatar({ className: 'home-v2-profile', onClick: click }));
  return { h, calls, revoked, listeners, doc, render, click, setUser: value => { user = value; }, setTransport: fn => { transport = fn; },
    changed: event => authChanged(event), unsubscribed: () => unsubscribed,
    async load() { render(); h.effects(); await settle(); return render(); },
    async revisit(event = 'focus') { listeners.get(event)(); await settle(); return render(); },
  };
}
const photo = () => new Response(new Blob(['private fixture photo'], { type: 'image/png' }));

test('Home avatar retains one accessible Profile link and its existing click callback', async () => {
  const s = setup(), tree = await s.load();
  assert.equal(tree.type, 'Link'); assert.equal(tree.props.href, '/profile');
  assert.equal(tree.props['aria-label'], 'Open Profile'); assert.equal(tree.props.onClick, s.click);
  assert.equal(tree.props.prefetch, false); assert.equal(tree.props.children.type, 'span');
  assert.equal(tree.props.children.props.children, 'A');
});
test('private photo uses the owner-only endpoint, no-store and a private blob URL', async () => {
  const s = setup(); s.setUser({ id: 'owner-a', email: 'owner@example.invalid', user_metadata: { avatar_url: 'https://attacker.invalid/other-photo', full_name: 'Alex' } });
  s.setTransport(photo); const tree = await s.load();
  assert.equal(tree.props.children.type, 'img'); assert.match(tree.props.children.props.src, /^blob:/);
  assert.equal(tree.props.children.props.alt, '');
  assert.equal(s.calls.length, 1); assert.equal(s.calls[0].url, '/api/profile/photo');
  assert.equal(s.calls[0].cache, 'no-store'); assert.equal(s.calls[0].credentials, 'same-origin');
  assert.equal(s.calls[0].redirect, 'error'); assert.equal(s.calls[0].method, undefined);
});
test('no saved photo uses the same display-name/email fallback as the greeting', async () => {
  const s = setup(); s.setUser({ id: 'owner-a', email: 'zoe@example.invalid', user_metadata: {} });
  assert.equal((await s.load()).props.children.props.children, 'Z');
});
for (const response of [() => new Response('<html>Login</html>', { headers: { 'content-type': 'text/html' } }), () => new Response('private error', { status: 403 }), () => new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }), () => Promise.reject(new Error('network'))]) {
  test('unavailable, unauthorized and non-photo responses never become an avatar', async () => {
    const s = setup(); s.setTransport(response); assert.equal((await s.load()).props.children.type, 'span');
  });
}
test('updated and removed photos refresh when Home regains focus or is revisited', async () => {
  const s = setup(); s.setTransport(photo); await s.load();
  assert.equal((await s.revisit()).props.children.props.src, 'blob:private-2');
  assert.ok(s.revoked.includes('blob:private-1'));
  s.setTransport(async () => new Response(null, { status: 204 }));
  assert.equal((await s.revisit('pageshow')).props.children.props.children, 'A');
  assert.ok(s.revoked.includes('blob:private-2'));
});
test('hidden-tab changes wait until the Home tab becomes visible', async () => {
  const s = setup(); await s.load(); s.doc.visibilityState = 'hidden';
  await s.revisit('visibilitychange'); assert.equal(s.calls.length, 1);
  s.doc.visibilityState = 'visible'; await s.revisit('visibilitychange'); assert.equal(s.calls.length, 2);
});
test('sign-out clears private photo immediately and stale responses cannot restore it', async () => {
  const s = setup(); s.setTransport(photo); await s.load();
  let finish; s.setTransport(() => new Promise(resolve => { finish = resolve; }));
  s.listeners.get('focus')(); await settle();
  s.setUser(null); s.changed('SIGNED_OUT');
  assert.equal(s.render().props.children.type, 'span');
  finish(photo()); await settle(); assert.equal(s.render().props.children.type, 'span');
  assert.ok(s.calls.at(-1).signal.aborted); assert.ok(s.revoked.includes('blob:private-1'));
});
test('account change discards old image and reads the newly authenticated owner only', async () => {
  const s = setup(); s.setTransport(photo); await s.load();
  s.setUser({ id: 'owner-b', email: 'beth@example.invalid', user_metadata: {} });
  s.setTransport(async () => new Response(null, { status: 204 })); s.changed('SIGNED_IN');
  assert.equal(s.render().props.children.type, 'span'); await settle();
  assert.equal(s.render().props.children.props.children, 'B');
  assert.ok(s.calls.every(c => c.url === '/api/profile/photo'));
});
test('unmount revokes photo, aborts pending read and removes all subscriptions', async () => {
  const s = setup(); s.setTransport(photo); await s.load(); s.h.cleanup();
  assert.equal(s.listeners.size, 0); assert.ok(s.unsubscribed());
  assert.ok(s.calls[0].signal.aborted); assert.deepEqual(s.revoked, ['blob:private-1']);
});
