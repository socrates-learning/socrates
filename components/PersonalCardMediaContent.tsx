'use client';
import { useEffect, useState } from 'react';
import VerifiedMediaImage from './VerifiedMediaImage';
import { cardImageSource, loadCardImages, type CardImage, type CardImageManifest } from '@/lib/personal-card-media';

export function PersonalCardImage({ cardId, image }: { cardId: string; image: CardImage }) {
  return <VerifiedMediaImage src={cardImageSource(cardId, image)} placement={{ placementId: image.id, assetId: image.assetId,
    ordinal: 0, altText: image.description, caption: '', mime: image.mime, width: image.width, height: image.height, sha256: image.sha256 }} />;
}

/** Mount Back only inside the existing answer-revealed branch. No learning writes. */
export default function PersonalCardMediaContent({ cardId, side, front, back }: { cardId: string; side: 'front' | 'answer'; front: string; back: string }) {
  const [result, setResult] = useState<{ cardId: string; manifest?: CardImageManifest; error?: boolean } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void loadCardImages(cardId, controller.signal).then(manifest => setResult({ cardId, manifest })).catch(() => {
      if (!controller.signal.aborted) setResult({ cardId, error: true });
    });
    return () => controller.abort();
  }, [cardId, front, back]);
  if (result?.cardId !== cardId) return null;
  if (result.error) return <p role="status">Card images could not be loaded.</p>;
  const manifest = result.manifest;
  if (!manifest || manifest.front !== front || manifest.back !== back) return <p role="status">This Card changed. Images will be available when the updated Card loads.</p>;
  return <div>{manifest.images.filter(image => image.side === side).map(image => <PersonalCardImage key={image.id} cardId={cardId} image={image} />)}</div>;
}
