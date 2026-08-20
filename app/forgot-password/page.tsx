'use client';

import Link from 'next/link';
import { useState } from 'react';
import { getAuthRedirectOrigin } from '@/lib/auth-url';
import { supabase } from '@/lib/supabase';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleReset(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage('Sending reset email...');

    const origin = getAuthRedirectOrigin(window.location.origin);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/callback`,
    });

    setIsSubmitting(false);

    if (error) {
      console.error('Supabase password reset request failed:', error);
      setMessage('Unable to send reset email. Please try again.');
      return;
    }

    setMessage('If that email has a Socrates account, a reset link has been sent.');
  }

  return (
    <main className="layout">
      <section className="panel" style={{ maxWidth: 480, margin: '4rem auto' }}>
        <h1>Reset Password</h1>
        <p className="muted">
          Enter your email and Socrates will send a secure password reset link.
        </p>

        <form onSubmit={handleReset} className="stack">
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <button className="btn primary" type="submit" disabled={isSubmitting}>
            Send Reset Email
          </button>
        </form>

        <p>
          <Link href="/login">Back to login</Link>
        </p>

        {message && <p className="muted">{message}</p>}
      </section>
    </main>
  );
}
