'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { supabase } from '@/lib/supabase';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      setMessage('Unable to sign in. Check your email and password.');
      return;
    }

    const nextPath = searchParams.get('next') || '/';
    router.replace(nextPath.startsWith('/') ? nextPath : '/');
    router.refresh();
  }

  return (
    <section className="panel" style={{ maxWidth: 480, margin: '4rem auto' }}>
      <h1>Socrates</h1>
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
