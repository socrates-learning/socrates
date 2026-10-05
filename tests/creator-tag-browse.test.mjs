import assert from 'node:assert/strict';
import test from 'node:test';
import { editor, nodes, text, expandChrome, formatSaveResponse } from './fixtures/creator-role-workspaces.mjs';

const tag = (number, status = 'active') => ({ id: `tag-${number}`, name: `Tag ${String(number).padStart(3, '0')}`,
  slug: `tag-${number}`, status, concept_tags: [{ count: 1001 }], question_tags: [{ count: 1002 }], article_tags: [{ count: 1003 }] });
const catalog = Array.from({ length: 123 }, (_, i) => tag(i + 1, i === 121 ? 'archived' : 'active'));
const plain = value => JSON.parse(JSON.stringify(value));
function readCatalog(table, read) {
  assert.equal(table, 'tags');
  assert.deepEqual(plain(read.options), { count: 'exact' });
  assert.deepEqual(plain(read.order), ['name', 'id']);
  assert.ok(['id, name, slug, status', 'id, name, slug, status, concept_tags(count), question_tags(count), article_tags(count)'].includes(read.columns));
  assert.equal(read.range[1] - read.range[0], 49);
  let rows = catalog;
  for (const [key, op, value] of read.filters) {
    if (key === 'status') { assert.equal(op, 'active'); rows = rows.filter(row => row.status === op); }
    else if (key === 'id') { assert.ok(Array.isArray(op)); rows = rows.filter(row => op.includes(row.id)); }
    else { assert.equal(key, 'name'); assert.equal(op, 'imatch'); rows = rows.filter(row => new RegExp(value, 'i').test(row.name)); }
  }
  if (read.or) {
    const match = /^name\.imatch\.("(?:\\.|[^"\\])*"),slug\.imatch\.("(?:\\.|[^"\\])*")$/.exec(read.or);
    assert.ok(match, read.or); assert.equal(match[1], match[2]);
    const pattern = new RegExp(JSON.parse(match[1]), 'i');
    rows = rows.filter(row => pattern.test(row.name) || pattern.test(row.slug));
  }
  return { data: rows.slice(read.range[0], read.range[1] + 1), count: rows.length, error: null };
}
const panel = (tree, surface) => nodes(tree).find(node => node.props?.id === `${surface}-tag-browser`);
function button(tree, label) {
  const found = nodes(expandChrome(tree)).filter(n => n.type === 'button' && text(n).replace(/\s+/g, ' ').trim() === label);
  assert.equal(found.length, 1, label); return found[0];
}
const settle = () => new Promise(resolve => setImmediate(resolve));

for (const role of ['admin', 'editor']) for (const surface of ['concept', 'question']) {
  test(`${role}/${surface}: collapsed Browse, 50-row pages, out-of-page selection and no browsing writes`, async () => {
    const h = editor({ role, readResponse: readCatalog });
    let e = h.render(); if (surface === 'question') e.setActiveCreatorTab('questions'); e = h.render();
    const dirty = e.isDirty;
    assert.equal(e.tagPages[surface].open, false); assert.equal(panel(e.tree, surface), undefined);
    const toggle = nodes(e.tree).find(node => node.props?.['aria-controls'] === `${surface}-tag-browser`);
    assert.equal(toggle.props['aria-expanded'], false); toggle.props.onClick();
    await h.render().loadTagBrowsePage(surface, '', 0); e = h.render();
    assert.equal(e.tagPages[surface].tags.length, 50); assert.equal(e.tagPages[surface].total, 122);
    assert.equal(button(panel(e.tree, surface), 'Previous').props.disabled, true);
    assert.equal(e.isDirty, dirty); assert.equal(h.calls.length, 0);
    button(panel(e.tree, surface), 'Tag 001').props.onClick(); e = h.render();
    assert.equal(e[surface === 'concept' ? 'conceptTags' : 'questionTags'][0].id, 'tag-1');
    assert.equal(button(panel(e.tree, surface), 'Tag 001 (Added)').props.disabled, true);
    e.assignTag(surface, catalog[0]); assert.equal(h.render()[surface === 'concept' ? 'conceptTags' : 'questionTags'].length, 1);
    button(panel(h.render().tree, surface), 'Next').props.onClick();
    assert.equal(h.render().tagPages[surface].page, 1);
    await h.render().loadTagBrowsePage(surface, '', 1); e = h.render();
    assert.equal(e.tagPages[surface].tags[0].id, 'tag-51');
    assert.equal(e[surface === 'concept' ? 'conceptTags' : 'questionTags'][0].id, 'tag-1');
    assert.equal(e.isDirty, true); assert.equal(h.calls.length, 0);
    await e.loadTagBrowsePage(surface, 'tag-123', 0); e = h.render();
    assert.deepEqual(Array.from(e.tagPages[surface].tags, t => t.id), ['tag-123']);
    assert.ok(h.reads.at(-1).or.includes('slug.imatch.'));
    e.toggleTagBrowse(surface); assert.equal(h.render().tagPages[surface].open, false);
  });
}

