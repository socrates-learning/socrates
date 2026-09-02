import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const clientSource = await readFile(
  new URL('../components/StudyCreatorClient.tsx', import.meta.url),
  'utf8'
);
const browserSource = await readFile(
  new URL('../components/SocratesStudyCreatorBrowser.tsx', import.meta.url),
  'utf8'
);
const migrationSource = await readFile(
  new URL('../supabase/078_personal_overlay_authoring.sql', import.meta.url),
  'utf8'
);

test('atomic RPC derives owner and creates only a personal Concept plus overlay', () => {
  assert.match(migrationSource, /caller_id uuid := \(select auth\.uid\(\)\)/);
  assert.match(migrationSource, /security definer/);
  assert.match(migrationSource, /set search_path = ''/);
  assert.match(migrationSource, /insert into public\.personal_concepts/);
  assert.match(migrationSource, /insert into public\.personal_concept_official_placements/);
  assert.doesNotMatch(migrationSource, /insert into public\.(concepts|concept_placements|questions)/);
  assert.doesNotMatch(migrationSource, /p_owner_id/);
});

test('RPC validates owned home, accessible Library, and published exact placement', () => {
  assert.match(migrationSource, /topic\.owner_id = caller_id/);
  assert.match(migrationSource, /public\.user_libraries/);
  assert.match(migrationSource, /library\.status = 'active'/);
  assert.match(migrationSource, /concept\.status = 'published'/);
  assert.match(migrationSource, /placement\.library_node_id = p_library_node_id/);
  assert.match(migrationSource, /grant execute[\s\S]*to authenticated/);
});

test('official actions are contextual and ownership-labelled', () => {
  assert.match(browserSource, /Add My Concept/);
  assert.match(browserSource, /Add My Card/);
  assert.match(browserSource, /Mine · Private/);
  assert.match(browserSource, /Socrates stays unchanged/);
  assert.doesNotMatch(browserSource, /\.from\(/);
});

test('Card flow reuses an exact existing overlay or requires explicit setup', () => {
  assert.match(clientSource, /overlay\.library_node_id === target\.libraryNodeId/);
  assert.match(clientSource, /overlay\.official_concept_id === target\.officialConceptId/);
  assert.match(clientSource, /openCardEditor\(null, existing\.personal_concept_id\)/);
  assert.match(clientSource, /Set up My Concept/);
  assert.match(clientSource, /Heart Failure|officialName/);
  assert.match(clientSource, /Personal Topic <small>Canonical home<\/small>/);
});

test('detach deletes only the owner overlay and preserves personal content', () => {
  const detachBody = clientSource.slice(
    clientSource.indexOf('async function detachOverlay'),
    clientSource.indexOf('function addCardForOfficialConcept')
  );
  assert.match(detachBody, /personal_concept_official_placements/);
  assert.match(detachBody, /\.eq\('owner_id', ownerId\)/);
  assert.doesNotMatch(detachBody, /personal_concepts|personal_cards/);
  assert.match(clientSource, /Your personal Concept and every Card in it will remain/);
});

test('dialogs support Escape, focus restoration, and cancellation without writes', () => {
  assert.match(clientSource, /event\.key === 'Escape' && overlayEditor/);
  assert.match(clientSource, /event\.key === 'Escape' && detachTarget/);
  assert.match(clientSource, /opener\?\.focus\(\)/);
  assert.match(clientSource, /type="button">Cancel/);
});
