import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { editor, nodes, button, expandChrome, text } from './fixtures/creator-role-workspaces.mjs';

const fields = h => nodes(h.render().tree).filter(n => n.type?.name === 'PersonalCardField');
for (const role of ['admin', 'editor', 'learner']) {
  test(`${role}: canonical Creator has no new Deck or personal-management sections`, () => {
    const h = editor({role, placed: true});
    const tree = expandChrome(h.render().tree);
    assert.deepEqual(nodes(tree).filter(n => n.props?.role === 'tab').map(text),
      role === 'learner' ? ['Questions', 'Flagged'] : ['Content', 'Questions', 'Tags', 'Flagged', 'Search']);
    assert.ok(!nodes(tree).some(n => ['PersonalDecksBrowser', 'CreatorPersonalContentPanel'].includes(n.type?.name)));
    assert.ok(!nodes(tree).some(n => n.type === 'button' && /^(Personal Decks|New Personal Concept|New Personal Topic)$/.test(text(n).trim())));
    assert.equal(h.calls.length, 0);
  });
  test(`${role}: the existing owned Card uses the shared editor without changing its type or attribution`, async () => {
    const h = editor({role, placed: true});
    h.props.initialPersonalContent.cards.forEach(card => {card.created_at = '2026-01-01T00:00:00Z'; card.updated_at = card.created_at;});
    h.render().setActiveCreatorTab('questions');
    h.render().selectExistingQuestion({source: 'personal', id: 'mine-card', conceptId: 'mine-concept'});
    const controls = fields(h); assert.equal(controls.length, 2);
    assert.ok(controls.every(n => n.props.literal === true));
    controls[0].props.onChange('**Literal Front**'); controls[1].props.onChange('Literal Back');
    await h.render().saveCurrentQuestion();
    const writes = h.calls.filter(c => c.table === 'personal_cards'); assert.equal(writes.length, 1);
    assert.equal(writes[0].operation, 'update');
    assert.deepEqual(JSON.parse(JSON.stringify(writes[0].filters)), [['id', 'mine-card'], ['owner_id', 'owner']]);
    assert.equal(writes[0].values.question, '**Literal Front**');
    assert.equal(writes[0].values.concept_id, 'mine-concept');
    assert.equal(writes[0].values.owner_id, 'owner');
    assert.ok(!h.calls.some(c => c.name?.startsWith('save_question') || c.name === 'save_concept_with_prerequisites'));
    assert.equal(h.render().isQuestionDirty, false);
  });
}

test('canceled navigation and composition protect an existing personal Card draft', async () => {
  const h = editor({role: 'learner', placed: true, confirm: () => false});
  h.render().selectExistingQuestion({source: 'personal', id: 'mine-card', conceptId: 'mine-concept'});
  fields(h)[0].props.onChange('Unsaved personal Front');
  button(h.render().tree, 'Flagged').props.onClick();
  assert.equal(h.render().activeCreatorTab, 'questions');
  assert.equal(h.render().questionPrompt, 'Unsaved personal Front');
  assert.equal(h.runShellGuard(), false);
  fields(h)[0].props.onComposing(true);
  await h.render().saveCurrentQuestion(); assert.equal(h.calls.length, 0);
  fields(h)[0].props.onComposing(false);
  await h.render().saveCurrentQuestion(); assert.equal(h.calls.filter(c => c.table === 'personal_cards').length, 1);
});

test('visual Card editing has no persistence, official-media or learning-mutation authority', () => {
  for (const path of ['components/creator/PersonalCardField.tsx', 'lib/personal-card-authoring.ts']) {
    const source = readFileSync(new URL('../' + path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /supabase|\.rpc\(|\.from\(|fetch\(|content-media\/|review_attempts|study_sessions/);
  }
});

test('legacy route keeps learner compatibility and its existing staff redirect', () => {
  const route = readFileSync(new URL('../app/study-creator/page.tsx', import.meta.url), 'utf8');
  assert.match(route, /if \(role === 'admin' \|\| role === 'editor'\) redirect\('\/creator'\)/);
  assert.match(route, /<StudyCreatorClient officialBrowser=\{officialBrowser\} ownerId=\{userId\}/);
  const legacy = readFileSync(new URL('../components/StudyCreatorClient.tsx', import.meta.url), 'utf8');
  assert.match(legacy, /<PersonalDecksBrowser/);
  const canonical = readFileSync(new URL('../components/CreatorStudioV2Client.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(canonical, /PersonalDecksBrowser|CreatorPersonalContentPanel|Personal Decks/);
});
