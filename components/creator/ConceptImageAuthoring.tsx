'use client';

import { useEffect, useImperativeHandle, useRef, useState, type RefObject } from 'react';
import { conceptMediaEndpoint, conceptMediaFingerprint, conceptMediaToken, conceptMediaWriteParts, editConceptMediaText, insertConceptMedia, orderedConceptMedia, removeConceptMedia, type ConceptMediaContext, type ConceptMediaManifest, type ConceptMediaPlacement } from '@/lib/concept-media';
import { VerifiedConceptImage } from '@/components/ConceptMediaContent';
import styles from '@/components/ConceptMedia.module.css';

async function requestJSON(url: string, init?: RequestInit) {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...init });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'Image operation could not be confirmed. Your draft is preserved.');
  return value;
}
function post(context: ConceptMediaContext, action: string, extra: Record<string, unknown> = {}) {
  return requestJSON(conceptMediaEndpoint(context), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, libraryId: context.libraryId, ...(context.kind === 'draft' ? { draftId: context.draftId } : {}), ...extra }) });
}
type Inspector = { placement: ConceptMediaPlacement | null; replacing: boolean; alt: string; caption: string; selection: number; source: string };
type State = {
  key: string; context: ConceptMediaContext | null; version: string | null;
  items: ConceptMediaPlacement[]; baseline: string; entered: boolean;
  inspector: Inspector | null; pending: boolean; activity: 'loading' | 'uploading' | 'cancelling'; error: string;
};
function emptyState(key: string, version: string | null): State {
  return { key, context: null, version, items: [], baseline: '[]', entered: false, inspector: null, pending: false, activity: 'loading', error: '' };
}

