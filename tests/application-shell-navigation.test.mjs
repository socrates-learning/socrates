import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { canAccessCreatorRoute } from '../lib/creator-route-access.ts';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const planner = read('components/StudyPlanner.tsx');
function block(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `Missing ordered boundary: ${start}`);
  return source.slice(a, b);
}
function compile(source, bindings) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, ...bindings });
  return exports;
}
const hashes = { progress: '#stats', history: '#stats-history', algorithm: '#stats-algorithm' };
function historyFixture(hash = '', staff = false) {
  const state = { mode: 'dashboard', tab: 'progress' }, listeners = new Map(), entries = [hash]; let position = 0;
  const location = { pathname: '/', search: '?library=nursing', hash };
  const setURL = href => { location.hash = href.startsWith('#') ? href : ''; };
  const window = { location, addEventListener: (n, fn) => listeners.set(n, fn), removeEventListener: n => listeners.delete(n), history: {
    pushState: (_a, _b, href) => { entries.splice(++position); entries.push(href); setURL(href); },
    replaceState: (_a, _b, href) => { entries[position] = href; setURL(href); },
  } };
  const bindings = { window, pathname: '/', canViewAlgorithmDiagnostics: staff, statsTabHashes: hashes,
    setMode: value => { state.mode = value; }, setStatsTab: value => { state.tab = value; } };
  const effect = block(planner, '    if (pathname !==', '  }, [canViewAlgorithmDiagnostics, pathname]);');
  const code = 'export ' + block(planner, 'function getStatsTabFromHash(', 'function StudyFeedbackIcon(')
    + 'export function mount(){' + effect + '}\nexport ' + block(planner, 'function openStatsTab(', '  async function ensureStudySessionWithCandidate(')
    + 'export ' + block(planner, 'function handleHomeClick(', '  function toggleHomeExpanded(');
  const api = compile(code, bindings);
  return { api, state, location, entries, listeners, back: () => { setURL(entries[--position]); listeners.get('popstate')(); }, forward: () => { setURL(entries[++position]); listeners.get('popstate')(); } };
}

