export type CardImage = {
  id: string; assetId: string; side: 'front' | 'answer'; description: string;
  mime: string; width: number; height: number; sha256: string; reservationId?: string;
};
export type CardImageManifest = { cardId: string; revision: string; front: string; back: string; images: CardImage[] };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function cardMediaPath(card: string) {
  if (!UUID.test(card)) throw new Error('Saved Card required.');
  return `/api/content-media/cards/${card}`;
}
export function cardImageSource(card: string, image: CardImage) {
  const id = image.reservationId || image.id;
  if (!UUID.test(id)) throw new Error('Invalid Card image.');
  return `${cardMediaPath(card)}/${image.reservationId ? 'drafts' : 'delivery'}/${id}`;
}
export function cardImageFingerprint(images: readonly CardImage[]) {
  return JSON.stringify(images.map(({ id, assetId, side, description }) => ({ id, assetId, side, description })));
}
export function validCardImage(image: CardImage) {
  return UUID.test(image.id) && UUID.test(image.assetId) && ['front', 'answer'].includes(image.side)
    && typeof image.description === 'string' && image.description.length <= 2000
    && ['image/jpeg', 'image/png', 'image/webp'].includes(image.mime) && /^[0-9a-f]{64}$/.test(image.sha256)
    && Number.isInteger(image.width) && Number.isInteger(image.height) && image.width > 0 && image.width <= 4096
    && image.height > 0 && image.height <= 4096 && image.width * image.height <= 12000000;
}
export class CardMediaError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function cardMediaRequest(path: string, init?: RequestInit) {
  const response = await fetch(path, { ...init, credentials: 'same-origin', cache: 'no-store' });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new CardMediaError(response.status, response.status === 409
    ? 'This Card or upload changed. Reload before saving; your draft has been kept.'
    : response.status === 403 || response.status === 401 ? 'This image is unavailable for the current account or Library.'
    : response.status === 413 ? 'Choose an image no larger than 3 MiB.'
    : response.status === 429 ? 'The upload or media quota has been reached. Finish pending uploads or try again later.'
    : response.status === 422 && path.includes('/drafts/') ? 'This image could not be accepted. Use JPEG, PNG or static WebP, up to 3 MiB, 4096 pixels per side and 12 megapixels.'
    : response.status === 422 ? 'Check the Card text, image descriptions and four-image limit for each side.'
    : 'The image operation could not be confirmed. Your saved Card is unchanged; retry or cancel this upload.');
  return result;
}
export async function loadCardImages(card: string, signal?: AbortSignal): Promise<CardImageManifest> {
  const result = await cardMediaRequest(cardMediaPath(card), { signal });
  if (result?.cardId !== card || !Array.isArray(result.images) || result.images.length > 8 || !result.images.every(validCardImage)) throw new Error('Card image details could not be verified. Reload before editing images.');
  return result;
}
export function postCardMedia(card: string, body: unknown, signal?: AbortSignal) {
  return cardMediaRequest(cardMediaPath(card), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
}