/** Owned by Creator's parent lifetime, including while another internal tab is visible. */
export function useConceptImageAuthoring({ libraryId, conceptId, enabled, source, baseSource, initialVersionId, onSource }: {
  libraryId: string; conceptId: string | null; enabled: boolean; source: string; baseSource: string;
  initialVersionId: string | null; onSource: (source: string, selection?: number) => void;
}) {
  const key = `${libraryId}:${conceptId || 'new'}:${enabled}`;
  const [state, setState] = useState(() => emptyState(key, initialVersionId));
  const generation = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const uploads = useRef<{ context: ConceptMediaContext; reservation: string }[]>([]);
  const busy = useRef(false);
  const current = state.key === key ? state : emptyState(key, initialVersionId);

  useEffect(() => {
    const version = ++generation.current;
    abort.current?.abort();
    busy.current = false;
    uploads.current = [];
    setState(emptyState(key, initialVersionId));
    if (!enabled || !conceptId || !baseSource.includes('[[socrates-media:')) return;
    const controller = new AbortController();
    abort.current = controller;
    setState(s => ({ ...s, pending: true }));
    void requestJSON(`/api/content-media/concepts/${conceptId}?libraryId=${encodeURIComponent(libraryId)}`, { signal: controller.signal })
      .then((manifest: ConceptMediaManifest) => {
        if (generation.current !== version || controller.signal.aborted) return;
        if (manifest.bodyMarkdown !== baseSource || manifest.conceptId !== conceptId) throw new Error('Concept changed. Reload before editing images.');
        orderedConceptMedia(baseSource, manifest.placements);
        setState({ ...emptyState(key, manifest.versionId), context: { kind: 'concept', conceptId, libraryId }, items: manifest.placements, baseline: conceptMediaFingerprint(manifest.placements), entered: true });
      }).catch(error => { if (generation.current === version && !controller.signal.aborted) setState(s => ({ ...s, pending: false, error: error.message, entered: true })); });
    return () => controller.abort();
  }, [key, enabled, conceptId, libraryId, baseSource, initialVersionId]);

  async function cancelReservation(context: ConceptMediaContext, reservation: string) {
    const url = context.kind === 'draft' ? `${conceptMediaEndpoint(context)}/drafts/${reservation}` : `/api/content-media/uploads/${reservation}`;
    const result = await requestJSON(url, { method: 'DELETE', signal: AbortSignal.timeout(30_000) });
    if (result.cancelled !== true) throw new Error('Image cancellation was not confirmed.');
  }
  async function reconcileUnused(context: ConceptMediaContext | null, items: ConceptMediaPlacement[], version: number) {
    if (!context) return;
    const unused = uploads.current.filter(u => u.context.libraryId === context.libraryId && u.context.kind === context.kind
      && (u.context.kind === 'draft' && context.kind === 'draft' ? u.context.draftId === context.draftId : u.context.kind === 'concept' && context.kind === 'concept' && u.context.conceptId === context.conceptId)
      && !items.some(p => p.reservationId === u.reservation));
    for (const upload of unused) {
      if (generation.current !== version) throw new Error('Concept context changed. Your current draft is preserved.');
      try { await cancelReservation(upload.context, upload.reservation); }
      catch { throw new Error('Unused image cancellation could not be confirmed. Your draft is preserved. Retry Save or Cancel.'); }
      if (generation.current !== version) throw new Error('Concept context changed. Your current draft is preserved.');
      uploads.current = uploads.current.filter(u => u !== upload);
    }
  }
  function reset(abandon = true) {
    generation.current++;
    abort.current?.abort();
    busy.current = false;
    if (abandon) {
      if (current.context?.kind === 'draft') void post(current.context, 'abandon').catch(() => undefined);
      for (const upload of uploads.current) void cancelReservation(upload.context, upload.reservation).catch(() => undefined);
    }
    uploads.current = [];
    setState(emptyState(key, null));
  }
  function open(selection: number, placement?: ConceptMediaPlacement, replacing = false) {
    if (!enabled || current.pending || busy.current) return;
    onSource(source);
    setState(s => ({ ...s, error: '', inspector: { placement: placement || null, replacing, alt: placement?.altText || '', caption: placement?.caption || '', selection, source } }));
  }
  async function upload(file: File) {
    if (!enabled || busy.current || !current.inspector) return;
    busy.current = true;
    const version = generation.current;
    const controller = new AbortController();
    abort.current = controller;
    setState(s => ({ ...s, pending: true, activity: 'uploading', error: '' }));
    let context = current.context;
    try {
      if (!context) {
        if (conceptId) {
          const manifest = await requestJSON(`/api/content-media/concepts/${conceptId}?libraryId=${encodeURIComponent(libraryId)}`, { signal: controller.signal }) as ConceptMediaManifest;
          if (manifest.bodyMarkdown !== baseSource) throw new Error('Concept changed. Reload before adding images.');
          context = { kind: 'concept', conceptId, libraryId };
          if (generation.current !== version) return;
          setState(s => ({ ...s, version: manifest.versionId }));
        } else {
          context = { kind: 'draft', draftId: crypto.randomUUID(), libraryId };
          await post(context, 'create');
        }
        if (generation.current !== version) {
          if (context.kind === 'draft') void post(context, 'abandon').catch(() => undefined);
          return;
        }
        setState(s => ({ ...s, context, entered: true }));
      }
      const reservation = context.kind === 'draft' ? await post(context, 'reserve', { idempotencyKey: crypto.randomUUID() })
        : await requestJSON('/api/content-media/reservations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ libraryId, kind: 'concept', targetId: conceptId, idempotencyKey: crypto.randomUUID() }) });
      if (generation.current !== version) { void cancelReservation(context, reservation.reservationId).catch(() => undefined); return; }
      uploads.current.push({ context, reservation: reservation.reservationId });
      const url = context.kind === 'draft' ? `${conceptMediaEndpoint(context)}/drafts/${reservation.reservationId}` : `/api/content-media/uploads/${reservation.reservationId}`;
      const uploaded = await requestJSON(url, { method: 'PUT', body: file, signal: controller.signal });
      if (!uploaded.ready || uploaded.terminal) throw new Error('Image upload is not ready');
      const query = new URLSearchParams({ libraryId, metadata: '1', ...(context.kind === 'draft' ? { draftId: context.draftId } : {}) });
      const metadata = await requestJSON(`${conceptMediaEndpoint(context)}/drafts/${reservation.reservationId}?${query}`, { signal: controller.signal });
      if (generation.current !== version) return;
      if (metadata.assetId !== uploaded.assetId) throw new Error('Image verification differs');
      setState(s => ({ ...s, pending: false, inspector: s.inspector ? { ...s.inspector, replacing: false, placement: { ...metadata, placementId: s.inspector.placement?.placementId || crypto.randomUUID(), reservationId: reservation.reservationId, ordinal: 0, altText: s.inspector.alt, caption: s.inspector.caption } } : null }));
    } catch (error) {
      if (generation.current === version) setState(s => ({ ...s, pending: false, error: error instanceof Error ? error.message : 'Image upload could not be confirmed.' }));
    } finally { if (generation.current === version) busy.current = false; }
  }
  function changeMetadata(field: 'alt' | 'caption', value: string) {
    setState(s => ({ ...s, inspector: s.inspector ? { ...s.inspector, [field]: value } : null }));
  }
  function insert() {
    const inspector = current.inspector;
    if (!inspector?.placement || current.pending || !inspector.alt.trim()) return;
    try {
      const placement = { ...inspector.placement, altText: inspector.alt, caption: inspector.caption };
      const exists = current.items.some(p => p.placementId === placement.placementId);
      if (!exists && inspector.source !== source) throw new Error('The text changed while the image was open. Cancel and choose its position again.');
      const items = exists ? current.items.map(p => p.placementId === placement.placementId ? placement : p) : [...current.items, placement];
      let nextSource = source;
      const token = conceptMediaToken(placement.placementId);
      let selection = Math.max(0, source.indexOf(token)) + token.length;
      if (!exists) { const inserted = insertConceptMedia(source, inspector.selection, placement.placementId); nextSource = inserted.value; selection = inserted.selectionEnd; }
      const ordered = orderedConceptMedia(nextSource, items);
      setState(s => ({ ...s, items: ordered, inspector: null, entered: true, error: '' }));
      onSource(nextSource, selection);
    } catch (error) { setState(s => ({ ...s, error: error instanceof Error ? error.message : 'Image insertion failed' })); }
  }
  async function close() {
    const version = ++generation.current;
    abort.current?.abort();
    busy.current = true;
    setState(s => ({ ...s, pending: true, activity: 'cancelling' }));
    try {
      await reconcileUnused(current.context, current.items, version);
      if (generation.current === version) {
        setState(s => ({ ...s, inspector: null, error: '', pending: false }));
        onSource(source, Math.min(source.length, current.inspector?.selection ?? source.length));
      }
    } catch {
      if (generation.current === version) setState(s => ({ ...s, pending: false, error: 'Image cancellation could not be confirmed. Please retry Cancel.' }));
    } finally { if (generation.current === version) busy.current = false; }
  }
  function remove(id: string) {
    if (current.pending) return;
    onSource(removeConceptMedia(source, id), Math.max(0, source.indexOf(conceptMediaToken(id))));
    setState(s => ({ ...s, items: s.items.filter(p => p.placementId !== id), inspector: null, error: '', entered: true }));
  }
  function clear() {
    if (current.context?.kind === 'draft') reset();
    else setState(s => ({ ...s, items: [], inspector: null, error: '', entered: s.entered }));
  }
  async function save(payload: Record<string, unknown>) {
    if (current.pending || current.inspector || busy.current) return { data: null, error: { message: 'Finish or cancel the image operation before saving.' } };
    const version = generation.current;
    busy.current = true;
    try {
      if (current.error) throw new Error(current.error);
      const context = current.context;
      if (!context) throw new Error('Image context is unavailable. Your draft is preserved.');
      const placements = orderedConceptMedia(String(payload.p_body_markdown || ''), current.items);
      setState(s => ({ ...s, pending: true, activity: 'cancelling' }));
      await reconcileUnused(context, placements, version);
      if (generation.current !== version) throw new Error('Concept context changed. Your current draft is preserved.');
      const data = await post(context, 'save', { versionId: context.kind === 'concept' ? current.version : null, payload: { ...payload, placements } });
      if (!data.concept_id || !data.version_id || data.bodyMarkdown !== payload.p_body_markdown || conceptMediaFingerprint(data.placements) !== conceptMediaFingerprint(placements)) throw new Error('Concept save readback differs. Your draft is preserved.');
      if (generation.current === version && context.kind === 'concept') {
        setState(s => ({ ...s, version: data.version_id, items: data.placements, baseline: conceptMediaFingerprint(data.placements), error: '' }));
        for (const upload of uploads.current) void cancelReservation(upload.context, upload.reservation).catch(() => undefined);
        uploads.current = [];
      }
      return { data, error: null };
    } catch (error) { return { data: null, error: { message: error instanceof Error ? error.message : 'Concept save could not be confirmed.' } }; }
    finally { if (generation.current === version) { busy.current = false; setState(s => ({ ...s, pending: false })); } }
  }
  let fingerprint = '';
  try { fingerprint = conceptMediaFingerprint(orderedConceptMedia(source, current.items)); } catch { fingerprint = 'invalid'; }
  const dirty = Boolean(current.inspector || current.pending || current.context?.kind === 'draft' || (current.entered && fingerprint !== current.baseline));
  return { ...current, dirty, guardActive: current.entered || Boolean(current.inspector), usesMedia: current.entered || source.includes('[[socrates-media:'), open, upload, changeMetadata, insert, close, remove, clear, reset, save,
    replace: () => setState(s => ({ ...s, inspector: s.inspector ? { ...s.inspector, replacing: true } : null })),
  };
}

export default function ConceptImageAuthoring({ controller, disabled }: { controller: ReturnType<typeof useConceptImageAuthoring>; disabled: boolean }) {
  const image = controller.inspector;
  if (!image && !controller.items.length && !controller.error && !controller.pending && !controller.dirty) return null;
  return <div data-concept-image-authoring="true">
    {controller.error ? <p role="alert" className={styles.error}>{controller.error}</p> : null}
    {controller.pending ? <p role="status">{controller.activity === 'uploading' ? 'Uploading image…' : controller.activity === 'cancelling' ? 'Cancelling image changes…' : 'Loading images…'}</p> : null}
    {!controller.pending && !image && controller.dirty && !controller.error ? <p role="status">{controller.items.length ? 'Image ready — save the Concept to keep your changes' : 'Image changes are not saved — save the Concept to keep your changes'}</p> : null}
    {controller.items.length ? <section className={styles.images} aria-label="Images in this Concept">
      <h3>Images in this Concept</h3>
      {controller.items.map((p, i) => <ConceptImageEntry key={p.placementId} placement={p} index={i} controller={controller} disabled={disabled} />)}
    </section> : null}
    {image ? (
      <section className={styles.inspector} aria-label="Concept image">
        <h3>{image.placement && controller.items.some(p => p.placementId === image.placement?.placementId) ? `Editing Image ${controller.items.findIndex(p => p.placementId === image.placement?.placementId) + 1}` : 'Add Image'}</h3>
        {!image.placement || image.replacing ? <label>Choose image (JPEG, PNG or static WebP; up to 3 MiB)
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled || controller.pending} onChange={event => { const file = event.target.files?.[0]; if (file) void controller.upload(file); event.target.value = ''; }} />
        </label> : null}
        {image.placement && controller.context ? <VerifiedConceptImage placement={image.placement} context={controller.context} /> : null}
        <label>Alt Text (required)<textarea aria-label="Image Alt Text" value={image.alt} required maxLength={2000} disabled={disabled || controller.pending} onChange={event => controller.changeMetadata('alt', event.target.value)} /></label>
        <label>Caption (optional)<input aria-label="Image Caption" value={image.caption} maxLength={4000} disabled={disabled || controller.pending} onChange={event => controller.changeMetadata('caption', event.target.value)} /></label>
        <div className={styles.actions}>
          <button type="button" disabled={disabled || controller.pending || !image.placement || !image.alt.trim()} onClick={controller.insert}>{controller.items.some(p => p.placementId === image.placement?.placementId) ? 'Apply' : 'Insert'}</button>
          {image.placement ? <button type="button" disabled={disabled || controller.pending} onClick={controller.replace}>Replace</button> : null}
          {image.placement && controller.items.some(p => p.placementId === image.placement?.placementId) ? <button type="button" disabled={disabled || controller.pending} onClick={() => controller.remove(image.placement!.placementId)}>Remove</button> : null}
          <button type="button" disabled={disabled} onClick={() => void controller.close()}>Cancel</button>
        </div>
      </section>
    ) : null}
  </div>;
}

