import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';

const studyStyles = readFileSync(new URL('../components/study-planner/StudyModeStyles.tsx', import.meta.url), 'utf8');
const planner = readFileSync(
  new URL('../components/StudyPlanner.tsx', import.meta.url),
  'utf8'
);
const feedbackMigration = readFileSync(
  new URL('../supabase/066_study_card_feedback.sql', import.meta.url),
  'utf8'
);
const controls = planner.slice(
  planner.indexOf('const studyCardActions'),
  planner.indexOf('return (', planner.indexOf('const studyCardActions'))
);
const questionFront = planner.slice(
  planner.indexOf(') : !isAnswerVisible ? ('),
  planner.indexOf(') : (', planner.indexOf(') : !isAnswerVisible ? ('))
);
const feedbackControls = planner.slice(
  planner.indexOf('{studyFeedback === null ? ('),
  planner.indexOf(") : studyFeedback === 'more' ? (")
);
const backHandler = planner.slice(
  planner.indexOf('  function returnToStudyQuestion()'),
  planner.indexOf('  async function loadStudyConceptReview')
);

function loadPresentationModule(path, imports) {
  const context = { exports: {}, URL, require(id) {
    assert.ok(Object.hasOwn(imports, id), `Unexpected presentation import: ${id}`);
    return imports[id];
  } };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return context.exports;
}
const contentFormat = loadPresentationModule('lib/official-content-format.ts', {});
const markdown = loadPresentationModule('components/MarkdownContent.tsx', {
  react: React,
  'react/jsx-runtime': jsxRuntime,
  '@/lib/official-content-format': contentFormat,
  './MarkdownContent.module.css': { __esModule: true, default: { card: 'card', question: 'question' } },
});
const plannerAst = ts.createSourceFile('StudyPlanner.tsx', planner, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const sizingFunction = plannerAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'getStudyFrontSize');
assert.ok(sizingFunction, 'The Front sizing helper exists');
const sizingContext = { questionMarkdownSummary: markdown.questionMarkdownSummary, cardMarkdownSummary: markdown.cardMarkdownSummary };
vm.createContext(sizingContext);
vm.runInContext(ts.transpileModule(sizingFunction.getText(plannerAst), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, sizingContext);
const frontSize = sizingContext.getStudyFrontSize;
const official = (prompt, promptFormat = 'legacy') => ({ kind: 'official', prompt, promptFormat });

test('Front sizing has exact 160/161 and 480/481 visible-character boundaries for each content contract', () => {
  assert.equal(frontSize(null), 'short');
  for (const [length, expected] of [[0, 'short'], [160, 'short'], [161, 'medium'], [480, 'medium'], [481, 'long']]) {
    const prompt = 'a'.repeat(length);
    for (const candidate of [official(prompt), official(prompt, 'visual_markdown_v1'),
      { kind: 'personal', prompt, personalConceptId: null },
      { kind: 'personal', prompt, personalConceptId: 'existing-concept' }]) {
      assert.equal(frontSize(Object.freeze(candidate)), expected);
    }
  }
});

test('Front sizing normalizes whitespace and counts Unicode code points without changing source', () => {
  for (const [prompt, expected] of [
    ['🩺'.repeat(160), 'short'], ['🩺'.repeat(161), 'medium'], ['漢'.repeat(480), 'medium'], ['漢'.repeat(481), 'long'],
    [` \n\t${'a'.repeat(160)}\u00a0 `, 'short'],
    [`${'a'.repeat(80)}\n\n\t${'b'.repeat(80)}`, 'medium'],
    [' \n\t\u00a0 ', 'short'],
  ]) {
    const candidate = Object.freeze(official(prompt));
    assert.equal(frontSize(candidate), expected);
    assert.equal(candidate.prompt, prompt);
  }
});

test('Front sizing follows actual legacy, visual and personal Markdown interpretation', () => {
  const marked = `**${'a'.repeat(160)}**`;
  assert.equal(frontSize(official(marked)), 'medium', 'Legacy punctuation remains displayed literal text');
  assert.equal(frontSize(official(marked, 'visual_markdown_v1')), 'short');
  assert.equal(frontSize({ kind: 'personal', personalConceptId: null, prompt: marked }), 'short');
  assert.equal(frontSize({ kind: 'personal', personalConceptId: 'existing-concept', prompt: marked }), 'medium');
  const link = `[${'a'.repeat(160)}](https://example.invalid/${'hidden'.repeat(100)})`;
  assert.equal(frontSize(official(link, 'visual_markdown_v1')), 'short', 'Hidden destinations do not consume visible length');
  assert.equal(frontSize(official(link)), 'long');
  const list = `1. ${'a'.repeat(160)}`;
  assert.equal(frontSize(official(list, 'visual_markdown_v1')), 'short');
  assert.equal(frontSize(official(list)), 'medium');
});

test('unsupported visual source is counted literally and sizing is stable across media and Answer changes', () => {
  const source = `[${'a'.repeat(160)}](javascript:alert(1))`;
  assert.equal(markdown.questionMarkdownKind(source, 'visual_markdown_v1'), 'plain');
  assert.equal(frontSize(official(source, 'visual_markdown_v1')), 'medium');
  const prompt = 'a'.repeat(481);
  for (const mediaHint of [null, { front: true, answer: true }, { unavailable: true }]) {
    const candidate = Object.freeze({ ...official(prompt), mediaHint, answer: 'b'.repeat(10000) });
    const before = JSON.stringify(candidate);
    assert.equal(frontSize(candidate), 'long');
    assert.equal(frontSize(candidate), 'long');
    assert.equal(JSON.stringify(candidate), before);
  }
});

test('adaptive sizing is confined to the existing Front and owns no measurement, state or persistence', () => {
  const attributes = [];
  function visit(node) {
    if (ts.isJsxAttribute(node) && node.name.getText(plannerAst) === 'data-front-size') attributes.push(node);
    ts.forEachChild(node, visit);
  }
  visit(plannerAst);
  assert.equal(attributes.length, 1);
  assert.equal(attributes[0].initializer.expression.getText(plannerAst), 'getStudyFrontSize(studyCandidate)');
  assert.ok(questionFront.includes('data-front-size={getStudyFrontSize(studyCandidate)}'));
  assert.doesNotMatch(sizingFunction.getText(plannerAst), /window|document|ResizeObserver|requestAnimationFrame|useEffect|useState|supabase|fetch|async|scroll/);
});

test('front controls contain Flag and one clean Exit but no Study Add to this entry point', () => {
  assert.match(controls, /isCandidateFlagLoading \? 'Loading…' : 'Flag'/);
  assert.match(controls, />\s*Exit\s*<\/button>/);
  assert.equal((controls.match(/>\s*Exit\s*<\/button>/g) || []).length, 1);
  assert.doesNotMatch(controls, /Add to this|openAddToThis|Close study mode|>\s*×\s*<\/button>/);
});

test('question front removes visible reveal copy but retains pointer and keyboard reveal', () => {
  assert.doesNotMatch(questionFront, /Tap to reveal answer/);
  assert.match(questionFront, /study-v2-sr-only/);
  assert.match(questionFront, /Press Enter or Space, or activate the card, to reveal the answer/);
  assert.match(planner, /onClick=\{[\s\S]*?setIsAnswerVisible\(true\)/);
  assert.match(planner, /event\.key === 'Enter' \|\| event\.key === ' '/);
  assert.match(planner, /role=\{!hasStudyCandidate \|\| isAnswerVisible \? undefined : 'button'\}/);
  assert.match(planner, /tabIndex=\{!hasStudyCandidate \|\| isAnswerVisible \? undefined : 0\}/);
});

test('Back restores the same question view using UI state only', () => {
  const compiled = ts.transpileModule(
    `${backHandler}\nglobalThis.returnToStudyQuestion = returnToStudyQuestion;`,
    {}
  ).outputText;
  const calls = [];
  const context = {
    studySubmissionStatus: 'idle',
    studyResponseSaveLock: { current: false },
    studyResponseRecordedForCard: { current: false },
    resetStudyCardFeedback: () => calls.push('reset-feedback'),
    setStudyFeedback: (value) => calls.push(['feedback', value]),
    setStudyResponse: (value) => calls.push(['response', value]),
    setIsAnswerVisible: (value) => calls.push(['answer-visible', value]),
  };
  vm.createContext(context);
  vm.runInContext(compiled, context);
  context.returnToStudyQuestion();
  assert.deepEqual(calls, [
    'reset-feedback',
    ['feedback', null],
    ['response', null],
    ['answer-visible', false],
  ]);
  assert.doesNotMatch(
    backHandler,
    /supabase|rpc\(|review_attempts|mastery|testing_angle|answered_count|selectNextStudyCandidate|persistFinalStudyResponse/
  );
});

test('Back is fail-closed after a response save begins', () => {
  const compiled = ts.transpileModule(
    `${backHandler}\nglobalThis.returnToStudyQuestion = returnToStudyQuestion;`,
    {}
  ).outputText;
  const calls = [];
  const context = {
    studySubmissionStatus: 'saving',
    studyResponseSaveLock: { current: true },
    studyResponseRecordedForCard: { current: false },
    resetStudyCardFeedback: () => calls.push('reset-feedback'),
    setStudyFeedback: () => calls.push('feedback'),
    setStudyResponse: () => calls.push('response'),
    setIsAnswerVisible: () => calls.push('answer-visible'),
  };
  vm.createContext(context);
  vm.runInContext(compiled, context);
  context.returnToStudyQuestion();
  assert.deepEqual(calls, []);
});

test('answer controls expose Back without changing the candidate identity', () => {
  assert.match(controls, /hasStudyCandidate && isAnswerVisible/);
  assert.match(controls, /aria-label="Back to question"/);
  assert.match(controls, /returnToStudyQuestion\(\)/);
  assert.doesNotMatch(backHandler, /setStudyCandidate|setIsStudySequenceComplete/);
});

test('feedback controls show compact emoji, Other, emoji pattern with accessible names', () => {
  assert.match(feedbackControls, /\['up', 'Thumbs up'\]/);
  assert.match(feedbackControls, /\['more', 'Other'\]/);
  assert.match(feedbackControls, /\['down', 'Thumbs down'\]/);
  assert.match(feedbackControls, /aria-label=\{label\}/);
  assert.match(feedbackControls, /title=\{label\}/);
  assert.doesNotMatch(feedbackControls, /<span>\{label\}<\/span>/);
  assert.match(planner, /type === 'up' \? '👍' : '👎'/);
  assert.match(
    studyStyles,
    /\.study-v2-feedback-emoji \{[\s\S]*?font-size: 24px;[\s\S]*?height: 30px;[\s\S]*?width: 30px;/
  );
  assert.match(studyStyles, /\.study-v2-feedback-row button \{[\s\S]*?min-height: 80px;/);
});

test('Other reuses the established error and suggestion reporting workflow', () => {
  assert.match(planner, /function openStudyCardMorePanel\(\)/);
  assert.match(planner, /Report an error/);
  assert.match(planner, /Suggest an improvement/);
  assert.match(planner, /\.rpc\('submit_study_card_feedback'/);
  assert.match(feedbackMigration, /feedback_type in \('error', 'suggestion'\)/);
  assert.match(feedbackMigration, /insert into public\.study_card_feedback/);
  assert.match(feedbackMigration, /grant execute on function public\.submit_study_card_feedback/);
  assert.doesNotMatch(
    feedbackMigration,
    /record_study_session_attempt|review_attempts|user_concept_mastery|user_concept_testing_angle_state|answered_count/
  );
});

test('narrow layouts retain horizontal feedback controls and usable targets', () => {
  assert.ok(studyStyles.includes('@media (max-width: 900px)'));
  const narrowStyles = studyStyles.slice(studyStyles.indexOf('@media (max-width: 900px)'));
  assert.doesNotMatch(
    narrowStyles,
    /\.study-v2-feedback-row \{\s*grid-template-columns: 1fr;/
  );
  assert.match(studyStyles, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(studyStyles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(
    studyStyles,
    /\.study-v2-question-content \{[\s\S]*?min-height: 0;[\s\S]*?overflow-y: auto;/
  );
  assert.match(studyStyles, /\.study-v2-answer-body \{[\s\S]*?overflow-y: auto;/);
});

test('Front keeps safe short-content centering and vertical scrolling without overriding rich-block or media alignment', () => {
  const frontRules = [...studyStyles.matchAll(/^ {8}\.study-v2-question-content \{([^}]*)\}/gm)];
  assert.equal(frontRules.length, 1);
  assert.match(frontRules[0][1], /justify-content: safe center;/);
  assert.match(frontRules[0][1], /min-height: 0;/);
  assert.match(frontRules[0][1], /overflow-y: auto;/);
  assert.match(frontRules[0][1], /overscroll-behavior: contain;/);
  assert.ok(questionFront.includes("style={studyCandidate?.kind === 'official' && (studyCandidate.mediaHint?.front || questionMarkdownKind(studyCandidate.prompt, studyCandidate.promptFormat) === 'block') ? { justifyContent: 'flex-start' } : undefined}"));
});

test('six-response persistence and Review Concept remain on their existing paths', () => {
  for (const response of [
    'easy',
    'average',
    'hard',
    'didnt_know',
    'forgot',
    'too_hard',
  ]) {
    assert.match(planner, new RegExp(`'${response}'`));
  }
  assert.match(planner, /\.rpc\('record_study_session_attempt'/);
  assert.match(planner, /recordPersonalStudyAttempt\(supabase/);
  assert.match(planner, />\s*Review Concept\s*<\/button>/);
});
