import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { deriveCreatorCapabilities } from '../lib/creator-capabilities.ts';
import { loadConceptModule, hookHarness, jsx } from './fixtures/concept-media-authoring.mjs';
import { editor, nodes, question, text, settle } from './fixtures/creator-question-workflow.mjs';
import { currentRenderer } from './fixtures/official-authoring.mjs';

const plain = value => JSON.parse(JSON.stringify(value));
const target = { source: 'official', id: 'primary', name: 'Primary', relationship: 'Primary' };
const capability = (role = 'admin', userId = 'owner', activeLibraryId = 'library') => deriveCreatorCapabilities({
  role, userId, library: { activeLibraryId, canAccessActiveLibrary: true, canManageActiveLibrary: role !== 'learner' },
});
const record = (overrides = {}) => ({
  concept_id: 'primary', library_nodes: { library_id: 'library' },
  concepts: { id: 'primary', name: 'Persisted Primary', summary: 'Full summary', why_it_matters: 'Why this matters',
    body_markdown: '## Complete explanation\n\n**Bold** and *italic*.\n\n- One\n- Two\n\n> Quote\n\n[Reference](https://example.com)',
    body_format: 'visual_markdown_v1', content_source_notes: [
      { id: 'note', note: 'Page 7', learn_section_id: null, sources: { id: 'source', title: 'Source title', author: 'Author', url: 'https://example.com' } },
      { id: 'section-note', note: 'Not a direct attribution', learn_section_id: 'section', sources: { id: 'other', title: 'Section only', author: null, url: null } },
    ], ...overrides },
});
function database(response = { data: record(), error: null }) {
  const reads = [];
  return { reads, from(table) {
    const read = { table, filters: [] }; reads.push(read);
    const query = {
      select(value) { read.select = value; return query; },
      eq(name, value) { read.filters.push([name, value]); return query; },
      limit(value) { read.limit = value; return query; },
      abortSignal(signal) { read.signal = signal; return query; },
      maybeSingle() { return Promise.resolve(typeof response === 'function' ? response(read) : response); },
    };
    return query;
  } };
}
function setup(db = database()) {
  const hooks = hookHarness();
  const ConceptMediaContent = function ConceptMediaContent() {};
  const MarkdownContent = function MarkdownContent() {};
  const CreatorDialogShell = function CreatorDialogShell() {};
  const previewModule = loadConceptModule('components/creator/CreatorConceptPreview.tsx', {
    react: hooks.hooks, 'react/jsx-runtime': jsx, '@/lib/supabase': { supabase: db },
    '@/components/ConceptMediaContent': { __esModule: true, default: ConceptMediaContent },
    '@/components/MarkdownContent': { MarkdownContent }, './CreatorPresentationPrimitives': { CreatorDialogShell },
  });
  const props = { target, libraryId: 'library', capabilities: capability(), onClose() {} };
  return { ...previewModule, hooks, db, props, render: (extra = {}) => hooks.render(() => previewModule.default({ ...props, ...extra })) };
}
const signal = () => new AbortController().signal;

for (const role of ['admin', 'editor']) test(`${role}: exact Library-qualified persisted Concept and direct references load without any write`, async () => {
  const s = setup();
  const loaded = await s.loadConceptPreview(s.db, target, capability(role), 'library', signal());
  assert.equal(loaded.body, record().concepts.body_markdown);
  assert.equal(loaded.format, 'visual_markdown_v1');
  assert.equal(loaded.name, 'Persisted Primary'); assert.equal(loaded.summary, 'Full summary');
  assert.equal(loaded.whyItMatters, 'Why this matters');
  assert.deepEqual(plain(loaded.references), [{ id: 'note', title: 'Source title', author: 'Author', note: 'Page 7', url: 'https://example.com' }]);
  assert.equal(s.db.reads.length, 1); const read = s.db.reads[0];
  assert.equal(read.table, 'concept_placements'); assert.equal(read.limit, 1);
  assert.deepEqual(read.filters, [['concept_id', 'primary'], ['library_nodes.library_id', 'library']]);
  assert.match(read.select, /library_nodes!inner\(library_id\)/);
  assert.match(read.select, /body_markdown, body_format/);
  assert.doesNotMatch(read.select, /tags|prerequisites|versions/);
  assert.ok(read.signal instanceof AbortSignal);
});

