'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { accountAppearance, resolvedAppearance, type Appearance } from '@/lib/appearance';

type AppearanceContext = { choice: Appearance; ready: boolean; saving: boolean; error: string; save: (choice: Appearance) => Promise<void> };
const Context = createContext<AppearanceContext | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [choice, setChoice] = useState<Appearance>('light');
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const account = useRef<string | null>(null);
  const generation = useRef(0);
  const pending = useRef(false);

  useEffect(() => {
    let mounted = true;
    const start = generation.current;
    void supabase.auth.getUser().then(({ data }) => {
      if (!mounted || generation.current !== start) return;
      account.current = data.user?.id ?? null;
      setChoice(accountAppearance(data.user?.user_metadata));
      setReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      generation.current += 1;
      account.current = session?.user.id ?? null;
      if (!pending.current || !session) setChoice(accountAppearance(session?.user.user_metadata));
      setReady(true);
      setError('');
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { document.documentElement.dataset.appearance = resolvedAppearance(choice, media.matches); };
    apply();
    media.addEventListener('change', apply);
    return () => { media.removeEventListener('change', apply); };
  }, [choice]);

  async function save(next: Appearance) {
    if (pending.current || !ready || !account.current) return;
    const userId = account.current;
    pending.current = true;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/profile/appearance', { method: 'PUT', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appearance: next }) });
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Appearance could not be saved. Please sign in again.');
      const result = await response.json();
      if (!response.ok || result.appearance !== next) throw new Error(result.error || 'Appearance could not be saved. Please try again.');
      if (account.current !== userId) return;
      setChoice(next);
      // Refresh this browser's metadata too, so later route changes and sign-ins agree.
      await supabase.auth.refreshSession();
    } catch (reason) {
      if (account.current === userId) setError(reason instanceof Error ? reason.message : 'Appearance could not be saved. Please try again.');
    } finally { pending.current = false; setSaving(false); }
  }

  return <Context.Provider value={{ choice, ready, saving, error, save }}>{children}</Context.Provider>;
}

export function useAppearance() {
  const value = useContext(Context);
  if (!value) throw new Error('AppearanceProvider is required.');
  return value;
}
