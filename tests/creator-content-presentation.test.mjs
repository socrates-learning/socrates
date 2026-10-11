import { projectSharedTopicSource } from './fixtures/shared-topic-branches.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { editor, nodes, text, button, expandChrome, source, projectNavyPresentation, projectQuestionPresentation, projectTagManagerPresentation } from './fixtures/creator-role-workspaces.mjs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');

// Exact Question-selection exceptions; all other released Creator code stays fingerprinted.
const questionSelectionHunks = [
  [
    "      || entry.reserved_names.includes(normalized))?.storage_key || value;\n  }, [testingAngleCatalog]);\n  // Browsing may start with a Concept; a new Question needs an explicit association.\n  const [draftQuestionPrimaryId, setDraftQuestionPrimaryId] = useState<string | null>(null);\n  const primaryQuestionConceptId = editingQuestionPrimary?.id || draftQuestionPrimaryId;\n  const [questionPrompt, setQuestionPrompt] = useState('');\n",
    "      || entry.reserved_names.includes(normalized))?.storage_key || value;\n  }, [testingAngleCatalog]);\n  // Association ownership is independent of the Concept being browsed.\n  const [draftQuestionPrimaryId, setDraftQuestionPrimaryId] = useState<string | null>(resolvedConcept.id);\n  const primaryQuestionConceptId = editingQuestionPrimary?.id || draftQuestionPrimaryId;\n  const [questionPrompt, setQuestionPrompt] = useState('');\n"
  ],
  [
    "  function browseQuestionConcept(conceptId: string, topicId?: string) {\n    if (isSavingQuestion || questionSaveLockRef.current) return;\n    if (!Object.values(questionConceptsByTopicId).some(options => options.some(option => option.id === conceptId))) return;\n    if (questionSource === 'personal') {\n      if (!selectQuestionConcept(conceptId, topicId)) return;\n    } else {\n      setQuestionConceptId(conceptId);\n      if (!questionId) changeDraftQuestionPrimary(conceptId);\n      if (topicId) {\n        setActivePersonalTopicId(null);\n",
    "  function browseQuestionConcept(conceptId: string, topicId?: string) {\n    if (isSavingQuestion || questionSaveLockRef.current) return;\n    if (questionSource === 'personal') {\n      if (!selectQuestionConcept(conceptId, topicId)) return;\n    } else {\n      setQuestionConceptId(conceptId);\n      if (topicId) {\n        setActivePersonalTopicId(null);\n"
  ],
  [
    "    if (questionSource !== 'official' || isSavingQuestion || questionSaveLockRef.current) return;\n    if (!Object.values(questionConceptsByTopicId).some(options => options.some(option => option.id === id))) return;\n    if (id === primaryQuestionConceptId) {\n      if (!checked) changeDraftQuestionPrimary(null);\n      return;\n    }\n    if (checked && !primaryQuestionConceptId) {\n      changeDraftQuestionPrimary(id);\n      setQuestionConceptId(current => current || id);\n    } else {\n",
    "    if (questionSource !== 'official' || isSavingQuestion || questionSaveLockRef.current) return;\n    if (!Object.values(questionConceptsByTopicId).some(options => options.some(option => option.id === id))) return;\n    if (id === primaryQuestionConceptId) return;\n    if (checked && !primaryQuestionConceptId) {\n      setDraftQuestionPrimaryId(id);\n      setQuestionConceptId(current => current || id);\n    } else {\n"
  ],
  [
    "\n  function makeQuestionConceptPrimary(id: string) {\n    if (!questionRelatedConceptIds.includes(id)) return;\n    changeDraftQuestionPrimary(id);\n  }\n\n  function changeDraftQuestionPrimary(id: string | null) {\n    if (questionSource !== 'official' || questionId || !creatorAuthority.canSaveQuestion ||\n      isSavingQuestion || questionSaveLockRef.current) return;\n    if (id && !Object.values(questionConceptsByTopicId).some(options => options.some(option => option.id === id))) return;\n    setQuestionRelatedConceptIds(current => current.filter(value => value !== id));\n    setDraftQuestionPrimaryId(id);\n    setQuestionStatus(null);\n  }\n\n  function clearQuestionConceptAssociations() {\n    if (questionSource !== 'official' || questionId || !creatorAuthority.canSaveQuestion ||\n      isSavingQuestion || questionSaveLockRef.current) return;\n    setDraftQuestionPrimaryId(null);\n    setQuestionRelatedConceptIds([]);\n    setQuestionStatus(null);\n  }\n",
    "\n  function makeQuestionConceptPrimary(id: string) {\n    if (questionSource !== 'official' || questionId || isSavingQuestion || questionSaveLockRef.current ||\n      !questionRelatedConceptIds.includes(id) || !primaryQuestionConceptId) return;\n    setQuestionRelatedConceptIds(current => [...new Set([\n      ...current.filter(value => value !== id), primaryQuestionConceptId,\n    ])]);\n    setDraftQuestionPrimaryId(id);\n    setQuestionStatus(null);\n  }\n"
  ],
  [
    "      return;\n    }\n    setActivePersonalTopicId(null);\n    resetQuestionEditor(null);\n    if (questionConceptId) void refreshExistingQuestionList(questionConceptId);\n    setQuestionStatus(null);\n  }\n",
    "      return;\n    }\n    if (!questionConceptId) {\n      setQuestionStatus({ tone: 'error', message: 'Choose an eligible Concept first.' });\n      return;\n    }\n    setActivePersonalTopicId(null);\n    resetQuestionEditor(questionConceptId);\n    void refreshExistingQuestionList(questionConceptId);\n    setQuestionStatus(null);\n  }\n"
  ],
  [
    "              <input className={styles.topicCheckbox} type=\"checkbox\"\n                aria-label={`Associate ${item.name} with Question`} checked={isSelected}\n                disabled={isSavingQuestion || questionSource !== 'official' || (isPrimary && Boolean(questionId))}\n                title={isPrimary ? (questionId ? 'Saved Question Primary cannot be changed.' : 'Uncheck to clear the Primary Concept without clearing your draft.') : undefined}\n                onChange={event => associateQuestionConcept(item.id, event.target.checked)} />\n              <button type=\"button\" className={styles.topicActivationButton}\n",
    "              <input className={styles.topicCheckbox} type=\"checkbox\"\n                aria-label={`Associate ${item.name} with Question`} checked={isSelected}\n                disabled={isSavingQuestion || questionSource !== 'official' || isPrimary}\n                title={isPrimary ? (questionId ? 'Saved Question Primary cannot be changed.' : 'Use Make Primary on a Related Concept to change Primary.') : undefined}\n                onChange={event => associateQuestionConcept(item.id, event.target.checked)} />\n              <button type=\"button\" className={styles.topicActivationButton}\n"
  ],
  [
    "                <button type=\"button\" className={styles.secondaryButton}\n                  aria-label={`Make ${item.name} Primary`} disabled={isSavingQuestion}\n                  title=\"Use this as Primary and remove the previous Primary association.\"\n                  onClick={() => makeQuestionConceptPrimary(item.id)}>Make Primary</button>\n              )}\n",
    "                <button type=\"button\" className={styles.secondaryButton}\n                  aria-label={`Make ${item.name} Primary`} disabled={isSavingQuestion}\n                  onClick={() => makeQuestionConceptPrimary(item.id)}>Make Primary</button>\n              )}\n"
  ],
  [
    "                    </div>\n                  )}\n                  {questionSource === 'official' && !questionId && (\n                    <div className={styles.linkedConceptContext} aria-label=\"Concept associations\">\n                      {!primaryQuestionConceptId && <span>No Primary Concept selected. Choose one before saving.</span>}\n                      <button type=\"button\" className={styles.secondaryButton}\n                        disabled={isSavingQuestion || !creatorAuthority.canSaveQuestion || (!primaryQuestionConceptId && questionRelatedConceptIds.length === 0)}\n                        onClick={clearQuestionConceptAssociations}>Clear Concept associations</button>\n                    </div>\n                  )}\n                  {questionSource === 'personal' && personalQuestionConceptId && (\n                    <div className={styles.linkedConceptContext} aria-label=\"Primary Concept\">\n",
    "                    </div>\n                  )}\n                  {questionSource === 'personal' && personalQuestionConceptId && (\n                    <div className={styles.linkedConceptContext} aria-label=\"Primary Concept\">\n"
  ],
  [
    "                            isSavingQuestion ||\n                            (creationDestination === 'official'\n                              ? !creatorCapabilities.official.saveQuestion\n                              : !personalQuestionConceptId)\n                          }\n",
    "                            isSavingQuestion ||\n                            (creationDestination === 'official'\n                              ? !creatorCapabilities.official.saveQuestion || !questionConceptId\n                              : !personalQuestionConceptId)\n                          }\n"
  ],
  [
    "                  <div>\n                    <h2>2. Topic Tree</h2>\n                    <p>{questionId ? 'Browse Questions by Concept. This saved Question keeps its Primary; check other Concepts to add Related associations.' : 'Click a Concept name to set Primary and browse its Questions. Check other Concepts to add Related associations. Changing Primary removes the previous Primary association.'}</p>\n                  </div>\n\n",
    "                  <div>\n                    <h2>2. Topic Tree</h2>\n                    <p>Browse Questions by Concept. New Questions use the selected Concept as Primary; existing Questions keep their Primary.</p>\n                  </div>\n\n"
  ]
];
function projectQuestionSelection(value) {
  for (const [approved, released] of questionSelectionHunks) {
    assert.equal(value.split(approved).length, 2, 'Exact approved Question selection exception');
    value = value.replace(approved, released);
  }
  return value;
}

