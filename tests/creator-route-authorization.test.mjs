import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  canAccessCreatorRoute,
  canAccessSharedCreator,
  classifyCreatorRoute,
  parseCreatorLearnerAllowlist,
  resolveHomeCreatorEntry,
} from '../lib/creator-route-access.ts';

const learnerA = '11111111-1111-4111-8111-111111111111';
const learnerB = '22222222-2222-4222-8222-222222222222';
const allowlist = learnerA;

const sharedRoutes = [
  '/creator',
  '/creator/concepts',
  '/creator/concepts/new',
  '/creator/concepts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
];
const staffRoutes = [
  '/creator/articles',
  '/creator/articles/new',
  '/creator/articles/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '/creator/libraries',
  '/creator/unknown-future-route',
];

test('route classifier opens only the explicit shared Creator contract', () => {
  for (const pathname of sharedRoutes) {
    assert.equal(classifyCreatorRoute(pathname), 'shared');
    assert.equal(classifyCreatorRoute(`${pathname}/`), 'shared');
  }
  for (const pathname of staffRoutes) {
    assert.equal(classifyCreatorRoute(pathname), 'staff');
  }
  assert.equal(classifyCreatorRoute('/study-creator'), 'outside');
});

test('cohort learner is allowed on every shared Creator route', () => {
  for (const pathname of sharedRoutes) {
    assert.equal(canAccessCreatorRoute({
      pathname, role: 'learner', userId: learnerA, learnerAllowlist: allowlist,
    }), true);
  }
});

test('non-cohort learner is denied on every shared Creator route', () => {
  for (const pathname of sharedRoutes) {
    assert.equal(canAccessCreatorRoute({
      pathname, role: 'learner', userId: learnerB, learnerAllowlist: allowlist,
    }), false);
  }
});

test('cohort learner is denied on Article, Organizer, and unknown Creator routes', () => {
  for (const pathname of staffRoutes) {
    assert.equal(canAccessCreatorRoute({
      pathname, role: 'learner', userId: learnerA, learnerAllowlist: allowlist,
    }), false);
  }
});

test('editor and admin retain access to every Creator route', () => {
  for (const role of ['editor', 'admin']) {
    for (const pathname of [...sharedRoutes, ...staffRoutes]) {
      assert.equal(canAccessCreatorRoute({
        pathname, role, userId: learnerB, learnerAllowlist: undefined,
      }), true);
    }
  }
});

test('missing and empty allowlists deny learners without affecting staff', () => {
  for (const learnerAllowlist of [undefined, '', '   ']) {
    assert.equal(canAccessSharedCreator({
      role: 'learner', userId: learnerA, learnerAllowlist,
    }), false);
    assert.equal(canAccessSharedCreator({
      role: 'editor', userId: learnerA, learnerAllowlist,
    }), true);
  }
});

test('one malformed allowlist entry fails the whole learner cohort closed', () => {
  const malformed = `${learnerA},not-a-uuid`;
  assert.equal(parseCreatorLearnerAllowlist(malformed).valid, false);
  assert.equal(canAccessSharedCreator({
    role: 'learner', userId: learnerA, learnerAllowlist: malformed,
  }), false);
});

test('allowlist parsing is case-insensitive, trimmed, and deduplicated', () => {
  const upper = learnerA.toUpperCase();
  const parsed = parseCreatorLearnerAllowlist(` ${upper}, ${learnerA} `);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.userIds.size, 1);
  assert.equal(canAccessSharedCreator({
    role: 'learner', userId: learnerA, learnerAllowlist: ` ${upper} `,
  }), true);
});

test('browser-controlled values cannot substitute for the server allowlist', () => {
  for (const pathname of [
    '/creator?creator_access=true',
    '/creator/concepts/new?role=editor',
  ]) {
    assert.equal(canAccessCreatorRoute({
      pathname: new URL(pathname, 'https://socrates.local').pathname,
      role: 'learner', userId: learnerB, learnerAllowlist: allowlist,
    }), false);
  }
});

