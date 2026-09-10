import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const client = await readFile(
  new URL('../components/StudyCreatorClient.tsx', import.meta.url),
  'utf8'
);
const browser = await readFile(
  new URL('../components/SocratesStudyCreatorBrowser.tsx', import.meta.url),
  'utf8'
);
const migration = await readFile(
  new URL('../supabase/090_personal_content_source_references.sql', import.meta.url),
  'utf8'
);
const candidateMigration = await readFile(
  new URL('../supabase/070_study_candidate_resolution.sql', import.meta.url),
  'utf8'
);

test('Migration 090 adds only nullable personal source/reference metadata', () => {
  const columnChanges = migration.slice(
    migration.indexOf('alter table public.personal_concepts'),
    migration.indexOf('comment on column public.personal_concepts')
  );
  assert.match(
    columnChanges,
    /alter table public\.personal_concepts\s+add column source_reference text;/
  );
  assert.match(
    columnChanges,
    /alter table public\.personal_cards\s+add column source_reference text;/
  );
  assert.doesNotMatch(migration, /alter table public\.(concepts|questions)/);
  assert.doesNotMatch(columnChanges, /not null|references public\.sources/i);
  assert.doesNotMatch(migration, /create policy|disable row level security/i);
});

test('personal Concept and Card editors persist optional source text as null when blank', () => {
  assert.match(client, /Source \/ Reference/);
  assert.match(
    client,
    /source_reference: conceptSourceReference\.trim\(\) \|\| null/
  );
  assert.match(
    client,
    /source_reference: cardSourceReference\.trim\(\) \|\| null/
  );
  assert.match(client, /record\?\.source_reference \?\? ''/);
  assert.match(
    client,
    /Textbook, lecture, URL, note, or other reference\. Optional\./
  );
});

test('official overlay creation keeps source metadata in its atomic personal Concept write', () => {
  assert.match(client, /p_source_reference: conceptSourceReference\.trim\(\) \|\| null/);
  assert.match(
    migration,
    /insert into public\.personal_concepts \([\s\S]*source_reference[\s\S]*insert into public\.personal_concept_official_placements/
  );
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
});

test('Details show present source text without turning it into a link or empty block', () => {
  assert.match(browser, /concept\.source_reference &&/);
  assert.match(browser, /card\.source_reference &&/);
  assert.doesNotMatch(browser, /href=\{(?:concept|card)\.source_reference\}/);
});

test('source metadata is absent from the personal Study candidate contract', () => {
  assert.doesNotMatch(candidateMigration, /source_reference/);
});
