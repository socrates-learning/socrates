import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

import {
  calculateHistoricalAccuracyPercent,
  presentCanonicalConceptMastery,
} from '../lib/concept-page-mastery.ts';

const conceptId = '11111111-1111-4111-8111-111111111111';
const concept = {
  id: conceptId,
  name: 'Fixture Concept',
  concept_type: 'core',
  importance: 'high',
  difficulty: 'medium',
  estimated_time: '5 minutes',
  summary: 'Summary',
  why_it_matters: 'Why',
  body_markdown: null,
  status: 'published',
};

function database({ mastery = null, masteryError = null } = {}) {
  const rows = {
    concepts: concept,
    learn_sections: [
      {
        id: 'section-a',
        title: 'Overview',
        body: 'Body',
        sort_order: 0,
      },
    ],
    content_source_notes: [],
    concept_relationships: [],
    review_attempts: [
      {
        score: 1,
        learn_section_id: 'section-a',
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ],
  };

  return {
    from(table) {
      const query = {
        select() { return query; },
        eq() { return query; },
        is() { return query; },
        not() { return query; },
        or() { return query; },
        order() { return query; },
        async single() {
          return { data: rows[table] ?? null, error: null };
        },
        async maybeSingle() {
          assert.equal(table, 'user_concept_mastery');
          return { data: mastery, error: masteryError };
        },
        then(resolve, reject) {
          return Promise.resolve({ data: rows[table] ?? [], error: null }).then(
            resolve,
            reject
          );
        },
      };

      return query;
    },
  };
}

function findElement(node, type) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === type) return node;

  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findElement(child, type);
    if (found) return found;
  }

  return null;
}

function visibleText(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(visibleText).join(' ');
  if (typeof node === 'object') return visibleText(node.props?.children);
  return '';
}

async function renderConceptPage({ authContext, mastery, masteryError } = {}) {
  const source = readFileSync(
    new URL('../app/concepts/[id]/page.tsx', import.meta.url),
    'utf8'
  );
  const exports = {};
  const types = {
    ConceptTabs: Symbol('ConceptTabs'),
    Header: Symbol('Header'),
    HeaderSessionProvider: Symbol('HeaderSessionProvider'),
    Sidebar: Symbol('Sidebar'),
    Link: Symbol('Link'),
  };
  const modules = {
    '@/components/ConceptTabs': { ConceptTabs: types.ConceptTabs },
    '@/components/Header': {
      Header: types.Header,
      HeaderSessionProvider: types.HeaderSessionProvider,
    },
    '@/components/Sidebar': { Sidebar: types.Sidebar },
    '@/lib/concept-page-mastery': {
      calculateHistoricalAccuracyPercent,
      presentCanonicalConceptMastery,
    },
    '@/lib/library-context': {
      resolveActiveLibraryContext: async () => ({
        library: { id: 'library-a', name: 'Nursing', slug: 'nursing' },
      }),
    },
    '@/lib/server-auth-context': {
      getVerifiedRequestAuthContext: async () => {
        if (authContext instanceof Error) throw authContext;
        return authContext ?? null;
      },
    },
    '@/lib/supabase-server': {
      createSupabaseServerClient: async () =>
        database({ mastery, masteryError }),
    },
    'next/link': { default: types.Link },
    'react/jsx-runtime': {
      Fragment: Symbol('Fragment'),
      jsx: (type, props) => ({ type, props }),
      jsxs: (type, props) => ({ type, props }),
    },
  };

  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
      },
    }).outputText,
    { exports, process, require: (name) => modules[name] }
  );

  const tree = await exports.default({
    params: Promise.resolve({ id: conceptId }),
  });

  return { tree, types };
}

test('unseen Concept is distinct from zero-percent mastery', () => {
  assert.deepEqual(presentCanonicalConceptMastery(null), {
    percent: null,
    label: 'Unseen',
    lastExposureAt: null,
  });
});

test('canonical mastery uses the persisted zero-to-one estimate', () => {
  assert.deepEqual(
    presentCanonicalConceptMastery({
      mastery_estimate: '0.824',
      evidence_count: 7,
      last_exposure_at: '2026-09-25T10:00:00.000Z',
    }),
    {
      percent: 82,
      label: '82%',
      lastExposureAt: '2026-09-25T10:00:00.000Z',
    }
  );
});

test('historical score accuracy remains a separately named metric', () => {
  assert.equal(calculateHistoricalAccuracyPercent([1, 1]), 25);
  assert.equal(calculateHistoricalAccuracyPercent([]), null);
});

