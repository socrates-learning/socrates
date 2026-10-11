import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { questionContentBoundary } from './fixtures/question-media-authoring.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
const plain = value => JSON.parse(JSON.stringify(value));
const source = read('components/StudyCreatorFlaggedBrowser.tsx');
const css = read('components/CreatorStudioV2Client.module.css');
const marker = '\n/* Approved staff Flagged-only presentation;';
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = tree => typeof tree === 'string' || typeof tree === 'number' ? String(tree) : !tree ? '' : Array.isArray(tree) ? tree.map(text).join(' ') : text(tree.props?.children);
const jsx = { jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }), Fragment: 'fragment' };
const styleModule = { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
const settle = () => new Promise(resolve => setImmediate(resolve));
const flags = [
  { id: 'f1', question_id: 'q1', personal_card_id: null, note: 'Preserved note with Unicode — café', created_at: '2026-10-09T12:34:56Z' },
  { id: 'f2', question_id: 'q2', personal_card_id: null, note: null, created_at: '2026-10-08T12:34:56Z' },
  { id: 'f3', question_id: null, personal_card_id: 'card1', note: 'Personal note', created_at: '2026-10-07T12:34:56Z' },
  { id: 'f4', question_id: null, personal_card_id: 'card2', note: null, created_at: '2026-10-06T12:34:56Z' },
];
const questions = [
  { id: 'q1', concept_id: 'concept1', prompt: '## Rich Question', prompt_format: 'visual_markdown_v1', difficulty: 'medium', testing_angle: 'General Understanding', question_media_hint: { front: 1 } },
  { id: 'q2', concept_id: 'concept2', prompt: 'Legacy **literal** Question', prompt_format: 'legacy', difficulty: 'easy', testing_angle: null },
];
const concepts = [{ id: 'concept1', name: 'Concept Alpha' }, { id: 'concept2', name: 'Concept Beta' }];
const material = { topics: [], overlays: [], concepts: [{ id: 'mine', name: 'My Concept' }], cards: [{ id: 'card1', concept_id: 'mine', question: 'Concept-backed Front', answer: 'Concept-backed Back' }], standaloneCards: [{ id: 'card2', concept_id: null, question: '**Standalone Front**', answer: '*Standalone Back*' }] };

function mount({ learner = false, neutral = true, navy = true, initialFlags = flags, questionRows = questions, failure = '', deleteFailure = false } = {}) {
  const states = [], reads = [], writes = [], opened = []; let cursor = 0, load, cancelled = 0, currentFlags = [...initialFlags];
  const capability = { pending: false, busy: false, error: '', open: async (...args) => opened.push(args), cancel: () => cancelled++ };
  const props = { ownerId: 'actor', material, learnerPresentation: learner, neutralPresentation: neutral,
    officialQuestionEditor: capability, navyPresentationClassName: navy ? 'flaggedDesign' : undefined };
  const database = { from(table) {
    assert.ok(['study_candidate_flags', 'questions', 'concepts'].includes(table), `Unexpected table: ${table}`);
    const call = { table, columns: null, filters: [], order: null }; let deletion = false;
    const query = {
      select(columns) { call.columns = columns; return query; },
      eq(key, value) { call.filters.push([key, value]); return query; },
      in(key, value) { call.filters.push([key, plain(value)]); return query; },
      order(key, options) { call.order = [key, plain(options)]; return query; },
      delete() { deletion = true; return query; },
      then(resolve) {
        if (deletion) {
          writes.push(call);
          if (!deleteFailure) currentFlags = currentFlags.filter(flag => flag.id !== call.filters.find(([key]) => key === 'id')[1]);
          return Promise.resolve({ error: deleteFailure ? { message: 'Unflag failed' } : null }).then(resolve);
        }
        reads.push(call);
        return Promise.resolve({ data: table === 'study_candidate_flags' ? currentFlags : table === 'questions' ? questionRows : concepts,
          error: failure === table ? { message: `Failed ${table}` } : null }).then(resolve);
      },
    };
    return query;
  } };
  const modules = {
    react: { useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; }, useEffect() {}, useMemo: fn => fn(), useCallback(fn) { load = fn; return fn; } },
    'react/jsx-runtime': jsx,
    '@/lib/supabase': { supabase: database },
    '@/components/QuestionMediaContent': questionContentBoundary,
    '@/components/MarkdownContent': { MarkdownContent: 'markdown', cardMarkdownSummary: value => value, questionMarkdownSummary: value => value, questionMarkdownKind: (_value, format) => format === 'visual_markdown_v1' ? 'block' : 'plain' },
    './StudyCreatorIcon': { StudyCreatorIcon: 'icon' },
    './StudyCreatorClient.module.css': styleModule,
  };
  const context = { exports: {}, require(name) { assert.ok(Object.hasOwn(modules, name), `Unexpected Flagged dependency: ${name}`); return modules[name]; } };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  const render = () => { cursor = 0; return context.exports.StudyCreatorFlaggedBrowser(props); };
  return { render, props, capability, reads, writes, opened, cancelled: () => cancelled, async load() { render(); await load(); return render(); } };
}
const byPart = (tree, part) => nodes(tree).filter(n => n.props?.['data-flagged-part'] === part);
const buttons = tree => nodes(tree).filter(n => n.type === 'button');
const button = (tree, name) => { const found = buttons(tree).filter(n => text(n).trim() === name); assert.equal(found.length, 1, name); return found[0]; };

