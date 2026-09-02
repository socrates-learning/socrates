import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  getBootstrapErrorMessage,
  getHomeBootstrapView,
  getSoleAccessibleLibrary,
  hasAuthoritativeInitialDeckData,
} from '../lib/home-bootstrap.ts';

const nursing = {
  id: 'library-nursing',
  name: 'Nursing',
  slug: 'nursing',
  description: null,
  status: 'active',
};

const initialDeckData = {
  libraryId: nursing.id,
  availableLibraries: [nursing],
  deck: {
    id: 'deck-1',
    user_id: 'user-1',
    library_id: nursing.id,
    name: 'My Study Deck',
    is_active: true,
    cram_mode: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  nodes: [],
  placements: [],
  questionCounts: {},
  selectedNodeIds: [],
  nodePreferences: {},
  conceptOverrides: {},
  resolvedConcepts: [],
  learnerProgress: {
    library_id: nursing.id,
    summary: {
      total_concepts: 0,
      assessed_concepts: 0,
      unseen_concepts: 0,
      assessed_mastery_percent: null,
      coverage_adjusted_progress_percent: 0,
      evidence_count: 0,
      questions_answered: 0,
      recent_session_count: 0,
    },
    nodes: [],
    recent_sessions: [],
  },
  learnerProgressError: '',
  loadError: '',
};

test('missing server data and missing active Library are not authoritative', () => {
  assert.equal(hasAuthoritativeInitialDeckData(undefined, null), false);
});

test('a single accessible Library can bootstrap without a chooser', () => {
  assert.equal(getSoleAccessibleLibrary([nursing]), nursing);
  assert.equal(getSoleAccessibleLibrary([]), null);
  assert.equal(getSoleAccessibleLibrary([nursing, { ...nursing, id: 'other' }]), null);
});

test('matching real server-initialized Library and deck skip client bootstrap', () => {
  assert.equal(
    hasAuthoritativeInitialDeckData(initialDeckData, nursing),
    true
  );
});

for (const role of ['admin', 'editor']) {
  test(`${role} without an active Library sees the explicit chooser`, () => {
    assert.equal(
      getHomeBootstrapView({
        activeLibraryId: null,
        availableLibraryCount: 1,
        bootstrapError: '',
        hasDeck: false,
        isLoading: false,
        role,
      }),
      'staff-library-chooser'
    );
  });
}

test('learner without a primary membership does not enter the staff chooser', () => {
  assert.equal(
    getHomeBootstrapView({
      activeLibraryId: null,
      availableLibraryCount: 0,
      bootstrapError: '',
      hasDeck: false,
      isLoading: false,
      role: 'learner',
    }),
    'no-active-library'
  );

  const homePageSource = readFileSync(
    new URL('../app/page.tsx', import.meta.url),
    'utf8'
  );
  assert.match(homePageSource, /activeLibraryContext\.needsSelection/);
  assert.match(homePageSource, /Library Selection Needed/);
});

test('a newly created active deck can finish bootstrap', () => {
  const studyPlannerSource = readFileSync(
    new URL('../components/StudyPlanner.tsx', import.meta.url),
    'utf8'
  );
  assert.match(studyPlannerSource, /get_or_create_active_study_deck/);

  assert.equal(
    getHomeBootstrapView({
      activeLibraryId: nursing.id,
      availableLibraryCount: 1,
      bootstrapError: '',
      hasDeck: true,
      isLoading: false,
      role: 'learner',
    }),
    'ready'
  );
});

test('an active deck with zero selected nodes still finishes bootstrap', () => {
  assert.equal(initialDeckData.selectedNodeIds.length, 0);
  assert.equal(
    getHomeBootstrapView({
      activeLibraryId: nursing.id,
      availableLibraryCount: 1,
      bootstrapError: '',
      hasDeck: Boolean(initialDeckData.deck),
      isLoading: false,
      role: 'learner',
    }),
    'ready'
  );
});

test('an unexpected bootstrap rejection becomes a visible error state', () => {
  const bootstrapError = getBootstrapErrorMessage(
    new Error('Network request rejected')
  );

  assert.match(bootstrapError, /Network request rejected/);
  assert.equal(
    getHomeBootstrapView({
      activeLibraryId: nursing.id,
      availableLibraryCount: 1,
      bootstrapError,
      hasDeck: false,
      isLoading: false,
      role: 'admin',
    }),
    'error'
  );
});

test('successful deck preference saves refresh the Home route cache', () => {
  const studyPlannerSource = readFileSync(
    new URL('../components/StudyPlanner.tsx', import.meta.url),
    'utf8'
  );

  for (const successMessage of [
    'Cram Mode preference saved.',
    'Deck updated.',
    'Personal study selection saved.',
  ]) {
    const successIndex = studyPlannerSource.indexOf(successMessage);
    assert.notEqual(successIndex, -1);
    assert.match(
      studyPlannerSource.slice(successIndex, successIndex + 220),
      /router\.refresh\(\)/
    );
  }
});

test('large Library placement loading stays bounded by Library identity', () => {
  const sources = [
    readFileSync(new URL('../components/StudyPlanner.tsx', import.meta.url), 'utf8'),
    readFileSync(
      new URL('../lib/study-planner-initial-data.ts', import.meta.url),
      'utf8'
    ),
  ];

  for (const source of sources) {
    assert.match(source, /library_nodes!inner \(library_id\)/);
    assert.match(
      source,
      /\.eq\('library_nodes\.library_id', activeLibrary\.id\)/
    );
    assert.doesNotMatch(source, /\.in\('library_node_id', nodeIds\)/);
  }
});

test('Phase 1 UX keeps direct Study, nearby Cram, and Exit-to-Home behavior', () => {
  const studyPlannerSource = readFileSync(
    new URL('../components/StudyPlanner.tsx', import.meta.url),
    'utf8'
  );

  assert.doesNotMatch(studyPlannerSource, /label: 'Deck Menu'/);
  assert.match(
    studyPlannerSource,
    /className="home-v2-study"[\s\S]*?onClick=\{openStudyMode\}/
  );
  assert.match(studyPlannerSource, /home-v2-study-options/);
  assert.match(
    studyPlannerSource,
    /checked=\{isSetupCramMode\}[\s\S]*?toggleSetupCramMode/
  );
  assert.match(
    studyPlannerSource,
    /Game Mode <small>Coming soon<\/small>/
  );
  assert.match(
    studyPlannerSource,
    /Community \/ Trial Content <small>Coming soon<\/small>/
  );
  assert.match(
    studyPlannerSource,
    /@media \(max-width: 1100px\)[\s\S]*?\.home-v2-hero \{[\s\S]*?grid-template-columns: 1fr;/
  );
  assert.match(
    studyPlannerSource,
    /leaveStudyMode\('dashboard'\)[\s\S]*?<span aria-hidden="true">←<\/span>[\s\S]*?Exit/
  );
});
