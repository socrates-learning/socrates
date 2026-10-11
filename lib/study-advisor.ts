import { goalDate, goalForecast, type StudyGoalsData } from './study-goals';

export type AdvisorTopic = {
  key: string; name: string; path: string; source: 'official' | 'personal';
  balance: number | null; selected: boolean; related_keys: string[];
  total_items: number; covered_items: number; new_items: number;
  responses: number; study_days: number; observation_days: number;
  review_responses: number; review_days: number; review_lapses: number;
  repeated_lapse_items: number; reviewed_items: number;
};
export type AdvisorEvidence = {
  version: 1; library_id: string; actor_id: string; today: string; as_of: string;
  window_days: 28; topics: AdvisorTopic[];
};
export type StudyAdvice = { id: string; kind: 'retention' | 'coverage' | 'deadline' | 'healthy'; title: string; observed: string; why: string; action: string };

// Response labels retain their released meanings. First-day attempts are not
// retention evidence; no new mastery estimate or scheduler input is calculated.
const supported = (t: AdvisorTopic) => t.observation_days >= 7 && t.study_days >= 3;
const retention = (t: AdvisorTopic) => supported(t) && t.review_days >= 3 && t.review_responses >= 12 && t.repeated_lapse_items >= 3 && t.review_lapses / t.review_responses >= 0.4;
const related = (a: AdvisorTopic, b: AdvisorTopic) => a.key === b.key || a.related_keys.includes(b.key) || b.related_keys.includes(a.key);

export function studyAdvice(evidence: AdvisorEvidence, goals: StudyGoalsData | null): StudyAdvice[] {
  // Canonical ordering gives deterministic tie-breaking regardless of row order.
  const topics = [...evidence.topics].sort((a, b) => a.key.localeCompare(b.key));
  const struggling = topics.filter(retention).sort((a, b) => b.review_lapses / b.review_responses - a.review_lapses / a.review_responses || a.key.localeCompare(b.key));
  const selected: AdvisorTopic[] = [];
  const advice: StudyAdvice[] = [];
  for (const t of struggling) {
    if (selected.some(p => related(t, p))) continue;
    selected.push(t);
    advice.push({ id: `retention:${t.key}`, kind: 'retention', title: `Revisit ${t.path}${t.source === 'personal' ? ' (My Topic)' : ''}`,
      observed: `${t.review_lapses} of ${t.review_responses} repeat responses were “didn’t know”, “forgot” or “too hard”, across ${t.review_days} days. ${t.repeated_lapse_items} items had difficulty on at least two different review days.`,
      why: 'These items had already been reviewed on an earlier day. Revisiting their explanations may help reinforce material you have already studied.',
      action: t.selected && t.balance !== null && t.balance < 100
        ? `Consider moving ${t.name}’s New ↔ Mastery slider a little toward Mastery from its current ${t.balance}/100 setting. Revisit difficult explanations before increasing new material. Changing a parent slider resets its descendants.`
        : `Consider revisiting the difficult Questions or Cards and their explanations. ${t.selected && t.balance === 100 ? 'This Topic’s slider already favors Mastery fully.' : 'No unambiguous selected Topic setting is available to recommend a slider change.'}`,
    });
  }
  for (const t of topics) {
    if (!supported(t) || !t.selected || t.balance === null || t.balance < 65 || t.responses < 20 || t.total_items - t.covered_items < 5
      || t.new_items / t.responses > 0.1 || t.review_responses / t.responses < 0.8
      || struggling.some(p => related(t, p)) || selected.some(p => related(t, p))) continue;
    selected.push(t);
    advice.push({ id: `coverage:${t.key}`, kind: 'coverage', title: `Make room for new material in ${t.path}${t.source === 'personal' ? ' (My Topic)' : ''}`,
      observed: `${t.responses} responses across ${t.study_days} days included first reviews of ${t.new_items} items. ${t.total_items - t.covered_items} eligible items remain unreviewed. This Topic’s slider is ${t.balance}/100 toward Mastery.`,
      why: 'Most recent responses were repeat reviews while coverage changed little. The slider setting may contribute, but this pattern alone cannot prove why new material was not studied.',
      action: `If coverage is your priority, consider moving ${t.name}’s slider a little toward New. Check that the material you want is included in your Study selections. Parent slider changes reset descendants; Concept overrides and other placements can also affect the mix.`,
    });
  }
  // Reuse Goal Dates' conservative forecasts. One prioritized deadline suggestion
  // avoids summing overlapping targets or pretending disjoint goals share work.
  const forecasts = (goals?.library_id === evidence.library_id && goals.today === evidence.today ? goals.goals : [])
    .map(goal => ({ goal, forecast: goalForecast(goal, evidence.today) }));
  const behind = forecasts
    .filter(({ forecast: f }) => f.status === 'Behind deadline at recent pace' && f.perDay !== null)
    .sort((a, b) => a.goal.deadline.localeCompare(b.goal.deadline) || a.goal.id.localeCompare(b.goal.id));
  if (behind.length) {
    const { goal: g, forecast: f } = behind[0];
    const p = g.progress;
    const responses = g.objective === 'coverage' ? p.recent_responses : p.recent_official_responses;
    const current = responses / p.observation_days;
    const target = f.perDay!;
    // A modest trial step, bounded by observed active-day capacity, not a promise
    // that the entire deadline workload is achievable for this learner.
    const step = Math.min(target, Math.ceil(current * 1.25), Math.ceil(responses / p.recent_study_days));
    const minutes = p.timed_sessions >= 3 && p.timed_responses >= 10 && p.seconds_per_response !== null && p.seconds_per_response > 0
      ? Math.ceil(step * p.seconds_per_response / 60) : null;
    advice.unshift({ id: `deadline:${g.id}`, kind: 'deadline', title: `Review the pace for ${g.name}`,
      observed: `${responses} ${g.objective === 'coverage' ? 'Question / Card' : 'Question'} responses over ${p.observation_days} calendar days average ${current.toFixed(1)} per day. At that recent pace, Goal Dates estimates completion after ${goalDate(g.deadline)}.${behind.length > 1 ? ` ${behind.length - 1} other ${behind.length === 2 ? 'goal also has' : 'goals also have'} a supported behind-pace estimate.` : ''}`,
      why: `The current estimate needs about ${target} responses per day for this goal. ${g.objective === 'mastery' ? 'Its mastery forecast uses only currently mastered Concepts first studied recently, so that cohort may not represent the remaining material.' : 'Repeat reviews are included in the estimated workload; they do not count as new coverage.'}`,
      action: `Consider a trial of about ${step} responses per day${minutes !== null ? ` (roughly ${Math.max(1, minutes)} minutes including pauses)` : ''}, if manageable, then reassess. ${step < target ? 'This gradual increase alone is not enough for the current deadline estimate. Consider a later deadline if the full pace is unrealistic.' : 'This is an estimate, not a guarantee of completion.'} Review each goal separately; do not add overlapping daily targets.`,
    });
  }
  if (!advice.length) {
    const healthy = topics.find(t => supported(t) && t.review_days >= 3 && t.review_responses >= 12 && t.reviewed_items >= 5 && t.review_lapses / t.review_responses <= 0.2);
    if (healthy) advice.push({ id: `healthy:${healthy.key}`, kind: 'healthy', title: `Steady recall in ${healthy.path}${healthy.source === 'personal' ? ' (My Topic)' : ''}`,
      observed: `${healthy.review_responses - healthy.review_lapses} of ${healthy.review_responses} repeat responses were recalled (“easy”, “average” or “hard”) across ${healthy.review_days} days.`,
      why: 'This is encouraging recent recall evidence, not proof of permanent mastery or completion of your goals.',
      action: 'Consider keeping a consistent study routine and checking your goal progress as more evidence accumulates.',
    });
    if (!healthy) {
      const onTrack = forecasts.filter(x => x.forecast.status === 'On track at recent pace')
        .sort((a, b) => a.goal.deadline.localeCompare(b.goal.deadline) || a.goal.id.localeCompare(b.goal.id))[0];
      if (onTrack) {
        const g = onTrack.goal, p = g.progress;
        advice.push({ id: `healthy-goal:${g.id}`, kind: 'healthy', title: `A supported pace for ${g.name}`,
          observed: g.objective === 'coverage'
            ? `${p.covered_items} of ${p.total_items} eligible items have been reviewed, with ${p.recent_coverage_gain} first reviews in ${p.observation_days} observed calendar days.`
            : `${p.mastered_concepts} of ${p.total_concepts} official Concepts are above the existing mastery threshold; ${p.recent_mastery_cohort} were first studied in the recent window.`,
          why: `Goal Dates currently estimates completion by ${goalDate(g.deadline)} if the recent pace continues.${g.objective === 'mastery' ? ' The limited mastery cohort may not represent the remaining Concepts.' : ''}`,
          action: 'Consider maintaining your current routine and checking progress again as your study history and available material change. This estimate is not a guarantee.',
        });
      }
    }
  }
  return advice.slice(0, 5);
}

