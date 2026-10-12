import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readAppearanceSource as readFileSync } from './fixtures/appearance.mjs';
import { editor, nodes, text, button, expandChrome, source, projectTagManagerPresentation } from './fixtures/creator-role-workspaces.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const plain = value => JSON.parse(JSON.stringify(value));
const css = readFileSync(new URL('../components/CreatorStudioV2Client.module.css', import.meta.url), 'utf8');
const marker = '\n/* Approved Tag Manager-only presentation;';
const tags = [
  { id: 'active-tag', name: 'Active vocabulary', slug: 'active-vocabulary', status: 'active' },
  { id: 'archived-tag', name: 'Retained vocabulary', slug: 'retained-vocabulary', status: 'archived' },
].map(tag => ({ ...tag, concept_tags: [{ count: 3 }], question_tags: [{ count: 5 }], article_tags: [{ count: 2 }] }));
function catalog(table, read) {
  assert.equal(table, 'tags');
  assert.equal(read.columns, 'id, name, slug, status, concept_tags(count), question_tags(count), article_tags(count)');
  assert.deepEqual(plain(read.options), { count: 'exact' });
  assert.deepEqual(plain(read.order), ['name', 'id']);
  assert.deepEqual(plain(read.range), [0, 49]);
  assert.deepEqual(plain(read.filters), []);
  return { data: tags, count: 2, error: null };
}
const manager = tree => nodes(expandChrome(tree)).find(node => node.props?.['aria-label'] === 'Tag Manager');
const rows = tree => nodes(tree).filter(node => node.type === 'tr').slice(1);
const settle = () => new Promise(resolve => setImmediate(resolve));

test('only the six approved Tag changes project to the exact frozen Question candidate', () => {
  const frozen = '36d71748ff6949355c418ff30b5812196d073116bf8daad38317c42adc173f2a';
  assert.equal(hash(projectTagManagerPresentation(source)), frozen);
  const unauthorized = source.replace('setDraftQuestionPrimaryId(null);', "setDraftQuestionPrimaryId('unapproved');");
  assert.notEqual(hash(projectTagManagerPresentation(unauthorized)), frozen);
  assert.throws(() => projectTagManagerPresentation(source.replace('onClick={() => void renameCatalogTag(tag)}', 'onClick={() => void deleteCatalogTag(tag)}')), /Exact Tag Manager presentation exception/);
});

test('the entire frozen Question stylesheet remains exact and every added selector is Tag-only', () => {
  assert.equal(css.split(marker).length, 2);
  assert.equal(hash(css.slice(0, css.indexOf(marker))), 'b9250dce1182f807c9c99dab3b2f6a16be8c0bcd959a2b41f626750d78b919dd');
  const flaggedMarker = '\n/* Approved staff Flagged-only presentation;';
  assert.equal(css.split(flaggedMarker).length, 2);
  const tagBlock = css.slice(css.indexOf(marker), css.indexOf(flaggedMarker));
  assert.equal(hash(tagBlock), '0eb831bc321ee36c79fd275fef6130c7450a11d2324398eebb5a21091faee1de', 'The complete frozen Tag presentation remains exact');
  const added = tagBlock.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of added.matchAll(/([^{}]+)\{/g)) {
    const selector = match[1].trim();
    if (!selector.startsWith('@media')) assert.ok(selector.startsWith('.tagManagerDesign'), selector);
  }
  for (const requirement of [':focus-visible', ':disabled', '@media (hover: hover)', 'prefers-reduced-motion: reduce', 'max-width: 1120px', 'max-width: 780px', 'max-width: 520px']) assert.ok(added.includes(requirement), requirement);
  assert.match(added, /overflow:\s*auto/);
  assert.match(added, /content:\s*attr\(data-label\)/);
});

