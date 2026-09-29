import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { editor, button, source } from './fixtures/creator-role-workspaces.mjs';

for (const kind of ['Concept', 'Question']) for (const dirty of [false, true]) {
  test(`${kind} ${dirty ? 'dirty' : 'clean'}: existing guarded navigation owns confirmation`, () => {
    const h = editor({ confirm: () => false }); let e = h.render();
    if (kind === 'Question') { button(e.tree, 'Questions').props.onClick(); e = h.render(); e.selectQuestionConcept('concept'); e = h.render(); }
    if (dirty) { if (kind === 'Concept') e.setConcept('Unsaved Concept'); else e.setQuestionPrompt('Unsaved Question'); }
    e = h.render(); assert.equal(e.isDirty, dirty);
    // These destinations execute the existing handler. They are not claims that
    // Creator already renders global Stats/Account links.
    for (const destination of ['/', '/#stats', '/account']) e.navigateFromCreator(destination);
    assert.equal(h.routes.length, dirty ? 0 : 3); assert.equal(h.confirmations.length, dirty ? 3 : 0);
    const cleanup = h.runUnloadEffect(); assert.equal(h.listeners.has('beforeunload'), dirty);
    if (dirty) { let prevented = 0; const event = { preventDefault: () => prevented++ }; h.listeners.get('beforeunload')(event); assert.equal(prevented, 1); assert.equal(event.returnValue, ''); cleanup(); }
    assert.equal(h.listeners.size, 0);
  });
}
for (const state of ['clean', 'dirty', 'busy']) test(`standalone ${state}: existing route and tab guard without synthetic generic dirty state`, () => {
  const h = editor({ placed: true, confirm: () => false }); button(h.render().tree, 'Add Custom Card').props.onClick(); let e = h.render();
  e.standaloneEditorRef.current = { dirty: state === 'dirty', busy: state === 'busy' };
  assert.equal(e.isDirty, false); h.runUnloadEffect(); assert.equal(h.listeners.has('beforeunload'), false, 'Existing standalone history/reload guard gap is recorded, not repaired');
  e.navigateFromCreator('/account');
  assert.equal(h.routes.length, state === 'clean' ? 1 : 0);
  assert.equal(h.confirmations.length, state === 'dirty' ? 1 : 0);
  if (state !== 'clean') { button(h.render().tree, 'Questions').props.onClick(); assert.equal(h.render().activeCreatorTab, 'content'); assert.ok(h.render().standaloneRequest); }
});
test('confirmed standalone discard closes once then navigates; busy blocks without confirmation', () => {
  const h = editor({ placed: true }); button(h.render().tree, 'Add Custom Card').props.onClick(); const e = h.render();
  e.standaloneEditorRef.current = { dirty: true, busy: false }; e.navigateFromCreator('/');
  assert.deepEqual(h.routes, ['/']); assert.deepEqual(h.confirmations, ['Discard unsaved Card changes?']); assert.equal(h.render().standaloneRequest, null);
});
test('internal staff tabs retain Concept draft without prompting or saving', () => {
  const h = editor({ confirm: () => false }); h.render().setConcept('Draft'); button(h.render().tree, 'Questions').props.onClick();
  assert.equal(h.render().activeCreatorTab, 'questions'); assert.equal(h.confirmations.length, 0); assert.deepEqual(h.calls, []);
  button(h.render().tree, 'Content').props.onClick(); assert.equal(h.render().concept, 'Draft'); assert.equal(h.render().isDirty, true);
});
test('existing header/history gaps and absent Creator Logout are explicit baseline limitations', () => {
  const header = readFileSync(new URL('../components/Header.tsx', import.meta.url), 'utf8');
  assert.match(header, /href="\/"/); assert.doesNotMatch(header, /confirm\(|closeStandaloneEditor|navigateFromCreator/);
  assert.doesNotMatch(source, /addEventListener\(['"](?:popstate|hashchange)['"]/);
  assert.doesNotMatch(source, /function handleLogout|Log Out/);
  assert.match(source, /if \(!isDirty\) return;[\s\S]*function warnBeforeUnload/);
  // Creator has no current Logout/global Stats/Account control. Future shell
  // controls must not interpret those absent paths as already guarded.
});
