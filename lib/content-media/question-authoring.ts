import 'server-only';
import { createHash } from 'node:crypto';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { normalizeImage, MAX_IMAGE_BYTES, ImageValidationError } from './image';
import { boundedBody, MediaError, rpc, type MediaClient } from './server';

type Actor = { actor: string; library: string; question: string | null };

/** Same bounded worker and single-use transfers; draft authority is additive. */
export async function uploadQuestionDraft(client: MediaClient, context: Actor, reservation: string, request: Request) {
  const args = { p_actor: context.actor, p_library: context.library, p_reservation: reservation, p_question: context.question };
  const claim = await rpc(client, 'm115_upload', { ...args, p_action: 'claim' });
  try {
    const input = await boundedBody(request, MAX_IMAGE_BYTES);
    const inputDigest = createHash('sha256').update(input).digest('hex');
    if (claim.complete) {
      if (inputDigest !== claim.inputDigest) throw new MediaError(409, 'Upload retry differs');
      return { assetId: claim.assetId, ready: !claim.terminal, terminal: Boolean(claim.terminal), state: claim.state };
    }
    // Resolve, never load, the child dependency in the parent. This also makes
    // the new route's build trace include its native dependency closure.
    require.resolve('socrates-media-sharp');
    const image = await normalizeImage(input, request.signal).catch((error: unknown) => {
      if (error instanceof ImageValidationError) throw new MediaError(422, 'Image format or limits rejected');
      throw error;
    });
    const metadata = { inputDigest, outputDigest: image.sha256, mime: image.mime, size: image.bytes.length, width: image.width, height: image.height };
    const attempt = await rpc(client, 'm115_upload', { ...args, p_action: 'commit-bytes', p_token: claim.token, p_data: metadata });
    const interrupted = () => { if (request.signal.aborted) throw new MediaError(400, 'Upload interrupted'); };
    interrupted();
    const staging = await rpc(client, 'm115_upload', { ...args, p_action: 'dispatch-stage', p_token: claim.token, p_data: { attemptId: attempt.attemptId } });
    await client.mediaWrites.stage(staging, image.bytes, image.mime);
    const verify = async (target: { bucket: string; object: string }) => {
      const stored = await client.storage.from(target.bucket).download(target.object);
      if (stored.error || !stored.data || stored.data.size !== image.bytes.length || createHash('sha256').update(Buffer.from(await stored.data.arrayBuffer())).digest('hex') !== image.sha256) throw new MediaError(503, 'Storage verification failed');
    };
    await verify(staging);
    const promotion = await rpc(client, 'm115_upload', { ...args, p_action: 'stage-verified', p_token: claim.token, p_data: { attemptId: attempt.attemptId } });
    interrupted();
    const destination = await rpc(client, 'm115_upload', { ...args, p_action: 'dispatch-promotion', p_token: claim.token, p_data: { attemptId: promotion.attemptId } });
    await client.mediaWrites.promote(destination);
    await verify(destination);
    interrupted();
    return await rpc(client, 'm115_upload', { ...args, p_action: 'publish', p_token: claim.token, p_data: { attemptId: promotion.attemptId } });
  } catch (error) {
    if (claim.token) await rpc(client, 'm115_upload', { ...args, p_action: 'fail', p_token: claim.token }).catch(() => undefined);
    throw error;
  }
}

export async function questionPreview(client: MediaClient, context: Actor, question: string | null, draft: string | null, reservation: string, metadataOnly = false) {
  const target = await rpc(client, 'm115_preview', { p_actor: context.actor, p_library: context.library, p_question: question, p_draft: draft, p_reservation: reservation });
  const metadata = { assetId: target.assetId, mime: target.mime, width: target.width, height: target.height, sha256: target.sha256 };
  if (metadataOnly) return { metadata, bytes: null };
  const stored = await client.storage.from(target.bucket).download(target.object);
  if (stored.error || !stored.data || stored.data.size !== target.size || stored.data.size > MAX_IMAGE_BYTES) throw new MediaError(404, 'Image unavailable');
  const bytes = Buffer.from(await stored.data.arrayBuffer());
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(target.mime) || createHash('sha256').update(bytes).digest('hex') !== target.sha256) throw new MediaError(404, 'Image unavailable');
  return { metadata, bytes };
}

export async function saveQuestionImages(library: string, question: string | null, draft: string, version: string | null, payload: unknown) {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc('m115_save', { p_library: library, p_question: question, p_draft: draft, p_expected_version: version, p_payload: payload });
  if (error) throw new MediaError(error.code === '42501' ? 403 : error.code === '40001' ? 409 : 422, 'Question save could not be confirmed. Your draft is preserved.');
  if (data?.superseded) throw new MediaError(409, 'The committed Question has changed again. Reload before editing.');
  if (data?.terminal) throw new MediaError(410, 'The saved Question was permanently deleted. This draft cannot recreate it.');
  return data;
}
