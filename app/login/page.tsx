'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

const RECOVERY_TIMEOUT_MS = 12000;

function withRecoveryTimeout<T>(operation: Promise<T>, label: string) {
  return Promise.race([
    operation,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => {
        reject(new Error(`${label} timed out`));
      }, RECOVERY_TIMEOUT_MS);
    }),
  ]);
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const recoveryAttemptedRef = useRef(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function completeRecoveryFromHash() {
      if (recoveryAttemptedRef.current) {
        return;
      }

      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const callbackType = hashParams.get('type');

      if (!accessToken || !refreshToken || callbackType !== 'recovery') {
        return;
      }

      recoveryAttemptedRef.current = true;
      setIsSubmitting(true);
      setMessage('Opening your password reset link...');

      try {
        const { data, error } = await withRecoveryTimeout(
          supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          }),
          'Password reset session setup'
        );

        if (error) {
          console.error('Supabase recovery session setup from login failed:', error);
          setMessage('This password reset link is invalid or has expired.');
          return;
        }

        if (!data.session) {
          console.error('Supabase recovery session setup returned no session.');
          setMessage('This password reset link is invalid or has expired.');
          return;
        }

        const {
          data: { session },
          error: sessionError,
        } = await withRecoveryTimeout(
          supabase.auth.getSession(),
          'Password reset session confirmation'
        );

        if (sessionError || !session) {
          console.error('Supabase recovery session confirmation failed:', sessionError);
          setMessage('Password reset session could not be confirmed. Request a fresh link and try again.');
          return;
        }

        window.history.replaceState(null, '', '/login');
        router.replace('/reset-password');
        router.refresh();
      } catch (error) {
        console.error('Supabase recovery flow stalled or failed:', error);
        setMessage('Password reset link could not be opened. Request a fresh link and try again.');
      } finally {
        setIsSubmitting(false);
      }
    }

    completeRecoveryFromHash();
  }, [router]);

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage('Signing in...');

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setIsSubmitting(false);

    if (error) {
      console.error('Supabase password login failed:', error);
      setMessage('Unable to sign in. Check your email and password.');
      return;
    }

    const nextPath = searchParams.get('next') || '/';
    router.replace(nextPath.startsWith('/') ? nextPath : '/');
    router.refresh();
  }

  return (
    <section className="panel" style={{ maxWidth: 480, margin: '4rem auto' }}>
      <Image
        alt="Socrates — Learn anything."
        height={213}
        priority
        src="/brand/socrates-logo-full.png"
        style={{ display: 'block', height: 'auto', margin: '0 auto 24px', maxWidth: '100%' }}
        width={320}
      />
      <p className="muted">Sign in with your Socrates account.</p>

      <form onSubmit={handleLogin} className="stack">
        <label>
          Email
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        <button className="btn primary" type="submit" disabled={isSubmitting}>
          Log In
        </button>
      </form>

      <p>
        <Link href="/forgot-password">Forgot password?</Link>
      </p>

      {message && <p className="muted">{message}</p>}
    </section>
  );
}

export default function LoginPage() {
  return (
    <main className="layout">
      <Suspense fallback={<p>Loading...</p>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
