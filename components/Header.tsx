'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type HeaderSession = {
  email: string | null;
  role: string | null;
};

const HeaderSessionContext = createContext<HeaderSession | null>(null);

export function HeaderSessionProvider({
  children,
  email,
  role,
}: HeaderSession & { children: ReactNode }) {
  return (
    <HeaderSessionContext.Provider value={{ email, role }}>
      {children}
    </HeaderSessionContext.Provider>
  );
}

export function Header() {
  const serverSession = useContext(HeaderSessionContext);
  const [email, setEmail] = useState<string | null>(serverSession?.email ?? null);
  const [role, setRole] = useState<string | null>(serverSession?.role ?? null);

  useEffect(() => {
    if (serverSession) return;

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
  }, [serverSession]);

  function handleHomeClick() {
    window.dispatchEvent(new Event('socrates-open-deck-dashboard'));
  }

  function handleCreatorClick() {
    window.dispatchEvent(new Event('socrates-open-creator-dashboard'));
  }

  const isEditor = role === 'editor' || role === 'admin';
  const isAdmin = role === 'admin';
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

        {isEditor && (
          <Link
            style={navButtonStyle}
            href="/creator/concepts/new"
            onClick={handleCreatorClick}
          >
            Creator Studio
          </Link>
        )}

        {isAdmin && (
          <Link style={navButtonStyle} href="/admin/users">
            Admin
          </Link>
        )}

        {!email && (
          <Link style={activeNavButtonStyle} href="/login">
            Login
          </Link>
        )}
      </nav>
    </header>
  );
}
