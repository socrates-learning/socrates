'use client';

import { useEffect, useRef, useState } from 'react';
import type { LearnerCardTopic } from '@/lib/learner-card-search';
import { containTopicDialogFocus } from '@/lib/topic-detachment';
import dialogStyles from '../TopicLocationDialog.module.css';
import styles from './LearnerCardTools.module.css';

export function MoveCardDialog({ topics, currentKey, currentName, onCancel, onMove }: {
  topics: readonly LearnerCardTopic[]; currentKey: string; currentName: string;
  onCancel: () => void; onMove: (destination: LearnerCardTopic) => Promise<void>;
}) {
  const modal = useRef<HTMLDialogElement>(null), searchInput = useRef<HTMLInputElement>(null), pending = useRef(false);
  const [query, setQuery] = useState(''), [destination, setDestination] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const available = topics.filter(topic => topic.canMove && topic.key !== currentKey);
  const visible = available.filter(topic => topic.paths.some(path => path.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
  const selected = available.find(topic => topic.key === destination);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = modal.current; dialog?.showModal(); searchInput.current?.focus();
    return () => { dialog?.close(); requestAnimationFrame(() => { if (previous?.isConnected) previous.focus(); }); };
  }, []);
  async function move() {
    if (!selected || pending.current) return;
    pending.current = true; setBusy(true); setError(''); modal.current?.focus();
    try { await onMove(selected); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'The move could not be confirmed. Reload the Card before retrying.'); }
    finally { pending.current = false; setBusy(false); }
  }
  return <dialog ref={modal} tabIndex={-1} className={`${dialogStyles.dialog} ${styles.moveDialog}`} aria-labelledby="move-card-title"
    aria-describedby="move-card-description" onKeyDown={containTopicDialogFocus}
    onCancel={event => { event.preventDefault(); if (!pending.current) onCancel(); }}>
    <h2 id="move-card-title">Move Card</h2>
    <p className={styles.currentTopic}>Current Topic: <strong>{currentName}</strong></p>
    <p id="move-card-description">Move this Card to another Topic. Its content and learning history stay with it. Shared Topic locations use the same Card attachment; no copies are created.</p>
    <label className={styles.destinationSearch}>Find a destination Topic<input ref={searchInput} type="search" value={query} disabled={busy} onChange={event => setQuery(event.target.value)} /></label>
    <fieldset className={styles.destinations} disabled={busy}>
      <legend>Destination Topic</legend>
      {visible.map(topic => <label key={topic.key} className={styles.destination}>
        <input type="radio" name="card-destination" value={topic.key} checked={destination === topic.key} onChange={() => setDestination(topic.key)} />
        <span>{topic.paths[0]}{topic.paths.slice(1).map(path => <small key={path}>Also at: {path}</small>)}</span>
      </label>)}
      {!visible.length && <p>{available.length ? 'No Topics match this search.' : 'No other authorized Topics are available.'}</p>}
    </fieldset>
    {selected && <p className={styles.currentTopic}>Move to: <strong>{selected.paths[0]}</strong></p>}
    {busy && <p role="status">Moving Card…</p>}
    {error && <p role="alert" className={dialogStyles.error}>{error}</p>}
    <div className={styles.actions}><button type="button" disabled={busy} onClick={onCancel}>Cancel</button>
      <button type="button" className={styles.primary} disabled={busy || !selected} onClick={() => void move()}>Confirm Move</button></div>
  </dialog>;
}
