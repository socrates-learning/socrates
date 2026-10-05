import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { editor, nodes, text, button, expandChrome, testingAngleVocabulary, formatSaveResponse } from './fixtures/creator-role-workspaces.mjs';

const plain = value => JSON.parse(JSON.stringify(value));
const question = {
  source: 'official', kind: 'question', id: 'q', conceptId: 'concept', primaryConceptName: 'Concept',
  relatedConceptIds: [], relatedConcepts: [], prompt: 'Existing Front', answer: 'Existing Answer', explanation: '',
  difficulty: 'medium', testingAngle: 'General Understanding', additionalTestingAngles: [], status: 'published', tags: [],
  promptFormat: 'legacy', answerFormat: 'legacy', currentVersionId: 'version', updatedAt: '2026-01-01T00:00:00Z',
};
function field(h, label) {
  const found = nodes(h.render().tree).filter(n => n.props?.['aria-label'] === label);
  assert.equal(found.length, 1, label);
  return found[0];
}
function draft(h) {
  const e = h.render();
  return plain({ id: e.questionId, prompt: e.questionPrompt, answer: e.questionAnswer, primary: e.questionTestingAngle,
    additional: e.questionAdditionalTestingAngles, difficulty: e.questionDifficulty, status: e.questionRecordStatus, dirty: e.isQuestionDirty });
}
function setup(role = 'admin') {
  let catalog = structuredClone(testingAngleVocabulary);
  const h = editor({ role, placed: true, confirm: () => false, response(name, payload) {
    if (name === 'get_testing_angle_vocabulary') return { data: structuredClone(catalog), error: null };
    if (name === 'create_testing_angle') {
      const entry = { id: 'added-angle', storage_key: payload.p_name, display_name: payload.p_name,
        status: 'active', reserved_names: [payload.p_name.toLowerCase()], sort_order: catalog.length, revision: 1 };
      catalog.push(entry); return { data: structuredClone(entry), error: null };
    }
    if (name === 'rename_testing_angle' || name === 'set_testing_angle_retired') {
      const entry = catalog.find(row => row.id === payload.p_id);
      if (entry.revision !== payload.p_expected_revision) return { data: null, error: { message: 'Testing Angle changed; reload the vocabulary before trying again' } };
      if (name === 'rename_testing_angle') { entry.display_name = payload.p_name; entry.reserved_names.push(payload.p_name.toLowerCase()); }
      else entry.status = payload.p_retired ? 'retired' : 'active';
      entry.revision++; return { data: structuredClone(entry), error: null };
    }
    if (name === 'search_creator_questions_with_media') return { data: [], error: null };
    return formatSaveResponse(name, payload);
  } });
  h.render().setActiveCreatorTab('questions');
  return { h, catalog: () => catalog };
}

for (const role of ['admin', 'editor']) {
  test(`${role}: catalog management leaves the unified control and Question draft intact`, async () => {
    const { h } = setup(role);
    h.render().selectExistingQuestion(question);
    const pristine = draft(h);
    assert.ok(text(h.render().tree).includes('Manage Testing Angles'));
    assert.equal(nodes(h.render().tree).filter(n => n.props?.['aria-label']?.startsWith('Select Testing Angle')).length, 9);
    assert.equal(field(h, 'Select Testing Angle General Understanding').props.disabled, true);
    assert.equal(field(h, 'Remove General Understanding from future availability').props.disabled, true);
    h.render().setTestingAngleNameDraft('ZZ Vocabulary Addition');
    assert.equal(await h.render().mutateTestingAngleCatalog('create-testing-angle'), true);
    assert.deepEqual(draft(h), pristine, 'Add does not select, save or dirty a Question');
    assert.equal(field(h, 'Select Testing Angle ZZ Vocabulary Addition').props.checked, false);
    h.render().setQuestionAnswer('Unsaved Answer');
    const dirty = draft(h);
    const entry = h.render().testingAngleCatalog.find(row => row.id === 'added-angle');
    h.render().setTestingAngleRename({ entry, name: 'ZZ Current Label' });
    assert.equal(await h.render().mutateTestingAngleCatalog('rename-testing-angle', entry), true);
    assert.equal(h.render().resolveTestingAngleFilter('ZZ Current Label'), 'ZZ Vocabulary Addition');
    assert.equal(h.render().resolveTestingAngleFilter('zz vocabulary addition'), 'ZZ Vocabulary Addition');
    assert.deepEqual(draft(h), dirty);
    const renamed = h.render().testingAngleCatalog.find(row => row.id === entry.id);
    await h.render().mutateTestingAngleCatalog('set-testing-angle-retired', renamed);
    assert.ok(!nodes(h.render().tree).some(n => n.props?.['aria-label'] === 'Select Testing Angle ZZ Current Label'));
    const retired = h.render().testingAngleCatalog.find(row => row.id === entry.id);
    assert.equal(retired.status, 'retired');
    await h.render().mutateTestingAngleCatalog('set-testing-angle-retired', retired);
    assert.equal(h.render().testingAngleCatalog.find(row => row.id === entry.id).storage_key, 'ZZ Vocabulary Addition');
    assert.deepEqual(draft(h), dirty);
    assert.ok(h.calls.every(call => ['create_testing_angle', 'rename_testing_angle', 'set_testing_angle_retired'].includes(call.name)));
    button(h.render().tree, 'Search').props.onClick();
    assert.equal(h.render().activeCreatorTab, 'search');
    assert.equal(h.runShellGuard(), false);
    assert.equal(h.render().activeCreatorTab, 'search');
    button(h.render().tree, 'Questions').props.onClick();
    assert.deepEqual(draft(h), dirty);
  });
}

