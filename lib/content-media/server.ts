import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { resolveActiveLibraryContext } from '@/lib/library-context';

export class MediaError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const privateHeaders = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new MediaError(400, 'Invalid media request');
  return value;
}
export async function actorContext(request: Request, mutation: boolean) {
  if (mutation) {
    // Next may use an internal localhost URL. Compare the browser origin to the
    // actual Host authority, not forwarded-host input or the internal hostname.
    const origin = request.headers.get('origin');
    let sameOrigin = false;
    try {
      const parsed = new URL(origin || '');
      sameOrigin = parsed.origin === origin && parsed.host === request.headers.get('host') && parsed.protocol === new URL(request.url).protocol;
    } catch { /* Missing/malformed origins fail closed. */ }
    if (!sameOrigin) throw new MediaError(403, 'Media request denied');
  }
  const auth = await createSupabaseServerClient();
  const { data, error } = await auth.auth.getUser();
  if (error || !data.user) throw new MediaError(401, 'Authentication required');
  const context = await resolveActiveLibraryContext({ failOnQueryError: true });
  if (!context.library || context.isUnauthorized || context.user?.id !== data.user.id) throw new MediaError(403, 'Library access required');
  return { actor: data.user.id, library: context.library.id };
}
export function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new MediaError(503, 'Media service unavailable');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) } });
  return Object.assign(client, { mediaWrites: createMediaWrites(url, key) });
}
type StagingTarget = { bucket: string; object: string };
type PromotionTarget = StagingTarget & { source: string };
// Each call performs exactly one HTTP request: no SDK retry, redirect replay, or
// reconciliation write. A timeout is uncertain, never permission to reuse a key.
export function createMediaWrites(url: string, key: string, transport: typeof fetch = fetch) {
  const staging = /^_staging\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/;
  const durable = /^[0-9a-f-]{36}\/[0-9a-f-]{36}$/;
  const send = async (path: string, body: BodyInit, contentType: string) => {
    const response = await transport(`${url}/storage/v1/${path}`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { authorization: `Bearer ${key}`, apikey: key, 'content-type': contentType, 'x-upsert': 'false' }, body,
    });
    if (!response.ok) throw new MediaError(503, 'Storage write outcome unconfirmed');
    await response.arrayBuffer();
  };
  return {
    stage: async (target: StagingTarget, bytes: Uint8Array, mime: string) => {
      if (target.bucket !== 'socrates-content-media' || !staging.test(target.object)) throw new MediaError(500, 'Invalid staging destination');
      await send(`object/${target.bucket}/${target.object}`, new Uint8Array(bytes), mime);
    },
    promote: async (target: PromotionTarget) => {
      if (target.bucket !== 'socrates-content-media' || !staging.test(target.source) || !durable.test(target.object)
        || target.source.split('/')[1] !== target.object.split('/')[0]) throw new MediaError(500, 'Invalid promotion destination');
      await send('object/copy', JSON.stringify({ bucketId: target.bucket, sourceKey: target.source, destinationKey: target.object }), 'application/json');
    },
  };
}
export type MediaClient = ReturnType<typeof serviceClient>;
export async function rpc(client: MediaClient, name: string, args: Record<string, unknown>) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new MediaError(error.code === '42501' ? 403 : error.code === '55P03' || error.code === '40001' ? 409 : 422, 'Media operation could not be confirmed');
  return data;
}
export async function boundedBody(request: Request, maximum: number): Promise<Buffer> {
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maximum)) throw new MediaError(413, 'Media input too large');
  if (!request.body) throw new MediaError(400, 'Media input required');
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
      if (size > maximum) { await reader.cancel(); throw new MediaError(413, 'Media input too large'); }
      chunks.push(value);
    }
    if (expired || request.signal.aborted || !size) throw new MediaError(400, 'Media input interrupted');
    return Buffer.concat(chunks, size);
  } finally { clearTimeout(timer); request.signal.removeEventListener('abort', abort); reader.releaseLock(); }
}
export function maintenanceAuthorized(request: Request) {
  const secret = process.env.CONTENT_MEDIA_MAINTENANCE_SECRET;
  const supplied = request.headers.get('authorization') || '';
  const expected = secret ? `Bearer ${secret}` : '';
  if (!secret || secret.length < 32 || supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) throw new MediaError(403, 'Maintenance access denied');
}
export async function mediaResponse(operation: () => Promise<Response>) {
  try { return await operation(); }
  catch (error) { return Response.json({ error: error instanceof MediaError ? error.message : 'Media service unavailable' }, { status: error instanceof MediaError ? error.status : 503, headers: privateHeaders }); }
}
