import * as officialFormat from '../lib/official-content-format.ts';
import { questionContentBoundary } from './fixtures/question-media-authoring.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { editor, nodes, question } from './fixtures/creator-question-workflow.mjs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const literal = '## Heading\n**bold** and *italic* [safe link](https://example.test)\n<img src=x onerror=alert(1)>\n[unsafe](javascript:alert(1))';
const supported = '## Heading\n\n**bold** and *italic* [safe link](https://example.test)';
function load(source, modules, globals = {}) {
    const context = { exports: {}, ...globals, require(name) { assert.ok(name in modules, `Unexpected rendering dependency: ${name}`); return modules[name]; } };
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, context);
    return context.exports;
}
const markdown = load(read('components/MarkdownContent.tsx'), { '@/lib/official-content-format': officialFormat, react: React, 'react/jsx-runtime': jsx, './MarkdownContent.module.css': { default: { card: 'card' } } }, { URL });
function syntax(path, predicate) { const code = read(path); const ast = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX); const matches = []; function walk(node) { if (predicate(node, ast))
    matches.push(node.getText(ast)); ts.forEachChild(node, walk); } walk(ast); return matches; }
function renderExpression(expression, values) { const { View } = load(`export function View(p){const {${Object.keys(values).join(',')}}=p;return (${expression});}`, { 'react/jsx-runtime': jsx }, { ...markdown }); return renderToStaticMarkup(React.createElement(View, values)); }
function assertLiteral(html) { assert.match(html, /## Heading/); assert.match(html, /\*\*bold\*\*/); assert.match(html, /\[safe link\]\(https:\/\/example.test\)/); assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/); assert.doesNotMatch(html, /<a\b|<img\b|<script\b|<strong>bold|<h\d>Heading/); }
for (const role of ['admin', 'editor'])
    test(`${role} official editors keep source and result labels use inert summaries`, () => {
        const h = editor({ role });
        let e = h.render();
        e.setActiveCreatorTab('questions');
        e.selectQuestionConcept('primary', 'topic');
        e = h.render();
        e.selectExistingQuestion(question({ prompt: literal, answer: literal }));
        e.setExistingQuestions([question({ prompt: literal, answer: literal })]);
        e = h.render();
        const fields = nodes(e.tree).filter(n => n.type === 'textarea' && n.props.value === literal);
        assert.equal(fields.length, 2);
        assert.equal(nodes(e.tree).filter(n => n.type?.name === 'CardMarkdownField').length, 0);
        const prompt = nodes(e.tree).find(n => n.type === 'span' && n.props.title === literal);
        assert.ok(prompt);
        assert.equal(prompt.props.children, markdown.questionMarkdownSummary(literal));
        assert.doesNotMatch(renderToStaticMarkup(React.createElement('span', null, prompt.props.children)), /<a\b|<img\b/);
    });
const slots = syntax('components/StudyPlanner.tsx', (n, a) => ts.isConditionalExpression(n) && n.condition.getText(a) === "studyCandidate?.kind === 'personal' && studyCandidate.personalConceptId === null");
test('Study and Cram freeze all three official/legacy text slots separately from standalone Card rendering', () => {
    assert.equal(slots.length, 3);
    for (const [index, slot] of slots.entries()) {
        assertLiteral(renderExpression(slot, { studyCandidate: { kind: 'personal', personalConceptId: 'legacy', prompt: literal }, studyAnswer: literal }));
        const official = renderExpression(slot, { studyCandidate: { kind: 'official', prompt: literal }, studyAnswer: literal });
        assertLiteral(official);
        const formatted = renderExpression(slot, { studyCandidate: { kind: 'official', prompt: supported, promptFormat: 'visual_markdown_v1', answerFormat: 'visual_markdown_v1' }, studyAnswer: supported });
        assert.match(formatted, /<h2>Heading<\/h2>/);
        assert.match(formatted, /<strong>bold<\/strong>/);
        assert.doesNotMatch(formatted, /<img\b|href="javascript:/);
        if (index === 0) assert.doesNotMatch(formatted, /<a\b/); else assert.match(formatted, /<a href="https:\/\/example.test"/);
        assertLiteral(renderExpression(slot, { studyCandidate: { kind: 'official', prompt: literal, promptFormat: 'visual_markdown_v1', answerFormat: 'visual_markdown_v1' }, studyAnswer: literal }));
        const standalone = renderExpression(slot, { studyCandidate: { kind: 'personal', personalConceptId: null, prompt: literal }, studyAnswer: literal });
        assert.match(standalone, /<h2>Heading<\/h2>/);
        assert.match(standalone, /<strong>bold<\/strong>/);
        assert.doesNotMatch(standalone, /<img\b|href="javascript:/);
        if (index === 0)
            assert.doesNotMatch(standalone, /<a\b/);
        else
            assert.match(standalone, /<a href="https:\/\/example.test"/);
    }
    const planner = read('components/StudyPlanner.tsx');
    assert.match(planner, /mode === 'study'/);
    assert.doesNotMatch(slots.join('\n'), /cramMode|isCram/);
});
function flagHtml(kind, format = 'legacy', source = literal) {
    let cursor = 0;
    const official = kind === 'official';
    const states = [[{ id: 'flag', personal_card_id: official ? null : 'card', question_id: official ? 'question' : null, note: 'Preserved note', created_at: '2026-01-01T00:00:00Z' }], official ? [{ id: 'question', concept_id: 'primary', prompt: source, prompt_format: format, difficulty: 'medium', testing_angle: 'Safety' }] : [], [{ id: 'primary', name: 'Primary' }], 'flag', '', false, null, ''];
    const modules = { react: { useState: () => [states[cursor++], () => { }], useMemo: fn => fn(), useCallback: fn => fn, useEffect() { } }, 'react/jsx-runtime': jsx, '@/components/QuestionMediaContent': questionContentBoundary, '@/lib/supabase': { supabase: {} }, '@/components/MarkdownContent': markdown, './StudyCreatorIcon': { StudyCreatorIcon: () => null }, './StudyCreatorClient.module.css': { default: {} } };
    const { StudyCreatorFlaggedBrowser } = load(read('components/StudyCreatorFlaggedBrowser.tsx'), modules);
    const card = { id: 'card', concept_id: kind === 'standalone' ? null : 'primary', question: literal, answer: literal };
    return renderToStaticMarkup(React.createElement(StudyCreatorFlaggedBrowser, { ownerId: 'owner', neutralPresentation: true, material: { cards: kind === 'legacy' ? [card] : [], standaloneCards: kind === 'standalone' ? [card] : [], concepts: [], topics: [], overlays: [] } }));
}
test('Flagged official prompt opts in without an official Answer path; legacy vs standalone stays distinct', () => {
    assertLiteral(flagHtml('official'));
    const official = flagHtml('official', 'visual_markdown_v1', supported);
    assert.match(official, /<strong>bold<\/strong>/);
    assert.match(official, /<a href="https:\/\/example.test"/);
    assert.doesNotMatch(official, /<img\b|href="javascript:/);
    assert.doesNotMatch(official, />Answer</);
    assert.match(official, /Preserved note/);
    assert.match(official, />Unflag</);
    const legacy = flagHtml('legacy');
    assertLiteral(legacy);
    assert.match(legacy, />Answer</);
    const standalone = flagHtml('standalone');
    assert.match(standalone, /<h2>Heading<\/h2>/);
    assert.equal((standalone.match(/<a href="https:\/\/example.test"/g) || []).length, 2);
});
test('legacy Study Creator official summaries are inert, full Front opts in and explanation stays literal', () => {
    const list = syntax('components/SocratesStudyCreatorBrowser.tsx', n => ts.isJsxElement(n) && n.getText().includes('<strong>{questionMarkdownSummary(question.prompt, question.prompt_format)}</strong>') && n.openingElement.tagName.getText() === 'strong');
    assert.equal(list.length, 1);
    const summary = renderExpression(list[0], { question: { prompt: literal, prompt_format: 'legacy' }, questionMarkdownSummary: value => value });
    assertLiteral(summary);
    const richSummary = renderExpression(list[0], { question: { prompt: supported, prompt_format: 'visual_markdown_v1' } });
    assert.doesNotMatch(richSummary, /<a\b|<img\b|## Heading/);
    const detail = syntax('components/SocratesStudyCreatorBrowser.tsx', (n,a) => ts.isConditionalExpression(n) && n.condition.getText(a) === "questionMarkdownKind(question.prompt, question.prompt_format) === 'block'");
    assert.equal(detail.length, 1);
    assertLiteral(renderExpression(detail[0], { question: { prompt: literal, prompt_format: 'legacy' } }));
    assert.match(renderExpression(detail[0], { question: { prompt: supported, prompt_format: 'visual_markdown_v1' } }), /<strong>bold<\/strong>/);
    const explanation = syntax('components/SocratesStudyCreatorBrowser.tsx', n => ts.isJsxElement(n) && n.getText() === '<p>{question.explanation}</p>');
    assert.equal(explanation.length, 1);
    assertLiteral(renderExpression(explanation[0], { question: { explanation: literal } }));
});
test('Algorithm diagnostics Current Question remains literal text', () => {
    const expressions = syntax('components/CreatorAlgorithmDiagnostics.tsx', (n, a) => ts.isJsxElement(n) && n.openingElement.tagName.getText(a) === 'p' && n.getText(a).includes('Current Question:'));
    assert.equal(expressions.length, 1);
    assertLiteral(renderExpression(expressions[0], { selectedOffer: { prompt: literal }, styles: {} }));
});
test('Article legacy summary and editable fields retain literal source under the format boundary', () => {
    const summaries = syntax('components/ArticleEditorClient.tsx', (n, a) => ts.isJsxElement(n) && n.openingElement.tagName.getText(a) === 'p' && n.getText(a).includes("questionMarkdownSummary(question.prompt"));
    assert.equal(summaries.length, 1);
    assertLiteral(renderExpression(summaries[0], { question: { prompt: literal, prompt_format: 'legacy' }, questionMarkdownSummary: value => value }));
    const fields = syntax('components/ArticleEditorClient.tsx', (n, a) => ts.isJsxSelfClosingElement(n) && ['textarea', 'input'].includes(n.tagName.getText(a)) && (/value=\{form.prompt\}|value=\{answer.answer_text\}/).test(n.getText(a)));
    assert.equal(fields.length, 2);
    for (const field of fields) {
        assert.doesNotMatch(field, /Markdown/);
        assert.match(field, /onChange=/);
    } // Handler ownership stays in Article; no integration change in this gate.
});
