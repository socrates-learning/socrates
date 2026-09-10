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
const stylesSource = await readFile(
  new URL('../components/StudyCreatorClient.module.css', import.meta.url),
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

test('Browse is the default and personal CRUD stays on personal tables', () => {
  assert.match(componentSource, />\('socrates'\);/);
  assert.match(componentSource, />\s*Browse\s*<\/button>/);
  assert.match(componentSource, />\s*Flagged\s*<\/button>/);
  assert.doesNotMatch(componentSource, />\s*My Topics\s*<\/button>/);
  assert.doesNotMatch(componentSource, />\s*Socrates\s*<\/button>/);
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
  assert.match(pageSource, /\.from\('questions'\)/);
  assert.match(pageSource, /\.eq\('status', 'published'\)/);
});

test('unified browser keeps official content read-only and composes the personal layer', () => {
  assert.doesNotMatch(officialBrowserSource, /\.from\(/);
  assert.doesNotMatch(officialBrowserSource, /personal_concept_official_placements/);
  assert.doesNotMatch(officialBrowserSource, /Delete official|Edit official|Reorder/);
  assert.match(officialBrowserSource, /Socrates \(Official\)/);
  assert.match(officialBrowserSource, /Mine \(Personal\)/);
  assert.match(officialBrowserSource, /My Custom Topics/);
  assert.match(officialBrowserSource, /Your Content for This Concept/);
  assert.match(officialBrowserSource, /Add My Concept/);
  assert.match(officialBrowserSource, /Add My Card/);
  assert.match(componentSource, /aria-selected=\{browseMode === 'socrates'\}/);
  assert.match(componentSource, /role="tablist"/);
  assert.match(officialBrowserSource, /1\. Topic Tree/);
  assert.match(officialBrowserSource, /2\. Concepts &amp; Cards/);
  assert.match(officialBrowserSource, /3\. Details/);
  assert.match(officialBrowserSource, /aria-label="Official and personal Topic Tree"/);
});

test('a non-empty Browse search spans loaded official and personal material', () => {
  assert.match(officialBrowserSource, /if \(normalizedSearch\)/);
  assert.match(officialBrowserSource, /officialConcepts\.forEach/);
  assert.match(officialBrowserSource, /material\.concepts\.forEach/);
  assert.match(officialBrowserSource, /Search Results/);
  assert.match(
    officialBrowserSource,
    /No Socrates or personal material matches this search\./
  );
});

test('official Concepts retain a single identity with every placement path', () => {
  assert.match(pageSource, /const conceptsById = new Map/);
  assert.match(pageSource, /existing\.placementNodeIds\.push/);
  assert.match(officialBrowserSource, /concept\.placementNodeIds\.map/);
  assert.match(officialBrowserSource, /officialPath\(officialTree, topicId\)/);
});

test('Browse keeps contextual creation above bounded sibling pane content', () => {
  const creationAction = officialBrowserSource.indexOf('＋ Add My Concept Here');
  const contentList = officialBrowserSource.indexOf(
    '<div className={styles.contentListHeader}>'
  );

  assert.ok(creationAction >= 0);
  assert.ok(contentList >= 0);
  assert.ok(creationAction < contentList);
  assert.match(officialBrowserSource, /styles\.browseColumns/);
  assert.match(stylesSource, /\.browseColumns\s*{[^}]*height:/s);
  assert.match(
    stylesSource,
    /\.browseColumns\s*>\s*\.column\s*{[^}]*min-height:\s*0;/s
  );
  assert.match(
    stylesSource,
    /\.unifiedTree\s*{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s
  );
  assert.match(
    stylesSource,
    /\.unifiedContentList\s*{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s
  );
  assert.match(
    stylesSource,
    /\.inspectorBody\s*{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s
  );
});