function ConceptImageEntry({ placement, index, controller, disabled, thumbnail = false }: {
  placement: ConceptMediaPlacement; index: number; controller: ReturnType<typeof useConceptImageAuthoring>; disabled: boolean; thumbnail?: boolean;
}) {
  const selected = controller.inspector?.placement?.placementId === placement.placementId;
  const locked = disabled || controller.pending || Boolean(controller.inspector);
  return <div className={styles.imageEntry} data-editing={selected || undefined} role="group" aria-label={`Image ${index + 1}: ${placement.altText}`}>
    {thumbnail && controller.context ? <div className={styles.thumbnail}><VerifiedConceptImage placement={{ ...placement, caption: '' }} context={controller.context} /></div> : null}
    <div className={styles.imageDetails}>
      <strong>Image {index + 1}</strong><span>{placement.altText}</span>
      {selected ? <span className={styles.editing}>Editing this image</span> : null}
      <div className={styles.actions}>
        <button type="button" disabled={locked} aria-label={`Edit Image ${index + 1} metadata`} onClick={() => controller.open(0, placement)}>Edit</button>
        <button type="button" disabled={locked} aria-label={`Replace Image ${index + 1}`} onClick={() => controller.open(0, placement, true)}>Replace</button>
        <button type="button" disabled={locked} aria-label={`Remove Image ${index + 1} from Concept draft`} onClick={() => controller.remove(placement.placementId)}>Remove</button>
      </div>
    </div>
  </div>;
}