test('removing a learner from configuration immediately restores denial', () => {
  assert.equal(canAccessSharedCreator({
    role: 'learner', userId: learnerA, learnerAllowlist: allowlist,
  }), true);
  assert.equal(canAccessSharedCreator({
    role: 'learner', userId: learnerA, learnerAllowlist: learnerB,
  }), false);
});

test('Home reuses server Creator authorization without duplicating the cohort in client code', () => {
  assert.deepEqual(resolveHomeCreatorEntry({
    role: 'learner', userId: learnerA, learnerAllowlist: allowlist,
  }), { label: 'Creator Studio', href: '/creator' });
  assert.deepEqual(resolveHomeCreatorEntry({
    role: 'learner', userId: learnerB, learnerAllowlist: allowlist,
  }), { label: 'Study Creator', href: '/study-creator' });
  for (const role of ['editor', 'admin']) {
    assert.deepEqual(resolveHomeCreatorEntry({
      role, userId: learnerA, learnerAllowlist: allowlist,
    }), { label: 'Study Creator', href: '/study-creator' });
  }

  const homeSource = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  const plannerSource = readFileSync(
    new URL('../components/StudyPlanner.tsx', import.meta.url), 'utf8'
  );
  assert.match(homeSource, /resolveHomeCreatorEntry/);
  assert.doesNotMatch(plannerSource, /SOCRATES_CREATOR_LEARNER_USER_IDS/);
});

test('canonical /creator entry renders the existing new-Concept page without a redirect bootstrap', () => {
  const source = readFileSync(
    new URL('../app/creator/page.tsx', import.meta.url),
    'utf8'
  );
  assert.match(source, /NewConceptPage/);
  assert.doesNotMatch(source, /redirect\(/);
});

test('proxy and parent layout use the same central authorization helper', () => {
  const proxySource = readFileSync(new URL('../proxy.ts', import.meta.url), 'utf8');
  const layoutSource = readFileSync(
    new URL('../app/creator/layout.tsx', import.meta.url), 'utf8'
  );
  assert.match(proxySource, /canAccessCreatorRoute/);
  assert.match(proxySource, /CREATOR_LEARNER_ALLOWLIST_ENV/);
  assert.match(layoutSource, /canActorAccessSharedCreator/);
  assert.doesNotMatch(layoutSource, /\.from\('user_roles'\)/);
});

test('trusted identity headers are deleted before proxy authorization is derived', () => {
  const source = readFileSync(new URL('../proxy.ts', import.meta.url), 'utf8');
  const deletion = source.indexOf('requestHeaders.delete(REQUEST_USER_ID_HEADER)');
  const authorization = source.indexOf('canAccessCreatorRoute({');
  assert.ok(deletion >= 0 && authorization > deletion);
});

test('Article and Library pages execute a staff guard before route data loading', () => {
  const pages = [
    '../app/creator/articles/page.tsx',
    '../app/creator/articles/new/page.tsx',
    '../app/creator/articles/[id]/page.tsx',
    '../app/creator/libraries/page.tsx',
  ];
  for (const page of pages) {
    const source = readFileSync(new URL(page, import.meta.url), 'utf8');
    const guard = source.indexOf('await requireStaffCreatorRoute()');
    assert.ok(guard >= 0, `${page} must invoke the staff guard`);
    const firstSensitiveRead = Math.min(
      ...['resolveActiveLibraryContext()', "from('articles')", '<LibraryOrganizerClient']
        .map((needle) => source.indexOf(needle))
        .filter((index) => index >= 0)
    );
    assert.ok(guard < firstSensitiveRead, `${page} must guard before loading data`);
  }
});

test('concept bootstrap contains no Article or Library Organizer data paths', () => {
  const source = [
    '../app/creator/concepts/new/page.tsx',
    '../app/creator/concepts/[id]/page.tsx',
  ].map((page) => readFileSync(new URL(page, import.meta.url), 'utf8')).join('\n');

  assert.doesNotMatch(source, /article(?:s|_versions|_category_placements)/i);
  assert.doesNotMatch(source, /LibraryOrganizerClient|library_groups|library_group_libraries/);
  assert.doesNotMatch(source, /service[_-]?role/i);
});
