'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { goalDate, goalForecast, goalPercent, requireStudyGoals, topicKey, type StudyGoal, type StudyGoalsData } from '@/lib/study-goals';
import styles from './StudyGoals.module.css';
import { StudyAdvisor } from './StudyAdvisor';

type Props = { libraryId: string; requestScope: string };
type Draft = { id: string | null; revision: number | null; name: string; deadline: string; objective: 'coverage' | 'mastery'; topics: string[] };
const failureMessage = (reason: unknown, fallback: string) => reason && typeof reason === 'object' && 'message' in reason && typeof reason.message === 'string' ? reason.message : fallback;
const emptyDraft = (): Draft => ({ id: null, revision: null, name: '', deadline: '', objective: 'coverage', topics: [] });

export function StudyGoals({ libraryId, requestScope }: Props) {
  const [data, setData] = useState<StudyGoalsData | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState('');
  const [removeId, setRemoveId] = useState<string | null>(null);
  const epoch = useRef(0);
  const nameInput = useRef<HTMLInputElement>(null);
  const newButton = useRef<HTMLButtonElement>(null);
  const mutation = useRef(false);

  useEffect(() => {
    let active = true;
    const requests = epoch;
    const ticket = ++requests.current;
    Promise.resolve(supabase.rpc('get_study_goals', { p_library_id: libraryId })).then(({ data: value, error: failure }) => {
      if (!active || ticket !== epoch.current) return;
      try {
        if (failure) throw failure;
        setData(requireStudyGoals(value, libraryId));
      } catch (reason) { setError(failureMessage(reason, 'Study goals could not be loaded.')); }
      setLoading(false);
    }).catch(reason => {
      if (active && ticket === epoch.current) { setError(failureMessage(reason, 'Study goals could not be loaded.')); setLoading(false); }
    });
    return () => { active = false; ++requests.current; };
  }, [libraryId, requestScope]);

  const editingId = draft?.id;
  const editing = draft !== null;
  useEffect(() => { if (editing) nameInput.current?.focus(); }, [editingId, editing]);

  async function reload() {
    const ticket = ++epoch.current;
    setLoading(true); setError('');
    try {
      const { data: value, error: failure } = await supabase.rpc('get_study_goals', { p_library_id: libraryId });
      if (ticket !== epoch.current) return false;
      if (failure) throw failure;
      setData(requireStudyGoals(value, libraryId)); return true;
    } catch (reason) {
      if (ticket === epoch.current) setError(failureMessage(reason, 'Study goals could not be loaded.'));
      return false;
    } finally { if (ticket === epoch.current) setLoading(false); }
  }
  function edit(goal?: StudyGoal) {
    setError(''); setNotice(''); setQuery(''); setRemoveId(null);
    setDraft(goal ? { id: goal.id, revision: goal.revision, name: goal.name, deadline: goal.deadline, objective: goal.objective, topics: [...goal.official_topic_ids.map(id => `official:${id}`), ...goal.personal_topic_ids.map(id => `personal:${id}`)] } : emptyDraft());
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || mutation.current) return;
    mutation.current = true; setBusy(true); setError('');
    const ticket = epoch.current;
    try {
      const { error: failure } = await supabase.rpc('save_placement_study_goal', {
        p_library_id: libraryId, p_name: draft.name, p_deadline: draft.deadline, p_objective: draft.objective,
        p_official_location_ids: draft.topics.filter(k => k.startsWith('official:')).map(k => k.slice(9)),
        p_personal_topic_ids: draft.topics.filter(k => k.startsWith('personal:')).map(k => k.slice(9)),
        p_goal_id: draft.id, p_expected_revision: draft.revision,
      });
      if (ticket !== epoch.current) return;
      if (failure) throw failure;
      setDraft(null); setNotice('Goal saved. Learning history and Study settings are unchanged.');
      await reload(); newButton.current?.focus();
    } catch (reason) { if (ticket === epoch.current) setError(failureMessage(reason, 'Goal could not be saved. Reload if it changed in another tab.')); }
    finally { mutation.current = false; setBusy(false); }
  }
  async function remove(goal: StudyGoal) {
    if (mutation.current) return;
    mutation.current = true; setBusy(true); setError('');
    const ticket = epoch.current;
    try {
      const { error: failure } = await supabase.rpc('delete_study_goal', { p_library_id: libraryId, p_goal_id: goal.id, p_expected_revision: goal.revision });
      if (ticket !== epoch.current) return;
      if (failure) throw failure;
      setRemoveId(null); setNotice('Goal removed. Your learning history is preserved.'); await reload();
    } catch (reason) { if (ticket === epoch.current) setError(failureMessage(reason, 'Goal could not be removed. Reload if it changed in another tab.')); }
    finally { mutation.current = false; setBusy(false); }
  }

  return <div className={styles.layout}><section className={styles.goals} aria-labelledby="study-goals-title">
    <div className={styles.header}><div><h3 id="study-goals-title">Study goals</h3><p>Choose a deadline and Topics for an exam, course or quiz.</p></div>
      <button type="button" ref={newButton} className={styles.primary} disabled={!data || busy || loading || !!draft} onClick={() => edit()}>New goal</button>
    </div>
    {loading && <p role="status">Loading study goals…</p>}
    {error && <div role="alert"><p>{error}</p><button type="button" disabled={busy || loading} onClick={() => void reload()}>Retry / refresh goals</button></div>}
    {notice && <p role="status">{notice}</p>}
    {draft && data && <form onSubmit={save} className={styles.form}>
      <h4>{draft.id ? 'Edit goal' : 'Create a goal'}</h4>
      <div className={styles.fields}>
        <label>Goal name<input ref={nameInput} required maxLength={120} value={draft.name} disabled={busy} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="NCLEX, finals, quiz…" /></label>
        <label>Deadline<input type="date" required value={draft.deadline} disabled={busy} onChange={e => setDraft({ ...draft, deadline: e.target.value })} /></label>
        <label>Completion objective<select value={draft.objective} disabled={busy} onChange={e => setDraft({ ...draft, objective: e.target.value as Draft['objective'] })}><option value="coverage">Coverage — review every item at least once</option><option value="mastery">Mastery — reach existing Concept mastery</option></select></label>
      </div>
      <p>Mastery uses official Concepts above the existing 75% threshold. Personal Cards contribute to coverage; they do not have an official mastery score.</p>
      <label>Find Topics<input type="search" value={query} disabled={busy} onChange={e => setQuery(e.target.value)} /></label>
      <fieldset className={styles.topics}><legend>Topics and subject areas ({draft.topics.length} selected)</legend>
        {data.topics.filter(t => t.path.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(t => <label key={topicKey(t)}><input type="checkbox" disabled={busy} checked={draft.topics.includes(topicKey(t))} onChange={e => setDraft({ ...draft, topics: e.target.checked ? [...draft.topics, topicKey(t)] : draft.topics.filter(k => k !== topicKey(t)) })} /><span>{t.path}{t.source === 'personal' ? ' (My Topic)' : ''}</span></label>)}
        {!data.topics.some(t => t.path.toLocaleLowerCase().includes(query.toLocaleLowerCase())) && <p>No matching Topics.</p>}
      </fieldset>
      {draft.topics.some(k => !data.topics.some(t => topicKey(t) === k)) && <p role="alert">Some saved Topics are no longer available. <button type="button" onClick={() => setDraft({ ...draft, topics: draft.topics.filter(k => data.topics.some(t => topicKey(t) === k)) })}>Remove unavailable Topics from this goal</button></p>}
      <div className={styles.actions}><button className={styles.primary} disabled={busy || !draft.topics.length || !draft.name.trim()} type="submit">{busy ? 'Saving…' : 'Save goal'}</button><button type="button" disabled={busy} onClick={() => { setDraft(null); newButton.current?.focus(); }}>Cancel</button></div>
    </form>}
    {data && !data.goals.length && !loading && <div className={styles.empty}>
      <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 11h18" /></svg>
      <h4>No goals yet</h4><p>Create a goal to track coverage and mastery toward a deadline.</p>
    </div>}
    <div className={styles.list}>{data?.goals.map(goal => {
      const p = goal.progress, forecast = goalForecast(goal, data.today);
      const selected = new Set([...goal.official_topic_ids.map(id => `official:${id}`), ...goal.personal_topic_ids.map(id => `personal:${id}`)]);
      return <article key={goal.id} className={styles.card}>
        <div className={styles.header}><div><h4>{goal.name}</h4><p>{goal.objective === 'coverage' ? 'Coverage' : 'Mastery'} goal · Due <time dateTime={goal.deadline}>{goalDate(goal.deadline)}</time></p></div><strong>{forecast.status}</strong></div>
        <p className={styles.scope}>{data.topics.filter(t => selected.has(topicKey(t))).map(t => t.path).join(' · ')}</p>
        <label className={styles.metric}>Coverage: {p.covered_items} / {p.total_items} Questions / Cards reviewed<progress aria-label={`${goal.name}: coverage`} aria-valuetext={`${p.covered_items} of ${p.total_items} items reviewed`} max={100} value={goalPercent(p.covered_items, p.total_items)} /></label>
        <label className={styles.metric}>Mastery: {p.mastered_concepts} / {p.total_concepts} official Concepts above 75%<progress aria-label={`${goal.name}: mastery`} aria-valuetext={`${p.mastered_concepts} of ${p.total_concepts} Concepts mastered`} max={100} value={goalPercent(p.mastered_concepts, p.total_concepts)} /></label>
        {p.personal_items > 0 && <p>{p.personal_items} personal {p.personal_items === 1 ? 'Card contributes' : 'Cards contribute'} to coverage only.</p>}
        {goal.unavailable_topics > 0 && <p>{goal.unavailable_topics} selected Topics are no longer available. Edit the goal to review its scope.</p>}
        {!p.total_items && <p>No eligible material is currently available in these Topics. This goal is not marked complete.</p>}
        {goal.objective === 'mastery' && !p.total_concepts && <p>These Topics have no official Concepts with mastery tracking. Coverage remains available.</p>}
        {!forecast.complete && <div className={styles.estimate}>
          <p>{forecast.forecastDate ? `Estimated completion: around ${goalDate(forecast.forecastDate)}, if your recent pace continues.` : 'A reliable completion date is not available yet.'}</p>
          {forecast.perDay !== null ? <p>Plan for about <strong>{forecast.perDay} {goal.objective === 'coverage' ? (forecast.perDay === 1 ? 'Question / Card' : 'Questions / Cards') : (forecast.perDay === 1 ? 'Question' : 'Questions')} per day</strong> at your observed progress per response.{forecast.minutes !== null ? ` Estimated session time: about ${forecast.minutes} ${forecast.minutes === 1 ? 'minute' : 'minutes'} per day, including pauses.` : ' More completed sessions are needed to estimate daily study time.'}</p> : forecast.minimumPerDay !== null && goal.objective === 'coverage' ? <p>At least {forecast.minimumPerDay} not-yet-reviewed {forecast.minimumPerDay === 1 ? 'Question / Card per day is' : 'Questions / Cards per day are'} needed by the deadline. Repeat reviews may require more; there is not enough history to estimate that workload or time.</p> : <p>{forecast.daysLeft <= 0 ? 'The deadline has passed. This goal stays visible; you can set a new date.' : 'More study history is needed to estimate a daily workload and study time.'}</p>}
          <details className={styles.explanation}><summary>How estimates are calculated</summary><small>Estimates use up to 28 calendar days, including days off, and need at least 7 observed days, 3 study days, 10 responses and 3 {goal.objective === 'mastery' ? 'mastered Concepts first studied in that period' : 'newly reviewed items'}. {goal.objective === 'mastery' ? 'Older Concepts still count toward progress, but do not provide a known mastery completion date.' : 'Coverage pace counts first reviews, not repeat answers.'} Future content changes and learning pace can change the estimate.</small></details>
        </div>}
        <div className={styles.actions}><button type="button" disabled={busy || loading || !!draft} onClick={() => edit(goal)}>Edit {goal.name}</button><button type="button" className={styles.danger} disabled={busy || loading || !!draft} onClick={() => setRemoveId(goal.id)}>Remove {goal.name}</button></div>
        {removeId === goal.id && <div role="group" aria-label={`Remove ${goal.name}?`}><p>Remove this goal? Learning history will stay intact.</p><div className={styles.actions}><button type="button" className={styles.danger} disabled={busy} onClick={() => void remove(goal)}>Confirm removal</button><button type="button" disabled={busy} onClick={() => setRemoveId(null)}>Keep goal</button></div></div>}
      </article>;
    })}</div>
    <p className={styles.note}>Goals track available material in your chosen Topics without changing Study selections or sliders. Overlapping goals share progress; their daily targets are not additive.</p>
  </section><StudyAdvisor libraryId={libraryId} requestScope={requestScope} goals={loading || error ? null : data} />
    {data && <p className={styles.updated}>Progress through {goalDate(data.today)} (UTC). Counts reflect current eligible material, deduplicated across shared Topic locations. <button type="button" disabled={busy || loading} onClick={() => void reload()}>Refresh progress</button></p>}
  </div>;
}