for (const staff of [false, true]) for (const hash of ['', '#stats', '#stats-history', '#stats-algorithm']) {
  test(`released direct hash and refresh: staff=${staff}, hash=${hash || 'Home'}`, () => {
    const h = historyFixture(hash, staff); const cleanup = h.api.mount();
    const tab = hash === '#stats-history' ? 'history' : hash === '#stats-algorithm' && staff ? 'algorithm' : 'progress';
    assert.equal(h.state.mode, hash ? 'stats' : 'dashboard'); assert.equal(h.state.tab, tab);
    if (hash === '#stats-algorithm' && !staff) assert.equal(h.location.hash, '#stats');
    const refreshed = historyFixture(h.location.hash, staff); refreshed.api.mount(); assert.deepEqual(refreshed.state, h.state);
    cleanup(); assert.equal(h.listeners.size, 0);
  });
}
test('same-document Home/Stats pushes history; Back/Forward replays mode without a data API', () => {
  const h = historyFixture(); h.api.mount();
  h.api.openStatsTab('progress'); h.api.openStatsTab('history');
  assert.deepEqual(h.state, { mode: 'stats', tab: 'history' });
  let prevented = 0; h.api.handleHomeClick({ preventDefault: () => prevented++ });
  assert.equal(prevented, 1); assert.equal(h.state.mode, 'dashboard'); assert.equal(h.entries.at(-1), '/?library=nursing');
  h.back(); assert.equal(h.state.tab, 'history'); assert.equal(h.state.mode, 'stats');
  h.back(); assert.equal(h.state.tab, 'progress'); h.forward(); assert.equal(h.state.tab, 'history');
  const count = h.entries.length; h.api.openStatsTab('history'); assert.equal(h.entries.length, count);
});
test('released route destinations and no-action Menu are frozen, not future shell markup', () => {
  const items = compile('export ' + block(planner, 'function createHomeRailItems(', 'const CreatorAlgorithmDiagnostics'), {}).createHomeRailItems({ label: 'Creator Studio', href: '/creator' });
  assert.deepEqual(JSON.parse(JSON.stringify(items)), [
    { label: 'Creator Studio', href: '/creator', icon: 'edit' }, { label: 'Stats', icon: 'bars' },
    { label: 'Account Settings', href: '/account', icon: 'gear' }, { label: 'Menu', icon: 'people' },
  ]);
  assert.match(planner, /onStats=\{\(\) => openStatsTab\('progress'\)\}/);
  assert.match(read('app/creator/page.tsx'), /export default NewConceptPage/);
  assert.match(read('app/account/page.tsx'), /redirect\('\/login\?next=\/account'\)/);
  assert.match(read('app/account/page.tsx'), /href="\/"[\s\S]*Back to Home/);
  assert.doesNotMatch(planner, /href: '\/(?:menu|profile)'/);
  // Future shell contract: a discriminated link/action item can replace Menu with
  // Profile later. Neither destination nor Profile functionality exists today.
  assert.match(read('components/study-planner/LearnerShell.tsx'), /kind: 'link'; href: string/);
  assert.match(read('components/study-planner/LearnerShell.tsx'), /kind: 'button'; onClick\?:/);
});
for (const role of ['admin', 'editor', 'learner']) test(`${role}: Creator routes remain independently authorized`, () => {
  const base = { role, userId: '11111111-1111-4111-8111-111111111111', learnerAllowlist: undefined };
  for (const pathname of ['/creator', '/creator/concepts/new']) assert.equal(canAccessCreatorRoute({ ...base, pathname }), true);
  for (const pathname of ['/creator/libraries', '/creator/articles/new']) assert.equal(canAccessCreatorRoute({ ...base, pathname }), role !== 'learner');
  assert.match(read('app/creator/layout.tsx'), /if \(!actor\) redirect\('\/login'\)/);
  assert.match(read('app/creator/concepts/[id]/page.tsx'), /role === 'learner'/);
});
test('Logout clears Library then signs out and redirects, even if clear fails', async () => {
  for (const fail of [false, true]) {
    const calls = [], location = {};
    const { handleLogout } = compile('export ' + block(planner, 'async function handleLogout(', '  function handleCreatorClick('), {
      fetch: async (path, options) => { calls.push([path, options.method]); if (fail) throw new Error('clear failed'); },
      supabase: { auth: { signOut: async () => calls.push('signOut') } }, window: { location },
    });
    if (fail) await assert.rejects(handleLogout(), /clear failed/); else await handleLogout();
    assert.deepEqual(calls, [['/library/clear', 'POST'], 'signOut']); assert.equal(location.href, '/login');
  }
});
test('diagnostics request cache is scoped by user/Library/refresh; tab navigation has no progress RPC', async () => {
  const source = read('components/CreatorAlgorithmDiagnostics.tsx'), calls = [];
  const code = block(source, 'const diagnosticsRequests =', 'function ') + 'export ' + block(source, 'function loadDiagnostics(', '\nfunction ');
  const { loadDiagnostics } = compile(code, { supabase: { rpc: (name, payload) => { calls.push([name, payload.p_library_id]); return Promise.resolve({data:{},error:null}); } } });
  const a = loadDiagnostics('a', 0, 'one'); assert.equal(loadDiagnostics('a', 0, 'one'), a); await a;
  assert.equal(calls.length, 1); await loadDiagnostics('a', 1, 'one'); await loadDiagnostics('a', 1, 'two'); await loadDiagnostics('b', 1, 'two'); assert.equal(calls.length, 4);
  assert.doesNotMatch(block(planner, 'function openStatsTab(', '  async function ensureStudySessionWithCandidate('), /supabase|fetch\(|refreshLearnerProgress/);
});

test('native Library switch retains server membership checks and safe Account return', async () => {
  const safe = compile(read('lib/safe-internal-path.ts'), { URL }).getSafeInternalPath;
  for (const scenario of [
    {role:'admin',member:false,status:303}, {role:'editor',member:false,status:303},
    {role:'learner',member:true,status:303}, {role:'learner',member:false,status:403},
    {role:null,member:false,status:403}, {role:'learner',member:false,anonymous:true,status:303},
  ]) {
    const queries = [], cookies = [], exports = {};
    const db = {auth:{getUser:async()=>({data:{user:scenario.anonymous?null:{id:'user'}}})},from:table=>{
      queries.push(table);const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:table==='user_roles'?{role:scenario.role}:table==='libraries'?{id:'library',slug:'nursing',status:'active'}:scenario.member?{library_id:'library'}:null})};return q;
    }};
    class Response { constructor(body,init){this.body=body;this.status=init.status;} static redirect(url,status){return {url:String(url),status,cookies:{set:(...args)=>cookies.push(args)}};} }
    const modules = {
      'next/server':{NextResponse:Response},
      '@/lib/library-context':{ACTIVE_LIBRARY_COOKIE:'library-cookie',isValidLibrarySlug:s=>s==='nursing'},
      '@/lib/safe-internal-path':{getSafeInternalPath:safe},
      '@/lib/supabase-server':{createSupabaseServerClient:async()=>db},
    };
    vm.runInNewContext(ts.transpileModule(read('app/library/switch/route.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,URL,process:{env:{NODE_ENV:'production'}},require:name=>{assert.ok(name in modules);return modules[name];}});
    const result=await exports.POST({url:'https://fixture.invalid/library/switch',formData:async()=>new Map([['library_slug','nursing'],['return_to','/account']])});
    assert.equal(result.status,scenario.status);
    if(scenario.anonymous){assert.equal(result.url,'https://fixture.invalid/login');assert.equal(queries.length,0);}
    else if(scenario.status===303){assert.equal(result.url,'https://fixture.invalid/account');assert.equal(cookies.length,1);assert.equal(cookies[0][1],'nursing');assert.equal(cookies[0][2].httpOnly,true);assert.equal(cookies[0][2].secure,true);}
    else assert.equal(cookies.length,0);
    if(scenario.role==='learner'&&!scenario.anonymous)assert.ok(queries.includes('user_libraries'));
  }
  assert.equal(safe('https://external.invalid','/account'),'/account');
});

// Execute the shared navigation with inert framework boundaries; no workspace is reconstructed.
function shellFixture(allowed = true, active = 'creator', role = 'learner', branded = false) {
  const calls = [], exports = {};
  const jsx = (type, props) => ({ type, props });
  const definitions = compile(read('lib/application-shell-navigation.ts'), {});
  const modules = {
    react: { createContext: () => ({}), useContext: () => ({ allowNavigation: () => { calls.push('guard'); return allowed; } }), useState: () => [false, () => {}], useRef: () => ({ current: false }) },
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/link': { default: 'a', __esModule: true },
    'next/image': { default: 'Image', __esModule: true },
    'next/navigation': { useRouter: () => ({ push: path => calls.push(path) }) },
    '@/lib/supabase': { supabase: {} }, '@/lib/application-shell-navigation': definitions,
    './SocratesShell.module.css': { default: {}, __esModule: true },
  };
  vm.runInNewContext(ts.transpileModule(read('components/application-shell/SocratesShell.tsx'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, require: name => { assert.ok(name in modules, name); return modules[name]; },
  });
  const tree = exports.ApplicationNavigation({ active, role, branded, onLogout: () => calls.push('logout') });
  const elements = []; function walk(n) { if (Array.isArray(n)) n.forEach(walk); else if (n?.props) { elements.push(n); walk(n.props.children); } } walk(tree);
  return { calls, definitions, elements };
}
test('shared entries retain URLs, native semantics, current state and inert Menu', () => {
  const h = shellFixture(); assert.deepEqual(h.calls, []);
  const links = h.elements.filter(n => n.type === 'a');
  assert.deepEqual(links.map(n => n.props.href), ['/', '/creator', '/#stats', '/account']);
  assert.equal(links.find(n => n.props.href === '/creator').props['aria-current'], 'page');
  assert.equal(h.elements.find(n => n.props['aria-label'] === 'Menu').props.onClick, undefined);
  assert.equal(h.elements.find(n => n.type === 'nav').props['aria-label'], 'Socrates workspaces');
  for (const hash of ['#stats', '#stats-history', '#stats-algorithm']) assert.equal(h.definitions.workspaceFromLocation('/', hash), 'stats');
  assert.equal(h.definitions.workspaceFromLocation('/creator/concepts/example', ''), 'creator');
});
for (const allowed of [true, false]) test(`shell navigation and Logout delegate guard exactly once: allowed=${allowed}`, async () => {
  for (const href of ['/', '/#stats', '/account']) {
    const h = shellFixture(allowed); let prevented = 0;
    h.elements.find(n => n.props.href === href).props.onClick({ button: 0, preventDefault: () => prevented++ });
    assert.equal(prevented, 1); assert.deepEqual(h.calls, allowed ? ['guard', href] : ['guard']);
  }
  const h = shellFixture(allowed); h.elements.find(n => n.props['aria-label'] === 'Log Out').props.onClick();
  await Promise.resolve(); assert.deepEqual(h.calls, allowed ? ['guard', 'logout'] : ['guard']);
});
test('modified link activation neither discards nor reroutes current workspace', () => {
  const h = shellFixture(); h.elements.find(n => n.props.href === '/account').props.onClick({ button: 0, ctrlKey: true, preventDefault: () => assert.fail('native new tab must remain native') });
  assert.deepEqual(h.calls, []);
});

// Temporary Next16.3.4 compatibility boundary (upstream #96714 / #96737).
// Execute installed framework functions, not a hand-written router simulation:
// a hash-bearing initial route must never poison the shared route-cache URL.
function frameworkFunction(path, name) {
  const source = read(`node_modules/next/${path}`);
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const fn = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(fn, `Installed framework boundary missing: ${name}`);
  return `export ${fn.getText(file).replace(/^export /, '')}`;
}
function cachedDestination(initialURL, target, pending = false, esm = false) {
  let cached;
  const cache = (...args) => ({ canonicalUrl: args[5] });
  const discoverPart = (...args) => { cached = args[12]; return { canonicalUrl: cached }; };
  const dir = esm ? 'dist/esm' : 'dist';
  const { discoverKnownRoute } = compile(frameworkFunction(`${dir}/client/components/segment-cache/optimistic-routes.js`, 'discoverKnownRoute'), {
    knownRouteTreeRoot: {}, _cachekey: { splitPathnameIntoParts: p => p.split('/') },
    splitPathnameIntoParts: p => p.split('/'), _cache: { fulfillRouteCacheEntry: cache }, fulfillRouteCacheEntry: cache,
    discoverKnownRoutePart: discoverPart,
  });
  const initial = new URL(initialURL, 'https://fixture.invalid');
  const entry = discoverKnownRoute(0, initial.pathname, initial.search, null, pending ? {} : null, {}, [], false, initialURL, true, false);
  assert.equal(cached, entry.canonicalUrl);
  const { navigateUsingPrefetchedRouteTree } = compile(frameworkFunction('dist/client/components/segment-cache/navigation.js', 'navigateUsingPrefetchedRouteTree'), {
    _bfcache: { computeDynamicStaleAt: () => 0, UnknownDynamicStaleTime: 0 },
    navigateToKnownRoute: (_now, _state, _url, canonicalURL) => canonicalURL,
  });
  return navigateUsingPrefetchedRouteTree(0, {}, new URL(target, 'https://fixture.invalid'), initial, '', null, {}, {}, 0, 0, 'push', {
    canonicalUrl: cached, tree: {}, renderedSearch: initial.search, metadata: { varyPath: [] },
  });
}
for (const [label, hash] of Object.entries(hashes)) test(`framework cache: Stats ${label} → Account → first Home, hashes, refresh and history`, () => {
  for (const esm of [false, true]) for (const pending of [false, true]) {
    assert.equal(cachedDestination('/' + hash, '/', pending, esm), '/');
    for (const destination of ['/', ...Object.values(hashes).map(h => '/' + h)]) {
      assert.equal(cachedDestination('/' + hash, destination, pending, esm), destination);
    }
  }
  const home = historyFixture(); home.api.mount(); assert.equal(home.state.mode, 'dashboard');
  const stats = historyFixture(hash, true); stats.api.mount(); assert.equal(stats.state.tab, label);
});
test('Creator → Account → Home and direct Account → Home retain canonical guarded destination', () => {
  for (const active of ['creator', 'account']) {
    const h = shellFixture(true, active);
    h.elements.find(n => n.props.href === '/').props.onClick({ button: 0, preventDefault() {} });
    assert.deepEqual(h.calls, ['guard', '/']);
    assert.equal(cachedDestination('/', '/'), '/');
  }
});
test('framework patch preserves encoded fragments and Library query strings', () => {
  assert.equal(cachedDestination('/?library=nursing%23one#stats-history', '/?library=nursing%23one'), '/?library=nursing%23one');
  assert.equal(cachedDestination('/?library=nursing#stats', '/?library=nursing#stats-history'), '/?library=nursing#stats-history');
});
test('temporary framework patch pins package and installed versions and errors on future versions', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies.next, '16.3.4'); assert.equal(pkg.dependencies['patch-package'], '8.0.1');
  assert.match(pkg.scripts.postinstall, /patch-package --error-on-fail$/);
  const guard = pkg.scripts.postinstall.match(/^node -e "([^"]+)" && /)?.[1]; assert.ok(guard);
  for (const declared of ['16.3.4', '16.3.5']) for (const installed of ['16.3.4', '16.3.5']) {
    const run = () => vm.runInNewContext(guard, { require: name => name === './package.json' ? { dependencies: { next: declared } } : { version: installed } });
    if (declared === '16.3.4' && installed === '16.3.4') assert.doesNotThrow(run);
    else assert.throws(run, /Temporary Next.js hash-cache patch requires exactly 16.3.4/);
  }
  assert.match(pkg.socratesFrameworkCompatibility.next16_3_4, /remove this patch/);
  assert.match(pkg.socratesFrameworkCompatibility.next16_3_4, /96714.*96737/);
});

