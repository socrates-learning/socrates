import type { SupabaseClient } from '@supabase/supabase-js';

export type StudyConceptReviewSource = {
  id: string;
  title: string;
  author: string | null;
  sourceType: string | null;
  note: string | null;
  url: string | null;
};

export type StudyConceptReview = {
  conceptId: string;
  name: string;
  summary: string | null;
  whyItMatters: string | null;
  bodyMarkdown: string;
  sources: StudyConceptReviewSource[];
};

type SourceRow = {
  id: string;
  title: string;
  author: string | null;
  source_type: string | null;
  url: string | null;
};

type SourceNoteRow = {
  id: string;
  note: string | null;
  learn_section_id: string | null;
  sources: SourceRow | SourceRow[] | null;
};

type ConceptReviewRow = {
  id: string;
  name: string;
  summary: string | null;
  why_it_matters: string | null;
  body_markdown: string | null;
  status: string;
  content_source_notes: SourceNoteRow[] | null;
};

type ConceptPlacementReviewRow = {
  concept_id: string;
  concepts: ConceptReviewRow | ConceptReviewRow[] | null;
};

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

const escapedLineBreakPattern = /\\r\\n|\\n|\\r/g;
const escapedParagraphBreakPattern = /(?:\\r\\n|\\n|\\r){2}/;
const escapedMarkdownBlockPattern =
  /(?:^|\\r\\n|\\n|\\r)(?:#{1,6}\s|[-+*]\s|\d+\.\s|>\s)/;

export function normalizeStudyConceptReviewMarkdown(markdown: string): string {
  // Creator Studio stores real textarea line breaks. Keep that canonical form
  // byte-for-byte, including any intentional literal `\\n` examples within it.
  if (!markdown || /[\r\n]/.test(markdown)) return markdown;

  const escapedBreaks = markdown.match(escapedLineBreakPattern);
  if (!escapedBreaks || escapedBreaks.length < 2) return markdown;

  // Some imported or manually pasted records can contain a serialized Markdown
  // document with literal escaped line breaks. Decode only when the whole value
  // strongly resembles that format, rather than rewriting every literal `\\n`.
  const looksLikeEscapedDocument =
    escapedParagraphBreakPattern.test(markdown) &&
    escapedMarkdownBlockPattern.test(markdown);

  return looksLikeEscapedDocument
    ? markdown.replace(escapedLineBreakPattern, '\n')
    : markdown;
}

export function adaptStudyConceptReview(
  placement: ConceptPlacementReviewRow
): StudyConceptReview | null {
  const concept = one(placement.concepts);

  if (!concept || concept.status !== 'published') return null;

  const sources = (concept.content_source_notes || []).flatMap((sourceNote) => {
    if (sourceNote.learn_section_id !== null) return [];

    const source = one(sourceNote.sources);
    if (!source) return [];

    return [
      {
        id: sourceNote.id,
        title: source.title,
        author: source.author,
        sourceType: source.source_type,
        note: sourceNote.note,
        url: source.url,
      },
    ];
  });

  return {
    conceptId: concept.id,
    name: concept.name,
    summary: concept.summary,
    whyItMatters: concept.why_it_matters,
    bodyMarkdown: normalizeStudyConceptReviewMarkdown(
      concept.body_markdown ?? ''
    ),
    sources,
  };
}

export async function loadOfficialStudyConceptReview(
  supabase: SupabaseClient,
  {
    conceptId,
    libraryId,
  }: {
    conceptId: string;
    libraryId: string;
  }
): Promise<StudyConceptReview | null> {
  // One lazy read both proves the Concept belongs to the active Library and
  // loads only learner-readable, published Concept content and attribution.
  const { data, error } = await supabase
    .from('concept_placements')
    .select(`
      concept_id,
      library_nodes!inner(library_id),
      concepts!inner(
        id,
        name,
        summary,
        why_it_matters,
        body_markdown,
        status,
        content_source_notes(
          id,
          note,
          learn_section_id,
          sources(
            id,
            title,
            author,
            source_type,
            url
          )
        )
      )
    `)
    .eq('concept_id', conceptId)
    .eq('library_nodes.library_id', libraryId)
    .eq('concepts.status', 'published')
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load Concept review: ${error.message}`);
  }

  return data
    ? adaptStudyConceptReview(data as unknown as ConceptPlacementReviewRow)
    : null;
}
