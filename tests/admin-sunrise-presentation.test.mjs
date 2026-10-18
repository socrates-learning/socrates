import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { projectAdminPresentation } from './fixtures/admin-sunrise.mjs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const page = read('app/admin/users/page.tsx');
const hash = text => createHash('sha256').update(text).digest('hex');
const between = (source, start, end) => {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a);
  return source.slice(a, b);
};
const jsx = (type, props) => ({ type, props });
const nodes = n => Array.isArray(n) ? n.flatMap(nodes) : n?.props ? [n, ...nodes(n.props.children)] : [];
function compile(source, modules) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, require: name => { assert.ok(name in modules, name); return modules[name]; },
  });
  return exports;
}
const runtime = { 'react/jsx-runtime': { jsx, jsxs: jsx } };
const rows = [{ user_id: 'synthetic-pending', email: 'pending@preview.invalid', role: null, created_at: '2026-10-01' }];
function pageFixture(replies = []) {
  const calls = [], effects = [], state = [rows, '']; let cursor = 0;
  const Page = compile(page, {
    ...runtime, react: {
      useState: () => { const i = cursor++; return [state[i], value => { state[i] = value; }]; },
      useEffect: fn => effects.push(fn),
    },
    'lucide-react': { ShieldCheck: 'shield' },
    '@/components/application-shell/SocratesShell': { SocratesShell: 'shell' },
    './AdminUsers.module.css': { default: {}, __esModule: true },
    './AdminWorkspace': { AdminWorkspace: 'AdminWorkspace' },
    '@/lib/supabase': { supabase: { rpc: async (name, args) => { calls.push([name, args]); return replies.shift() ?? { data: rows, error: null }; } } },
  }).default;
  const tree = Page();
  return { tree, state, calls, effects, select: nodes(tree).find(n => n.type === 'select') };
}
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test('all released loading, pending approval and role mutation logic remains byte-identical', () => {
  assert.equal(hash(between(page, '  const [users,', '\n  return (')), '79927831b9bb2b6e587fb64dffacb4b47bc471a27c5143dd46a5b09daca9bd9a');
  assert.equal(hash(between(page, '                  defaultValue=', '\n                >')), 'e09ba33d40e2be115c0b5b53e37124c176a97efbb9024e6bcfe6629d49927a8c');
  assert.equal((page.match(/supabase\.rpc\(/g) ?? []).length, 3);
});

test('Admin workspace starts with User Management and supports keyboard tab switching', () => {
  const state = []; let cursor = 0, focused;
  const Workspace = compile(read('app/admin/users/AdminWorkspace.tsx'), {
    ...runtime, react: { useCallback: fn => fn, useState: initial => { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = value; }]; } },
    'lucide-react': { Mail: 'mail', Users: 'users' },
    './AdminInbox': { AdminInbox: 'Inbox' },
    './AdminUsers.module.css': { default: {}, __esModule: true },
  }).AdminWorkspace;
  const render = () => { cursor = 0; return nodes(Workspace({ children: jsx('UserControls', {}) })); };
  let tree = render();
  assert.equal(tree.find(n => n.props.id === 'admin-tab-users').props['aria-selected'], true);
  assert.equal(tree.find(n => n.props.id === 'admin-panel-inbox').props.hidden, true);
  tree.find(n => n.props.id === 'admin-tab-users').props.onKeyDown({ key: 'ArrowRight', preventDefault() {}, currentTarget: { parentElement: { querySelector: selector => ({ focus: () => { focused = selector; } }) } } });
  tree = render();
  assert.equal(focused, '#admin-tab-inbox');
  assert.equal(tree.find(n => n.props.id === 'admin-tab-inbox').props.tabIndex, 0);
  assert.equal(tree.find(n => n.props.id === 'admin-panel-users').props.hidden, true);
  assert.equal(tree.find(n => n.props.id === 'admin-panel-inbox').props.hidden, false);
});

// Persistent Inbox behavior is covered in admin-inbox-ui.test.mjs.

for (const role of ['learner', 'editor', 'admin']) test(`pending account: existing ${role} assignment and reload`, async () => {
  const h = pageFixture([{ error: null }, { data: [{ ...rows[0], role }], error: null }]);
  assert.equal(h.select.props.defaultValue, '');
  assert.equal(h.select.props['aria-label'], 'Role for pending@preview.invalid');
  h.select.props.onChange({ target: { value: role } }); await settle();
  assert.equal(h.calls[0][0], role === 'learner' ? 'provision_invited_learner' : 'set_user_role_by_email');
  assert.equal(h.calls[0][1].target_email, rows[0].email);
  assert.equal(h.calls[0][1].new_role, role === 'learner' ? undefined : role);
  assert.equal(h.calls[1][0], 'list_users_with_roles');
  assert.equal(h.state[0][0].role, role); assert.equal(h.state[1], '');
});

