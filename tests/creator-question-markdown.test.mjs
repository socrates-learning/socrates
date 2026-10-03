import assert from 'node:assert/strict';
import test from 'node:test';
import { editor, nodes, question, row, text, expandChrome } from './fixtures/creator-question-workflow.mjs';
import { questionField } from './fixtures/creator-role-workspaces.mjs';
import { passiveQuestionImages } from './fixtures/question-media-authoring.mjs';

const plain = value => JSON.parse(JSON.stringify(value));
const initial = { mode: 'write', selectionStart: 0, selectionEnd: 0 };
const state = { mode: 'preview', selectionStart: 2, selectionEnd: 6 };
const front = '## Question\n**Front** [link](https://example.test)', back = '> Answer\n- *Back*';
function setup(options) { const h = editor(options); h.render().setActiveCreatorTab('questions'); return h; }
function fields(h) { return nodes(h.render().tree).filter(n => n.type === questionField.QuestionMarkdownField); }
function select(h, tab) { nodes(h.render().tree).find(n => n.type?.name === 'CreatorStudioTabs').props.onSelect(tab); }
function snapshot(e) { return plain({ id: e.questionId, prompt: e.questionPrompt, answer: e.questionAnswer, primary: e.primaryQuestionConceptId, related: e.questionRelatedConceptIds, angle: e.questionTestingAngle, additional: e.questionAdditionalTestingAngles, tags: e.questionTags, dirty: e.isQuestionDirty, frontState: e.questionMarkdownState, backState: e.answerMarkdownState }); }