/** Fail closed on wrong actor/Library, malformed or inconsistent aggregates. */
export function requireAdvisor(value: unknown, libraryId: string, actorId: string): AdvisorEvidence {
  const d = value as AdvisorEvidence | null;
  if (!d || d.version !== 1 || d.window_days !== 28 || d.library_id !== libraryId || d.actor_id !== actorId || !/^\d{4}-\d{2}-\d{2}$/.test(d.today) || !Number.isFinite(Date.parse(d.as_of)) || !Array.isArray(d.topics)) throw new Error('Study Advisor returned an invalid account or Library response.');
  const keys = new Set<string>();
  for (const t of d.topics) {
    if (!['official', 'personal'].includes(t.source) || !t.key?.startsWith(`${t.source}:`) || keys.has(t.key) || !t.name || !t.path || typeof t.selected !== 'boolean' || !Array.isArray(t.related_keys) || !t.related_keys.every(k => typeof k === 'string') || (t.balance !== null && (!Number.isInteger(t.balance) || t.balance < 0 || t.balance > 100))) throw new Error('Study Advisor returned invalid Topic evidence.');
    keys.add(t.key);
    for (const key of ['total_items', 'covered_items', 'new_items', 'responses', 'study_days', 'observation_days', 'review_responses', 'review_days', 'review_lapses', 'repeated_lapse_items', 'reviewed_items'] as const) {
      if (!Number.isSafeInteger(t[key]) || t[key] < 0) throw new Error('Study Advisor evidence is incomplete.');
    }
    if (t.covered_items > t.total_items || t.new_items > t.covered_items || t.new_items > t.responses || t.review_responses > t.responses || t.review_lapses > t.review_responses || t.review_days > t.study_days || t.study_days > t.observation_days || t.observation_days > 28 || t.reviewed_items > t.covered_items || t.repeated_lapse_items > t.reviewed_items || t.repeated_lapse_items * 2 > t.review_lapses) throw new Error('Study Advisor evidence is inconsistent.');
  }
  return d;
}
