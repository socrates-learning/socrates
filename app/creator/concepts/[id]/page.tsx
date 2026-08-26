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
      .select('id')
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

  const { data: nodes } = await supabase
    .from('library_nodes')
    .select('id, name, parent_id, sort_order')
    .eq('library_id', nursingLibrary.id)
    .order('sort_order')
    .order('name');
  const nodeIds = (nodes || []).map((node) => node.id);
  const { data: placements } = nodeIds.length
    ? await supabase
        .from('concept_placements')
        .select('library_node_id')
        .eq('concept_id', concept.id)
        .in('library_node_id', nodeIds)
    : { data: [] };
  const { data: referenceRows, error: referenceError } = await supabase
    .from('content_source_notes')
    .select('id, source_id, note, created_at, sources(id, title, author, url)')
    .eq('concept_id', concept.id)
    .is('learn_section_id', null)
    .order('created_at');

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
