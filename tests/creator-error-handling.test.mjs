import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

import { buildConceptTopicTree } from '../lib/concept-topic-tree.ts';
import {
  CreatorDataAccessError,
  readCreatorQueryData,
} from '../lib/creator-data-access.ts';
import { loadCreatorPersonalContent } from '../lib/creator-personal-content.ts';

class NotFoundSignal extends Error {
  constructor() {
    super('NEXT_NOT_FOUND');
    this.digest = 'NEXT_HTTP_ERROR_FALLBACK;404';
  }
}

class RedirectSignal extends Error {
  constructor(destination) {
    super(`REDIRECT:${destination}`);
    this.destination = destination;
  }
}

const successfulLibrary = {
  id: 'library-a',
  library_nodes: [{
    id: 'topic-a', name: 'Nursing', parent_id: null, sort_order: 0,
  }],
};
const successfulConcept = {
  id: 'concept-a',
  name: 'Concept A',
  body_markdown: 'Body',
};

function queryDatabase(results = {}) {
  return {
    from(table) {
      const query = {
        select() { return query; },
        eq() { return query; },
        in() { return query; },
        is() { return query; },
        order() { return query; },
        maybeSingle() { return query; },
        then(resolve, reject) {
          const fallback = table === 'libraries'
            ? { data: successfulLibrary, error: null }
            : table === 'concepts'
              ? { data: successfulConcept, error: null }
              : { data: [], error: null };
          return Promise.resolve(results[table] ?? fallback).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

async function runCreatorPage({
  route = 'new',
  role = 'learner',
  results = {},
  personalLoader,
  context = { library: { id: 'library-a' } },
} = {}) {
  const exports = {};
  const contextCalls = [];
  const ownerId = `${role}-owner`;
  const modules = {
    'next/navigation': {
      notFound() { throw new NotFoundSignal(); },
      redirect(destination) { throw new RedirectSignal(destination); },
    },
    '@/components/CreatorStudioV2Client': { CreatorStudioV2Client: 'editor' },
    '@/lib/concept-topic-tree': { buildConceptTopicTree },
    '@/lib/creator-data-access': { readCreatorQueryData },
    '@/lib/library-context': {
      async resolveActiveLibraryContext(options) {
        contextCalls.push(options);
        return context;
      },
    },
    '@/lib/server-creator-capabilities': {
      async getServerCreatorCapabilityManifest({ activeLibraryContext }) {
        return {
          subject: { userId: ownerId, role },
          library: { activeLibraryId: activeLibraryContext.library.id },
        };
      },
    },
    '@/lib/creator-personal-content': {
      loadCreatorPersonalContent: personalLoader ?? (async () => ({
        ownerId, topics: [], concepts: [], cards: [], overlays: [],
        topicPlacements: [],
      })),
    },
    '@/lib/supabase-server': {
      createSupabaseServerClient: async () => queryDatabase(results),
    },
    'react/jsx-runtime': { jsx: (_type, props) => props },
  };
  const source = readFileSync(
    new URL(`../app/creator/concepts/${route}/page.tsx`, import.meta.url),
    'utf8'
  );
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    { exports, require: (name) => modules[name] }
  );

  const result = await exports.default(
    route === '[id]' ? { params: Promise.resolve({ id: 'concept-a' }) } : undefined
  );
  return { result, contextCalls };
}

test('a genuinely absent active Library remains legitimate not-found behavior', async () => {
  await assert.rejects(
    runCreatorPage({ results: { libraries: { data: null, error: null } } }),
    (error) => error instanceof NotFoundSignal
  );
});

test('a genuinely absent Concept remains legitimate not-found behavior', async () => {
  await assert.rejects(
    runCreatorPage({
      route: '[id]',
      results: { concepts: { data: null, error: null } },
    }),
    (error) => error instanceof NotFoundSignal
  );
});

test('a 42501 Topic Tree failure propagates as a database failure, not a 404', async () => {
  const databaseError = {
    code: '42501',
    message: 'permission denied for relation library_nodes',
  };
  await assert.rejects(
    runCreatorPage({
      results: { libraries: { data: null, error: databaseError } },
    }),
    (error) => {
      assert.ok(error instanceof CreatorDataAccessError);
      assert.equal(error.databaseCode, '42501');
      assert.equal(error.cause, databaseError);
      assert.doesNotMatch(error.message, /permission denied|library_nodes/);
      assert.notEqual(error.digest, 'NEXT_HTTP_ERROR_FALLBACK;404');
      return true;
    }
  );
});

test('a generic Concept query failure propagates as an application error, not a 404', async () => {
  const databaseError = { code: 'XX000', message: 'temporary backend failure' };
  await assert.rejects(
    runCreatorPage({
      route: '[id]',
      results: { concepts: { data: null, error: databaseError } },
    }),
    (error) => {
      assert.ok(error instanceof CreatorDataAccessError);
      assert.equal(error.operation, 'the requested Concept');
      assert.equal(error.databaseCode, 'XX000');
      assert.notEqual(error.digest, 'NEXT_HTTP_ERROR_FALLBACK;404');
      return true;
    }
  );
});

test('personal-content query failure cannot masquerade as no personal content', async () => {
  const rows = {
    personal_topics: { data: [], error: null },
    personal_concepts: {
      data: null,
      error: { code: '42501', message: 'permission denied' },
    },
    personal_cards: { data: [], error: null },
    personal_concept_official_placements: { data: [], error: null },
    personal_topic_official_placements: { data: [], error: null },
  };
  const database = {
    from(table) {
      const query = {
        select() { return query; },
        eq() { return query; },
        order() { return query; },
        then(resolve, reject) {
          return Promise.resolve(rows[table]).then(resolve, reject);
        },
      };
      return query;
    },
  };

  await assert.rejects(
    loadCreatorPersonalContent(database, 'learner-owner'),
    (error) => {
      assert.match(error.message, /Unable to load personal Creator material/);
      return true;
    }
  );
});

test('successful learner and admin Creator bootstraps preserve the approved UI contract', async () => {
  for (const role of ['learner', 'admin']) {
    const { result, contextCalls } = await runCreatorPage({ role });
    assert.equal(result.activeLibraryId, 'library-a');
    assert.equal(result.creatorCapabilities.subject.role, role);
    assert.equal(result.initialTopics[0].id, 'topic-a');
    assert.equal(contextCalls.length, 1);
    assert.equal(contextCalls[0].failOnQueryError, true);
  }
});

test('Creator route source preserves signed-out and unauthorized handling', () => {
  const layoutSource = readFileSync(
    new URL('../app/creator/layout.tsx', import.meta.url),
    'utf8'
  );
  assert.match(layoutSource, /if \(!actor\) redirect\('\/login'\)/);
  assert.match(layoutSource, /if \(!canActorAccessSharedCreator\(actor\)\)/);
  assert.match(layoutSource, /<h2>Access Denied<\/h2>/);
});

test('Creator route authorization and Library resolution fail on query errors', () => {
  const proxySource = readFileSync(new URL('../proxy.ts', import.meta.url), 'utf8');
  const libraryContextSource = readFileSync(
    new URL('../lib/library-context.ts', import.meta.url),
    'utf8'
  );
  const routeAccessSource = readFileSync(
    new URL('../lib/server-creator-route-access.ts', import.meta.url),
    'utf8'
  );

  const creatorRoleFailure = proxySource.indexOf(
    "'the Creator route authorization role'"
  );
  const roleClassification = proxySource.indexOf('const role = roleData?.role');
  assert.ok(creatorRoleFailure >= 0 && roleClassification > creatorRoleFailure);
  assert.match(libraryContextSource, /roleResult\.error/);
  assert.match(libraryContextSource, /membershipResult\.error/);
  assert.match(libraryContextSource, /candidateLibraryResult\.error/);
  assert.match(libraryContextSource, /activeLibraryResult\.error/);
  assert.match(routeAccessSource, /authResult\.error/);
  assert.match(routeAccessSource, /roleResult\.error/);
});

test('Creator bootstrap checks errors before deciding that data is missing', () => {
  const sources = [
    '../app/creator/concepts/new/page.tsx',
    '../app/creator/concepts/[id]/page.tsx',
  ].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'));

  for (const source of sources) {
    const readResult = source.indexOf('readCreatorQueryData(');
    const missing = source.indexOf('notFound()');
    assert.ok(readResult >= 0 && missing > readResult);
    assert.match(source, /failOnQueryError: true/);
  }
});
