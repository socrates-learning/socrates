import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const chrome = await readFile(
  new URL('../components/creator/CreatorStudioChrome.tsx', import.meta.url),
  'utf8'
);
const creator = await readFile(
  new URL('../components/CreatorStudioV2Client.tsx', import.meta.url),
  'utf8'
);
const studyCreator = await readFile(
  new URL('../components/StudyCreatorClient.tsx', import.meta.url),
  'utf8'
);
const flagged = await readFile(
  new URL('../components/StudyCreatorFlaggedBrowser.tsx', import.meta.url),
  'utf8'
);

test('canonical Creator Studio exposes exactly Content, Questions, Tags, and Flagged', () => {
  const tabLabels = [...chrome.matchAll(/\{ id: '[^']+', label: '([^']+)' \}/g)]
    .map((match) => match[1]);

  assert.deepEqual(tabLabels, ['Content', 'Questions', 'Tags', 'Flagged']);
  assert.match(chrome, /'content' \| 'questions' \| 'tags' \| 'flagged'/);
});

test('Creator Studio reuses Flagged with the current owner-scoped personal state', () => {
  assert.match(
    chrome,
    /import \{ StudyCreatorFlaggedBrowser \} from '@\/components\/StudyCreatorFlaggedBrowser'/
  );
  assert.match(chrome, /<StudyCreatorFlaggedBrowser material=\{material\} ownerId=\{ownerId\} \/>/);
  assert.match(creator, /activeCreatorTab === 'flagged'/);
  assert.match(creator, /<CreatorStudioFlaggedTab/);
  assert.match(creator, /topics: personalTopics/);
  assert.match(creator, /concepts: personalConcepts/);
  assert.match(creator, /cards: personalCards/);
  assert.match(creator, /overlays: personalOverlays/);
  assert.match(creator, /ownerId=\{initialPersonalContent\.ownerId\}/);
  assert.doesNotMatch(creator, /PersonalDecksBrowser/);
});

test('relocation keeps the existing Flagged data and owner boundaries without Study writes', () => {
  assert.match(flagged, /CreatorPersonalContent/);
  assert.match(flagged, /\.from\('study_candidate_flags'\)/);
  assert.match(flagged, /\.eq\('user_id', ownerId\)/);
  assert.match(flagged, /\.from\('questions'\)/);
  assert.match(flagged, /material\.cards\.find/);
  assert.match(flagged, /material\.concepts\.find/);
  assert.match(flagged, /flag\.note/);
  assert.match(flagged, /'Unflag'/);
  assert.doesNotMatch(
    flagged,
    /review_attempts|personal_review_attempts|study_sessions|user_concept_mastery|user_personal_concept_state/
  );
});

test('Study Creator continues rendering its existing Flagged browser during transition', () => {
  assert.match(studyCreator, /<StudyCreatorFlaggedBrowser/);
  assert.match(studyCreator, /browseMode === 'flagged'/);
  assert.match(studyCreator, /<PersonalDecksBrowser/);
});