test('current retired associations stay editable; removal/save stops offering them', async () => {
  const { h } = setup();
  const catalog = structuredClone(testingAngleVocabulary);
  catalog[5].status = 'retired'; catalog[5].display_name = 'Renamed Application';
  h.render().setTestingAngleCatalog(catalog);
  h.render().selectExistingQuestion({ ...question, additionalTestingAngles: ['Clinical Application'] });
  assert.equal(field(h, 'Select Testing Angle Renamed Application').props.checked, true);
  field(h, 'Make Renamed Application the Primary Testing Angle').props.onClick({ currentTarget: { closest: () => null } });
  assert.equal(h.render().questionTestingAngle, 'Clinical Application');
  assert.deepEqual(plain(h.render().questionAdditionalTestingAngles), ['General Understanding']);
  field(h, 'Make General Understanding the Primary Testing Angle').props.onClick({ currentTarget: { closest: () => null } });
  field(h, 'Select Testing Angle Renamed Application').props.onChange({ target: { checked: false } });
  assert.ok(field(h, 'Select Testing Angle Renamed Application'), 'unsaved removal can be reversed on the existing Question');
  await h.render().saveQuestion();
  assert.ok(!nodes(h.render().tree).some(n => n.props?.['aria-label'] === 'Select Testing Angle Renamed Application'));
  assert.equal(h.render().isQuestionDirty, false);
});

test('failed catalog read preserves selections and does not accept an invented fallback catalog', async () => {
  const h = editor({ response: name => {
    assert.equal(name, 'get_testing_angle_vocabulary'); return { error: { message: 'Catalog read failed' }, data: null };
  } });
  h.render().selectExistingQuestion({ ...question, testingAngle: 'Custom Primary', additionalTestingAngles: ['Custom Additional'] });
  const before = draft(h);
  assert.equal(await h.render().loadTestingAngleCatalog(), false);
  assert.deepEqual(draft(h), before);
  assert.match(h.render().testingAngleCatalogStatus.message, /Catalog read failed/);
});

test('catalog mutation lock rejects duplicate submission without Question writes', async () => {
  let finish;
  const h = editor({ response: name => {
    if (name === 'get_testing_angle_vocabulary') return { data: testingAngleVocabulary, error: null };
    assert.equal(name, 'create_testing_angle'); return new Promise(resolve => { finish = resolve; });
  } });
  h.render().setTestingAngleNameDraft('ZZ Pending');
  const first = h.render().mutateTestingAngleCatalog('create-testing-angle');
  assert.equal(h.render().testingAngleCatalogBusy, true);
  assert.equal(await h.render().mutateTestingAngleCatalog('create-testing-angle'), false);
  finish({ data: { ...testingAngleVocabulary[0], id: 'pending', storage_key: 'ZZ Pending' }, error: null });
  assert.equal(await first, true); assert.equal(h.calls.length, 1);
  assert.equal(h.render().testingAngleCatalogBusy, false);
});

test('stale management reports conflict without replacing the Question draft', async () => {
  const { h, catalog } = setup();
  h.render().selectExistingQuestion(question); h.render().setQuestionAnswer('Keep me');
  const before = draft(h); const stale = { ...h.render().testingAngleCatalog[5] };
  catalog()[5].revision++;
  assert.equal(await h.render().mutateTestingAngleCatalog('set-testing-angle-retired', stale), false);
  assert.match(h.render().testingAngleCatalogStatus.message, /changed; reload/);
  assert.deepEqual(draft(h), before);
});

test('learner never reads/manages vocabulary or sees the staff disclosure', async () => {
  const h = editor({ role: 'learner' });
  assert.ok(!text(expandChrome(h.render().tree)).includes('Manage Testing Angles'));
  assert.equal(await h.render().loadTestingAngleCatalog(), false);
  assert.equal(await h.render().mutateTestingAngleCatalog('create-testing-angle'), false);
  assert.equal(h.calls.length, 0); assert.equal(h.reads.length, 0);
});

test('migration leaves all algorithm/attempt/snapshot definitions outside its four validation changes', () => {
  const sql = readFileSync(new URL('../supabase/119_testing_angle_vocabulary.sql', import.meta.url), 'utf8');
  const names = [...sql.matchAll(/create(?: or replace)? function public\.([a-z0-9_]+)/gi)].map(match => match[1]);
  assert.deepEqual(names.filter(name => !name.startsWith('m119_')), [
    'can_manage_testing_angle_vocabulary', 'get_testing_angle_vocabulary', 'create_testing_angle', 'rename_testing_angle', 'set_testing_angle_retired',
    'create_question', 'update_question', 'm116_question_save_core', 'save_question_with_relationships_v2',
  ]);
  assert.equal((sql.match(/create table public\./gi) || []).length, 1);
  assert.equal((sql.match(/perform public\.m119_validate_question_angles\(/g) || []).length, 4);
  assert.match(sql, /for share;/);
  assert.doesNotMatch(sql, /create(?: or replace)? function public\.(?:select_next|record_|apply_user|append_question_version|get_creator_algorithm)/i);
});