test('branded navigation preserves role-qualified destinations and the same guard', () => {
  for (const role of ['admin', 'editor', 'learner', null]) {
    const h = shellFixture(false, 'creator', role, true);
    const links = h.elements.filter(n => n.type === 'a');
    assert.deepEqual(links.map(n => n.props.href), ['/', '/creator', '/#stats', '/account', ...(role === 'admin' ? ['/admin/users'] : [])]);
    links.find(n => n.props.href === '/account').props.onClick({ button: 0, preventDefault() {} });
    assert.deepEqual(h.calls, ['guard']);
  }
  const shell = read('components/application-shell/SocratesShell.tsx');
  assert.match(shell, /src="\/brand\/socrates-logo-dark\.png"/);
  assert.match(shell, /onClose=\{\(\) => trigger\.current\?\.focus\(\)\}/);
  assert.match(shell, /variant === 'header'/);
  assert.match(read('app/creator/layout.tsx'), /variant=\{role === 'admin' \|\| role === 'editor' \? 'header' : 'compact'\}/);
});


test('Creator header opt-in is staff-only; learners keep the released compact navigation', async () => {
  for (const role of ['admin', 'editor', 'learner']) {
    const exports = {}, jsx = (type, props) => ({ type, props });
    const modules = {
      'react/jsx-runtime': { jsx, jsxs: jsx },
      '@/components/application-shell/SocratesShell': { SocratesShell: 'shell' },
      '@/components/Header': { Header: 'header', HeaderSessionProvider: 'session' },
      '@/lib/server-creator-route-access': {
        canActorAccessSharedCreator: () => true,
        getServerCreatorRouteActor: async () => ({ role, email: 'synthetic@example.invalid' }),
      },
      'next/navigation': { redirect: () => assert.fail('Unexpected redirect') },
    };
    vm.runInNewContext(ts.transpileModule(read('app/creator/layout.tsx'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
      { exports, require: name => { assert.ok(name in modules, name); return modules[name]; } });
    const tree = await exports.default({ children: 'existing-workspace' });
    assert.equal(tree.type, 'session');
    assert.equal(tree.props.children.type, 'shell');
    assert.equal(tree.props.children.props.variant, role === 'learner' ? 'compact' : 'header');
    assert.equal(tree.props.children.props.children, 'existing-workspace');
  }
});

test('Home dashboard keeps the released sidebar, complete white column and independent Logout with no profile menu', () => {
  assert.match(planner, /<LearnerHeader classPrefix="home-v2"/);
  assert.match(planner, /<SocratesShell variant="home" active="home"/);
  assert.match(planner, /<SocratesShell active="stats"/);
  assert.doesNotMatch(planner, /variant="header"|home-v2-shell-top-nav/);
  const styles = read('components/application-shell/SocratesShell.module.css');
  const boundedHome = `@media (min-width: 1101px) {
  .home { background: white; border-right: 1px solid #dbe3ef; }
  .home .rail { position: sticky; top: 0; height: var(--home-dashboard-height, calc(100dvh - 140px)); min-height: 0; background: transparent; border-right: 0; }
  .home .desktop, .home .navigation { min-height: 0; }
  .home .entries { min-height: 0; overflow-y: auto; }
  .home .logout { flex-shrink: 0; }
}`;
  assert.equal(styles.split(boundedHome).length, 2);
  assert.match(styles, /@media \(max-width: 1100px\)[\s\S]*\.home \.desktop \{ display: none; \}/);
  assert.doesNotMatch(read('components/application-shell/SocratesShell.tsx'), /accountDialog|accountTrigger|Account menu|section="account"/);
});

test('Home hover is full-entry, excludes active/disabled actions and Logout, and respects reduced motion without layout changes', () => {
  const styles = read('components/application-shell/SocratesShell.module.css');
  const addition = `
/* Home navigation feedback only; active entries, Logout and layout stay unchanged. */
.home .entries > a, .home .entries > button { transition: background-color 140ms ease; }
@media (hover: hover) and (pointer: fine) {
  .home .entries > a:not([aria-current='page']):not([aria-disabled='true']):hover,
  .home .entries > button:not(:disabled):not([aria-current='page']):not([aria-disabled='true']):hover { background-color: #eaf1fa; }
}
@media (prefers-reduced-motion: reduce) {
  .home .entries > a, .home .entries > button { transition: none; }
}
`;
  assert.equal(styles.split(addition).length, 2);
  assert.ok(styles.endsWith(addition));
  assert.equal(createHash('sha256').update(styles.slice(0, -addition.length)).digest('hex'), '8e48a05c749fc69e8bb148be072c5d66d4f0da355c70dcc977f25ce6d2266266', 'All visually accepted Home/Creator/Stats styles remain byte-identical');
  assert.match(styles, /\.navigation \[aria-current='page'\] \{ background: #eef5ff; \}/);
  assert.match(styles, /\.navigation a:focus-visible, \.navigation button:focus-visible, \.trigger:focus-visible \{ outline: 2px solid #155ee8; outline-offset: 2px; \}/);
});

test('Home sidebar retains its active Home destination and original actions after header Home is omitted', () => {
  const h = shellFixture(true, 'home', 'admin');
  const home = h.elements.find(n => n.type === 'a' && n.props.href === '/');
  assert.equal(home.props['aria-current'], 'page');
  assert.deepEqual(h.elements.filter(n => n.type === 'a').map(n => n.props.href), ['/', '/creator', '/#stats', '/account', '/admin/users']);
  const event = { button: 0, preventDefault() {} };
  home.props.onClick(event); assert.deepEqual(h.calls, []);
  h.elements.find(n => n.type === 'a' && n.props.href === '/creator').props.onClick(event);
  assert.deepEqual(h.calls, ['guard', '/creator']);
});