test('Search/Add/Enter and Browse assign the same authoritative UUID, including beyond page one', async () => {
  const h = editor({ readResponse: readCatalog }); let e = h.render();
  e.setActiveCreatorTab('questions'); e = h.render();
  e.changeTagQuery('question', '  Tag   123  '); e = h.render();
  const input = nodes(e.tree).find(n => n.props?.list === 'question-tag-options');
  let prevented = false; input.props.onKeyDown({ key: 'Enter', preventDefault() { prevented = true; } });
  await settle(); e = h.render();
  assert.equal(prevented, true); assert.equal(e.questionTags[0].id, 'tag-123'); assert.equal(e.questionTagDraft, '');
  e.changeTagQuery('question', 'Tag 123'); await h.render().addTagByName('question');
  assert.equal(h.render().questionTags.length, 1); assert.match(h.render().questionTagStatus.message, /already added/);
  h.render().removeQuestionTag('tag-123'); h.render().assignTag('question', catalog.at(-1));
  assert.deepEqual(Array.from(h.render().questionTags, t => t.id), ['tag-123']); assert.equal(h.calls.length, 0);
  h.render().changeTagQuery('concept', 'Tag 123'); await h.render().addTagByName('concept');
  assert.deepEqual(Array.from(h.render().conceptTags, t => t.id), ['tag-123']);
});

