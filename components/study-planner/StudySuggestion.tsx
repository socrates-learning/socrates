'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { SUGGESTION_CATEGORIES, SUGGESTION_LIMIT, requireSuggestionReceipt, type StudySuggestion as Suggestion } from '@/lib/study-suggestions';
import styles from './StudySuggestion.module.css';

export function StudySuggestion({ libraryId, questionId, disabled = false }: {
  libraryId: string; questionId: string | null; disabled?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const submitButton = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const request = useRef<Suggestion | null>(null);
  const [category, setCategory] = useState<Suggestion['category']>('Content Correction');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (error && !pending && dialog.current?.open) submitButton.current?.focus();
  }, [error, pending]);

  function close() { dialog.current?.close(); trigger.current?.focus(); }
  function open() {
    if (saved) {
      setMessage(''); setSaved(false); setAttempted(false); setError(''); request.current = null;
    }
    if (!dialog.current?.open) dialog.current?.showModal();
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || saved || !message.trim()) return;
    inFlight.current = true; setPending(true); setAttempted(true); setError('');
    // Freeze identity AND payload before transport. A lost acknowledgement may
    // already have committed; retrying must never generate another submission.
    request.current ??= { requestId: crypto.randomUUID(), libraryId, questionId, category, message: message.trim() };
    try {
      const response = await fetch('/api/study/suggestions', {
        method: 'POST', credentials: 'same-origin', redirect: 'error',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request.current), signal: AbortSignal.timeout(20000),
      });
      const result = await response.json();
      if (!response.ok) {
        // A definite validation/authorization/rate-limit rejection did not save.
        if ([400, 401, 403, 413, 415, 429].includes(response.status)) { request.current = null; setAttempted(false); }
        throw new Error(typeof result.error === 'string' ? result.error : 'Your suggestion could not be confirmed. Please retry.');
      }
      requireSuggestionReceipt(result);
      setSaved(true);
    } catch (failure) {
      setError(failure instanceof Error && failure.message && !['TypeError', 'TimeoutError', 'AbortError', 'SyntaxError'].includes(failure.name)
        ? failure.message : 'Your suggestion could not be confirmed. Please retry; the same submission will be used.');
    } finally { inFlight.current = false; setPending(false); }
  }

  return <span onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    <button ref={trigger} type="button" className="study-v2-context-action" disabled={disabled} aria-haspopup="dialog" onClick={open}>Suggest an Improvement</button>
    <dialog ref={dialog} className={styles.dialog} tabIndex={-1} aria-labelledby="study-suggestion-title" aria-describedby="study-suggestion-privacy"
      onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),textarea:not(:disabled)'));
        const first = controls[0], last = controls.at(-1);
        if (!first) { event.preventDefault(); event.currentTarget.focus(); }
        else if (event.shiftKey && (event.target === first || event.target === event.currentTarget)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && event.target === last) { event.preventDefault(); first.focus(); }
      }}
      onCancel={event => { event.preventDefault(); if (!inFlight.current) close(); }}>
      <h2 id="study-suggestion-title">Suggest an Improvement</h2>
      <p id="study-suggestion-privacy">{questionId
        ? 'Your message and official Question reference will be shared privately with Socrates Admins.'
        : 'Only your message will be shared privately with Socrates Admins. Your personal Card and notes are not attached.'}</p>
      {saved ? <>
        <p className={styles.success} role="status">Suggestion submitted. Thank you for helping improve Socrates.</p>
        <div className={styles.actions}><button type="button" className={styles.primary} onClick={close} autoFocus>Return to Study</button></div>
      </> : <form onSubmit={submit} aria-busy={pending}>
        <label>Category<select value={category} disabled={attempted} onChange={event => setCategory(event.target.value as Suggestion['category'])} autoFocus>
          {SUGGESTION_CATEGORIES.map(value => <option key={value}>{value}</option>)}
        </select></label>
        <label>Message<textarea value={message} maxLength={SUGGESTION_LIMIT} rows={6} required disabled={attempted}
          onChange={event => { setMessage(event.target.value); setError(''); }} aria-describedby="study-suggestion-limit" /></label>
        <p id="study-suggestion-limit" className={styles.hint}>Up to 4,000 characters. Include only information you intend to share with Admins.</p>
        {error && <p className={styles.error} role="alert">{error}</p>}
        {attempted && !pending && <p className={styles.hint}>Retry will check or send the same suggestion safely.</p>}
        <div className={styles.actions}>
          <button type="button" disabled={pending} onClick={close}>Cancel</button>
          <button ref={submitButton} type="submit" className={styles.primary} disabled={pending || !message.trim()}>{pending ? 'Submitting…' : attempted ? 'Retry Suggestion' : 'Submit Suggestion'}</button>
        </div>
      </form>}
    </dialog>
  </span>;
}
