import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { projectStatsSunrise } from './fixtures/stats-sunrise.mjs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const hash = source => createHash('sha256').update(source).digest('hex');
const prior = {
  "components/StudyPlanner.tsx": "a841c263e86792c95d52c3d5b4e047b802a7c4048ede1bf2d1ac2873c6fffddc",
  "components/application-shell/SocratesShell.tsx": "6e0cfbe4a986539081f4c32c22952365dfb2d231d98d019e38d67f3a62b5d282",
  "components/application-shell/SocratesShell.module.css": "930ed58ce6247d81e98d015c5702266158b8ed2cd10d5fc4efd6c90b3e76fe26",
  "components/study-planner/StatsProgress.module.css": "5a25fad7240240cd8e200fa0e1b1b0fd7b4ba2839befd7dad02ce1f3c99be876"
};
for (const [path, expected] of Object.entries(prior)) test(`Stats visual update retains the previous complete source: ${path}`, () => {
  assert.equal(hash(projectStatsSunrise(path, read(path))), expected);
  if (path.endsWith('StatsProgress.module.css')) assert.throws(() => projectStatsSunrise(path, read(path) + '\n/* unexpected */\n'));
  else assert.notEqual(hash(projectStatsSunrise(path, read(path) + '\n// unexpected change\n')), expected);
});
test('Stats preservation rejects an altered color block and navigation behavior', () => {
  const cssPath = 'components/study-planner/StatsProgress.module.css';
  assert.throws(() => projectStatsSunrise(cssPath, read(cssPath).replace('--stats-gold: #80613a;', '--stats-gold: red;')));
  const path = 'components/application-shell/SocratesShell.tsx';
  assert.notEqual(hash(projectStatsSunrise(path, read(path).replace("role === 'admin'", 'true'))), prior[path]);
});
