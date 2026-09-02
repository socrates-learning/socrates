import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildConceptTopicTree,
  collectConceptTopicSearchIds,
  findConceptTopicPath,
} from '../lib/concept-topic-tree.ts';

const componentSource = await readFile(
  new URL('../components/StudyCreatorClient.tsx', import.meta.url),
  'utf8'
);
const officialBrowserSource = await readFile(
  new URL('../components/SocratesStudyCreatorBrowser.tsx', import.meta.url),
  'utf8'
);
const pageSource = await readFile(
  new URL('../app/study-creator/page.tsx', import.meta.url),
  'utf8'
);

const rows = [
  { id: 'nursing', name: 'Nursing', parent_id: null, sort_order: 0 },
  { id: 'fundamentals', name: 'Fundamentals', parent_id: 'nursing', sort_order: 0 },
  { id: 'cardiovascular', name: 'Cardiovascular', parent_id: 'fundamentals', sort_order: 0 },
  { id: 'adult-health', name: 'Adult Health', parent_id: 'nursing', sort_order: 1 },
];

test('shared Topic utilities preserve arbitrary-depth paths and search ancestors', () => {
  const tree = buildConceptTopicTree(rows);

  assert.equal(
    findConceptTopicPath(tree, 'cardiovascular')
      ?.map((topic) => topic.name)
      .join(' › '),
    'Nursing › Fundamentals › Cardiovascular'
  );
  assert.deepEqual(
    [...collectConceptTopicSearchIds(tree, 'cardio')],
    ['nursing', 'fundamentals', 'cardiovascular']
  );
});

test('My Topics remains the default and personal CRUD stays on personal tables', () => {
  assert.match(componentSource, /useState<'mine' \| 'socrates' \| 'decks'>\('mine'\)/);
  assert.match(componentSource, /browseMode === 'mine'/);
  assert.match(componentSource, /\.from\('personal_topics'\)/);
  assert.match(componentSource, /\.from\('personal_concepts'\)/);
  assert.match(componentSource, /\.from\('personal_cards'\)/);
});

test('Socrates data loading is active-Library scoped and published-only', () => {
  assert.match(pageSource, /resolveActiveLibraryContext\(\)/);
  assert.match(pageSource, /\.from\('library_nodes'\)/);
  assert.match(pageSource, /\.eq\('library_id', activeLibrary\.id\)/);
  assert.match(pageSource, /\.from\('concept_placements'\)/);
  assert.match(pageSource, /library_nodes!inner\(library_id\)/);
  assert.match(pageSource, /\.eq\('library_nodes\.library_id', activeLibrary\.id\)/);
  assert.doesNotMatch(pageSource, /\.in\('library_node_id', nodeIds\)/);
  assert.match(pageSource, /\.eq\('concepts\.status', 'published'\)/);
});

test('Socrates browser keeps official content read-only and delegates personal actions', () => {
  assert.doesNotMatch(officialBrowserSource, /\.from\(/);
  assert.doesNotMatch(officialBrowserSource, /personal_concept_official_placements/);
  assert.doesNotMatch(officialBrowserSource, /Delete official|Edit official|Reorder/);
  assert.match(officialBrowserSource, /Read only/);
  assert.match(officialBrowserSource, /Add My Concept/);
  assert.match(officialBrowserSource, /Add My Card/);
  assert.match(componentSource, /aria-pressed=\{browseMode === 'socrates'\}/);
  assert.match(officialBrowserSource, /aria-label="Socrates Topic Tree"/);
});

test('official Concepts retain a single identity with every placement path', () => {
  assert.match(pageSource, /const conceptsById = new Map/);
  assert.match(pageSource, /existing\.placementNodeIds\.push/);
  assert.match(officialBrowserSource, /concept\.placementNodeIds\.map/);
  assert.match(officialBrowserSource, /selectedConceptPaths\.map/);
});
