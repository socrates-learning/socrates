import { projectSharedTopicSource } from './fixtures/shared-topic-branches.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readAppearanceSource as readFileSync } from './fixtures/appearance.mjs';
import test from 'node:test';
import { CreatorQuestionSearchPanel, editor, nodes, text, expandChrome } from './fixtures/creator-role-workspaces.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
const source = read('components/creator/CreatorQuestionSearchPanel.tsx');
const css = read('components/CreatorStudioV2Client.module.css');
const marker = '\n/* Approved Search-only presentation;';
const normalize = value => text(value).replace(/\s+/g, ' ').trim();
const byPart = (tree, part) => nodes(tree).filter(n => n.props?.['data-search-part'] === part);
const emptyFilters = { text: '', difficulty: '', primaryTestingAngle: '', additionalTestingAngle: '', primaryConceptId: '', relatedConceptId: '', status: '', tagId: '' };
const question = (overrides = {}) => ({ source: 'official', kind: 'question', id: 'q1', conceptId: 'primary', primaryConceptName: 'Primary Concept', prompt: 'Question?', promptFormat: 'legacy', answer: 'Private answer remains in the editor', answerFormat: 'legacy', currentVersionId: 'version-1', relatedConceptIds: ['related'], relatedConcepts: [{ id: 'related', name: 'Related Concept' }], testingAngle: 'Clinical Application', additionalTestingAngles: ['General Understanding'], difficulty: 'medium', status: 'published', tags: [{ id: 'tag1', name: 'Existing Tag', status: 'archived' }], mediaHint: { front: true, answer: true }, ...overrides });
function render(overrides = {}) {
  const events = [];
  const props = {
    questionSearchResults: [question()], questionSearchHasMore: false, questionSearchFilters: { ...emptyFilters },
    appliedQuestionSearchFilters: { ...emptyFilters }, isLearnerReadOnly: false, prerequisiteConceptOptions: [{ id: 'primary', name: 'Primary Concept' }, { id: 'related', name: 'Related Concept' }],
    availableTags: [{ id: 'tag1', name: 'Existing Tag', status: 'archived' }, { id: 'tag2', name: 'Active Tag', status: 'active' }],
    testingAngleOptions: ['General Understanding'], testingAngleVocabulary: [{ display_name: 'Applied Practice', storage_key: 'Clinical Application', reserved_names: ['Former practice name'] }],
    testingAngleLabel: key => key === 'Clinical Application' ? 'Applied Practice' : key,
    resolveTestingAngleFilter: key => key === 'Applied Practice' ? 'Clinical Application' : key,
    isSearchingQuestions: false, questionSearchError: '', personalCardEditorId: null, questionId: null, isSavingQuestion: false, questionSearchCursor: null,
    submitQuestionSearch: event => events.push(['submit', event]), updateQuestionSearchFilter: (key, value) => events.push(['filter', key, value]),
    clearQuestionSearch: () => events.push(['clear']), selectQuestionSearchResult: value => events.push(['open', value]), loadMoreQuestionSearchResults: () => events.push(['more']), ...overrides,
  };
  return { tree: CreatorQuestionSearchPanel(props), props, events };
}
const resultButtons = tree => nodes(tree).filter(n => n.type === 'button' && n.props.className === 'questionSearchResult');
const findButton = (tree, label) => { const matches = nodes(tree).filter(n => n.type === 'button' && normalize(n) === label); assert.equal(matches.length, 1, label); return matches[0]; };

