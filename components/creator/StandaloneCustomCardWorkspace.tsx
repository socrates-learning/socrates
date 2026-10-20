'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { saveStandaloneCard, moveStandaloneCard,
  type CreatorStandaloneCard, type StandaloneCardAttachment } from '@/lib/standalone-custom-cards';
import type { LearnerCardTopic } from '@/lib/learner-card-search';
import { MoveCardDialog } from './MoveCardDialog';
import toolStyles from './LearnerCardTools.module.css';
import { PersonalCardField } from './PersonalCardField';
import styles from '../CreatorStudioV2Client.module.css';

export type StandaloneCardRequest = { card: CreatorStandaloneCard | null; attachment: StandaloneCardAttachment; topicName: string };

export function StandaloneCustomCardWorkspace({ ownerId, canCreate, request, onRequest, onSaved, onEditorState, richText = false, movement }: {
  movement?: { topics: readonly LearnerCardTopic[]; libraryId: string };
  richText?: boolean;
  ownerId: string; canCreate: boolean; request: StandaloneCardRequest | null;
  onRequest: (request: StandaloneCardRequest | null) => void;
  onEditorState: (dirty: boolean, busy: boolean) => void;
  onSaved: (card: CreatorStandaloneCard) => void;
}) {
  const [front, setFront] = useState(request?.card?.question ?? '');
  const [back, setBack] = useState(request?.card?.answer ?? '');
  const [sourceReference, setSourceReference] = useState(request?.card?.source_reference ?? '');
  const [frontComposing, setFrontComposing] = useState(false);
  const [backComposing, setBackComposing] = useState(false);
  const composing = frontComposing || backComposing;
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [moveOpen, setMoveOpen] = useState(false), [moveStatus, setMoveStatus] = useState('');
  const frontRef = useRef<HTMLTextAreaElement>(null);
  const dirty = !!request && (front !== (request.card?.question ?? '') || back !== (request.card?.answer ?? '') || sourceReference !== (request.card?.source_reference ?? ''));
  useEffect(() => { onEditorState(dirty, busy || composing || moveOpen); return () => onEditorState(false, false); }, [dirty, busy, composing, moveOpen, onEditorState]);
  useEffect(() => {
    if (!dirty) return;
    function protect(event: BeforeUnloadEvent) { event.preventDefault(); }
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [dirty]);
  function open(next: StandaloneCardRequest | null) {
    if (busyRef.current || composing || (dirty && !window.confirm('Discard unsaved Card changes?'))) return;
    setFront(next?.card?.question ?? ''); setBack(next?.card?.answer ?? ''); setError(''); onRequest(next);
    setSourceReference(next?.card?.source_reference ?? '');
    requestAnimationFrame(() => frontRef.current?.focus());
  }
  async function save() {
    if (!request || busyRef.current || composing || (!request.card && !canCreate)) return;
    busyRef.current = true; onEditorState(dirty, true); setBusy(true); setError('');
    try {
      const saved = await saveStandaloneCard(supabase, ownerId, request.attachment, front, back, request.card, sourceReference);
      onSaved(saved); setFront(saved.question); setBack(saved.answer);
      setSourceReference(saved.source_reference ?? '');
      onRequest({ ...request, card: saved });
    } catch (error) { setError(error instanceof Error ? error.message : 'Card could not be saved.'); }
    finally { busyRef.current = false; onEditorState(dirty, false); setBusy(false); }
  }
  async function move(destination: LearnerCardTopic) {
    if (!request?.card || !movement || busyRef.current || composing || dirty) throw new Error('Save or cancel your Card edits before moving.');
    const allowed = movement.topics.find(topic => topic.key === destination.key && topic.canMove);
    if (!allowed) throw new Error('Choose an available Topic.');
    const attachment: StandaloneCardAttachment = allowed.source === 'official'
      ? { source: 'official', topicId: allowed.topicId, libraryId: movement.libraryId }
      : { source: 'personal', topicId: allowed.topicId };
    busyRef.current = true; setBusy(true); setMoveStatus('');
    try {
      const moved = await moveStandaloneCard(supabase, ownerId, request.card, attachment);
      onSaved(moved); onRequest({ card: moved, attachment, topicName: allowed.name });
      setMoveOpen(false); setMoveStatus(`Card moved to ${allowed.paths[0]}.`);
    } finally { busyRef.current = false; setBusy(false); }
  }
  if (!request) return null;
  const topicKey = `${request.attachment.source}:topic:${request.attachment.topicId}`;
  return <>
    {movement && request.card && <div>
      <p className={toolStyles.currentTopic}>Current Topic: <strong>{movement.topics.find(topic => topic.key === topicKey)?.paths[0] || request.topicName}</strong></p>
      <button type="button" className={toolStyles.moveButton} disabled={busy || composing || dirty} onClick={() => setMoveOpen(true)}>Move Card</button>
      {dirty && <p className={toolStyles.hint}>Save or cancel your Card edits before moving. Your draft will stay here.</p>}
    </div>}
    {moveOpen && movement && request.card && <MoveCardDialog topics={movement.topics} currentKey={topicKey}
      currentName={movement.topics.find(topic => topic.key === topicKey)?.paths[0] || request.topicName}
      onCancel={() => setMoveOpen(false)} onMove={move} />}
    {moveStatus && <p role="status">{moveStatus}</p>}
    <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
      {richText ? <>
        <PersonalCardField label="Front" value={front} onChange={setFront} maxLength={10000} disabled={busy} onComposing={setFrontComposing} />
        <PersonalCardField label="Back" value={back} onChange={setBack} maxLength={20000} disabled={busy} onComposing={setBackComposing} />
      </> : <>
      <label className={styles.personalField}>Front<textarea ref={frontRef} value={front} maxLength={10000} required disabled={busy}
        onChange={(event) => setFront(event.target.value)} /></label>
      <label className={styles.personalField}>Back<textarea value={back} maxLength={20000} required disabled={busy}
        onChange={(event) => setBack(event.target.value)} /></label>
      </>}
      <label className={styles.personalField}>Source / Reference (optional)<textarea value={sourceReference} disabled={busy}
        onChange={event => setSourceReference(event.target.value)} /></label>
      <button type="submit" className={styles.primaryButton} disabled={busy || composing || !front.trim() || !back.trim()}>Save Card</button>
      <button type="button" className={styles.secondaryButton} disabled={busy || composing} onClick={() => open(null)}>Cancel</button>
    </form>
    {error && <div className={`${styles.status} ${styles.error}`} role="alert">{error}</div>}
  </>;
}
