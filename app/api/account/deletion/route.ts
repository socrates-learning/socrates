import { cookies } from 'next/headers';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { deletionInput, continueDeletion } from '@/lib/account-deletion';
import { deletionAdmin, deletionService, deletionCookie, receiptHash, validReceipt, deletionLedger } from '@/lib/account-deletion-server';
import { profileBody, profilePrivateHeaders, requireProfileOrigin } from '@/lib/personal-profile-server';

export const runtime = 'nodejs';
const reply = (body: object, status = 200) => Response.json(body, { status, headers: profilePrivateHeaders });
export async function GET(request?: Request) {
  if (request && new URL(request.url).searchParams.get('readiness') === '1') {
    try {
      const client = await createSupabaseServerClient();
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) return reply({ error: 'Account request denied.' }, 401);
      const access = await client.rpc('is_admin');
      if (access.error || access.data !== true) return reply({ error: 'Account request denied.' }, 403);
      // Read-only release verification: no receipt, deletion state, or ledger write.
      await deletionLedger().assertReady();
      return reply({ ready: true });
    } catch { return reply({ ready: false }, 503); }
  }
  try {
    const jar = await cookies(), receipt = jar.get(deletionCookie)?.value;
    if (!validReceipt(receipt)) return reply({ state: 'none' });
    const state = await deletionService(deletionAdmin()).status(receiptHash(receipt));
    const { data } = await (await createSupabaseServerClient()).auth.getUser();
    if (state && data.user && data.user.id !== state.userId) {
      // A later sign-in on the same browser must not inherit another account's
      // deletion UI. The receipt never confers access to that new account.
      jar.set(deletionCookie, '', { httpOnly: true, sameSite: 'strict', path: '/api/account/deletion', maxAge: 0 });
      return reply({ state: 'none' });
    }
    return reply({ state: state?.state ?? 'none' });
  } catch { return reply({ error: 'Deletion status could not be checked. Please try again.' }, 503); }
}
export async function POST(request: Request) {
  try { requireProfileOrigin(request); }
  catch { return reply({ error: 'Account request denied.' }, 403); }
  let input;
  try { input = deletionInput(JSON.parse((await profileBody(request, 4096)).toString('utf8'))); }
  catch { return reply({ error: 'Enter your current password and type DELETE to confirm.' }, 400); }
  try {
    const client = await createSupabaseServerClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user?.email) return reply({ error: 'Sign in again before deleting your account.' }, 401);
    // Respect an already enrolled factor without invoking paused staff MFA.
    if (data.user.factors?.some(factor => factor.status === 'verified')) {
      const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assurance.error || assurance.data?.currentLevel !== 'aal2') return reply({ error: 'Complete your existing second-factor sign-in before deleting this account.' }, 403);
    }
    const check = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const verified = await check.auth.signInWithPassword({ email: data.user.email, password: input.password });
    if (verified.error || !verified.data.session) return reply({ error: 'Your current password could not be verified.' }, 403);
    const sameUser = verified.data.user?.id === data.user.id;
    const cleanup = await check.auth.signOut({ scope: 'local' });
    if (cleanup.error) return reply({ error: 'Verification could not finish. Please try again later.' }, 503);
    if (!sameUser) return reply({ error: 'Your account could not be verified.' }, 403);
    await deletionLedger().assertReady();
    const receipt = randomBytes(32).toString('hex');
    const started = await deletionAdmin().rpc('begin_account_deletion', { p_user: data.user.id, p_receipt_hash: receiptHash(receipt) });
    if (started.error?.code === 'P1391') return reply({ error: 'Your account has not been deleted. Another authorized active Administrator must exist before you can delete this account.' }, 403);
    if (started.error) return reply({ error: 'Deletion could not start. Your account has not been deleted. Contact the account administrator if this persists.' }, 409);
    (await cookies()).set(deletionCookie, receipt, { httpOnly: true, secure: new URL(request.url).protocol === 'https:', sameSite: 'strict', path: '/api/account/deletion', maxAge: 7 * 24 * 60 * 60 });
    return reply({ state: 'pending' });
  } catch { return reply({ error: 'Deletion could not be confirmed. Check its status before trying again.' }, 503); }
}
// The HttpOnly receipt only finishes an already confirmed deletion. It grants
// no account/content access and carries no client-selected target identity.
export async function DELETE(request: Request) {
  try { requireProfileOrigin(request); }
  catch { return reply({ error: 'Account request denied.' }, 403); }
  const receipt = (await cookies()).get(deletionCookie)?.value;
  if (!validReceipt(receipt)) return reply({ error: 'Confirm account deletion before continuing.' }, 401);
  try {
    const service = deletionService(deletionAdmin()), hash = receiptHash(receipt);
    const state = await service.status(hash);
    if (!state) return reply({ error: 'Deletion verification is no longer available. Sign in to confirm again.' }, 401);
    const client = await createSupabaseServerClient();
    const { data } = await client.auth.getUser();
    if (data.user && data.user.id !== state.userId) return reply({ error: 'This deletion receipt belongs to a different sign-in.' }, 403);
    await continueDeletion(service, hash);
    await client.auth.signOut({ scope: 'local' });
    return reply({ state: 'complete' });
  } catch { return reply({ state: 'pending', error: 'Deletion is not complete. Your account is locked for deletion. Retry to finish removing your data.' }, 503); }
}
