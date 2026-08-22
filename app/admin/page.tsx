'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function AdminTestPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [message, setMessage] = useState('Checking session...');

  useEffect(() => {
    async function checkUser() {
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        setMessage('No user is logged in.');
        return;
      }

      setEmail(userData.user.email ?? null);

      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userData.user.id)
        .single();

      setRole(roleData?.role ?? null);
      setMessage('User session found.');
    }

    checkUser();
  }, []);

  return (
    <main className="layout" style={{ gridTemplateColumns: '1fr' }}>
      <section className="panel" style={{ maxWidth: 600, margin: '4rem auto' }}>
        <h1>Temporary Admin Diagnostic</h1>
        <p className="muted">
          This page is a development-only access check. Permanent role
          management lives in Admin User Management.
        </p>

        <p>
          <Link className="btn primary" href="/admin/users">
            Open Admin User Management
          </Link>
        </p>

        <p className="muted">{message}</p>

        <p>
          <strong>Email:</strong> {email ?? 'Not logged in'}
        </p>

        <p>
          <strong>Role:</strong> {role ?? 'No role found'}
        </p>

        {role === 'admin' && <p>✅ Admin access confirmed.</p>}
        {role === 'editor' && <p>Editor role detected; admin route access should be blocked.</p>}
        {role === 'learner' && <p>Learner role detected; admin route access should be blocked.</p>}
        {!role && <p>❌ No role detected yet.</p>}
      </section>
    </main>
  );
}
