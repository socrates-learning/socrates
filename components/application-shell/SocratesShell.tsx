'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { applicationNavigation, workspaceFromLocation, type WorkspaceId } from '@/lib/application-shell-navigation';
import styles from './SocratesShell.module.css';

type Guard = (resume?: () => void) => boolean;
type ShellContext = { registerGuard: (guard: Guard) => () => void; allowNavigation: Guard };
const Context = createContext<ShellContext | null>(null);
const BrandedHeaderContext = createContext(false);

export function useHasSocratesHeader() {
  return useContext(BrandedHeaderContext);
}

function WorkspaceIcon({ id }: { id: string }) {
  const paths: Record<string, string> = {
    home: 'M3 11 12 3l9 8M5 10v11h5v-7h4v7h5V10',
    creator: 'm4 20 4-1L20 7l-3-3L5 16l-1 4M14 7l3 3',
    stats: 'M5 20V10m7 10V4m7 16V8',
    account: 'M4 21c0-5 3-7 8-7s8 2 8 7M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    admin: 'm12 3 8 4v5c0 5-4 8-8 10-4-2-8-5-8-10V7l8-4m-4 9 3 3 5-6',
    menu: 'M4 6h16M4 12h16M4 18h16',
    logout: 'M9 4H4v16h5m-1-8h13m-5-5 5 5-5 5',
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[id]} /></svg>;
}

