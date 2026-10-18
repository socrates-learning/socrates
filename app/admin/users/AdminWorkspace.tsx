'use client';

import { useCallback, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Mail, Users } from 'lucide-react';
import { AdminInbox } from './AdminInbox';
import styles from './AdminUsers.module.css';

export function AdminWorkspace({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<'users' | 'inbox'>('users');
  const [inboxVisited, setInboxVisited] = useState(false);
  const openInbox = useCallback(() => { setInboxVisited(true); setTab('inbox'); }, []);

  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'users' : event.key === 'End' ? 'inbox' : tab === 'users' ? 'inbox' : 'users';
    setTab(next);
    if (next === 'inbox') setInboxVisited(true);
    event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`#admin-tab-${next}`)?.focus();
  }

  return <main className={styles.page}>
    <section className={styles.panel} aria-labelledby="admin-title">
      <div className={styles.heading}>
        <div><p className={styles.eyebrow}>Administration</p><h1 id="admin-title">Admin</h1><p className={styles.description}>Manage Socrates and support our learning community.</p></div>
        <p className={styles.quote}>Better questions<br />build a brighter future.</p>
      </div>
      <div className={styles.tabs} role="tablist" aria-label="Admin workspace">
        <button type="button" role="tab" id="admin-tab-users" aria-controls="admin-panel-users" aria-selected={tab === 'users'} tabIndex={tab === 'users' ? 0 : -1} onKeyDown={navigateTabs} onClick={() => setTab('users')}><Users aria-hidden="true" />User Management</button>
        <button type="button" role="tab" id="admin-tab-inbox" aria-controls="admin-panel-inbox" aria-selected={tab === 'inbox'} tabIndex={tab === 'inbox' ? 0 : -1} onKeyDown={navigateTabs} onClick={openInbox}><Mail aria-hidden="true" />Inbox</button>
      </div>
      <div id="admin-panel-users" role="tabpanel" aria-labelledby="admin-tab-users" hidden={tab !== 'users'} className={styles.tabPanel}>{children}</div>
      <div id="admin-panel-inbox" role="tabpanel" aria-labelledby="admin-tab-inbox" hidden={tab !== 'inbox'} className={styles.tabPanel}>{inboxVisited && <AdminInbox onNavigationBlocked={openInbox} />}</div>
    </section>
  </main>;
}
