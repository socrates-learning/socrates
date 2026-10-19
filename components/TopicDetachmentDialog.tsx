'use client';

import { useEffect, useRef, useState } from 'react';
import { containTopicDialogFocus, confirmedTopicDetachmentReview, removeReviewedTopic, topicDetachmentError, type TopicDetachmentReview, type TopicManagementRpc } from '@/lib/topic-detachment';
import type { OfficialTopicGraph } from '@/lib/topic-placement-graph';
import styles from './TopicDetachment.module.css';

export function TopicDetachmentDialog({ libraryId, locationId, rpc, onCancel, onRemoved }: {
  libraryId: string; locationId: string; rpc: TopicManagementRpc; onCancel: () => void;
  onRemoved: (graph: OfficialTopicGraph) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), cancel = useRef<HTMLButtonElement>(null), pending = useRef(false);
  const [review,setReview] = useState<TopicDetachmentReview | null>(null);
  const [error,setError] = useState(''), [busy,setBusy] = useState(false);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const modal = dialog.current; modal?.showModal(); cancel.current?.focus();
    return () => { modal?.close(); requestAnimationFrame(() => {
      if (previous?.isConnected && !previous.matches(':disabled')) previous.focus();
      else document.querySelector<HTMLElement>('[data-topic-assignment-filter="assigned"]')?.focus();
    }); };
  }, []);
  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        const result = await rpc('review_official_topic_detachment',{p_library_id:libraryId,p_location_id:locationId});
        if (result.error) throw result.error;
        const next = confirmedTopicDetachmentReview(result.data,libraryId,locationId);
        if (!disposed) setReview(next);
      } catch (e) { if (!disposed) setError(topicDetachmentError(e)); }
    })();
    return () => { disposed=true; };
  }, [libraryId,locationId,rpc]);
  async function confirm() {
    if (!review || review.blocked_by_personal_anchor || pending.current) return;
    pending.current=true; setBusy(true); setError(''); dialog.current?.focus();
    try { onRemoved(await removeReviewedTopic(rpc,review)); }
    catch (e) { setError(topicDetachmentError(e)); }
    finally { pending.current=false; setBusy(false); }
  }
  return <dialog ref={dialog} tabIndex={-1} onKeyDown={containTopicDialogFocus} className={styles.dialog} aria-labelledby="detach-topic-title" aria-describedby="detach-topic-description"
    onCancel={event => { event.preventDefault(); if (!pending.current) onCancel(); }}>
    <h2 id="detach-topic-title">Remove Topic</h2>
    <p id="detach-topic-description">Remove only this location and its confirmed descendant locations from the active Topic Tree. Concepts, Questions, references, images, saved preferences, mastery, and learning history will be preserved.</p>
    {!review && !error && <p role="status">Checking the selected Topic location…</p>}
    {review && <>
      <dl className={styles.details}><dt>Topic</dt><dd>{review.name}</dd><dt>Placement</dt><dd>{review.path}</dd>
        <dt>Descendant placements affected</dt><dd>{review.descendant_count}</dd>
        <dt>Other placements of this Topic</dt><dd>{review.other_placements} will remain unchanged.</dd></dl>
      <p>{review.unassigned_topics.length} Topic{review.unassigned_topics.length===1?'':'s'} will become Unassigned and remain available for reassignment.</p>
      {!!review.unassigned_topics.length && <ul className={styles.topicList}>{review.unassigned_topics.map(t=><li key={t.id}>{t.name}</li>)}</ul>}
      <p>Other shared placements and their child structures will not change.</p>
      {review.blocked_by_personal_anchor && <p role="alert" className={styles.error}>This location anchors personal material. Removal is blocked to preserve its owner’s access. No content has changed.</p>}
    </>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.actions}><button ref={cancel} type="button" disabled={busy} onClick={onCancel}>Cancel</button>
      <button className={styles.danger} type="button" disabled={busy || !review || review.blocked_by_personal_anchor || !!error} onClick={() => void confirm()}>{busy?'Removing…':'Remove Topic'}</button></div>
    {busy && <p role="status">Removing the selected placement. Please wait for confirmation.</p>}
  </dialog>;
}
