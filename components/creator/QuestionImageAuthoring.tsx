'use client';

import { useEffect, useRef, useState } from 'react';
import VerifiedMediaImage from '@/components/VerifiedMediaImage';
import { orderedQuestionMedia, questionImageSource, questionMediaEndpoint, questionMediaFingerprint, questionMediaMatches, type QuestionMediaContext, type QuestionMediaHint, type QuestionMediaManifest, type QuestionMediaPlacement, type QuestionMediaSurface } from '@/lib/question-media';
import styles from '@/components/ConceptMedia.module.css';

class RequestFailure extends Error { constructor(message: string, public status = 0) { super(message); } }
async function requestJSON(url: string, init?: RequestInit) {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...init });
  const value = await response.json();
  if (!response.ok) throw new RequestFailure(value.error || 'Image operation could not be confirmed. Your draft is preserved.', response.status);
  return value;
}
function post(context: QuestionMediaContext, action: string, extra: Record<string, unknown> = {}) {
  return requestJSON(questionMediaEndpoint(context), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...context, ...extra }) });
}
type Inspector = { surface: QuestionMediaSurface; placement: QuestionMediaPlacement | null; replacing: boolean; alt: string; caption: string };
type State = {
  key: string; context: QuestionMediaContext | null; version: string | null; items: QuestionMediaPlacement[]; baseline: string;
  entered: boolean; inspector: Inspector | null; pending: boolean; uncertain: boolean; activity: 'loading' | 'uploading' | 'cancelling'; error: string;
};
function empty(key: string, version: string | null, loading = false): State {
  return { key, context: null, version, items: [], baseline: '[]', entered: loading, inspector: null, pending: loading, uncertain: false, activity: 'loading', error: '' };
}