// Exact approved markup inverses are appended below; neither handlers nor original hashes are regenerated.
const presentationHunks = [
  [
    "import { questionMarkdownSummary } from '@/components/MarkdownContent';\nimport { ArrowRight, FileText, Search } from 'lucide-react';\nimport { createCreatorEntityKey } from '@/lib/creator-entity-contracts';\n",
    "import { questionMarkdownSummary } from '@/components/MarkdownContent';\nimport { Search } from 'lucide-react';\nimport { createCreatorEntityKey } from '@/lib/creator-entity-contracts';\n"
  ],
  [
    "    <section\n      className={`${styles.panel} ${styles.questionSearchPanel} ${styles.searchDesign}`}\n      aria-labelledby=\"library-question-search-heading\"\n",
    "    <section\n      className={`${styles.panel} ${styles.questionSearchPanel}`}\n      aria-labelledby=\"library-question-search-heading\"\n"
  ],
  [
    "      <div className={styles.questionSearchHeading}>\n        <Search size={30} aria-hidden=\"true\" />\n        <div>\n",
    "      <div className={styles.questionSearchHeading}>\n        <div>\n"
  ],
  [
    "        </div>\n      </div>\n",
    "        </div>\n        <span className={styles.questionSearchCount}>\n          {questionSearchResults.length}\n          {questionSearchHasMore ? '+' : ''} loaded \u00b7 newest first\n        </span>\n      </div>\n"
  ],
  [
    "        onSubmit={submitQuestionSearch}\n        aria-labelledby=\"question-search-filters-heading\"\n      >\n",
    "        onSubmit={submitQuestionSearch}\n      >\n"
  ],
  [
    "      >\n        <h3 id=\"question-search-filters-heading\">Search Filters</h3>\n        <label className={styles.questionSearchText}>\n",
    "      >\n        <label className={styles.questionSearchText}>\n"
  ],
  [
    "\n      <section data-search-part=\"results-panel\" aria-labelledby=\"question-search-results-heading\">\n        <div data-search-part=\"results-heading\">\n          <h3 id=\"question-search-results-heading\">Search Results</h3>\n        <span className={styles.questionSearchCount}>\n          {questionSearchResults.length}\n          {questionSearchHasMore ? '+' : ''} loaded \u00b7 newest first\n        </span>\n        </div>\n      {questionSearchError ? (\n",
    "\n      {questionSearchError ? (\n"
  ],
  [
    "              >\n                <span data-search-part=\"result-icon\" aria-hidden=\"true\"><FileText size={24} /></span>\n                <span data-search-part=\"result-content\">\n                <span className={styles.questionSearchPrompt}>\n",
    "              >\n                <span className={styles.questionSearchPrompt}>\n"
  ],
  [
    "                )}\n                </span>\n                <span data-search-part=\"open-label\">\n                  Open in Editor <ArrowRight size={17} aria-hidden=\"true\" />\n                </span>\n              </button>\n",
    "                )}\n              </button>\n"
  ],
  [
    "      )}\n      </section>\n    </section>\n",
    "      )}\n    </section>\n"
  ]
];
function projectPresentation(value) {
  for (const [after, before] of [...presentationHunks].reverse()) {
    assert.equal(value.split(after).length, 2, 'Exact Search presentation exception must occur once');
    value = value.replace(after, before);
  }
  return value;
}

