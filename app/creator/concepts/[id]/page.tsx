import { notFound } from 'next/navigation';
import { CreatorStudioV2Client } from '@/components/CreatorStudioV2Client';
import { buildConceptTopicTree } from '@/lib/concept-topic-tree';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export default async function EditConceptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const [{ data: nursingLibrary }, { data: concept }] = await Promise.all([
    supabase
      .from('libraries')
      .select('id, library_nodes(id, name, parent_id, sort_order)')
      .eq('slug', 'nursing')
      .eq('status', 'active')
      .maybeSingle(),
    supabase
      .from('concepts')
      .select('id, name, body_markdown')
      .eq('id', id)
      .maybeSingle(),
  ]);

  if (!nursingLibrary || !concept) notFound();
  const nodes = [...(nursingLibrary.library_nodes || [])].sort(
    (left, right) => {
      if (left.sort_order === null && right.sort_order !== null) return 1;
      if (left.sort_order !== null && right.sort_order === null) return -1;
      return (
        (left.sort_order ?? 0) - (right.sort_order ?? 0) ||
        left.name.localeCompare(right.name)
      );
    }
  );
  const nodeIds = (nodes || []).map((node) => node.id);
  const [placementResult, referenceResult] = await Promise.all([
    nodeIds.length
      ? supabase
          .from('concept_placements')
          .select('library_node_id')
          .eq('concept_id', concept.id)
          .in('library_node_id', nodeIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from('content_source_notes')
      .select('id, source_id, note, created_at, sources(id, title, author, url)')
      .eq('concept_id', concept.id)
      .is('learn_section_id', null)
      .order('created_at'),
  ]);
  const { data: placements } = placementResult;
  const { data: referenceRows, error: referenceError } = referenceResult;

  if (referenceError) throw referenceError;

  type SourceRow = {
    id: string;
    title: string;
    author: string | null;
    url: string | null;
  };
  type ReferenceRow = {
    id: string;
    source_id: string | null;
    note: string | null;
    sources: SourceRow | SourceRow[] | null;
  };

  const initialReferences = ((referenceRows || []) as ReferenceRow[]).flatMap(
    (reference) => {
      const source = Array.isArray(reference.sources)
        ? reference.sources[0]
        : reference.sources;
      if (!reference.source_id || !source) return [];

      return [
        {
          id: `reference-${reference.id}`,
          sourceId: source.id,
          attributionId: reference.id,
          title: source.title,
          author: source.author || '',
          url: source.url || '',
          notes: reference.note || '',
        },
      ];
    }
  );

  return (
    <CreatorStudioV2Client
      activeLibraryId={nursingLibrary.id}
      initialTopics={buildConceptTopicTree(nodes || [])}
      initialConcept={{
        id: concept.id,
        name: concept.name,
        bodyMarkdown: concept.body_markdown || '',
        placementIds: (placements || []).map(
          (placement) => placement.library_node_id
        ),
      }}
      initialReferences={initialReferences}
    />
  );
}
