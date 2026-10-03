import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { editor, nodes, text, button, expandChrome, conceptVisualExpression, currentTabLabels, releasedStaffRenderHashes } from './fixtures/creator-role-workspaces.mjs';

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
    assert.deepEqual(tabs.map(n => n.props['aria-selected']), [true, false, false, false, false]);
    assert.ok(nodes(tree).some(n => n.props?.['aria-label'] === 'Creator Studio sections' && n.props.role === 'tablist'));
    const concept = nodes(tree).find(n => n.props?.['aria-label'] === 'Concept or explanation');
    assert.ok(concept); assert.equal(concept.props.readOnly, false);
    assert.equal(button(tree, 'Save Concept').props.disabled, false);
    assert.equal(button(tree, 'Library Organizer').props.disabled, false);
    assert.equal(h.calls.length, 0); assert.equal(h.reads.length, 0); assert.deepEqual(h.routes, []);
  });

  test(`${role}: Questions retains official authoring and classification; Library search lives in Search`, () => {
    const h = editor({ role, placed: true });
    button(h.render().tree, 'Questions').props.onClick();
    const e = h.render(); const tree = expandChrome(e.tree);
    assert.equal(e.activeCreatorTab, 'questions');
    assert.equal(e.questionSource, 'official');
    for (const label of ['Question front of card', 'Answer back of card', 'Question Topic Tree']) {
      assert.ok(nodes(tree).some(n => n.props?.['aria-label'] === label), label);
    }
    assert.ok(text(tree).includes('Testing Angles'));
    assert.equal(nodes(tree).filter(n => n.props?.['aria-label'] === 'Testing Angle selections').length, 1);
    assert.equal(nodes(tree).filter(n => n.type === 'strong' && text(n) === 'PRIMARY').length, 1);
    assert.equal(button(tree, 'Save Question').props.disabled, false);
    assert.ok(!nodes(tree).some(n => n.props?.['aria-label'] === 'Question status'));
    assert.ok(!nodes(tree).some(n => n.type === 'select' && nodes(n).some(child => child.type === 'option' && child.props.value === 'hard')));
    assert.ok(!nodes(tree).some(n => n.props?.className?.split(' ').includes('questionSearchPanel')));
    button(e.tree, 'Search').props.onClick();
    assert.ok(nodes(expandChrome(h.render().tree)).some(n => n.props?.className?.split(' ').includes('questionSearchPanel')));
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

// Frozen before Gate 3, at 2b59248. Original full fingerprints remain in the fixture.
function withoutNavigation(tree) {
  if (!tree || typeof tree !== 'object') return tree;
  if (Array.isArray(tree)) return tree.map(withoutNavigation);
  if (tree.props?.['aria-label'] === 'Creator Studio sections') return null;
  return {...tree, props:{...tree.props, children:withoutNavigation(tree.props?.children)}};
}
function fingerprint(tree) {
  return createHash('sha256').update(JSON.stringify(tree, (_key, value) => typeof value === 'function' ? `[function:${value.name}]` : value)).digest('hex');
}
// Project away only the approved Image extension, retaining the released hashes.
function withoutConceptImageExtension(tree) {
  if (!tree || typeof tree !== 'object') return tree;
  if (Array.isArray(tree)) return tree.filter(n => !n?.props?.['data-concept-image-action'] && n?.type?.name !== 'ConceptImageAuthoring').map(withoutConceptImageExtension);
  const props = { ...tree.props };
  delete props['data-concept-image-action'];
  props.children = withoutConceptImageExtension(props.children);
  return { ...tree, props };
}
const releasedBodies = {
  "content": "0b1c6a5bee83f737f6c236e384218ab464c50c7856652f9b568a8e337415eed0",
  "tags": "8dfd59d8dabb4640d7f114ca6dcdb8c6f61cb81df5047401dfa5e4a97f5e7299",
  "flagged": "3bbae02c9c5dd613573a76830f4c8d9863c4290e0c8248d7ff277f20f6061104"
};
for (const role of ['admin','editor']) test(`${role}: Content, Tags and Flagged bodies/callback wiring remain frozen`, () => {
 const h=editor({role,placed:true,projectOfficialTextEditor:true});
 for(const tab of ['content','tags','flagged']) {
  h.render().setActiveCreatorTab(tab);
  const rendered=expandChrome(h.render().tree);
  if(tab==='content') {
   assert.equal(nodes(rendered).filter(n=>n.props?.['data-concept-image-action']==='true').length,1);
   assert.equal(nodes(rendered).filter(n=>n.type?.name==='ConceptImageAuthoring').length,1);
  }
  const tree=tab==='content'?withoutConceptImageExtension(rendered):rendered;
  assert.equal(fingerprint(withoutNavigation(tree)),releasedBodies[tab],`${role}/${tab}`);
  const nav=nodes(tree).find(n=>n.props?.['aria-label']==='Creator Studio sections');
  assert.deepEqual(Array.from(nav.props.children, text),['Content','Questions','Tags','Flagged','Search']);
  // Remove only the approved fifth entry: the historical full tree must still match.
  nav.props.children=nav.props.children.slice(0,4);
  assert.equal(fingerprint(tree),releasedStaffRenderHashes[role][tab]);
 }
 assert.equal(releasedStaffRenderHashes[role].questions,'fcd03e32a744203c05acdcb2b11f4219c8ae239ad40e58fc81cb8efd7fc22b30');
});
const releasedLearner = {"questions": "1a5045046af27c7ad945bc7e903e6557ccccf1840e6640859cf0760a3f64d09a", "flagged": "2e08e60d643eab957e0135b2a516fae85a54bf2b306f8f257f6a765f1aaddcd6"};
test('learner full workspace fingerprints remain exact with only Questions and Flagged',()=>{
 const h=editor({role:'learner',placed:true});for(const tab of ['questions','flagged']){h.render().setActiveCreatorTab(tab);assert.equal(fingerprint(expandChrome(h.render().tree)),releasedLearner[tab]);}
});

test('staff preservation projects only the approved Concept visual-field expression with real source, format and media ownership', () => {
 for (const exact of ['value={concept} format={conceptFormat} flavor="concept"', 'memory={conceptVisualMemory} handle={conceptVisualHandle}', 'onMode={setEditorMode}', 'disabled={isSaving || conceptImages.pending} readOnly={isCurrentContentReadOnly}', 'onChange={(source, format) => { setConcept(source); setConceptFormat(format); setStatus(null); }}', 'onImage={creatorAuthority.canSaveConcept ? position => conceptImages.open(position) : undefined}', '<ConceptMediaContent markdown={concept} format={conceptFormat} conceptId={conceptId} libraryId={activeLibraryId} context={conceptImages.context} placements={conceptImages.items} />']) assert.ok(conceptVisualExpression.includes(exact), exact);
});
