'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState('Please wait while Socrates completes your login.');

  const exchange = useRef<Promise<string> | null>(null);

  useEffect(() => {
    let active = true;
    async function finishLogin(): Promise<string> {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const callbackError = searchParams.get('error_description') || searchParams.get('error')
        || hashParams.get('error_description') || hashParams.get('error');
      if (callbackError) throw new Error(callbackError);
      const code = searchParams.get('code');
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      let recovery = (searchParams.get('type') || hashParams.get('type')) === 'recovery';
      if (code) {
        // Observe recovery metadata even for older code-only reset links.
        const { data: listener } = supabase.auth.onAuthStateChange((event) => {
          if (event === 'PASSWORD_RECOVERY') recovery = true;
        });
        try {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error || !data.session) throw error || new Error('No session established.');
        } finally {
          listener.subscription.unsubscribe();
        }
      } else if (accessToken && refreshToken) {
        const { data, error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (error || !data.session) throw error || new Error('No session established.');
      } else {
        throw new Error('Authentication link is missing its credentials.');
      }
      const next = recovery ? '/reset-password' : searchParams.get('next') || '/';
      const destination = new URL(next, window.location.origin);
      return destination.origin === window.location.origin
        ? destination.pathname + destination.search + destination.hash : '/';
    }
    exchange.current ??= finishLogin();
    exchange.current.then((destination) => {
      if (active) router.replace(destination);
    }).catch(() => {
      if (active) setMessage('This authentication link is invalid, expired, or already used. Request a fresh link and try again.');
    });
    return () => { active = false; };
  }, [router, searchParams]);

  return (
    <main className="layout">
      <section className="panel" style={{ maxWidth: 480, margin: '4rem auto' }}>
        <h1>Signing you in...</h1>
        <p className="muted">{message}</p>
      </section>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<p>Signing you in...</p>}>
      <AuthCallbackContent />
    </Suspense>
  );
}
