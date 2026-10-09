'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CreatorCapabilityManifest } from '@/lib/creator-capabilities';
import type { OfficialContentFormat } from '@/lib/official-content-format';
import { supabase } from '@/lib/supabase';
import ConceptMediaContent from '@/components/ConceptMediaContent';
import { MarkdownContent } from '@/components/MarkdownContent';
import { CreatorDialogShell } from './CreatorPresentationPrimitives';

export type ConceptPreviewTarget = {
  id: string;
  name: string;
  relationship: 'Primary' | 'Related';
} & ({ source: 'official' } | { source: 'personal'; topicId: string });

type Reference = {
  id: string;
  title: string;
  author: string | null;
  note: string | null;
  url: string | null;
};
type Preview = {
  name: string;
  summary: string | null;
  whyItMatters: string | null;
  body: string;
  format: OfficialContentFormat;
  references: Reference[];
};
type Source = Omit<Reference, 'note'>;
type SourceNote = {
  id: string;
  note: string | null;
  learn_section_id: string | null;
  sources: Source | Source[] | null;
};
type Concept = {
  id: string;
  name: string;
  summary: string | null;
  why_it_matters: string | null;
  body_markdown: string | null;
  body_format: OfficialContentFormat;
  content_source_notes: SourceNote[] | null;
};

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value.length === 1 ? value[0] : null) : value;
}

// Use the existing staff Data API read boundary, not the published-only Study
// adapter or the Concept-opening handler that replaces authoring state.
export async function loadConceptPreview(
  client: SupabaseClient,
  target: ConceptPreviewTarget,
  capabilities: CreatorCapabilityManifest,
  libraryId: string,
  signal: AbortSignal
): Promise<Preview> {
  if (!libraryId || capabilities.library.activeLibraryId !== libraryId ||
    !capabilities.library.canAccessActiveLibrary || !capabilities.official.saveQuestion ||
    !capabilities.subject.userId ||
    (capabilities.subject.role !== 'admin' && capabilities.subject.role !== 'editor')) {
    throw new Error('Concept preview unavailable.');
  }

  if (target.source === 'personal') {
    const { data, error } = await client.from('personal_concepts')
      .select('id, owner_id, topic_id, name, description, source_reference')
      .eq('id', target.id).eq('owner_id', capabilities.subject.userId)
      .eq('topic_id', target.topicId).abortSignal(signal).maybeSingle();
    if (error || !data || data.id !== target.id ||
      data.owner_id !== capabilities.subject.userId || data.topic_id !== target.topicId) {
      throw new Error('Concept preview unavailable.');
    }
    return {
      name: data.name, summary: null, whyItMatters: null,
      body: data.description || '', format: 'legacy',
      references: data.source_reference ? [{
        id: data.id, title: 'Source reference', author: null,
        note: data.source_reference, url: null,
      }] : [],
    };
  }

  const { data, error } = await client.from('concept_placements').select(`
    concept_id, library_nodes!inner(library_id),
    concepts!inner(id, name, summary, why_it_matters, body_markdown, body_format,
      content_source_notes(id, note, learn_section_id, sources(id, title, author, url)))
  `).eq('concept_id', target.id).eq('library_nodes.library_id', libraryId)
    .limit(1).abortSignal(signal).maybeSingle();
  const placement = data as unknown as {
    concept_id: string;
    library_nodes: { library_id: string } | { library_id: string }[] | null;
    concepts: Concept | Concept[] | null;
  } | null;
  const concept = placement && one(placement.concepts);
  if (error || !concept || placement?.concept_id !== target.id || concept.id !== target.id ||
    one(placement.library_nodes)?.library_id !== libraryId ||
    (concept.body_format !== 'legacy' && concept.body_format !== 'visual_markdown_v1')) {
    throw new Error('Concept preview unavailable.');
  }
  return {
    name: concept.name, summary: concept.summary, whyItMatters: concept.why_it_matters,
    body: concept.body_markdown || '', format: concept.body_format,
    references: (concept.content_source_notes || []).flatMap(note => {
      const source = one(note.sources);
      return note.learn_section_id === null && source
        ? [{ ...source, id: note.id, note: note.note }] : [];
    }),
  };
}

function referenceHref(value: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch { return undefined; }
}

export default function CreatorConceptPreview({ target, capabilities, libraryId, onClose }: {
  target: ConceptPreviewTarget;
  capabilities: CreatorCapabilityManifest;
  libraryId: string;
  onClose: () => void;
}) {
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: Preview } | null>(null);
  const key = JSON.stringify([target, libraryId, capabilities.subject, capabilities.library, capabilities.official.saveQuestion, retry]);
  useEffect(() => {
    const controller = new AbortController();
    void loadConceptPreview(supabase, target, capabilities, libraryId, controller.signal)
      .then(data => { if (!controller.signal.aborted) setResult({ key, data }); })
      .catch(() => { if (!controller.signal.aborted) setResult({ key }); });
    return () => controller.abort();
  }, [key, target, capabilities, libraryId]);
  const current = result?.key === key ? result : null;
  const data = current?.data;
  return (
    <CreatorDialogShell title="Concept preview" titleId="creator-concept-preview-title" onClose={onClose}>
      <div style={{ padding: '16px 18px', overflowWrap: 'anywhere' }}>
        <h3>{data?.name || target.name}</h3>
        <p>{target.relationship} Concept · Read-only</p>
        {!current ? <p role="status">Loading Concept…</p> : !data ? (
          <div>
            <p role="alert">This Concept could not be loaded for the current author and Library.</p>
            <button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button>
          </div>
        ) : (
          <>
            {data.summary && <p>{data.summary}</p>}
            {data.whyItMatters && <section aria-label="Why it matters"><h4>Why it matters</h4><p>{data.whyItMatters}</p></section>}
            {data.body ? target.source === 'official' ? (
              <ConceptMediaContent markdown={data.body} format={data.format} conceptId={target.id} libraryId={libraryId} />
            ) : <MarkdownContent markdown={data.body} /> : <p>No explanation has been saved for this Concept.</p>}
            {data.references.length > 0 && (
              <section aria-label="Concept references">
                <h4>References</h4>
                <ul>{data.references.map(reference => {
                  const href = referenceHref(reference.url);
                  return <li key={reference.id}>
                    {href ? <a href={href} target="_blank" rel="noopener noreferrer">{reference.title}</a> : reference.title}
                    {reference.author && <span> — {reference.author}</span>}
                    {reference.note && <p style={{ whiteSpace: 'pre-wrap' }}>{reference.note}</p>}
                  </li>;
                })}</ul>
              </section>
            )}
          </>
        )}
      </div>
    </CreatorDialogShell>
  );
}
