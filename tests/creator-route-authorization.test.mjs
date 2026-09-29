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

test('authenticated learner is allowed on every shared Creator route', () => {
  for (const pathname of sharedRoutes) {
    assert.equal(canAccessCreatorRoute({
      pathname, role: 'learner', userId: learnerA, learnerAllowlist: allowlist,
    }), true);
  }
});

test('another authenticated learner is allowed on every shared Creator route', () => {
  for (const pathname of sharedRoutes) {
    assert.equal(canAccessCreatorRoute({
      pathname, role: 'learner', userId: learnerB, learnerAllowlist: allowlist,
    }), true);
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

test('missing and empty allowlists do not restrict authenticated learners or staff', () => {
  for (const learnerAllowlist of [undefined, '', '   ']) {
    assert.equal(canAccessSharedCreator({
      role: 'learner', userId: learnerA, learnerAllowlist,
    }), true);
    assert.equal(canAccessSharedCreator({
      role: 'editor', userId: learnerA, learnerAllowlist,
    }), true);
  }
});

test('obsolete malformed allowlist does not control learner admission', () => {
  const malformed = `${learnerA},not-a-uuid`;
  assert.equal(parseCreatorLearnerAllowlist(malformed).valid, false);
  assert.equal(canAccessSharedCreator({
    role: 'learner', userId: learnerA, learnerAllowlist: malformed,
  }), true);
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

test('browser-controlled values cannot grant staff route access', () => {
  for (const pathname of ['/creator/libraries?role=admin', '/creator/articles?creator_access=true']) {
    assert.equal(canAccessCreatorRoute({ pathname: new URL(pathname, 'https://socrates.local').pathname,
      role: 'learner', userId: learnerB, learnerAllowlist: allowlist }), false);
  }
});

test('authenticated learner access is independent of obsolete cohort configuration', () => {
  for (const learnerAllowlist of [allowlist, learnerB, '', undefined]) {
    assert.equal(canAccessSharedCreator({ role: 'learner', userId: learnerA, learnerAllowlist }), true);
  }
  for (const userId of ['', 'not-authenticated', 'not-a-uuid']) {
    assert.equal(canAccessSharedCreator({ role: 'learner', userId, learnerAllowlist: allowlist }), false);
  }
  assert.equal(canAccessSharedCreator({ role: 'unknown', userId: learnerA, learnerAllowlist: allowlist }), false);
});

test('Home advertises canonical Creator while route authorization remains server-controlled', () => {
  assert.deepEqual(resolveHomeCreatorEntry({
    role: 'learner', userId: learnerA, learnerAllowlist: allowlist,
  }), { label: 'Creator Studio', href: '/creator' });
  assert.deepEqual(resolveHomeCreatorEntry({
    role: 'learner', userId: learnerB, learnerAllowlist: allowlist,
  }), { label: 'Creator Studio', href: '/creator' });
  for (const role of ['editor', 'admin']) {
    assert.deepEqual(resolveHomeCreatorEntry({
      role, userId: learnerA, learnerAllowlist: allowlist,
    }), { label: 'Creator Studio', href: '/creator' });
  }

  const homeSource = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  const plannerSource = readFileSync(
    new URL('../components/StudyPlanner.tsx', import.meta.url), 'utf8'
  );
  assert.match(homeSource, /resolveHomeCreatorEntry/);
  assert.doesNotMatch(plannerSource, /SOCRATES_CREATOR_LEARNER_USER_IDS/);
  assert.match(plannerSource, /homeCreatorEntry = \{ label: 'Creator Studio', href: '\/creator' \}/);
  assert.doesNotMatch(plannerSource, /homeCreatorEntry = \{ label: 'Study Creator'/);
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
