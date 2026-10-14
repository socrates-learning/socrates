import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import type { DeletionService, DeletionStatus } from './account-deletion';
import { createDeletionLedger, ledgerConfig } from './account-deletion-ledger.mjs';

export const deletionLedger = () => createDeletionLedger(ledgerConfig());

export const deletionCookie = 'socrates-account-deletion';
export const receiptHash = (receipt: string) => createHash('sha256').update(receipt).digest('hex');
export const validReceipt = (receipt: string | undefined): receipt is string => Boolean(receipt && /^[0-9a-f]{64}$/.test(receipt));
export function deletionAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Account service unavailable');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20000) }) },
  });
}
export function deletionService(admin: ReturnType<typeof deletionAdmin>): DeletionService {
  return {
    async recordIntent(id) { await deletionLedger().record(id); },
    async status(hash) {
      const { data, error } = await admin.rpc('account_deletion_status', { p_receipt_hash: hash });
      if (error) throw new Error('Deletion status unavailable');
      return data as DeletionStatus | null;
    },
    async remove(bucket, names) {
      const { error } = await admin.storage.from(bucket).remove(names);
      if (error) throw new Error('Private image cleanup has not completed');
    },
    async deleteIdentity(id) {
      const { error } = await admin.auth.admin.deleteUser(id, false);
      if (error) throw new Error('Account cleanup has not completed');
    },
  };
}
