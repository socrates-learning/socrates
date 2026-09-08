'use client';

import { useEffect, useState } from 'react';
import { Activity, BookOpen, Clock3, RefreshCw, Search, Target } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import styles from './CreatorAlgorithmDiagnostics.module.css';

type Angle = { testing_angle: string; evidence_count: number; last_result: string; last_exposure_at: string };
type Concept = { id: string; name: string; state: null | { mastery_estimate: number; evidence_count: number; last_exposure_at: string; last_result: string }; angles: Angle[] };
type Diagnostics = {
  library: { id: string; name: string }; as_of: string;
  summary: { sessions: number; attempts: number; concepts_assessed: number; concepts_in_library: number };
  concepts: Concept[];
  recent_attempts: { id: string; created_at: string; concept_name: string | null; current_prompt: string | null; testing_angle: string | null; result: string; study_session_id: string }[];
  session: null | { id: string; started_at: string; cram_mode: boolean };
  official_offer: null | Record<string, string | number | boolean | null>;
  selected_source: string | null; source_decision: string | null;
};
const priorityFields = [
  ['new_component', 'New Concept'], ['review_component', 'Review need'],
  ['angle_component', 'Testing Angle need'], ['prerequisite_priority_component', 'Prerequisite'],
  ['urgent_review_component', 'Urgent review'], ['combined_lapse_priority_component', 'Combined lapse'],
  ['recent_penalty', 'Recent Concept penalty'],
] as const;
const number = (value: unknown) => typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 3 }) : String(value ?? '—');
// Display-only thresholds; persisted mastery and scheduler state are unchanged.
const masteryColor = (value: number) => value < .4 ? '#ee5876' : value < .6 ? '#f2a34e' : value < .65 ? '#e9bd48' : '#45b986';
const anglePalette = ['#347fea', '#46bd88', '#f5a14d', '#9770df', '#ec5d7e'];
function angleColor(name: string) {
  const key = name.toLowerCase();
  if (key.includes('recognition') || key.includes('definition')) return anglePalette[0];
  if (key.includes('mechanism') || key.includes('pathophysiology')) return anglePalette[1];
  if (key.includes('manifestation')) return anglePalette[2];
  if (key.includes('assessment') || key.includes('interpretation')) return anglePalette[3];
  if (key.includes('application')) return anglePalette[4];
  if (key.includes('intervention') || key.includes('management')) return '#299da5';
  if (key.includes('complication') || key.includes('outcome')) return '#bd9640';
  if (key.includes('differentiation') || key.includes('comparison')) return '#6866c7';
  if (key.includes('general understanding')) return '#6488a5';
  return `hsl(${Array.from(key).reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 0) % 360} 55% 48%)`;
}
const shortDate = (value: string) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
function Mastery({ concept }: { concept: Concept }) {
  return <span className={styles.mastery}>
    <span className={styles.meter} role="meter" aria-label={`${concept.name} mastery estimate`} aria-valuemin={0} aria-valuemax={1} aria-valuenow={concept.state?.mastery_estimate ?? undefined} aria-valuetext={concept.state ? number(concept.state.mastery_estimate) : 'No evidence'}>
      <i style={{ background: masteryColor(concept.state?.mastery_estimate ?? 0), width: `${Math.max(0, Math.min(1, concept.state?.mastery_estimate ?? 0)) * 100}%` }} />
    </span><strong title={concept.state ? String(concept.state.mastery_estimate) : 'No evidence'}>{concept.state ? number(concept.state.mastery_estimate) : '—'}</strong>
  </span>;
}
const reasons: Record<string, string> = {
  unseen_concept: 'The scheduler selected a Concept with no learner evidence.',
  fresh_forgot_lapse: 'The scheduler identifies a fresh Forgot lapse for this offer.',
  repeated_lapse_history: 'The scheduler identifies repeated lapses in recent history.',
  urgent_review: 'The scheduler identifies an urgent review need.',
  priority_score: 'The scheduler selected this offer using its current priority score.',
};
const date = (value: string) => new Date(value).toLocaleString();
const response = (value: string) => ({ didnt_know: "Didn't Know", too_hard: 'Too Hard', average: 'Average', easy: 'Easy' }[value] ?? value.replaceAll('_', ' '));

