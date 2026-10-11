import { projectQuestionPersonalNotes } from './question-personal-notes.mjs';
import assert from 'node:assert/strict';

// Exact additive Stats tab and owner-qualified Card entry point only. Original
// complete fingerprints remain authoritative after this narrow projection.
const hunks = {
  "components/StudyPlanner.tsx": [
    [
      "type StatsTab = 'progress' | 'history' | 'algorithm' | 'flagged';\n",
      "type StatsTab = 'progress' | 'history' | 'algorithm';\n"
    ],
    [
      "const StatsFlaggedReview = dynamic(() => import('./study-planner/StatsFlaggedReview').then(module => module.StatsFlaggedReview));\n\nconst statsTabHashes: Record<StatsTab, string> = {\n  progress: '#stats',\n  history: '#stats-history',\n  algorithm: '#stats-algorithm',\n  flagged: '#stats-flagged',\n",
      "const statsTabHashes: Record<StatsTab, string> = {\n  progress: '#stats',\n  history: '#stats-history',\n  algorithm: '#stats-algorithm',\n"
    ],
    [
      "  if (hash === statsTabHashes.flagged) return 'flagged';\n",
      ""
    ],
    [
      "            {statsTab === 'flagged' && userId && <StatsFlaggedReview key={`${userId}:${activeLibrary.id}`} ownerId={userId} libraryId={activeLibrary.id} />}\n",
      ""
    ]
  ],
  "components/study-planner/PlannerStats.tsx": [
    [
      "  activeTab: 'progress' | 'history' | 'algorithm' | 'flagged';\n",
      "  activeTab: 'progress' | 'history' | 'algorithm';\n"
    ],
    [
      "                <button aria-selected={activeTab === 'flagged'} onClick={() => onTabChange('flagged')} role=\"tab\" type=\"button\">\n                  Flagged Review\n                </button>\n",
      ""
    ]
  ],
  "components/CreatorStudioV2Client.tsx": [
    [
      "  // The route is keyed by Library. Capture this entry intent once and delegate\n  // to the existing owner-qualified, draft-protected Card selection handler.\n  const statsCardHandoff = useRef({ consumed: false, open: () => {\n    const params = new URLSearchParams(window.location.search);\n    const id = params.get('personalCard');\n    if (!id) return;\n    const ownerId = initialPersonalContent.ownerId;\n    if (params.get('reviewLibrary') !== activeLibraryId ||\n      creatorCapabilities.subject.userId !== ownerId || !creatorCapabilities.library.canAccessActiveLibrary ||\n      !creatorCapabilities.personal.editOwnContent) return;\n    const standalone = standaloneCards.find(card => card.id === id && card.owner_id === ownerId);\n    const card = personalCards.find(card => card.id === id && card.owner_id === ownerId);\n    const concept = card && personalConceptById.get(card.concept_id);\n    const question = standalone ? mapStandaloneCard(standalone)\n      : card && concept?.owner_id === ownerId ? mapPersonalCard(card, concept) : null;\n    if (!question) {\n      setStatus({ tone: 'error', message: 'That personal Card is unavailable.' });\n      return;\n    }\n    selectQuestionSearchResult(question);\n  } });\n  useEffect(() => {\n    if (statsCardHandoff.current.consumed) return;\n    statsCardHandoff.current.consumed = true;\n    statsCardHandoff.current.open();\n  }, []);\n\n",
      ""
    ]
  ]
};
export function projectStatsFlagged(path, source) {
  source = projectQuestionPersonalNotes(path, source);
  for (const [added, original] of hunks[path] || []) {
    assert.equal(source.split(added).length, 2, `Exact Flagged Review addition in ${path}`);
    source = source.replace(added, original);
  }
  return source;
}