for (const role of ['admin', 'editor']) {
  test(`${role}: the catalog starts open, preserves the bounded read, and exposes the four approved columns`, async () => {
    const h = editor({ role, readResponse: catalog });
    let e = h.render();
    assert.equal(e.tagPages.manager.open, true);
    assert.equal(e.tagPages.concept.open, false);
    assert.equal(e.tagPages.question.open, false);
    e.setActiveCreatorTab('tags');
    await h.render().loadTagBrowsePage('manager', '', 0); e = h.render();
    const body = manager(e.tree); assert.ok(body);
    for (const label of ['Tag Manager', 'Find a Tag', 'Create a New Tag', 'All Tags']) assert.ok(text(body).includes(label), label);
    const header = nodes(body).find(node => node.type === 'thead');
    assert.deepEqual(nodes(header).filter(node => node.type === 'th').map(text), ['Tag Name', 'Status', 'Used In', 'Actions']);
    assert.equal(nodes(body).filter(node => node.type === 'caption').length, 1);
    assert.equal(rows(body).length, 2);
    for (const [index, row] of rows(body).entries()) {
      assert.ok(nodes(row).find(node => node.type === 'th' && node.props.scope === 'row'));
      assert.match(text(row).replace(/\s+/g, ' '), /3 concepts.*5 questions.*2 articles/);
      for (const label of ['Rename', index === 0 ? 'Archive' : 'Reactivate', 'Delete Tag']) assert.equal(button(row, label).props.disabled, false);
    }
    assert.equal(h.reads.length, 1); assert.equal(h.calls.length, 0);
    assert.equal(nodes(body).some(node => node.type === 'select' || node.type === 'a'), false);
    assert.doesNotMatch(text(body), /Last Modified|Sort by|View details/);
  });

  test(`${role}: Hide and Close Browse remain reversible without changing a retained Question draft`, async () => {
    const h = editor({ role, readResponse: catalog }); let e = h.render();
    e.setActiveCreatorTab('questions'); e.setQuestionPrompt('Retain Front'); e.setQuestionAnswer('Retain Answer');
    e = h.render();
    const draft = () => {
      const current = h.render();
      return plain({ prompt: current.questionPrompt, answer: current.questionAnswer, tags: current.questionTags,
        primary: current.primaryQuestionConceptId, related: current.questionRelatedConceptIds,
        id: current.questionId, dirty: current.isQuestionDirty, revision: current.questionCanonicalRecord });
    };
    const before = draft();
    button(e.tree, 'Tags').props.onClick();
    await h.render().loadTagBrowsePage('manager', '', 0);
    button(manager(h.render().tree), 'Hide Browse').props.onClick();
    assert.equal(h.render().tagPages.manager.open, false);
    button(h.render().tree, 'Questions').props.onClick(); button(h.render().tree, 'Tags').props.onClick();
    assert.equal(h.render().tagPages.manager.open, false);
    button(manager(h.render().tree), 'Browse').props.onClick();
    assert.equal(h.render().tagPages.manager.open, true);
    button(manager(h.render().tree), 'Close Browse').props.onClick();
    assert.equal(h.render().tagPages.manager.open, false);
    assert.deepEqual(draft(), before); assert.equal(h.calls.length, 0); assert.equal(h.confirmations.length, 0);
  });
}

test('row actions preserve exact Rename/Archive/Reactivate/Delete identity and the server-provided impact confirmation', async () => {
  let confirm = false;
  const h = editor({ readResponse: catalog, prompt: () => 'Renamed vocabulary', confirm: () => confirm,
    response(name) { return { data: name === 'get_development_delete_summary' ? { warning: 'Delete this Tag and its 10 current associations permanently?' } : tags[0], error: null }; } });
  h.render().setActiveCreatorTab('tags'); await h.render().loadTagBrowsePage('manager', '', 0);
  let body = manager(h.render().tree);
  await button(rows(body)[0], 'Archive').props.onClick(); assert.equal(h.calls.length, 0);
  button(rows(body)[0], 'Delete Tag').props.onClick(); await settle();
  assert.deepEqual(plain(h.calls), [{ name: 'get_development_delete_summary', payload: { p_record_type: 'tag', p_record_id: 'active-tag' } }]);
  assert.equal(h.confirmations.at(-1), 'Delete this Tag and its 10 current associations permanently?');
  confirm = true;
  button(rows(manager(h.render().tree))[0], 'Rename').props.onClick(); await settle();
  button(rows(manager(h.render().tree))[0], 'Archive').props.onClick(); await settle();
  button(rows(manager(h.render().tree))[1], 'Reactivate').props.onClick(); await settle();
  button(rows(manager(h.render().tree))[0], 'Delete Tag').props.onClick(); await settle();
  assert.deepEqual(plain(h.calls.slice(1)), [
    { name: 'rename_catalog_tag', payload: { p_tag_id: 'active-tag', p_name: 'Renamed vocabulary' } },
    { name: 'archive_catalog_tag', payload: { p_tag_id: 'active-tag' } },
    { name: 'reactivate_catalog_tag', payload: { p_tag_id: 'archived-tag' } },
    { name: 'get_development_delete_summary', payload: { p_record_type: 'tag', p_record_id: 'active-tag' } },
    { name: 'delete_development_content', payload: { p_record_type: 'tag', p_record_id: 'active-tag' } },
  ]);
});

test('a pending mutation disables catalog actions and preserves visible error feedback', async () => {
  let finish;
  const h = editor({ readResponse: catalog, response: () => new Promise(resolve => { finish = resolve; }) });
  h.render().setActiveCreatorTab('tags'); await h.render().loadTagBrowsePage('manager', '', 0);
  h.render().setNewCatalogTagName('New vocabulary');
  button(manager(h.render().tree), 'Create Tag').props.onClick(); await settle();
  const body = manager(h.render().tree);
  for (const row of rows(body)) for (const action of nodes(row).filter(node => node.type === 'button')) assert.equal(action.props.disabled, true);
  assert.equal(button(body, 'Create Tag').props.disabled, true);
  finish({ data: null, error: { message: 'Creation unavailable' } }); await settle();
  const status = nodes(manager(h.render().tree)).find(node => node.props?.role === 'status' && node.props?.['aria-live'] === 'polite');
  assert.match(text(status), /Creation unavailable/); assert.equal(status.props['aria-live'], 'polite');
  assert.equal(button(manager(h.render().tree), 'Create Tag').props.disabled, false);
});

test('learner navigation never exposes the Manager or its initially open catalog', () => {
  const h = editor({ role: 'learner' }); const e = h.render();
  assert.equal(e.creatorAuthority.canManageTags, false);
  assert.equal(manager(e.tree), undefined);
  assert.equal(nodes(expandChrome(e.tree)).some(node => node.props?.role === 'tab' && text(node) === 'Tags'), false);
  assert.equal(h.reads.length, 0); assert.equal(h.calls.length, 0);
});
