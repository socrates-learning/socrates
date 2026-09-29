import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveCreatorCapabilities } from '../lib/creator-capabilities.ts';
import { canAccessCreatorRoute, resolveHomeCreatorEntry } from '../lib/creator-route-access.ts';
import { canPosition } from '../lib/creator-topic-positioning.ts';
import { editor, nodes, text, button, expandChrome, currentTabLabels } from './fixtures/creator-role-workspaces.mjs';

// This is the released BEFORE-state. Future Questions | Flagged UI and removal
// of the route allowlist are intentionally not asserted as existing behavior.
const userId = '11111111-1111-4111-8111-111111111111';
const library = { activeLibraryId: 'library', canAccessActiveLibrary: true, canManageActiveLibrary: false };

test('current learner admission needs the server allowlist; it never admits staff-only routes', () => {
  for (const learnerAllowlist of ['', userId]) {
    const context = { role: 'learner', userId, learnerAllowlist };
    assert.equal(canAccessCreatorRoute({ ...context, pathname: '/creator' }), Boolean(learnerAllowlist));
    for (const pathname of ['/creator/libraries', '/creator/articles', '/creator/unknown']) assert.equal(canAccessCreatorRoute({ ...context, pathname }), false);
    assert.deepEqual(resolveHomeCreatorEntry(context), { label: 'Creator Studio', href: '/creator' });
  }
});

test('learner backend personal-Concept capability remains separate from official authority', () => {
  const c = deriveCreatorCapabilities({ role: 'learner', userId, library });
  assert.equal(c.official.browsePublished, true);
  for (const [key, value] of Object.entries(c.official)) if (key !== 'browsePublished') assert.equal(value, false, key);
  for (const [key, value] of Object.entries(c.personal)) assert.equal(value, true, key);
  assert.equal(c.administration.manageUsersAndRoles, false);
  assert.equal(c.administration.manageLibraryMemberships, false);
  for (const role of ['editor', 'admin']) {
    const staff = deriveCreatorCapabilities({ role, userId, library: { ...library, canManageActiveLibrary: true } });
    for (const [key, value] of Object.entries(staff.official)) assert.equal(value, true, `${role}.${key}`);
    assert.equal(staff.administration.manageUsersAndRoles, role === 'admin');
  }
});

test('current learner starts in Content, sees four tabs and personal Concept authoring', () => {
  const h = editor({ role: 'learner', placed: true }); const e = h.render();
  const tree = expandChrome(e.tree);
  assert.equal(e.activeCreatorTab, 'content'); assert.equal(e.creationDestination, 'personal');
  assert.deepEqual(nodes(tree).filter(n => n.props?.role === 'tab').map(text), currentTabLabels);
  assert.equal(nodes(tree).find(n => n.props?.['aria-label'] === 'Concept or explanation').props.readOnly, false);
  assert.equal(button(tree, 'Save Concept').props.disabled, false);
  assert.equal(button(tree, 'Library Organizer').props.disabled, true);
  assert.ok(button(tree, 'Add Custom Card'));
  assert.equal(h.calls.length, 0); assert.equal(h.reads.length, 0); assert.deepEqual(h.routes, []);
});

test('current learner Tags are visible but catalog mutations are disabled; Flagged is owner-scoped', () => {
  const h = editor({ role: 'learner', placed: true });
  button(h.render().tree, 'Tags').props.onClick();
  const tree = expandChrome(h.render().tree);
  assert.ok(nodes(tree).some(n => n.props?.['aria-label'] === 'Tag Manager'));
  assert.equal(button(tree, 'Create Tag').props.disabled, true);
  button(h.render().tree, 'Flagged').props.onClick();
  const flagged = nodes(expandChrome(h.render().tree)).find(n => n.type?.name === 'StudyCreatorFlaggedBrowser');
  assert.equal(flagged.props.ownerId, 'owner'); assert.equal(flagged.props.neutralPresentation, true);
  assert.equal(h.calls.length, 0);
});

test('existing Concept-backed personal Cards remain editable under their original identities', () => {
  const h = editor({ role: 'learner', placed: true }); let e = h.render();
  e.openPersonalConcept('mine-concept'); e = h.render();
  assert.equal(e.conceptEditorState.identity.key, 'personal:concept:mine-concept');
  assert.equal(e.concept, 'Original body');
  e.selectExistingQuestion({ source: 'personal', id: 'mine-card', conceptId: 'mine-concept' }); e = h.render();
  assert.equal(e.questionEditorState.identity.key, 'personal:card:mine-card');
  assert.equal(e.personalQuestionConceptId, 'mine-concept');
  assert.equal(e.questionPrompt, 'Personal Question'); assert.equal(e.questionAnswer, 'Original answer');
  assert.equal(e.isCurrentQuestionReadOnly, false); assert.equal(e.standaloneRequest, null);
  assert.equal(h.calls.length, 0);
});

test('standalone search currently opens Content with the canonical tree and no synthetic Concept', () => {
  const h = editor({ role: 'learner', placed: true }); let e = h.render();
  e.setStandaloneCards([{ id: 'standalone', owner_id: 'owner', concept_id: null, library_node_id: 'topic', library_id: 'library', personal_topic_id: null, question: 'Standalone front', answer: 'Back' }]);
  e.setActiveCreatorTab('questions'); e = h.render();
  e.selectExistingQuestion({ source: 'personal', id: 'standalone', conceptId: null }); e = h.render();
  assert.equal(e.activeCreatorTab, 'content'); assert.equal(e.standaloneRequest.card.concept_id, null);
  assert.equal(e.standaloneRequest.attachment.topicId, 'topic');
  assert.ok(nodes(e.tree).some(n => n.props?.['aria-label'] === 'Topic Tree'));
  assert.ok(nodes(e.tree).some(n => n.type?.name === 'StandaloneCustomCardWorkspace'));
  assert.deepEqual(h.routes, []); assert.equal(h.calls.length, 0);
});

test('learner positioning distinguishes canonical, own personal, and another owner even with matching raw IDs', () => {
  const official = { id: 'same', key: 'official:topic:same', source: 'official', parentKey: 'official:topic:root' };
  const own = { id: 'same', key: 'personal:topic:same', source: 'personal', ownerId: 'owner', parentKey: null, placementKey: 'official:topic:same' };
  const foreign = { ...own, id: 'foreign', key: 'personal:topic:foreign', ownerId: 'other' };
  const context = { libraryId: 'library', ownerId: 'owner', canManageOfficial: false, nodes: [official, own, foreign] };
  assert.equal(canPosition(context, official), false);
  assert.equal(canPosition(context, own), true);
  assert.equal(canPosition(context, foreign), false);
});

test('learner cannot bypass official save guards by supplying an official editor identity', async () => {
  const h = editor({ role: 'learner', placed: true, editing: true }); let e = h.render();
  e.setConceptEditorState({ mode: 'new-official-concept', source: 'official', kind: 'concept', libraryId: 'library' });
  e.setConcept('Forged official draft');
  await assert.rejects(h.render().saveCurrentConcept(), /not permitted/);
  e = h.render(); e.setQuestionEditorState({ mode: 'new-official-question', source: 'official', kind: 'question', libraryId: 'library' });
  e.setQuestionPrompt('Forged question'); e.setQuestionAnswer('Answer');
  await assert.rejects(h.render().saveCurrentQuestion(), /not permitted/);
  assert.equal(h.calls.length, 0);
});
