'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Info, Mail, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useSocratesNavigationGuard } from '@/components/application-shell/SocratesShell';
import { INBOX_CATEGORIES, INBOX_STATUSES, INBOX_NOTE_LIMIT, deleteInboxMessage, filterInboxMessages, inboxDeletionError, inboxError, inboxSourceLabel, loadInboxMessages, saveInboxMessage, type InboxDraft, type InboxMessage, type InboxStatus } from '@/lib/admin-inbox';
import styles from './AdminUsers.module.css';

const dateLabel = (date: string, detailed = false) => new Intl.DateTimeFormat('en', { dateStyle: 'medium', ...(detailed ? { timeStyle: 'short' as const } : {}), timeZone: 'UTC' }).format(new Date(date));
const accessDenied = (error: unknown) => ['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes((error as { code?: string })?.code ?? '');

export function AdminInbox({ onNavigationBlocked }: { onNavigationBlocked: () => void }) {
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [drafts, setDrafts] = useState<Record<string, InboxDraft>>({});
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedId, setSavedId] = useState('');
  const [deletedNotice, setDeletedNotice] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<InboxMessage | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const deleteTrigger = useRef<HTMLButtonElement>(null);
  const deleteCancel = useRef<HTMLButtonElement>(null);
  const reloadButton = useRef<HTMLButtonElement>(null);
  const notes = useRef<HTMLTextAreaElement>(null);
  const request = useRef<AbortController | null>(null);
  const epoch = useRef(0);
  const saving = useRef(false);
  const invalidate = useCallback(() => { epoch.current++; request.current?.abort(); }, []);
  const dirty = Object.keys(drafts).length > 0;
  const filtered = filterInboxMessages(messages, query, category, status);
  const selected = filtered.find(message => message.id === selectedId);
  const draft = selected ? drafts[selected.id] ?? { status: selected.status, notes: selected.admin_notes, revision: selected.revision } : null;

  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setLoading(true); setError(''); setSavedId(''); setDeletedNotice('');
    try {
      const data = await loadInboxMessages(supabase, controller.signal);
      if (controller.signal.aborted) return;
      setMessages(data); setSelectedId(current => data.some(m => m.id === current) ? current : data[0]?.id ?? '');
    } catch (failure) {
      if (controller.signal.aborted) return;
      setError(inboxError(failure));
      if (accessDenied(failure)) { setMessages([]); setDrafts({}); }
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, []);

  useEffect(() => {
    void load();
    let userId: string | undefined;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const nextId = session?.user.id;
      if (event === 'SIGNED_OUT' || (userId !== undefined && userId !== nextId)) {
        invalidate(); saving.current = false;
        setMessages([]); setDrafts({}); setSelectedId(''); setLoading(false); setBusy(false);
        deleteDialog.current?.close(); setDeleteTarget(null); setDeleting(false); setDeleteError(''); setDeletedNotice('');
        setError('Your session changed. Reload the page to verify Admin access.');
      }
      userId = nextId;
    });
    return () => { invalidate(); subscription.unsubscribe(); };
  }, [load, invalidate]);

  useEffect(() => {
    if (deleteTarget && !deleteDialog.current?.open) {
      deleteDialog.current?.showModal(); deleteCancel.current?.focus();
    }
  }, [deleteTarget]);
  useEffect(() => {
    if (!deleteDialog.current?.open) return;
    if (deleting) deleteDialog.current.focus();
    else if (deleteError) deleteCancel.current?.focus();
  }, [deleting, deleteError]);
  useEffect(() => { if (deletedNotice) reloadButton.current?.focus(); }, [deletedNotice]);

  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => { if (dirty || saving.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [dirty]);
  const mayLeave = useCallback(() => {
    if (!dirty && !saving.current) return true;
    setError(saving.current ? 'Please wait for the Inbox operation to finish.' : 'Save or discard your Inbox edits before leaving this page.');
    if (dirty) { setQuery(''); setCategory(''); setStatus(''); setSelectedId(Object.keys(drafts)[0]); }
    onNavigationBlocked();
    return false;
  }, [dirty, drafts, onNavigationBlocked]);
  useSocratesNavigationGuard(mayLeave);

  function edit(changes: Partial<Pick<InboxDraft, 'notes' | 'status'>>) {
    if (!selected || !draft || saving.current) return;
    const next = { ...draft, ...changes };
    setSavedId('');
    setDrafts(current => {
      const copy = { ...current };
      if (next.notes === selected.admin_notes && next.status === selected.status) delete copy[selected.id];
      else copy[selected.id] = next;
      return copy;
    });
  }
  function discard() {
    if (!selected || saving.current) return;
    setDrafts(current => { const copy = { ...current }; delete copy[selected.id]; return copy; });
    setError(''); setSavedId('');
  }
  async function save() {
    if (!selected || !draft || !drafts[selected.id] || saving.current) return;
    const version = epoch.current;
    saving.current = true; setBusy(true); setError(''); setSavedId('');
    try {
      const result = await saveInboxMessage(supabase, selected.id, draft);
      if (version !== epoch.current) return;
      setMessages(current => current.map(m => m.id === result.id ? result : m));
      setDrafts(current => { const copy = { ...current }; delete copy[result.id]; return copy; });
      setSavedId(result.id);
    } catch (failure) {
      if (version !== epoch.current) return;
      setError(inboxError(failure));
      if (accessDenied(failure)) { setMessages([]); setDrafts({}); }
    } finally { if (version === epoch.current) { saving.current = false; setBusy(false); } }
  }

  function requestDelete() {
    if (!selected || loading || saving.current || deleteTarget) return;
    setError(''); setDeletedNotice('');
    if (drafts[selected.id]) {
      setError('Save or discard your unsaved changes before deleting this message.');
      notes.current?.focus();
      return;
    }
    setDeleteError(''); setDeleteTarget(selected);
  }
  function cancelDelete() {
    if (saving.current) return;
    deleteDialog.current?.close(); setDeleteTarget(null); setDeleteError('');
    deleteTrigger.current?.focus();
  }
  async function confirmDelete() {
    if (!deleteTarget || saving.current || drafts[deleteTarget.id]) return;
    const target = deleteTarget, version = epoch.current;
    saving.current = true; setBusy(true); setDeleting(true); setDeleteError('');
    try {
      await deleteInboxMessage(supabase, target.id, target.revision);
      if (version !== epoch.current) return;
      request.current?.abort();
      setMessages(current => current.filter(message => message.id !== target.id));
      setSelectedId(''); setSavedId(''); setError('');
      deleteDialog.current?.close(); setDeleteTarget(null);
      setDeletedNotice('Message deleted.');
    } catch (failure) {
      if (version !== epoch.current) return;
      setDeleteError(inboxDeletionError(failure));
      if (accessDenied(failure)) {
        deleteDialog.current?.close(); setDeleteTarget(null);
        setMessages([]); setDrafts({}); setSelectedId(''); setError(inboxError(failure));
      }
    } finally {
      if (version === epoch.current) { saving.current = false; setBusy(false); setDeleting(false); }
    }
  }

  return <div className={styles.inbox}>
    <p className={styles.demoNotice}><Info aria-hidden="true" /><span><strong>Private Admin Inbox.</strong> Study Mode suggestions appear here. Public website submissions remain disabled.</span></p>
    {error && <p className={styles.status} role="alert">{error}</p>}
    {deletedNotice && <p className={styles.status} role="status">{deletedNotice}</p>}
    <div className={styles.inboxColumns}>
      <section className={styles.messagesPanel} aria-labelledby="inbox-list-title" aria-busy={loading}>
        <div className={`${styles.sectionHeading} ${styles.inboxHeading}`}><h2 id="inbox-list-title">Messages <span className={styles.count}>{messages.length}</span></h2><button ref={reloadButton} type="button" className={styles.secondary} disabled={loading || busy} onClick={() => { void load(); }}>Reload messages</button></div>
        <div className={styles.filters}>
          <label className={styles.searchLabel}><span className={styles.visuallyHidden}>Search messages</span><Search aria-hidden="true" /><input type="search" placeholder="Search messages…" value={query} onChange={event => setQuery(event.target.value)} /></label>
          <div className={styles.filterRow}>
            <label>Category<select value={category} onChange={event => setCategory(event.target.value)}><option value="">All categories</option>{INBOX_CATEGORIES.map(value => <option key={value}>{value}</option>)}</select></label>
            <label>Status<select value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option>{INBOX_STATUSES.map(value => <option key={value}>{value}</option>)}</select></label>
          </div>
        </div>
        <p className={styles.resultCount} role="status">{loading ? 'Loading messages…' : `${filtered.length} ${filtered.length === 1 ? 'message' : 'messages'}`}</p>
        <div className={styles.messageList}>
          {filtered.map(message => <button type="button" key={message.id} className={styles.message} aria-pressed={selected?.id === message.id} onClick={() => setSelectedId(message.id)}>
            <span className={styles.messageMeta}><span>{message.category}</span><time dateTime={message.submitted_at}>{dateLabel(message.submitted_at)}</time></span>
            <strong>{message.subject}{drafts[message.id] ? ' · Unsaved' : ''}</strong><span className={styles.messageBottom}><span>{message.sender_name || 'Name not provided'}</span><span className={styles.statusBadge}>{message.status}</span></span>
          </button>)}
          {!loading && !error && !filtered.length && <div className={styles.empty}><Mail aria-hidden="true" /><h3>{messages.length ? 'No matching messages' : 'No messages yet'}</h3><p>{messages.length ? 'Try another search or filter.' : 'Messages from approved integrations will appear here.'}</p>{messages.length > 0 && <button type="button" className={styles.secondary} onClick={() => { setQuery(''); setCategory(''); setStatus(''); }}>Clear filters</button>}</div>}
        </div>
      </section>
      <section className={styles.detailsPanel} aria-labelledby="inbox-detail-title">
        {selected && draft ? <>
          <div className={styles.detailHeading}><p className={styles.eyebrow}>Message details</p><h2 id="inbox-detail-title">{selected.subject}</h2><span className={styles.statusBadge}>{selected.status}</span></div>
          <dl className={styles.submissionDetails}>
            <div><dt>Category</dt><dd>{selected.category}</dd></div><div><dt>Source</dt><dd>{inboxSourceLabel(selected.source)}</dd></div>
            <div><dt>From</dt><dd>{selected.sender_name || 'Name not provided'}<span className={styles.senderEmail}>{selected.sender_contact || 'Contact not provided'}</span></dd></div>
            <div><dt>Submitted</dt><dd><time dateTime={selected.submitted_at}>{dateLabel(selected.submitted_at, true)} UTC</time></dd></div>
            {selected.question_id && <div><dt>Question ID</dt><dd>{selected.question_id}</dd></div>}{selected.topic_id && <div><dt>Topic ID</dt><dd>{selected.topic_id}</dd></div>}
          </dl>
          <div className={styles.messageContent}><h3>Message</h3><p>{selected.content}</p></div>
          <div className={styles.noteEditor}>
            <label htmlFor="inbox-admin-notes">Administrator notes</label>
            <textarea ref={notes} id="inbox-admin-notes" rows={4} value={draft.notes} maxLength={INBOX_NOTE_LIMIT} disabled={busy} placeholder="Add a private administrator note…" aria-describedby="inbox-note-hint" onChange={event => edit({ notes: event.target.value })} />
            <p id="inbox-note-hint">Visible only to authorized Admins. Up to 10,000 characters.</p>
            <label className={styles.statusEditor}>Message status<select value={draft.status} disabled={busy} onChange={event => edit({ status: event.target.value as InboxStatus })}>{INBOX_STATUSES.map(value => <option key={value}>{value}</option>)}</select></label>
            <div className={styles.saveActions}><button type="button" className={styles.secondary} disabled={busy || !drafts[selected.id]} onClick={discard}>Discard Changes</button><button type="button" className={styles.primary} disabled={busy || loading || !drafts[selected.id]} onClick={() => { void save(); }}>{busy && !deleting ? 'Saving…' : 'Save Changes'}</button></div>
            <p role="status">{savedId === selected.id ? 'Changes saved.' : drafts[selected.id] ? 'Unsaved changes.' : `Updated ${dateLabel(selected.updated_at, true)} UTC`}</p>
            {drafts[selected.id] && drafts[selected.id].revision !== selected.revision && <p>Your draft is based on an older version. Copy any edits you need, then discard this draft to review the latest saved notes.</p>}
            <div className={styles.deleteActions}><button ref={deleteTrigger} type="button" className={styles.danger} disabled={busy || loading} aria-haspopup="dialog" onClick={requestDelete}>Delete Message</button></div>
          </div>
        </> : <div className={styles.empty}><Mail aria-hidden="true" /><h2 id="inbox-detail-title">Select a message</h2><p>Choose a message from the list to view its details.</p></div>}
      </section>
    </div>
    <dialog ref={deleteDialog} className={styles.deleteDialog} tabIndex={-1} aria-labelledby="inbox-delete-title" aria-describedby="inbox-delete-description" aria-busy={deleting}
      onCancel={event => { event.preventDefault(); cancelDelete(); }}
      onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        const first = controls[0], last = controls.at(-1);
        if (!first) { event.preventDefault(); event.currentTarget.focus(); }
        else if (event.shiftKey && (event.target === first || event.target === event.currentTarget)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && event.target === last) { event.preventDefault(); first.focus(); }
      }}>
      <h2 id="inbox-delete-title">Delete Message?</h2>
      <p id="inbox-delete-description">This permanently removes the message and its administrator notes from the active Inbox. This cannot be undone in the Inbox.</p>
      {deleteTarget && <p className={styles.deleteSubject}>{deleteTarget.subject}</p>}
      {deleteError && <p className={styles.status} role="alert">{deleteError}</p>}
      <div className={styles.saveActions}>
        <button ref={deleteCancel} type="button" className={styles.secondary} disabled={deleting} onClick={cancelDelete}>Cancel</button>
        <button type="button" className={`${styles.danger} ${styles.dangerConfirm}`} disabled={deleting || !deleteTarget} onClick={() => { void confirmDelete(); }}>{deleting ? 'Deleting…' : 'Delete Message'}</button>
      </div>
    </dialog>
  </div>;
}
