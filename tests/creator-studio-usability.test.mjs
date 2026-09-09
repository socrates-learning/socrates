import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const creatorSource = readFileSync(
  new URL('../components/CreatorStudioV2Client.tsx', import.meta.url),
  'utf8'
);
const creatorStyles = readFileSync(
  new URL('../components/CreatorStudioV2Client.module.css', import.meta.url),
  'utf8'
);
const studyPlannerSource = readFileSync(
  new URL('../components/StudyPlanner.tsx', import.meta.url),
  'utf8'
);
const homeStyles = readFileSync(new URL('../app/home.css', import.meta.url), 'utf8');

test('Content keeps keyword search and adds Topic Tree browsing', () => {
  assert.match(creatorSource, /placeholder="Search concepts"/);
  assert.match(creatorSource, /<Folder size=\{17\} \/> Browse Concepts/);
  assert.match(creatorSource, /aria-label="Browse Concepts by Topic"/);
  assert.match(creatorSource, /aria-controls="question-concept-browser"/);
  assert.match(creatorSource, /id="question-concept-browser"/);
  assert.match(creatorSource, /renderConceptBrowseTopic/);
  assert.match(creatorSource, /questionConceptsByTopicId\[topic\.id\]/);
  assert.match(creatorSource, /openConceptFromSearch\(conceptOption\.id\)/);
});

test('Question authoring keeps the linked Concept and Topic path visible', () => {
  assert.match(creatorSource, /aria-label="Primary Concept"/);
  assert.match(
    creatorSource,
    /Primary Concept: \{editingQuestionPrimary\?\.name \|\| linkedQuestionConcept\.name\}/
  );
  assert.match(
    creatorSource,
    /path\.map\(\(topic\) => topic\.name\)\.join\(' › '\)/
  );
  assert.match(creatorSource, /selectQuestionConcept\(/);
  assert.match(creatorStyles, /\.linkedConceptContext/);
});

test('Creator Studio stays authoring-only while Stats owns Algorithm diagnostics', () => {
  assert.match(
    creatorSource,
    /\(\['content', 'questions', 'tags'\] as const\)\.map/
  );
  assert.doesNotMatch(creatorSource, /CreatorAlgorithmDiagnostics/);
  assert.match(studyPlannerSource, /import\('\.\/CreatorAlgorithmDiagnostics'\)/);
  assert.match(studyPlannerSource, /'progress', 'history'/);
  assert.match(studyPlannerSource, /canViewAlgorithmDiagnostics/);
  assert.match(studyPlannerSource, /#stats-algorithm/);
  assert.match(studyPlannerSource, /mode !== 'stats'/);
  assert.match(studyPlannerSource, /home-v2-shell-stats/);
  assert.match(homeStyles, /\.home-v2-shell-stats\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
});
