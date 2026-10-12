import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export const profilePrivateHeaders = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Cookie' };
export class ProfileError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function profileAccount() {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new ProfileError(401, 'Sign in to manage your profile.');
  const role = await client.from('user_roles').select('role').eq('user_id', data.user.id).maybeSingle();
  if (role.error || !['admin', 'editor', 'learner'].includes(role.data?.role)) throw new ProfileError(403, 'An approved account is required.');
  return { client, user: data.user, role: role.data!.role as 'admin' | 'editor' | 'learner' };
}

export function requireProfileOrigin(request: Request) {
  // Next can use an internal URL; validate the browser origin against Host.
  const origin = request.headers.get('origin');
  try {
    const parsed = new URL(origin || '');
    if (parsed.origin === origin && parsed.host === request.headers.get('host') && parsed.protocol === new URL(request.url).protocol) return;
  } catch { /* Missing or malformed origins fail closed. */ }
  throw new ProfileError(403, 'Profile request denied.');
}

export async function profileBody(request: Request, limit: number): Promise<Buffer> {
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) throw new ProfileError(413, 'Profile input is too large.');
  if (!request.body) throw new ProfileError(400, 'Profile input is required.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let expired = false;
  const timer = setTimeout(() => { expired = true; void reader.cancel(); }, 15000);
  const abort = () => { void reader.cancel(); };
  request.signal.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); throw new ProfileError(413, 'Profile input is too large.'); }
      chunks.push(value);
    }
    if (expired || request.signal.aborted || !size) throw new ProfileError(400, 'Profile input was interrupted.');
    return Buffer.concat(chunks, size);
  } finally { clearTimeout(timer); request.signal.removeEventListener('abort', abort); reader.releaseLock(); }
}

export async function profileResponse(operation: () => Promise<Response>) {
  try { return await operation(); }
  catch (error) {
    return Response.json({ error: error instanceof ProfileError ? error.message : 'Your profile could not be updated. Please try again.' }, {
      status: error instanceof ProfileError ? error.status : 503, headers: profilePrivateHeaders,
    });
  }
}
