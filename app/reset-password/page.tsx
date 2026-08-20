'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    async function checkSession() {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) {
        console.error('Supabase reset session check failed:', error);
      }

      setHasSession(Boolean(session));

      if (!session) {
        setMessage('Use the latest password reset email link before setting a new password.');
      }
    }

    checkSession();
  }, []);

  async function handleUpdate(event: React.FormEvent) {
    event.preventDefault();

    if (password.length < 8) {
      setMessage('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setMessage('Passwords do not match.');
      return;
    }

    if (!hasSession) {
      setMessage('Use the latest password reset email link before setting a new password.');
      return;
    }

    setIsSubmitting(true);
    setMessage('Updating password...');

    const { error } = await supabase.auth.updateUser({ password });

    setIsSubmitting(false);

    if (error) {
      console.error('Supabase password update failed:', error);
      setMessage('Unable to update password. Use the latest reset email link.');
      return;
    }

    await supabase.auth.signOut();
    setMessage('Password updated. Redirecting to login...');
    router.replace('/login');
    router.refresh();
  }

  return (
    <main className="layout">
      <section className="panel" style={{ maxWidth: 480, margin: '4rem auto' }}>
        <h1>Set New Password</h1>
        <p className="muted">Choose a new password for your Socrates account.</p>

        <form onSubmit={handleUpdate} className="stack">
          <label>
            New password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </label>

          <label>
            Confirm password
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </label>

          <button
            className="btn primary"
            type="submit"
            disabled={isSubmitting || !hasSession}
          >
            Update Password
          </button>
        </form>

        {message && <p className="muted">{message}</p>}
      </section>
    </main>
  );
}
