import * as officialFormat from '../lib/official-content-format.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const source = read('components/MarkdownContent.tsx');
const modules = { '@/lib/official-content-format': officialFormat, react: React, 'react/jsx-runtime': jsx, './MarkdownContent.module.css': { __esModule: true, default: { card: 'card', question: 'question' } } };
const context = { exports: {}, URL, require(name) { assert.ok(name in modules, name); return modules[name]; } };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, context);
const { MarkdownContent } = context.exports;
const kind = (source, format = 'visual_markdown_v1') => context.exports.questionMarkdownKind(source, format);
const summary = (source, format = 'visual_markdown_v1') => context.exports.questionMarkdownSummary(source, format);
const render = (markdown, props = {}) => renderToStaticMarkup(React.createElement(MarkdownContent, { markdown, mode: 'question', format: 'visual_markdown_v1', ...props }));
const escape = raw => renderToStaticMarkup(React.createElement(React.Fragment, null, raw));

test('ordinary official text keeps literal whitespace and does not introduce wrappers', () => {
  for (const raw of ['', 'Question?', 'one\ntwo', 'one\r\n\r\ntwo', '  first  \n\nsecond  ', '<img src=x> & 雪 🧠', '# unsupported', '**unclosed', '`code`', '~~struck~~']) {
    assert.equal(kind(raw, 'legacy'), 'plain', raw); assert.equal(render(raw, { format: 'legacy' }), escape(raw));
  }
});
test('the seven tools use explicit v1 grammar and classify inline vs block output', () => {
  for (const raw of ['**bold and *italic***', '*italic and **bold***', '***both***', '[**safe**](https://example.test)', '\\*literal\\*']) assert.equal(kind(raw), 'inline', raw);
  assert.equal(render('**bold and *italic***'), '<strong>bold and <em>italic</em></strong>');
  for (const raw of ['## Heading', '### Heading', '- One\n- Two', '1. One\n2. Two', '> Quote', '**one**\n\ntwo']) {
    assert.equal(kind(raw), 'block');
    assert.match(render(raw), /^<div class="question">/);
    assert.doesNotMatch(render(raw), /<a|<script|<img/);
  }
  assert.equal(render('## historical source', { format: 'legacy' }), '## historical source');
  assert.equal(render('1. literal', { format: 'legacy' }), '1. literal');
  assert.match(render('1. literal'), /<ol><li><p>literal<\/p><\/li><\/ol>/);
  assert.equal(render('> > Nested'), '&gt; &gt; Nested');
});
test('safe link labels are formatted but noninteractive before reveal; summaries are strings only', () => {
  const raw = '[**Safe**](https://example.test/path_(one)?x=1&y=2)';
  assert.match(render(raw), /<strong><a href="https:\/\/example.test\/path_\(one\)\?x=1&amp;y=2" target="_blank" rel="noopener noreferrer">Safe<\/a><\/strong>/);
  assert.equal(render(raw, { interactiveLinks: false }), '<strong>Safe</strong>');
  assert.equal(summary('## Title\n\n' + raw + '\n- One\n- Two'), 'Title Safe One Two');
  assert.equal(typeof summary(raw), 'string');
  for (const url of ['javascript:alert(1)', 'data:text/html,<script>x</script>', '/relative', '//example.test', 'mailto:a@example.test', 'java\nscript:alert(1)', 'https://exa\u0000mple.test', 'https://example.test\\@evil.test', 'https&#58;//example.test', 'https://', 'https://exa mple.test']) {
    const hostile = `[label](${url})`;
    assert.equal(render(hostile), escape(hostile)); assert.doesNotMatch(render(hostile), /<a\b/);
  }
});
test('raw HTML, Markdown images, placement-like tokens and malformed source never create content or requests', () => {
  for (const raw of ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '![image](https://example.test/image.png)', '[broken](javascript:alert(1)', '[broken](https://example.test', '[](https://example.test)', '{{media:11200000-0000-4000-8000-000000000001}}']) {
    assert.equal(render(raw), escape(raw)); assert.doesNotMatch(render(raw), /<img\b|<script\b|<a\b/);
  }
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
});
test('bounded parsing retains maximum and oversized source without a new persistence limit', () => {
  for (const raw of ['雪'.repeat(65536), '## ' + 'x'.repeat(65537), '['.repeat(65536), '> '.repeat(20) + 'end']) {
    const html = render(raw); assert.ok(html.length > 0);
    if (raw.length > 65536) { assert.equal(kind(raw), 'plain'); assert.equal(html, escape(raw)); }
    assert.ok(summary(raw).endsWith(raw.endsWith('end') ? 'end' : raw.slice(-1)));
  }
  const url = 'https://example.test/' + 'a'.repeat(19000);
  assert.match(render(`[link](${url})`), /<a /);
  const css = read('components/MarkdownContent.module.css');
  assert.match(css, /\.question \{[^}]*overflow-wrap: anywhere;[^}]*white-space: pre-wrap;/);
});
test('Study official plain wrappers, inline/block markup and links obey the three existing slots', () => {
  const code = read('components/StudyPlanner.tsx'), ast = ts.createSourceFile('study.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), slots = [];
  function walk(node) { if (ts.isConditionalExpression(node) && node.condition.getText(ast) === "studyCandidate?.kind === 'personal' && studyCandidate.personalConceptId === null") slots.push(node.getText(ast)); ts.forEachChild(node, walk); } walk(ast);
  assert.equal(slots.length, 3);
  for (const [i, expression] of slots.entries()) {
    const c = { exports: {}, ...context.exports, require: name => { assert.equal(name, 'react/jsx-runtime'); return jsx; } };
    vm.runInNewContext(ts.transpileModule(`export function View({studyCandidate,studyAnswer}) { return (${expression}); }`, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, c);
    const view = raw => renderToStaticMarkup(React.createElement(c.exports.View, { studyCandidate: { kind: 'official', prompt: raw, promptFormat: 'visual_markdown_v1', answerFormat: 'visual_markdown_v1' }, studyAnswer: raw }));
    assert.equal(view('Plain & text'), ['<h1>Plain &amp; text</h1>', '<h2 id="study-revealed-question-heading">Plain &amp; text</h2>', '<p>Plain &amp; text</p>'][i]);
    for (const rich of ['[link](https://example.test)', '## Heading\n- One\n- Two\n> Quote\n[link](https://example.test)']) {
      const html = view(rich);
      assert.doesNotMatch(html, /<(?:h1|h2|p)[^>]*><div/);
      if (i === 0) assert.doesNotMatch(html, /<a\b/); else assert.match(html, /<a\b/);
    }
  }
});
