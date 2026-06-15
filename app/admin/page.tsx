'use client';

import { useEffect, useState } from 'react';
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
    <main className="layout">
      <section className="panel" style={{ maxWidth: 600, margin: '4rem auto' }}>
        <h1>Admin Access Test</h1>

        <p className="muted">{message}</p>

        <p>
          <strong>Email:</strong> {email ?? 'Not logged in'}
        </p>

        <p>
          <strong>Role:</strong> {role ?? 'No role found'}
        </p>

        {role === 'admin' && <p>✅ Admin access confirmed.</p>}
        {role === 'editor' && <p>✅ Editor access confirmed.</p>}
        {role === 'student' && <p>✅ Student access confirmed.</p>}
        {!role && <p>❌ No role detected yet.</p>}
      </section>
    </main>
  );
}