'use client';

import { useEffect, useState } from 'react';
import VerifiedMediaImage from './VerifiedMediaImage';
import { MarkdownContent } from './MarkdownContent';
import { conceptMediaBlocks, conceptMediaEndpoint, type ConceptMediaContext, type ConceptMediaManifest, type ConceptMediaPlacement } from '@/lib/concept-media';
import styles from './ConceptMedia.module.css';

export function conceptImageSource(placement: ConceptMediaPlacement, context: ConceptMediaContext) {
  if (placement.reservationId) {
    const query = new URLSearchParams({ libraryId: context.libraryId });
    if (context.kind === 'draft') query.set('draftId', context.draftId);
    return `${conceptMediaEndpoint(context)}/drafts/${placement.reservationId}?${query}`;
  }
  return `/api/content-media/delivery/${placement.placementId}`;
}

export function VerifiedConceptImage({ placement, context }: { placement: ConceptMediaPlacement; context: ConceptMediaContext }) {
  return <VerifiedMediaImage placement={placement} src={conceptImageSource(placement, context)} />;
}

export default function ConceptMediaContent({ markdown, conceptId, libraryId, context, placements }: {
  markdown: string;
  conceptId?: string | null;
  libraryId?: string | null;
  context?: ConceptMediaContext | null;
  placements?: ConceptMediaPlacement[];
}) {
  const [loaded, setLoaded] = useState<{ key: string; manifest?: ConceptMediaManifest } | null>(null);
  let blocks: ReturnType<typeof conceptMediaBlocks> = [];
  try { if (markdown.includes('[[socrates-media:')) blocks = conceptMediaBlocks(markdown); } catch { /* Malformed source remains literal. */ }
  const needsMedia = blocks.length > 0;
  const key = `${libraryId}:${conceptId}:${markdown}`;
  useEffect(() => {
    if (!needsMedia || placements || !conceptId || !libraryId) return;
    const controller = new AbortController();
    void fetch(`/api/content-media/concepts/${conceptId}?libraryId=${encodeURIComponent(libraryId)}`, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Unavailable');
        const manifest = await response.json() as ConceptMediaManifest;
        if (manifest.conceptId !== conceptId || manifest.bodyMarkdown !== markdown) throw new Error('Concept changed');
        if (!controller.signal.aborted) setLoaded({ key, manifest });
      }).catch(() => { if (!controller.signal.aborted) setLoaded({ key }); });
    return () => controller.abort();
  }, [key, needsMedia, placements, conceptId, libraryId, markdown]);
  if (!needsMedia) return <MarkdownContent markdown={markdown} />;
  const current = placements || (loaded?.key === key ? loaded.manifest?.placements : undefined) || [];
  const byId = new Map(current.map(p => [p.placementId, p]));
  const byLine = new Map(blocks.map(b => [b.line, b.id]));
  const imageContext = context || (conceptId && libraryId ? { kind: 'concept' as const, conceptId, libraryId } : null);
  return <MarkdownContent markdown={markdown} renderConceptBlock={(_line, line) => {
    const id = byLine.get(line);
    if (!id) return undefined;
    const placement = byId.get(id);
    return placement && imageContext
      ? <VerifiedConceptImage key={id} placement={placement} context={imageContext} />
      : <figure key={id} className={styles.figure}><span role="status">Image unavailable. {`[[socrates-media:${id}]]`}</span></figure>;
  }} />;
}