test('literal input escapes regex and Data API grammar; read failures do not look like empty results', async () => {
  let fail = true;
  const h = editor({ readResponse(table) {
    assert.equal(table, 'tags');
    if (fail) return { data: null, count: null, error: { message: 'Catalog unavailable' } };
    return { data: [], count: 0, error: null };
  } });
  let e = h.render(); e.toggleTagBrowse('concept');
  const query = 'A*B%_\\(x).+?^$[a]{2}|" ,Café';
  await h.render().loadTagBrowsePage('concept', query, 0); e = h.render();
  const literal = JSON.stringify(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  assert.equal(h.reads.at(-1).or, `name.imatch.${literal},slug.imatch.${literal}`);
  assert.match(text(panel(e.tree, 'concept')), /Catalog unavailable/);
  assert.doesNotMatch(text(panel(e.tree, 'concept')), /0 Tags|No tags found/);
  fail = false; button(panel(e.tree, 'concept'), 'Retry').props.onClick(); await settle();
  assert.match(text(panel(h.render().tree, 'concept')), /No tags found/);
});

test('Manager count failures remain errors; complete counts and active/archived rows retain released actions', async () => {
  let incomplete = true;
  const h = editor({ readResponse(table, read) {
    const result = readCatalog(table, read);
    if (incomplete) result.data = result.data.map(row => ({ ...row, question_tags: undefined }));
    return result;
  } }); let e = h.render(); e.setActiveCreatorTab('tags'); e.toggleTagBrowse('manager');
  await h.render().loadTagBrowsePage('manager', '', 0); e = h.render();
  assert.match(text(panel(e.tree, 'manager')), /usage counts could not be confirmed/);
  assert.doesNotMatch(text(panel(e.tree, 'manager')), /0 questions|No tags found/);
  incomplete = false; await e.loadTagBrowsePage('manager', 'Tag 122', 0); e = h.render();
  const region = panel(e.tree, 'manager');
  assert.match(text(region).replace(/\s+/g, ' '), /archived.*1001 concepts.*1002 questions.*1003 articles/s);
  for (const label of ['Rename', 'Reactivate', 'Delete Tag']) assert.ok(button(region, label));
  assert.equal(h.reads.at(-1).filters.some(([key]) => key === 'status'), false);
});

test('stale page successes and failures cannot overwrite a newer query', async () => {
  const pending = [];
  const h = editor({ readResponse: (_table, read) => new Promise(resolve => pending.push({ read, resolve })) });
  h.render().toggleTagBrowse('concept');
  const old = h.render().loadTagBrowsePage('concept', 'old', 0); await settle();
  h.render().changeTagQuery('concept', 'new');
  const current = h.render().loadTagBrowsePage('concept', 'new', 0); await settle();
  pending[1].resolve({ data: [catalog[0]], count: 1, error: null }); await current;
  pending[0].resolve({ data: null, count: null, error: { message: 'Obsolete failure' } }); await old;
  assert.equal(h.render().tagPages.concept.tags[0].id, 'tag-1'); assert.equal(h.render().tagPages.concept.error, null);
  const previous = h.render().loadTagBrowsePage('concept', 'previous', 0); await settle();
  h.render().toggleTagBrowse('concept');
  pending[2].resolve({ data: [catalog[2]], count: 1, error: null }); await previous;
  assert.notEqual(h.render().tagPages.concept.tags[0]?.id, 'tag-3');
});

test('an exact-name lookup cannot assign into a subsequently reset draft or make concurrent duplicate reads', async () => {
  let resolve;
  const h = editor({ readResponse: () => new Promise(done => { resolve = done; }) });
  h.render().changeTagQuery('question', 'Tag 001');
  const result = h.render().addTagByName('question'); await settle();
  await h.render().addTagByName('question'); assert.equal(h.reads.length, 1);
  h.render().resetQuestionEditor(null); h.render();
  resolve({ data: [catalog[0]], count: 1, error: null }); await result;
  assert.equal(h.render().questionTags.length, 0); assert.equal(h.render().tagAssigning.question, false);
});

test('Concept Tag Browse and Prerequisites Browse are independent, including reset', async () => {
  const h = editor({ readResponse: readCatalog }); let e = h.render();
  e.setIsPrerequisiteBrowseOpen(true); e.toggleTagBrowse('concept'); e = h.render();
  assert.equal(e.isPrerequisiteBrowseOpen, true); assert.equal(e.tagPages.concept.open, true);
  e.toggleTagBrowse('concept'); e = h.render(); assert.equal(e.isPrerequisiteBrowseOpen, true);
  e.assignTag('concept', catalog[0]); e = h.render(); e.resetConceptEditor(['topic']); e = h.render();
  assert.equal(e.conceptTags.length, 0); assert.equal(e.prerequisites.length, 0);
  assert.deepEqual(Array.from(e.selectedTopicIds), ['topic']);
});

test('Tag-only changes stay dirty across Questions ↔ Search, with no write and intact global leave guard', () => {
  const h = editor({ confirm: () => false }); let e = h.render(); e.setActiveCreatorTab('questions');
  h.render().assignTag('question', catalog[0]); e = h.render(); assert.equal(e.isQuestionDirty, true);
  button(e.tree, 'Search').props.onClick(); e = h.render();
  assert.equal(e.activeCreatorTab, 'search'); assert.equal(e.isQuestionDirty, true); assert.equal(h.confirmations.length, 0);
  assert.equal(h.runShellGuard(), false); assert.equal(h.confirmations.length, 1);
  button(e.tree, 'Questions').props.onClick(); e = h.render();
  assert.deepEqual(Array.from(e.questionTags, t => t.id), ['tag-1']); assert.equal(h.calls.length, 0);
});

test('Question successful-create carry-forward and explicit New reset keep their released Tag policy', async () => {
  const h = editor({ editing: true, readResponse: readCatalog }); let e = h.render();
  e.resetQuestionEditor('existing-concept'); e = h.render(); e.assignTag('question', catalog[0]);
  e.setQuestionPrompt('ZZ Tag Question'); e.setQuestionAnswer('ZZ Tag Answer');
  await h.render().saveQuestion(); e = h.render();
  const save = h.calls.find(call => call.name === 'save_question_with_format');
  assert.deepEqual(Array.from(save.payload.p_payload.p_tag_ids), ['tag-1']);
  assert.equal(e.questionId, null); assert.equal(e.questionPrompt, ''); assert.equal(e.questionTags[0].id, 'tag-1'); assert.equal(e.isQuestionDirty, false);
  e.startNewQuestion(); e = h.render(); assert.equal(e.questionTags.length, 0);
});

test('Concept successful-create clears Tags while failure preserves selected UUIDs and draft', async () => {
  let fail = true;
  const h = editor({ readResponse: readCatalog, response(name, payload) {
    return fail ? { data: null, error: { message: 'Save failed' } } : formatSaveResponse(name, payload);
  } }); let e = h.render(); e.setConceptName('ZZ Tag Concept'); e.setConcept('Body'); e.setSelectedTopicIds(new Set(['topic'])); e.assignTag('concept', catalog[0]);
  await h.render().saveConcept(); e = h.render(); assert.equal(e.conceptTags[0].id, 'tag-1'); assert.equal(e.concept, 'Body'); assert.equal(e.isContentDirty, true);
  fail = false; await e.saveConcept(); e = h.render();
  assert.equal(e.conceptTags.length, 0); assert.deepEqual(Array.from(e.selectedTopicIds), ['topic']); assert.equal(e.concept, '');
  assert.ok(h.calls.filter(call => call.name === 'save_concept_with_format').every(call => call.payload.p_payload.p_tag_ids[0] === 'tag-1'));
});

test('catalog metadata refresh updates assignments by UUID without losing selections or dirtying loaded content', async () => {
  const h = editor({ readResponse: readCatalog }); let e = h.render(); e.setQuestionTags([{ ...catalog[0], name: 'Old label' }]);
  e = h.render(); e.resetQuestionEditor('concept', true); e = h.render(); assert.equal(e.isQuestionDirty, false);
  await e.loadTagCatalog(); e = h.render(); assert.equal(e.questionTags[0].name, 'Tag 001'); assert.equal(e.isQuestionDirty, false);
  assert.deepEqual(plain(h.reads.at(-1).filters), [['id', ['tag-1']]]);
  e.setQuestionTags([catalog[0], { ...catalog[0], id: 'missing-id' }]); await h.render().loadTagCatalog();
  assert.deepEqual(Array.from(h.render().questionTags, t => t.id), ['tag-1', 'missing-id']);
});

test('learner workspace and official Tag management denial stay unchanged', () => {
  const h = editor({ role: 'learner' }); const e = h.render();
  assert.equal(e.creatorAuthority.canManageTags, false);
  assert.equal(nodes(e.tree).filter(n => n.props?.['aria-controls']?.endsWith('-tag-browser')).length, 0);
  e.assignTag('question', catalog[0]); assert.equal(h.render().questionTags.length, 0);
  assert.equal(h.calls.length, 0); assert.equal(h.reads.length, 0);
});

test('Manager callbacks retain exact Create/Rename/Archive/Reactivate/Delete commands and confirmed deletion warning', async () => {
  const h = editor({ readResponse: readCatalog, prompt: () => 'Renamed Tag', response(name) {
    assert.ok(['create_catalog_tag', 'rename_catalog_tag', 'archive_catalog_tag', 'reactivate_catalog_tag',
      'get_development_delete_summary', 'delete_development_content'].includes(name));
    return { data: name === 'get_development_delete_summary' ? { warning: 'Existing permanent deletion warning' } : catalog[0], error: null };
  } });
  h.render().setNewCatalogTagName('  New   Tag  '); await h.render().createCatalogTag();
  await h.render().renameCatalogTag(catalog[0]);
  await h.render().setCatalogTagStatus(catalog[0], 'archived');
  await h.render().setCatalogTagStatus(catalog[0], 'active');
  await h.render().deleteCatalogTag(catalog[0]);
  assert.deepEqual(plain(h.calls), [
    { name: 'create_catalog_tag', payload: { p_name: 'New Tag' } },
    { name: 'rename_catalog_tag', payload: { p_tag_id: 'tag-1', p_name: 'Renamed Tag' } },
    { name: 'archive_catalog_tag', payload: { p_tag_id: 'tag-1' } },
    { name: 'reactivate_catalog_tag', payload: { p_tag_id: 'tag-1' } },
    { name: 'get_development_delete_summary', payload: { p_record_type: 'tag', p_record_id: 'tag-1' } },
    { name: 'delete_development_content', payload: { p_record_type: 'tag', p_record_id: 'tag-1' } },
  ]);
  assert.deepEqual(h.confirmations, ['Archive “Tag 001”? Existing assignments will be preserved.', 'Existing permanent deletion warning']);
});

test('selected-assignment metadata read failures remain visible in Content and Questions', async () => {
  const h = editor({ readResponse: () => ({ data: null, count: null, error: { message: 'Selected Tag read failed' } }) });
  h.render().setConceptTags([catalog[0]]); await h.render().loadTagCatalog();
  assert.match(text(expandChrome(h.render().tree)), /Selected Tag read failed/);
  h.render().setActiveCreatorTab('questions');
  assert.match(text(expandChrome(h.render().tree)), /Selected Tag read failed/);
});
