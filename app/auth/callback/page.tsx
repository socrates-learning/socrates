'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    async function finishLogin() {
      const code = searchParams.get('code');

      if (code) {
        await supabase.auth.exchangeCodeForSession(code);
      }

      await supabase.rpc('assign_role_from_approved_domain');

      router.replace('/admin');
    }

    finishLogin();
  }, [router, searchParams]);

  return (
    <main className="layout">
      <section className="panel" style={{ maxWidth: 480, margin: '4rem auto' }}>
        <h1>Signing you in...</h1>
        <p className="muted">Please wait while Socrates completes your login.</p>
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