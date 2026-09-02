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
  assert.match(creatorSource, /aria-label="Linked Concept"/);
  assert.match(
    creatorSource,
    /Linked Concept: \{linkedQuestionConcept\.name\}/
  );
  assert.match(
    creatorSource,
    /path\.map\(\(topic\) => topic\.name\)\.join\(' › '\)/
  );
  assert.match(creatorSource, /selectQuestionConcept\(/);
  assert.match(creatorStyles, /\.linkedConceptContext/);
});

test('Creator Studio section structure remains Content, Questions, and Tags', () => {
  assert.match(
    creatorSource,
    /\(\['content', 'questions', 'tags'\] as const\)\.map/
  );
});