// Before-state hashes are from released 9585d78, never computed at test runtime.
test('only approved Content/Question presentation and Question selection differ from the released complete Creator source', () => {
  assert.equal(hash(projectNavyPresentation(projectQuestionSelection(projectQuestionPresentation(projectTagManagerPresentation(source))))), "3f918a1d04a8ae237a95fbe350a201f6ce7a77a45091d79f826a80d69a78ae04");
});
test('Home, Stats and Study/Cram match released 9585d78 after only the approved dashboard presentation projection', () => {
  let planner = projectSharedTopicSource('components/StudyPlanner.tsx', read('components/StudyPlanner.tsx'));
  const homeHeader = `<LearnerHeader classPrefix="home-v2" brandHref="/" onHomeClick={handleHomeClick} items={mode === 'dashboard' ? items.filter(item => item.label !== 'Home') : items} />`;
  assert.equal(planner.split(homeHeader).length, 2);
  planner = planner.replace(homeHeader, '<LearnerHeader classPrefix="home-v2" brandHref="/" onHomeClick={handleHomeClick} items={items} />');
  const marker = ` data-home-dashboard={mode === 'dashboard' ? '' : undefined}`;
  const tree = `                  className="home-v2-setup-tree"
                  aria-label="Home deck settings Topic Tree"
                  role="region"
                  tabIndex={0}`;
  assert.equal(planner.split(marker).length, 2);
  assert.equal(planner.split(tree).length, 2);
  planner = planner.replace(marker, '').replace(tree, `                  className="home-v2-setup-tree"
                  aria-label="Home deck settings Topic Tree"`);
  assert.equal(hash(planner), "2a604d4926d98db0edb7f86d5ac8dbacf95fffde2e6cb4b1b00a3536783704ae");
  const css = read('app/home.css'), boundary = '\n\n/* Home dashboard:';
  assert.equal(css.split(boundary).length, 2);
  const start = css.indexOf(boundary);
  assert.equal(hash(css.slice(start)), '7e2a967b9eb575ca71837eed4b30082691d3b57a1ef5b809e45029b0998e97c3', 'Only the exact approved Home layout block');
  assert.equal(hash(css.slice(0, start)), '08156337bbef31e0e99d08e415f5ec9265f26ed728f9499ad38aa16f49810c1b');
});

