import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { questionMarkdown } from './creator-role-workspaces.mjs';

export const source = readFileSync(new URL('../../components/ArticleEditorClient.tsx', import.meta.url), 'utf8');
export const question = (overrides = {}) => ({ id: 'question', concept_id: 'concept', question_type: 'short_answer', prompt: '**literal**', explanation: 'Explanation', status: 'published', sort_order: 3,
  review_article_concept_id: 'link', current_version_id: 'version-1', updated_at: '2026-10-03T12:00:00Z', prompt_format: 'legacy',
  question_options: [], question_accepted_answers: [{ id: 'answer', answer_text: '1. literal', answer_format: 'legacy', sort_order: 0 }], question_sources: [], question_tags: [{ tag_id: 'tag' }], ...overrides });
export const conceptLink = { id: 'link', concept_id: 'concept', role: 'core', section_anchor: null, concept: { id: 'concept', name: 'ZZ Synthetic Concept', status: 'published', summary: null, concept_type: null } };
export function articleEditor({ records = [], response } = {}) {
  const states = [], refs = [], calls = [], reads = [], routes = [];
  let cursor = 0, refCursor = 0, api;
  const hooks = { useState(initial) { const i = cursor++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], update => { states[i] = typeof update === 'function' ? update(states[i]) : update; }]; }, useRef(value) { return refs[refCursor++] ||= { current: value }; }, useEffect() {}, useMemo: callback => callback() };
  const db = {
    async rpc(name, payload) {
      assert.ok(['save_question_with_version', 'save_article_question_metadata', 'archive_question'].includes(name), `Unexpected Article RPC ${name}`);
      calls.push({ name, payload }); if (response) return response(name, payload);
      if (name === 'save_question_with_version') return { data: { id: payload.p_question_id || 'new-question' }, error: null };
      if (name === 'archive_question') return { data: null, error: null };
      const record = records.find(q => q.id === payload.p_question_id); assert.ok(record);
      return { data: { ...record, current_version_id: 'version-2', updated_at: '2026-10-03T12:01:00Z', ...payload.p_patch }, error: null };
    },
    from(table) {
      assert.equal(table, 'questions'); const read = { table, columns: '', filters: [] }; reads.push(read);
      const query = { select(columns) { read.columns = columns; return query; }, eq(key, value) { read.filters.push([key, value]); return query; }, order() { return query; }, then(resolve) { return Promise.resolve({ data: records, error: null }).then(resolve); } }; return query;
    },
  };
  const modules = { react: hooks, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'next/link': { __esModule: true, default: 'a' }, 'next/navigation': { useRouter: () => ({ push: path => routes.push(path), refresh: () => routes.push('refresh') }) },
    '@/components/MarkdownContent': questionMarkdown, '@/lib/supabase': { supabase: db }, '@/lib/tag-catalog-invalidation': { broadcastTagCatalogUsageInvalidation() {} } };
  const marker = '  return (\n    <div className="panel">'; assert.equal(source.split(marker).length, 2);
  const instrumented = source.replace(marker, `  capture({ questionForms, questionBanks, questionMessageByConcept, ensureQuestionForm, updateQuestionForm, updateQuestionType, saveQuestion, renderQuestionEditor, addQuestion, loadQuestionBankForConcept, normalizeQuestion });\n${marker}`);
  const context = { exports: {}, capture: value => { api = value; }, require(id) { assert.ok(Object.hasOwn(modules, id), `Unexpected Article import ${id}`); return modules[id]; }, window: { confirm: () => true }, document: {} };
  vm.runInNewContext(ts.transpileModule(instrumented, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, context);
  const props = { article: { id: 'article', title: 'ZZ Article', slug: 'zz-article', summary: '', status: 'draft', body_markdown: '', placement_ids: [], primary_placement_id: null, tags: [], core_concepts: [conceptLink] }, activeLibrary: { id: 'library', name: 'ZZ Library' }, nodes: [] };
  return { calls, reads, routes, render() { cursor = 0; refCursor = 0; const tree = context.exports.ArticleEditorClient(props); return { ...api, tree }; } };
}
export function nodes(tree) { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.children)]; }
export function text(tree) { if (typeof tree === 'string') return tree; if (Array.isArray(tree)) return tree.map(text).join(' '); return tree ? text(tree.props?.children) : ''; }
