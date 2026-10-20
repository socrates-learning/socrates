'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getSafeInternalPath } from '@/lib/safe-internal-path';
import { MarkdownContent, cardMarkdownSummary, questionMarkdownSummary } from '@/components/MarkdownContent';
import QuestionMediaContent from '@/components/QuestionMediaContent';
import ConceptMediaContent from '@/components/ConceptMediaContent';
import QuestionPersonalNote from '@/components/QuestionPersonalNote';
import { CreatorDialogShell } from '@/components/creator/CreatorPresentationPrimitives';
import { loadFlaggedReview, loadFlaggedConcept, personalCardEditorHref, reviewAnswers, type FlaggedReviewItem } from '@/lib/stats-flagged-review';
import type { StudyConceptReview } from '@/lib/study-concept-review';
import styles from './StatsFlaggedReview.module.css';

function safeSource(value: string | null) {
  if (!value) return undefined;
  if (getSafeInternalPath(value, '')) return value;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined; } catch { return undefined; }
}

function FlaggedConcept({ item, ownerId, libraryId, onClose }: {
  item: FlaggedReviewItem; ownerId: string; libraryId: string; onClose: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; data: StudyConceptReview | null } | null>(null);
  const key = `${ownerId}:${libraryId}:${item.flag.id}:${attempt}`;
  useEffect(() => {
    const controller = new AbortController();
    void loadFlaggedConcept(supabase, item, ownerId, libraryId, controller.signal)
      .then(data => { if (!controller.signal.aborted) setResult({ key, data }); })
      .catch(() => { if (!controller.signal.aborted) setResult({ key, data: null }); });
    return () => controller.abort();
  }, [item, ownerId, libraryId, key]);
  const current = result?.key === key ? result : null;
  const concept = current?.data;
  return <CreatorDialogShell title="Concept Review" titleId="flagged-concept-title" onClose={onClose}>
    <div className={`${styles.review} ${styles.concept}`}>
      {!current ? <p role="status">Loading Concept…</p> : !concept ? <div role="alert">
        <p>Concept review is unavailable. Your flagged item is unchanged.</p>
        <button type="button" onClick={() => setAttempt(value => value + 1)}>Retry</button>
      </div> : <>
        <h3>{concept.name}</h3>
        {concept.summary && <section><h4>Summary</h4><p>{concept.summary}</p></section>}
        {concept.whyItMatters && <section><h4>Why it matters</h4><p>{concept.whyItMatters}</p></section>}
        {concept.bodyMarkdown ? item.source === 'official'
          ? <ConceptMediaContent markdown={concept.bodyMarkdown} format={concept.bodyFormat} conceptId={concept.conceptId} libraryId={libraryId} />
          : <MarkdownContent markdown={concept.bodyMarkdown} /> : <p>No explanation has been saved for this Concept.</p>}
        {concept.sources.length > 0 && <section><h4>Sources</h4>{concept.sources.map(source => <div key={source.id}>
          <strong>{source.title}</strong>{source.author && <p>{source.author}</p>}{source.sourceType && <p>{source.sourceType}</p>}
          {source.note && <p className={styles.literal}>{source.note}</p>}
          {safeSource(source.url) && <a href={safeSource(source.url)} target="_blank" rel="noopener noreferrer">Open source</a>}
        </div>)}</section>}
      </>}
      <button type="button" onClick={onClose}>Back to flagged item</button>
    </div>
  </CreatorDialogShell>;
}