test('learner and invalid Library/capability contexts perform no read', async () => {
  const s = setup();
  for (const [caps, library] of [[capability('learner'), 'library'], [capability(), 'other-library'],
    [capability(), ''], [{ ...capability(), official: { ...capability().official, saveQuestion: false } }, 'library']]) {
    await assert.rejects(s.loadConceptPreview(s.db, target, caps, library, signal()), /unavailable/);
  }
  assert.equal(s.db.reads.length, 0);
});

test('wrong Concept/Library, missing or ambiguous rows, bad format and read errors cannot become fallback content', async () => {
  const cases = [null, { ...record(), concept_id: 'other' }, record({ id: 'other' }),
    { ...record(), library_nodes: { library_id: 'elsewhere' } }, { ...record(), library_nodes: [] },
    { ...record(), concepts: [record().concepts, record({ id: 'other' }).concepts] }, record({ body_format: 'unknown' })];
  for (const data of cases) {
    const s = setup(database({ data, error: null }));
    await assert.rejects(s.loadConceptPreview(s.db, target, capability(), 'library', signal()), /unavailable/);
  }
  const s = setup(database({ data: record(), error: { message: 'Internal SQL/private detail' } }));
  await assert.rejects(s.loadConceptPreview(s.db, target, capability(), 'library', signal()), /^Error: Concept preview unavailable\.$/);
});

test('single joined array identities work; legacy source is passed unchanged, without Study normalization or conversion', async () => {
  const body = '## Stored\\n\\n**literal escaped source**\\n\\n1. literal';
  const row = record({ body_markdown: body, body_format: 'legacy' });
  row.concepts = [row.concepts]; row.library_nodes = [row.library_nodes];
  const s = setup(database({ data: row, error: null }));
  const result = await s.loadConceptPreview(s.db, target, capability(), 'library', signal());
  assert.equal(result.body, body); assert.equal(result.format, 'legacy');
  assert.ok(!s.db.reads[0].filters.some(([key]) => key.includes('status')), 'Staff read must not be limited to published Concepts');
});

test('personal preview reads the exact owner and selected Topic, keeps its Markdown/reference contract, and rejects foreign/stale records', async () => {
  const personal = { ...target, source: 'personal', topicId: 'personal-topic' };
  const data = { id: 'primary', owner_id: 'owner', topic_id: 'personal-topic', name: 'Owned', description: '## Personal\n\n**body**', source_reference: 'A personal source' };
  const s = setup(database({ data, error: null }));
  const result = await s.loadConceptPreview(s.db, personal, capability(), 'library', signal());
  assert.equal(result.body, data.description); assert.equal(result.format, 'legacy');
  assert.equal(result.references[0].note, data.source_reference);
  assert.equal(s.db.reads[0].table, 'personal_concepts');
  assert.deepEqual(s.db.reads[0].filters, [['id', 'primary'], ['owner_id', 'owner'], ['topic_id', 'personal-topic']]);
  for (const change of [{ owner_id: 'another-user' }, { id: 'different' }, { topic_id: 'moved' }]) {
    const foreign = setup(database({ data: { ...data, ...change }, error: null }));
    await assert.rejects(foreign.loadConceptPreview(foreign.db, personal, capability(), 'library', signal()), /unavailable/);
  }
});

test('preview uses the existing dialog and exact official media renderer; references remain safely attributed', async () => {
  const row = record(); row.concepts.content_source_notes.push({ id: 'unsafe', learn_section_id: null, note: '<script>literal</script>', sources: { id: 'unsafe-source', title: 'Unsafe link kept as text', author: null, url: 'javascript:alert(1)' } });
  const s = setup(database({ data: row, error: null }));
  let tree = s.render(); assert.equal(tree.type.name, 'CreatorDialogShell');
  assert.equal(tree.props.onClose, s.props.onClose); assert.match(text(tree), /Loading Concept/);
  assert.equal(s.db.reads.length, 0); s.hooks.effects(); await settle(); tree = s.render();
  const rendered = nodes(tree).find(n => n.type?.name === 'ConceptMediaContent');
  assert.deepEqual(plain(rendered.props), { markdown: row.concepts.body_markdown, format: 'visual_markdown_v1', conceptId: 'primary', libraryId: 'library' });
  assert.match(text(tree), /Persisted Primary/); assert.match(text(tree), /Full summary/); assert.match(text(tree), /Why this matters/);
  assert.match(text(tree), /Page 7/); assert.doesNotMatch(text(tree), /Section only/);
  const links = nodes(tree).filter(n => n.type === 'a'); assert.equal(links.length, 1);
  assert.equal(links[0].props.target, '_blank'); assert.equal(links[0].props.rel, 'noopener noreferrer');
  assert.match(text(tree), /Unsafe link kept as text/);
  assert.equal(nodes(tree).filter(n => n.type === 'script').length, 0);
  assert.equal(s.db.reads.length, 1);
  const html = currentRenderer()(rendered.props.markdown, 'concept', rendered.props.format);
  for (const tag of ['h2', 'strong', 'em', 'ul', 'blockquote', 'a']) assert.match(html, new RegExp('<' + tag + '[ >]'));
  s.hooks.cleanup();
});

