'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
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
  const navButtonStyle = {
    alignItems: 'center',
    background: 'rgba(6, 24, 70, 0.72)',
    border: '1px solid rgba(214, 224, 246, 0.36)',
    borderRadius: 9,
    color: '#ffffff',
    display: 'inline-flex',
    font: 'inherit',
    fontSize: 16,
    fontWeight: 800,
    gap: 9,
    minHeight: 58,
    padding: '13px 16px',
    textDecoration: 'none',
    whiteSpace: 'nowrap' as const,
  };
  const activeNavButtonStyle = {
    ...navButtonStyle,
    background: '#155ee8',
    borderColor: '#2b71ff',
    boxShadow: '0 12px 26px rgba(21, 94, 232, 0.25)',
  };
  const disabledNavButtonStyle = {
    ...navButtonStyle,
    cursor: 'default',
    opacity: 1,
  };

  return (
    <header
      style={{
        alignItems: 'center',
        background: 'linear-gradient(180deg, #061846, #041238)',
        color: '#ffffff',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 28,
        justifyContent: 'space-between',
        minHeight: 126,
        padding: '34px 36px 28px',
      }}
    >
      <div style={{ alignItems: 'center', display: 'flex', flex: '1 1 300px', gap: 12 }}>
        <Image
          alt="Socrates owl mark"
          height={66}
          src="/brand/socrates-mark.png"
          style={{
            flex: '0 0 auto',
            height: 'clamp(48px, 4.6vw, 66px)',
            objectFit: 'contain',
            width: 'auto',
          }}
          width={76}
        />
        <div>
          <h1
            style={{
              fontFamily: 'Georgia, "Times New Roman", Times, serif',
              fontSize: 42,
              fontWeight: 900,
              letterSpacing: '-0.055em',
              lineHeight: 0.95,
              margin: 0,
            }}
          >
            Socrates
          </h1>
          <p
            style={{
              color: '#edf4ff',
              fontSize: 16,
              fontWeight: 500,
              letterSpacing: '-0.02em',
              margin: '10px 0 0',
            }}
          >
            Learn anything.
          </p>
        </div>
      </div>

      <nav
        style={{
          alignItems: 'center',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          justifyContent: 'flex-end',
        }}
      >
        <Link style={navButtonStyle} href="/" onClick={handleHomeClick}>
          Home
        </Link>

        <button style={disabledNavButtonStyle} type="button" disabled>
          Learn
        </button>

        <button style={navButtonStyle} type="button" onClick={handleStudyClick}>
          Study
        </button>

        <button style={disabledNavButtonStyle} type="button" disabled>
          Progress
        </button>

        {isEditor && (
          <Link style={navButtonStyle} href="/creator" onClick={handleCreatorClick}>
            Creator Studio
          </Link>
        )}

        {isAdmin && (
          <Link style={navButtonStyle} href="/admin/users">
            Admin
          </Link>
        )}

        {email ? (
          <details style={{ position: 'relative' }}>
            <summary style={{ ...activeNavButtonStyle, cursor: 'pointer' }}>
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
          <Link style={activeNavButtonStyle} href="/login">
            Login
          </Link>
        )}
      </nav>
    </header>
  );
}
