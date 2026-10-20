'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { saveStandaloneCard, moveStandaloneCard,
  type CreatorStandaloneCard, type StandaloneCardAttachment } from '@/lib/standalone-custom-cards';
import type { LearnerCardTopic } from '@/lib/learner-card-search';
import { MoveCardDialog } from './MoveCardDialog';
import toolStyles from './LearnerCardTools.module.css';
import { PersonalCardField } from './PersonalCardField';
import styles from '../CreatorStudioV2Client.module.css';
import { PersonalCardImageAuthoring } from './PersonalCardImageAuthoring';
import { cardImageFingerprint, loadCardImages, postCardMedia, type CardImage } from '@/lib/personal-card-media';

export type StandaloneCardRequest = { card: CreatorStandaloneCard | null; attachment: StandaloneCardAttachment; topicName: string };

export function StandaloneCustomCardWorkspace({ ownerId, canCreate, request, onRequest, onSaved, onEditorState, richText = false, movement, imageTools = !!movement }: {
  imageTools?: boolean;
  movement?: { topics: readonly LearnerCardTopic[]; libraryId: string };
  richText?: boolean;
  ownerId: string; canCreate: boolean; request: StandaloneCardRequest | null;
  onRequest: (request: StandaloneCardRequest | null) => void;
  onEditorState: (dirty: boolean, busy: boolean) => void;
  onSaved: (card: CreatorStandaloneCard) => void;
}) {
  const [front, setFront] = useState(request?.card?.question ?? '');
  const [back, setBack] = useState(request?.card?.answer ?? '');
  const [sourceReference, setSourceReference] = useState(request?.card?.source_reference ?? '');
  const [frontComposing, setFrontComposing] = useState(false);
  const [backComposing, setBackComposing] = useState(false);
  const composing = frontComposing || backComposing;
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [moveOpen, setMoveOpen] = useState(false), [moveStatus, setMoveStatus] = useState('');
  const [images, setImages] = useState<CardImage[]>([]);
  const [savedImages, setSavedImages] = useState('[]');
  const [imageLoaded, setImageLoaded] = useState(false), [imageError, setImageError] = useState('');
  const [imageBusy, setImageBusy] = useState({ front: false, answer: false });
  const imageBusyRef = useRef(imageBusy);
  const mediaSave = useRef<{ fingerprint: string; key: string } | null>(null);
  const imageCard = imageTools && richText ? request?.card?.id : undefined;
  useEffect(() => {
    if (!imageCard) return;
    const controller = new AbortController();
    void loadCardImages(imageCard, controller.signal).then(manifest => {
      if (controller.signal.aborted) return;
      setImages(manifest.images); setSavedImages(cardImageFingerprint(manifest.images)); setImageLoaded(true); setImageError('');
    }).catch(() => { if (!controller.signal.aborted) setImageError('Images could not be loaded. Reopen the Card to edit images; saved images are preserved.'); });
    return () => controller.abort();
  }, [imageCard]);
  const imagesDirty = cardImageFingerprint(images) !== savedImages;
  const uploading = imageBusy.front || imageBusy.answer;
  function setUploadBusy(side: 'front' | 'answer', active: boolean) {
    imageBusyRef.current = { ...imageBusyRef.current, [side]: active }; setImageBusy(imageBusyRef.current);
  }
  const frontRef = useRef<HTMLTextAreaElement>(null);
  const dirty = !!request && (front !== (request.card?.question ?? '') || back !== (request.card?.answer ?? '') || sourceReference !== (request.card?.source_reference ?? '') || imagesDirty || uploading);
  useEffect(() => { onEditorState(dirty, busy || composing || moveOpen || uploading); return () => onEditorState(false, false); }, [dirty, busy, composing, moveOpen, uploading, onEditorState]);
  useEffect(() => {
    if (!dirty) return;
    function protect(event: BeforeUnloadEvent) { event.preventDefault(); }
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [dirty]);
  function open(next: StandaloneCardRequest | null) {
    if (busyRef.current || imageBusyRef.current.front || imageBusyRef.current.answer || composing || (dirty && !window.confirm('Discard unsaved Card changes?'))) return;
    setFront(next?.card?.question ?? ''); setBack(next?.card?.answer ?? ''); setError(''); onRequest(next);
    setSourceReference(next?.card?.source_reference ?? '');
    requestAnimationFrame(() => frontRef.current?.focus());
  }
  async function save() {
    if (!request || busyRef.current || imageBusyRef.current.front || imageBusyRef.current.answer || composing || (!request.card && !canCreate)) return;
    busyRef.current = true; onEditorState(dirty, true); setBusy(true); setError('');
    try {
      let saved: CreatorStandaloneCard;
      if (imageCard && imageLoaded && (imagesDirty || images.length)) {
        if (images.some(image => !image.description.trim())) throw new Error('Add a description for each image before saving.');
        const payload = { front, back, sourceReference, images: images.map(({ id, assetId, side, description }) => ({ id, assetId, side, description })) };
        const fingerprint = JSON.stringify([request.card!.updated_at, payload]);
        if (mediaSave.current?.fingerprint !== fingerprint) mediaSave.current = { fingerprint, key: crypto.randomUUID() };
        saved = await postCardMedia(imageCard, { action: 'save', revision: request.card!.updated_at, idempotencyKey: mediaSave.current.key, payload });
        if (saved.id !== imageCard || saved.owner_id !== ownerId) throw new Error('Saved Card identity could not be verified. Reload before continuing.');
        const committed = images.map(image => { const copy = { ...image }; delete copy.reservationId; return copy; });
        setImages(committed); setSavedImages(cardImageFingerprint(committed)); mediaSave.current = null;
      } else saved = await saveStandaloneCard(supabase, ownerId, request.attachment, front, back, request.card, sourceReference);
      onSaved(saved); setFront(saved.question); setBack(saved.answer);
      setSourceReference(saved.source_reference ?? '');
      onRequest({ ...request, card: saved });
    } catch (error) { setError(error instanceof Error ? error.message : 'Card could not be saved.'); }
    finally { busyRef.current = false; onEditorState(dirty, false); setBusy(false); }
  }
  async function move(destination: LearnerCardTopic) {
    if (!request?.card || !movement || busyRef.current || imageBusyRef.current.front || imageBusyRef.current.answer || composing || dirty) throw new Error('Save or cancel your Card edits before moving.');
    const allowed = movement.topics.find(topic => topic.key === destination.key && topic.canMove);
    if (!allowed) throw new Error('Choose an available Topic.');
    const attachment: StandaloneCardAttachment = allowed.source === 'official'
      ? { source: 'official', topicId: allowed.topicId, libraryId: movement.libraryId }
      : { source: 'personal', topicId: allowed.topicId };
    busyRef.current = true; setBusy(true); setMoveStatus('');
    try {
      const moved = await moveStandaloneCard(supabase, ownerId, request.card, attachment);
      onSaved(moved); onRequest({ card: moved, attachment, topicName: allowed.name });
      setMoveOpen(false); setMoveStatus(`Card moved to ${allowed.paths[0]}.`);
    } finally { busyRef.current = false; setBusy(false); }
  }
  if (!request) return null;
  const media = (side: 'front' | 'answer', preview: boolean) => imageCard && imageLoaded ? <PersonalCardImageAuthoring
    cardId={imageCard} side={side} images={images.filter(image => image.side === side)} disabled={busy || composing} preview={preview}
    onBusy={active => setUploadBusy(side, active)} onChange={next => setImages(current => [...current.filter(image => image.side !== side), ...next])} /> : null;
  const topicKey = `${request.attachment.source}:topic:${request.attachment.topicId}`;
  return <>
    {movement && request.card && <div>
      <p className={toolStyles.currentTopic}>Current Topic: <strong>{movement.topics.find(topic => topic.key === topicKey)?.paths[0] || request.topicName}</strong></p>
      <button type="button" className={toolStyles.moveButton} disabled={busy || composing || dirty} onClick={() => setMoveOpen(true)}>Move Card</button>
      {dirty && <p className={toolStyles.hint}>Save or cancel your Card edits before moving. Your draft will stay here.</p>}
    </div>}
    {moveOpen && movement && request.card && <MoveCardDialog topics={movement.topics} currentKey={topicKey}
      currentName={movement.topics.find(topic => topic.key === topicKey)?.paths[0] || request.topicName}
      onCancel={() => setMoveOpen(false)} onMove={move} />}
    {moveStatus && <p role="status">{moveStatus}</p>}
    <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
      {richText ? <>
        <PersonalCardField label="Front" value={front} onChange={setFront} maxLength={10000} disabled={busy} onComposing={setFrontComposing} media={preview => media('front', preview)} />
        <PersonalCardField label="Back" value={back} onChange={setBack} maxLength={20000} disabled={busy} onComposing={setBackComposing} media={preview => media('answer', preview)} />
        {imageTools && !request.card && <p>Save this Card to insert private images.</p>}
        {imageCard && !imageLoaded && !imageError && <p role="status">Loading Card images…</p>}
        {imageError && <p role="alert">{imageError}</p>}
      </> : <>
      <label className={styles.personalField}>Front<textarea ref={frontRef} value={front} maxLength={10000} required disabled={busy}
        onChange={(event) => setFront(event.target.value)} /></label>
      <label className={styles.personalField}>Back<textarea value={back} maxLength={20000} required disabled={busy}
        onChange={(event) => setBack(event.target.value)} /></label>
      </>}
      <label className={styles.personalField}>Source / Reference (optional)<textarea value={sourceReference} disabled={busy}
        onChange={event => setSourceReference(event.target.value)} /></label>
      <button type="submit" className={styles.primaryButton} disabled={busy || uploading || composing || !front.trim() || !back.trim()}>Save Card</button>
      <button type="button" className={styles.secondaryButton} disabled={busy || uploading || composing} onClick={() => open(null)}>Cancel</button>
    </form>
    {error && <div className={`${styles.status} ${styles.error}`} role="alert">{error}</div>}
  </>;
}
