import { projectAdminWebsiteNavigation } from './fixtures/admin-website-navigation.mjs';
import { projectStatsSunrise } from './fixtures/stats-sunrise.mjs';
import { projectCreatorNavigation } from './fixtures/creator-sunrise.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import postcss from 'postcss';
import { projectHomeSunrise } from './fixtures/appearance.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
const css = read('app/home.css');
const block = css.slice(css.indexOf('\n/* Home sunrise presentation:'));
const parsed = postcss.parse(block);

test('all pre-existing Home and Stats styles remain byte-identical beneath the scoped addition', () => {
  assert.equal(hash(projectHomeSunrise(css)), 'f79778162c3f25a8756bf2c308b43f40b5ae9fa55ce402bd206dfbc917282946');
  assert.throws(() => projectHomeSunrise(`${css}\nbody { display: none; }`));
  assert.throws(() => projectHomeSunrise(css.replace('--home-canvas:', '--unapproved-canvas:')));
  assert.notEqual(hash(projectHomeSunrise(css.replace('height: 140px;', 'height: 141px;'))), 'f79778162c3f25a8756bf2c308b43f40b5ae9fa55ce402bd206dfbc917282946');
});

test('every new selector requires the Home dashboard or its own adjacent header', () => {
  parsed.walkRules(rule => {
    for (const selector of rule.selectors) {
      assert.match(selector, /^(?:\.home-v2-shell\[data-home-dashboard\]|\.home-v2-header:has\(\+ \[data-home-dashboard\]\))/);
    }
  });
  assert.doesNotMatch(block, /(?:^|\n)(?:body|:root|html)\s*[{,]/);
  assert.doesNotMatch(block, /content:\s*['"][^'"]+['"]/);
});

// These are fixed identities from the accepted c37a83e checkpoint, not runtime
// baselines. All interaction, authorization, theme and private-avatar logic stays frozen.
for (const [path, expected] of Object.entries({
  'components/StudyPlanner.tsx': 'a841c263e86792c95d52c3d5b4e047b802a7c4048ede1bf2d1ac2873c6fffddc',
  'components/application-shell/SocratesShell.tsx': '7f8898041b5ae7ce728e4c5c0fd49069f1450e78b9164ff5d8eff657a5b00082',
  'components/study-planner/LearnerShell.tsx': 'ce2d9db7a9a715fadbe13daf14d086fbd917414f8eed6f4e2da2a969eb890f19',
  'components/AppearanceProvider.tsx': '736c4ad6e3d5a5299f39bd634c32f4c2c3b270e2cd16286022fa0933e4ad4e7c',
  'lib/appearance.ts': 'a155794d7dc2fae1610a52fd2a1b37cd3cfcdf2158ac0a9a0d1704d65f6c1f9f',
  'app/appearance.css': '4be57050307cbf106f88004881833a41e353cd130b559c6003cbeb6cf1ecf241',
  'components/HomeProfileAvatar.tsx': '3e3f46c9502619ccf30a84f357302b9354679fc30218e058dfd94ed5180e1c0b',
})) test(`unchanged behavior and security: ${path}`, () => assert.equal(hash(path === 'components/application-shell/SocratesShell.tsx' ? projectCreatorNavigation(projectAdminWebsiteNavigation(read(path))) : projectStatsSunrise(path, read(path))), expected));

test('Home palette follows existing dark appearance tokens without redefining them', () => {
  const tokens = {};
  parsed.walkDecls(declaration => {
    assert.ok(!declaration.prop.startsWith('--appearance-'), 'Never redefine a shared theme token');
    if (declaration.prop.startsWith('--home-')) tokens[declaration.prop] = declaration.value;
  });
  for (const key of ['canvas', 'panel', 'ink', 'muted', 'line', 'gold', 'control', 'focus']) {
    assert.match(tokens[`--home-${key}`], /^var\(--appearance-/);
  }
  assert.match(block, /socrates-header-mountains\.jpg/);
  assert.match(block, /socrates-mountains\.jpg/);
});

test('Light heading, muted copy, navigation and control accents have readable contrast', () => {
  const lum = hex => hex.match(/../g).map(c => parseInt(c, 16) / 255)
    .map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
    .reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
  for (const [ink, surface] of [['80613a','faf7f0'],['52677b','fffdf8'],['162b40','fffdf8'],['f6f3ea','1d2e35'],['f1c77e','5d5039'],['233f50','fffdf8']]) {
    const [a,b] = [lum(ink),lum(surface)].sort((a,b) => b-a);
    assert.ok((a+.05)/(b+.05) >= 4.5, `${ink} on ${surface}`);
  }
});

test('Topic expansion uses natural page flow with stationary desktop navigation', () => {
  assert.match(block, /min-width: 1101px\) and \(min-height: 42rem/);
  assert.match(block, /max-width: 1100px/);
  assert.match(block, /max-width: 719px/);
  assert.match(block, /height: auto;/);
  assert.match(block, /contain: none;/);
  assert.match(block, /max-height: none;/);
  assert.match(block, /overflow: visible;/);
  assert.doesNotMatch(block, /max-height: 60dvh|overflow-y: auto/);
  const fixed = [];
  parsed.walkDecls('position', declaration => {
    if (declaration.value === 'fixed') {
      fixed.push(declaration.parent.selector);
      assert.equal(declaration.parent.parent.params, '(min-width: 1101px)');
    }
  });
  assert.deepEqual(fixed, [
    '.home-v2-header:has(+ [data-home-dashboard]) .home-v2-brand',
    '.home-v2-shell[data-home-dashboard] > :first-child > aside',
  ]);
  assert.match(block, /:focus-visible/);
  assert.match(block, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(block, /overflow(?:-y)?:\s*(?:hidden|clip)|display:\s*none/);
});
