import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(
  new URL('../lib/study-creator-context.ts', import.meta.url),
  'utf8'
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const exports = {};
vm.runInNewContext(compiled, { exports });
const { resolveStudyCreatorSelection } = exports;
const plain = (value) => JSON.parse(JSON.stringify(value));

const topics = [
  { id: 'root-a', parent_id: null },
  { id: 'child-a', parent_id: 'root-a' },
  { id: 'root-b', parent_id: null },
];
const concepts = [
  { id: 'concept-a', topic_id: 'child-a' },
  { id: 'concept-b', topic_id: 'root-b' },
];

test('restores a validated Topic and Concept owned by the loaded account', () => {
  assert.deepEqual(
    plain(resolveStudyCreatorSelection({
      concepts,
      requestedConceptId: 'concept-a',
      requestedTopicId: 'child-a',
      topics,
    })),
    { topicId: 'child-a', conceptId: 'concept-a' }
  );
});

test('derives the Topic from a valid Concept when Topic state is absent', () => {
  assert.deepEqual(
    plain(resolveStudyCreatorSelection({
      concepts,
      requestedConceptId: 'concept-b',
      requestedTopicId: null,
      topics,
    })),
    { topicId: 'root-b', conceptId: 'concept-b' }
  );
});

test('ignores stale or cross-owner IDs that are absent from owner-filtered rows', () => {
  assert.deepEqual(
    plain(resolveStudyCreatorSelection({
      concepts,
      requestedConceptId: 'another-user-concept',
      requestedTopicId: 'another-user-topic',
      topics,
    })),
    { topicId: 'root-a', conceptId: null }
  );
});

test('falls back within the retained Topic after a selected Concept is deleted', () => {
  assert.deepEqual(
    plain(resolveStudyCreatorSelection({
      concepts,
      requestedConceptId: 'deleted-concept',
      requestedTopicId: 'root-b',
      topics,
    })),
    { topicId: 'root-b', conceptId: 'concept-b' }
  );
});

test('does not restore a valid Concept into a mismatched requested Topic', () => {
  assert.deepEqual(
    plain(resolveStudyCreatorSelection({
      concepts,
      requestedConceptId: 'concept-b',
      requestedTopicId: 'child-a',
      topics,
    })),
    { topicId: 'child-a', conceptId: 'concept-a' }
  );
});
