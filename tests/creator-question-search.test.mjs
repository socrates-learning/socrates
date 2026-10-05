import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { editor, nodes, text, expandChrome, testingAngleVocabulary } from './fixtures/creator-role-workspaces.mjs';

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

const searchSource = readFileSync(new URL('../components/creator/CreatorQuestionSearchPanel.tsx', import.meta.url), 'utf8');

test('Search tab exposes the required Library-wide filters', () => {
  assert.match(searchSource, /Library Question Search/);
  assert.match(searchSource, />Question text</);
  assert.match(searchSource, />Difficulty</);
  assert.match(searchSource, />Primary Testing Angle</);
  assert.match(searchSource, />Additional Testing Angle</);
  assert.match(searchSource, />Primary Concept</);
  assert.match(searchSource, />Related Concept</);
  assert.match(searchSource, />Status</);
  assert.match(searchSource, />Tag</);
  assert.match(creatorSource, /search_creator_questions/);
});

test('Question search uses a bounded keyset page and deduplicates appended rows', () => {
  assert.match(creatorSource, /QUESTION_SEARCH_PAGE_SIZE = 50/);
  assert.match(creatorSource, /p_before_created_at: cursor\?\.createdAt \|\| null/);
  assert.match(creatorSource, /fetched\.slice\(0, QUESTION_SEARCH_PAGE_SIZE\)/);
  assert.match(creatorSource, /new Map\([\s\S]*question\.id/);
  assert.match(searchSource, /Load more Questions/);
  assert.match(creatorStyles, /\.questionSearchResults\s*{[\s\S]*max-height: 390px/);
});

test('search result selection reuses the existing editor with true metadata', () => {
  assert.match(
    searchSource,
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

test('current and former vocabulary names resolve to immutable Search keys without changing pagination', async () => {
  const vocabulary = structuredClone(testingAngleVocabulary);
  vocabulary[5].display_name = 'Applied Practice';
  vocabulary[5].reserved_names.push('applied practice');
  vocabulary[5].status = 'retired';
  const h = editor({ vocabulary, response(name) {
    assert.equal(name, 'search_creator_questions_with_media');
    return { data: [], error: null };
  } });
  const filters = { text: 'clinical', difficulty: 'hard', primaryTestingAngle: '', additionalTestingAngle: '',
    primaryConceptId: 'concept-a', relatedConceptId: 'concept-b', status: 'archived', tagId: 'tag-a' };
  for (const name of ['Applied Practice', 'Clinical Application', ' applied practice ']) {
    await h.render().loadQuestionSearchPage({ ...filters, primaryTestingAngle: name, additionalTestingAngle: name },
      { createdAt: '2026-01-01T00:00:00Z', id: 'cursor' }, false);
    assert.deepEqual(JSON.parse(JSON.stringify(h.calls.at(-1).payload)), {
      p_active_library_id: h.props.activeLibraryId, p_search_text: 'clinical', p_difficulty: 'hard',
      p_primary_testing_angle: 'Clinical Application', p_additional_testing_angle: 'Clinical Application',
      p_primary_concept_id: 'concept-a', p_related_concept_id: 'concept-b', p_status: 'archived', p_tag_id: 'tag-a',
      p_page_size: 50, p_before_created_at: '2026-01-01T00:00:00Z', p_before_id: 'cursor',
    });
  }
  assert.equal(h.render().resolveTestingAngleFilter('Historical unregistered key'), 'Historical unregistered key');
  h.render().setQuestionSearchResults([{
    source: 'official', kind: 'question', id: 'q', conceptId: 'concept-a', primaryConceptName: 'Concept',
    prompt: 'ZZ Vocabulary Search result', promptFormat: 'legacy', answer: 'Answer', status: 'published', difficulty: 'medium',
    testingAngle: 'Clinical Application', additionalTestingAngles: ['General Understanding'], relatedConceptIds: [], relatedConcepts: [], tags: [],
  }]);
  h.render().setActiveCreatorTab('search');
  const result = nodes(h.render().tree).find(n => n.type === 'button' && text(n).includes('ZZ Vocabulary Search result'));
  assert.ok(result);
  assert.match(text(result).replace(/\s+/g, ' '), /Primary Angle: Applied Practice/);
  assert.match(text(result).replace(/\s+/g, ' '), /Additional: General Understanding/);
  const options = nodes(h.render().tree).filter(n => n.type === 'option').map(n => n.props.value);
  assert.ok(options.includes('Applied Practice'));
  assert.ok(options.includes('Clinical Application'));
});


test('Question Search retains complete active/archived Tag metadata independently of 50-row Browse pages', async () => {
  const catalog = Array.from({ length: 1105 }, (_, index) => ({ id: `tag-${index}`, name: `Tag ${index}`, slug: `tag-${index}`, status: index === 1104 ? 'archived' : 'active' }));
  const h = editor({ readResponse(table, read) {
    assert.equal(table, 'tags'); assert.equal(read.options.count, 'exact');
    assert.deepEqual(Array.from(read.order), ['name', 'id']);
    assert.equal(read.range[1] - read.range[0], 49);
    assert.equal(read.filters.length, 0, 'Search includes archived metadata');
    return { data: catalog.slice(read.range[0], read.range[1] + 1), count: catalog.length, error: null };
  } });
  h.render().setActiveCreatorTab('search'); await h.render().loadTagCatalog();
  const e = h.render();
  assert.equal(e.availableTags.length, 1105); assert.equal(h.reads.length, 23);
  assert.equal(e.tagPages.question.tags.length, 0, 'Search catalog does not populate a Browse page');
  const late = nodes(e.tree).find(n => n.type === 'option' && n.props.value === 'tag-1104');
  assert.ok(late); assert.match(text(late), /Tag 1104.*Archived/);
  assert.equal(h.calls.length, 0);
});

test('Search catalog failures retain the last complete metadata and surface an error, not truncated choices', async () => {
  let fail = false;
  const catalog = Array.from({ length: 51 }, (_, index) => ({ id: `tag-${index}`, name: `Tag ${index}`, slug: `tag-${index}`, status: 'active' }));
  const h = editor({ readResponse(table, read) {
    assert.equal(table, 'tags');
    if (fail && read.range[0] > 0) return { data: null, count: null, error: { message: 'Tag read unavailable' } };
    return { data: catalog.slice(read.range[0], read.range[1] + 1), count: 51, error: null };
  } });
  h.render().setActiveCreatorTab('search'); await h.render().loadTagCatalog();
  fail = true; assert.equal(await h.render().loadTagCatalog(), false);
  assert.equal(h.render().availableTags.length, 51);
  assert.match(text(expandChrome(h.render().tree)), /Tag read unavailable/);
});
