import assert from 'node:assert/strict';
import test from 'node:test';
import { editor, nodes, text, button, expandChrome, question } from './fixtures/creator-question-workflow.mjs';
import { passiveQuestionImages } from './fixtures/question-media-authoring.mjs';

const plain = value => JSON.parse(JSON.stringify(value));
const concepts = [
  { id: 'primary', name: 'Primary', topicId: 'topic' },
  { id: 'related', name: 'Related', topicId: 'topic' },
  { id: 'other', name: 'Other', topicId: 'topic' },
];
function setup(options) {
  const h = editor(options);
  h.render().setActiveCreatorTab('questions');
  h.render().setQuestionConceptsByTopicId({ topic: concepts });
  return h;
}
function retained(e) {
  return plain({
    id: e.questionId, prompt: e.questionPrompt, answer: e.questionAnswer,
    promptFormat: e.questionPromptFormat, answerFormat: e.questionAnswerFormat,
    canonical: e.questionCanonicalRecord, media: e.questionMediaRecord,
    tags: e.questionTags, angle: e.questionTestingAngle, additional: e.questionAdditionalTestingAngles,
    saved: e.savedQuestionFingerprint, topic: e.questionTopicId,
    questionSelection: e.questionMarkdownState, answerSelection: e.answerMarkdownState,
  });
}

for (const role of ['admin', 'editor']) {
  test(`${role}: fresh entry and the single-Concept browsing effect never assign Primary`, () => {
    const h = editor({ role, editing: true });
    let e = h.render();
    assert.equal(e.questionConceptId, 'existing-concept', 'Content context may already be browsed');
    assert.equal(e.primaryQuestionConceptId, null);
    e.setActiveCreatorTab('questions');
    e.setQuestionConceptsByTopicId({ topic: [concepts[0]] });
    h.render(); h.runEffect('setQuestionConceptOptions(options)');
    e = h.render();
    assert.equal(e.questionConceptId, 'primary');
    assert.equal(e.primaryQuestionConceptId, null);
    assert.equal(e.isQuestionDirty, false);
    assert.match(text(e.tree), /No Primary Concept selected/);
    assert.equal(h.calls.length, 0);
  });

  test(`${role}: Concept-name selection replaces Primary and preserves only explicitly Related choices`, () => {
    const h = setup({ role });
    h.render().browseQuestionConcept('primary', 'topic');
    h.render().associateQuestionConcept('related', true);
    h.render().setQuestionPrompt('Keep Front'); h.render().setQuestionAnswer('Keep Answer');
    const before = retained(h.render());
    h.render().browseQuestionConcept('other', 'topic');
    let e = h.render();
    assert.equal(e.questionConceptId, 'other');
    assert.equal(e.primaryQuestionConceptId, 'other');
    assert.deepEqual(plain(e.questionRelatedConceptIds), ['related']);
    assert.deepEqual(retained(e), before);
    assert.equal(e.isQuestionDirty, true);
    e.browseQuestionConcept('related', 'topic'); e = h.render();
    assert.equal(e.primaryQuestionConceptId, 'related');
    assert.deepEqual(plain(e.questionRelatedConceptIds), [], 'the chosen Primary cannot also be Related');
    assert.equal(h.confirmations.length, 0); assert.equal(h.calls.length, 0);
  });

  test(`${role}: clearing associations preserves rich text, images, metadata, revision state and the leave guard`, async () => {
    let resets = 0;
    const images = { ...passiveQuestionImages(), dirty: true, guardActive: true,
      items: [{ placementId: 'image', altText: 'Synthetic image' }], reset() { resets++; } };
    const h = setup({ role, confirm: () => false, questionImages: images });
    h.render().browseQuestionConcept('primary', 'topic');
    h.render().associateQuestionConcept('related', true);
    let e = h.render();
    const fields = nodes(e.tree).filter(n => n.type?.name === 'QuestionMarkdownField');
    fields[0].props.onChange('**Front**', 'visual_markdown_v1');
    fields[1].props.onChange('1. literal answer', 'legacy');
    e.setQuestionTags([{ id: 'tag', name: 'Tag' }]);
    e.setQuestionTestingAngle('Application'); e.setQuestionAdditionalTestingAngles(['Recall']);
    e.setQuestionMarkdownState({ mode: 'preview', selectionStart: 2, selectionEnd: 7 });
    const before = retained(h.render());
    button(h.render().tree, 'Clear Concept associations').props.onClick();
    e = h.render();
    assert.equal(e.primaryQuestionConceptId, null);
    assert.deepEqual(plain(e.questionRelatedConceptIds), []);
    assert.deepEqual(retained(e), before); assert.equal(resets, 0);
    assert.equal(images.items.length, 1); assert.equal(e.isQuestionDirty, true);
    h.render().setActiveCreatorTab('search'); h.render();
    assert.equal(h.runShellGuard(), false);
    assert.deepEqual(retained(h.render()), before);
    await h.render().saveCurrentQuestion();
    assert.equal(h.calls.length, 0);
    assert.match(h.render().questionStatus.message, /Choose a topic and concept/);
    assert.deepEqual(retained(h.render()), before);
    h.runEffect('setQuestionConceptOptions(options)');
    assert.equal(h.render().primaryQuestionConceptId, null, 'browsing must not refill a cleared Primary');
  });

  test(`${role}: unchecking new Primary does not promote a Related Concept, but Make Primary is explicit`, () => {
    const h = setup({ role });
    h.render().associateQuestionConcept('primary', true);
    h.render().associateQuestionConcept('related', true);
    h.render().associateQuestionConcept('primary', false);
    let e = h.render();
    assert.equal(e.primaryQuestionConceptId, null);
    assert.deepEqual(plain(e.questionRelatedConceptIds), ['related']);
    e.makeQuestionConceptPrimary('related'); e = h.render();
    assert.equal(e.primaryQuestionConceptId, 'related');
    assert.deepEqual(plain(e.questionRelatedConceptIds), []);
    assert.equal(h.calls.length, 0);
  });

  test(`${role}: explicit New can start without a browsed Concept and retains the discard confirmation`, () => {
    let discard = false;
    const h = setup({ role, confirm: () => discard });
    assert.equal(button(h.render().tree, 'New Question').props.disabled, false);
    h.render().startNewQuestion();
    assert.equal(h.render().primaryQuestionConceptId, null);
    h.render().browseQuestionConcept('primary', 'topic');
    h.render().associateQuestionConcept('related', true);
    h.render().setQuestionPrompt('Retained Front'); h.render().setQuestionAnswer('Retained Answer');
    h.render().startNewQuestion();
    assert.equal(h.render().questionPrompt, 'Retained Front');
    assert.equal(h.render().primaryQuestionConceptId, 'primary');
    discard = true; h.render().startNewQuestion();
    const e = h.render();
    assert.equal(e.questionPrompt, ''); assert.equal(e.questionAnswer, '');
    assert.equal(e.primaryQuestionConceptId, null); assert.deepEqual(plain(e.questionRelatedConceptIds), []);
    assert.equal(e.questionConceptId, 'primary', 'browsing context is retained separately');
    assert.equal(e.isQuestionDirty, false); assert.equal(h.confirmations.length, 2);
  });

  test(`${role}: existing Question browsing and direct calls cannot replace or clear saved Primary`, () => {
    const h = setup({ role });
    h.render().selectExistingQuestion(question({ currentVersionId: 'version', promptFormat: 'legacy' }));
    h.render().setQuestionAnswer('Unsaved Answer');
    const before = retained(h.render());
    h.render().browseQuestionConcept('other', 'topic');
    h.render().makeQuestionConceptPrimary('related');
    h.render().associateQuestionConcept('primary', false);
    h.render().clearQuestionConceptAssociations();
    const e = h.render();
    assert.equal(e.primaryQuestionConceptId, 'primary');
    assert.deepEqual(plain(e.questionRelatedConceptIds), ['related']);
    assert.deepEqual(retained(e), before);
    assert.equal(e.questionConceptId, 'other'); assert.equal(e.questionId, 'q1');
    assert.ok(!nodes(e.tree).some(n => n.type === 'button' && text(n) === 'Clear Concept associations'));
    assert.equal(h.calls.length, 0);
  });

  test(`${role}: unknown Concept selection is rejected and available row controls are keyboard-native`, () => {
    const h = setup({ role });
    h.render().browseQuestionConcept('primary', 'topic');
    h.render().browseQuestionConcept('unavailable-or-wrong-library', 'other-topic');
    h.render().associateQuestionConcept('unavailable-or-wrong-library', true);
    assert.equal(h.render().primaryQuestionConceptId, 'primary');
    assert.equal(h.render().questionConceptId, 'primary'); assert.equal(h.render().questionTopicId, 'topic');
    h.render().setConceptPlacementStatus('ready');
    h.render().renderConceptCountControl({ id: 'topic', key: 'official:topic:topic', source: 'official', name: 'Topic', children: [] }, 'questions').props.onClick({ stopPropagation() {} });
    const tree = h.render().renderQuestionTopic({ id: 'topic', key: 'official:topic:topic', source: 'official', name: 'Topic', children: [] });
    const choice = nodes(tree).find(n => n.props?.['aria-label'] === 'Browse Questions for Other');
    assert.equal(choice.type, 'button'); assert.equal(choice.props.disabled, false);
    choice.props.onClick(); assert.equal(h.render().primaryQuestionConceptId, 'other');
    const primary = nodes(tree).find(n => n.props?.['aria-label'] === 'Associate Primary with Question');
    assert.equal(primary.type, 'input'); assert.equal(primary.props.type, 'checkbox');
    assert.equal(primary.props.disabled, false);
  });
}

