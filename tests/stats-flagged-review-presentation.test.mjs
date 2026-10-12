import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadConceptModule, hookHarness, jsx } from './fixtures/concept-media-authoring.mjs';
import * as model from '../lib/stats-flagged-review.ts';
import { projectQuestionPersonalNotes } from './fixtures/question-personal-notes.mjs';

const path = 'components/study-planner/StatsFlaggedReview.tsx';
const source = readFileSync(path, 'utf8');
const css = readFileSync('components/study-planner/StatsFlaggedReview.module.css', 'utf8');
const nodes = n => Array.isArray(n) ? n.flatMap(nodes) : n && typeof n === 'object' ? [n, ...nodes(n.props?.children)] : [];
const text = n => Array.isArray(n) ? n.map(text).join('') : n && typeof n === 'object' ? text(n.props?.children) : typeof n === 'string' || typeof n === 'number' ? String(n) : '';
const item = { source: 'official', title: 'Review this Question', flag: { id: 'flag', user_id: 'owner', question_id: 'q', personal_card_id: null, note: 'A private reminder', created_at: '2026-10-11T12:00:00Z' }, card: null, question: { id: 'q', concept_id: 'c', prompt: 'Complete **Question**', prompt_format: 'visual_markdown_v1', question_media_hint: { questionId: 'q' }, question_accepted_answers: [{ id: 'a', answer_text: 'Complete Answer', answer_format: 'visual_markdown_v1', sort_order: 0 }] } };
function harness(load) {
  const hooks = hookHarness(); hooks.hooks.useCallback = fn => fn;
  const { StatsFlaggedReview } = loadConceptModule(path, {
    react: hooks.hooks, 'react/jsx-runtime': jsx,
    '@/lib/supabase': { supabase: {} }, '@/lib/stats-flagged-review': { ...model, loadFlaggedReview: load },
    '@/components/MarkdownContent': { MarkdownContent: 'Markdown', cardMarkdownSummary: x => x, questionMarkdownSummary: x => x },
    '@/components/QuestionMediaContent': { __esModule: true, default: 'QuestionMedia' },
    '@/components/ConceptMediaContent': { __esModule: true, default: 'ConceptMedia' },
    '@/components/QuestionPersonalNote': { __esModule: true, default: 'QuestionPersonalNote' },
    '@/components/creator/CreatorPresentationPrimitives': { CreatorDialogShell: 'Dialog' },
    './StatsFlaggedReview.module.css': { __esModule: true, default: new Proxy({}, { get: (_o, k) => k }) },
  });
  const render = () => hooks.render(() => StatsFlaggedReview({ ownerId: 'owner', libraryId: 'library' }));
  return { render, async settle() { render(); hooks.effects(); await new Promise(r => setImmediate(r)); return render(); } };
}

test('heading search retains its accessible label and original single input, without illustrative controls', async () => {
  const h = harness(async () => [item]); const tree = await h.settle();
  const header = nodes(tree).find(n => n.type === 'header');
  assert.match(text(header), /Flagged ReviewReview your flagged Questions and personal Cards/);
  const label = nodes(header).find(n => n.type === 'label'); assert.match(text(label), /Search flags/);
  assert.equal(nodes(tree).filter(n => n.type === 'input').length, 1);
  assert.equal(nodes(tree).filter(n => n.type === 'select').length, 0);
  assert.doesNotMatch(text(tree), /Sort by|Newest|Next page|concepts, or explanations/);
  assert.ok(nodes(tree).filter(n => n.type === 'svg').every(n => n.props['aria-hidden'] === 'true'));
});

test('search still matches flag notes and retains selected complete content when the list has no matches', async () => {
  const h = harness(async () => [item]); await h.settle();
  const input = () => nodes(h.render()).find(n => n.type === 'input');
  input().props.onChange({ target: { value: '  PRIVATE REMINDER  ' } });
  assert.equal(nodes(h.render()).filter(n => n.props?.['aria-pressed'] === true).length, 1);
  input().props.onChange({ target: { value: 'no match' } });
  const tree = h.render(); assert.match(text(tree), /No flags match your search/);
  assert.deepEqual(nodes(tree).filter(n => n.type === 'Markdown').map(n => n.props.markdown), ['Complete **Question**', 'Complete Answer']);
  assert.ok(nodes(tree).some(n => n.type === 'QuestionPersonalNote' && n.props.questionId === 'q'));
});

test('loaded empty states are distinct from loading and failed reads', async () => {
  const pending = harness(() => new Promise(() => {}));
  assert.match(text(pending.render()), /Loading your flags/); assert.doesNotMatch(text(pending.render()), /No flagged material yet/);
  const failed = harness(async () => { throw Error('private backend detail'); }); const failedTree = await failed.settle();
  assert.match(text(failedTree), /Your flags could not be loaded/); assert.doesNotMatch(text(failedTree), /No flagged material yet|private backend detail/);
  const empty = harness(async () => []); const tree = await empty.settle();
  assert.match(text(tree), /No flagged material yet/); assert.match(text(tree), /No item selected/);
  assert.match(text(tree), /Question or personal Card/);
  assert.equal(nodes(tree).filter(n => n.type === 'button').length, 0);
});

test('populated details keep existing media surfaces, personal-note scope and one selected row', async () => {
  const h = harness(async () => [item]); const tree = await h.settle();
  assert.equal(nodes(tree).filter(n => n.props?.['aria-pressed'] === true).length, 1);
  assert.deepEqual(nodes(tree).filter(n => n.type === 'QuestionMedia').map(n => [n.props.questionId, n.props.surface]), [['q', 'front'], ['q', 'answer']]);
  const note = nodes(tree).find(n => n.type === 'QuestionPersonalNote');
  assert.deepEqual([note.props.userId, note.props.libraryId, note.props.questionId], ['owner', 'library', 'q']);
  assert.doesNotMatch(text(tree), /Edit Question|Edit This|Save Question/);
});

test('the complete released logic, Concept dialog and note integration retain their original fingerprints', () => {
  assert.equal(createHash('sha256').update(source.slice(0, source.indexOf('  return <section className='))).digest('hex'), '7713bdfe220b2dd5ab49f24aaeeb2732ebb5d1ad9672b471bd8dc2e9a7993abc');
  assert.equal(createHash('sha256').update(projectQuestionPersonalNotes(path, source)).digest('hex'), '9cb7bca1a105255eee31a57f685ff79dbe580c7f51e879aef53e7642e23d6da5');
  assert.throws(() => projectQuestionPersonalNotes(path, source.replace('placeholder="Search flags…"', 'placeholder="Different"')), /Exact Stats Flagged Review presentation/);
});

test('workspace styles stack without clipping content and provide neutral surfaces and visible focus', () => {
  const additions = css.slice(css.indexOf('/* Stats workspace only;'));
  assert.match(additions, /\.workspace \.columns[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(additions, /@media \(max-width: 800px\)[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(additions, /\.workspace \.panel[^}]*background: #fff/);
  assert.match(additions, /\.workspace \.list:focus-visible[^}]*outline: 3px solid #08143b/);
  assert.match(additions, /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition: none/);
  assert.doesNotMatch(additions.replace(/\.srOnly \{[^}]*\}/, ''), /overflow(?:-y)?: hidden|#edf3fb|#eaf|#e8f/);
  assert.match(additions, /\.workspace \.actions \.danger[^}]*color: #8e2020/);
});