export function StatsFlaggedReview({ ownerId, libraryId }: { ownerId: string; libraryId: string }) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; items?: FlaggedReviewItem[] } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [conceptOpen, setConceptOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState('');
  const removeLock = useRef(false);
  const scope = `${ownerId}:${libraryId}`;
  const liveScope = useRef<string | null>(scope);
  const key = `${scope}:${attempt}`;
  useEffect(() => {
    liveScope.current = scope;
    return () => { liveScope.current = null; };
  }, [scope]);
  useEffect(() => {
    const controller = new AbortController();
    void loadFlaggedReview(supabase, ownerId, libraryId, controller.signal)
      .then(items => { if (!controller.signal.aborted) setResult({ key, items }); })
      .catch(() => { if (!controller.signal.aborted) setResult({ key }); });
    return () => controller.abort();
  }, [ownerId, libraryId, key]);
  const current = result?.key === key ? result : null;
  const items = current?.items || [];
  const query = search.trim().toLocaleLowerCase();
  const visible = items.filter(item => `${item.title} ${item.flag.note || ''}`.toLocaleLowerCase().includes(query));
  const selected = items.find(item => item.flag.id === selectedId) || items[0];
  const closeConcept = useCallback(() => setConceptOpen(false), []);
  const editHref = selected && personalCardEditorHref(selected, ownerId, libraryId);
  async function unflag() {
    if (!selected || removeLock.current || selected.flag.user_id !== ownerId) return;
    removeLock.current = true;
    setRemoving(true); setRemoveError('');
    try {
      const { error } = await supabase.from('study_candidate_flags').delete().eq('id', selected.flag.id).eq('user_id', ownerId);
      if (error) throw error;
      if (liveScope.current === scope) setResult(value => value?.key === key ? { key, items: value.items?.filter(item => item.flag.id !== selected.flag.id) } : value);
    } catch {
      if (liveScope.current === scope) setRemoveError('Your flag could not be removed. Please try again.');
    } finally {
      removeLock.current = false;
      if (liveScope.current === scope) setRemoving(false);
    }
  }
  return <section className={`${styles.review} ${styles.workspace}`} aria-label="Flagged Review">
    <header className={styles.heading}>
      <div className={styles.intro}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 22V3m0 1c5-5 11 4 16-1v12c-5 5-11-4-16 1" /></svg>
        <div><h3>Flagged Review</h3><p>Review your flagged Questions and personal Cards.</p></div>
      </div>
      <label className={styles.search}>
        <span className={styles.srOnly}>Search flags</span>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5" /></svg>
        <input type="search" placeholder="Search flags…" value={search} onChange={event => setSearch(event.target.value)} />
      </label>
    </header>
    <div className={styles.columns}>
      <section className={styles.panel} aria-label="Your flagged items">
        <h4>Flagged items{current?.items && ` (${items.length})`}</h4>
        {!current ? <p className={styles.state} role="status">Loading your flags…</p> : !current.items ? <div className={styles.state} role="alert"><p>Your flags could not be loaded.</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Retry</button></div> : <>
          {!items.length && <div className={styles.state}>
            <span className={styles.stateIcon}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 3h12v18l-6-4-6 4Z" /></svg></span>
            <strong>No flagged material yet.</strong><p>Flag a Question or personal Card while studying to find it here.</p>
          </div>}
          {items.length > 0 && !visible.length && <div className={styles.state}><strong>No flags match your search.</strong><p>Try a different Question, Card, or flag note.</p></div>}
          <div className={styles.list} tabIndex={0} role="region" aria-label="Flagged items list">{visible.map(item => <button type="button" key={item.flag.id}
            className={styles.row} aria-pressed={selected?.flag.id === item.flag.id} disabled={removing}
            onClick={() => { setSelectedId(item.flag.id); setConceptOpen(false); setRemoveError(''); }}>
            <strong>{item.question ? questionMarkdownSummary(item.title, item.question.prompt_format) : item.card?.concept_id === null ? cardMarkdownSummary(item.title) : item.title}</strong>
            <small>{item.source === 'official' ? 'Question' : 'Personal Card'} · <time dateTime={item.flag.created_at}>{new Date(item.flag.created_at).toLocaleDateString()}</time></small>
          </button>)}</div>
        </>}
      </section>
      <section className={styles.panel} aria-label="Flagged item details">
        <h4>Details</h4>
        {selected ? <>
          {selected.question ? <>
            <section><h4>Question</h4><MarkdownContent markdown={selected.question.prompt} mode="question" format={selected.question.prompt_format} />
              <QuestionMediaContent questionId={selected.question.id} hint={selected.question.question_media_hint} surface="front" prompt={selected.question.prompt} answer={reviewAnswers(selected)[0]?.answer_text} /></section>
            <section><h4>Answer</h4>{reviewAnswers(selected).length ? reviewAnswers(selected).map(answer => <MarkdownContent key={answer.id} markdown={answer.answer_text} mode="question" format={answer.answer_format} />) : <p>No Answer is currently available.</p>}
              <QuestionMediaContent questionId={selected.question.id} hint={selected.question.question_media_hint} surface="answer" prompt={selected.question.prompt} answer={reviewAnswers(selected)[0]?.answer_text} /></section>
            {selected.question.explanation && <section><h4>Explanation</h4><p className={styles.literal}>{selected.question.explanation}</p></section>}
          </> : selected.card ? <>
            <section><h4>Front</h4>{selected.card.concept_id === null ? <MarkdownContent markdown={selected.card.question} mode="card" /> : <p className={styles.literal}>{selected.card.question}</p>}</section>
            <section><h4>Back</h4>{selected.card.concept_id === null ? <MarkdownContent markdown={selected.card.answer} mode="card" /> : <p className={styles.literal}>{selected.card.answer}</p>}</section>
          </> : <p>Material no longer available.</p>}
          {selected.flag.note && <section><h4>Your note</h4><p className={styles.literal}>{selected.flag.note}</p></section>}
          <p className={styles.timestamp}>Flagged <time dateTime={selected.flag.created_at}>{new Date(selected.flag.created_at).toLocaleString()}</time></p>
          <div className={styles.actions}>
            {(selected.question || selected.card?.concept_id) && <button type="button" onClick={() => setConceptOpen(true)}>Review Concept</button>}
            {selected.question && <QuestionPersonalNote key={`${scope}:${selected.question.id}`} userId={ownerId} libraryId={libraryId} questionId={selected.question.id} />}
            {editHref && <a className={styles.primary} href={editHref}>Edit This</a>}
            <button className={styles.danger} type="button" disabled={removing} onClick={() => void unflag()}>{removing ? 'Removing…' : 'Unflag'}</button>
          </div>
          {removeError && <p role="alert">{removeError}</p>}
          {conceptOpen && <FlaggedConcept key={`${scope}:${selected.flag.id}`} item={selected} ownerId={ownerId} libraryId={libraryId} onClose={closeConcept} />}
        </> : <div className={styles.state}>
          <span className={styles.stateIcon}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="2" width="14" height="20" rx="1" /><path d="M8 7h8M8 11h8M8 15h5" /></svg></span>
          <strong>No item selected</strong><p>Select a flagged item to review it.</p>
        </div>}
      </section>
    </div>
  </section>;
}
