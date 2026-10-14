'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import styles from './DeleteAccount.module.css';

export default function DeleteAccount() {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const running = useRef(false);
  const returnPath = useRef<string | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    void fetch('/api/account/deletion', { cache: 'no-store' }).then(r => r.json()).then(result => {
      if (!current) return;
      if (result.state === 'pending') { setPending(true); dialog.current?.showModal(); }
      if (result.state === 'complete') { setComplete(true); dialog.current?.showModal(); }
    }).catch(() => { /* No destructive request is made while loading. */ });
    return () => { current = false; };
  }, []);
  function close() {
    if (busy || pending || uncertain || complete) return;
    if (returnPath.current) { window.history.replaceState(null, '', returnPath.current); returnPath.current = null; }
    dialog.current?.close(); setPassword(''); setConfirmation(''); setError(''); opener.current?.focus();
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (running.current || (!pending && (confirmation !== 'DELETE' || !password))) return;
    running.current = true; setBusy(true); setError('');
    try {
      if (!pending) {
        // Move before dispatch: a lost response or immediate reload must still
        // reach recovery even when the access fence has already committed.
        returnPath.current ??= window.location.pathname + window.location.search;
        window.history.replaceState(null, '', '/account/deletion');
        let definitelyRejected = false;
        try {
          const started = await fetch('/api/account/deletion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmation, password }) });
          definitelyRejected = [400, 401, 403].includes(started.status);
          const result = await started.json();
          if (!started.ok || result.state !== 'pending') throw new Error(result.error || 'Deletion could not be confirmed.');
          setPending(true); setUncertain(false); setPassword('');
        } catch (cause) {
          if (!definitelyRejected) { setUncertain(true); setPassword(''); }
          throw cause;
        }
      }
      const response = await fetch('/api/account/deletion', { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok || result.state !== 'complete') throw new Error(result.error || 'Deletion is not complete. Please retry.');
      setComplete(true); setPending(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Deletion could not be confirmed. Please retry.'); }
    finally { running.current = false; setBusy(false); }
  }
  return <div className={styles.section}>
    <div><h3>Delete Account</h3><p>Permanently remove your personal content, notes, profile and study progress.</p></div>
    <button ref={opener} className={styles.danger} type="button" onClick={() => dialog.current?.showModal()}>Delete Account</button>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="delete-account-title" aria-describedby="delete-account-description" onCancel={event => { event.preventDefault(); close(); }}>
      <h2 id="delete-account-title">{complete ? 'Account deleted' : pending ? 'Finish account deletion' : 'Permanently Delete Account?'}</h2>
      <p id="delete-account-description">{complete ? 'Your personal application data and sign-in account have been removed.' : 'This permanently deletes your personal Cards and Topics, images, notes, goals, flags, study history, progress, preferences and profile. This cannot be undone.'}</p>
      {complete ? <a className={styles.secondary} href="/login">Return to Sign In</a> : <form onSubmit={event => { void submit(event); }}>
        <p>Official content and required shared images remain. Your official author attribution becomes Former Contributor.</p>
        <p className={styles.retention}>Retained backups and provider security logs may expire separately. Restoring a backup must not restore access to a deleted account.</p>
        {!pending && <fieldset disabled={busy}>
          <label>Current Password<input type="password" autoComplete="current-password" required maxLength={1024} value={password} onChange={event => setPassword(event.target.value)} /></label>
          <label>Type DELETE to confirm<input autoComplete="off" spellCheck={false} value={confirmation} onChange={event => setConfirmation(event.target.value)} required pattern="DELETE" /></label>
        </fieldset>}
        {pending && <p role="status">Deletion has started. Your account is locked while cleanup finishes. If interrupted, use Retry to complete deletion.</p>}
        {uncertain && !pending && <p role="status">The confirmation response was interrupted. Your account may already be locked for deletion. Verify your password again to recover and finish the same request.</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.actions}>
          {!pending && !uncertain && <button type="button" className={styles.secondary} disabled={busy} onClick={close} autoFocus>Keep My Account</button>}
          <button className={styles.danger} type="submit" disabled={busy || (!pending && (confirmation !== 'DELETE' || !password))}>{busy ? 'Deleting Account…' : pending ? 'Retry Deletion' : uncertain ? 'Confirm and Continue' : 'Permanently Delete Account'}</button>
        </div>
      </form>}
    </dialog>
  </div>;
}
