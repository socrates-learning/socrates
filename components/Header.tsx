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

      if (isMounted) setRole(roleData?.role ?? null);
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
    router.push('/login');
  }

  function handleHomeClick() {
    window.dispatchEvent(new Event('socrates-open-deck-dashboard'));
  }

  function handleStudyClick() {
    window.history.replaceState(null, '', '#set-up-deck');
    window.dispatchEvent(new Event('socrates-open-deck-setup'));
  }

  function handleCreatorClick() {
    window.dispatchEvent(new Event('socrates-open-creator-dashboard'));
  }

  const isEditor = role === 'editor' || role === 'admin';
  const isAdmin = role === 'admin';
  const accountLabel = email ? 'Account' : 'Login';

  return (
    <header className="header">
      <div>
        <h1 style={{ margin: 0 }}>Socrates</h1>
        <p>
          Real application foundation · concept-network learning platform
        </p>
      </div>

      <nav style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <Link className="btn ghost" href="/" onClick={handleHomeClick}>
          Home
        </Link>

        <button className="btn ghost" type="button" disabled>
          Learn
        </button>

        <button className="btn ghost" type="button" onClick={handleStudyClick}>
          Study
        </button>

        <button className="btn ghost" type="button" disabled>
          Progress
        </button>

        {isEditor && (
          <Link className="btn ghost" href="/creator" onClick={handleCreatorClick}>
            Creator Studio
          </Link>
        )}

        {isAdmin && (
          <Link className="btn ghost" href="/admin/users">
            Admin
          </Link>
        )}

        {email ? (
          <details style={{ position: 'relative' }}>
            <summary className="btn primary" style={{ cursor: 'pointer' }}>
              {accountLabel}
            </summary>
            <div
              className="panel"
              style={{
                minWidth: 180,
                position: 'absolute',
                right: 0,
                top: 'calc(100% + 8px)',
                zIndex: 10,
              }}
            >
              <p className="muted" style={{ marginTop: 0 }}>
                Signed in
              </p>
              <button className="btn ghost" type="button" disabled>
                Account
              </button>
              <button className="btn ghost" type="button" disabled>
                Settings
              </button>
              <button className="btn primary" type="button" onClick={handleLogout}>
                Logout
              </button>
            </div>
          </details>
        ) : (
          <Link className="btn primary" href="/login">
            Login
          </Link>
        )}
      </nav>
    </header>
  );
}
