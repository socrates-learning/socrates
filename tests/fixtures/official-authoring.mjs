import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const dependencies = new Set(['prosemirror-model', 'prosemirror-state', 'prosemirror-view', 'prosemirror-transform', 'prosemirror-commands', 'prosemirror-history', 'prosemirror-keymap', 'prosemirror-schema-list']);
const loaded = new Map();
export function loadFoundation(name) {
  assert.ok(['document', 'markdown', 'session', 'format'].includes(name), `Unexpected foundation module ${name}`);
  if (loaded.has(name)) return loaded.get(name);
  const source = readFileSync(new URL(name === 'format' ? '../../lib/official-content-format.ts' : `../../lib/official-authoring/${name}.ts`, import.meta.url), 'utf8');
  const context = { exports: {}, URL, require(id) {
    if (id === './document' || id === './markdown') return loadFoundation(id.slice(2));
    if (id === '../official-content-format') return loadFoundation('format');
    assert.ok(dependencies.has(id), `Unexpected foundation import ${id}`);
    return require(id);
  } };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, context, { filename: name + '.ts' });
  loaded.set(name, context.exports);
  return context.exports;
}
export const pm = name => { assert.ok(dependencies.has(name)); return require(name); };
export const document = loadFoundation('document');
export const markdown = loadFoundation('markdown');
export const sessions = loadFoundation('session');
export const contentFormat = loadFoundation('format');
// Existing v1 grammar tests name the new format explicitly at this fixture
// boundary. Legacy compatibility tests always pass legacy themselves.
export const session = (source = '', flavor = 'question', format = 'visual_markdown_v1') => new sessions.OfficialSession(source, flavor, format);
export const json = value => JSON.parse(JSON.stringify(value));
export const mediaA = '11200000-0000-4000-8000-000000000001';
export const mediaB = '11200000-0000-4000-8000-000000000002';
export const token = id => `[[socrates-media:${id}]]`;
export function positions(doc, needle) {
  const found = [];
  doc.descendants((node, at) => {
    if (!node.isText) return;
    let offset = node.text.indexOf(needle);
    while (offset >= 0) { found.push(at + offset); offset = node.text.indexOf(needle, offset + 1); }
  });
  return found;
}
export const textNodes = doc => {
  const result = [];
  doc.descendants((node, pos) => { if (node.isText) result.push({ text: node.text, marks: node.marks.map(m => m.type.name), pos }); });
  return json(result);
};

export function currentRenderer() {
  const React = require('react');
  const jsx = require('react/jsx-runtime');
  const renderer = require('react-dom/server');
  const modules = { react: React, 'react/jsx-runtime': jsx, '@/lib/official-content-format': contentFormat, './MarkdownContent.module.css': { __esModule: true, default: { card: 'card', question: 'question' } } };
  const context = { exports: {}, URL, require(id) { assert.ok(id in modules, id); return modules[id]; } };
  const source = readFileSync(new URL('../../components/MarkdownContent.tsx', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, context);
  return (source, mode, format) => renderer.renderToStaticMarkup(React.createElement(context.exports.MarkdownContent, { markdown: source, mode, format }));
}
