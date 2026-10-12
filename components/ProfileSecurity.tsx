'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { LockKeyhole, Mail } from 'lucide-react';
import styles from './PersonalProfile.module.css';

export function ProfileSecurity({ email, onState }: { email: string; onState: (dirty: boolean, busy: boolean) => void }) {
  const [nextEmail, setNextEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [nonce, setNonce] = useState('');
  const [needsCode, setNeedsCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const pending = useRef(false);
  const dirty = Boolean(nextEmail || emailPassword || currentPassword || password || confirmPassword || nonce);
  useEffect(() => { onState(dirty, busy); }, [dirty, busy, onState]);
  function clear() { setNextEmail(''); setEmailPassword(''); setCurrentPassword(''); setPassword(''); setConfirmPassword(''); setNonce(''); setNeedsCode(false); }
  async function submit(action: 'email' | 'password' | 'reauthenticate', event?: FormEvent) {
    event?.preventDefault();
    if (pending.current) return;
    setError(''); setMessage('');
    if (action === 'password' && password !== confirmPassword) { setError('The new passwords do not match.'); return; }
    pending.current = true; setBusy(true);
    try {
      const body = action === 'email' ? { action, email: nextEmail.trim(), currentPassword: emailPassword }
        : action === 'password' ? { action, currentPassword, password, confirmPassword, ...(nonce ? { nonce } : {}) } : { action };
      const response = await fetch('/api/profile/security', { method: 'POST', cache: 'no-store', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (response.redirected || !response.headers.get('content-type')?.startsWith('application/json')) throw new Error('Please sign in again before changing account security.');
      const result = await response.json();
      if (result.reauthenticationRequired) setNeedsCode(true);
      if (!response.ok) throw new Error(result.error || 'The account change could not be completed.');
      setMessage(result.message);
      if (action === 'email') { setNextEmail(''); setEmailPassword(''); }
      if (action === 'password') { setCurrentPassword(''); setPassword(''); setConfirmPassword(''); setNonce(''); setNeedsCode(false); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The account change could not be completed.'); }
    finally { pending.current = false; setBusy(false); }
  }
  return <>
    <div className={styles.sectionHeading}><span className={styles.sectionIcon}><LockKeyhole aria-hidden="true" /></span><div><h2>Account Security</h2><p>Manage your sign-in details securely.</p></div></div>
    <div className={styles.securityGrid}>
      <form className={styles.securityCard} onSubmit={event => { void submit('email', event); }}>
        <h3><Mail aria-hidden="true" />Change Email</h3><p className={styles.hint}>Current email: <strong>{email}</strong></p>
        <fieldset disabled={busy} className={styles.fields}>
          <label className={styles.field}>New Email Address<input type="email" autoComplete="email" maxLength={254} required value={nextEmail} onChange={event => setNextEmail(event.target.value)} /></label>
          <label className={styles.field}>Current Password<input type="password" autoComplete="current-password" required maxLength={1024} value={emailPassword} onChange={event => setEmailPassword(event.target.value)} /></label>
          <p className={styles.hint}>Follow the verification instructions sent to your email inboxes. Your current email remains in use until confirmation.</p>
          <button className={styles.primary} type="submit">Send Verification</button>
        </fieldset>
      </form>
      <form className={styles.securityCard} onSubmit={event => { void submit('password', event); }}>
        <h3><LockKeyhole aria-hidden="true" />Change Password</h3>
        <fieldset disabled={busy} className={styles.fields}>
          <label className={styles.field}>Current Password<input type="password" autoComplete="current-password" required maxLength={1024} value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></label>
          <label className={styles.field}>New Password<input type="password" autoComplete="new-password" required minLength={12} maxLength={72} value={password} onChange={event => setPassword(event.target.value)} /></label>
          <label className={styles.field}>Confirm New Password<input type="password" autoComplete="new-password" required minLength={12} maxLength={72} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></label>
          <p className={styles.hint}>Use at least 12 characters. Your current password is verified before any change.</p>
          {needsCode && <div className={styles.codeBlock}><button type="button" className={styles.secondary} onClick={() => { void submit('reauthenticate'); }}>Send Verification Code</button><label className={styles.field}>Email Verification Code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" maxLength={10} value={nonce} onChange={event => setNonce(event.target.value)} required /></label></div>}
          <button className={styles.primary} type="submit">Update Password</button>
        </fieldset>
      </form>
    </div>
    {busy && <p role="status" className={styles.hint}>Completing your account request…</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {message && <p role="status" className={styles.success}>{message}</p>}
    {dirty && <div className={styles.saveRow}><button type="button" className={styles.secondary} disabled={busy} onClick={() => { clear(); setError(''); setMessage(''); }}>Discard Security Changes</button></div>}
  </>;
}
