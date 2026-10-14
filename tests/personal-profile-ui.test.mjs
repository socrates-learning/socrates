import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConceptModule, hookHarness, jsx } from './fixtures/concept-media-authoring.mjs';
import { loadMediaModule } from './fixtures/content-media-images.mjs';
const profile = loadMediaModule('lib/personal-profile.ts');
const nodes = n => Array.isArray(n) ? n.flatMap(nodes) : n && typeof n === 'object' ? [n, ...nodes(n.props?.children)] : [];
const text = n => Array.isArray(n) ? n.map(text).join('') : n && typeof n === 'object' ? text(n.props?.children) : typeof n === 'string' || typeof n === 'number' ? String(n) : '';
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };
function setup(transport, name = '', props = {}) {
  const h = hookHarness(); h.hooks.useCallback = fn => fn;
  const calls = [], revoked = [], listeners = new Map(), routes = []; let guard, refresh = 0, serial = 0;
  class Element { focus() { document.activeElement = this; } }
  const trigger = new Element(), keep = new Element(), discardChoice = new Element();
  const document = { activeElement: trigger };
  const modal = { open: false, shows: 0, showModal() { this.open = true; this.shows++; }, close() { this.open = false; }, querySelectorAll() { return [keep, discardChoice]; } };
  const component = loadConceptModule('components/PersonalProfile.tsx', {
    react: h.hooks, 'react/jsx-runtime': jsx, 'lucide-react': { UserRound: 'Icon' },
    'next/navigation': { useRouter: () => ({ refresh: () => refresh++ }) },
    '@/components/application-shell/SocratesShell': { SocratesShell: 'Shell', useSocratesNavigationGuard: fn => guard = fn },
    '@/lib/personal-profile': profile,
    '@/components/ProfileSecurity': { ProfileSecurity: 'Security' },
    './PersonalProfile.module.css': { __esModule: true, default: new Proxy({}, { get: (_o, key) => key }) },
  }, {
    fetch: async (url, init) => { calls.push({ url, ...init }); return transport ? transport(url, init) : init.method === 'PUT' ? Response.json(JSON.parse(init.body)) : new Response(null, { status: 204 }); },
    URL: { createObjectURL: () => `blob:fixture-${++serial}`, revokeObjectURL: value => revoked.push(value) },
    document, HTMLElement: Element,
    window: { confirm: () => assert.fail('Internal Profile navigation must not use a browser confirmation'), addEventListener: (event, fn) => listeners.set(event, fn), removeEventListener: event => listeners.delete(event), location: { assign(path) { routes.push(path); } } },
  });
  const render = () => {
    const tree = h.render(() => component.PersonalProfile({ email: 'owner@example.invalid', initialDisplayName: name, role: 'learner', ...props }));
    nodes(tree).find(n => n.type === 'dialog').props.ref.current = modal;
    nodes(tree).find(n => n.type === 'button' && text(n) === 'Keep Editing').props.ref.current = keep;
    return tree;
  };
  const button = label => nodes(render()).find(n => n.type === 'button' && text(n) === label);
  const input = () => nodes(render()).find(n => n.props?.id === 'profile-display-name');
  return { h, calls, revoked, listeners, render, button, input, modal, document, trigger, keep, discardChoice, routes,
    refresh: () => refresh, guard: resume => { render(); return guard(resume); }, text: () => text(render()),
    tab(id) { nodes(render()).find(n => n.props?.id === `profile-tab-${id}`).props.onClick(); },
    security(dirty, busy = false) { nodes(render()).find(n => n.type === 'Security').props.onState(dirty, busy); },
    discardNavigation() { const modalNode = nodes(render()).find(n => n.type === 'dialog'); nodes(modalNode).find(n => n.type === 'button' && text(n) === 'Discard Changes').props.onClick(); },
    unload() { render(); h.effects(); const event = { prevented: false, preventDefault() { this.prevented = true; } }; listeners.get('beforeunload')(event); return event; },
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
  let navigated = 0; assert.equal(s.guard(() => navigated++), false); s.render(); s.h.effects();
  s.discardNavigation(); assert.equal(navigated, 1); assert.equal(s.guard(), true);
  s.render(); s.h.effects(); s.h.cleanup(); assert.ok(s.calls[0].signal.aborted); assert.equal(s.listeners.size, 0);
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

test('unopened Account Security cannot silently autofill and dirty a clean Profile', async () => {
  const s = setup(); await s.load();
  assert.equal(nodes(s.render()).filter(n => n.type === 'Security').length, 0);
  assert.equal(s.guard(), true); assert.equal(s.modal.shows, 0);
  assert.equal(s.unload().prevented, false);
  s.tab('preferences'); assert.equal(nodes(s.render()).filter(n => n.type === 'Security').length, 0);
  s.tab('security'); assert.equal(nodes(s.render()).filter(n => n.type === 'Security').length, 1);
  s.security(true); s.tab('information');
  assert.equal(nodes(s.render()).filter(n => n.type === 'Security').length, 1, 'Visited Security drafts survive tab changes');
  assert.equal(s.guard(), false); assert.equal(s.unload().prevented, true);
  s.security(false); assert.equal(s.guard(), true);
});
test('direct Account Security entry remains available and protects pending requests', async () => {
  const s = setup(undefined, '', { initialTab: 'security' }); await s.load();
  assert.equal(nodes(s.render()).filter(n => n.type === 'Security').length, 1);
  s.security(false, true); let navigated = false;
  assert.equal(s.guard(() => navigated = true), false); assert.equal(s.unload().prevented, true);
  assert.equal(s.modal.shows, 0); assert.equal(navigated, false);
  s.security(false, false); assert.equal(s.guard(), true);
});
test('clean entry, asynchronous photo completion and read failure do not create unsaved changes', async () => {
  let finish;
  const s = setup(() => new Promise(resolve => finish = resolve));
  s.render(); s.h.effects(); assert.equal(s.guard(), true); assert.equal(s.unload().prevented, false);
  finish(new Response(new Blob(['photo'], { type: 'image/png' }))); await settle();
  assert.equal(s.guard(), true); assert.equal(s.unload().prevented, false); assert.ok(s.button('Save Changes').props.disabled);
  const failure = setup(() => Response.json({ error: 'Photo unavailable.' }, { status: 503 })); await failure.load();
  assert.equal(failure.guard(), true); assert.equal(failure.unload().prevented, false);
});
test('custom confirmation opens once, focuses Keep Editing and cancellation restores the trigger', async () => {
  const s = setup(); await s.load(); s.edit('Draft');
  let destination = '';
  assert.equal(s.guard(() => destination = '/account'), false);
  s.render(); s.h.effects();
  assert.equal(s.modal.open, true); assert.equal(s.modal.shows, 1); assert.equal(s.document.activeElement, s.keep);
  assert.equal(s.guard(() => destination = '/creator'), false); s.render(); s.h.effects();
  assert.equal(s.modal.shows, 1);
  const modal = nodes(s.render()).find(n => n.type === 'dialog');
  assert.equal(modal.props['aria-labelledby'], 'profile-leave-title');
  assert.equal(modal.props['aria-describedby'], 'profile-leave-message');
  assert.match(text(modal), /You have unsaved profile changes\. Would you like to discard them\?/);
  s.button('Keep Editing').props.onClick();
  assert.equal(s.modal.open, false); assert.equal(s.document.activeElement, s.trigger);
  assert.equal(destination, ''); assert.equal(s.input().props.value, 'Draft'); assert.equal(s.unload().prevented, true);
});
test('Tab and Shift+Tab cycle within the confirmation choices', async () => {
  const s = setup(); await s.load(); s.edit('Draft'); s.guard(() => {}); s.render(); s.h.effects();
  const dialog = nodes(s.render()).find(n => n.type === 'dialog');
  const tab = shiftKey => {
    let prevented = false;
    dialog.props.onKeyDown({ key: 'Tab', shiftKey, currentTarget: s.modal, preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
  };
  assert.equal(s.document.activeElement, s.keep);
  tab(false); assert.equal(s.document.activeElement, s.discardChoice);
  tab(false); assert.equal(s.document.activeElement, s.keep);
  tab(true); assert.equal(s.document.activeElement, s.discardChoice);
  tab(true); assert.equal(s.document.activeElement, s.keep);
  assert.equal(s.input().props.value, 'Draft');
});
test('Escape cancels without discarding; later confirmation preserves the new requested destination', async () => {
  const s = setup(); await s.load(); s.edit('Draft'); const routes = [];
  s.guard(() => routes.push('/account')); s.render(); s.h.effects();
  let cancelled = false;
  nodes(s.render()).find(n => n.type === 'dialog').props.onCancel({ preventDefault() { cancelled = true; } });
  assert.equal(cancelled, true); assert.equal(s.modal.open, false); assert.deepEqual(routes, []);
  assert.equal(s.input().props.value, 'Draft'); assert.equal(s.document.activeElement, s.trigger);
  s.guard(() => routes.push('/#stats')); s.render(); s.h.effects(); s.discardNavigation();
  assert.deepEqual(routes, ['/#stats']); assert.equal(s.input().props.value, ''); assert.equal(s.unload().prevented, false);
  s.discardNavigation(); assert.deepEqual(routes, ['/#stats'], 'Duplicate confirmation cannot navigate twice');
  assert.equal(s.calls.length, 1, 'Discard performs no profile mutation');
});
test('duplicate navigation requests never replace the originally requested destination', async () => {
  const s = setup(); await s.load(); s.edit('Draft'); const routes = [];
  s.guard(() => routes.push('/creator')); s.guard(() => routes.push('/account')); s.render(); s.h.effects();
  s.discardNavigation(); assert.deepEqual(routes, ['/creator']); assert.equal(s.modal.open, false);
});
test('Back to Home uses the same confirmation and resumes Home only after discard', async () => {
  const s = setup(); await s.load(); s.edit('Draft');
  const shell = nodes(s.render()).find(n => n.type === 'Shell'); shell.props.headerAction.props.onClick();
  s.render(); s.h.effects(); assert.equal(s.modal.open, true); assert.deepEqual(s.routes, []);
  s.discardNavigation(); assert.deepEqual(s.routes, ['/']); assert.ok(s.button('Save Changes').props.disabled);
});
test('optional field saves and explicit discard clear the same guard used by navigation and unload', async () => {
  const details = { username: '', location: '', age: null, language: '', timeZone: '' };
  const s = setup(undefined, '', { initialDetails: details }); await s.load();
  const age = () => nodes(s.render()).find(n => n.type === 'input' && n.props.type === 'number');
  age().props.onChange({ target: { value: '28' } }); assert.equal(s.guard(), false);
  s.save(); await settle(); assert.equal(age().props.value, 28); assert.equal(s.guard(), true);
  assert.equal(s.unload().prevented, false); assert.ok(s.button('Save Changes').props.disabled);
  age().props.onChange({ target: { value: '' } }); assert.equal(s.guard(), false);
  s.button('Discard Changes').props.onClick(); assert.equal(age().props.value, 28); assert.equal(s.guard(), true);
  age().props.onChange({ target: { value: '' } }); s.save(); await settle();
  assert.equal(age().props.value, ''); assert.equal(s.unload().prevented, false);
  assert.equal(JSON.parse(s.calls.at(-1).body).details.age, null);
});
test('failed saves keep edits and both guards; successful retry clears both without reloading', async () => {
  let fail = true;
  const s = setup((_url, init) => !init.method ? new Response(null, { status: 204 }) : fail ? Response.json({ error: 'Retry later.' }, { status: 503 }) : Response.json({ displayName: 'Saved' }));
  await s.load(); s.edit('Saved'); s.save(); await settle();
  assert.equal(s.unload().prevented, true); assert.equal(s.guard(), false); assert.equal(s.input().props.value, 'Saved');
  assert.equal(s.button('Save Changes').props.disabled, false);
  fail = false; s.save(); await settle();
  assert.match(s.text(), /Changes saved/); assert.equal(s.unload().prevented, false); assert.equal(s.guard(), true);
});
test('saved photo additions and removals clear guards; failed deletion retains protection', async () => {
  let fail = false;
  const s = setup((_url, init) => !init.method ? new Response(null, { status: 204 }) : fail ? Response.json({ error: 'Photo failed.' }, { status: 503 }) : Response.json({ saved: true }));
  await s.load(); s.photo(new Blob(['photo'], { type: 'image/png' })); assert.equal(s.unload().prevented, true);
  s.save(); await settle(); assert.equal(s.guard(), true); assert.equal(s.unload().prevented, false);
  s.button('Remove Photo').props.onClick(); fail = true; s.save(); await settle();
  assert.equal(s.guard(), false); assert.equal(s.unload().prevented, true);
  fail = false; s.save(); await settle(); assert.equal(s.guard(), true); assert.equal(s.unload().prevented, false);
});
