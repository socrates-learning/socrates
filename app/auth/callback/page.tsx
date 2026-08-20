'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState('Please wait while Socrates completes your login.');

  useEffect(() => {
    async function finishLogin() {
      const code = searchParams.get('code');
      const callbackError = searchParams.get('error_description') || searchParams.get('error');
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const callbackType = searchParams.get('type') || hashParams.get('type');

      if (callbackError) {
        console.error('Supabase auth callback error:', callbackError);
        setMessage('Authentication link could not be completed. Request a fresh link and try again.');
        return;
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          console.error('Supabase code exchange failed:', error);
          setMessage('Authentication link could not be completed. Request a fresh link and try again.');
          return;
        }
      } else if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error) {
          console.error('Supabase recovery session setup failed:', error);
          setMessage('Password reset link could not be completed. Request a fresh link and try again.');
          return;
        }
      }

      const nextPath =
        callbackType === 'recovery'
          ? '/reset-password'
          : searchParams.get('next') || '/';
      router.replace(nextPath.startsWith('/') ? nextPath : '/');
    }

    finishLogin();
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
