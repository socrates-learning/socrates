import type { SupabaseClient } from '@supabase/supabase-js';

export const INBOX_CATEGORIES = ['Account Assistance', 'Technical Support', 'New Topic', 'Content Correction', 'Feature Suggestion', 'Other'] as const;
export const INBOX_STATUSES = ['New', 'In Review', 'Resolved'] as const;
export const INBOX_NOTE_LIMIT = 10000;
export type InboxStatus = typeof INBOX_STATUSES[number];
export type InboxMessage = {
  id: string; subject: string; content: string; category: typeof INBOX_CATEGORIES[number]; source: string;
  sender_name: string | null; sender_contact: string | null; question_id: string | null; topic_id: string | null;
  submitted_at: string; updated_at: string; status: InboxStatus; admin_notes: string; revision: string;
};
export type InboxDraft = { status: InboxStatus; notes: string; revision: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requireInboxMessage(value: unknown): InboxMessage {
  const m = value as InboxMessage;
  if (!m || !uuid.test(m.id) || !uuid.test(m.revision) || typeof m.subject !== 'string' || !m.subject.trim() || m.subject.length > 200
    || typeof m.content !== 'string' || !m.content.trim() || m.content.length > 20000
    || !INBOX_CATEGORIES.includes(m.category) || !INBOX_STATUSES.includes(m.status) || !/^[a-z][a-z0-9_]{0,49}$/.test(m.source)
    || typeof m.admin_notes !== 'string' || m.admin_notes.length > INBOX_NOTE_LIMIT
    || ![m.submitted_at, m.updated_at].every(v => typeof v === 'string' && Number.isFinite(Date.parse(v)))
    || ![m.question_id, m.topic_id].every(v => v === null || (typeof v === 'string' && uuid.test(v)))
    || ![m.sender_name, m.sender_contact].every(v => v === null || typeof v === 'string')) throw new Error('Inbox data could not be verified.');
  return m;
}

export async function loadInboxMessages(client: SupabaseClient, signal: AbortSignal): Promise<InboxMessage[]> {
  const messages: InboxMessage[] = [];
  const pageSize = 200;
  // Read every page, rather than silently dropping records at the Data API cap.
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.rpc('get_admin_inbox_messages').range(offset, offset + pageSize - 1).abortSignal(signal);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('Inbox data could not be verified.');
    messages.push(...data.map(requireInboxMessage));
    if (data.length < pageSize) return [...new Map(messages.map(message => [message.id, message])).values()];
  }
}

export async function saveInboxMessage(client: SupabaseClient, id: string, draft: InboxDraft): Promise<InboxMessage> {
  if (!uuid.test(id) || !uuid.test(draft.revision) || !INBOX_STATUSES.includes(draft.status) || typeof draft.notes !== 'string' || draft.notes.length > INBOX_NOTE_LIMIT) throw new Error('Invalid message status or administrator notes.');
  const { data, error } = await client.rpc('save_admin_inbox_message', { p_id: id, p_status: draft.status, p_admin_notes: draft.notes, p_expected_revision: draft.revision });
  if (error) throw error;
  const saved = requireInboxMessage(data);
  if (saved.id !== id || saved.revision === draft.revision || saved.status !== draft.status || saved.admin_notes !== draft.notes) throw new Error('The message save could not be confirmed. Reload before trying again.');
  return saved;
}

export async function deleteInboxMessage(client: SupabaseClient, id: string, revision: string): Promise<void> {
  if (!uuid.test(id) || !uuid.test(revision)) throw new Error('Invalid message identity or revision.');
  const { data, error } = await client.rpc('delete_admin_inbox_message', { p_id: id, p_expected_revision: revision });
  if (error) throw error;
  if (!data || data.id !== id || data.deleted !== true) throw new Error('Message deletion could not be confirmed.');
}

export function inboxDeletionError(error: unknown) {
  if ((error as { code?: string } | null)?.code === '40001') return 'This message was changed by another Admin. Cancel and reload messages to review it before deleting.';
  if (['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes((error as { code?: string } | null)?.code ?? '')) return inboxError(error);
  return 'Deletion could not be confirmed. The message remains visible here. Retry safely or cancel and reload messages to check its status.';
}

export function filterInboxMessages(messages: InboxMessage[], query: string, category: string, status: string) {
  const search = query.trim().toLocaleLowerCase();
  return messages.filter(m => (!category || m.category === category) && (!status || m.status === status)
    && `${m.subject} ${m.sender_name ?? ''} ${m.sender_contact ?? ''} ${m.content}`.toLocaleLowerCase().includes(search));
}
export const inboxSourceLabel = (source: string) => source === 'website' ? 'Website' : source === 'study_mode' ? 'Study Mode' : source.replaceAll('_', ' ');
export function inboxError(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  if (code === '40001') return 'This message changed or is unavailable. Your edits are retained. Reload messages to review the latest version.';
  if (code === '42501' || code === 'PGRST301' || code === 'PGRST302' || code === 'PGRST303') return 'Admin access is required. Sign in with an authorized Admin account.';
  if (code === '22023' || code === '23514') return 'Check the message status and notes length, then try again.';
  return 'The Inbox is unavailable. Please try again. Unsaved edits have been retained.';
}