test('personal rendering cannot invoke official media, and empty explanations have an honest empty state', async () => {
  const s = setup(database({ data: { id: 'primary', owner_id: 'owner', topic_id: 'p', name: 'Owned', description: '**Personal body**', source_reference: null }, error: null }));
  const props = { target: { ...target, source: 'personal', topicId: 'p' } };
  s.render(props); s.hooks.effects(); await settle(); const tree = s.render(props);
  assert.equal(nodes(tree).filter(n => n.type?.name === 'ConceptMediaContent').length, 0);
  assert.deepEqual(plain(nodes(tree).find(n => n.type?.name === 'MarkdownContent').props), { markdown: '**Personal body**' });
  s.hooks.cleanup();
  const empty = setup(database({ data: record({ body_markdown: null }), error: null }));
  empty.render(); empty.hooks.effects(); await settle();
  assert.match(text(empty.render()), /No explanation has been saved/); empty.hooks.cleanup();
});

test('switch/close cancels reads; an out-of-order result cannot replace a newer Concept or reopen a closed preview', async () => {
  const pending = [];
  const s = setup(database(read => new Promise(resolve => pending.push({ read, resolve }))));
  s.render(); s.hooks.effects();
  const other = { ...target, id: 'related', name: 'Related', relationship: 'Related' };
  assert.match(text(s.render({ target: other })), /Loading Concept/); s.hooks.effects();
  assert.equal(pending[0].read.signal.aborted, true);
  pending[1].resolve({ data: { ...record({ id: 'related', name: 'Newer Related' }), concept_id: 'related' }, error: null }); await settle();
  assert.match(text(s.render({ target: other })), /Newer Related/);
  pending[0].resolve({ data: record(), error: null }); await settle();
  assert.doesNotMatch(text(s.render({ target: other })), /Persisted Primary/);
  s.hooks.cleanup(); assert.equal(pending[1].read.signal.aborted, true);
});

test('changing actor or Library hides the previous result immediately and aborts its read', async () => {
  for (const extra of [{ capabilities: capability('editor', 'second') }, { libraryId: 'second', capabilities: capability('admin', 'owner', 'second') }]) {
    const s = setup(); s.render(); s.hooks.effects(); await settle(); assert.match(text(s.render()), /Persisted Primary/);
    assert.doesNotMatch(text(s.render(extra)), /Persisted Primary/); s.hooks.effects();
    assert.equal(s.db.reads[0].signal.aborted, true); s.hooks.cleanup();
  }
});

test('failed load offers a same-target retry without exposing internal errors', async () => {
  let attempts = 0;
  const s = setup(database(() => ++attempts === 1 ? { data: null, error: { message: 'private backend path' } } : { data: record(), error: null }));
  s.render(); s.hooks.effects(); await settle(); const error = s.render();
  assert.match(text(error), /could not be loaded/); assert.doesNotMatch(text(error), /private backend/);
  nodes(error).find(n => n.type === 'button' && text(n) === 'Retry').props.onClick();
  assert.match(text(s.render()), /Loading Concept/); s.hooks.effects(); await settle();
  assert.match(text(s.render()), /Persisted Primary/); assert.equal(attempts, 2);
  assert.deepEqual(s.db.reads[0].filters, s.db.reads[1].filters); s.hooks.cleanup();
});