test('Concept page displays canonical mastery when legacy accuracy disagrees', async () => {
  const { tree, types } = await renderConceptPage({
    authContext: {
      userId: 'learner-a',
      email: 'learner@example.test',
      displayName: 'Learner',
      role: 'learner',
    },
    mastery: {
      mastery_estimate: 0.82,
      evidence_count: 7,
      last_exposure_at: '2026-09-25T10:00:00.000Z',
    },
  });
  const tabs = findElement(tree, types.ConceptTabs);

  assert.match(visibleText(tree), /Overall Mastery\s+82%/);
  assert.equal(tabs.props.sections[0].historicalAccuracy, 25);
  assert.equal(tabs.props.canCreate, false);
});

test('authenticated learner and admin sessions are propagated before hydration', async () => {
  for (const role of ['learner', 'admin']) {
    const { tree, types } = await renderConceptPage({
      authContext: {
        userId: `${role}-a`,
        email: role === 'learner' ? 'learner@example.test' : null,
        displayName: role,
        role,
      },
    });
    const provider = findElement(tree, types.HeaderSessionProvider);
    const tabs = findElement(tree, types.ConceptTabs);

    assert.equal(
      provider.props.email,
      role === 'learner' ? 'learner@example.test' : 'Account'
    );
    assert.equal(provider.props.role, role);
    assert.equal(tabs.props.canCreate, role === 'admin');
  }
});

test('signed-out fallback remains Login-compatible without staff controls', async () => {
  const { tree, types } = await renderConceptPage({ authContext: null });
  const provider = findElement(tree, types.HeaderSessionProvider);
  const tabs = findElement(tree, types.ConceptTabs);

  assert.equal(provider.props.email, null);
  assert.equal(provider.props.role, null);
  assert.equal(tabs.props.canCreate, false);
});

test('distinguishable auth and mastery query failures do not render signed-out or unseen', async () => {
  await assert.rejects(
    renderConceptPage({ authContext: new Error('Trusted auth unavailable') }),
    /Trusted auth unavailable/
  );
  await assert.rejects(
    renderConceptPage({
      authContext: {
        userId: 'learner-a',
        email: 'learner@example.test',
        displayName: 'Learner',
        role: 'learner',
      },
      masteryError: { code: '42501', message: 'permission denied' },
    }),
    /Unable to load Concept mastery/
  );
});

test('Header hydration and Concept tabs do not repeat authenticated role discovery', () => {
  const header = readFileSync(
    new URL('../components/Header.tsx', import.meta.url),
    'utf8'
  );
  const tabs = readFileSync(
    new URL('../components/ConceptTabs.tsx', import.meta.url),
    'utf8'
  );
  const page = readFileSync(
    new URL('../app/concepts/[id]/page.tsx', import.meta.url),
    'utf8'
  );

  assert.match(header, /if \(serverSession\) return/);
  assert.match(page, /<HeaderSessionProvider/);
  assert.match(page, /getVerifiedRequestAuthContext/);
  assert.doesNotMatch(tabs, /supabase\.auth\.getUser|from\('user_roles'\)/);
});

test('Algorithm v2 and Progress continue to read the same canonical state', () => {
  const selector = readFileSync(
    new URL('../supabase/093_study_startup_selector_hardening.sql', import.meta.url),
    'utf8'
  );
  const progress = readFileSync(
    new URL('../supabase/057_learner_progress_read_model.sql', import.meta.url),
    'utf8'
  );
  const persistence = readFileSync(
    new URL('../supabase/089_reset_study_progress.sql', import.meta.url),
    'utf8'
  );

  assert.match(selector, /left join public\.user_concept_mastery mastery/);
  assert.match(selector, /mastery\.mastery_estimate/);
  assert.match(progress, /avg\(mastery\.mastery_estimate\) \* 100/);
  assert.match(persistence, /perform public\.apply_user_concept_evidence/);
  assert.match(persistence, /score,\s*study_session_id[\s\S]*null,/);
});

test('Testing Angle state and Notes remain separate from Concept mastery presentation', () => {
  const page = readFileSync(
    new URL('../app/concepts/[id]/page.tsx', import.meta.url),
    'utf8'
  );
  const tabs = readFileSync(
    new URL('../components/ConceptTabs.tsx', import.meta.url),
    'utf8'
  );

  assert.doesNotMatch(page, /user_concept_testing_angle_state/);
  assert.match(tabs, /<ConceptNotes conceptId=\{conceptId\}/);
  assert.match(tabs, /Historical Section Accuracy/);
  assert.doesNotMatch(tabs, /<h3>Sub-Mastery<\/h3>/);
});
