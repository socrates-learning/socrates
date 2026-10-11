import assert from 'node:assert/strict';

// Only the October 11 feedback presentation and learner official-flag routing
// corrections are projected away. Original preservation fingerprints remain.
const hunks = {
  "components/StudyPlanner.tsx": [
    [
      "                  {(studySubmissionStatus === 'save-error' || studySubmissionStatus === 'next-error') && (\n",
      "                  {studySubmissionStatus !== 'idle' && (\n"
    ],
    [
      "                      <p>{studySubmissionStatus === 'next-error' ? 'Answer saved. Unable to load next card.'\n",
      "                      <p>{studySubmissionStatus === 'saving' ? 'Saving answer…'\n                        : studySubmissionStatus === 'loading-next' ? 'Answer saved. Loading next card…'\n                          : studySubmissionStatus === 'next-error' ? 'Answer saved. Unable to load next card.'\n"
    ],
    [
      "                  ) : (\n                    <div className=\"study-v2-response-stage\" aria-busy={studySubmissionStatus === 'saving' || studySubmissionStatus === 'loading-next'}>\n                      <span className=\"study-v2-sr-only\" role=\"status\" aria-live=\"polite\">\n                        {studySubmissionStatus === 'saving' ? 'Submitting response.'\n                          : studySubmissionStatus === 'loading-next' ? 'Response saved. Loading next Question.' : ''}\n                      </span>\n",
      "                  ) : studySubmissionStatus !== 'idle' ? null : (\n                    <div className=\"study-v2-response-stage\">\n"
    ],
    [
      "                          type=\"button\"\n                          disabled={studySubmissionStatus !== 'idle'}\n",
      "                          type=\"button\"\n"
    ],
    [
      "                            disabled={studySubmissionStatus !== 'idle'}\n",
      ""
    ]
  ],
  "components/StudyCreatorFlaggedBrowser.tsx": [
    [
      "    const flagQuery = supabase\n",
      "    const flagResult = await supabase\n"
    ],
    [
      "    // Official Question review belongs in Stats for learners. Staff retain\n    // their existing owner-scoped official Question editing workflow here.\n    const flagResult = await (learnerPresentation ? flagQuery.is('question_id', null) : flagQuery);\n",
      ""
    ],
    [
      "    const nextFlags = ((flagResult.data ?? []) as FlagRow[])\n      .filter(flag => !learnerPresentation || (!flag.question_id && Boolean(flag.personal_card_id)));\n",
      "    const nextFlags = (flagResult.data ?? []) as FlagRow[];\n"
    ],
    [
      "  }, [ownerId, learnerPresentation]);\n",
      "  }, [ownerId]);\n"
    ],
    [
      "            <p>{learnerPresentation ? 'Review your personal Cards here. Official Questions are in Stats → Flagged Review.' : 'Review Questions and Cards you saved for later.'}</p>\n",
      "            <p>Review Questions and Cards you saved for later.</p>\n"
    ],
    [
      "          {!isLoading && !flags.length && <div className={styles.inlineEmpty}>{learnerPresentation ? 'No personal Cards are flagged.' : 'Nothing is flagged yet. Use the flag action during Study to save material for later review.'}</div>}\n",
      "          {!isLoading && !flags.length && <div className={styles.inlineEmpty}>Nothing is flagged yet. Use the flag action during Study to save material for later review.</div>}\n"
    ],
    [
      "            <p>{learnerPresentation ? 'Review the selected personal Card.' : neutralPresentation ? 'Review the selected Question.' : 'Review the selected Question or Card.'}</p>\n",
      "            <p>{neutralPresentation ? 'Review the selected Question.' : 'Review the selected Question or Card.'}</p>\n"
    ],
    [
      "            <div className={styles.inlineEmpty}>{learnerPresentation ? 'Select a flagged personal Card to review it.' : neutralPresentation ? 'Select a flagged Question to review it.' : 'Select a flagged Question or personal Card to review it.'}</div>\n",
      "            <div className={styles.inlineEmpty}>{neutralPresentation ? 'Select a flagged Question to review it.' : 'Select a flagged Question or personal Card to review it.'}</div>\n"
    ]
  ]
};
export function projectStudyFlaggedCorrections(path, source) {
  for (const [approved, original] of hunks[path] ?? []) {
    assert.equal(source.split(approved).length, 2, `Exact October 11 correction: ${path}`);
    source = source.replace(approved, original);
  }
  return source;
}
