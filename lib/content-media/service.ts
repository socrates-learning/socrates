import 'server-only';
import { createHash } from 'node:crypto';
import { normalizeImage, MAX_IMAGE_BYTES, ImageValidationError } from './image';
import { boundedBody, MediaError, rpc, type MediaClient } from './server';

type Context = { actor: string; library: string };
export async function uploadImage(client: MediaClient, context: Context, reservation: string, request: Request) {
  const args = { p_actor: context.actor, p_library: context.library, p_reservation: reservation };
  // Claim/authorization precedes body consumption. UUID knowledge alone confers nothing.
  const claim = await rpc(client, 'm113_upload', { ...args, p_action: 'claim' });
  try {
    const input = await boundedBody(request, MAX_IMAGE_BYTES);
    const inputDigest = createHash('sha256').update(input).digest('hex');
    if (claim.complete) {
      if (inputDigest !== claim.inputDigest) throw new MediaError(409, 'Upload retry differs');
      if (claim.terminal) return { assetId: claim.assetId, ready: false, terminal: true, state: claim.state };
      return { assetId: claim.assetId, ready: true };
    }
    const image = await normalizeImage(input, request.signal).catch((error: unknown) => {
      if (error instanceof ImageValidationError) throw new MediaError(422, 'Image format or limits rejected');
      throw error;
    });
    const metadata = { inputDigest, outputDigest: image.sha256, mime: image.mime, size: image.bytes.length, width: image.width, height: image.height };
    const attempt = await rpc(client, 'm113_upload', { ...args, p_action: 'commit-bytes', p_token: claim.token, p_data: metadata });
    if (request.signal.aborted) throw new MediaError(400, 'Upload interrupted');
    const staging = await rpc(client, 'm113_upload', { ...args, p_action: 'dispatch-stage', p_token: claim.token, p_data: { attemptId: attempt.attemptId } });
    await client.mediaWrites.stage(staging, image.bytes, image.mime);
    const verify = async (target: { bucket: string; object: string }) => {
      const stored = await client.storage.from(target.bucket).download(target.object);
      if (stored.error || !stored.data || stored.data.size !== image.bytes.length || createHash('sha256').update(Buffer.from(await stored.data.arrayBuffer())).digest('hex') !== image.sha256) throw new MediaError(503, 'Storage verification failed');
    };
    await verify(staging);
    const promotion = await rpc(client, 'm113_upload', { ...args, p_action: 'stage-verified', p_token: claim.token, p_data: { attemptId: attempt.attemptId } });
    if (request.signal.aborted) throw new MediaError(400, 'Upload interrupted');
    const destination = await rpc(client, 'm113_upload', { ...args, p_action: 'dispatch-promotion', p_token: claim.token, p_data: { attemptId: promotion.attemptId } });
    await client.mediaWrites.promote(destination);
    await verify(destination);
    if (request.signal.aborted) throw new MediaError(400, 'Upload interrupted');
    // Only this transaction publishes an asset. A lost response is reconciled by
    // the logical reservation, never by copying to the destination again.
    return await rpc(client, 'm113_upload', { ...args, p_action: 'publish', p_token: claim.token, p_data: { attemptId: promotion.attemptId } });
  } catch (error) {
    if (claim.token) await rpc(client, 'm113_upload', { ...args, p_action: 'fail', p_token: claim.token }).catch(() => undefined);
    throw error;
  }
}

export async function deliverImage(client: MediaClient, context: Context, reference: string) {
  const target = await rpc(client, 'm113_delivery', { p_actor: context.actor, p_library: context.library, p_reference: reference });
  const result = await client.storage.from(target.bucket).download(target.object);
  if (result.error || !result.data || result.data.size !== target.size || result.data.size > MAX_IMAGE_BYTES) throw new MediaError(404, 'Media unavailable');
  const bytes = Buffer.from(await result.data.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== target.sha256 || !['image/png', 'image/jpeg', 'image/webp'].includes(target.mime)) throw new MediaError(404, 'Media unavailable');
  return { bytes, mime: target.mime as string };
}