export function CreatorAlgorithmDiagnostics({ libraryId }: { libraryId: string | null }) {
  const [data, setData] = useState<Diagnostics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError(null); setData(null);
      if (!libraryId) { setLoading(false); return; }
      const result = await supabase.rpc('get_creator_algorithm_diagnostics', { p_library_id: libraryId });
      if (cancelled) return;
      if (result.error) {
        setError('Diagnostics could not be loaded. The staff diagnostics database function must be installed and your account must be an editor or admin.');
      } else {
        const next = result.data as Diagnostics;
        setData(next);
        setSelectedId(current => next.concepts.some(c => c.id === current) ? current : String(next.official_offer?.concept_id ?? next.concepts[0]?.id ?? ''));
      }
      setLoading(false);
    }
    void load().catch(() => { if (!cancelled) { setError('Diagnostics could not be loaded. Check your connection and retry.'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [libraryId, refresh]);
  const selected = data?.concepts.find(c => c.id === selectedId);
  const offer = data?.official_offer;
  const selectedOffer = offer?.concept_id === selectedId ? offer : null;
  const visibleConcepts = data?.concepts.filter(c => c.name.toLowerCase().includes(search.toLowerCase())) ?? [];
  const [showAll, setShowAll] = useState(false);
  const conceptRows = showAll ? visibleConcepts : visibleConcepts.slice(0, 6);
  const angles = selected?.angles ?? [];
  const totalEvidence = angles.reduce((total, angle) => total + angle.evidence_count, 0);
  let evidenceOffset = 0;
  const donutStops = angles.filter(angle => angle.evidence_count > 0).map(angle => {
    const start = evidenceOffset;
    evidenceOffset += angle.evidence_count / totalEvidence * 100;
    return `${angleColor(angle.testing_angle)} ${start}% ${evidenceOffset}%`;
  });
  const scoreScale = Math.max(1, ...priorityFields.map(([key]) => typeof selectedOffer?.[key] === 'number' ? Math.abs(selectedOffer[key] as number) : 0));
  return (
    <section className={styles.dashboard} aria-label="Algorithm diagnostics">
      <header className={styles.heading}>
        <div><h2>Algorithm</h2><p>Current learning state &amp; study decisions</p></div>
        <div className={styles.context}>
          {data && <span className={styles.library}><BookOpen size={14} aria-hidden="true" />{data.library.name}</span>}
          <button className={styles.refresh} type="button" onClick={() => setRefresh(n => n + 1)} disabled={loading || !libraryId}><RefreshCw size={14} aria-hidden="true" />Refresh</button>
        </div>
      </header>
      {!libraryId && <p className={styles.empty}>Select a Library to inspect its diagnostics.</p>}
      {loading && <p className={styles.empty} role="status">Loading authoritative diagnostics…</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {data && <>
        <div className={styles.summary}>
          {[
            { value:data.summary.sessions, label:'Study Sessions', note:'All time in this Library', icon:Clock3 },
            { value:data.summary.attempts, label:'Official Attempts', note:'Self-rated responses · not accuracy', icon:Activity },
            { value:data.summary.concepts_assessed, label:'Concepts Assessed', note:'Recorded in attempt history', icon:Target },
            { value:data.summary.concepts_in_library, label:'Concepts in Library', note:'Current Library placements', icon:BookOpen },
          ].map(({value,label,note,icon:Icon}) => <div className={styles.metric} key={label}><div><span>{label}</span><Icon size={18} aria-hidden="true" /></div><strong>{value.toLocaleString()}</strong><small>{note}</small></div>)}
        </div>
        <div className={styles.columns}>
          <section className={styles.panel} aria-label="Concept mastery">
            <div className={styles.panelHeading}><h3>Concept Mastery</h3><span className={styles.badge}>Current · 0–1 scale</span></div>
            <label className={styles.search}><Search size={14} aria-hidden="true" /><span className={styles.srOnly}>Find a Concept</span><input value={search} onChange={e => { setSearch(e.target.value); setShowAll(false); }} placeholder="Find a Concept" /></label>
            <div className={styles.progressList}>
              {conceptRows.map(c => <button className={styles.progressRow} key={c.id} type="button" aria-pressed={selectedId === c.id} onClick={() => setSelectedId(c.id)}><span className={styles.truncate} title={c.name}>{c.name}</span><Mastery concept={c} /></button>)}
              {!visibleConcepts.length && <p className={styles.empty}>No matching Concepts.</p>}
            </div>
            <div className={styles.panelFooter}><span>Persisted Concept state across Libraries</span>{visibleConcepts.length > 6 && <button type="button" onClick={() => setShowAll(v => !v)}>{showAll ? 'Show fewer' : `View all ${visibleConcepts.length}`} →</button>}</div>
          </section>
          <section className={styles.panel} aria-label="Testing Angle Evidence">
            <div className={styles.panelHeading}><h3>Testing Angle Evidence</h3><Target size={17} aria-hidden="true" /></div>
            <p className={styles.selectedName} title={selected?.name}>{selected?.name || 'Select a Concept'}</p>
            <div className={styles.evidenceChart}>
              <div className={styles.donut} role="img" aria-label={`${number(totalEvidence)} total persisted Primary Testing Angle evidence for ${selected?.name ?? 'the selected Concept'}. Distribution in the adjacent legend.`} style={{ background: totalEvidence > 0 ? `conic-gradient(${donutStops.join(', ')})` : '#e9edf5' }}>
                <div><strong>{number(totalEvidence)}</strong><span>Total evidence</span></div>
              </div>
              <ul className={styles.angleList} aria-label="Primary Testing Angle evidence distribution">
                {angles.map(a => <li className={styles.angle} key={a.testing_angle}>
                  <span className={styles.angleDot} style={{ background: angleColor(a.testing_angle) }} />
                  <span className={styles.angleName} title={a.testing_angle}>{a.testing_angle}</span>
                  <strong>{number(a.evidence_count)}</strong>
                  <span className={styles.angleShare}>{totalEvidence > 0 ? `${(a.evidence_count / totalEvidence * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%` : '—'}</span>
                </li>)}
                {!angles.length && <li className={styles.empty}>No Primary Testing Angle evidence for this Concept.</li>}
              </ul>
            </div>
            <p className={styles.panelFooter}>Selected Concept · persisted Primary evidence across Libraries. Additional classifications add no evidence. Self-ratings are not accuracy.</p>
          </section>
        </div>
        <section className={styles.panel} aria-label="Recent study activity">
          <div className={styles.panelHeading}><h3>Recent Study Activity</h3><span className={styles.badge}>Latest {data.recent_attempts.length} / 50 official attempts</span></div>
          <div className={styles.activity} tabIndex={0} aria-label="Recent official attempt history">
            <table><thead><tr><th>Date / Time</th><th>Concept</th><th>Question</th><th>Primary Testing Angle</th><th>Response</th></tr></thead><tbody>{data.recent_attempts.map(a => <tr key={a.id}><td><time dateTime={a.created_at} title={date(a.created_at)}>{shortDate(a.created_at)}, {new Date(a.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</time></td><td><span className={styles.activityConcept} title={a.concept_name || undefined}>{a.concept_name || 'Unavailable Concept'}</span></td><td><span className={styles.activityPrompt} title={a.current_prompt || undefined}>{a.current_prompt || 'Prompt unavailable'}</span></td><td><span className={styles.activityAngle} title={a.testing_angle || undefined}>{a.testing_angle || 'Not recorded'}</span></td><td><span className={styles.response} data-response={a.result}>{response(a.result)}</span></td></tr>)}</tbody></table>
            {!data.recent_attempts.length && <p className={styles.empty}>No recorded official attempts in this Library.</p>}
          </div>
          <p className={styles.note}>Recorded responses and Primary Angles · Concept names and Question excerpts reflect current content</p>
        </section>
        <div className={styles.columns}>
          <section className={styles.panel} aria-label="Concept spotlight">
            <div className={styles.panelHeading}><h3>Concept Spotlight</h3><span className={styles.badge}>Current state</span></div>
            <div className={styles.spotlightTable} tabIndex={0} aria-label="Concept spotlight table">
              <table><thead><tr><th>Concept</th><th>Mastery</th><th>Evidence</th><th>Last studied</th><th>Priority</th></tr></thead><tbody>{conceptRows.map(c => <tr key={c.id} aria-selected={selectedId === c.id}><td><button type="button" onClick={() => setSelectedId(c.id)} title={c.name}>{c.name}</button></td><td><Mastery concept={c} /></td><td>{c.state?.evidence_count ?? '—'}</td><td><span title={c.state ? date(c.state.last_exposure_at) : undefined}>{c.state ? shortDate(c.state.last_exposure_at) : 'Not yet'}</span></td><td>{offer?.concept_id === c.id ? <span className={styles.offerPriority} title="Current official offer only">{offer.concept_priority != null ? number(offer.concept_priority) : '—'}<small>Current offer</small></span> : '—'}</td></tr>)}</tbody></table>
              {!conceptRows.length && <p className={styles.empty}>No matching Concepts.</p>}
            </div>
            {selected && <details className={styles.raw}><summary>Selected Concept details</summary><p>{selected.name}</p><p>Mastery: {selected.state ? String(selected.state.mastery_estimate) : 'No evidence'} · Last response: {selected.state ? response(selected.state.last_result) : 'None'}</p></details>}
            <p className={styles.panelFooter}>Select a Concept to inspect · Priority is available for the current offer only</p>
          </section>
          <section className={`${styles.panel} ${styles.why}`} aria-label="Why this Concept">
            <div className={styles.panelHeading}><h3>Why This Concept?</h3><span className={styles.badge}>{selectedOffer ? 'Current official offer' : 'Selected Concept'}</span></div>
            <h4 className={styles.selectedName} title={selected?.name}>{selected?.name || 'Select a Concept'}</h4>
            <div className={styles.reasonColumns}>
              <dl className={styles.facts}>
                <div><dt>Current mastery</dt><dd>{selected ? <Mastery concept={selected} /> : '—'}</dd></div>
                <div><dt>Evidence</dt><dd>{selected?.state?.evidence_count ?? '—'}</dd></div>
                <div><dt>Last studied</dt><dd title={selected?.state ? date(selected.state.last_exposure_at) : undefined}>{selected?.state ? shortDate(selected.state.last_exposure_at) : 'Not yet'}</dd></div>
                {selectedOffer?.testing_angle != null && <div><dt>Offered Primary Angle</dt><dd>{String(selectedOffer.testing_angle)}</dd></div>}
              </dl>
              <div>
                {selectedOffer ? <>
                  <h5 className={styles.breakdownTitle}>Priority Score Breakdown</h5>
                  <dl className={styles.breakdown} aria-label="Authoritative priority components">{priorityFields.filter(([key]) => selectedOffer[key] != null).map(([key, label]) => <div key={key}><dt>{label}</dt><dd title={String(selectedOffer[key])}><span className={styles.scoreTrack} aria-hidden="true"><i style={{ width: `${typeof selectedOffer[key] === 'number' ? Math.abs(selectedOffer[key] as number) / scoreScale * 100 : 0}%` }} /></span><span>{number(selectedOffer[key])}</span></dd></div>)}</dl>
                  {selectedOffer.concept_priority != null && <div className={styles.priority}><span>Final Priority</span><strong title={String(selectedOffer.concept_priority)}>{number(selectedOffer.concept_priority)}</strong></div>}
                  {data.session?.cram_mode && <p className={styles.note}>Cram uses traversal rules; Normal Mode scores are unavailable.</p>}
                </> : <p className={styles.note}>{data.session ? 'Exact priority is available only for the current official offer.' : 'No open Study session. Start one in Study to inspect its current offer.'}</p>}
              </div>
            </div>
            {offer && !selectedOffer && <button className={styles.inspect} type="button" onClick={() => { setSelectedId(String(offer.concept_id)); setSearch(''); }}>Inspect current official offer →</button>}
            {selectedOffer && <>
              <p className={styles.explanation}>{reasons[String(selectedOffer.selection_reason)] || 'This is the current official offer returned by the scheduler.'}{data.selected_source === 'personal' ? ' Personal material is currently selected instead.' : ''}</p>
              <details className={styles.raw}><summary>Advanced details</summary>
                <p>{selected?.name}</p><p>Current Question: {String(selectedOffer.prompt ?? 'Unavailable')}</p>
                <p>Components are scheduler outputs, not an additive formula. Exact values are preserved below.</p>
                <p>Session: {data.session ? date(data.session.started_at) : 'None'} · Next source: {data.selected_source ?? 'None'} · {data.source_decision}</p>
                <pre>{JSON.stringify(selectedOffer, null, 2)}</pre>
              </details>
            </>}
          </section>
        </div>
        <p className={styles.footer}><strong>Socrates</strong><span>Read-only · Signed-in staff learner</span><span>Updated {date(data.as_of)}</span></p>
      </>}
    </section>
  );
}