function questionSetup(role = 'admin', editing = true) {
  const h = editor({ role, placed: true });
  let e = h.render(); e.setQuestionConceptsByTopicId({ topic: [{ id: 'primary', name: 'Primary' }, { id: 'related', name: 'Related' }, { id: 'other', name: 'Other' }] });
  e.setConceptPlacementStatus('ready'); e.setActiveCreatorTab('questions');
  e = h.render();
  if (editing) e.selectQuestionSearchResult(question({ currentVersionId: 'version', promptFormat: 'legacy', answerFormat: 'visual_markdown_v1', mediaHint: { versionId: 'version', front: true, answer: true } }));
  else { e.associateQuestionConcept('primary', true); e = h.render(); e.associateQuestionConcept('related', true); }
  return h;
}
function snapshot(h) {
  const e = h.render();
  return plain({ id: e.questionId, source: e.questionSource, front: e.questionPrompt, answer: e.questionAnswer,
    primary: e.primaryQuestionConceptId, related: e.questionRelatedConceptIds, formats: [e.questionPromptFormat, e.questionAnswerFormat],
    angles: [e.questionTestingAngle, e.questionAdditionalTestingAngles], tags: e.questionTags,
    canonical: e.questionCanonicalRecord, media: e.questionMediaRecord, fingerprint: e.currentQuestionFingerprint,
    saved: e.savedQuestionFingerprint, dirty: e.isQuestionDirty, browsed: e.questionConceptId, topic: e.questionTopicId,
    existing: e.existingQuestions, content: e.concept, contentDirty: e.isContentDirty });
}
function clickPreview(h, id = 'primary', source = 'official') {
  const button = h.render().renderQuestionConceptPreviewAction(source, id, id === 'primary' ? 'Primary' : 'Related');
  assert.ok(button); let stopped = false; button.props.onClick({ stopPropagation() { stopped = true; } }); assert.ok(stopped);
}
for (const role of ['admin', 'editor']) for (const editing of [false, true]) test(`${role}: ${editing ? 'saved' : 'new'} dirty Question is byte-identical after opening, switching and closing previews`, () => {
  const h = questionSetup(role, editing); let e = h.render();
  e.setQuestionPrompt('Unsaved Front **literal**'); e.setQuestionAnswer('Unsaved Answer'); e.setQuestionTags([{ id: 'tag', name: 'Tag', slug: 'tag', status: 'active' }]);
  e.setQuestionAdditionalTestingAngles(['Clinical Application']); const before = snapshot(h); assert.equal(before.dirty, true);
  const calls = h.calls.length, routes = h.routes.length, confirms = h.confirmations.length;
  assert.equal(h.render().questionConceptPreview, null, 'Selection alone never opens a preview');
  for (const id of ['primary', 'related']) {
    clickPreview(h, id); e = h.render();
    assert.equal(e.questionConceptPreview.target.id, id);
    assert.equal(e.questionConceptPreview.target.relationship, id === 'primary' ? 'Primary' : 'Related');
    assert.equal(nodes(e.tree).filter(n => n.type?.name === 'CreatorConceptPreview').length, 1);
    assert.deepEqual(snapshot(h), before);
  }
  h.render().closeQuestionConceptPreview(); assert.equal(h.render().questionConceptPreview, null);
  assert.deepEqual(snapshot(h), before); assert.equal(h.calls.length, calls); assert.equal(h.routes.length, routes); assert.equal(h.confirmations.length, confirms);
});

test('Primary context and disclosed selected rows offer View without changing names, checkboxes, counts or browsing', () => {
  const h = questionSetup(); let e = h.render();
  assert.ok(nodes(e.tree).some(n => n.props?.['aria-label'] === 'View Concept: Primary'), 'Primary accessible with tree collapsed');
  assert.equal(e.renderQuestionConceptPreviewAction('official', 'other', 'Other'), null);
  const topic = e.visibleTopicComposition.officialRoots[0]; e.renderConceptCountControl(topic, 'questions').props.onClick({ stopPropagation() {} }); e = h.render();
  const tree = e.renderUnifiedQuestionTopic(topic, 0);
  for (const name of ['Primary', 'Related']) {
    const preview = nodes(tree).find(n => n.props?.['aria-label'] === `View Concept: ${name}`);
    assert.equal(preview.type, 'button'); assert.equal(preview.props.type, 'button'); assert.equal(preview.props['aria-haspopup'], 'dialog');
    assert.ok(nodes(tree).find(n => n.props?.['aria-label'] === `Browse Questions for ${name}`));
    assert.ok(nodes(tree).find(n => n.props?.['aria-label'] === `Associate ${name} with Question`));
  }
  assert.equal(nodes(tree).find(n => n.props?.['aria-label'] === 'Associate Primary with Question').props.disabled, true);
  const before = snapshot(h); clickPreview(h); h.render().closeQuestionConceptPreview();
  e = h.render(); e.browseQuestionConcept('other', 'topic');
  assert.equal(h.render().questionConceptId, 'other'); assert.equal(h.render().primaryQuestionConceptId, before.primary);
  assert.equal(h.render().questionPrompt, before.front);
});