export type ConceptImageEditorHandle = {
  selection: () => { start: number; end: number };
  focusSelection: (start: number, end: number) => void;
};

/** One Markdown source remains parent-owned. Only its Write representation is segmented. */
export function ConceptImageWriteEditor({ source, controller, disabled, className, editorRef, onChange }: {
  source: string; controller: ReturnType<typeof useConceptImageAuthoring>; disabled: boolean; className: string;
  editorRef: RefObject<ConceptImageEditorHandle | null>; onChange: (source: string) => void;
}) {
  const parts = conceptMediaWriteParts(source);
  const fields = useRef(new Map<number, HTMLTextAreaElement>());
  const selection = useRef({ start: source.length, end: source.length });
  useImperativeHandle(editorRef, () => ({
    selection: () => selection.current,
    focusSelection(start, end) {
      const candidates = parts.flatMap((part, index) => part.kind === 'text' ? [{ part, index }] : []);
      const target = candidates.find(({ part }) => end <= part.end) || candidates.at(-1);
      if (!target) return;
      const offset = target.part.start + target.part.prefix.length;
      const from = Math.max(0, Math.min(target.part.text.length, start - offset));
      const to = Math.max(from, Math.min(target.part.text.length, end - offset));
      fields.current.get(target.index)?.focus();
      fields.current.get(target.index)?.setSelectionRange(from, to);
      selection.current = { start: offset + from, end: offset + to };
    },
  }));
  let imageIndex = 0;
  return <div className={`${className} ${styles.writeDocument}`} role="group" aria-label="Concept or explanation">
    {parts.map((part, index) => {
      if (part.kind === 'image') {
        const ordinal = imageIndex++;
        const placement = controller.items.find(p => p.placementId === part.placementId);
        return placement ? <ConceptImageEntry key={`image-${index}`} placement={placement} index={ordinal} controller={controller} disabled={disabled} thumbnail />
          : <div key={`image-${index}`} className={styles.imageEntry} role="status">Image {ordinal + 1} — {controller.pending ? 'loading details…' : 'details unavailable. Reload before saving.'}</div>;
      }
      const offset = part.start + part.prefix.length;
      return <textarea key={`text-${index}`} ref={field => { if (field) fields.current.set(index, field); else fields.current.delete(index); }}
        className={styles.writeText} value={part.text} readOnly={disabled} rows={Math.max(2, Math.min(18, part.text.split('\n').length + 1))}
        aria-label={`Concept text ${imageIndex === 0 ? 'before Image 1' : `after Image ${imageIndex}`}`}
        placeholder={imageIndex === 0 ? 'Write before the image…' : 'Continue writing after the image…'}
        onSelect={event => { selection.current = { start: offset + event.currentTarget.selectionStart, end: offset + event.currentTarget.selectionEnd }; }}
        onChange={event => {
          const next = editConceptMediaText(source, part, event.target.value);
          selection.current = { start: next.offset + event.target.selectionStart, end: next.offset + event.target.selectionEnd };
          onChange(next.source);
        }} />;
    })}
  </div>;
}
