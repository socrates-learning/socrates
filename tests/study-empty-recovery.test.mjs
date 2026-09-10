import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const planner = await readFile(
  new URL('../components/StudyPlanner.tsx', import.meta.url),
  'utf8'
);
const emptyState = planner.slice(
  planner.indexOf('{!hasStudyCandidate ? ('),
  planner.indexOf(') : !isAnswerVisible ?', planner.indexOf('{!hasStudyCandidate ? ('))
);

test('genuine empty Study states recover only through canonical Home', () => {
  assert.match(emptyState, />\s*Go Home\s*<\/button>/);
  assert.match(emptyState, /leaveStudyMode\('dashboard'\)/);
  assert.doesNotMatch(emptyState, /Set Up Deck|Deck Menu|Creator Studio/);
});

test('the empty-state copy still distinguishes no selection from no eligible material', () => {
  assert.match(planner, /No study material selected/);
  assert.match(planner, /No eligible study material/);
  assert.match(planner, /Choose an official Topic, personal Topic, or Personal Deck on Home/);
  assert.match(planner, /they contain no eligible Published official Questions or selected personal Cards/);
});

test('retry remains available for a start failure but not a genuine empty pool', () => {
  assert.match(emptyState, /studyStartFailure === 'error'/);
  assert.match(emptyState, />\s*Retry\s*<\/button>/);
  assert.match(emptyState, /openStudyMode\(\)/);
  assert.match(planner, /Retry answer/);
  assert.match(planner, /Retry next card/);
});

test('Study Exit uses the same dashboard transition that clears stale Stats hashes', () => {
  assert.match(planner, /else if \([\s\S]*getStatsTabFromHash\(window\.location\.hash\)[\s\S]*window\.history\.replaceState/);
  assert.match(planner, /onClick=\{\(\) => void leaveStudyMode\('dashboard'\)\}/);
});