for (const role of ['admin', 'editor']) {
  test(`${role}: independent real fields, mode-only cleanliness, formatting dirty and Search/same-result preservation`, () => {
    const h = setup({ role, confirm: () => false }); h.render().selectExistingQuestion(question());
    assert.equal(fields(h).length, 2);
    fields(h)[0].props.onStateChange(state);
    assert.equal(h.render().isQuestionDirty, false);
    assert.deepEqual(plain(h.render().answerMarkdownState), initial);
    fields(h)[0].props.onChange(front, 'visual_markdown_v1'); fields(h)[1].props.onChange(back, 'visual_markdown_v1');
    fields(h)[1].props.onStateChange({ ...state, selectionStart: 0, selectionEnd: 2 });
    const before = snapshot(h.render()); assert.equal(before.dirty, true);
    select(h, 'search'); assert.equal(h.render().activeCreatorTab, 'search'); assert.equal(h.confirmations.length, 0);
    assert.deepEqual(snapshot(h.render()), before); assert.equal(h.render().isDirty, true);
    assert.equal(h.runShellGuard(), false);
    select(h, 'questions'); assert.deepEqual(snapshot(h.render()), before);
    select(h, 'search'); h.render().selectQuestionSearchResult(question());
    assert.equal(h.render().activeCreatorTab, 'questions'); assert.deepEqual(snapshot(h.render()), before);
    const confirmations = h.confirmations.length;
    select(h, 'search'); h.render().selectQuestionSearchResult(question({ id: 'other' }));
    assert.equal(h.confirmations.length, confirmations + 1); assert.deepEqual(snapshot(h.render()), before);
    assert.equal(h.calls.length, 0, 'Formatting, mode and harmless navigation perform no writes');
  });
  test(`${role}: new save preserves exact source, resets presentation, preserves approved context and explicit New defaults`, async () => {
    const h = setup({ role }); h.render().selectQuestionConcept('primary', 'topic');
    fields(h)[0].props.onChange('  ' + front + '  ', 'visual_markdown_v1'); fields(h)[1].props.onChange('\n' + back + '\n', 'visual_markdown_v1');
    fields(h).forEach(field => field.props.onStateChange(state));
    let e = h.render(); e.setQuestionRelatedConceptIds(['related']); e.setQuestionTestingAngle('Priority'); e.setQuestionAdditionalTestingAngles(['Safety']); e.setQuestionTags([{ id: 'tag', name: 'Tag' }]);
    await h.render().saveCurrentQuestion(); e = h.render();
    const saves = h.calls.filter(c => c.name === 'save_question_with_format'); assert.equal(saves.length, 1);
    assert.equal(saves[0].payload.p_payload.p_prompt, '  ' + front + '  '); assert.equal(saves[0].payload.p_payload.p_accepted_answers[0].answer_text, '\n' + back + '\n');
    assert.equal(e.questionPrompt, ''); assert.equal(e.questionAnswer, '');
    assert.deepEqual(plain(e.questionMarkdownState), initial); assert.deepEqual(plain(e.answerMarkdownState), initial);
    assert.equal(e.primaryQuestionConceptId, 'primary'); assert.deepEqual(plain(e.questionRelatedConceptIds), ['related']);
    assert.equal(e.questionTestingAngle, 'Priority'); assert.deepEqual(plain(e.questionAdditionalTestingAngles), ['Safety']); assert.equal(e.questionTags[0].id, 'tag');
    assert.equal(e.questionDifficulty, 'medium'); assert.equal(e.questionRecordStatus, 'published');
    e.startNewQuestion(); e = h.render(); assert.equal(e.questionTestingAngle, 'General Understanding'); assert.equal(e.questionTags.length, 0); assert.equal(e.questionRelatedConceptIds.length, 0);
  });
}
test('existing save preserves source/identity and view state; hydration resets only for a different identity', async () => {
  const h = setup(); h.render().selectExistingQuestion(question({ difficulty: 'hard', status: 'archived' }));
  fields(h)[0].props.onChange(front, 'visual_markdown_v1'); fields(h)[1].props.onChange(back, 'visual_markdown_v1'); fields(h)[1].props.onStateChange(state);
  await h.render().saveCurrentQuestion(); let e = h.render();
  assert.equal(e.questionPrompt, front); assert.equal(e.questionAnswer, back); assert.equal(e.questionId, 'q1'); assert.equal(e.isQuestionDirty, false);
  assert.deepEqual(plain(e.answerMarkdownState), state);
  const payload = h.calls.find(c => c.name === 'save_question_with_format').payload.p_payload;
  assert.equal(payload.p_status, 'archived'); assert.equal(payload.p_difficulty, 'hard');
  e.selectExistingQuestion(question({ id: 'q2', prompt: '**historical**', answer: '*existing*' })); e = h.render();
  assert.deepEqual(plain(e.questionMarkdownState), initial); assert.deepEqual(plain(e.answerMarkdownState), initial);
  assert.equal(e.questionPrompt, '**historical**'); assert.equal(e.questionAnswer, '*existing*');
});
test('failed and pending saves preserve both views and draft; duplicate submission remains one write', async () => {
  let release;
  const h = setup({ response: name => name === 'save_question_with_format' ? new Promise(resolve => { release = resolve; }) : undefined });
  h.render().selectQuestionConcept('primary', 'topic'); fields(h)[0].props.onChange(front, 'visual_markdown_v1'); fields(h)[1].props.onChange(back, 'visual_markdown_v1'); fields(h).forEach(f => f.props.onStateChange(state));
  const before = snapshot(h.render()), save = h.render().saveCurrentQuestion();
  await h.render().saveCurrentQuestion(); select(h, 'search'); assert.equal(h.render().activeCreatorTab, 'questions');
  assert.ok(fields(h).every(f => f.props.disabled));
  release({ data: null, error: { message: 'Synthetic failure' } }); await save;
  assert.deepEqual(snapshot(h.render()), before); assert.equal(h.calls.filter(c => c.name === 'save_question_with_format').length, 1);
});
test('formatting plus private images retains the existing controller and exact source payload, including uncertain-save lock', async () => {
  const saves = [], items = [{ placementId: 'front', surface: 'front' }, { placementId: 'answer', surface: 'answer' }];
  const images = { ...passiveQuestionImages(), async save(payload) { saves.push(payload); return { data: null, error: { message: 'Unconfirmed save' } }; } };
  const h = setup({ questionImages: images }); h.render().selectExistingQuestion(question());
  Object.assign(images, { items, usesMedia: true, entered: true, dirty: true });
  fields(h)[0].props.onChange(front, 'visual_markdown_v1'); fields(h)[1].props.onChange(back, 'visual_markdown_v1'); fields(h).forEach(f => f.props.onStateChange(state));
  const before = snapshot(h.render()); await h.render().saveCurrentQuestion();
  assert.equal(saves.length, 1); assert.equal(saves[0].p_prompt, front); assert.equal(saves[0].p_accepted_answers[0].answer_text, back);
  assert.equal(images.items, items); assert.deepEqual(snapshot(h.render()), before);
  assert.equal(h.calls.filter(c => c.name === 'save_question_with_format').length, 0);
  images.uncertain = true; assert.ok(fields(h).every(f => f.props.readOnly));
  const media = nodes(h.render().tree).filter(n => n.type?.name === 'QuestionImageAuthoring');
  assert.deepEqual(media.map(n => n.props.surface), ['front', 'answer']); assert.ok(media.every(n => n.props.controller === images));
});
test('raw-source search and compact result summaries retain identity; learner and personal fields do not opt in', async () => {
  const h = setup({ response: name => name === 'search_creator_questions_with_media' ? { data: [row({ prompt: front, prompt_format: 'visual_markdown_v1' })], error: null } : undefined });
  await h.render().loadQuestionSearchPage({ text: '**Front**', difficulty: '', primaryTestingAngle: '', additionalTestingAngle: '', primaryConceptId: '', relatedConceptId: '', status: '', tagId: '' }, null, false);
  assert.equal(h.calls[0].payload.p_search_text, '**Front**'); select(h, 'search');
  assert.match(text(expandChrome(h.render().tree)), /Question Front link/);
  const learner = setup({ role: 'learner' }); assert.equal(fields(learner).length, 0);
  const personal = setup(); personal.render().selectExistingQuestion(question({ id: 'mine-card', source: 'personal', conceptId: 'mine-concept' }));
  assert.equal(fields(personal).length, 0); assert.ok(nodes(personal.render().tree).some(n => n.type === 'textarea' && n.props['aria-label'] === 'Question front of card'));
});
