// Synthetic identities only. Two locations share a canonical Topic but not children.
export function goalTopicTreeFixture() {
  const rows = [
    ['root', null, 'Nursing', 'root'],
    ['branch-a', 'root', 'Zulu Foundations', 'branch-a'],
    ['shared-a', 'branch-a', 'Assessment', 'canonical-shared'],
    ['deep', 'shared-a', 'Clinical observations', 'deep'],
    ['deeper', 'deep', 'Recognising changes', 'deeper'],
    ['deepest', 'deeper', 'A very long demonstration Topic name about focused observation and clear communication', 'deepest'],
    ['branch-b', 'root', 'Alpha Critical Care', 'branch-b'],
    ['shared-b', 'branch-b', 'Assessment', 'canonical-shared'],
    ['b-child', 'shared-b', 'Acute priorities', 'b-child'],
  ];
  const paths = new Map();
  const topics = rows.map(([id, parent_id, name, topic_id]) => {
    const path = parent_id ? `${paths.get(parent_id)} › ${name}` : name;
    paths.set(id, path);
    return { source: 'official', id, parent_id, name, path, topic_id };
  });
  topics.push(
    { source: 'personal', id: 'root', parent_id: null, name: 'Revision notes', path: 'Revision notes' },
    { source: 'personal', id: 'personal-child', parent_id: 'root', name: 'My recall Cards', path: 'Revision notes › My recall Cards' },
  );
  const progress = {
    total_items: 12, covered_items: 2, personal_items: 3, total_concepts: 3, mastered_concepts: 1,
    recent_responses: 2, recent_official_responses: 1, recent_study_days: 1,
    recent_coverage_gain: 2, recent_mastery_cohort: 0, observation_days: 1,
    timed_sessions: 0, timed_responses: 0, seconds_per_response: null,
  };
  return {
    library_id: 'synthetic-library', today: '2026-10-20', as_of: '2026-10-20T12:00:00Z', mastery_threshold: 0.75,
    topics,
    goals: [{
      id: 'synthetic-goal', name: 'Clinical assessment review', deadline: '2026-12-01', objective: 'coverage',
      official_topic_ids: ['shared-a'], personal_topic_ids: [], revision: 1, unavailable_topics: 0, progress,
    }],
  };
}
