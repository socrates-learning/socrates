'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export function Header() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      const { data: userData } = await supabase.auth.getUser();

      if (!isMounted) return;

      if (!userData.user) {
        setEmail(null);
        setRole(null);
        return;
      }

      setEmail(userData.user.email ?? 'Account');

      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userData.user.id)
        .maybeSingle();

      if (isMounted) setRole(roleData?.role ?? 'learner');
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadSession();
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    setEmail(null);
    setRole(null);
    router.refresh();
    router.push('/');
  }

  const isEditor = role === 'editor' || role === 'admin';
  const isAdmin = role === 'admin';

  return (
    <header className="header">
      <div>
        <h1 style={{ margin: 0 }}>Socrates</h1>
        <p>
          Real application foundation · concept-network learning platform
        </p>
      </div>

      <nav style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <Link className="btn ghost" href="/">
          Home
        </Link>

        <Link className="btn ghost" href="/pharmacology">
          Pharmacology
        </Link>

        {isEditor && (
          <Link className="btn ghost" href="/creator">
            Creator Studio
          </Link>
        )}

        {isAdmin && (
          <Link className="btn ghost" href="/admin">
            Admin
          </Link>
        )}

        {isAdmin && (
          <Link className="btn ghost" href="/admin/users">
            Users
          </Link>
        )}

        {email ? (
          <>
            <span className="muted" style={{ alignSelf: 'center' }}>
              {email}
            </span>
            <button className="btn primary" type="button" onClick={handleLogout}>
              Logout
            </button>
          </>
        ) : (
          <Link className="btn primary" href="/login">
            Login
          </Link>
        )}
      </nav>
    </header>
  );
}
