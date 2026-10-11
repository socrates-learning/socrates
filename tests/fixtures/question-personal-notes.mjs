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
export function projectQuestionPersonalNotes(path, source) {
 for (const [added, original] of additions[path] || []) {
  assert.equal(source.split(added).length, 2, `Exact My Note integration in ${path}`);
  source = source.replace(added, original);
 }
 return source;
}
