export type GoalTopic = { source: 'official' | 'personal'; id: string; parent_id: string | null; name: string; path: string };
export type GoalProgress = {
  total_items: number; covered_items: number; personal_items: number;
  total_concepts: number; mastered_concepts: number;
  recent_responses: number; recent_official_responses: number; recent_study_days: number;
  recent_coverage_gain: number; recent_mastery_cohort: number; observation_days: number;
  timed_sessions: number; timed_responses: number; seconds_per_response: number | null;
};
export type StudyGoal = {
  id: string; name: string; objective: 'coverage' | 'mastery'; deadline: string;
  official_topic_ids: string[]; personal_topic_ids: string[]; revision: number;
  unavailable_topics: number; progress: GoalProgress;
};
export type StudyGoalsData = { library_id: string; today: string; as_of: string; mastery_threshold: number; topics: GoalTopic[]; goals: StudyGoal[] };
const day = 86_400_000;
export const topicKey = (topic: Pick<GoalTopic, 'source' | 'id'>) => `${topic.source}:${topic.id}`;
export function goalPercent(done: number, total: number): number {
  return total > 0 ? Math.min(100, Math.max(0, Math.round(done / total * 100))) : 0;
}
export function goalDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
}
export function goalForecast(goal: StudyGoal, today: string) {
  const p = goal.progress;
  const total = goal.objective === 'coverage' ? p.total_items : p.total_concepts;
  const done = goal.objective === 'coverage' ? p.covered_items : p.mastered_concepts;
  const remaining = Math.max(0, total - done);
  const daysLeft = Math.floor((Date.parse(`${goal.deadline}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / day) + 1;
  const gain = goal.objective === 'coverage' ? p.recent_coverage_gain : p.recent_mastery_cohort;
  const responses = goal.objective === 'coverage' ? p.recent_responses : p.recent_official_responses;
  const sufficient = p.observation_days >= 7 && p.recent_study_days >= 3 && responses >= 10 && gain >= 3;
  const blocked = goal.unavailable_topics > 0 || total === 0;
  const complete = !blocked && remaining === 0;
  // Calendar days include inactive days. This is an observed-pace estimate, never
  // a scheduler input or a reconstruction of historical Concept mastery scores.
  const estimatedDays = sufficient && !blocked && remaining > 0 ? Math.ceil(remaining / (gain / p.observation_days)) : null;
  const forecastDate = estimatedDays !== null && estimatedDays <= 3650
    ? new Date(Date.parse(`${today}T00:00:00Z`) + (estimatedDays - 1) * day).toISOString().slice(0, 10) : null;
  const minimumPerDay = !blocked && daysLeft > 0 ? Math.ceil(remaining / daysLeft) : null;
  const perDay = !blocked && !complete && sufficient && daysLeft > 0 ? Math.ceil(remaining * responses / gain / daysLeft) : null;
  const minutes = perDay !== null && p.timed_sessions >= 3 && p.timed_responses >= 10 && p.seconds_per_response !== null && p.seconds_per_response > 0
    ? Math.max(1, Math.ceil(perDay * p.seconds_per_response / 60)) : null;
  const status = complete ? 'Complete' : blocked ? 'Scope needs attention' : daysLeft <= 0 ? 'Overdue — still in progress' : forecastDate === null ? 'Not enough history to assess pace' : forecastDate <= goal.deadline ? 'On track at recent pace' : 'Behind deadline at recent pace';
  return { complete, remaining, daysLeft, forecastDate, perDay, minutes, minimumPerDay, status, sufficient };
}

/** Reject malformed responses instead of presenting failed reads as zero progress. */
export function requireStudyGoals(value: unknown, libraryId: string): StudyGoalsData {
  const data = value as StudyGoalsData | null;
  if (!data || data.library_id !== libraryId || !/^\d{4}-\d{2}-\d{2}$/.test(data.today) || !Array.isArray(data.topics) || !Array.isArray(data.goals)) throw new Error('Study goals returned an invalid Library response.');
  for (const g of data.goals) {
    if (!g.id || !g.name || !['coverage', 'mastery'].includes(g.objective) || !Array.isArray(g.official_topic_ids) || !Array.isArray(g.personal_topic_ids) || !Number.isSafeInteger(g.revision) || !g.progress) throw new Error('Study goal data is incomplete.');
    for (const key of ['total_items', 'covered_items', 'personal_items', 'total_concepts', 'mastered_concepts', 'recent_responses', 'recent_official_responses', 'recent_study_days', 'recent_coverage_gain', 'recent_mastery_cohort', 'observation_days', 'timed_sessions', 'timed_responses'] as const) {
      const n = g.progress[key];
      if (!Number.isSafeInteger(n) || n < 0) throw new Error('Study goal progress is invalid.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(g.deadline) || !Number.isSafeInteger(g.unavailable_topics) || g.unavailable_topics < 0 || g.progress.covered_items > g.progress.total_items || g.progress.mastered_concepts > g.progress.total_concepts) throw new Error('Study goal progress is inconsistent.');
  }
  return data;
}
