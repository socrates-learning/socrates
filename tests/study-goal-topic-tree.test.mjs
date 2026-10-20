import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import * as jsx from 'react/jsx-runtime';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import * as model from '../lib/study-goals.ts';
import { loadConceptModule } from './fixtures/concept-media-authoring.mjs';
import { goalTopicTreeFixture } from './fixtures/study-goal-topic-tree.mjs';

const dom = new JSDOM('<div id="mount"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
const globals = { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
  Event: dom.window.Event, IS_REACT_ACT_ENVIRONMENT: true };
const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
const { createRoot } = await import('react-dom/client');
after(() => {
  dom.window.close();
  for (const [key, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
});
const css = { __esModule: true, default: new Proxy({}, { get: (_object, key) => key }) };
const tree = loadConceptModule('components/study-planner/StudyGoalTopicTree.tsx', {
  react: React, 'react/jsx-runtime': jsx, '@/lib/study-goals': model, './StudyGoals.module.css': css,
});

async function mount(data = goalTopicTreeFixture()) {
  let saved = structuredClone(data), failure = false;
  const calls = [];
  const supabase = { async rpc(name, args) {
    calls.push({ name, args: JSON.parse(JSON.stringify(args)) });
    if (name === 'get_study_goals') return { data: structuredClone(saved), error: null };
    assert.equal(name, 'save_placement_study_goal', 'No Home or learning mutations are allowed');
    if (failure) return { data: null, error: { message: 'Synthetic save failed. Try again.' } };
    const existing = saved.goals.find(goal => goal.id === args.p_goal_id);
    const goal = { ...(existing ?? data.goals[0]), id: existing?.id ?? 'new-goal', revision: (existing?.revision ?? 0) + 1,
      name: args.p_name, deadline: args.p_deadline, objective: args.p_objective,
      official_topic_ids: [...args.p_official_location_ids], personal_topic_ids: [...args.p_personal_topic_ids] };
    saved.goals = [...saved.goals.filter(item => item.id !== goal.id), goal];
    return { data: goal.id, error: null };
  }};
  const { StudyGoals } = loadConceptModule('components/study-planner/StudyGoals.tsx', {
    react: React, 'react/jsx-runtime': jsx, '@/lib/supabase': { supabase }, '@/lib/study-goals': model,
    './StudyAdvisor': { StudyAdvisor: () => null }, './StudyGoals.module.css': css, './StudyGoalTopicTree': tree,
  });
  let root;
  async function open() {
    root = createRoot(document.getElementById('mount'));
    await act(async () => root.render(React.createElement(StudyGoals, { libraryId: data.library_id, requestScope: 'synthetic-learner' })));
  }
  await open();
  const button = name => [...document.querySelectorAll('button')].find(el => el.textContent === name || el.getAttribute('aria-label') === name);
  const path = id => data.topics.find(topic => topic.source === 'official' && topic.id === id).path;
  const checkbox = (id, source = 'official') => {
    const topic = data.topics.find(item => item.source === source && item.id === id);
    return [...document.querySelectorAll('input[type="checkbox"]')].find(el => el.getAttribute('aria-label') === `${topic.path}${source === 'personal' ? ' (My Topic)' : ''}`);
  };
  const click = async el => { assert.ok(el, 'Expected a rendered control'); await act(async () => el.click()); };
  const input = async (type, value) => {
    const el = document.querySelector(`input[type="${type}"]`) ?? (type === 'text' ? document.querySelector('input[maxlength="120"]') : null);
    assert.ok(el);
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  return { button, checkbox, click, input, path, calls, fail: value => { failure = value; }, saved: () => structuredClone(saved),
    visible: el => Boolean(el && !el.closest('[hidden]')),
    async edit() { await click(button(`Edit ${saved.goals[0].name}`)); },
    async save() { await click(button('Save goal')); },
    async reload() { await act(async () => root.unmount()); await open(); },
    async close() { await act(async () => root.unmount()); },
  };
}

test('parent selection displays inherited descendants, blocks unsavable exclusions, and saves only that placement', async () => {
  const h = await mount();
  try {
    await h.edit(); await h.click(h.checkbox('branch-a'));
    for (const id of ['shared-a', 'deep', 'deeper', 'deepest']) {
      assert.equal(h.checkbox(id).checked, true);
      assert.equal(h.checkbox(id).disabled, true);
      assert.match(h.checkbox(id).closest('label').textContent, /Included through/);
    }
    assert.match(h.checkbox('shared-a').closest('label').textContent, /Also selected directly/);
    await h.click(h.checkbox('deep'));
    assert.equal(h.checkbox('deep').checked, true);
    assert.equal(h.checkbox('shared-b').checked, false);
    await h.save();
    assert.deepEqual(h.saved().goals[0].official_topic_ids, ['shared-a', 'branch-a']);
    assert.equal(h.calls.find(call => call.name === 'save_placement_study_goal').args.p_official_topic_ids, undefined);
    await h.reload(); await h.edit();
    assert.equal(h.checkbox('deep').checked, true); assert.equal(h.checkbox('deep').disabled, true);
  } finally { await h.close(); }
});

test('deselecting a parent retains an existing explicit child and permits narrowing without changing other branches', async () => {
  const d = goalTopicTreeFixture(); d.goals[0].official_topic_ids = ['branch-a', 'shared-a', 'shared-b'];
  const h = await mount(d);
  try {
    await h.edit(); await h.click(h.checkbox('branch-a'));
    assert.equal(h.checkbox('branch-a').checked, false); assert.equal(h.checkbox('branch-a').indeterminate, true);
    assert.equal(h.checkbox('shared-a').checked, true); assert.equal(h.checkbox('shared-a').disabled, false);
    assert.equal(h.checkbox('deep').checked, true); assert.equal(h.checkbox('shared-b').checked, true);
    await h.click(h.checkbox('shared-a'));
    assert.equal(h.checkbox('deep').checked, false); assert.equal(h.checkbox('deep').disabled, false);
    await h.click(h.checkbox('deep'));
    await h.save();
    assert.deepEqual(h.saved().goals[0].official_topic_ids, ['shared-b', 'deep']);
  } finally { await h.close(); }
});

test('expand/collapse changes neither draft scope nor stored scope and preserves independent shared child structures', async () => {
  const h = await mount();
  try {
    await h.edit(); const original = h.saved();
    assert.equal(h.visible(h.checkbox('shared-a')), true);
    await h.click(h.button(`Collapse ${h.path('branch-a')}`));
    assert.equal(h.visible(h.checkbox('shared-a')), false);
    await h.click(h.button(`Expand ${h.path('branch-a')}`));
    assert.equal(h.visible(h.checkbox('shared-a')), true);
    await h.click(h.button(`Expand ${h.path('branch-b')}`));
    await h.click(h.button(`Expand ${h.path('shared-b')}`));
    assert.equal(h.visible(h.checkbox('b-child')), true);
    assert.equal(h.checkbox('b-child').checked, false);
    assert.equal(document.querySelectorAll(`input[aria-label="${h.path('deep')}"]`).length, 1);
    assert.deepEqual(h.saved(), original); assert.equal(h.calls.length, 1);
    await h.save(); assert.deepEqual(h.saved().goals[0].official_topic_ids, ['shared-a']);
  } finally { await h.close(); }
});

test('deeply nested direct choices restore ancestor expansion and exact saved scope after a fresh mount', async () => {
  const h = await mount();
  try {
    await h.edit(); await h.click(h.checkbox('shared-a'));
    for (const id of ['shared-a', 'deep', 'deeper']) {
      const expand = h.button(`Expand ${h.path(id)}`);
      if (expand) await h.click(expand);
    }
    await h.click(h.checkbox('deepest'));
    await h.save(); await h.reload(); await h.edit();
    assert.equal(h.visible(h.checkbox('deepest')), true);
    assert.equal(h.checkbox('deepest').checked, true);
    assert.equal(h.checkbox('root').indeterminate, true);
    assert.deepEqual(h.saved().goals[0].official_topic_ids, ['deepest']);
  } finally { await h.close(); }
});

test('search retains ancestor context, can collapse results, and never clears selections hidden by the search', async () => {
  const h = await mount();
  try {
    await h.edit(); await h.input('search', 'Acute priorities');
    assert.equal(h.visible(h.checkbox('root')), true);
    assert.equal(h.checkbox('branch-a'), undefined);
    assert.equal(h.visible(h.checkbox('b-child')), true);
    await h.click(h.button(`Collapse ${h.path('shared-b')}`));
    assert.equal(h.visible(h.checkbox('b-child')), false);
    await h.click(h.button(`Expand ${h.path('shared-b')}`)); await h.click(h.checkbox('b-child'));
    await h.input('search', 'no synthetic matches'); assert.match(document.body.textContent, /No matching Topics/);
    await h.save(); assert.deepEqual(h.saved().goals[0].official_topic_ids, ['shared-a', 'b-child']);
  } finally { await h.close(); }
});

test('official and personal identities stay distinct, with personal branch inheritance and no canonical-ID substitution', async () => {
  const h = await mount();
  try {
    await h.edit(); await h.click(h.checkbox('root', 'personal'));
    assert.equal(h.checkbox('root', 'personal').checked, true);
    assert.equal(h.checkbox('personal-child', 'personal').checked, true);
    assert.equal(h.checkbox('personal-child', 'personal').disabled, true);
    assert.equal(h.checkbox('root').checked, false);
    await h.save();
    assert.deepEqual(h.saved().goals[0].official_topic_ids, ['shared-a']);
    assert.deepEqual(h.saved().goals[0].personal_topic_ids, ['root']);
  } finally { await h.close(); }
});

test('editing and saving an existing Goal without selection changes preserves redundant and unavailable saved scopes', async () => {
  const d = goalTopicTreeFixture(); d.goals[0].official_topic_ids = ['root', 'deepest', 'unavailable-location'];
  d.goals[0].personal_topic_ids = ['root', 'personal-child']; d.goals[0].unavailable_topics = 1;
  const h = await mount(d);
  try {
    const before = h.saved().goals[0], forecast = model.goalForecast(before, d.today);
    await h.edit(); assert.match(document.body.textContent, /Some saved Topics are no longer available/);
    assert.equal(document.querySelector('input[aria-label="unavailable-location"]'), null);
    await h.save(); await h.reload(); await h.edit();
    const after = h.saved().goals[0];
    for (const key of ['name', 'deadline', 'objective', 'official_topic_ids', 'personal_topic_ids', 'progress']) assert.deepEqual(after[key], before[key]);
    assert.deepEqual(model.goalForecast(after, d.today), forecast);
    assert.equal(h.checkbox('deepest').checked, true);
  } finally { await h.close(); }
});

test('cancel and failed-save retry preserve existing Goals and retain the complete unsaved selection', async () => {
  const h = await mount();
  try {
    const before = h.saved();
    await h.edit(); await h.click(h.checkbox('branch-b')); await h.click(h.button('Cancel'));
    assert.deepEqual(h.saved(), before); assert.equal(h.calls.length, 1);
    await h.edit(); assert.equal(h.checkbox('branch-b').checked, false);
    await h.click(h.checkbox('branch-b')); h.fail(true); await h.save();
    assert.match(document.body.textContent, /Synthetic save failed/);
    assert.equal(h.checkbox('branch-b').checked, true); assert.deepEqual(h.saved(), before);
    h.fail(false); await h.save(); await h.reload(); await h.edit();
    assert.equal(h.checkbox('branch-b').checked, true);
    assert.deepEqual(h.saved().goals[0].official_topic_ids, ['shared-a', 'branch-b']);
  } finally { await h.close(); }
});

test('new parent-scope Goal persists and restores independently from the existing Goal', async () => {
  const h = await mount();
  try {
    const original = h.saved().goals[0];
    await h.click(h.button('New goal'));
    await h.input('text', 'Synthetic parent scope'); await h.input('date', '2026-12-31');
    await h.click(h.checkbox('branch-b')); await h.save(); await h.reload();
    assert.deepEqual(h.saved().goals[0], original);
    await h.click(h.button('Edit Synthetic parent scope'));
    assert.equal(h.checkbox('shared-b').checked, true); assert.equal(h.checkbox('shared-b').disabled, true);
    assert.equal(h.checkbox('shared-a').checked, false);
    assert.deepEqual(h.saved().goals[1].official_topic_ids, ['branch-b']);
  } finally { await h.close(); }
});

test('wire order and detached-Topic exclusion are preserved without a canonical graph fallback', () => {
  const data = goalTopicTreeFixture(), before = JSON.stringify(data.topics);
  const branch = tree.goalTopicBranches(data.topics);
  assert.deepEqual([...branch.children.get('official:root')].map(topic => topic.id), ['branch-a', 'branch-b']);
  assert.deepEqual([...branch.children.get('official:shared-a')].map(topic => topic.id), ['deep']);
  assert.deepEqual([...branch.children.get('official:shared-b')].map(topic => topic.id), ['b-child']);
  assert.equal(branch.byKey.has('official:canonical-shared'), false);
  assert.equal(branch.byKey.has('official:detached-location'), false);
  assert.equal(JSON.stringify(data.topics), before);
});

test('tree controls use native keyboard semantics, described inclusion and document scrolling; no sliders or Home mutations', async () => {
  const h = await mount();
  try {
    await h.edit();
    const arrow = h.button(`Collapse ${h.path('branch-a')}`);
    assert.equal(arrow.tagName, 'BUTTON'); assert.equal(arrow.type, 'button');
    assert.equal(arrow.getAttribute('aria-expanded'), 'true');
    assert.ok(document.getElementById(arrow.getAttribute('aria-controls')));
    arrow.focus(); assert.equal(document.activeElement, arrow);
    for (const box of document.querySelectorAll('input[type=checkbox]')) {
      assert.ok(box.getAttribute('aria-label'));
      for (const id of box.getAttribute('aria-describedby').split(' ')) assert.ok(document.getElementById(id));
    }
    assert.equal(document.querySelector('input[type=range]'), null);
    const cssSource = readFileSync('components/study-planner/StudyGoals.module.css', 'utf8');
    const topicStyles = cssSource.slice(cssSource.indexOf('.topics {'), cssSource.indexOf('.actions {'));
    assert.doesNotMatch(topicStyles, /max-height|overflow-y\s*:\s*(auto|scroll)/);
    assert.match(cssSource, /topicExpander:focus-visible/);
    assert.ok(h.calls.every(call => call.name === 'get_study_goals'));
  } finally { await h.close(); }
});
