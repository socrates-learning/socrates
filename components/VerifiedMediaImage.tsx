'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import type { ConceptMediaPlacement } from '@/lib/concept-media';
import styles from './ConceptMedia.module.css';

/** Only private, digest-checked response bytes become a temporary display URL. */
export default function VerifiedMediaImage({ placement, src }: { placement: ConceptMediaPlacement; src: string }) {
  const key = `${src}:${placement.assetId}:${placement.sha256}`;
  const [result, setResult] = useState<{ key: string; url?: string; error?: boolean } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    void (async () => {
      try {
        const response = await fetch(src, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
        if (!response.ok) throw new Error('Unavailable');
        const blob = await response.blob();
        if (!blob.size || blob.size > 3 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(blob.type) || blob.type !== placement.mime) throw new Error('Invalid image');
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), byte => byte.toString(16).padStart(2, '0')).join('');
        if (digest !== placement.sha256 || controller.signal.aborted) throw new Error('Image changed');
        objectUrl = URL.createObjectURL(blob);
        setResult({ key, url: objectUrl });
      } catch {
        if (!controller.signal.aborted) setResult({ key, error: true });
      }
    })();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [key, src, placement.mime, placement.sha256]);
  const ready = result?.key === key ? result : null;
  return <figure className={styles.figure}>
    <div className={styles.imageArea} style={{ width: placement.width ? `min(100%, ${placement.width}px)` : undefined, aspectRatio: `${placement.width || 1} / ${placement.height || 1}` }}>
      {ready?.url ? <Image src={ready.url} alt={placement.altText} width={placement.width || 1} height={placement.height || 1} unoptimized className={styles.image} />
        : <span role="status">{ready?.error ? 'Image unavailable.' : 'Loading image…'}</span>}
    </div>
    {placement.caption ? <figcaption className={styles.caption}>{placement.caption}</figcaption> : null}
  </figure>;
}
