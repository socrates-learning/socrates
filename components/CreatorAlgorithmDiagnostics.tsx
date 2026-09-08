'use client';

import { useEffect, useState } from 'react';
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
const fields = [
  ['concept_priority', 'Final Concept priority'], ['new_component', 'New Concept component'],
  ['review_component', 'Review component'], ['angle_component', 'Testing Angle component'],
  ['prerequisite_priority_component', 'Prerequisite contribution'],
  ['urgent_review_component', 'Urgent review component'],
  ['combined_lapse_priority_component', 'Combined lapse contribution'],
  ['lapse_priority_component', 'Fresh lapse contribution'],
  ['repeated_lapse_priority_component', 'Repeated-lapse contribution'],
  ['repeated_lapse_concern', 'Repeated-lapse concern'], ['repeated_lapse_signal', 'Repeated-lapse signal'],
  ['lapse_signal', 'Fresh lapse signal'], ['live_retrievability', 'Live retrievability'],
  ['recent_penalty', 'Recent Concept penalty'], ['selected_branch_balance', 'Selected branch balance'],
  ['target_difficulty_number', 'Target difficulty number'], ['difficulty', 'Offered Question difficulty (current)'],
  ['testing_angle', 'Offered Primary Testing Angle'], ['selected_angle_need', 'Offered Angle need'],
  ['concept_angle_need', 'Concept Angle need'], ['angle_evidence_count', 'Offered Angle evidence count'],
  ['angle_history_count', 'Offered Angle history count'], ['angle_evidence_component', 'Angle evidence component'],
  ['angle_time_component', 'Angle time component'], ['angle_response_component', 'Angle response component'],
  ['angle_contradiction_component', 'Angle contradiction component'], ['selection_reason', 'Scheduler selection reason'],
] as const;
const reasons: Record<string, string> = {
  unseen_concept: 'The scheduler selected a Concept with no learner evidence.',
  fresh_forgot_lapse: 'The scheduler identifies a fresh Forgot lapse for this offer.',
  repeated_lapse_history: 'The scheduler identifies repeated lapses in recent history.',
  urgent_review: 'The scheduler identifies an urgent review need.',
  priority_score: 'The scheduler selected this offer using its current priority score.',
};
const date = (value: string) => new Date(value).toLocaleString();
const response = (value: string) => value.replaceAll('_', ' ');

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
  return (
    <section className={styles.dashboard} aria-label="Algorithm diagnostics">
      <div className={styles.heading}>
        <div><h2>Algorithm diagnostics</h2><p>Read-only development testing · Signed-in staff learner only</p></div>
        <button type="button" onClick={() => setRefresh(n => n + 1)} disabled={loading || !libraryId}>Refresh diagnostics</button>
      </div>
      {!libraryId && <p>Select a Library to inspect its diagnostics.</p>}
      {loading && <p role="status">Loading authoritative diagnostics…</p>}
      {error && <p role="alert">{error}</p>}
      {data && <>
        <p><strong>Library: {data.library.name}</strong> · Snapshot: {date(data.as_of)}</p>
        <div className={styles.summary}>
          {[[data.summary.sessions, 'Study sessions'], [data.summary.attempts, 'Official attempts'], [data.summary.concepts_assessed, 'Concepts assessed']].map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}
        </div>
        <p className={styles.note}>All-time sessions and official attempts recorded in this Library. Responses are self-ratings, not graded accuracy. Concept and Angle state is cumulative across Libraries. Mastery estimates use a 0–1 scale.</p>
        <div className={styles.columns}>
          <section className={styles.panel} aria-label="Concept diagnostics">
            <h3>Concept state <span>({data.summary.concepts_in_library})</span></h3>
            <label>Find a Concept<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search Concepts" /></label>
            <div className={styles.scroll} tabIndex={0} aria-label="Concept state list">
              {data.concepts.filter(c => c.name.toLowerCase().includes(search.toLowerCase())).map(c => <button className={styles.concept} type="button" key={c.id} aria-pressed={selectedId === c.id} onClick={() => setSelectedId(c.id)}>
                <strong>{c.name}{offer?.concept_id === c.id ? ' · Official offer' : ''}</strong>
                <span>{c.state ? `Mastery estimate ${c.state.mastery_estimate} · Evidence ${c.state.evidence_count}` : 'No learner evidence'}</span>
                {c.state && <small>Last exposure: {date(c.state.last_exposure_at)}</small>}
              </button>)}
              {!data.concepts.some(c => c.name.toLowerCase().includes(search.toLowerCase())) && <p>No matching Concepts.</p>}
            </div>
          </section>
          <section className={styles.panel} aria-label="Why this Concept">
            <h3>Why this Concept?</h3>
            <p><strong>{selected?.name || 'Select a Concept'}</strong></p>
            {data.session ? <p className={styles.note}>Latest open session: {date(data.session.started_at)} · {data.session.cram_mode ? 'Cram' : 'Normal'} Mode. Next source: {data.selected_source || 'No eligible candidate'}{data.source_decision ? ` (${data.source_decision})` : ''}.</p> : <p>No open Study session in this Library. Start one in Study, then refresh here to inspect its current offer.</p>}
            {offer && !selectedOffer && <button type="button" onClick={() => { setSelectedId(String(offer.concept_id)); setSearch(''); }}>Inspect current official offer</button>}
            {selectedOffer ? <>
              <p className={styles.note}>Exact current official-offer output from the scheduler. {data.selected_source === 'personal' ? 'The unified scheduler currently chooses personal material instead.' : 'The offer can change after an attempt or a deck change.'} Components include intermediate values; do not add every row together.</p>
              {reasons[String(selectedOffer.selection_reason)] && <p>{reasons[String(selectedOffer.selection_reason)]}</p>}
              <p className={styles.prompt}>{String(selectedOffer.prompt ?? '')}</p>
              <dl className={styles.breakdown} tabIndex={0} aria-label="Authoritative priority components">
                {fields.filter(([key]) => selectedOffer[key] != null).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{String(selectedOffer[key])}</dd></div>)}
              </dl>
              {data.session?.cram_mode && <p className={styles.note}>Cram uses traversal rules. Normal Mode priority components are not available here.</p>}
              <details><summary>Raw official scheduler output</summary><pre>{JSON.stringify(selectedOffer, null, 2)}</pre></details>
            </> : data.session && <p>The scheduler returns a breakdown only for its current official offer. No per-Concept priority is estimated here.</p>}
          </section>
        </div>
        <section className={styles.panel} aria-label="Primary Testing Angle state">
          <h3>Primary Testing Angle state · {selected?.name || 'Select a Concept'}</h3>
          <p className={styles.note}>Persisted evidence from historical Primary Angles only. Additional classifications create no evidence. Rows retain their stored spelling; the scheduler normalizes matching Angle names. No per-Angle mastery estimate is stored.</p>
          <div className={styles.angleList} tabIndex={0}>
            {selected?.angles.map(a => <div className={styles.angle} key={a.testing_angle}><strong>{a.testing_angle}</strong><span>Evidence: {a.evidence_count}</span><span>Last response: {response(a.last_result)}</span><span>{date(a.last_exposure_at)}</span></div>)}
            {!selected?.angles.length && <p>No Primary Testing Angle evidence for this Concept.</p>}
          </div>
        </section>
        <section className={styles.panel} aria-label="Recent study activity">
          <h3>Recent study activity</h3>
          <p className={styles.note}>Latest 50 official attempts in this Library. Primary Angle and response are recorded at attempt time; names and prompt excerpts show current content. Historical difficulty and mastery delta are not recorded.</p>
          <div className={styles.activity} tabIndex={0}>
            {data.recent_attempts.map(a => <article key={a.id}><div><strong>{a.concept_name || 'Unavailable Concept'}</strong><time dateTime={a.created_at}>{date(a.created_at)}</time></div><p>{a.current_prompt || 'Prompt unavailable'}</p><span>Primary Angle: {a.testing_angle || 'Not recorded'} · Response: {response(a.result)}</span></article>)}
            {!data.recent_attempts.length && <p>No recorded official attempts in this Library.</p>}
          </div>
        </section>
      </>}
    </section>
  );
}
