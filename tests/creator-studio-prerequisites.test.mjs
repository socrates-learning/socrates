import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const creatorSource = readFileSync(
  new URL('../components/CreatorStudioV2Client.tsx', import.meta.url),
  'utf8'
);
const creatorStyles = readFileSync(
  new URL('../components/CreatorStudioV2Client.module.css', import.meta.url),
  'utf8'
);
const migrationSource = readFileSync(
  new URL(
    '../supabase/074_creator_studio_prerequisite_authoring.sql',
    import.meta.url
  ),
  'utf8'
);

test('prerequisite authoring is contained inside the existing Concept flow', () => {
  assert.match(creatorSource, /Prerequisites \/ Relationships/);
  assert.match(creatorSource, /placeholder=\{`Search \$\{prerequisiteTargetType/);
  assert.match(creatorSource, /renderPrerequisiteBrowseTopic/);
  assert.match(creatorSource, /Linked prerequisites/);
  assert.match(creatorSource, /No graph\s+drawing required\./);
  assert.match(creatorSource, /save_concept_with_prerequisites/);
  assert.match(creatorStyles, /\.prerequisitesSection/);
  assert.match(creatorStyles, /@media \(max-width: 520px\)/);
});

test('Concept and Topic targets persist with Required or Recommended strength', () => {
  assert.match(creatorSource, /type PrerequisiteTargetType = 'concept' \| 'topic'/);
  assert.match(
    creatorSource,
    /type PrerequisiteStrength = 'required' \| 'recommended'/
  );
  assert.match(creatorSource, /<option value="required">Required<\/option>/);
  assert.match(
    creatorSource,
    /<option value="recommended">Recommended<\/option>/
  );
  assert.match(creatorSource, /target_type: prerequisite\.targetType/);
  assert.match(creatorSource, /target_id: prerequisite\.targetId/);
});

test('database model keeps identities and enforces edge integrity', () => {
  assert.match(
    migrationSource,
    /prerequisite_concept_id uuid\s+references public\.concepts\(id\) on delete restrict/
  );
  assert.match(
    migrationSource,
    /prerequisite_library_node_id uuid\s+references public\.library_nodes\(id\) on delete restrict/
  );
  assert.match(migrationSource, /num_nonnulls\(prerequisite_concept_id, prerequisite_library_node_id\) = 1/);
  assert.match(migrationSource, /prerequisite_concept_id <> concept_id/);
  assert.match(migrationSource, /create unique index concept_prerequisites_concept_target_uidx/);
  assert.match(migrationSource, /create unique index concept_prerequisites_topic_target_uidx/);
});

test('Concept cycles are recursively rejected and Topic cycles are intentionally undefined', () => {
  assert.match(migrationSource, /with recursive prerequisite_chain/);
  assert.match(migrationSource, /Concept prerequisite would create a cycle/);
  assert.match(migrationSource, /if new\.prerequisite_concept_id is null then\s+return new/);
  assert.doesNotMatch(migrationSource, /descendant Concept IDs/);
});

test('authoring remains role controlled and scheduling remains outside Phase 2B', () => {
  assert.match(migrationSource, /public\.is_editor_or_admin\(\)/);
  assert.match(migrationSource, /revoke all on table public\.concept_prerequisites/);
  assert.match(migrationSource, /grant select on table public\.concept_prerequisites to authenticated/);
  assert.doesNotMatch(migrationSource, /select_next_study_candidate/);
  assert.doesNotMatch(migrationSource, /select_next_study_question/);
  assert.doesNotMatch(migrationSource, /resolve_study_candidates/);
});
