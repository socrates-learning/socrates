import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { editor, nodes, text } from './fixtures/creator-role-workspaces.mjs';

const markdownModules = { react: React, 'react/jsx-runtime': jsx, './MarkdownContent.module.css': { default: { card: 'card' } } };
const markdownContext = { exports: {}, URL, require(name) { assert.ok(name in markdownModules, name); return markdownModules[name]; } };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../components/MarkdownContent.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, markdownContext);
const markdown = markdownContext.exports;
const childSource = readFileSync(new URL('../components/creator/CreatorLearnerQuestionsWorkspace.tsx', import.meta.url), 'utf8');
function presentation(props) {
  let search = '';
  const modules = {
    '@/components/MarkdownContent': markdown,
    react: { useState: () => [search, value => { search = value; }] },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    '../CreatorStudioV2Client.module.css': { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) },
  };
  const context = { exports: {}, require(name) { assert.ok(name in modules, `Unexpected learner presentation dependency: ${name}`); return modules[name]; } };
  vm.runInNewContext(ts.transpileModule(childSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  return () => context.exports.CreatorLearnerQuestionsWorkspace(props);
}
function workspace(e) { const found = nodes(e.tree).filter(n => n.type?.name === 'CreatorLearnerQuestionsWorkspace'); assert.equal(found.length, 1); return found[0].props; }
function activate(e, name = 'Topic') { const found = nodes(e.tree).find(n => n.props?.['aria-label'] === `Make ${name} the active topic`); assert.ok(found); found.props.onClick(); }
const card = { id: 'standalone', owner_id: 'owner', concept_id: null, library_node_id: 'topic', library_id: 'library', personal_topic_id: null, question: 'Synthetic front', answer: 'Synthetic back', created_at: '2026-01-02T00:00:00Z', updated_at: '2026-01-02T00:00:00Z' };

test('real learner presentation searches Front and Back locally and dispatches exact Card identity', () => {
  const opened = []; let newCalls = 0;
  const render = presentation({ editor: 'EDITOR', topicTree: 'TREE', busy: false, cards: [{ id: 'a', front: 'Alpha', back: 'Needle' }, { id: 'b', front: 'Beta', back: 'Other' }], onOpen: id => opened.push(id), onNew: () => newCalls++ });
  let tree = render(); assert.match(text(tree), /EDITOR/); assert.match(text(tree), /TREE/);
  nodes(tree).find(n => n.props?.type === 'search').props.onChange({ target: { value: 'needle' } }); tree = render();
  const hits = nodes(tree).filter(n => n.props?.className === 'questionSearchResult'); assert.equal(hits.length, 1); assert.equal(text(hits[0]), 'Alpha'); hits[0].props.onClick();
  assert.deepEqual(opened, ['a']); nodes(tree).find(n => n.type === 'button' && text(n) === 'New Card').props.onClick(); assert.equal(newCalls, 1);
  assert.doesNotMatch(text(tree), /Concept|Difficulty|Testing Angle|Add Custom Card/);
});

test('real learner presentation has distinct empty/search-empty states and disables actions while busy', () => {
  const props = { editor: null, topicTree: null, busy: true, cards: [], onOpen() {}, onNew() {} };
  assert.match(text(presentation(props)()), /No Cards yet/);
  props.cards = [{ id: 'x', front: 'Front', back: 'Back' }]; const render = presentation(props);
  for (const n of nodes(render()).filter(n => n.type === 'button')) assert.equal(n.props.disabled, true);
  nodes(render()).find(n => n.props?.type === 'search').props.onChange({ target: { value: 'absent' } }); assert.match(text(render()), /No Cards match/);
});

test('New Card cannot invent a default attachment before the learner selects a Topic', () => {
  const h = editor({ role: 'learner', placed: true }); let e = h.render();
  assert.equal(e.standaloneRequest, null); assert.match(text(workspace(e).editor), /Select a Topic/);
  workspace(e).onNew(); e = h.render(); assert.equal(e.standaloneRequest, null);
  assert.equal(nodes(e.tree).filter(n => n.type === 'button' && text(n) === 'Save Card').length, 0);
  activate(e); e = h.render(); assert.equal(e.standaloneRequest.attachment.topicId, 'topic'); assert.equal(e.standaloneRequest.card, null);
  assert.equal(e.activeCreatorTab, 'questions'); assert.equal(h.calls.length, 0); assert.deepEqual(h.routes, []);
  const child = nodes(e.tree).find(n => n.type?.name === 'StandaloneCustomCardWorkspace');
  assert.equal(child.props.ownerId, 'owner'); assert.equal(child.props.canCreate, true);
  assert.equal(nodes(e.tree).filter(n => n.props?.['aria-label']?.startsWith('Assign concept to ')).length, 0);
  assert.ok(nodes(e.tree).some(n => n.props?.['aria-label'] === 'Include Topic in Study'));
});

test('learner browse reopens standalone identity; New Card starts a separate draft at its attachment', () => {
  const h = editor({ role: 'learner', placed: true }); let e = h.render(); e.setStandaloneCards([card]); e = h.render();
  workspace(e).onOpen(card.id); e = h.render(); assert.equal(e.standaloneRequest.card.id, card.id);
  assert.equal(e.standaloneRequest.card.concept_id, null);
  workspace(e).onNew(); e = h.render(); assert.equal(e.standaloneRequest.card, null); assert.equal(e.standaloneRequest.attachment.topicId, 'topic');
  assert.equal(workspace(e).cards.filter(c => c.id === card.id).length, 1); assert.equal(h.calls.length, 0);
});

test('changing Topic starts a new attachment draft without mutating an existing saved Card', () => {
  const h = editor({ role: 'learner', placed: true }); let e = h.render(); e.setStandaloneCards([card]); e = h.render(); workspace(e).onOpen(card.id); e = h.render();
  activate(e, 'Personal Topic'); e = h.render(); assert.equal(e.standaloneRequest.card, null); assert.equal(e.standaloneRequest.attachment.source, 'personal'); assert.equal(e.standaloneRequest.attachment.topicId, 'mine-topic');
  assert.equal(e.filterPersonalCardsForSearch({ text: '', difficulty: '', primaryTestingAngle: '', additionalTestingAngle: '', primaryConceptId: '', relatedConceptId: '', status: '', tagId: '' }).find(c => c.id === card.id).conceptId, null);
  assert.equal(h.calls.length, 0);
});

test('busy and rejected discard preserve the learner standalone editor and attachment', () => {
  const h = editor({ role: 'learner', placed: true, confirm: () => false }); let e = h.render(); activate(e); e = h.render(); const original = e.standaloneRequest;
  e.standaloneEditorRef.current.busy = true; workspace(e).onNew(); activate(e, 'Personal Topic'); assert.equal(h.render().standaloneRequest, original);
  e.standaloneEditorRef.current.busy = false; e.standaloneEditorRef.current.dirty = true; activate(e, 'Personal Topic'); assert.equal(h.render().standaloneRequest, original);
  assert.equal(h.calls.length, 0);
});

test('legacy Card remains discoverable without canonical placement and Front/Back edit preserves its identity and association', async () => {
  const h = editor({ role: 'learner', placed: false }); let e = h.render(); assert.ok(workspace(e).cards.some(c => c.id === 'mine-card'));
  workspace(e).onOpen('mine-card'); e = h.render(); assert.equal(e.questionEditorState.identity.key, 'personal:card:mine-card'); assert.equal(e.personalQuestionConceptId, 'mine-concept');
  const tree = workspace(e).editor; assert.equal(nodes(tree).filter(n => n.type === 'textarea').length, 2); assert.equal(nodes(tree).filter(n => n.type === 'select').length, 0);
  e.setQuestionPrompt('Updated Front'); e.setQuestionAnswer('Updated Back'); await h.render().saveCurrentQuestion();
  const write = h.calls.find(c => c.table === 'personal_cards'); assert.equal(write.operation, 'update'); assert.deepEqual(JSON.parse(JSON.stringify(write.filters)), [['id','mine-card'],['owner_id','owner']]);
  assert.equal(h.render().personalQuestionConceptId, 'mine-concept'); assert.equal(h.render().questionEditorState.identity.key, 'personal:card:mine-card');
  assert.equal(h.calls.filter(c => c.operation === 'delete').length, 0);
});

test('learner standalone deletion removes only the standalone owner-qualified Card and returns to the selection prompt', async () => {
  const h = editor({ role: 'learner', placed: true }); let e = h.render(); e.setStandaloneCards([card]); e = h.render(); workspace(e).onOpen(card.id); e = h.render();
  await e.deleteSelectedStandaloneCard(); e = h.render(); assert.equal(e.standaloneRequest, null); assert.match(text(workspace(e).editor), /Select a Topic/);
  assert.ok(!workspace(e).cards.some(c => c.id === card.id)); assert.ok(workspace(e).cards.some(c => c.id === 'mine-card'));
  const deletion = h.calls.find(c => c.operation === 'delete'); assert.equal(deletion.table, 'personal_cards'); assert.deepEqual(JSON.parse(JSON.stringify(deletion.filters)), [['id',card.id],['owner_id','owner'],['concept_id',null]]);
});

test('My Cards search and results belong to the left authoring pane above its editor',()=>{
 const tree=presentation({editor:'EDITOR',topicTree:'TREE',cards:[{id:'a',front:'Alpha',back:'Back'}],busy:false,onOpen(){},onNew(){}})();
 const left=nodes(tree).find(n=>n.props?.['aria-label']==='Card authoring');
 assert.ok(left);assert.ok(nodes(left).some(n=>n.props?.['aria-label']==='Your Cards'));
 assert.ok(nodes(left).some(n=>n.props?.type==='search'));assert.match(text(left),/My Cards.*Alpha.*Question \/ Answer.*EDITOR/);
 assert.doesNotMatch(text(left),/TREE/);
});


test('standalone results use noninteractive summaries while source search and legacy labels stay unchanged', () => {
  const front = '## Title\n[**Safe**](https://example.com)';
  const render = presentation({ editor: null, topicTree: null, busy: false, cards: [
    { id: 'standalone', front, back: 'Back', standalone: true },
    { id: 'legacy', front, back: 'Back', standalone: false },
  ], onOpen() {}, onNew() {} });
  nodes(render()).find(n => n.props?.type === 'search').props.onChange({ target: { value: 'https://example.com' } });
  const hits = nodes(render()).filter(n => n.props?.className === 'questionSearchResult');
  assert.equal(hits.length, 2);
  assert.equal(hits[0].props.children, 'Title Safe');
  assert.equal(hits[1].props.children, front);
  assert.equal(nodes(hits).filter(n => n.type === 'a').length, 0);
});
