import assert from 'node:assert/strict';
import test from 'node:test';
import { articleEditor, question, conceptLink, nodes, text } from './fixtures/article-question-workflow.mjs';
const plain = value => JSON.parse(JSON.stringify(value));
function loaded(record, options = {}) { const h = articleEditor({ records: [record], ...options }); h.render().ensureQuestionForm(record); return h; }

test('legacy Article editing keeps the existing full versioned save contract', async () => {
  const record = question(), h = loaded(record);
  h.render().updateQuestionForm(record.id, f => ({ ...f, prompt: '  New legacy prompt  ', acceptedAnswers: f.acceptedAnswers.map(a => ({ ...a, answer_text: ' New legacy answer ' })), status: 'draft', sourceIds: ['source'] }));
  await h.render().saveQuestion(record.id);
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].name, 'save_question_with_version');
  assert.deepEqual(plain(h.calls[0].payload), { p_question_id: 'question', p_concept_id: 'concept', p_question_type: 'short_answer', p_prompt: 'New legacy prompt', p_explanation: 'Explanation', p_status: 'draft', p_review_article_concept_id: 'link', p_sort_order: 3, p_difficulty: 'medium', p_testing_angle: 'General Understanding', p_accepted_answers: [{ answer_text: 'New legacy answer', sort_order: 0 }], p_options: [], p_source_ids: ['source'], p_tag_ids: ['tag'] });
  assert.equal(h.render().questionForms.question, undefined); assert.equal(h.reads.length, 1);
});
for (const surface of ['front', 'answer', 'both']) test(`${surface} conversion locks all text replacement but preserves independent rendering markers and metadata`, async () => {
  const record = question({ prompt_format: surface !== 'answer' ? 'visual_markdown_v1' : 'legacy', question_accepted_answers: [{ id: 'answer', answer_text: '1. literal', answer_format: surface !== 'front' ? 'visual_markdown_v1' : 'legacy', sort_order: 0 }] });
  const h = loaded(record), before = plain(h.render().questionForms.question);
  const tree = h.render().renderQuestionEditor(record, conceptLink);
  assert.match(text(tree), /edited in Creator Studio/);
  const link = nodes(tree).find(n => n.type === 'a'); assert.equal(link.props.href, '/creator/concepts/concept?question=question'); assert.equal(link.props.target, '_blank'); assert.equal(link.props.rel, 'noopener noreferrer');
  const rendered = nodes(tree).filter(n => n.type?.name === 'MarkdownContent'); assert.deepEqual(rendered.map(n => n.props.format), [record.prompt_format, record.question_accepted_answers[0].answer_format]);
  assert.equal(nodes(tree).filter(n => n.type === 'textarea' && n.props.value === record.prompt).length, 0);
  h.render().updateQuestionForm(record.id, f => ({ ...f, prompt: 'Overwrite', prompt_format: 'legacy', question_type: 'multiple_choice', acceptedAnswers: [], options: [], explanation: 'Overwrite', tagIds: [], status: 'archived', review_article_concept_id: '', sourceIds: ['source'] }));
  const after = plain(h.render().questionForms.question);
  for (const key of ['prompt', 'prompt_format', 'question_type', 'acceptedAnswers', 'options', 'explanation', 'tagIds', 'current_version_id', 'updated_at']) assert.deepEqual(after[key], before[key], key);
  assert.equal(h.calls.length, 0);
  await h.render().saveQuestion(record.id);
  assert.deepEqual(plain(h.calls), [{ name: 'save_article_question_metadata', payload: { p_library_id: 'library', p_article_id: 'article', p_question_id: 'question', p_expected_version: 'version-1', p_expected_updated_at: '2026-10-03T12:00:00Z', p_patch: { status: 'archived', review_article_concept_id: null, source_ids: ['source'] } } }]);
  assert.equal(h.render().questionForms.question, undefined);
});

test('stale conversion and metadata conflicts preserve local forms without retrying a different write', async () => {
  for (const converted of [false, true]) {
    const record = question({ prompt_format: converted ? 'visual_markdown_v1' : 'legacy' });
    const h = loaded(record, { response: () => ({ data: null, error: new Error('Question changed. Reload.') }) });
    h.render().updateQuestionForm(record.id, f => ({ ...f, status: 'draft' }));
    const before = plain(h.render().questionForms.question); await h.render().saveQuestion(record.id);
    assert.deepEqual(plain(h.render().questionForms.question), before); assert.equal(h.calls.length, 1); assert.equal(h.reads.length, 0);
    assert.match(h.render().questionMessageByConcept.concept, /Question changed/);
  }
});
test('unconfirmed metadata readback cannot discard the author form', async () => {
  const record = question({ prompt_format: 'visual_markdown_v1' });
  const h = loaded(record, { response: () => ({ data: { id: 'question' }, error: null }) });
  await h.render().saveQuestion(record.id); assert.ok(h.render().questionForms.question); assert.equal(h.reads.length, 0); assert.match(h.render().questionMessageByConcept.concept, /could not be confirmed/);
});
test('loader retains each surface marker, source, answer identity and exact revision without writes', async () => {
  const record = question({ prompt_format: 'visual_markdown_v1' }), h = loaded(record);
  await h.render().loadQuestionBankForConcept('concept');
  const actual = plain(h.render().questionBanks.concept[0]);
  assert.equal(actual.prompt_format, 'visual_markdown_v1'); assert.equal(actual.question_accepted_answers[0].answer_format, 'legacy'); assert.equal(actual.question_accepted_answers[0].id, 'answer');
  assert.equal(actual.current_version_id, 'version-1'); assert.equal(actual.prompt, record.prompt); assert.equal(h.calls.length, 0);
  for (const column of ['prompt_format', 'answer_format', 'current_version_id', 'updated_at']) assert.ok(h.reads[0].columns.includes(column));
});
test('unsupported converted Question shapes remain read-only without a misleading editable destination', () => {
  const record = question({ prompt_format: 'visual_markdown_v1', question_type: 'multiple_choice' }), h = loaded(record);
  const tree = h.render().renderQuestionEditor(record, conceptLink);
  assert.equal(nodes(tree).filter(n => n.type === 'a').length, 0); assert.match(text(tree), /shape is read-only/); assert.equal(h.calls.length, 0);
});
