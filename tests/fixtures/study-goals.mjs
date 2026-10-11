import assert from 'node:assert/strict';

// Preserve original planner fingerprints. Only the exact lazy import and scoped
// Stats Progress render may differ; every other planner byte stays authoritative.
export function projectStudyGoals(source) {
  for (const addition of [
    "const StudyGoals = dynamic(() => import('./study-planner/StudyGoals').then(module => module.StudyGoals));\n\n",
    '            {statsTab === \'progress\' && userId && <StudyGoals key={`${userId}:${activeLibrary.id}`} libraryId={activeLibrary.id} requestScope={userId} />}\n',
  ]) {
    assert.equal(source.split(addition).length, 2, 'Exactly one scoped Stats Goals addition');
    source = source.replace(addition, '');
  }
  return source;
}
