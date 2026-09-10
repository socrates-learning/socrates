import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const planner = readFileSync(
  new URL('../components/StudyPlanner.tsx', import.meta.url),
  'utf8'
);
const loaderSource = readFileSync(
  new URL('../lib/study-concept-review.ts', import.meta.url),
  'utf8'
);
const compiledLoader = ts.transpileModule(loaderSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const loaderModule = { exports: {} };
const loaderContext = {
  exports: loaderModule.exports,
  module: loaderModule,
};
vm.createContext(loaderContext);
vm.runInContext(compiledLoader, loaderContext);
const {
  adaptStudyConceptReview,
  normalizeStudyConceptReviewMarkdown,
} = loaderModule.exports;

test('preserves canonical multiline Markdown byte-for-byte', () => {
  const markdown = [
    '## Core content',
    '',
    'First paragraph with an intentional literal `\\n` example.',
    '',
    '### Clinical review',
    '',
    '- First finding',
    '- Second finding',
  ].join('\n');

  assert.equal(normalizeStudyConceptReviewMarkdown(markdown), markdown);
});

test('normalizes a clearly serialized escaped-newline Markdown document', () => {
  const escapedMarkdown =
    '## Core content\\n\\nFirst paragraph.\\n\\n### Clinical review\\n\\n- First finding\\n- Second finding';

  assert.equal(
    normalizeStudyConceptReviewMarkdown(escapedMarkdown),
    '## Core content\n\nFirst paragraph.\n\n### Clinical review\n\n- First finding\n- Second finding'
  );
});

test('does not blindly decode isolated or mixed literal escape text', () => {
  assert.equal(
    normalizeStudyConceptReviewMarkdown('Use `\\n\\n` to describe a blank line.'),
    'Use `\\n\\n` to describe a blank line.'
  );
  assert.equal(
    normalizeStudyConceptReviewMarkdown(
      'Literal examples: `\\n\\n`, then `\\n\\n`, then `\\n\\n`.'
    ),
    'Literal examples: `\\n\\n`, then `\\n\\n`, then `\\n\\n`.'
  );
  assert.equal(
    normalizeStudyConceptReviewMarkdown('Paragraph one.\n\nKeep the literal \\n example.'),
    'Paragraph one.\n\nKeep the literal \\n example.'
  );
});

test('adapts only published Concept content and direct Concept sources', () => {
  const review = adaptStudyConceptReview({
    concept_id: 'concept',
    concepts: {
      id: 'concept',
      name: 'Cardiac output',
      summary: 'Blood pumped each minute.',
      why_it_matters: 'It reflects perfusion.',
      body_markdown: '## Core content\n\nA longer explanation.',
      status: 'published',
      content_source_notes: [
        {
          id: 'direct-note',
          note: 'Direct attribution',
          learn_section_id: null,
          sources: {
            id: 'source',
            title: 'Clinical reference',
            author: 'Example Author',
            source_type: 'book',
            url: 'https://example.test/reference',
          },
        },
        {
          id: 'section-note',
          note: 'Section-only attribution',
          learn_section_id: 'section',
          sources: {
            id: 'other-source',
            title: 'Other reference',
            author: null,
            source_type: null,
            url: null,
          },
        },
      ],
    },
  });

  assert.equal(review.conceptId, 'concept');
  assert.equal(review.name, 'Cardiac output');
  assert.equal(review.bodyMarkdown, '## Core content\n\nA longer explanation.');
  assert.deepEqual(
    JSON.parse(JSON.stringify(review.sources)),
    [
      {
        id: 'direct-note',
        title: 'Clinical reference',
        author: 'Example Author',
        sourceType: 'book',
        note: 'Direct attribution',
        url: 'https://example.test/reference',
      },
    ]
  );
});

test('does not adapt draft Concept content', () => {
  assert.equal(
    adaptStudyConceptReview({
      concept_id: 'concept',
      concepts: {
        id: 'concept',
        name: 'Draft',
        summary: null,
        why_it_matters: null,
        body_markdown: null,
        status: 'draft',
        content_source_notes: [],
      },
    }),
    null
  );
});

test('loads review content in one lazy active-Library-scoped read', () => {
  assert.match(loaderSource, /\.from\('concept_placements'\)/);
  assert.match(loaderSource, /library_nodes!inner\(library_id\)/);
  assert.match(loaderSource, /concepts!inner\([\s\S]*content_source_notes\(/);
  assert.match(loaderSource, /\.eq\('concept_id', conceptId\)/);
  assert.match(loaderSource, /\.eq\('library_nodes\.library_id', libraryId\)/);
  assert.match(loaderSource, /\.eq\('concepts\.status', 'published'\)/);
  assert.match(loaderSource, /\.limit\(1\)[\s\S]*\.maybeSingle\(\)/);
  assert.doesNotMatch(loaderSource, /\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/);
});

test('revealed answer keeps one smaller Question context above Answer', () => {
  const answerBody = planner.slice(
    planner.indexOf('<div className="study-v2-answer-body">'),
    planner.indexOf("{studyFeedback === null ?")
  );
  assert.match(answerBody, /study-v2-revealed-question/);
  assert.match(answerBody, /<p>Question<\/p>/);
  assert.match(answerBody, /\{studyCandidate\?\.prompt\}/);
  assert.ok(
    answerBody.indexOf('study-v2-revealed-question') <
      answerBody.indexOf('study-v2-answer-section')
  );
  assert.match(planner, /\.study-v2-revealed-question h2[\s\S]*font-size: clamp\(17px, 2vw, 21px\)/);
});

test('Review Concept is official-only, lazy, and cached per current card', () => {
  assert.match(
    planner,
    /studyCandidate\?\.kind === 'official' && activeLibrary\?\.id[\s\S]*Review Concept/
  );
  assert.match(planner, /function openStudyConceptReview\(\)[\s\S]*void loadStudyConceptReview\(\)/);
  assert.match(planner, /conceptReviewLoadedKeyRef\.current === requestKey/);
  assert.match(planner, /existingRequest\?\.key === requestKey/);
  assert.match(planner, /setConceptReview\(null\)[\s\S]*conceptReviewLoadedKeyRef\.current = null/);

  const revealHandler = planner.slice(
    planner.indexOf("setIsAnswerVisible(true)"),
    planner.indexOf('<div className="study-v2-answer-body">')
  );
  assert.doesNotMatch(revealHandler, /loadOfficialStudyConceptReview/);
});

test('Concept review dialog is scrollable, keyboard-contained, and returns focus', () => {
  assert.match(planner, /aria-labelledby="study-concept-review-title"/);
  assert.match(planner, /aria-modal="true"[\s\S]*role="dialog"/);
  assert.match(planner, /event\.key === 'Escape'/);
  assert.match(planner, /event\.key !== 'Tab'/);
  assert.match(planner, /const trigger = conceptReviewTriggerRef\.current/);
  assert.match(planner, /trigger\.focus\(\)/);
  assert.match(planner, /\.study-v2-concept-review-body[\s\S]*overflow-y: auto/);
  assert.match(planner, /max-height: min\(760px, calc\(100dvh - 48px\)\)/);
});

test('modal reuses safe Markdown rendering and exposes only attributed source labels', () => {
  assert.match(planner, /<MarkdownContent markdown=\{conceptReview\.bodyMarkdown\} \/>/);
  assert.match(planner, /No Concept review content is available yet\./);
  assert.match(planner, /rel="noreferrer"[\s\S]*target="_blank"/);
  assert.doesNotMatch(
    planner.slice(
      planner.indexOf('study-v2-concept-review-modal'),
      planner.indexOf('{isAddToThisOpen')
    ),
    /dangerouslySetInnerHTML|mastery|testingAngle|accepted_answers/
  );
});

test('Concept review modal has one clear header before the Concept title', () => {
  const modalHeader = planner.slice(
    planner.indexOf('<div className="study-v2-modal-header">', planner.indexOf('study-v2-concept-review-modal')),
    planner.indexOf('aria-busy={isConceptReviewLoading}')
  );

  assert.match(modalHeader, /<h2 id="study-concept-review-title">Review Concept<\/h2>/);
  assert.doesNotMatch(modalHeader, /<p>Concept review<\/p>/);
});
