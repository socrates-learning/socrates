'use client';
import { useEffect, useRef, useState } from 'react';
import { PersonalCardImage } from '../PersonalCardMediaContent';
import { CardMediaError, cardMediaPath, cardMediaRequest, postCardMedia, validCardImage, type CardImage } from '@/lib/personal-card-media';
import styles from './PersonalCardImageAuthoring.module.css';

type Attempt = { key: string; file: File; replace?: CardImage; reservation?: string; controller: AbortController; cancelled?: boolean };
export function PersonalCardImageAuthoring({ cardId, side, images, onChange, onBusy, disabled, preview }: {
  cardId: string; side: 'front' | 'answer'; images: CardImage[]; onChange: (images: CardImage[]) => void;
  onBusy: (busy: boolean) => void; disabled: boolean; preview: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const replacement = useRef<CardImage | undefined>(undefined);
  const attempt = useRef<Attempt | null>(null);
  const current = useRef({ images, onChange, onBusy });
  useEffect(() => { current.current = { images, onChange, onBusy }; });
  const [pendingState, setPendingState] = useState<'active' | 'cancelled' | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const inFlight = useRef(false), cancelling = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; attempt.current?.controller.abort(); };
  }, []);
  async function upload(next: Attempt) {
    if (inFlight.current) return;
    inFlight.current = true;
    attempt.current = next; setPendingState('active'); current.current.onBusy(true); setWorking(true); setError(''); setStatus('Reserving private image upload…');
    try {
      const reserved = await postCardMedia(cardId, { action: 'reserve', idempotencyKey: next.key }, next.controller.signal);
      next.reservation = reserved.reservationId;
      const path = `${cardMediaPath(cardId)}/drafts/${next.reservation}`;
      if (alive.current) setStatus('Uploading and checking image…');
      const result = await cardMediaRequest(path, { method: 'POST', headers: { 'content-type': next.file.type || 'application/octet-stream' }, body: next.file, signal: next.controller.signal });
      if (!result.ready) throw new Error('Upload no longer available. Cancel it and choose the image again.');
      const metadata = await cardMediaRequest(`${path}?metadata=1`, { signal: next.controller.signal });
      const image: CardImage = { ...metadata, id: next.replace?.id || crypto.randomUUID(), side,
        description: next.replace?.description || '', reservationId: next.reservation };
      if (!validCardImage(image)) throw new Error('The uploaded image could not be verified.');
      if (!alive.current || next.cancelled) return;
      current.current.onChange(next.replace ? current.current.images.map(item => item.id === next.replace!.id ? image : item) : [...current.current.images, image]);
      attempt.current = null; setPendingState(null); current.current.onBusy(false); setStatus('Image ready. Add a description, then Save Card.');
    } catch (error) {
      if (alive.current && !next.cancelled) {
        if (!next.reservation && error instanceof CardMediaError && error.status >= 400 && error.status < 500) {
          attempt.current = null; setPendingState(null); current.current.onBusy(false);
        }
        setError(error instanceof Error ? error.message : 'Upload failed. Retry or cancel.'); setStatus('');
      }
    } finally { inFlight.current = false; if (alive.current && !next.cancelled) setWorking(false); }
  }
  async function discard() {
    const pending = attempt.current;
    if (!pending || cancelling.current) return;
    cancelling.current = true; pending.cancelled = true; setPendingState('cancelled');
    pending.controller.abort(); setWorking(true); setError('');
    try {
      // Resolve a lost reservation response using the SAME key before cancelling.
      const reserved = pending.reservation ? { reservationId: pending.reservation } : await postCardMedia(cardId, { action: 'reserve', idempotencyKey: pending.key });
      await cardMediaRequest(`${cardMediaPath(cardId)}/drafts/${reserved.reservationId}`, { method: 'DELETE' });
      if (alive.current) { attempt.current = null; setPendingState(null); current.current.onBusy(false); setStatus('Upload cancelled. Saved images are unchanged.'); }
    } catch { if (alive.current) setError('Cancellation could not be confirmed. Retry cancellation; your saved Card is unchanged.'); }
    finally { cancelling.current = false; if (alive.current) setWorking(false); }
  }
  return <div className={styles.tools}>
    <div hidden={preview}>
      <input ref={input} type="file" hidden accept="image/jpeg,image/png,image/webp" aria-label={`Choose ${side === 'front' ? 'Front' : 'Back'} image`} onChange={event => {
        const file = event.target.files?.[0]; event.target.value = '';
        if (!file || disabled || attempt.current) return;
        if (!file.size || file.size > 3 * 1024 * 1024) { setError('Choose a JPEG, PNG or static WebP no larger than 3 MiB.'); return; }
        void upload({ file, key: crypto.randomUUID(), replace: replacement.current, controller: new AbortController() });
      }} />
      <button type="button" disabled={disabled || !!pendingState || images.length >= 4} onClick={() => { replacement.current = undefined; input.current?.click(); }}>Insert Image</button>
      <p className={styles.hint}>JPEG, PNG or static WebP · 3 MiB maximum · four images per side. Images are private to your Card.</p>
    </div>
    {status && <p role="status">{status}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {pendingState && <div className={styles.actions}>
      {!working && pendingState !== 'cancelled' && <button type="button" onClick={() => { if (attempt.current) void upload({ ...attempt.current, controller: new AbortController() }); }}>Retry Upload</button>}
      <button type="button" onClick={() => void discard()}>Cancel Upload</button>
    </div>}
    {images.map(image => <div className={styles.image} key={image.id}>
      <PersonalCardImage cardId={cardId} image={image} />
      <div hidden={preview}>
        <label>Image description<textarea required maxLength={2000} value={image.description} disabled={disabled || working}
          onChange={event => onChange(images.map(item => item.id === image.id ? { ...item, description: event.target.value } : item))} /></label>
        <div className={styles.actions}>
          <button type="button" disabled={disabled || !!pendingState} onClick={() => { replacement.current = image; input.current?.click(); }}>Replace Image</button>
          <button type="button" disabled={disabled || !!pendingState} onClick={() => onChange(images.filter(item => item.id !== image.id))}>Remove Image</button>
        </div>
        <p className={styles.hint}>Changes take effect when you save this Card.</p>
      </div>
    </div>)}
  </div>;
}
