'use client';

import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function PendingApprovalPage() {
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <main className="layout">
      <section className="panel" style={{ maxWidth: 560, margin: '4rem auto' }}>
        <h1>Account Pending Approval</h1>
        <p className="muted">
          Your Socrates account has not been approved yet. An admin must assign
          your account a Socrates role before you can access the application.
        </p>
        <button className="btn primary" type="button" onClick={handleLogout}>
          Logout
        </button>
      </section>
    </main>
  );
}
