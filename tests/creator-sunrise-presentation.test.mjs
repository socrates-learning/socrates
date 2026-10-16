import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import postcss from 'postcss';
import { projectAdminPresentation } from './fixtures/admin-sunrise.mjs';
import { projectCreatorSunriseStyles, projectCreatorNavigation } from './fixtures/creator-sunrise.mjs';
const read = path => projectAdminPresentation(path, readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const hash = source => createHash('sha256').update(source).digest('hex');

// Fixed task-start identities protect the actual authoring and security paths.
const unchanged = {
  "components/CreatorStudioV2Client.tsx": "7f73ec393f6f87b1dfc89c10d08889cf328c68f67d5bb7515c149e8e3d520ba3",
  "components/creator/CreatorStudioChrome.tsx": "a9ad9b5da07440d133297aec1c8e06165c72c72832d5dad3dc7116bc433a7593",
  "components/creator/CreatorLearnerQuestionsWorkspace.tsx": "ef91344bcc26687a97b3afaba7b73606b23733ddc1e3929f2dd4596a7114d873",
  "components/creator/PersonalCardField.tsx": "2471e994b398b86a1ee5e58afdfc36c07c7ba9b286fbc0f5b00dde51324af5c6",
  "components/creator/OfficialVisualField.tsx": "266487aca047dc59e77e43426ecfb8c189caa4a504281584432b652814f928af",
  "components/creator/StandaloneCustomCardWorkspace.tsx": "b110ac9c210b04e2b0e36276c64bfbb2c6eaf0cdb00b13ffd375748454f8a189",
  "components/CreatorTopicTreeInteraction.tsx": "6b4e0a167c7d7d9456b0c99c9b151f541d7cd3e038e63faea2f10b3d5855af86",
  "components/creator/CreatorQuestionSearchPanel.tsx": "0040af49e70af041182192c91ac4fb4584256fa317fcbce66e4959ecf932c422",
  "components/StudyCreatorFlaggedBrowser.tsx": "47ce4b3f9c6cdc41b45bba10d2a3da058d53b9cfce80e5b9aa3febcd2af6ce11",
  "components/StudyPlanner.tsx": "a841c263e86792c95d52c3d5b4e047b802a7c4048ede1bf2d1ac2873c6fffddc",
  "lib/creator-capabilities.ts": "3aa3f0340dca4a28dcb227c2e78621354a5d3f063a66333813515143b357e0db",
  "lib/application-shell-navigation.ts": "f7e93525911d54d00d0c4c60620cf2ca8f01fdc046917515f6d542eaad656ed4",
  "app/appearance.css": "4be57050307cbf106f88004881833a41e353cd130b559c6003cbeb6cf1ecf241"
};
for (const [path, expected] of Object.entries(unchanged)) test(`preserved authoring contract: ${path}`, () => {
  assert.equal(hash(read(path)), expected);
});

const previousStyles = {
  "app/home.css": "54919d177a694b2c64fdbcf93dbe59668a8666fc33c844b12275af934737aefd",
  "components/application-shell/SocratesShell.module.css": "437bae9fb4595a062facb62a28da6f64ccda072230688e434fb4514686345aa8",
  "components/CreatorStudioV2Client.module.css": "bb11f80cc6005e000975ff7394382f7c783fa587ae689355b6cdfdf73edcda32"
};
for (const [path, expected] of Object.entries(previousStyles)) test(`append-only presentation: ${path}`, () => {
  const source = read(path);
  assert.equal(hash(projectCreatorSunriseStyles(path, source)), expected);
  assert.throws(() => projectCreatorSunriseStyles(path, source + '\nbody { display: none; }'));
});

test('navigation has only the approved Menu omission and styling marker; all guards remain exact', () => {
  const source = read('components/application-shell/SocratesShell.tsx');
  assert.equal(hash(projectCreatorNavigation(source)), '7f8898041b5ae7ce728e4c5c0fd49069f1450e78b9164ff5d8eff657a5b00082');
  assert.notEqual(hash(projectCreatorNavigation(source.replace('if (!(context?.allowNavigation(navigate) ?? true)) return;', 'if (false) return;'))), '7f8898041b5ae7ce728e4c5c0fd49069f1450e78b9164ff5d8eff657a5b00082');
  const route = read('app/creator/layout.tsx').replace('variant="header" role={role}', `variant={role === 'admin' || role === 'editor' ? 'header' : 'compact'} role={role}`);
  assert.equal(hash(route), '2bf5636ca294b2f710fc22e54c0b77ecd9bcd7e5d188a1d807d59594daf7257c');
});

test('new workspace rules cannot restyle public pages, Stats, Account or Profile', () => {
  for (const [path, marker, scope] of [
    ['components/CreatorStudioV2Client.module.css', '/* Creator sunrise workspace:', '[data-creator-shell]'],
    ['components/application-shell/SocratesShell.module.css', '/* Creator sunrise header:', '.branded[data-creator-shell]'],
    ['app/home.css', '/* Approved shared navigation gold:', '.home-v2-shell[data-home-dashboard]'],
  ]) {
    const source = read(path).slice(read(path).indexOf(marker));
    postcss.parse(source).walkRules(rule => {
      for (const selector of rule.selectors) assert.ok(selector.includes(scope), selector);
    });
    assert.doesNotMatch(source, /url\(['"]?(?:https?:|data:)|content:\s*['"][^'"]+['"]/);
  }
});

test('gold navigation feedback has readable text and keyboard focus, with no reduced-motion animation', () => {
  const source = read('components/application-shell/SocratesShell.module.css').split('/* Creator sunrise header:')[1];
  assert.match(source, /navigation.*:focus-visible/);
  assert.match(source, /navigation.*:hover/);
  assert.match(source, /background: var\(--studio-gold\)/);
  assert.match(source, /color: #fffdf8/);
  const lum = hex => hex.match(/../g).map(x => parseInt(x,16)/255).map(c => c <= .04045 ? c/12.92 : ((c+.055)/1.055)**2.4).reduce((a,c,i)=>a+c*[.2126,.7152,.0722][i],0);
  assert.ok((lum('fffdf8')+.05)/(lum('80613a')+.05) >= 4.5);
});

test('desktop scroll containment has a natural small-window fallback and leaves all controls visible', () => {
  const shell = read('components/application-shell/SocratesShell.module.css').split('/* Creator sunrise header:')[1];
  const body = read('components/CreatorStudioV2Client.module.css').split('/* Creator sunrise workspace:')[1];
  assert.match(shell, /min-width: 1200px\) and \(min-height: 720px/);
  assert.match(shell, /position: relative; min-height: 0; flex: 1; overflow-y: auto/);
  assert.match(body, /max-width: 1199px\), \(max-height: 719px/);
  assert.match(body, /saveToolbar \{ position: static/);
  assert.doesNotMatch(shell + body, /overflow(?:-y)?:\s*(?:hidden|clip)|display:\s*none/);
});