test('Search changes only the exact approved markup; all parent state, reads and editor handlers stay frozen', () => {
  assert.equal(hash(projectPresentation(source)), '4faa36106ad51356ed3d48099c937a0c45bb52f1e24b3497fd3d617c6c45c064');
  assert.equal(hash(projectSharedTopicSource('components/CreatorStudioV2Client.tsx', read('components/CreatorStudioV2Client.tsx'))), 'f90020cad0f8d329ceb3fc09f9220bb21a7f113e5ee8786a75768c23b1456816');
  assert.throws(() => projectPresentation(source.replace('onSubmit={submitQuestionSearch}', 'onSubmit={clearQuestionSearch}')), /Exact Search presentation exception/);
  assert.notEqual(hash(projectPresentation(source.replace('onClick={() => selectQuestionSearchResult(question)}', 'onClick={() => selectQuestionSearchResult(questionSearchResults[0])}'))), '4faa36106ad51356ed3d48099c937a0c45bb52f1e24b3497fd3d617c6c45c064');
  assert.doesNotMatch(source, /useEffect|useState|supabase|fetch\(|QuestionMediaContent|VerifiedMediaImage|content-media|dangerouslySetInnerHTML/);
});

test('all earlier workspace styles stay byte-exact and only Search receives responsive navy styles', () => {
  assert.equal(css.split(marker).length, 2);
  assert.equal(hash(css.slice(0, css.indexOf(marker))), '470165b0bfb0631adc2010ccb021cd6b785e65a2e006180f8179a7e0401a1d8f');
  const added = css.slice(css.indexOf(marker)).replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of added.matchAll(/([^{}]+)\{/g)) {
    const selector = match[1].trim();
    if (!selector.startsWith('@media')) for (const part of selector.split(',')) assert.ok(part.trim().startsWith('.searchDesign'), part);
  }
  for (const value of ['var(--creator-navy)', 'var(--creator-muted)', 'var(--creator-border)', 'var(--creator-soft)', ':focus-visible', ':disabled', "[aria-pressed='true']", '@media (hover: hover)', 'prefers-reduced-motion: reduce', 'max-width: 1120px', 'max-width: 900px', 'max-width: 520px', 'overflow: auto', 'scroll-padding-block', 'min-height: 44px', 'white-space: normal']) assert.ok(added.includes(value), value);
  assert.doesNotMatch(added, /(?:html|body|:root|\.questionDesign|\.tagManagerDesign|\.contentDesign|\.flaggedDesign)\s*[,{]|position:\s*fixed/);
});

test('eight existing native filters keep their exact values and parent-owned update callbacks', () => {
  const filters = { text: ' Île %_ ', difficulty: 'hard', primaryTestingAngle: 'Former practice name', additionalTestingAngle: 'Custom angle', primaryConceptId: 'primary', relatedConceptId: 'related', status: 'archived', tagId: 'tag1' };
  const h = render({ questionSearchFilters: filters });
  const names = [['text', 'text', 'input'], ['difficulty', 'difficulty', 'select'], ['primary-angle', 'primaryTestingAngle', 'input'], ['additional-angle', 'additionalTestingAngle', 'input'], ['primary-concept', 'primaryConceptId', 'select'], ['related-concept', 'relatedConceptId', 'select'], ['status', 'status', 'select'], ['tag', 'tagId', 'select']];
  for (const [suffix, key, type] of names) {
    const field = nodes(h.tree).find(n => n.props?.name === `question-search-${suffix}`);
    assert.ok(field, key); assert.equal(field.type, type); assert.equal(field.props.value, filters[key]);
    if (type === 'input') assert.equal(field.props.type, 'search');
    field.props.onChange({ target: { value: `unchanged-${key}` } });
    assert.deepEqual(h.events.at(-1), ['filter', key, `unchanged-${key}`]);
  }
  assert.equal(nodes(h.tree).filter(n => n.type === 'input' || n.type === 'select').length, 8);
});

test('Testing Angle datalists and complete Tag metadata keep historical and archived values selectable', () => {
  const h = render({ questionSearchResults: [question({ testingAngle: 'Historical custom', additionalTestingAngles: ['Custom additional'] })] });
  for (const suffix of ['primary-angle', 'additional-angle']) assert.equal(nodes(h.tree).find(n => n.props?.name === `question-search-${suffix}`).props.list, 'question-search-angle-options');
  const datalist = nodes(h.tree).find(n => n.type === 'datalist');
  const options = nodes(datalist).filter(n => n.type === 'option').map(n => n.props.value);
  for (const expected of ['Applied Practice', 'Clinical Application', 'Former practice name', 'General Understanding', 'Historical custom', 'Custom additional']) assert.ok(options.includes(expected));
  const tagSelect = nodes(h.tree).find(n => n.props?.name === 'question-search-tag');
  assert.deepEqual(nodes(tagSelect).filter(n => n.type === 'option').map(n => [n.props.value, normalize(n)]), [['', 'All tags'], ['tag1', 'Existing Tag (Archived)'], ['tag2', 'Active Tag']]);
});

test('Search form, Enter submission and the single Clear action retain their existing callbacks and busy states', () => {
  const h = render(); const form = nodes(h.tree).find(n => n.type === 'form');
  assert.equal(form.props.onSubmit, h.props.submitQuestionSearch);
  const event = { preventDefault() {} }; form.props.onSubmit(event); assert.equal(h.events[0][1], event);
  assert.equal(findButton(h.tree, 'Search Questions').props.type, 'submit');
  assert.equal(findButton(h.tree, 'Clear filters').props.onClick, h.props.clearQuestionSearch);
  findButton(h.tree, 'Clear filters').props.onClick(); assert.deepEqual(h.events.at(-1), ['clear']);
  assert.equal(nodes(h.tree).filter(n => n.type === 'button' && /Clear/.test(normalize(n))).length, 1);
  const busy = render({ isSearchingQuestions: true });
  assert.equal(findButton(busy.tree, 'Searching…').props.disabled, true); assert.equal(findButton(busy.tree, 'Clear filters').props.disabled, true);
});

test('each result remains one native button with its full exact record and existing selected identity', () => {
  const official = question({ id: 'shared' });
  const card = question({ id: 'shared', source: 'personal', kind: 'card', conceptId: null, prompt: 'My Card', status: null, difficulty: null, testingAngle: null, relatedConcepts: [], additionalTestingAngles: [], tags: [] });
  const h = render({ questionSearchResults: [official, card], questionId: 'shared' });
  const rows = resultButtons(h.tree); assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(n => n.props['aria-pressed']), [true, false]);
  rows.forEach((row, index) => {
    assert.equal(row.props.type, 'button'); assert.equal(row.props.tabIndex, undefined);
    assert.equal(nodes(row).filter(n => n.type === 'button' || n.type === 'a' || n.props?.tabIndex !== undefined).length, 1);
    assert.equal(byPart(row, 'open-label').length, 1); assert.equal(normalize(byPart(row, 'open-label')[0]), 'Open in Editor');
    row.props.onClick(); assert.equal(h.events.at(-1)[1], [official, card][index]);
  });
  const selectedCard = render({ questionSearchResults: [official, card], personalCardEditorId: 'shared' });
  assert.deepEqual(resultButtons(selectedCard.tree).map(n => n.props['aria-pressed']), [false, true]);
  assert.ok(resultButtons(render({ isSavingQuestion: true }).tree).every(n => n.props.disabled));
});

test('official summaries retain format interpretation while personal Cards retain literal Front summaries', () => {
  const records = [question({ prompt: 'Legacy **literal** [label](https://example.com)', promptFormat: 'legacy' }), question({ id: 'v1', prompt: '**Bold** and [safe](https://example.com)', promptFormat: 'visual_markdown_v1' }), question({ id: 'personal', source: 'personal', kind: 'card', prompt: '**Personal source**', promptFormat: undefined })];
  const h = render({ questionSearchResults: records });
  const prompts = nodes(h.tree).filter(n => n.props?.className === 'questionSearchPrompt').map(normalize);
  assert.deepEqual(prompts, ['Legacy **literal** [label](https://example.com)', 'Bold and safe', '**Personal source**']);
  assert.ok(!text(h.tree).includes('Private answer remains in the editor'));
  assert.equal(nodes(h.tree).filter(n => n.type === 'img' || n.type === 'a').length, 0);
});

test('all current metadata and applied-filter matches remain visible without new retrieval or hidden more controls', () => {
  const h = render({ appliedQuestionSearchFilters: { ...emptyFilters, primaryConceptId: 'primary', relatedConceptId: 'related', primaryTestingAngle: 'Applied Practice', additionalTestingAngle: 'General Understanding' } });
  const row = resultButtons(h.tree)[0]; const content = normalize(row);
  for (const expected of ['published', 'medium', 'Primary Concept: Primary Concept', 'Primary Angle: Applied Practice', 'Related: Related Concept', 'Additional: General Understanding', 'Tags: Existing Tag (Archived)', 'Primary Concept match', 'Related Concept match', 'Primary Angle match', 'Additional Angle match']) assert.ok(content.includes(expected), expected);
  assert.equal(nodes(row).filter(n => n.type === 'button').length, 1);
  assert.doesNotMatch(content, /\+\d+ more|Private answer/);
});

test('loaded counts and conditional keyset continuation remain truthful for mixed results', () => {
  for (const [more, cursor, expected] of [[false, null, false], [true, null, false], [true, { createdAt: '2026-01-01', id: 'q1' }, true]]) {
    const h = render({ questionSearchHasMore: more, questionSearchCursor: cursor });
    assert.equal(nodes(h.tree).find(n => n.props?.className === 'questionSearchCount').props.children.flat(Infinity).join('').trim(), `1${more ? '+' : ''} loaded · newest first`);
    const load = nodes(h.tree).find(n => n.type === 'button' && normalize(n) === 'Load more Questions');
    assert.equal(!!load, expected);
    if (load) { assert.equal(load.props.onClick, h.props.loadMoreQuestionSearchResults); load.props.onClick(); assert.deepEqual(h.events.at(-1), ['more']); }
    assert.doesNotMatch(normalize(h.tree), /Sort by|Previous|Next page|of \d+ results|questions found/);
  }
});

test('loading, empty and error branches keep their original messages and accessible state', () => {
  const loading = render({ questionSearchResults: [], isSearchingQuestions: true });
  assert.match(text(loading.tree), /Loading Library Questions…/); assert.doesNotMatch(text(loading.tree), /No Questions match/);
  const region = nodes(loading.tree).find(n => n.props?.['aria-label'] === 'Library Question search results');
  assert.equal(region.props['aria-busy'], true); assert.equal(region.props.tabIndex, 0);
  const empty = render({ questionSearchResults: [] }); assert.match(text(empty.tree), /No Questions match these Library filters\./);
  const failed = render({ questionSearchError: 'Permission/read failure' });
  assert.equal(normalize(nodes(failed.tree).find(n => n.props?.role === 'alert')), 'Permission/read failure'); assert.equal(resultButtons(failed.tree).length, 0);
  assert.ok(findButton(failed.tree, 'Search Questions'));
});

test('native learner-readonly restrictions remain exact and learner Creator never mounts staff Search', () => {
  const h = render({ isLearnerReadOnly: true });
  for (const name of ['additional-angle', 'related-concept', 'status']) assert.equal(nodes(h.tree).find(n => n.props?.name === `question-search-${name}`).props.disabled, true);
  assert.equal(nodes(h.tree).find(n => n.props?.name === 'question-search-status').props.value, 'published');
  const learner = editor({ role: 'learner', placed: true }); learner.render().setActiveCreatorTab('search');
  assert.equal(nodes(expandChrome(learner.render().tree)).some(n => n.props?.className?.split(' ').includes('searchDesign')), false);
});

for (const role of ['admin', 'editor']) test(`${role}: the existing staff Search tab uses the isolated layout without changing editor state`, () => {
  const h = editor({ role, placed: true }); let e = h.render();
  e.setActiveCreatorTab('search'); e = h.render();
  const tree = expandChrome(e.tree); const search = nodes(tree).find(n => n.props?.className?.split(' ').includes('searchDesign'));
  assert.ok(search); assert.match(text(search), /Search Filters/); assert.match(text(search), /Search Results/);
  assert.equal(e.questionId, null); assert.equal(e.questionPrompt, ''); assert.equal(e.questionAnswer, '');
  assert.equal(h.calls.length, 0, 'Rendering itself performs no RPC');
});

test('out-of-order Search completion cannot replace the newer result or retained Question draft', async () => {
  const pending = [];
  const h = editor({ response(name, payload) {
    assert.equal(name, 'search_creator_questions_with_media');
    assert.equal(payload.p_active_library_id, 'library');
    return new Promise(resolve => pending.push(resolve));
  } });
  h.render().setActiveCreatorTab('search');
  h.render().setQuestionPrompt('Unsaved Front'); h.render().setQuestionAnswer('Unsaved Answer');
  const first = h.render().loadQuestionSearchPage({ ...emptyFilters, text: 'older' }, null, false);
  const second = h.render().loadQuestionSearchPage({ ...emptyFilters, text: 'newer' }, null, false);
  const row = id => ({ id, concept_id: 'concept', primary_concept_name: 'Concept', prompt: id, prompt_format: 'legacy', question_type: 'short_answer', status: 'published', difficulty: 'medium', testing_angle: 'General Understanding', current_version_id: `version-${id}`, question_accepted_answers: [{ id: `answer-${id}`, answer_text: `Answer ${id}`, answer_format: 'legacy' }] });
  pending[1]({ data: [row('newer')], error: null }); await second;
  pending[0]({ data: [row('older')], error: null }); await first;
  const current = h.render();
  assert.deepEqual(Array.from(current.questionSearchResults, q => q.id), ['newer']);
  assert.equal(current.questionSearchResults[0].currentVersionId, 'version-newer');
  assert.equal(current.questionPrompt, 'Unsaved Front'); assert.equal(current.questionAnswer, 'Unsaved Answer');
  assert.equal(current.questionId, null);
  assert.match(text(expandChrome(current.tree)), /newer/); assert.doesNotMatch(text(expandChrome(current.tree)), /older/);
});

test('failed Search keeps its existing error branch and normal Search retry restores exact results', async () => {
  let fail = true;
  const h = editor({ response(name) {
    assert.equal(name, 'search_creator_questions_with_media');
    return fail ? { data: null, error: { message: 'Disposable Search read denied' } } : { data: [{ id: 'retry', concept_id: 'concept', primary_concept_name: 'Concept', prompt: 'Recovered Question', prompt_format: 'legacy', current_version_id: 'retry-version', question_accepted_answers: [{ answer_text: 'Recovered Answer', answer_format: 'legacy' }] }], error: null };
  } });
  h.render().setActiveCreatorTab('search');
  await h.render().loadQuestionSearchPage(emptyFilters, null, false);
  const failed = expandChrome(h.render().tree);
  assert.equal(normalize(nodes(failed).find(n => n.props?.role === 'alert')), 'Disposable Search read denied');
  assert.equal(resultButtons(failed).length, 0);
  fail = false; await h.render().loadQuestionSearchPage(emptyFilters, null, false);
  const recovered = expandChrome(h.render().tree);
  assert.equal(resultButtons(recovered).length, 2); assert.match(text(recovered), /Recovered Question/);
  assert.deepEqual(Array.from(h.render().questionSearchResults, q => q.id), ['retry', 'mine-card'], 'Recovery retains the existing personal Card merge');
  assert.doesNotMatch(text(recovered), /Disposable Search read denied/);
  assert.equal(h.render().questionId, null);
});
