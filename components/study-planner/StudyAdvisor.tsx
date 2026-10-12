'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { requireAdvisor, studyAdvice, type AdvisorEvidence } from '@/lib/study-advisor';
import { goalDate, type StudyGoalsData } from '@/lib/study-goals';
import styles from './StudyGoals.module.css';

type Props = { libraryId: string; requestScope: string; goals: StudyGoalsData | null };
export function StudyAdvisor({ libraryId, requestScope, goals }: Props) {
  const [evidence, setEvidence] = useState<AdvisorEvidence | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const epoch = useRef(0);
  const goalSnapshot = goals?.as_of;
  useEffect(() => {
    let active = true;
    const requests = epoch;
    const ticket = ++requests.current;
    setLoading(true); setError(''); setEvidence(null);
    Promise.resolve(supabase.rpc('get_study_advisor', { p_library_id: libraryId })).then(({ data, error: failure }) => {
      if (!active || ticket !== requests.current) return;
      if (failure) throw failure;
      setEvidence(requireAdvisor(data, libraryId, requestScope)); setLoading(false);
    }).catch(() => {
      if (active && ticket === requests.current) { setError('Study Advisor could not load your evidence. Please retry.'); setLoading(false); }
    });
    return () => { active = false; ++requests.current; };
  }, [libraryId, requestScope, goalSnapshot, refresh]);
  // Even before an effect cleanup, a changed account cannot render old evidence.
  const current = !loading && !error && evidence?.actor_id === requestScope && evidence.library_id === libraryId ? evidence : null;
  const advice = current ? studyAdvice(current, goals) : [];
  return <section className={styles.goals} aria-labelledby="study-advisor-title" aria-busy={loading}>
    <div className={styles.header}><div><h3 id="study-advisor-title">Study Advisor</h3><p>Suggestions from your recent study evidence.</p></div>
      <button type="button" disabled={loading} onClick={() => setRefresh(value => value + 1)}>{error ? 'Retry Advisor' : 'Refresh advice'}</button></div>
    {loading && <p role="status">Loading your study evidence…</p>}
    {error && <p role="alert">{error}</p>}
    {current && <>
      {!advice.length && <div className={styles.advisorEmpty}>
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 18h6m-5 3h4M8 14a7 7 0 1 1 8 0c-1 1-1 2-1 4H9c0-2 0-3-1-4Z" /></svg>
        <div><h4>No specific recommendation yet.</h4><p>There may be too little recent evidence, or no pattern strong enough to suggest a change. Keep using Study and check back as your history grows.</p></div>
      </div>}
      {advice.map(item => <article key={item.id} className={styles.card}><h4>{item.title}</h4><p><strong>Consider: </strong>{item.action}</p><details className={styles.explanation}><summary>Why this advice?</summary><p><strong>Observed: </strong>{item.observed}</p><p><strong>Why it matters: </strong>{item.why}</p></details></article>)}
      {!goals && <p>Goal progress is not available yet; deadline advice is withheld until it loads.</p>}
      <details className={styles.explanation}><summary>Evidence and criteria</summary><p>Evidence through {goalDate(current.today)} (UTC), from the last 28 days. Topic advice needs at least 7 observed days and 3 study days. Retention advice needs 12 repeat responses and repeated difficulty on at least 3 items; coverage advice needs 20 responses. Shared Topic locations and overlapping material do not create duplicate suggestions. Refresh progress below to update goal forecasts.</p></details>
    </>}
    <p className={styles.note}>Advisory only. Your goals, sliders and Study selections stay under your control.</p>
  </section>;
}
