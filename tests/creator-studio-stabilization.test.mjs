import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as entityContracts from '../lib/creator-entity-contracts.ts';

const creatorSource = readFileSync(
  new URL('../components/CreatorStudioV2Client.tsx', import.meta.url),
  'utf8'
);
const migrationSource = readFileSync(
  new URL('../supabase/095_atomic_personal_concept_overlay_save.sql', import.meta.url),
  'utf8'
);
const runtimeSource = readFileSync(
  new URL('../lib/creator-studio-runtime.ts', import.meta.url),
  'utf8'
);
const runtimeContext = {
  exports: {},
  require(name) {
    if (name === '@/lib/creator-entity-contracts') return entityContracts;
    if (name === '@/lib/creator-capabilities') return {};
    throw new Error(`Unexpected runtime import: ${name}`);
  },
};
vm.runInNewContext(
  ts.transpileModule(runtimeSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  runtimeContext
);

const {
  conceptEditorIdentityKey,
  createOfficialConceptEditorState,
  createOfficialQuestionEditorState,
  createPersonalCardEditorState,
  createPersonalConceptEditorState,
  isConceptEditorIdentity,
  isQuestionEditorIdentity,
  questionEditorIdentityKey,
  releaseMutationLock,
  tryAcquireMutationLock,
} = runtimeContext.exports;

function functionBody(name, nextName) {
  const start = creatorSource.indexOf(`function ${name}`);
  const end = creatorSource.indexOf(`function ${nextName}`, start + 1);
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${nextName} must follow ${name}`);
  return creatorSource.slice(start, end);
}

test('Concept identity comparisons include source, kind, and UUID', () => {
  const official = createOfficialConceptEditorState('same-uuid', 'library-a');
  const personal = createPersonalConceptEditorState('same-uuid', 'owner-a');

  assert.equal(isConceptEditorIdentity(official, 'official', 'same-uuid'), true);
  assert.equal(isConceptEditorIdentity(official, 'personal', 'same-uuid'), false);
  assert.equal(isConceptEditorIdentity(personal, 'personal', 'same-uuid'), true);
  assert.equal(isConceptEditorIdentity(personal, 'official', 'same-uuid'), false);
  assert.notEqual(conceptEditorIdentityKey(official), conceptEditorIdentityKey(personal));
});

test('Question and personal Card identity comparisons survive raw UUID collisions', () => {
  const official = createOfficialQuestionEditorState('same-uuid', 'library-a');
  const personal = createPersonalCardEditorState('same-uuid', 'owner-a');

  assert.equal(isQuestionEditorIdentity(official, 'official', 'same-uuid'), true);
  assert.equal(isQuestionEditorIdentity(official, 'personal', 'same-uuid'), false);
  assert.equal(isQuestionEditorIdentity(personal, 'personal', 'same-uuid'), true);
  assert.notEqual(questionEditorIdentityKey(official), questionEditorIdentityKey(personal));
});

test('official Concept loading rejects stale success and failure generations', () => {
  const openConcept = functionBody('openConceptFromSearch', 'openPersonalConcept');
  assert.match(openConcept, /conceptSelectionGenerationRef\.current/);
  assert.match(openConcept, /conceptSelectionTargetKeyRef\.current !== requestTargetKey/);
  assert.match(openConcept, /if \([\s\S]*requestGeneration !==[\s\S]*\) return;[\s\S]*const loadedConcept/);
  assert.doesNotMatch(openConcept, /selectedConceptId === conceptId/);
});

test('synchronous mutation lock rejects a second start and unlocks an explicit retry', () => {
  const lock = { current: false };
  assert.equal(tryAcquireMutationLock(lock), true);
  assert.equal(tryAcquireMutationLock(lock), false);
  releaseMutationLock(lock);
  assert.equal(tryAcquireMutationLock(lock), true);
});

test('Concept and Question saves capture source-qualified target state before awaiting', () => {
  const conceptSave = functionBody('saveCurrentConcept', 'saveConcept');
  const questionSave = functionBody('saveCurrentQuestion', 'deleteCurrentQuestion');
  for (const source of [conceptSave, questionSave]) {
    assert.match(source, /const saveState = \w+EditorStateRef\.current/);
    assert.match(source, /tryAcquireMutationLock/);
    assert.match(source, /finally/);
    assert.match(source, /releaseMutationLock/);
  }
  assert.match(creatorSource, /targetStillCurrent/);
  assert.match(creatorSource, /conceptEditorIdentityKey\(saveState\)/);
  assert.match(creatorSource, /questionEditorIdentityKey\(saveState\)/);
});

test('existing personal Concept and overlay mutations use one atomic RPC', () => {
  const personalSave = functionBody('savePersonalConcept', 'saveCurrentConcept');
  assert.match(personalSave, /if \(existing\)[\s\S]*save_personal_concept_with_overlay/);
  assert.doesNotMatch(
    personalSave,
    /from\('personal_concept_official_placements'\)[\s\S]{0,180}\.(?:update|delete)\(/
  );
  assert.match(migrationSource, /security definer[\s\S]*set search_path = ''/i);
  assert.match(migrationSource, /for update/);
  assert.match(migrationSource, /on conflict on constraint personal_concept_official_placements_concept_key do update/);
  assert.match(migrationSource, /delete from public\.personal_concept_official_placements/);
  assert.match(migrationSource, /grant execute[\s\S]*to authenticated/);
});

test('Topic rows use sibling native controls rather than nested button semantics', () => {
  assert.doesNotMatch(creatorSource, /className=\{`\$\{styles\.topicRow[\s\S]{0,500}?role="button"/);
  assert.match(creatorSource, /className=\{styles\.topicActivationButton\}/);
  assert.match(creatorSource, /aria-pressed=\{isActive\}/);
  assert.match(creatorSource, /className=\{styles\.expandButton\}[\s\S]*type="button"/);
  assert.match(creatorSource, /className=\{styles\.topicCheckbox\}[\s\S]*type="checkbox"/);
});

test('Tag and Question loaders have stable hook dependencies without disable comments', () => {
  assert.match(creatorSource, /const loadTagCatalog = useCallback/);
  assert.match(creatorSource, /\}, \[isLearnerReadOnly\]\);/);
  assert.match(creatorSource, /\[activeCreatorTab, loadTagCatalog\]/);
  assert.match(creatorSource, /const fetchExistingQuestions = useCallback/);
  assert.match(creatorSource, /\[activeLibraryId, fetchExistingQuestions, questionConceptId\]/);
  assert.doesNotMatch(creatorSource, /eslint-disable[^\n]*react-hooks/);
});