/** Creator owns this controller across Questions/Search; neither text nor selection lives here. */
export function useQuestionImageAuthoring({ libraryId, questionId, enabled, hint, basePrompt, baseAnswer }: {
  libraryId: string; questionId: string | null; enabled: boolean; hint?: QuestionMediaHint | null; basePrompt: string; baseAnswer: string;
}) {
  const key = `${libraryId}:${questionId || 'new'}:${enabled}`;
  const hasImages = Boolean(enabled && questionId && (hint?.front || hint?.answer));
  const [state, setState] = useState(() => empty(key, hint?.versionId || null, hasImages));
  const generation = useRef(0);
  const busy = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const uncertainPayload = useRef<string | null>(null);
  const uploads = useRef<{ context: QuestionMediaContext; reservation: string }[]>([]);
  const current = state.key === key ? state : empty(key, hint?.versionId || null, hasImages);

  useEffect(() => {
    const version = ++generation.current;
    abort.current?.abort(); busy.current = false; uncertainPayload.current = null; uploads.current = [];
    setState(empty(key, hint?.versionId || null, hasImages));
    if (!hasImages || !hint || !questionId) return;
    const controller = new AbortController(); abort.current = controller;
    void requestJSON(`${questionMediaEndpoint({ questionId })}?libraryId=${encodeURIComponent(libraryId)}`, { signal: controller.signal }).then((manifest: QuestionMediaManifest) => {
      if (!questionMediaMatches(manifest, hint, basePrompt, baseAnswer)) throw new Error('Question changed. Reload before editing images.');
      const items = orderedQuestionMedia(manifest.placements);
      if (generation.current === version && !controller.signal.aborted) setState({ ...empty(key, manifest.versionId), entered: true, items, baseline: questionMediaFingerprint(items) });
    }).catch(error => { if (generation.current === version && !controller.signal.aborted) setState(s => ({ ...s, pending: false, entered: true, error: error.message })); });
    return () => controller.abort();
  }, [key, enabled, questionId, libraryId, hasImages, hint, basePrompt, baseAnswer]); // The loaded record, not typing, controls hydration.

  useEffect(() => {
    const context = state.context;
    return () => { if (context) void post(context, 'abandon').catch(() => undefined); };
  }, [state.context]);

  function reset() {
    generation.current++; abort.current?.abort(); busy.current = false; uncertainPayload.current = null; uploads.current = [];
    if (current.context) void post(current.context, 'abandon').catch(() => undefined);
    setState(empty(key, null));
  }
  function open(surface: QuestionMediaSurface, placement?: QuestionMediaPlacement, replacing = false) {
    if (!enabled || current.pending || current.uncertain || busy.current || current.error) return;
    setState(s => ({ ...s, inspector: { surface, placement: placement || null, replacing, alt: placement?.altText || '', caption: placement?.caption || '' } }));
  }
  async function ensureContext() {
    if (current.context) return current.context;
    let versionId = current.version;
    if (questionId) {
      const manifest = await requestJSON(`${questionMediaEndpoint({ questionId })}?libraryId=${encodeURIComponent(libraryId)}`) as QuestionMediaManifest;
      if (manifest.prompt !== basePrompt || manifest.answer !== baseAnswer || manifest.questionId !== questionId || manifest.libraryId !== libraryId || (hint && manifest.versionId !== hint.versionId)) throw new Error('Question changed. Reload before adding images.');
      if (questionMediaFingerprint(manifest.placements) !== current.baseline) throw new Error('Question images changed. Reload before adding images.');
      versionId = manifest.versionId;
    }
    const context = { libraryId, questionId, versionId, draftId: crypto.randomUUID() };
    await post(context, 'create');
    return context;
  }
  async function upload(file: File) {
    if (!enabled || busy.current || current.uncertain || !current.inspector) return;
    busy.current = true;
    const version = generation.current, inspector = current.inspector;
    const controller = new AbortController(); abort.current = controller;
    setState(s => ({ ...s, pending: true, activity: 'uploading', error: '' }));
    let context: QuestionMediaContext | null = null;
    try {
      context = await ensureContext();
      if (generation.current !== version) { void post(context, 'abandon').catch(() => undefined); return; }
      setState(s => ({ ...s, context, version: context!.versionId, entered: true }));
      const reservation = await post(context, 'reserve', { idempotencyKey: crypto.randomUUID() });
      uploads.current.push({ context, reservation: reservation.reservationId });
      if (generation.current !== version) {
        void requestJSON(`${questionMediaEndpoint(context)}/drafts/${reservation.reservationId}`, { method: 'DELETE' }).catch(() => undefined);
        return;
      }
      const endpoint = `${questionMediaEndpoint(context)}/drafts/${reservation.reservationId}`;
      const uploaded = await requestJSON(endpoint, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file, signal: controller.signal });
      if (!uploaded.ready || uploaded.terminal) throw new Error('Image upload is unavailable.');
      const metadata = await requestJSON(`${endpoint}?${new URLSearchParams({ libraryId, draftId: context.draftId, metadata: '1' })}`, { signal: controller.signal });
      if (generation.current !== version) return;
      if (metadata.assetId !== uploaded.assetId) throw new Error('Image verification differs');
      setState(s => ({ ...s, pending: false, inspector: s.inspector ? { ...s.inspector, replacing: false, placement: { ...metadata, placementId: inspector.placement?.placementId || crypto.randomUUID(), reservationId: reservation.reservationId, surface: inspector.surface, ordinal: 0, altText: s.inspector.alt, caption: s.inspector.caption } } : null }));
    } catch (error) {
      if (generation.current === version) setState(s => ({ ...s, pending: false, error: error instanceof Error ? error.message : 'Image upload could not be confirmed.' }));
    } finally { if (generation.current === version) busy.current = false; }
  }
  function changeMetadata(field: 'alt' | 'caption', value: string) {
    if (current.pending || current.uncertain) return;
    setState(s => ({ ...s, inspector: s.inspector ? { ...s.inspector, [field]: value } : null }));
  }
  function insert() {
    const image = current.inspector;
    if (!image?.placement || current.pending || current.uncertain || !image.alt.trim()) return;
    const placement = { ...image.placement, altText: image.alt, caption: image.caption };
    const items = current.items.some(p => p.placementId === placement.placementId) ? current.items.map(p => p.placementId === placement.placementId ? placement : p) : [...current.items, placement];
    setState(s => ({ ...s, items: orderedQuestionMedia(items), entered: true, inspector: null, error: '' }));
  }
  async function close() {
    if (current.uncertain) return;
    const version = ++generation.current; abort.current?.abort(); busy.current = true;
    setState(s => ({ ...s, pending: true, activity: 'cancelling' }));
    try {
      for (const upload of uploads.current.filter(u => !current.items.some(p => p.reservationId === u.reservation))) {
        await requestJSON(`${questionMediaEndpoint(upload.context)}/drafts/${upload.reservation}`, { method: 'DELETE' });
      }
      if (generation.current === version) setState(s => ({ ...s, pending: false, inspector: null, error: '' }));
    } catch { if (generation.current === version) setState(s => ({ ...s, pending: false, error: 'Image cancellation could not be confirmed. Please retry Cancel.' })); }
    finally { if (generation.current === version) busy.current = false; }
  }
  function remove(id: string) {
    if (current.pending || current.uncertain) return;
    setState(s => ({ ...s, items: orderedQuestionMedia(s.items.filter(p => p.placementId !== id)), inspector: null, entered: true, error: '' }));
  }
  function move(id: string, direction: -1 | 1) {
    if (current.pending || current.uncertain || current.inspector) return;
    const item = current.items.find(p => p.placementId === id);
    if (!item) return;
    const surface = current.items.filter(p => p.surface === item.surface);
    const at = surface.findIndex(p => p.placementId === id), to = at + direction;
    if (to < 0 || to >= surface.length) return;
    [surface[at], surface[to]] = [surface[to], surface[at]];
    setState(s => ({ ...s, items: orderedQuestionMedia([...s.items.filter(p => p.surface !== item.surface), ...surface]), entered: true }));
  }
  async function save(payload: Record<string, unknown>) {
    if (current.pending || current.inspector || busy.current) return { data: null, error: { message: 'Finish or cancel image changes before saving.' } };
    const version = generation.current;
    busy.current = true;
    try {
      if (current.error && !current.uncertain) throw new Error(current.error);
      const placements = orderedQuestionMedia(current.items);
      const full = { ...payload, front: placements.filter(p => p.surface === 'front'), answer: placements.filter(p => p.surface === 'answer') };
      const encoded = JSON.stringify(full);
      if (uncertainPayload.current && uncertainPayload.current !== encoded) throw new Error('Retry the unchanged save before editing. The earlier save is not yet confirmed.');
      const context = await ensureContext();
      if (generation.current !== version) throw new Error('Question context changed. Your current draft is preserved.');
      setState(s => ({ ...s, context, entered: true }));
      let data;
      try { data = await post(context, 'save', { payload: full }); }
      catch (error) {
        if (error instanceof RequestFailure && error.status < 500) throw error;
        uncertainPayload.current = encoded;
        // Reconcile a lost response using the SAME receipt and exact payload, never a fresh create.
        data = await post(context, 'save', { payload: full });
      }
      if (!data.id || !data.current_version_id || data.prompt !== payload.p_prompt || data.answer !== (payload.p_accepted_answers as { answer_text: string }[])[0].answer_text || questionMediaFingerprint(data.placements) !== questionMediaFingerprint(placements)) throw new Error('Question save readback differs. Your draft is preserved.');
      if (generation.current !== version) throw new Error('Question context changed. Your current draft is preserved.');
      uncertainPayload.current = null;
      if (questionId) setState(s => ({ ...s, context: null, version: data.current_version_id, items: data.placements, baseline: questionMediaFingerprint(data.placements), uncertain: false, error: '' }));
      return { data, error: null };
    } catch (error) {
      if (generation.current === version && uncertainPayload.current) setState(s => ({ ...s, uncertain: true, error: 'Save is not confirmed. Retry Save Question without changing this draft.' }));
      return { data: null, error: { message: error instanceof Error ? error.message : 'Question save could not be confirmed.' } };
    } finally { if (generation.current === version) busy.current = false; }
  }
  const dirty = Boolean(current.inspector || current.pending || current.uncertain || current.context || (current.entered && questionMediaFingerprint(current.items) !== current.baseline));
  return { ...current, dirty, guardActive: current.entered || Boolean(current.inspector), usesMedia: current.entered || hasImages, open, upload, changeMetadata, insert, close, remove, move, reset, save,
    replace: () => setState(s => ({ ...s, inspector: s.inspector ? { ...s.inspector, replacing: true } : null })),
  };
}

