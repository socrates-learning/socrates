import 'server-only';
import { createHash } from 'node:crypto';
import { uploadImage } from './service';
import { MAX_IMAGE_BYTES } from './image';
import { MediaError, rpc, type MediaClient } from './server';

type Actor = { actor: string; library: string; card: string };

export async function cardMediaRpc(client: MediaClient, name: string, args: Record<string, unknown>) {
  const { data, error } = await client.rpc(name, args);
  if (error?.code === 'P0136') throw new MediaError(429, 'Personal image upload or Storage quota reached');
  if (error) throw new MediaError(error.code === '42501' ? 403 : ['55P03', '40001'].includes(error.code) ? 409 : 422, 'Card image operation could not be confirmed');
  return data;
}

/** Reuse the existing isolated decoder and immutable, readback-verified transfers. */
export async function uploadCardImage(client: MediaClient, context: Actor, reservation: string, request: Request) {
  require.resolve('socrates-media-sharp');
  const cardClient = new Proxy(client, { get(target, key) {
    if (key === 'rpc') return (name: string, args: Record<string, unknown>) => {
      if (name !== 'm113_upload') throw new MediaError(500, 'Unsupported Card media operation');
      return target.rpc('m136_upload', { ...args, p_card: context.card }).then(result => {
        if (result.error?.code === 'P0136') throw new MediaError(429, 'Personal media quota reached');
        return result;
      });
    };
    return Reflect.get(target, key, target);
  } });
  return uploadImage(cardClient, context, reservation, request);
}

export async function cardImage(client: MediaClient, context: Actor, reference: string, draft: boolean, metadataOnly = false) {
  const target = await rpc(client, 'm136_delivery', { p_actor: context.actor, p_library: context.library, p_card: context.card, p_reference: reference, p_draft: draft });
  const metadata = { assetId: target.assetId, mime: target.mime, width: target.width, height: target.height, sha256: target.sha256 };
  if (metadataOnly) return { metadata, bytes: null };
  const stored = await client.storage.from(target.bucket).download(target.object);
  if (stored.error || !stored.data || stored.data.size !== target.size || stored.data.size > MAX_IMAGE_BYTES) throw new MediaError(404, 'Image unavailable');
  const bytes = Buffer.from(await stored.data.arrayBuffer());
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(target.mime) || createHash('sha256').update(bytes).digest('hex') !== target.sha256) throw new MediaError(404, 'Image unavailable');
  return { metadata, bytes };
}
