import { projectAppearance } from './appearance.mjs';
import assert from 'node:assert/strict';
// Only the exact additive My Note entry points are projected. Original source
// and all existing preservation fingerprints remain authoritative.
const additions = {
  "components/StudyPlanner.tsx": [
    [
      "import QuestionPersonalNote from './QuestionPersonalNote';\n",
      ""
    ],
    [
      "        {hasStudyCandidate && isAnswerVisible && studyCandidate?.kind === 'official' && userId && activeLibrary && (\n          <QuestionPersonalNote key={`${userId}:${activeLibrary.id}:${studyCandidate.questionId}`} userId={userId} libraryId={activeLibrary.id} questionId={studyCandidate.questionId} buttonClassName=\"study-v2-context-action\" />\n        )}\n",
      ""
    ]
  ],
  "components/study-planner/StatsFlaggedReview.tsx": [
    [
      "import QuestionPersonalNote from '@/components/QuestionPersonalNote';\n",
      ""
    ],
    [
      "            {selected.question && <QuestionPersonalNote key={`${scope}:${selected.question.id}`} userId={ownerId} libraryId={libraryId} questionId={selected.question.id} />}\n",
      ""
    ]
  ]
};
// Exact Flagged Review presentation hunks; retain the original personal-note fingerprints.
const flaggedPresentation = [
  [
    "  return <section className={`${styles.review} ${styles.workspace}`} aria-label=\"Flagged Review\">\n    <header className={styles.heading}>\n      <div className={styles.intro}>\n        <svg aria-hidden=\"true\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.8\"><path d=\"M4 22V3m0 1c5-5 11 4 16-1v12c-5 5-11-4-16 1\" /></svg>\n        <div><h3>Flagged Review</h3><p>Review your flagged Questions and personal Cards.</p></div>\n      </div>\n      <label className={styles.search}>\n        <span className={styles.srOnly}>Search flags</span>\n        <svg aria-hidden=\"true\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.8\"><circle cx=\"10\" cy=\"10\" r=\"6\" /><path d=\"m15 15 5 5\" /></svg>\n        <input type=\"search\" placeholder=\"Search flags\u2026\" value={search} onChange={event => setSearch(event.target.value)} />\n      </label>\n    </header>\n",
    "  return <section className={styles.review} aria-label=\"Flagged Review\">\n    <h3>Flagged Review</h3>\n"
  ],
  [
    "        {!current ? <p className={styles.state} role=\"status\">Loading your flags\u2026</p> : !current.items ? <div className={styles.state} role=\"alert\"><p>Your flags could not be loaded.</p><button type=\"button\" onClick={() => setAttempt(value => value + 1)}>Retry</button></div> : <>\n          {!items.length && <div className={styles.state}>\n            <span className={styles.stateIcon}><svg aria-hidden=\"true\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.8\"><path d=\"M6 3h12v18l-6-4-6 4Z\" /></svg></span>\n            <strong>No flagged material yet.</strong><p>Flag a Question or personal Card while studying to find it here.</p>\n          </div>}\n          {items.length > 0 && !visible.length && <div className={styles.state}><strong>No flags match your search.</strong><p>Try a different Question, Card, or flag note.</p></div>}\n",
    "        <label className={styles.search}>Search flags<input type=\"search\" value={search} onChange={event => setSearch(event.target.value)} /></label>\n        {!current ? <p role=\"status\">Loading your flags\u2026</p> : !current.items ? <div role=\"alert\"><p>Your flags could not be loaded.</p><button type=\"button\" onClick={() => setAttempt(value => value + 1)}>Retry</button></div> : <>\n          {!items.length && <p>No flagged material yet.</p>}\n          {items.length > 0 && !visible.length && <p>No flags match your search.</p>}\n"
  ],
  [
    "        </> : <div className={styles.state}>\n          <span className={styles.stateIcon}><svg aria-hidden=\"true\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.8\"><rect x=\"5\" y=\"2\" width=\"14\" height=\"20\" rx=\"1\" /><path d=\"M8 7h8M8 11h8M8 15h5\" /></svg></span>\n          <strong>No item selected</strong><p>Select a flagged item to review it.</p>\n        </div>}\n",
    "        </> : <p>Select a flagged item to review it.</p>}\n"
  ]
];
export function projectQuestionPersonalNotes(path, source) {
  source = projectAppearance(source);
 if (path === "components/study-planner/StatsFlaggedReview.tsx" && source.includes("styles.workspace")) {
  for (const [presented, original] of flaggedPresentation) {
   assert.equal(source.split(presented).length, 2, "Exact Stats Flagged Review presentation");
   source = source.replace(presented, original);
  }
 }
 for (const [added, original] of additions[path] || []) {
  assert.equal(source.split(added).length, 2, `Exact My Note integration in ${path}`);
  source = source.replace(added, original);
 }
 return source;
}
