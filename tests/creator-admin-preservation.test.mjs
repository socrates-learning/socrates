import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { editor, nodes, text, button, expandChrome, currentTabLabels, releasedStaffRenderHashes } from './fixtures/creator-role-workspaces.mjs';

// Freeze current staff presentation and callback wiring before the learner split.
// These are render/handler tests; browser layout and database enforcement are separate gates.
for (const role of ['admin', 'editor']) {
  test(`${role}: starts in Content with all four sections and writable Concept workspace`, () => {
    const h = editor({ role, placed: true }); const e = h.render();
    const tree = expandChrome(e.tree);
    assert.equal(e.activeCreatorTab, 'content');
    assert.equal(e.creationDestination, 'official');
    const tabs = nodes(tree).filter(n => n.props?.role === 'tab');
    assert.deepEqual(tabs.map(n => text(n)), currentTabLabels);
    assert.deepEqual(tabs.map(n => n.props['aria-selected']), [true, false, false, false]);
    assert.ok(nodes(tree).some(n => n.props?.['aria-label'] === 'Creator Studio sections' && n.props.role === 'tablist'));
    const concept = nodes(tree).find(n => n.props?.['aria-label'] === 'Concept or explanation');
    assert.ok(concept); assert.equal(concept.props.readOnly, false);
    assert.equal(button(tree, 'Save Concept').props.disabled, false);
    assert.equal(button(tree, 'Library Organizer').props.disabled, false);
    assert.equal(h.calls.length, 0); assert.equal(h.reads.length, 0); assert.deepEqual(h.routes, []);
  });

  test(`${role}: Questions retains search, official authoring and classification controls`, () => {
    const h = editor({ role, placed: true });
    button(h.render().tree, 'Questions').props.onClick();
    const e = h.render(); const tree = expandChrome(e.tree);
    assert.equal(e.activeCreatorTab, 'questions');
    assert.equal(e.questionSource, 'official');
    for (const label of ['Question front of card', 'Answer back of card', 'Question Topic Tree', 'Question status']) {
      assert.ok(nodes(tree).some(n => n.props?.['aria-label'] === label), label);
    }
    for (const label of ['Difficulty', 'Primary Testing Angle', 'Additional Testing Angle', 'Status']) assert.ok(text(tree).includes(label), label);
    assert.equal(button(tree, 'Save Question').props.disabled, false);
    assert.ok(nodes(tree).some(n => n.props?.className?.split(' ').includes('questionSearchPanel')));
    assert.equal(h.calls.length, 0, 'Changing tabs alone does not execute effects in this harness');
  });

  test(`${role}: Tags and Flagged retain distinct shared workspaces`, () => {
    const h = editor({ role, placed: true });
    button(h.render().tree, 'Tags').props.onClick();
    const tags = expandChrome(h.render().tree);
    assert.ok(nodes(tags).some(n => n.props?.['aria-label'] === 'Tag Manager'));
    assert.ok(nodes(tags).some(n => n.type === 'input' && n.props.placeholder === 'Search tags'));
    button(h.render().tree, 'Flagged').props.onClick();
    const flagged = nodes(expandChrome(h.render().tree)).find(n => n.type?.name === 'StudyCreatorFlaggedBrowser');
    assert.ok(flagged); assert.equal(flagged.props.ownerId, 'owner');
    assert.equal(flagged.props.neutralPresentation, true);
    assert.ok(flagged.props.material.cards.some(c => c.id === 'mine-card'));
  });

  test(`${role}: Add Custom Card keeps the tree and restores the existing Concept draft`, () => {
    const h = editor({ role, placed: true }); let e = h.render();
    e.setConcept('Preserved draft'); e = h.render();
    button(e.tree, 'Add Custom Card').props.onClick(); e = h.render();
    assert.equal(e.activeCreatorTab, 'content');
    assert.equal(e.creationDestination, 'official');
    assert.ok(nodes(e.tree).some(n => n.props?.['aria-label'] === 'Topic Tree'));
    const card = nodes(e.tree).find(n => n.type?.name === 'StandaloneCustomCardWorkspace');
    assert.ok(card); assert.equal(card.props.ownerId, 'owner'); assert.equal(card.props.canCreate, true);
    assert.equal(card.props.request.attachment.topicId, 'topic');
    assert.equal(nodes(e.tree).filter(n => n.props?.['aria-label'] === 'Concept or explanation').length, 0);
    card.props.onRequest(null); e = h.render();
    assert.equal(nodes(e.tree).find(n => n.props?.['aria-label'] === 'Concept or explanation').props.value, 'Preserved draft');
    assert.deepEqual(h.routes, []); assert.equal(h.calls.length, 0);
  });

  test(`${role}: Organizer and Back dispatch once; dirty navigation can be cancelled`, () => {
    const h = editor({ role, placed: true, confirm: () => false });
    button(h.render().tree, 'Library Organizer').props.onClick();
    assert.deepEqual(h.routes, ['/creator/libraries']);
    button(h.render().tree, '← Back').props.onClick();
    assert.deepEqual(h.routes, ['/creator/libraries', 'back-or-fallback']);
    h.render().setConcept('Unsaved draft');
    button(h.render().tree, 'Library Organizer').props.onClick();
    assert.equal(h.routes.length, 2);
    assert.deepEqual(h.confirmations, ['You have unsaved changes. Leave without saving?']);
  });

  test(`${role}: Card busy/discard guards preserve workspace until explicit confirmation`, () => {
    let approve = false;
    const h = editor({ role, placed: true, confirm: () => approve });
    button(h.render().tree, 'Add Custom Card').props.onClick(); let e = h.render();
    e.standaloneEditorRef.current.busy = true;
    assert.equal(e.closeStandaloneEditor(), false); assert.equal(h.confirmations.length, 0);
    e.standaloneEditorRef.current.busy = false; e.standaloneEditorRef.current.dirty = true;
    button(e.tree, 'Questions').props.onClick();
    assert.equal(h.render().activeCreatorTab, 'content'); assert.ok(h.render().standaloneRequest);
    assert.deepEqual(h.confirmations, ['Discard unsaved Card changes?']);
    approve = true; button(h.render().tree, 'Questions').props.onClick();
    assert.equal(h.render().activeCreatorTab, 'questions'); assert.equal(h.render().standaloneRequest, null);
  });

  test(`${role}: Topic dialog closes and returns focus once; drag/reorder remains wired`, () => {
    const h = editor({ role, placed: true }); let e = h.render();
    e.openAddDialog(); e = h.render(); assert.equal(e.dialogMode, 'add');
    e.closeTopicDialog(); assert.equal(h.render().dialogMode, null); assert.equal(h.focusTarget.count, 1);
    const interaction = nodes(e.tree).find(n => n.type?.name === 'CreatorTopicTreeInteraction');
    assert.ok(interaction); assert.equal(typeof interaction.props.onMove, 'function');
    assert.ok(nodes(e.tree).some(n => n.type?.name === 'TopicDragHandle'));
    assert.ok(button(e.tree, 'Move'));
  });
}

test('keyboard/pointer Topic positioning keeps its active accessibility and cancel/focus contract', () => {
  const source = readFileSync(new URL('../components/CreatorTopicTreeInteraction.tsx', import.meta.url), 'utf8');
  for (const pattern of [/aria-label="Move or reorder Topic"/, /aria-label=\{`Move or reorder \$\{node.name\}`\}/, /onPointerDown=/, /onKeyDown=/, /e.key === 'Escape'/, /onClick=\{cancel\}/, /focus\(/]) assert.match(source, pattern);
});

for (const role of ['admin', 'editor']) test(`${role}: full rendered section snapshots match the released staff baseline`, () => {
  const h = editor({ role, placed: true });
  for (const tab of ['content', 'questions', 'tags', 'flagged']) {
    h.render().setActiveCreatorTab(tab);
    const rendered = JSON.stringify(expandChrome(h.render().tree), (_key, value) =>
      typeof value === 'function' ? `[function:${value.name}]` : value);
    assert.equal(createHash('sha256').update(rendered).digest('hex'), releasedStaffRenderHashes[role][tab], `${role}/${tab}`);
  }
});