test('staff opts in through the existing Flagged wrapper; the learner invocation stays unchanged', () => {
  const modules = { 'react/jsx-runtime': jsx, '@/components/StudyCreatorFlaggedBrowser': { StudyCreatorFlaggedBrowser() {} }, '../CreatorStudioV2Client.module.css': styleModule };
  const context = { exports: {}, require(name) { assert.ok(Object.hasOwn(modules, name), `Unexpected Chrome dependency: ${name}`); return modules[name]; } };
  vm.runInNewContext(ts.transpileModule(read('components/creator/CreatorStudioChrome.tsx'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  const capability = { open() {}, cancel() {}, pending: false, busy: false, error: '' };
  for (const learnerPresentation of [false, true]) {
    const node = context.exports.CreatorStudioFlaggedTab({ material, ownerId: 'actor', learnerPresentation, officialQuestionEditor: capability });
    assert.equal(node.props.material, material); assert.equal(node.props.ownerId, 'actor'); assert.equal(node.props.neutralPresentation, true);
    assert.equal(node.props.navyPresentationClassName, learnerPresentation ? undefined : 'flaggedDesign');
    assert.equal(node.props.officialQuestionEditor, learnerPresentation ? undefined : capability);
  }
});

test('navy Details keep every field, interpretation, Front media hint and exact existing read', async () => {
  const h = mount(); const tree = await h.load();
  assert.equal(tree.props.className, 'flaggedWorkspace flaggedDesign');
  assert.equal(byPart(tree, 'notice').length, 1);
  assert.equal(byPart(tree, 'row').length, 4); assert.equal(text(byPart(tree, 'count')[0]), '4');
  assert.deepEqual(plain(h.reads), [
    { table: 'study_candidate_flags', columns: 'id, question_id, personal_card_id, note, created_at', filters: [['user_id', 'actor']], order: ['created_at', { ascending: false }] },
    { table: 'questions', columns: 'id, concept_id, prompt, prompt_format, difficulty, testing_angle, question_media_hint', filters: [['id', ['q1', 'q2']]], order: null },
    { table: 'concepts', columns: 'id, name', filters: [['id', ['concept1', 'concept2']]], order: null },
  ]);
  const markdown = nodes(tree).find(n => n.type === 'markdown');
  assert.deepEqual(plain(markdown.props), { markdown: questions[0].prompt, mode: 'question', format: 'visual_markdown_v1' });
  const media = nodes(tree).filter(n => n.props?.surface === 'front'); assert.equal(media.length, 1);
  assert.deepEqual(plain(media[0].props), { questionId: 'q1', hint: { front: 1 }, surface: 'front', prompt: questions[0].prompt });
  assert.equal(nodes(tree).some(n => n.props?.surface === 'answer'), false);
  assert.match(text(tree), /Preserved note with Unicode — café/);
  assert.ok(text(tree).includes(new Date(flags[0].created_at).toLocaleString()));
  assert.match(text(byPart(tree, 'metadata')[0]), /medium.*General Understanding/);
  assert.doesNotMatch(text(tree), /All \(|Questions \(|Cards \(|Next page|Previous page|Tags/);
  assert.equal(button(tree, 'Edit Question').props.type, 'button'); button(tree, 'Edit Question').props.onClick();
  assert.deepEqual(h.opened, [['q1', 'concept1']]); assert.equal(h.writes.length, 0);
});

test('search and selection preserve the loaded count, retained Details and no-write contract', async () => {
  const h = mount(); await h.load();
  const search = value => nodes(h.render()).find(n => n.props?.['aria-label'] === 'Search flagged material').props.onChange({ target: { value } });
  for (const value of ['  CAFÉ  ', 'concept alpha', 'rich question']) {
    search(value); assert.equal(byPart(h.render(), 'row').length, 1); assert.equal(text(byPart(h.render(), 'count')[0]), '4');
  }
  search('absent'); assert.equal(byPart(h.render(), 'row').length, 0); assert.match(text(h.render()), /No flagged material matches your search/);
  assert.ok(button(h.render(), 'Edit Question')); assert.match(text(h.render()), /Preserved note/);
  search(''); const row = byPart(h.render(), 'row')[1]; assert.equal(row.props.type, 'button'); row.props.onClick();
  assert.equal(h.cancelled(), 1); assert.equal(byPart(h.render(), 'row')[1].props['aria-pressed'], true);
  assert.equal(byPart(h.render(), 'row')[0].props['aria-pressed'], false);
  assert.equal(nodes(h.render()).find(n => n.type === 'markdown').props.format, 'legacy');
  assert.equal(h.reads.length, 3); assert.equal(h.writes.length, 0);
});

test('both personal Card forms preserve Front/Back and never gain official editing or source badges', async () => {
  const h = mount(); await h.load();
  for (const index of [2, 3]) {
    byPart(h.render(), 'row')[index].props.onClick(); const tree = h.render();
    assert.equal(buttons(tree).some(n => text(n) === 'Edit Question'), false);
    assert.ok(button(tree, 'Unflag')); assert.equal(byPart(tree, 'metadata').length, 0);
    assert.equal(nodes(tree).some(n => /OwnerMark|personalHeadingIcon/.test(n.props?.className || '')), false);
    assert.equal(nodes(tree).some(n => n.props?.surface === 'front'), false);
    if (index === 2) assert.match(text(tree), /Concept-backed Front.*Concept-backed Back/);
    else assert.deepEqual(plain(nodes(tree).filter(n => n.type === 'markdown').map(n => n.props)), [
      { markdown: '**Standalone Front**', mode: 'card' }, { markdown: '*Standalone Back*', mode: 'card' },
    ]);
  }
  assert.equal(h.writes.length, 0);
});

test('Unflag is immediate, owner-qualified, preserves other flags and reloads the existing next selection', async () => {
  const h = mount(); await h.load(); button(h.render(), 'Unflag').props.onClick();
  assert.equal(button(h.render(), 'Removing…').props.disabled, true);
  await settle(); assert.equal(h.writes.length, 1);
  assert.deepEqual(plain(h.writes[0]), { table: 'study_candidate_flags', columns: null, filters: [['id', 'f1'], ['user_id', 'actor']], order: null });
  assert.equal(h.cancelled(), 1); assert.equal(byPart(h.render(), 'row').length, 3);
  assert.match(text(h.render()), /Legacy \*\*literal\*\* Question/); assert.equal(text(byPart(h.render(), 'count')[0]), '3');
});

test('Unflag failure preserves the flag, note and retryable existing action', async () => {
  const h = mount({ deleteFailure: true }); await h.load(); button(h.render(), 'Unflag').props.onClick(); await settle();
  assert.equal(byPart(h.render(), 'row').length, 4); assert.match(text(h.render()), /Unflag failed.*Preserved note/s);
  assert.equal(button(h.render(), 'Unflag').props.disabled, false);
});

test('pending and busy edit protections and feedback stay independent from notes and immediate Unflag', async () => {
  const h = mount(); await h.load();
  h.capability.pending = true; assert.equal(button(h.render(), 'Opening Question…').props.disabled, true);
  assert.ok(nodes(h.render()).find(n => n.props?.role === 'status'));
  h.capability.pending = false; h.capability.busy = true; assert.equal(button(h.render(), 'Edit Question').props.disabled, true);
  h.capability.busy = false; h.capability.error = 'Current draft preserved';
  assert.ok(nodes(h.render()).find(n => n.props?.role === 'alert' && text(n) === 'Current draft preserved'));
  assert.match(text(h.render()), /Preserved note/); assert.equal(button(h.render(), 'Unflag').props.disabled, false);
});

test('loading, read failures, empty results and unavailable targets retain existing controls and fallbacks', async () => {
  const loading = mount(); assert.match(text(loading.render()), /Loading your flags/); assert.equal(buttons(loading.render()).length, 0);
  for (const failure of ['study_candidate_flags', 'questions', 'concepts']) {
    const h = mount({ failure }); await h.load(); assert.ok(nodes(h.render()).find(n => n.props?.role === 'alert' && text(n) === `Failed ${failure}`)); assert.equal(h.writes.length, 0);
  }
  const empty = mount({ initialFlags: [] }); await empty.load(); assert.match(text(empty.render()), /Nothing is flagged yet/); assert.equal(empty.reads.length, 1);
  const missing = mount({ questionRows: [] }); await missing.load(); assert.match(text(missing.render()), /Question no longer available/);
  assert.equal(buttons(missing.render()).some(n => text(n) === 'Edit Question'), false); assert.ok(button(missing.render(), 'Unflag'));
});

test('learner and legacy presentations remain opt-out with original labels and authority', async () => {
  const learner = mount({ learner: true }); await learner.load();
  assert.equal(learner.render().props.className, 'flaggedWorkspace'); assert.equal(byPart(learner.render(), 'notice').length, 0);
  assert.equal(byPart(learner.render(), 'metadata').length, 0); assert.equal(buttons(learner.render()).some(n => text(n) === 'Edit Question'), false);
  const legacy = mount({ navy: false, neutral: false }); await legacy.load();
  assert.equal(legacy.render().props.className, 'flaggedWorkspace'); assert.equal(byPart(legacy.render(), 'row').length, 0); assert.match(text(legacy.render()), /Socrates.*Flagged/);
  const cardRow = buttons(legacy.render()).find(n => text(n).includes('Concept-backed Front')); cardRow.props.onClick(); assert.match(text(legacy.render()), /Mine.*Flagged/);
});

test('only scoped staff CSS changes layout, with accessible states and responsive scrolling', () => {
  assert.equal(css.split(marker).length, 2);
  const searchMarker = '\n/* Approved Search-only presentation;';
  assert.equal(css.split(searchMarker).length, 2);
  const flaggedBlock = css.slice(css.indexOf(marker), css.indexOf(searchMarker));
  assert.equal(hash(flaggedBlock), '6f0d0ad968d58bc6c13c582fb61938858c0f490de201f566c26853331a63ada2', 'Original complete Flagged block remains exact');
  const added = flaggedBlock.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of added.matchAll(/([^{}]+)\{/g)) {
    const selector = match[1].trim();
    if (!selector.startsWith('@media')) assert.ok(selector.startsWith('.flaggedDesign'), selector);
  }
  for (const value of [':focus-visible', ':disabled', "[aria-pressed='true']", '@media (hover: hover)', 'prefers-reduced-motion: reduce', 'max-width: 1120px', 'max-width: 780px', 'max-width: 520px', 'overflow: auto', "[data-flagged-action='edit']", "[data-flagged-action='unflag']"]) assert.ok(added.includes(value), value);
  assert.doesNotMatch(added, /(?:html|body|:root|\.questionDesign|\.tagManagerDesign|\.contentDesign)\s*[,{]/);
  assert.doesNotMatch(added, /\bimg\s*[{,]|position:\s*fixed|overflow:\s*hidden/);
  assert.match(added, /\.flaggedDesign\[data-flagged-workspace\] \[data-flagged-part='intro'\] \{[^}]*margin: 0 0 18px;/, 'Staff panel inset overrides legacy negative margins without changing shared styles');
});

// Exact reviewed presentation inverses; the original complete source stays authoritative.
const presentationHunks = [
  [
    "  neutralPresentation?: boolean;\n  learnerPresentation?: boolean;\n  officialQuestionEditor?: FlaggedQuestionEditor;\n  navyPresentationClassName?: string;\n};\n\nfunction messageFor(error: unknown) {\n",
    "  neutralPresentation?: boolean;\n  learnerPresentation?: boolean;\n  officialQuestionEditor?: FlaggedQuestionEditor;\n};\n\nfunction messageFor(error: unknown) {\n"
  ],
  [
    "  neutralPresentation = false,\n  learnerPresentation = false,\n  officialQuestionEditor,\n  navyPresentationClassName,\n}: StudyCreatorFlaggedBrowserProps) {\n  const [flags, setFlags] = useState<FlagRow[]>([]);\n  const [officialQuestions, setOfficialQuestions] = useState<OfficialQuestion[]>([]);\n",
    "  neutralPresentation = false,\n  learnerPresentation = false,\n  officialQuestionEditor,\n}: StudyCreatorFlaggedBrowserProps) {\n  const [flags, setFlags] = useState<FlagRow[]>([]);\n  const [officialQuestions, setOfficialQuestions] = useState<OfficialQuestion[]>([]);\n"
  ],
  [
    "    setRemovingId(null);\n  }\n\n  const navyPresentation = Boolean(navyPresentationClassName) && !learnerPresentation;\n\n  return (\n    <div className={`${styles.flaggedWorkspace}${navyPresentation ? ` ${navyPresentationClassName}` : ''}`} data-flagged-workspace={navyPresentation ? '' : undefined}>\n      {navyPresentation && <aside data-flagged-part=\"notice\" aria-label=\"About your flags\">\n        <span aria-hidden=\"true\"><Icon name=\"flag\" /></span>\n        <div><strong>Flagged items help you review content you want to revisit.</strong><p>Select an item to view its details, open the Question editor when authorized, or remove your flag.</p></div>\n      </aside>}\n      <section className={styles.flaggedListPane} aria-label=\"Flagged material\">\n        <div className={styles.workspaceSectionIntro} data-flagged-part={navyPresentation ? 'intro' : undefined}>\n          <div>\n            <h2>1. Flagged Material</h2>\n            <p>Review Questions and Cards you saved for later.</p>\n          </div>\n          <span className={styles.flagCount} data-flagged-part={navyPresentation ? 'count' : undefined}>{flags.length}</span>\n        </div>\n        <label className={styles.searchField} data-flagged-part={navyPresentation ? 'search' : undefined}>\n          <span aria-hidden=\"true\"><Icon name=\"search\" /></span>\n          <input\n            aria-label=\"Search flagged material\"\n",
    "    setRemovingId(null);\n  }\n\n  return (\n    <div className={styles.flaggedWorkspace}>\n      <section className={styles.flaggedListPane} aria-label=\"Flagged material\">\n        <div className={styles.workspaceSectionIntro}>\n          <div>\n            <h2>1. Flagged Material</h2>\n            <p>Review Questions and Cards you saved for later.</p>\n          </div>\n          <span className={styles.flagCount}>{flags.length}</span>\n        </div>\n        <label className={styles.searchField}>\n          <span aria-hidden=\"true\"><Icon name=\"search\" /></span>\n          <input\n            aria-label=\"Search flagged material\"\n"
  ],
  [
    "          />\n        </label>\n        {error && <p className={styles.flagError} role=\"alert\">{error}</p>}\n        <div className={styles.flaggedList} data-flagged-part={navyPresentation ? 'list' : undefined} tabIndex={navyPresentation ? 0 : undefined} role={navyPresentation ? 'region' : undefined} aria-label={navyPresentation ? 'Flagged items' : undefined}>\n          {isLoading && <div className={styles.inlineEmpty}>Loading your flags\u2026</div>}\n          {!isLoading && visibleFlags.map((item) => (\n            <button\n              className={`${styles.flaggedRow} ${selectedFlagId === item.flag.id ? styles.selectedFlag : ''}`}\n              data-flagged-part={navyPresentation ? 'row' : undefined}\n              aria-pressed={navyPresentation ? selectedFlagId === item.flag.id : undefined}\n              style={neutralPresentation ? { gridTemplateColumns: 'minmax(0, 1fr) 18px' } : undefined}\n              key={item.flag.id}\n              onClick={() => {\n",
    "          />\n        </label>\n        {error && <p className={styles.flagError} role=\"alert\">{error}</p>}\n        <div className={styles.flaggedList}>\n          {isLoading && <div className={styles.inlineEmpty}>Loading your flags\u2026</div>}\n          {!isLoading && visibleFlags.map((item) => (\n            <button\n              className={`${styles.flaggedRow} ${selectedFlagId === item.flag.id ? styles.selectedFlag : ''}`}\n              style={neutralPresentation ? { gridTemplateColumns: 'minmax(0, 1fr) 18px' } : undefined}\n              key={item.flag.id}\n              onClick={() => {\n"
  ],
  [
    "      </section>\n\n      <section className={styles.flaggedDetailPane} aria-label=\"Flagged item review\">\n        <div className={styles.workspaceSectionIntro} data-flagged-part={navyPresentation ? 'intro' : undefined}>\n          <div>\n            <h2>2. Details</h2>\n            <p>{neutralPresentation ? 'Review the selected Question.' : 'Review the selected Question or Card.'}</p>\n          </div>\n        </div>\n        <div className={`${styles.selectionHeading} ${styles.sectionSelection}`} data-flagged-part={navyPresentation ? 'selection' : undefined}>\n          <span className={`${styles.headingIcon} ${!neutralPresentation && selected?.owner === 'personal' ? styles.personalHeadingIcon : styles.purpleIcon}`}><Icon name=\"flag\" /></span>\n          <div><p>{selected ? (neutralPresentation ? 'Flagged' : `${selected.owner === 'official' ? 'Socrates' : 'Mine'} \u00b7 Flagged`) : 'Selected Material'}</p><h2>{selected?.context ?? 'Choose flagged material'}</h2></div>\n        </div>\n        <div className={styles.inspectorBody} data-flagged-part={navyPresentation ? 'details' : undefined}>\n          {selected ? (\n            <div className={styles.flagReviewCard} data-flagged-part={navyPresentation ? 'review' : undefined}>\n              <div><span>{neutralPresentation || selected.owner === 'official' ? 'Question' : 'Card'}</span>{selected.card?.concept_id === null ? <MarkdownContent markdown={selected.title} mode=\"card\" /> : selected.question && questionMarkdownKind(selected.title, selected.question.prompt_format) === 'block' ? <MarkdownContent markdown={selected.title} mode=\"question\" format={selected.question.prompt_format} /> : <p>{selected.question ? <MarkdownContent markdown={selected.title} mode=\"question\" format={selected.question.prompt_format} /> : selected.title}</p>}</div>\n              {selected.question && <QuestionMediaContent questionId={selected.question.id} hint={selected.question.question_media_hint} surface=\"front\" prompt={selected.question.prompt} />}\n              {selected.card && <div><span>Answer</span>{selected.card.concept_id === null ? <MarkdownContent markdown={selected.card.answer} mode=\"card\" /> : <p>{selected.card.answer}</p>}</div>}\n              {selected.question && !learnerPresentation && <div className={styles.flagMetadata} data-flagged-part={navyPresentation ? 'metadata' : undefined}><span>{selected.question.difficulty ?? 'Unspecified difficulty'}</span><span>{selected.question.testing_angle ?? 'General angle'}</span></div>}\n              {selected.flag.note && <div><span>Your note</span><p>{selected.flag.note}</p></div>}\n              <div><span>Flagged</span><p>{new Date(selected.flag.created_at).toLocaleString()}</p></div>\n              {!learnerPresentation && selected.question && officialQuestionEditor && <>\n                <button className={styles.secondary} data-flagged-action={navyPresentation ? 'edit' : undefined} disabled={officialQuestionEditor.pending || officialQuestionEditor.busy || removingId !== null}\n                  onClick={() => void officialQuestionEditor.open(selected.question!.id, selected.question!.concept_id)} type=\"button\">\n                  {officialQuestionEditor.pending ? 'Opening Question\u2026' : 'Edit Question'}\n                </button>\n                {officialQuestionEditor.pending && <p role=\"status\" data-flagged-part={navyPresentation ? 'feedback' : undefined}>Loading the Question editor\u2026</p>}\n                {officialQuestionEditor.error && <p className={styles.flagError} role=\"alert\" data-flagged-part={navyPresentation ? 'feedback' : undefined}>{officialQuestionEditor.error}</p>}\n              </>}\n              <button className={styles.dangerButton} data-flagged-action={navyPresentation ? 'unflag' : undefined} disabled={removingId === selected.flag.id} onClick={() => void unflag(selected.flag.id)} type=\"button\">{removingId === selected.flag.id ? 'Removing\u2026' : 'Unflag'}</button>\n            </div>\n          ) : (\n            <div className={styles.inlineEmpty}>{neutralPresentation ? 'Select a flagged Question to review it.' : 'Select a flagged Question or personal Card to review it.'}</div>\n",
    "      </section>\n\n      <section className={styles.flaggedDetailPane} aria-label=\"Flagged item review\">\n        <div className={styles.workspaceSectionIntro}>\n          <div>\n            <h2>2. Details</h2>\n            <p>{neutralPresentation ? 'Review the selected Question.' : 'Review the selected Question or Card.'}</p>\n          </div>\n        </div>\n        <div className={`${styles.selectionHeading} ${styles.sectionSelection}`}>\n          <span className={`${styles.headingIcon} ${!neutralPresentation && selected?.owner === 'personal' ? styles.personalHeadingIcon : styles.purpleIcon}`}><Icon name=\"flag\" /></span>\n          <div><p>{selected ? (neutralPresentation ? 'Flagged' : `${selected.owner === 'official' ? 'Socrates' : 'Mine'} \u00b7 Flagged`) : 'Selected Material'}</p><h2>{selected?.context ?? 'Choose flagged material'}</h2></div>\n        </div>\n        <div className={styles.inspectorBody}>\n          {selected ? (\n            <div className={styles.flagReviewCard}>\n              <div><span>{neutralPresentation || selected.owner === 'official' ? 'Question' : 'Card'}</span>{selected.card?.concept_id === null ? <MarkdownContent markdown={selected.title} mode=\"card\" /> : selected.question && questionMarkdownKind(selected.title, selected.question.prompt_format) === 'block' ? <MarkdownContent markdown={selected.title} mode=\"question\" format={selected.question.prompt_format} /> : <p>{selected.question ? <MarkdownContent markdown={selected.title} mode=\"question\" format={selected.question.prompt_format} /> : selected.title}</p>}</div>\n              {selected.question && <QuestionMediaContent questionId={selected.question.id} hint={selected.question.question_media_hint} surface=\"front\" prompt={selected.question.prompt} />}\n              {selected.card && <div><span>Answer</span>{selected.card.concept_id === null ? <MarkdownContent markdown={selected.card.answer} mode=\"card\" /> : <p>{selected.card.answer}</p>}</div>}\n              {selected.question && !learnerPresentation && <div className={styles.flagMetadata}><span>{selected.question.difficulty ?? 'Unspecified difficulty'}</span><span>{selected.question.testing_angle ?? 'General angle'}</span></div>}\n              {selected.flag.note && <div><span>Your note</span><p>{selected.flag.note}</p></div>}\n              <div><span>Flagged</span><p>{new Date(selected.flag.created_at).toLocaleString()}</p></div>\n              {!learnerPresentation && selected.question && officialQuestionEditor && <>\n                <button className={styles.secondary} disabled={officialQuestionEditor.pending || officialQuestionEditor.busy || removingId !== null}\n                  onClick={() => void officialQuestionEditor.open(selected.question!.id, selected.question!.concept_id)} type=\"button\">\n                  {officialQuestionEditor.pending ? 'Opening Question\u2026' : 'Edit Question'}\n                </button>\n                {officialQuestionEditor.pending && <p role=\"status\">Loading the Question editor\u2026</p>}\n                {officialQuestionEditor.error && <p className={styles.flagError} role=\"alert\">{officialQuestionEditor.error}</p>}\n              </>}\n              <button className={styles.dangerButton} disabled={removingId === selected.flag.id} onClick={() => void unflag(selected.flag.id)} type=\"button\">{removingId === selected.flag.id ? 'Removing\u2026' : 'Unflag'}</button>\n            </div>\n          ) : (\n            <div className={styles.inlineEmpty}>{neutralPresentation ? 'Select a flagged Question to review it.' : 'Select a flagged Question or personal Card to review it.'}</div>\n"
  ]
];
function projectPresentation(value) {
  for (const [approved, original] of presentationHunks) {
    assert.equal(value.split(approved).length, 2, 'Exact staff Flagged presentation exception');
    value = value.replace(approved, original);
  }
  return value;
}
test('only the approved presentation projects back to the complete released Flagged and Chrome source', () => {
  assert.equal(hash(projectPresentation(source)), '847d10f19a0332d6cc85afbbbbbbaf7504590224725278f469e705a3b04d3611');
  const unrelated = source.replace(".eq('user_id', ownerId)", ".eq('user_id', 'wrong-owner')");
  assert.notEqual(hash(projectPresentation(unrelated)), '847d10f19a0332d6cc85afbbbbbbaf7504590224725278f469e705a3b04d3611');
  assert.throws(() => projectPresentation(source.replace('officialQuestionEditor.open(selected.question!.id, selected.question!.concept_id)', "officialQuestionEditor.open('wrong', 'wrong')")), /Exact staff Flagged presentation exception/);
  let chrome = read('components/creator/CreatorStudioChrome.tsx');
  const exact = ' navyPresentationClassName={styles.flaggedDesign}';
  assert.equal(chrome.split(exact).length, 2); chrome = chrome.replace(exact, '');
  assert.equal(hash(chrome), '217338049cca7437df8b153bdaf6dc18c80c796fc544f1b1d2f0cf5dc8eedb99');
  assert.equal(hash(css.slice(0, css.indexOf(marker))), '348b416bfc7d1e27d130d5c1663df2d3a78110f1e67cbad67e1ed584478b7618', 'Complete frozen Question and Tag CSS prefix');
});
