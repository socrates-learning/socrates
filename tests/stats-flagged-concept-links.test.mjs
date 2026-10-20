import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadConceptModule, hookHarness, jsx } from './fixtures/concept-media-authoring.mjs';
import * as model from '../lib/stats-flagged-review.ts';
import * as internalPaths from '../lib/safe-internal-path.ts';
import * as format from '../lib/official-content-format.ts';

const nodes = n => Array.isArray(n) ? n.flatMap(nodes) : n && typeof n === 'object' ? [n, ...nodes(n.props?.children)] : [];
const text = n => Array.isArray(n) ? n.map(text).join('') : n && typeof n === 'object' ? text(n.props?.children) : typeof n === 'string' ? n : '';
const settle = () => new Promise(resolve => setImmediate(resolve));
const css = { __esModule: true, default: new Proxy({}, { get: (_o, key) => key }) };
const { MarkdownContent } = loadConceptModule('components/MarkdownContent.tsx', {
  react: { __esModule: true, default: { Fragment: 'Fragment' } }, 'react/jsx-runtime': jsx,
  '@/lib/official-content-format': format, './MarkdownContent.module.css': css,
});
const item = {
  source: 'official', title: 'Synthetic Question', card: null,
  flag: { id: 'flag', user_id: 'owner', question_id: 'q', personal_card_id: null, note: 'Keep this flag', created_at: '2026-10-20T12:00:00Z' },
  question: { id: 'q', concept_id: 'c', prompt: 'Synthetic Question', prompt_format: 'legacy', question_accepted_answers: [] },
};
const source = url => ({ id: 'reference', title: 'Reference title', author: 'Synthetic author', sourceType: 'Reference', note: 'Keep this note', url });
const concept = sources => ({ conceptId: 'c', name: 'Synthetic Concept', summary: 'Keep this summary', whyItMatters: null, bodyMarkdown: '**Explanation**', bodyFormat: 'visual_markdown_v1', sources });

async function openConcept(data) {
  const parent = hookHarness(), child = hookHarness();
  let active = parent;
  const hooks = Object.fromEntries(['useState', 'useEffect', 'useRef'].map(name => [name, (...args) => active.hooks[name](...args)]));
  hooks.useCallback = fn => fn;
  const calls = [];
  const { StatsFlaggedReview } = loadConceptModule('components/study-planner/StatsFlaggedReview.tsx', {
    react: hooks, 'react/jsx-runtime': jsx,
    '@/lib/supabase': { supabase: { from() { assert.fail('Review must not write data'); } } },
    '@/lib/safe-internal-path': internalPaths,
    '@/lib/stats-flagged-review': { ...model, loadFlaggedReview: async () => [item], loadFlaggedConcept: async (_client, selected, owner, library) => {
      calls.push([selected.flag.id, owner, library]); return data;
    } },
    '@/components/MarkdownContent': { MarkdownContent: 'Markdown', cardMarkdownSummary: x => x, questionMarkdownSummary: x => x },
    '@/components/QuestionMediaContent': { __esModule: true, default: 'QuestionMedia' },
    '@/components/ConceptMediaContent': { __esModule: true, default: 'ConceptMedia' },
    '@/components/QuestionPersonalNote': { __esModule: true, default: 'QuestionPersonalNote' },
    '@/components/creator/CreatorPresentationPrimitives': { CreatorDialogShell: 'Dialog' },
    './StatsFlaggedReview.module.css': css,
  });
  const renderParent = () => { active = parent; return parent.render(() => StatsFlaggedReview({ ownerId: 'owner', libraryId: 'library' })); };
  renderParent(); parent.effects(); await settle();
  nodes(renderParent()).find(n => n.type === 'button' && text(n) === 'Review Concept').props.onClick();
  const boundary = nodes(renderParent()).find(n => typeof n.type === 'function' && n.type.name === 'FlaggedConcept');
  const render = () => { active = child; return child.render(() => boundary.type(boundary.props)); };
  render(); child.effects(); await settle();
  return { tree: render(), calls, renderParent };
}