test('learner, unselected and foreign personal Concepts have no preview action; own personal preview is separate from its label', () => {
  const learner = questionSetup('learner', false);
  assert.equal(learner.render().renderQuestionConceptPreviewAction('official', 'primary', 'Primary'), null);
  assert.equal(nodes(learner.render().tree).filter(n => n.props?.['aria-haspopup'] === 'dialog' && text(n) === 'View Concept').length, 0);
  const h = questionSetup(); let e = h.render(); e.selectPersonalQuestionConcept('mine-concept', 'mine-topic'); e = h.render();
  const button = e.renderQuestionConceptPreviewAction('personal', 'mine-concept', 'Mine'); assert.ok(button);
  const before = snapshot(h); button.props.onClick({ stopPropagation() {} });
  assert.deepEqual(snapshot(h), before); assert.equal(h.render().questionConceptPreview.target.source, 'personal');
  assert.equal(e.renderQuestionConceptPreviewAction('personal', 'missing-owner', 'Other'), null);
  const topic = e.visibleTopicComposition.officialRoots[0].children.find(t => t.source === 'personal');
  e.renderConceptCountControl(topic, 'questions').props.onClick({ stopPropagation() {} }); e = h.render();
  const tree = e.renderUnifiedQuestionTopic(topic, 1);
  assert.equal(nodes(tree).filter(n => n.type === 'label').some(label => nodes(label).some(n => text(n) === 'View Concept')), false);
});

test('Question replacement, explicit New, Library/actor/workspace changes invalidate preview independently of draft guards', () => {
  const h = questionSetup(); clickPreview(h);
  const closePrevious = h.runEffect('closeQuestionConceptPreview()');
  h.render().setActiveCreatorTab('search');
  assert.equal(nodes(h.render().tree).filter(n => n.type?.name === 'CreatorConceptPreview').length, 0);
  closePrevious(); h.render().setActiveCreatorTab('questions'); assert.equal(h.render().questionConceptPreview, null);
  for (const change of [e => e.selectQuestionSearchResult(question({ id: 'q2' })), e => e.startNewQuestion()]) {
    clickPreview(h); const previous = h.render().questionConceptPreviewContext;
    const cleanup = h.runEffect('closeQuestionConceptPreview()'); change(h.render());
    assert.notEqual(h.render().questionConceptPreviewContext, previous); cleanup(); assert.equal(h.render().questionConceptPreview, null);
  }
  const source = readFileSync(new URL('../components/CreatorStudioV2Client.tsx', import.meta.url), 'utf8');
  assert.match(source, /const questionConceptPreviewContext = JSON\.stringify\(\[\s*activeLibraryId, creatorCapabilities\.subject\.userId, creatorAuthority\.role,\s*creatorAuthority\.canSaveQuestion, questionEditorIdentityKey\(questionEditorState\),\s*questionVisualGeneration, activeCreatorTab,/);
});

test('existing dialog Escape, Tab containment, focus restoration and bounded scrolling are reused', () => {
  const dom = new JSDOM('<button id="opener">View Concept</button><section><button id="close">Close</button><a href="https://example.com">Source</a></section>');
  const { document, KeyboardEvent } = dom.window; const hooks = hookHarness();
  const shell = loadConceptModule('components/creator/CreatorPresentationPrimitives.tsx', {
    react: hooks.hooks, 'react/jsx-runtime': jsx, './CreatorPresentationPrimitives.module.css': {},
  }, { document });
  const opener = document.querySelector('#opener'); opener.focus(); let closed = 0;
  const tree = hooks.render(() => shell.CreatorDialogShell({ title: 'Concept preview', titleId: 'preview', onClose() { closed++; }, children: null }));
  const section = tree.props.children; section.props.ref.current = document.querySelector('section'); hooks.effects();
  assert.equal(document.activeElement.id, 'close'); assert.equal(section.props.role, 'dialog'); assert.equal(section.props['aria-modal'], 'true');
  document.querySelector('a').focus(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true })); assert.equal(document.activeElement.id, 'close');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true })); assert.equal(document.activeElement.tagName, 'A');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })); assert.equal(closed, 1);
  hooks.cleanup(); assert.equal(document.activeElement, opener); dom.window.close();
  const css = readFileSync(new URL('../components/creator/CreatorPresentationPrimitives.module.css', import.meta.url), 'utf8');
  assert.match(css, /\.dialog \{[^}]*max-height: min\(760px, calc\(100vh - 40px\)\);[^}]*overflow: auto;/);
});
