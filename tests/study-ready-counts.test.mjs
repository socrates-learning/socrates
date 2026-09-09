import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(
  new URL('../lib/study-candidates.ts', import.meta.url),
  'utf8'
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const exports = {};
vm.runInNewContext(compiled, {
  exports,
  require(name) {
    if (name === '@supabase/supabase-js') return {};
    throw new Error(name);
  },
});
const { getOfficialStudyReadyQuestionCounts } = exports;
const plain = (value) => JSON.parse(JSON.stringify(value));

test('counts only official candidates returned by the canonical Study resolver', () => {
  const counts = getOfficialStudyReadyQuestionCounts([
    {
      candidate_type: 'official',
      official_concept_id: 'concept-a',
      official_question_id: 'question-a',
    },
    {
      candidate_type: 'official',
      official_concept_id: 'concept-a',
      official_question_id: 'question-b',
    },
    {
      candidate_type: 'personal',
      official_concept_id: null,
      official_question_id: null,
    },
  ]);

  assert.deepEqual(plain(counts), { 'concept-a': 2 });
});

test('deduplicates repeated candidate rows by stable Question ID', () => {
  const row = {
    candidate_type: 'official',
    official_concept_id: 'concept-a',
    official_question_id: 'question-a',
  };

  assert.deepEqual(plain(getOfficialStudyReadyQuestionCounts([row, row])), {
    'concept-a': 1,
  });
});

test('returns zero implied Study-ready inventory for excluded/non-deliverable rows', () => {
  assert.deepEqual(
    plain(getOfficialStudyReadyQuestionCounts([
      {
        candidate_type: 'personal',
        official_concept_id: null,
        official_question_id: null,
      },
    ])),
    {}
  );
});

test('preserves the known three-Concept sixty-Question batch shape', () => {
  const rows = Array.from({ length: 60 }, (_, index) => ({
    candidate_type: 'official',
    official_concept_id: `concept-${Math.floor(index / 20) + 1}`,
    official_question_id: `question-${index + 1}`,
  }));

  assert.deepEqual(plain(getOfficialStudyReadyQuestionCounts(rows)), {
    'concept-1': 20,
    'concept-2': 20,
    'concept-3': 20,
  });
});