test('an existing account uses the normal role setter, including returning to learner', async () => {
  const original = rows[0].role;
  try {
    rows[0].role = 'editor';
    const h = pageFixture(); h.select.props.onChange({ target: { value: 'learner' } }); await settle();
    assert.equal(h.calls[0][0], 'set_user_role_by_email'); assert.equal(h.calls[0][1].new_role, 'learner');
  } finally { rows[0].role = original; }
});
test('no selection does not trigger a role change; failed changes retain the list and show the existing error', async () => {
  const h = pageFixture([{ error: { message: 'Synthetic denial' } }]);
  h.select.props.onChange({ target: { value: '' } }); assert.equal(h.calls.length, 0);
  h.select.props.onChange({ target: { value: 'editor' } }); await settle();
  assert.equal(h.calls.length, 1); assert.equal(h.state[1], 'Error: Synthetic denial'); assert.equal(h.state[0], rows);
});
test('initial load preserves empty and error handling without new queries', async () => {
  for (const reply of [{ data: null, error: null }, { data: null, error: { message: 'Synthetic list failure' } }]) {
    const h = pageFixture([reply]); h.effects[0](); await settle();
    assert.equal(h.calls.length, 1); assert.equal(h.calls[0][0], 'list_users_with_roles');
    if (reply.error) assert.equal(h.state[1], 'Error: Synthetic list failure');
    else { assert.equal(h.state[0].length, 0); assert.equal(h.state[1], ''); }
  }
});

for (const role of ['admin', 'editor', 'learner', null]) for (const verified of [true, false]) {
  test(`existing server Admin gate: role=${role}, verified context=${verified}`, async () => {
    const db = { auth: { getUser: async () => ({ data: { user: { id: 'synthetic', email: 'fixture@preview.invalid' } } }) }, from: () => {
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { role } }) }; return q;
    } };
    const Layout = compile(read('app/admin/layout.tsx'), {
      ...runtime, '@/components/Header': { Header: 'Header', HeaderSessionProvider: 'Provider' },
      '@/lib/supabase-server': { createSupabaseServerClient: async () => db },
      '@/lib/server-auth-context': { getVerifiedRequestAuthContext: async () => verified ? { role, email: 'fixture@preview.invalid' } : null },
      '@/lib/server-staff-mfa': { requireStaffMfa: async () => ({ status: { role } }) },
      'next/navigation': { redirect: () => { throw new Error('redirect'); } },
    }).default;
    const result = await Layout({ children: jsx('ProtectedAdmin', {}) });
    assert.equal(nodes(result).some(n => n.type === 'ProtectedAdmin'), role === 'admin');
    assert.equal(JSON.stringify(result).includes('Access Denied'), role !== 'admin');
  });
}

for (const role of ['admin', 'editor', 'learner']) test(`${role}: navigation destinations and Admin visibility remain authorized`, () => {
  const nav = compile(read('lib/application-shell-navigation.ts'), {});
  const Shell = compile(read('components/application-shell/SocratesShell.tsx'), {
    ...runtime,
    react: { createContext: () => ({}), useContext: () => null, useEffect: () => {}, useState: () => ['', () => {}], useRef: () => ({ current: null }) },
    'next/link': { default: 'a', __esModule: true }, 'next/image': { default: 'img', __esModule: true },
    'next/navigation': { useRouter: () => ({}), usePathname: () => '/admin/users' },
    '@/lib/supabase': { supabase: {} }, '@/lib/application-shell-navigation': nav,
    './SocratesShell.module.css': { default: {}, __esModule: true },
  });
  const items = nodes(Shell.ApplicationNavigation({ active: 'admin', role, branded: true }));
  assert.deepEqual(items.filter(n => n.type === 'a').map(n => n.props.href), ['/', '/creator', '/#stats', '/account', ...(role === 'admin' ? ['/admin/users'] : [])]);
  assert.equal(items.some(n => n.props['aria-label'] === 'Menu'), false);
  assert.equal(items.some(n => n.props['aria-label'] === 'Log Out'), false);
  if (role === 'admin') assert.equal(items.find(n => n.props.href === '/admin/users').props['aria-current'], 'page');
});

test('Admin presentation can be removed exactly, preserving Creator and all navigation handlers', () => {
  for (const [path, expected] of [
    ['components/application-shell/SocratesShell.tsx', '49baf2e144462c00d096ce10538ba6abcb9428fb2812be3daff2c64675992248'],
    ['components/application-shell/SocratesShell.module.css', 'e57af6002cac10ae57f8d3c67f9da44461e1894608e1483f079d52e5719485cf'],
  ]) {
    const source = read(path);
    assert.equal(hash(projectAdminPresentation(path, source)), expected);
    if (path.endsWith('.tsx')) assert.notEqual(hash(projectAdminPresentation(path, source.replace('Learn anything.', 'Changed'))), expected);
  }
  assert.throws(() => projectAdminPresentation('SocratesShell.module.css', read('components/application-shell/SocratesShell.module.css') + '\nbody { display: none; }'));
});
test('Admin-only styles retain responsive flow, theme inheritance and visible focus', () => {
  const css = read('app/admin/users/AdminUsers.module.css');
  assert.match(css, /min-width: 1200px\) and \(min-height: 960px/);
  assert.match(css, /overflow-y: auto/); assert.match(css, /max-width: 700px/);
  assert.match(css, /:focus-visible/); assert.match(css, /data-appearance='navy'/); assert.match(css, /data-appearance='midnight'/);
  // Only screen-reader labels and the mobile table header may be visually clipped.
  const visibleLayout = css.replace(/\.visuallyHidden \{[^}]+\}/, '').replace(/\.userTable thead \{ position: absolute;[^}]+\}/, '');
  assert.doesNotMatch(visibleLayout, /overflow(?:-y)?:\s*(?:hidden|clip)|display:\s*none/);
  assert.doesNotMatch(page, /\.from\(|\.auth\.|fetch\(|\/api\//);
});
