import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { parseStudySuggestion, requireSuggestionReceipt } from '@/lib/study-suggestions';

const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Cookie' };
class SuggestionError extends Error { constructor(public status: number, message: string) { super(message); } }

async function readInput(request: Request) {
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') throw new SuggestionError(415, 'Use JSON for suggestions.');
  const reader = request.body?.getReader();
  if (!reader) throw new SuggestionError(400, 'A suggestion is required.');
  let size = 0;
  const chunks: Uint8Array[] = [];
  const timer = setTimeout(() => { void reader.cancel(); }, 10000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 20000) { await reader.cancel(); throw new SuggestionError(413, 'Suggestion is too large.'); }
      chunks.push(value);
    }
    try { return parseStudySuggestion(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
    catch { throw new SuggestionError(400, 'Choose a category and enter a message of 1–4,000 characters.'); }
  } finally { clearTimeout(timer); reader.releaseLock(); }
}

export async function submitStudySuggestion(request: Request) {
  try {
    const origin = request.headers.get('origin');
    let sameOrigin = false;
    try {
      const url = new URL(origin || '');
      sameOrigin = url.origin === origin && url.host === request.headers.get('host') && url.protocol === new URL(request.url).protocol;
    } catch { /* Missing or malformed origins fail closed. */ }
    if (!sameOrigin) throw new SuggestionError(403, 'Suggestion request denied.');
    const client = await createSupabaseServerClient();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) throw new SuggestionError(401, 'Sign in to submit a suggestion.');
    const { data: active, error: activeError } = await client.rpc('account_is_active');
    if (activeError) throw new SuggestionError(503, 'Account verification is unavailable. Please retry.');
    if (active !== true) throw new SuggestionError(403, 'An active account is required.');
    const input = await readInput(request);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new SuggestionError(503, 'Suggestions are temporarily unavailable. Please retry.');
    const service = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (resource, options) => fetch(resource, { ...options, signal: AbortSignal.timeout(15000) }) } });
    const { data, error } = await service.rpc('submit_study_suggestion_internal', {
      p_actor: auth.user.id, p_request_id: input.requestId, p_library_id: input.libraryId,
      p_question_id: input.questionId, p_category: input.category, p_content: input.message,
    });
    if (error) {
      if (error.code === '42501') throw new SuggestionError(403, 'This account or Question is not available for suggestions.');
      if (error.code === 'P0429') throw new SuggestionError(429, 'Suggestion limit reached. Please try again later.');
      if (error.code === '23505') throw new SuggestionError(409, 'This submission was already used. Close and reopen the form for a new suggestion.');
      if (['22023', '22P02', '23514'].includes(error.code)) throw new SuggestionError(400, 'Check the suggestion and try again.');
      throw new SuggestionError(503, 'Your suggestion could not be confirmed. Retry to safely check or submit it.');
    }
    return Response.json(requireSuggestionReceipt(data), { headers });
  } catch (error) {
    return Response.json({ error: error instanceof SuggestionError ? error.message : 'Your suggestion could not be confirmed. Retry to safely check or submit it.' },
      { status: error instanceof SuggestionError ? error.status : 503, headers });
  }
}
