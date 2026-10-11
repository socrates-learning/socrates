'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { CreatorDialogShell } from '@/components/creator/CreatorPresentationPrimitives';
import { QUESTION_NOTE_LIMIT, loadQuestionPersonalNote, saveQuestionPersonalNote, deleteQuestionPersonalNote, type QuestionPersonalNote } from '@/lib/question-personal-notes';
import styles from './QuestionPersonalNote.module.css';

export function NoteEditor({ libraryId, questionId, onClose }: { libraryId: string; questionId: string; onClose: () => void }) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState<QuestionPersonalNote | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [conflict, setConflict] = useState(false);
  const dirty = useRef(false);
  const lock = useRef(false);
  const mounted = useRef(true);
  const close = useCallback(() => {
    if (lock.current || (dirty.current && !window.confirm('Discard unsaved note changes?'))) return;
    onClose();
  }, [onClose]);
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void loadQuestionPersonalNote(supabase, libraryId, questionId, controller.signal).then(note => {
      if (controller.signal.aborted) return;
      setSaved(note); setDraft(note?.note || ''); setLoaded(true); dirty.current = false;
    }).catch(() => {
      if (!controller.signal.aborted) setError('Your note could not be loaded. Please retry.');
    });
    return () => { mounted.current = false; controller.abort(); };
  }, [libraryId, questionId, attempt]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty.current && !lock.current) return;
      event.preventDefault(); event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);
  function reload() {
    if (lock.current || (dirty.current && !window.confirm('Replace unsaved changes with your saved note?'))) return;
    setError(''); setConflict(false); setMessage(''); setLoaded(false); setAttempt(value => value + 1);
  }
  async function write(remove: boolean) {
    if (lock.current || !loaded || (remove && !saved)) return;
    if (remove && !window.confirm('Remove your private note for this Question?')) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const note = remove
        ? (await deleteQuestionPersonalNote(supabase, libraryId, questionId, saved!.revision), null)
        : await saveQuestionPersonalNote(supabase, libraryId, questionId, draft, saved?.revision || null);
      if (!mounted.current) return;
      setSaved(note); setDraft(note?.note || ''); dirty.current = false;
      setConflict(false); setMessage(remove ? 'Note removed.' : 'Note saved.');
    } catch (cause) {
      if (!mounted.current) return;
      const stale = typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === '40001';
      setConflict(true);
      setError(stale ? 'Your note changed in another window. Reload the saved note before changing it.' : 'The change could not be confirmed. Your draft is still here. Reload the saved note before retrying.');
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  return <CreatorDialogShell title="My Note" titleId="my-question-note-title" descriptionId="my-question-note-description" onClose={close}>
    <div className={styles.editor}>
      <p id="my-question-note-description">Private to you. Separate from flag notes.</p>
      {!loaded && !error && <p role="status">Loading your note…</p>}
      {loaded && <>
        <label>My note<textarea autoComplete="off" maxLength={QUESTION_NOTE_LIMIT} value={draft} disabled={busy}
          onChange={event => { setDraft(event.target.value); dirty.current = event.target.value !== (saved?.note || ''); setMessage(''); }} /></label>
        <p className={styles.count}>{draft.length} / {QUESTION_NOTE_LIMIT}</p>
      </>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {(!loaded && error || conflict) && <button type="button" disabled={busy} onClick={reload}>{loaded ? 'Reload saved note' : 'Retry'}</button>}
      {message && <p role="status">{message}</p>}
      <div className={styles.actions}>
        <button type="button" onClick={close} disabled={busy}>Close</button>
        {loaded && saved && <button className={styles.danger} type="button" disabled={busy || conflict} onClick={() => void write(true)}>Remove note</button>}
        {loaded && <button className={styles.primary} type="button" disabled={busy || conflict || !draft.trim() || draft === (saved?.note || '')} onClick={() => void write(false)}>{busy ? 'Saving…' : 'Save note'}</button>}
      </div>
    </div>
  </CreatorDialogShell>;
}

export default function QuestionPersonalNote({ userId, questionId, libraryId, buttonClassName }: {
  userId: string; questionId: string; libraryId: string; buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  // No note read until explicitly opened; Study mounts this only after Reveal.
  return <>
    <button type="button" className={buttonClassName || styles.trigger} aria-haspopup="dialog" onClick={event => { event.stopPropagation(); setOpen(true); }} onKeyDown={event => event.stopPropagation()}>My Note</button>
    {open && createPortal(<NoteEditor key={`${userId}:${libraryId}:${questionId}`} libraryId={libraryId} questionId={questionId} onClose={close} />, document.body)}
  </>;
}
