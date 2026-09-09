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
const migration = readFileSync(
  new URL('../supabase/087_creator_question_search.sql', import.meta.url),
  'utf8'
);

test('Questions tab exposes the required Library-wide filters', () => {
  assert.match(creatorSource, /Library Question Search/);
  assert.match(creatorSource, />Question text</);
  assert.match(creatorSource, />Difficulty</);
  assert.match(creatorSource, />Primary Testing Angle</);
  assert.match(creatorSource, />Additional Testing Angle</);
  assert.match(creatorSource, />Primary Concept</);
  assert.match(creatorSource, />Related Concept</);
  assert.match(creatorSource, />Status</);
  assert.match(creatorSource, />Tag</);
  assert.match(creatorSource, /search_creator_questions/);
});

test('Question search uses a bounded keyset page and deduplicates appended rows', () => {
  assert.match(creatorSource, /QUESTION_SEARCH_PAGE_SIZE = 50/);
  assert.match(creatorSource, /p_before_created_at: cursor\?\.createdAt \|\| null/);
  assert.match(creatorSource, /fetched\.slice\(0, QUESTION_SEARCH_PAGE_SIZE\)/);
  assert.match(creatorSource, /new Map\([\s\S]*question\.id/);
  assert.match(creatorSource, /Load more Questions/);
  assert.match(creatorStyles, /\.questionSearchResults\s*{[\s\S]*max-height: 390px/);
});

test('search result selection reuses the existing editor with true metadata', () => {
  assert.match(
    creatorSource,
    /onClick=\{\(\) => selectQuestionSearchResult\(question\)\}/
  );
  assert.match(
    creatorSource,
    /setEditingQuestionPrimary\(\{ id: question\.conceptId, name: question\.primaryConceptName \}\)/
  );
  assert.match(creatorSource, /setQuestionRelatedConceptIds\(question\.relatedConceptIds/);
  assert.match(
    creatorSource,
    /setQuestionAdditionalTestingAngles\(question\.additionalTestingAngles/
  );
  assert.match(creatorSource, /setQuestionTags\(question\.tags\)/);
  assert.match(creatorSource, /setQuestionRecordStatus\(question\.status\)/);
});

test('RPC scopes to one Library and filters relationships without row multiplication', () => {
  assert.match(migration, /create or replace function public\.search_creator_questions/);
  assert.match(migration, /stable\s+security definer\s+set search_path = ''/s);
  assert.match(migration, /not public\.is_editor_or_admin\(\)/);
  assert.match(
    migration,
    /node\.library_id = p_active_library_id/
  );
  assert.match(
    migration,
    /from public\.question_related_concepts related_concept[\s\S]*related_concept\.concept_id = p_related_concept_id/
  );
  assert.match(
    migration,
    /from public\.question_additional_testing_angles additional_angle[\s\S]*additional_angle\.normalized_testing_angle = normalized_additional_angle/
  );
  assert.match(
    migration,
    /from public\.question_tags question_tag[\s\S]*question_tag\.tag_id = p_tag_id/
  );
  assert.doesNotMatch(migration, /join public\.question_related_concepts[\s\S]*matching_questions/);
});

test('RPC is read-only and authenticated-editor scoped', () => {
  assert.match(
    migration,
    /revoke all on function public\.search_creator_questions\([\s\S]*from public, anon, authenticated;/
  );
  assert.match(
    migration,
    /grant execute on function public\.search_creator_questions\([\s\S]*to authenticated;/
  );
  assert.doesNotMatch(
    migration,
    /\b(insert|update|delete)\s+(into|public\.|from)\s+public\.(questions|review_attempts|user_concept_mastery)/i
  );
  assert.doesNotMatch(migration, /select_next_study_question|resolve_study_deck/);
});
