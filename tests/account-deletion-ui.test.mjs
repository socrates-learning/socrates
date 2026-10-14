import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadConceptModule, hookHarness, jsx } from './fixtures/concept-media-authoring.mjs';
const nodes = n => Array.isArray(n) ? n.flatMap(nodes) : n && typeof n === 'object' ? [n, ...nodes(n.props?.children)] : [];
const text = n => Array.isArray(n) ? n.map(text).join('') : n && typeof n === 'object' ? text(n.props?.children) : typeof n === 'string' || typeof n === 'number' ? String(n) : '';
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve)); };
function setup(transport = async (_url, init) => Response.json({ state: init?.method === 'DELETE' ? 'complete' : init?.method === 'POST' ? 'pending' : 'none' })) {
  const h = hookHarness(), calls = [], routes = [];
  const modal = { open: false, showModal() { this.open = true; }, close() { this.open = false; } };
  let focused = false;
  const component = loadConceptModule('components/DeleteAccount.tsx', {
    react: h.hooks, 'react/jsx-runtime': jsx,
    './DeleteAccount.module.css': { __esModule: true, default: new Proxy({}, { get: (_o, key) => key }) },
  }, { fetch: async (url, init) => { calls.push({ url, ...init }); return transport(url, init); },
    window: { location: { pathname: '/account', search: '' }, history: { replaceState: (_state, _title, path) => routes.push(path) } } });
  const render = () => {
    const tree = h.render(() => component.default());
    nodes(tree).find(n => n.type === 'dialog').props.ref.current = modal;
    nodes(tree).find(n => n.type === 'button' && text(n) === 'Delete Account').props.ref.current = { focus() { focused = true; } };
    return tree;
  };
  const button = label => nodes(render()).find(n => n.type === 'button' && text(n) === label);
  return { calls, routes, modal, render, button, focused: () => focused,
    async load() { render(); h.effects(); await settle(); return render(); },
    edit(value, type) { nodes(render()).find(n => n.type === 'input' && (type ? n.props.type === type : !n.props.type)).props.onChange({ target: { value } }); },
    submit() { return nodes(render()).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); },
    escape() { let prevented = false; nodes(render()).find(n => n.type === 'dialog').props.onCancel({ preventDefault() { prevented = true; } }); return prevented; },
  };
}
test('loading status never initiates deletion; cancel and Escape restore focus and erase credentials', async () => {
  const s = setup(); await s.load(); assert.deepEqual(s.calls.map(c => c.method), [undefined]);
  s.button('Delete Account').props.onClick(); assert.ok(s.modal.open);
  s.edit('temporary secret', 'password'); s.edit('DELETE');
  assert.ok(s.escape()); assert.equal(s.modal.open, false); assert.ok(s.focused());
  assert.ok(nodes(s.render()).filter(n => n.type === 'input').every(n => n.props.value === ''));
  assert.equal(s.calls.length, 1);
});
test('explicit confirmation and password precede deletion; duplicate clicks do not duplicate requests', async () => {
  let finish;
  const s = setup(async (_url, init) => init?.method === 'POST' ? new Promise(resolve => finish = resolve) : Response.json({ state: init?.method === 'DELETE' ? 'complete' : 'none' }));
  await s.load(); s.submit(); await settle(); assert.equal(s.calls.length, 1);
  s.edit('current password', 'password'); s.edit('DELETE'); s.submit(); s.submit();
  assert.equal(s.calls.filter(c => c.method === 'POST').length, 1);
  assert.equal(s.escape(), true); assert.ok(s.button('Keep My Account').props.disabled);
  finish(Response.json({ state: 'pending' })); await settle();
  assert.deepEqual(s.calls.map(c => c.method), [undefined, 'POST', 'DELETE']);
  assert.deepEqual(s.routes, ['/account/deletion']); assert.match(text(s.render()), /Account deleted/);
  assert.ok(!nodes(s.render()).some(n => n.type === 'input'));
});
test('failed identity verification preserves account and never calls cleanup', async () => {
  const s = setup(async (_url, init) => init?.method ? Response.json({ error: 'Password could not be verified.' }, { status: 403 }) : Response.json({ state: 'none' }));
  await s.load(); s.edit('incorrect', 'password'); s.edit('DELETE'); s.submit(); await settle();
  assert.match(text(s.render()), /Password could not be verified/); assert.equal(s.calls.length, 2);
  assert.deepEqual(s.routes, ['/account/deletion']); assert.ok(s.button('Keep My Account'));
  s.button('Keep My Account').props.onClick(); assert.deepEqual(s.routes, ['/account/deletion', '/account']);
});
test('interrupted cleanup retains an honest pending state and retries without repeating password submission', async () => {
  let fail = true;
  const s = setup(async (_url, init) => init?.method === 'DELETE' && fail ? Response.json({ error: 'Retry cleanup.' }, { status: 503 }) : Response.json({ state: init?.method === 'DELETE' ? 'complete' : init?.method === 'POST' ? 'pending' : 'none' }));
  await s.load(); s.edit('current password', 'password'); s.edit('DELETE'); s.submit(); await settle();
  assert.match(text(s.render()), /Finish account deletion/); assert.ok(s.button('Retry Deletion'));
  assert.ok(!s.button('Keep My Account')); assert.ok(!nodes(s.render()).some(n => n.type === 'input'));
  s.modal.open = true; s.escape(); assert.ok(s.modal.open);
  fail = false; s.submit(); await settle(); assert.match(text(s.render()), /Account deleted/);
  assert.equal(s.calls.filter(c => c.method === 'POST').length, 1);
});
test('reloading with a restricted receipt exposes retry, while complete status exposes no destructive form', async () => {
  const s = setup(async () => Response.json({ state: 'pending' })); await s.load();
  assert.ok(s.modal.open); assert.ok(s.button('Retry Deletion')); assert.ok(!nodes(s.render()).some(n => n.type === 'input'));
  const done = setup(async () => Response.json({ state: 'complete' })); await done.load();
  assert.ok(done.modal.open); assert.ok(!nodes(done.render()).some(n => n.type === 'form'));
  assert.equal(nodes(done.render()).find(n => n.type === 'a').props.href, '/login');
});
test('lost start response never claims cancellation and permits verified recovery without a receipt', async () => {
  let interrupted = true;
  const s = setup(async (_url, init) => {
    if (init?.method === 'POST' && interrupted) throw new Error('Response interrupted');
    return Response.json({ state: init?.method === 'POST' ? 'pending' : init?.method === 'DELETE' ? 'complete' : 'none' });
  });
  await s.load(); s.button('Delete Account').props.onClick(); s.edit('current password', 'password'); s.edit('DELETE');
  s.submit(); assert.deepEqual(s.routes, ['/account/deletion']); await settle();
  assert.match(text(s.render()), /may already be locked/); assert.ok(!s.button('Keep My Account'));
  s.escape(); assert.ok(s.modal.open); assert.ok(s.button('Confirm and Continue').props.disabled);
  interrupted = false; s.edit('current password', 'password'); s.submit(); await settle();
  assert.match(text(s.render()), /Account deleted/);
  assert.equal(s.calls.filter(c => c.method === 'DELETE').length, 1);
});
test('dialog has accessible descriptions, native modal semantics, focus controls and private receipt transport', () => {
  const s = setup(), tree = s.render(), dialog = nodes(tree).find(n => n.type === 'dialog');
  assert.equal(dialog.props['aria-labelledby'], 'delete-account-title');
  assert.equal(dialog.props['aria-describedby'], 'delete-account-description');
  assert.ok(s.button('Keep My Account').props.autoFocus);
  const source = readFileSync(new URL('../components/DeleteAccount.tsx', import.meta.url), 'utf8');
  assert.ok(!source.includes('localStorage')); assert.ok(!source.includes('window.confirm'));
});
