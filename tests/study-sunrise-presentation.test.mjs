import { projectStatsSunrise } from './fixtures/stats-sunrise.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import postcss from 'postcss';
import { projectStudySunrise, projectHomeHubNavigation } from './fixtures/study-sunrise.mjs';
const read = path => projectStatsSunrise(path, readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const styles = read('components/study-planner/StudyModeStyles.tsx');
const css = styles.split('/* Study sunrise presentation:')[1].split('/* End Study sunrise presentation. */')[0].split('*/').slice(1).join('*/');
function compile(source, modules) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require: name => { assert.ok(name in modules, name); return modules[name]; } });
  return exports;
}
function nodes(tree) { return Array.isArray(tree) ? tree.flatMap(nodes) : tree?.props ? [tree, ...nodes(tree.props.children)] : []; }
function navigation(role, active, home = false, allowed = true) {
  const calls = []; let resume;
  const jsx = (type, props) => ({ type, props });
  const Shell = compile(read('components/application-shell/SocratesShell.tsx'), {
    react: { createContext: () => ({}), useContext: () => ({ allowNavigation: next => { resume = next; calls.push('guard'); return allowed; } }), useEffect() {}, useState: () => [false, () => {}], useRef: () => ({ current: false }) },
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/link': { default: 'a', __esModule: true }, 'next/image': { default: 'img', __esModule: true },
    'next/navigation': { useRouter: () => ({ push: path => calls.push(path) }), usePathname: () => '/' },
    '@/lib/supabase': { supabase: {} }, '@/lib/application-shell-navigation': compile(read('lib/application-shell-navigation.ts'), {}),
    './SocratesShell.module.css': { default: {}, __esModule: true },
  });
  return { items: nodes(Shell.ApplicationNavigation({ role, active, home, branded: !home, onLogout: () => calls.push('logout') })), calls, resume: () => resume?.() };
}
for (const role of ['admin', 'editor', 'learner']) {
  for (const active of ['creator', 'stats', 'admin', 'account', undefined]) test(`${role}: secondary header ${active ?? 'Profile'} preserves destinations without Menu or Logout`, () => {
    const { items } = navigation(role, active);
    assert.deepEqual(items.filter(n => n.type === 'a').map(n => n.props.href), ['/', '/creator', '/#stats', '/account', ...(role === 'admin' ? ['/admin/users'] : [])]);
    assert.equal(items.some(n => ['Log Out', 'Menu'].includes(n.props['aria-label'])), false);
  });
  test(`${role}: Home keeps logout, Account Settings and the same sidebar order`, () => {
    const { items } = navigation(role, 'home', true);
    assert.deepEqual(items.filter(n => n.type === 'a' || n.type === 'button').map(n => n.props['aria-label']), ['Home', 'Creator Studio', 'Stats', ...(role === 'admin' ? ['Admin'] : []), 'Account Settings', 'Log Out']);
  });
}
test('Home logout still consults the guard, resumes once, and prevents duplicate requests', async () => {
  const h = navigation('learner', 'home', true, false);
  const button = h.items.find(n => n.props['aria-label'] === 'Log Out');
  button.props.onClick(); assert.deepEqual(h.calls, ['guard']);
  h.resume(); button.props.onClick(); await Promise.resolve();
  assert.deepEqual(h.calls, ['guard', 'logout']);
});
test('secondary navigation still protects drafts and retains the original requested destination', () => {
  const h = navigation('learner', undefined, false, false);
  h.items.find(n => n.props.href === '/account').props.onClick({ button: 0, preventDefault() {} });
  assert.deepEqual(h.calls, ['guard']); h.resume(); assert.deepEqual(h.calls, ['guard', '/account']);
});
test('Study presentation is isolated from other pages and does not inject content', () => {
  postcss.parse(css).walkRules(rule => { for (const selector of rule.selectors) assert.ok(selector.includes('.study-v2-page') || selector.includes('.study-v2-header'), selector); });
  assert.doesNotMatch(css, /content:\s*['"][^'"]+['"]|url\(['"]?(?:https?:|data:)|display:\s*none/);
  assert.match(css, /socrates-header-mountains\.jpg/);
  assert.doesNotMatch(css, /font-size:\s*(?:[\d.]+rem|43px)|grid-template-columns|order:/, 'Question typography and control order are not redefined');
});
test('short and narrow layouts release nested content scrolling and keep usable controls', () => {
  assert.match(css, /max-width: 900px\), \(max-height: 719px/);
  assert.match(css, /study-v2-card \{ height: auto; min-height: 420px; overflow: visible/);
  assert.match(css, /study-v2-answer-body \{ overflow-y: visible/);
  assert.match(css, /study-v2-question-content \{ min-height: 340px; overflow-y: visible/);
  assert.match(css, /study-v2-context-action[\s\S]*?min-height: 44px/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /outline: 3px solid var\(--study-focus\)/);
});
test('warm colors preserve dark-theme inheritance and accessible gold contrast', () => {
  assert.match(css, /:root:not\(\[data-appearance='navy'\]\):not\(\[data-appearance='midnight'\]\)/);
  const lum = hex => hex.match(/../g).map(x => parseInt(x,16)/255).map(c => c <= .04045 ? c/12.92 : ((c+.055)/1.055)**2.4).reduce((a,c,i)=>a+c*[.2126,.7152,.0722][i],0);
  const contrast = (a,b) => (Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
  assert.ok(contrast('fffdf8','80613a') >= 4.5);
  assert.ok(contrast('d9b879','101e33') >= 4.5);
  assert.ok(contrast('162b40','faf7f0') >= 7);
});

// Task-start source identities protect rendering, persistence, role checks and prior designs.
const unchanged = {
  "components/StudyPlanner.tsx": "a841c263e86792c95d52c3d5b4e047b802a7c4048ede1bf2d1ac2873c6fffddc",
  "components/study-planner/LearnerShell.tsx": "ce2d9db7a9a715fadbe13daf14d086fbd917414f8eed6f4e2da2a969eb890f19",
  "lib/study-candidates.ts": "a3b406bf7029982cc362dcc38674186e9851d0243cd344fd33eff6a085cf712e",
  "lib/study-session-start.ts": "3b038d7ef7d909cb2545324ab77a941700fa34b7c5a692f1bbc9d27dab294a6d",
  "components/QuestionPersonalNote.tsx": "75c0f1c2968f29083277cf6e4a0accc4e3aa250848d5e747d07378c691022585",
  "components/PersonalProfile.tsx": "118f901047439f9bd438b6fb212aa79c932c3a54ef77604d9e7adce2a89aae78",
  "app/home.css": "4146a1b30176a36085f4ddd373513619cc015e5ef0fbb3484014230c0b8437d7",
  "components/CreatorStudioV2Client.tsx": "7f73ec393f6f87b1dfc89c10d08889cf328c68f67d5bb7515c149e8e3d520ba3",
  "components/CreatorStudioV2Client.module.css": "bfb0a4271ce9f9756c9784602b4bd000d51491f31ced48588823786a17f6f6d0",
  "components/application-shell/SocratesShell.module.css": "930ed58ce6247d81e98d015c5702266158b8ed2cd10d5fc4efd6c90b3e76fe26",
  "app/admin/users/page.tsx": "6287bce837989f87d10de4f81486cab88cdc6557a723b4cd282be63e946c0513",
  "app/admin/users/AdminUsers.module.css": "d765fe72ecf07dd910256d772954435a434cd4ce71c5827c46d0872d7c09d523",
  "lib/application-shell-navigation.ts": "f7e93525911d54d00d0c4c60620cf2ca8f01fdc046917515f6d542eaad656ed4",
  "app/appearance.css": "4be57050307cbf106f88004881833a41e353cd130b559c6003cbeb6cf1ecf241"
};
for (const [path, expected] of Object.entries(unchanged)) test(`unchanged: ${path}`, () => assert.equal(hash(read(path)), expected));
test('exact presentation projections retain original source and reject unexpected changes', () => {
  assert.equal(hash(projectStudySunrise('components/study-planner/StudyModeStyles.tsx', read('components/study-planner/StudyModeStyles.tsx'))), 'aa9a9808787724c58a8deae9ae24140df3002b745063096519e79086045282e0');
  assert.equal(hash(projectHomeHubNavigation('components/application-shell/SocratesShell.tsx', read('components/application-shell/SocratesShell.tsx'))), 'f25665f1220e834945bccd8298167d896220bff027aec3488fe6ded49b8b8a5b');
  assert.throws(() => projectStudySunrise('StudyModeStyles.tsx', styles.replace('--study-gold: #80613a;', '--study-gold: red;')));
});