test('internal source references remain clickable with their exact path, query and fragment', async () => {
  for (const url of ['/concepts/synthetic', '/concepts/synthetic?section=references&label=a%20b#source-2']) {
    const { tree, calls } = await openConcept(concept([source(url)]));
    const link = nodes(tree).find(n => n.type === 'a');
    assert.ok(link, `Missing source link for ${url}`);
    assert.equal(link.props.href, url);
    // Match the existing Concept viewer's new-tab navigation.
    assert.equal(link.props.target, '_blank');
    assert.equal(link.props.rel, 'noopener noreferrer');
    assert.equal(text(link), 'Open source');
    assert.deepEqual(calls, [['flag', 'owner', 'library']]);
  }
});

test('absolute external references preserve destinations and safe new-tab attributes', async () => {
  for (const url of ['https://example.test/reference?a=1&b=2#section', 'http://example.test/reference']) {
    const { tree } = await openConcept(concept([source(url)]));
    const link = nodes(tree).find(n => n.type === 'a');
    assert.equal(link.props.href, url);
    assert.equal(link.props.target, '_blank');
    assert.equal(link.props.rel, 'noopener noreferrer');
    assert.match(text(tree), /Reference titleSynthetic authorReferenceKeep this note/);
  }
});

test('unsafe schemes and disguised external paths do not become links', async () => {
  for (const url of [null, '', 'javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd', '//evil.test/x', '/\\evil.test/x', '/%2f%2fevil.test', '/%5cevil.test', '/\nevil.test']) {
    const { tree } = await openConcept(concept([source(url)]));
    assert.equal(nodes(tree).filter(n => n.type === 'a').length, 0, String(url));
    assert.match(text(tree), /Reference title/);
  }
});

test('Concept body retains the existing renderer, format and Library context; closing preserves the flag', async () => {
  const data = concept([source('https://example.test/source')]);
  data.bodyMarkdown = '## Heading\n\nAn **explanation** with an [embedded reference](https://example.test/a#b).';
  const { tree, renderParent } = await openConcept(data);
  const body = nodes(tree).find(n => n.type === 'ConceptMedia');
  assert.deepEqual({ ...body.props }, { markdown: data.bodyMarkdown, format: data.bodyFormat, conceptId: 'c', libraryId: 'library' });
  const rendered = MarkdownContent({ markdown: body.props.markdown, format: body.props.format });
  const link = nodes(rendered).find(n => n.type === 'a');
  assert.equal(link.props.href, 'https://example.test/a#b');
  assert.equal(link.props.target, '_blank');
  assert.equal(link.props.rel, 'noopener noreferrer');
  assert.ok(nodes(rendered).some(n => n.type === 'strong' && text(n) === 'explanation'));
  nodes(tree).find(n => n.type === 'button' && text(n) === 'Back to flagged item').props.onClick();
  assert.match(text(renderParent()), /Keep this flag/);
  assert.equal(nodes(renderParent()).some(n => typeof n.type === 'function' && n.type.name === 'FlaggedConcept'), false);
});

test('unsafe embedded links and legacy text keep the existing literal, non-HTML interpretation', async () => {
  for (const [bodyFormat, bodyMarkdown] of [
    ['visual_markdown_v1', '[unsafe](javascript:alert(1))'],
    ['visual_markdown_v1', '<a href="javascript:alert(1)">untrusted HTML</a>'],
    ['legacy', '**Legacy formatting** and [literal syntax](https://example.test/reference)'],
  ]) {
    const data = { ...concept([]), bodyFormat, bodyMarkdown };
    const { tree } = await openConcept(data);
    const body = nodes(tree).find(n => n.type === 'ConceptMedia');
    assert.equal(body.props.markdown, bodyMarkdown);
    assert.equal(body.props.format, bodyFormat);
    const boundary = MarkdownContent({ markdown: body.props.markdown, format: body.props.format });
    const rendered = typeof boundary.type === 'function' ? boundary.type(boundary.props) : boundary;
    assert.equal(nodes(rendered).filter(n => n.type === 'a').length, 0);
    assert.ok(nodes(rendered).every(n => !n.props?.dangerouslySetInnerHTML));
    assert.match(text(rendered), bodyFormat === 'legacy' ? /literal syntax/ : /javascript:alert\(1\)/);
  }
});

test('source links retain the existing visible keyboard-focus treatment', () => {
  const css = readFileSync('components/study-planner/StatsFlaggedReview.module.css', 'utf8');
  assert.match(css, /\.review a:focus-visible[^}]*outline:\s*3px solid/);
});