// Workspaces retain draft ownership; the provider only delegates navigation permission.
export function SocratesShellProvider({ children }: { children: ReactNode }) {
  const guard = useRef<Guard | null>(null);
  const registerGuard = useCallback((next: Guard) => {
    guard.current = next;
    return () => { if (guard.current === next) guard.current = null; };
  }, []);
  const allowNavigation = useCallback((resume?: () => void) => guard.current?.(resume) ?? true, []);
  const value = useMemo(() => ({ registerGuard, allowNavigation }), [registerGuard, allowNavigation]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSocratesNavigationGuard(guard: Guard) {
  const context = useContext(Context);
  useEffect(() => context?.registerGuard(guard), [context, guard]);
}

type NavigationProps = {
  active?: WorkspaceId;
  role?: string | null;
  onHome?: (event: MouseEvent<HTMLAnchorElement>) => void;
  onStats?: () => void;
  onCreator?: () => void;
  onLogout?: () => void | Promise<void>;
};

export function ApplicationNavigation({ active, role, onHome, onStats, onCreator, onLogout, compact = false, branded = false, home = false, onComplete }: NavigationProps & { compact?: boolean; branded?: boolean; home?: boolean; onComplete?: () => void }) {
  const context = useContext(Context);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const actionPending = useRef(false);
  const entries = applicationNavigation.filter(item =>
    (item.kind !== 'link' || !item.adminOnly || role === 'admin') && item.id !== 'menu');
  if (home) {
    const order = ['home', 'creator', 'stats', 'admin', 'account'];
    entries.sort((left, right) => order.indexOf(left.id) - order.indexOf(right.id));
  }
  async function logout(approved = false) {
    if (actionPending.current || (!approved && !(context?.allowNavigation(() => { void logout(true); }) ?? true))) return;
    actionPending.current = true;
    setBusy(true);
    try {
      if (onLogout) await onLogout();
      else {
        try { await fetch('/library/clear', { method: 'POST' }); }
        finally { await supabase.auth.signOut(); window.location.href = '/login'; }
      }
    } finally { actionPending.current = false; setBusy(false); }
  }
  return <nav className={`${styles.navigation} ${compact ? styles.icons : ''}`} aria-label="Socrates workspaces">
    <div className={styles.entries}>{entries.map(item => {
      const content = <><span aria-hidden="true" className={styles.icon}>{branded ? <WorkspaceIcon id={item.id} /> : item.icon}</span><span className={styles.label}>{item.label}</span></>;
      return item.kind === 'button'
        ? <button key={item.id} type="button" aria-label={item.label} title={item.label}>{content}</button>
        : <Link key={item.id} href={item.href} aria-label={item.label} title={item.label} aria-current={active === item.id ? 'page' : undefined} onClick={event => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          if (active === item.id) { event.preventDefault(); return; }
          event.preventDefault();
          const navigate = () => {
            if (item.id === 'home' && onHome) onHome(event);
            else if (item.id === 'stats' && onStats) onStats();
            else { if (item.id === 'creator') onCreator?.(); router.push(item.href); }
            onComplete?.();
          };
          if (!(context?.allowNavigation(navigate) ?? true)) return;
          navigate();
        }}>{content}</Link>;
    })}
      {home && role === 'admin' && <a href="/website" target="_blank" rel="noopener noreferrer" aria-label="Visit Website (opens in a new tab)" title="Visit Website (opens in a new tab)" style={{ fontSize: 14, fontWeight: 600 }}>
        <span aria-hidden="true" className={styles.icon}>↗</span><span className={styles.label}>Visit Website</span>
      </a>}
    </div>
    {home && <button className={styles.logout} type="button" aria-label="Log Out" title="Log Out" disabled={busy} onClick={() => { void logout(); }}><span aria-hidden="true" className={styles.icon}>{branded ? <WorkspaceIcon id="logout" /> : '↪'}</span><span className={styles.label}>Log Out</span></button>}
  </nav>;
}

export function SocratesShell({ children, variant = 'compact', headerAction, ...navigation }: NavigationProps & { children?: ReactNode; variant?: 'home' | 'compact' | 'header'; headerAction?: ReactNode }) {
  const pathname = usePathname();
  const context = useContext(Context);
  const router = useRouter();
  const [hash, setHash] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const sync = () => setHash(window.location.hash);
    sync();
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => { window.removeEventListener('hashchange', sync); window.removeEventListener('popstate', sync); };
  }, []);
  useEffect(() => { dialog.current?.close(); }, [pathname, navigation.active]);
  const active = navigation.active ?? workspaceFromLocation(pathname, hash) ?? undefined;
  const close = () => dialog.current?.close();
  if (variant === 'header') return <BrandedHeaderContext.Provider value={true}>
    <div className={styles.branded} data-creator-shell={active === 'creator' || undefined} data-admin-shell={active === 'admin' || undefined} data-stats-shell={active === 'stats' || undefined} data-account-shell={active === 'account' || undefined} data-profile-shell={pathname === '/profile' || undefined}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} prefetch={false} onClick={event => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          const navigate = () => {
            if (navigation.onHome) navigation.onHome(event);
            else router.push('/');
          };
          if (!(context?.allowNavigation(navigate) ?? true)) return;
          navigate();
        }}><Image src="/brand/socrates-logo-dark.png" alt="Socrates — Learn anything." width={270} height={152} priority /></Link>
        <div className={styles.headerNavigation}><ApplicationNavigation {...navigation} active={active} branded /></div>
        <button ref={trigger} className={styles.headerTrigger} type="button" aria-label="Open workspace navigation" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}><WorkspaceIcon id="menu" />Navigation</button>
        {headerAction}
      </header>
      <dialog ref={dialog} className={styles.drawer} aria-label="Workspace navigation" onClose={() => trigger.current?.focus()}>
        <button type="button" onClick={close} aria-label="Close workspace navigation">Close</button>
        <ApplicationNavigation {...navigation} active={active} branded onComplete={close} />
      </dialog>
      {children && <div className={styles.workspace}>{children}</div>}
    </div>
  </BrandedHeaderContext.Provider>;
  return <div className={variant === 'home' ? styles.home : styles.frame}>
    <aside className={styles.rail}>
      <button ref={trigger} className={styles.trigger} type="button" aria-label="Open workspace navigation" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>☰</button>
      <div className={styles.desktop}><ApplicationNavigation {...navigation} active={active} compact={variant !== 'home'} home={variant === 'home'} /></div>
    </aside>
    <dialog ref={dialog} className={styles.drawer} aria-label="Workspace navigation" onClose={() => trigger.current?.focus()}>
      <button type="button" onClick={close} aria-label="Close workspace navigation">Close</button>
      <ApplicationNavigation {...navigation} active={active} home={variant === 'home'} onComplete={close} />
    </dialog>
    {children && <div className={styles.workspace}>{children}</div>}
  </div>;
}
