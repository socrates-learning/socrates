import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConceptModule, hookHarness, jsx } from './fixtures/concept-media-authoring.mjs';
import { loadMediaModule } from './fixtures/content-media-images.mjs';
const profile = loadMediaModule('lib/personal-profile.ts');
const nodes = n => Array.isArray(n) ? n.flatMap(nodes) : n && typeof n === 'object' ? [n, ...nodes(n.props?.children)] : [];
const text = n => Array.isArray(n) ? n.map(text).join('') : n && typeof n === 'object' ? text(n.props?.children) : typeof n === 'string' || typeof n === 'number' ? String(n) : '';
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };
function setup(transport, name = '') {
  const h = hookHarness(); h.hooks.useCallback = fn => fn;
  const calls = [], revoked = [], listeners = new Map(); let guard, refresh = 0, allow = false, serial = 0;
  const component = loadConceptModule('components/PersonalProfile.tsx', {
    react: h.hooks, 'react/jsx-runtime': jsx, 'lucide-react': { UserRound: 'Icon' },
    'next/navigation': { useRouter: () => ({ refresh: () => refresh++ }) },
    '@/components/application-shell/SocratesShell': { SocratesShell: 'Shell', useSocratesNavigationGuard: fn => guard = fn },
    '@/lib/personal-profile': profile,
    '@/components/ProfileSecurity': { ProfileSecurity: 'Security' },
    './PersonalProfile.module.css': { __esModule: true, default: new Proxy({}, { get: (_o, key) => key }) },
  }, {
    fetch: async (url, init) => { calls.push({ url, ...init }); return transport ? transport(url, init) : init.method === 'PUT' ? Response.json({ displayName: JSON.parse(init.body).displayName }) : new Response(null, { status: 204 }); },
    URL: { createObjectURL: () => `blob:fixture-${++serial}`, revokeObjectURL: value => revoked.push(value) },
    window: { confirm: () => allow, addEventListener: (event, fn) => listeners.set(event, fn), removeEventListener: event => listeners.delete(event), location: { assign() {} } },
  });
  const render = () => h.render(() => component.PersonalProfile({ email: 'owner@example.invalid', initialDisplayName: name, role: 'learner' }));
  const button = label => nodes(render()).find(n => n.type === 'button' && text(n) === label);
  const input = () => nodes(render()).find(n => n.props?.id === 'profile-display-name');
  return { h, calls, revoked, listeners, render, button, input, refresh: () => refresh, guard: () => { render(); return guard(); }, allow: value => allow = value, text: () => text(render()),
    async load() { render(); h.effects(); await settle(); render(); h.effects(); return render(); },
    edit(value) { input().props.onChange({ target: { value } }); },
    photo(file) { nodes(render()).find(n => n.type === 'input' && n.props.type === 'file').props.onChange({ target: { files: [file] } }); },
    save() { nodes(render()).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); },
  };
}
test('empty profile loads default image, current account and disabled unchanged Save', async () => {
  const s = setup(); await s.load();
  assert.match(s.text(), /Your profile/);
  assert.ok(nodes(s.render()).some(n => n.type === 'input' && n.props.readOnly && n.props.value === 'owner@example.invalid'));
  assert.equal(s.input().props.value, ''); assert.ok(s.button('Save Changes').props.disabled);
  assert.ok(s.button('Remove Photo').props.disabled);
  assert.deepEqual(s.calls.map(c => c.url), ['/api/profile/photo']);
});
test('name save normalizes text, refreshes Home cache, and clears dirty state', async () => {
  const s = setup(); await s.load(); s.edit('  Alexandra  '); assert.equal(s.guard(), false);
  s.save(); await settle();
  assert.equal(s.input().props.value, 'Alexandra'); assert.match(s.text(), /Changes saved/);
  assert.equal(s.refresh(), 1); assert.equal(s.guard(), true); assert.ok(s.button('Save Changes').props.disabled);
  assert.deepEqual(JSON.parse(s.calls[1].body), { displayName: 'Alexandra' });
});
test('blank name can be saved and excessive name cannot start a request', async () => {
  const s = setup(undefined, 'Alex'); await s.load(); s.edit(' '); s.save(); await settle();
  assert.equal(s.input().props.value, '');
  const count = s.calls.length; s.edit('x'.repeat(81)); s.save(); await settle();
  assert.equal(s.calls.length, count); assert.match(s.text(), /80 characters or fewer/);
});
test('failed name write preserves the draft, dirty guard and retry', async () => {
  let fail = true;
  const s = setup(async (_url, init) => !init.method ? new Response(null, { status: 204 }) : fail ? Response.json({ error: 'Name failed.' }, { status: 503 }) : Response.json({ displayName: 'Alex' }));
  await s.load(); s.edit('Alex'); s.save(); await settle();
  assert.match(s.text(), /Name failed/); assert.equal(s.input().props.value, 'Alex'); assert.equal(s.guard(), false);
  fail = false; s.save(); await settle(); assert.match(s.text(), /Changes saved/); assert.equal(s.guard(), true);
});
test('photo change/removal are saved explicitly, and unused blob URLs are revoked', async () => {
  const s = setup(async (_url, init) => !init.method ? new Response(new Blob(['old'], { type: 'image/png' })) : Response.json({ saved: true }));
  await s.load(); assert.ok(s.button('Change Photo')); assert.equal(s.calls.length, 1);
  s.photo(new Blob(['new'], { type: 'image/webp' })); s.render(); s.h.effects();
  assert.ok(s.revoked.length); assert.equal(s.calls.length, 1);
  s.save(); await settle(); assert.equal(s.calls[1].method, 'PUT'); assert.equal(s.calls[1].headers['Content-Type'], 'image/webp');
  s.button('Remove Photo').props.onClick(); assert.equal(s.calls.length, 2);
  s.save(); await settle(); assert.equal(s.calls[2].method, 'DELETE'); assert.ok(s.button('Remove Photo').props.disabled);
  s.render(); s.h.effects();
  s.h.cleanup(); assert.ok(s.revoked.length >= 2);
});
test('name saved plus photo failure is accurate; retry does not repeat name mutation', async () => {
  let fail = true;
  const s = setup(async (url, init) => !init.method ? new Response(null, { status: 204 }) : url === '/api/profile' ? Response.json({ displayName: 'Alex' }) : fail ? Response.json({ error: 'Photo failed.' }, { status: 503 }) : Response.json({ saved: true }));
  await s.load(); s.edit('Alex'); s.photo(new Blob(['new'], { type: 'image/png' })); s.save(); await settle();
  assert.match(s.text(), /Your display name was saved. Photo failed/); assert.equal(s.guard(), false);
  fail = false; s.save(); await settle();
  assert.equal(s.calls.filter(c => c.url === '/api/profile').length, 1); assert.match(s.text(), /Changes saved/); assert.equal(s.guard(), true);
});
test('duplicate submits are locked while saving and failed refresh is not hidden', async () => {
  let finish;
  const s = setup(async (_url, init) => !init.method ? new Response(null, { status: 204 }) : new Promise(resolve => finish = resolve));
  await s.load(); s.edit('Alex'); s.save(); s.save();
  assert.equal(s.calls.length, 2); assert.equal(s.guard(), false);
  finish(Response.json({ displayName: 'Alex', refreshRequired: true })); await settle();
  assert.match(s.text(), /Sign in again to refresh your Home greeting/);
});
test('photo read failure can retry; invalid files do not discard existing edits', async () => {
  let fail = true;
  const s = setup(async () => fail ? Response.json({ error: 'Photo read failed.' }, { status: 503 }) : new Response(null, { status: 204 }));
  await s.load(); assert.ok(s.button('Retry')); s.edit('Name draft');
  s.photo(new Blob(['<svg/>'], { type: 'image/svg+xml' })); assert.match(s.text(), /JPEG, PNG, or WebP photo/);
  assert.equal(s.input().props.value, 'Name draft');
  fail = false; s.button('Retry').props.onClick(); await s.load(); assert.equal(s.button('Retry'), undefined);
});
test('leave and unload guards preserve drafts, pending photo reads abort on departure', async () => {
  const s = setup(); await s.load(); s.edit('Unsaved'); s.render(); s.h.effects();
  assert.equal(s.guard(), false);
  let prevented = false; s.listeners.get('beforeunload')({ preventDefault() { prevented = true; } }); assert.ok(prevented);
  s.allow(true); assert.equal(s.guard(), true);
  s.h.cleanup(); assert.ok(s.calls[0].signal.aborted); assert.equal(s.listeners.size, 0);
});
test('authentication redirect or HTML page never acknowledges a saved profile or becomes an avatar', async () => {
  const s = setup(async (_url, init) => !init.method ? new Response(null, { status: 204 }) : new Response('<html>Sign in</html>', { headers: { 'Content-Type': 'text/html' } }));
  await s.load(); s.edit('Keep this draft'); s.save(); await settle();
  assert.match(s.text(), /session could not be verified/); assert.doesNotMatch(s.text(), /Changes saved/);
  assert.equal(s.input().props.value, 'Keep this draft'); assert.equal(s.guard(), false);
  assert.equal(s.calls[1].redirect, 'error');
  const photo = setup(async () => new Response('<html>Sign in</html>', { headers: { 'Content-Type': 'text/html' } }));
  await photo.load(); assert.ok(photo.button('Retry')); assert.ok(photo.button('Remove Photo').props.disabled);
});