test('in-flight save and stale callbacks cannot clear or replace the submitted associations', async () => {
  let finish;
  const h = setup({ response: name => name === 'save_question_with_format'
    ? new Promise(resolve => { finish = resolve; }) : undefined });
  h.render().browseQuestionConcept('primary', 'topic');
  h.render().associateQuestionConcept('related', true);
  h.render().setQuestionPrompt('Front'); h.render().setQuestionAnswer('Answer');
  const before = h.render(); const pending = before.saveCurrentQuestion();
  before.browseQuestionConcept('other', 'topic'); before.clearQuestionConceptAssociations();
  before.associateQuestionConcept('primary', false); before.makeQuestionConceptPrimary('related');
  assert.equal(h.render().primaryQuestionConceptId, 'primary');
  assert.deepEqual(plain(h.render().questionRelatedConceptIds), ['related']);
  finish({ data: null, error: { message: 'Disposable failure' } }); await pending;
  assert.equal(h.render().primaryQuestionConceptId, 'primary');
  assert.equal(h.render().questionAnswer, 'Answer'); assert.equal(h.render().isQuestionDirty, true);
});

test('learners retain their personal workspace and receive no official association controls', () => {
  const h = setup({ role: 'learner' }); const e = h.render();
  assert.equal(e.creationDestination, 'personal');
  assert.ok(!nodes(expandChrome(e.tree)).some(n => text(n) === 'Clear Concept associations'));
  e.clearQuestionConceptAssociations();
  assert.equal(h.render().primaryQuestionConceptId, null); assert.equal(h.calls.length, 0);
});
