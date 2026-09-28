'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { saveStandaloneCard,
  type CreatorStandaloneCard, type StandaloneCardAttachment } from '@/lib/standalone-custom-cards';
import styles from '../CreatorStudioV2Client.module.css';

export type StandaloneCardRequest = { card: CreatorStandaloneCard | null; attachment: StandaloneCardAttachment; topicName: string };

export function StandaloneCustomCardWorkspace({ ownerId, canCreate, request, onRequest, onSaved, onEditorState }: {
  ownerId: string; canCreate: boolean; request: StandaloneCardRequest | null;
  onRequest: (request: StandaloneCardRequest | null) => void;
  onEditorState: (dirty: boolean, busy: boolean) => void;
  onSaved: (card: CreatorStandaloneCard) => void;
}) {
  const [front, setFront] = useState(request?.card?.question ?? '');
  const [back, setBack] = useState(request?.card?.answer ?? '');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const frontRef = useRef<HTMLTextAreaElement>(null);
  const dirty = !!request && (front !== (request.card?.question ?? '') || back !== (request.card?.answer ?? ''));
  useEffect(() => { onEditorState(dirty, busy); return () => onEditorState(false, false); }, [dirty, busy, onEditorState]);
  useEffect(() => {
    if (!dirty) return;
    function protect(event: BeforeUnloadEvent) { event.preventDefault(); }
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [dirty]);
  function open(next: StandaloneCardRequest | null) {
    if (busyRef.current || (dirty && !window.confirm('Discard unsaved Card changes?'))) return;
    setFront(next?.card?.question ?? ''); setBack(next?.card?.answer ?? ''); setError(''); onRequest(next);
    requestAnimationFrame(() => frontRef.current?.focus());
  }
  async function save() {
    if (!request || busyRef.current || (!request.card && !canCreate)) return;
    busyRef.current = true; onEditorState(dirty, true); setBusy(true); setError('');
    try {
      const saved = await saveStandaloneCard(supabase, ownerId, request.attachment, front, back, request.card);
      onSaved(saved); setFront(saved.question); setBack(saved.answer);
      onRequest({ ...request, card: saved });
    } catch (error) { setError(error instanceof Error ? error.message : 'Card could not be saved.'); }
    finally { busyRef.current = false; onEditorState(dirty, false); setBusy(false); }
  }
  if (!request) return null;
  return <>
    <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <label className={styles.personalField}>Front<textarea ref={frontRef} value={front} maxLength={10000} required disabled={busy}
        onChange={(event) => setFront(event.target.value)} /></label>
      <label className={styles.personalField}>Back<textarea value={back} maxLength={20000} required disabled={busy}
        onChange={(event) => setBack(event.target.value)} /></label>
      <button type="submit" className={styles.primaryButton} disabled={busy || !front.trim() || !back.trim()}>Save Card</button>
      <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => open(null)}>Cancel</button>
    </form>
    {error && <div className={`${styles.status} ${styles.error}`} role="alert">{error}</div>}
  </>;
}
