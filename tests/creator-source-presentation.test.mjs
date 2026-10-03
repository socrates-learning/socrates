import { questionContentBoundary } from './fixtures/question-media-authoring.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function text(tree) {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (!tree) return '';
  if (Array.isArray(tree)) return tree.map(text).join(' ');
  return text(tree.props?.children);
}
function flagged(source, neutralPresentation = true) {
  const states = [
    [{ id: 'flag', question_id: source === 'official' ? 'question' : null, personal_card_id: source === 'personal' ? 'card' : null, note: null, created_at: '2026-01-01T00:00:00Z' }],
    [{ id: 'question', concept_id: 'concept', prompt: 'Equivalent question', difficulty: null, testing_angle: null }],
    [{ id: 'concept', name: 'Equivalent concept' }], 'flag', '', false, null, '',
  ];
  let cursor = 0;
  const modules = {
    react: { useState: () => [states[cursor++], () => {}], useMemo: fn => fn(), useCallback: fn => fn, useEffect() {} },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    '@/components/QuestionMediaContent': questionContentBoundary, '@/lib/supabase': { supabase: {} },
    '@/components/MarkdownContent': { cardMarkdownSummary: source => source, questionMarkdownSummary: source => source, questionMarkdownKind: () => 'plain', MarkdownContent: 'markdown' },
    './StudyCreatorIcon': { StudyCreatorIcon: 'icon' },
    './StudyCreatorClient.module.css': { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) },
  };
  const context = { exports: {}, require: name => { assert.ok(name in modules); return modules[name]; } };
  vm.runInNewContext(ts.transpileModule(read('../components/StudyCreatorFlaggedBrowser.tsx'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, context);
  return context.exports.StudyCreatorFlaggedBrowser({ ownerId: 'owner', neutralPresentation,
    material: { topics: [], overlays: [], concepts: [{ id: 'concept', owner_id: 'owner', name: 'Equivalent concept' }], cards: [{ id: 'card', owner_id: 'owner', concept_id: 'concept', question: 'Equivalent question', answer: 'Answer' }] },
  });
}
test('canonical Flagged rows are source-neutral with the same icon, color, grid and label treatment', () => {
  const renders = ['official', 'personal'].map(source => flagged(source));
  for (const tree of renders) {
    assert.doesNotMatch(text(tree), /\b(Mine|Personal|Official|Socrates)\b/);
    assert.equal(nodes(tree).filter(n => /OwnerMark|personalHeadingIcon/.test(n.props?.className || '')).length, 0);
  }
  const row = tree => nodes(tree).find(n => n.props?.className?.startsWith('flaggedRow'));
  assert.equal(text(row(renders[0])), text(row(renders[1])));
  assert.equal(row(renders[0]).props.className, row(renders[1]).props.className);
  assert.equal(JSON.stringify(row(renders[0]).props.style), JSON.stringify(row(renders[1]).props.style));
  const icon = tree => nodes(tree).find(n => n.props?.className?.startsWith('headingIcon'));
  assert.equal(icon(renders[0]).props.className, icon(renders[1]).props.className);
});
test('separate Study Creator retains its existing presentation unless canonical neutrality is requested', () => {
  assert.match(text(flagged('personal', false)), /Mine/);
  assert.match(read('../components/creator/CreatorStudioChrome.tsx'), /ownerId=\{ownerId\} neutralPresentation/);
});
test('canonical source badges and Move ownership prefixes cannot return', () => {
  const creator = read('../components/CreatorStudioV2Client.tsx');
  const interaction = read('../components/CreatorTopicTreeInteraction.tsx');
  const css = read('../components/CreatorStudioV2Client.module.css');
  assert.doesNotMatch(creator, /\bMine\b|sourceBadge|data-source=|personalConceptChoice/);
  assert.doesNotMatch(interaction, /\bMine\b|Personal roots|official Topic/);
  assert.doesNotMatch(css, /sourceBadge|personalConceptChoice/);
  assert.match(creator, /Placement required/);
  assert.match(creator, /Currently editing/);
  assert.match(creator, /Lifecycle, Tags, and Prerequisites: Not applicable/);
});