for (const role of ['admin', 'editor']) test(`${role}: entire Content workspace uses the scoped design with unchanged controls and draft state`, () => {
  const h = editor({ role, placed: true }); let e = h.render();
  const tree = expandChrome(e.tree);
  assert.ok(nodes(tree).some(n => n.props?.className === 'contentDesign'));
  for (const label of ['Selected Topics', 'Tags', 'Prerequisites', 'Sources / References']) assert.ok(text(tree).includes(label), label);
  for (const label of ['Save Concept', 'New Concept', 'Browse Concepts', 'Add Tag', 'Add Reference', 'Move', 'Delete']) assert.ok(button(tree, label));
  assert.equal(e.isContentDirty, false);
  button(tree, 'Browse Concepts').props.onClick(); e = h.render();
  assert.equal(e.isContentDirty, false); assert.equal(e.isPrerequisiteBrowseOpen, false);
  e.setConcept('Navy draft'); button(e.tree, 'Questions').props.onClick();
  assert.ok(!nodes(expandChrome(h.render().tree)).some(n => n.props?.className === 'contentDesign'));
  button(h.render().tree, 'Content').props.onClick();
  assert.equal(h.render().concept, 'Navy draft'); assert.equal(h.calls.length, 0);
});
test('compact toolbars are explicitly opted into by official Concept, Question and Answer fields', () => {
  assert.equal(source.split('hideLabel presentation="compact"').length, 2);
  assert.equal(source.split('placeholder="Front of card" presentation="compact"').length, 2);
  assert.equal(source.split('placeholder="Back of card" presentation="compact"').length, 2);
  assert.match(read('components/creator/QuestionMarkdownField.tsx'), /<OfficialVisualField presentation=\{presentation\}/);
  const styles = read('components/CreatorStudioV2Client.module.css');
  assert.match(styles, /\.contentDesign \.mainGrid/);
  assert.match(styles, /\.contentDesign \.selectedPanel, \.contentDesign \.sourcesPanel/);
  assert.match(styles, /\.contentDesign \.prerequisitesSection/);
  assert.match(styles, /\.contentDesign \.bottomActions/);
  assert.doesNotMatch(styles.slice(styles.indexOf('/* Approved Content-first')), /\.panel h[23] \{/);
  assert.doesNotMatch(source, /Creator Guide|Tree View|List View/);
});
test('learner Content authority and its existing workspace remain unchanged', () => {
  const h = editor({ role: 'learner', placed: true }), tree = expandChrome(h.render().tree);
  assert.deepEqual(nodes(tree).filter(n => n.props?.role === 'tab').map(text), ['Questions', 'Flagged']);
  assert.ok(!nodes(tree).some(n => /navy|contentDesign|staffWorkspace/.test(n.props?.className || '')));
});