export default function QuestionImageAuthoring({ controller, surface, disabled }: { controller: ReturnType<typeof useQuestionImageAuthoring>; surface: QuestionMediaSurface; disabled: boolean }) {
  const image = controller.inspector?.surface === surface ? controller.inspector : null;
  const items = controller.items.filter(p => p.surface === surface);
  const label = surface === 'front' ? 'Question' : 'Answer';
  const add = useRef<HTMLButtonElement | null>(null);
  const alt = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => { if (image?.placement) alt.current?.focus(); }, [image?.placement]);
  const locked = disabled || controller.pending || controller.uncertain;
  function returnFocus() { requestAnimationFrame(() => add.current?.focus()); }
  return <div data-question-image-authoring={surface}>
    <button ref={add} type="button" disabled={locked || Boolean(controller.inspector) || Boolean(controller.error)} onClick={() => controller.open(surface)} aria-label={`Add Image to ${label}`}>Add Image</button>
    {controller.error ? <p role="alert" className={styles.error}>{controller.error}</p> : null}
    {controller.pending ? <p role="status">{controller.activity === 'uploading' ? 'Uploading image…' : controller.activity === 'cancelling' ? 'Cancelling image changes…' : 'Loading images…'}</p> : null}
    {!controller.pending && !image && controller.dirty && !controller.error ? <p role="status">Image changes are not saved — save the Question to keep your changes</p> : null}
    {items.length ? <section className={styles.images} aria-label={`Images in ${label}`}><h3>Images in {label}</h3>
      {items.map((p, i) => <div key={p.placementId} className={styles.imageEntry} role="group" aria-label={`${label} Image ${i + 1}: ${p.altText}`} data-editing={image?.placement?.placementId === p.placementId || undefined}>
        <div className={styles.imageDetails}><strong>Image {i + 1}</strong><span>{p.altText}</span><div className={styles.actions}>
          <button type="button" disabled={locked || Boolean(controller.inspector)} onClick={() => controller.open(surface, p)}>Edit</button>
          <button type="button" disabled={locked || Boolean(controller.inspector)} onClick={() => controller.open(surface, p, true)}>Replace</button>
          <button type="button" disabled={locked || Boolean(controller.inspector)} onClick={() => { controller.remove(p.placementId); returnFocus(); }}>Remove</button>
          <button type="button" aria-label={`Move ${label} Image ${i + 1} earlier`} disabled={locked || Boolean(controller.inspector) || i === 0} onClick={() => controller.move(p.placementId, -1)}>Move earlier</button>
          <button type="button" aria-label={`Move ${label} Image ${i + 1} later`} disabled={locked || Boolean(controller.inspector) || i === items.length - 1} onClick={() => controller.move(p.placementId, 1)}>Move later</button>
        </div></div>
      </div>)}
    </section> : null}
    {image ? <section className={styles.inspector} aria-label={`${label} image`}><h3>{image.placement ? 'Edit Image' : 'Add Image'}</h3>
      {!image.placement || image.replacing ? <label>Choose image (JPEG, PNG or static WebP; up to 3 MiB)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={locked} onChange={event => { const file = event.target.files?.[0]; if (file) void controller.upload(file); event.target.value = ''; }} /></label> : null}
      {image.placement && controller.context ? <VerifiedMediaImage placement={image.placement} src={questionImageSource(image.placement, controller.context)} /> : image.placement ? <VerifiedMediaImage placement={image.placement} src={`/api/content-media/delivery/${image.placement.placementId}`} /> : null}
      <label>Alt Text (required)<textarea ref={alt} aria-label={`${label} Image Alt Text`} value={image.alt} required maxLength={2000} disabled={locked} onChange={event => controller.changeMetadata('alt', event.target.value)} /></label>
      <label>Caption (optional)<input aria-label={`${label} Image Caption`} value={image.caption} maxLength={4000} disabled={locked} onChange={event => controller.changeMetadata('caption', event.target.value)} /></label>
      <div className={styles.actions}>
        <button type="button" disabled={locked || !image.placement || !image.alt.trim()} onClick={() => { controller.insert(); returnFocus(); }}>{items.some(p => p.placementId === image.placement?.placementId) ? 'Apply' : 'Insert'}</button>
        {image.placement ? <button type="button" disabled={locked} onClick={controller.replace}>Replace</button> : null}
        <button type="button" disabled={disabled || controller.uncertain} onClick={() => { void controller.close().then(returnFocus); }}>Cancel</button>
      </div>
    </section> : null}
  </div>;
}
