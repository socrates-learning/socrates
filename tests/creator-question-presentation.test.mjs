import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { editor, nodes, text, button, expandChrome, source } from './fixtures/creator-question-workflow.mjs';
import { mountVisualField, projectQuestionPresentation, projectTagManagerPresentation } from './fixtures/creator-role-workspaces.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
const plain = value => JSON.parse(JSON.stringify(value));
const css = read('components/CreatorStudioV2Client.module.css');
const marker = '\n/* Approved Question-only presentation;';

// Frozen from released 21e8185, not generated from the candidate at test runtime.
test('Question presentation projects to the complete released Creator source; all handlers and persistence stay exact', () => {
  assert.equal(hash(projectQuestionPresentation(projectTagManagerPresentation(source))), '893b9c4d7401914c4364d9f2b3ce8793db22d7ff49976f37080cc471a01a74c9');
  const unrelatedEdit = source.replace('setDraftQuestionPrimaryId(null);', "setDraftQuestionPrimaryId('unapproved');");
  assert.notEqual(hash(projectQuestionPresentation(projectTagManagerPresentation(unrelatedEdit))), '893b9c4d7401914c4364d9f2b3ce8793db22d7ff49976f37080cc471a01a74c9');
});
test('only the optional presentation prop changes the Question wrapper; session, format and default behavior stay exact', () => {
  let wrapper = read('components/creator/QuestionMarkdownField.tsx');
  const changes = [
    ['handle, documentKey, presentation }: {', 'handle, documentKey }: {'],
    ["documentKey: string; presentation?: 'compact';", 'documentKey: string;'],
    ['<OfficialVisualField presentation={presentation} label={label}', '<OfficialVisualField label={label}'],
  ];
  for (const [approved, released] of changes) {
    assert.equal(wrapper.split(approved).length, 2); wrapper = wrapper.replace(approved, released);
  }
  assert.equal(hash(wrapper), '692621d290acb2d654851b8fc96467741bd94a10d3abe96eff61572408aea0eb');
});
test('the released stylesheet is byte-exact and every new rule is scoped to Questions', () => {
  assert.equal(css.split(marker).length, 2);
  assert.equal(hash(css.slice(0, css.indexOf(marker))), '96fb4f7d505b8311f846497b74c485f253a1ee54b8acb6717d7691c7371dd9ca');
  const tagMarker = '\n/* Approved Tag Manager-only presentation;';
  assert.equal(css.split(tagMarker).length, 2);
  const questionBlock = css.slice(css.indexOf(marker), css.indexOf(tagMarker));
  assert.equal(hash(questionBlock), '82099fae48f2a3ee895ae511588ecb508e26d80491e502673e70c58a73304415');
  const added = questionBlock.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of added.matchAll(/([^{}]+)\{/g)) {
    const selector = match[1].trim();
    if (selector.startsWith('@media')) continue;
    assert.ok(selector.startsWith('.questionDesign'), selector);
  }
  for (const selector of ['.questionField', '.questionAssociationRow', '.questionAssociationLabel', '.questionAngles', '.questionAngleRow', '.questionListItem', '.topicChip', '[data-question-image-authoring]', '.bottomActions', '.status']) assert.ok(added.includes(selector), selector);
  assert.match(added, /@media \(hover: hover\)/); assert.match(added, /:focus-visible/);
  assert.match(added, /button:disabled/); assert.match(added, /prefers-reduced-motion: reduce/);
  assert.match(added, /max-width: 1120px/); assert.match(added, /max-width: 780px/); assert.match(added, /max-width: 520px/);
  assert.doesNotMatch(added, /(?:^|\n)\s*(?:body|html|:root|\.contentDesign|\.staffWorkspace)\s*[,{]/);
});

function draft(e) {
  return plain({ prompt: e.questionPrompt, answer: e.questionAnswer, promptFormat: e.questionPromptFormat,
    answerFormat: e.questionAnswerFormat, primary: e.primaryQuestionConceptId, related: e.questionRelatedConceptIds,
    tags: e.questionTags, angle: e.questionTestingAngle, additional: e.questionAdditionalTestingAngles,
    id: e.questionId, canonical: e.questionCanonicalRecord, media: e.questionMediaRecord,
    fingerprint: e.currentQuestionFingerprint, modes: [e.questionMarkdownState, e.answerMarkdownState] });
}
for (const role of ['admin', 'editor']) {
  test(`${role}: complete Questions body opts in without styling Content, Tags, Flagged or Search`, () => {
    const h = editor({ role, placed: true }); h.render().setActiveCreatorTab('questions');
    let e = h.render(), tree = expandChrome(e.tree);
    const body = nodes(tree).find(n => n.props?.className === 'questionDesign'); assert.ok(body);
    for (const label of ['Question / Answer', 'Topic Tree', 'Additional Options', 'Testing Angles', 'Tags', 'Existing Questions', 'New Questions are saved as Published']) assert.ok(text(body).includes(label), label);
    const fields = nodes(e.tree).filter(n => n.type?.name === 'QuestionMarkdownField');
    assert.deepEqual(fields.map(n => n.props.presentation), ['compact', 'compact']);
    assert.deepEqual(fields.map(n => n.props.label), ['Question', 'Answer']);
    const save = button(tree, 'Save Question');
    const saveBar = nodes(tree).find(n => n.props?.className === 'saveToolbar navySaveToolbar');
    assert.ok(saveBar); assert.equal(button(saveBar, 'Save Question').props.onClick, save.props.onClick);
    assert.ok(nodes(tree).indexOf(saveBar) > nodes(tree).findIndex(n => n.props?.role === 'tablist'));
    assert.equal(e.primaryQuestionConceptId, null); assert.equal(e.isQuestionDirty, false);
    e.setQuestionPrompt('Keep Front'); e.setQuestionAnswer('Keep Answer');
    const before = draft(h.render());
    for (const tab of ['Content', 'Questions', 'Tags', 'Questions', 'Flagged', 'Questions', 'Search', 'Questions']) {
      button(expandChrome(h.render().tree), tab).props.onClick(); e = h.render(); tree = expandChrome(e.tree);
      assert.deepEqual(draft(e), before);
      assert.equal(nodes(tree).some(n => n.props?.className === 'questionDesign'), tab === 'Questions');
    }
    assert.equal(h.calls.length, 0);
  });
  test(`${role}: browsed Concept state and associated Primary/Related remain distinct`, () => {
    const h = editor({ role }); let e = h.render();
    e.setActiveCreatorTab('questions');
    e.setQuestionConceptsByTopicId({ topic: [{ id: 'primary', name: 'Primary' }] });
    h.render(); h.runEffect('setQuestionConceptOptions(options)'); e = h.render();
    assert.equal(e.questionConceptId, 'primary'); assert.equal(e.primaryQuestionConceptId, null);
    e.setQuestionConceptsByTopicId({ topic: [{ id: 'primary', name: 'Primary' }, { id: 'related', name: 'Related' }] });
    e = h.render(); e.browseQuestionConcept('primary', 'topic'); e = h.render(); assert.equal(e.primaryQuestionConceptId, 'primary');
    e.associateQuestionConcept('related', true); e = h.render(); assert.deepEqual(plain(e.questionRelatedConceptIds), ['related']);
    e.browseQuestionConcept('related', 'topic'); e = h.render();
    assert.equal(e.primaryQuestionConceptId, 'related'); assert.deepEqual(plain(e.questionRelatedConceptIds), []);
    e.setQuestionPrompt('Preserve me'); e.clearQuestionConceptAssociations(); e = h.render();
    assert.equal(e.primaryQuestionConceptId, null); assert.equal(e.questionPrompt, 'Preserve me');
    assert.match(css, /\.questionAssociationRow \.topicActivationButton\[aria-pressed='true'\]/);
    assert.match(source, /isSelected && <span className=\{styles.questionAssociationLabel\}>\{isPrimary \? 'Primary' : 'Related'\}/);
  });
}
test('learner rendering never opts into Question presentation or official compact fields', () => {
  const h = editor({ role: 'learner', placed: true }); const tree = expandChrome(h.render().tree);
  assert.ok(!nodes(tree).some(n => n.props?.className === 'questionDesign'));
  assert.equal(nodes(h.render().tree).filter(n => n.type?.name === 'QuestionMarkdownField').length, 0);
});

const tools = [['Bold', 'strong'], ['Italic', 'em'], ['Heading', 'h2'], ['Bulleted List', 'ul'], ['Numbered List', 'ol'], ['Link', 'a'], ['Quote', 'blockquote']];
for (const label of ['Question', 'Answer']) {
  for (const [tool, selector] of tools) test(`${label} compact ${tool} uses the real visual session and retains Undo/Redo`, async () => {
    const h = await mountVisualField({ wrapper: true, presentation: 'compact', label, value: 'Café 🧠\n\nSecond paragraph', format: 'legacy' });
    try {
      const initial = h.props.value;
      const group = h.dom.window.document.querySelector(`[aria-label="${label} formatting tools"]`);
      assert.deepEqual([...group.querySelectorAll('button')].map(b => b.getAttribute('aria-label')), tools.map(([name]) => name));
      assert.ok([...group.querySelectorAll('button')].every(b => b.type === 'button' && b.title === b.getAttribute('aria-label')));
      assert.equal(h.writes.length, 0);
      await h.select(1, h.view.state.doc.content.size - 1); await h.click(tool);
      if (tool === 'Link') { await h.input(h.dom.window.document.querySelector('input[type=url]'), 'https://example.test/path'); await h.click('Apply Link'); }
      assert.ok(h.view.dom.querySelector(selector), tool);
      assert.equal(h.view.dom.textContent, 'Café 🧠Second paragraph');
      assert.equal(h.props.format, 'visual_markdown_v1');
      assert.equal(h.dom.window.document.activeElement, h.view.dom);
      const changed = h.handle.current.capture();
      await h.act(() => { h.session.undo(); h.view.updateState(h.session.state); });
      assert.deepEqual(plain(h.handle.current.capture()), { source: initial, format: 'legacy' });
      await h.act(() => { h.session.redo(); h.view.updateState(h.session.state); });
      assert.deepEqual(plain(h.handle.current.capture()), plain(changed));
    } finally { await h.close(); }
  });
  test(`${label} compact modes preserve source, history, disabled state and unsupported fallback`, async () => {
    const h = await mountVisualField({ wrapper: true, presentation: 'compact', label, format: 'legacy' });
    try {
      const group = h.dom.window.document.querySelector(`[aria-label="${label} editor mode"]`);
      assert.deepEqual([...group.querySelectorAll('button')].map(b => b.textContent), ['Write', 'Preview', 'Source']);
      for (const mode of ['Preview', 'Source', 'Write']) { await h.click(mode); assert.equal(h.writes.length, 0); assert.equal(h.props.value, 'Selected'); assert.equal(h.props.format, 'legacy'); }
      await h.select(2, 5); await h.click('Bold'); const saved = h.handle.current.capture();
      await h.click('Preview'); await h.click('Write'); await h.show(false); await h.show(true);
      assert.deepEqual(plain(h.handle.current.capture()), plain(saved));
      assert.equal(h.view.state.selection.from, 2); assert.equal(h.view.state.selection.to, 5);
      await h.update({ readOnly: true }); for (const [tool] of tools) assert.equal(h.button(tool).disabled, true);
      await h.update({ readOnly: false, disabled: true }); for (const [tool] of tools) assert.equal(h.button(tool).disabled, true);
      await h.update({ disabled: false, value: 'x'.repeat(70000), format: 'legacy', documentKey: 'unsupported' });
      assert.equal(h.props.mode, 'source'); assert.equal(h.dom.window.document.querySelector('textarea').value.length, 70000);
      assert.equal(h.button('Write').disabled, true);
    } finally { await h.close(); }
  });
}
