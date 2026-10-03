import { redirect, notFound } from 'next/navigation';
import { CreatorStudioV2Client } from '@/components/CreatorStudioV2Client';
import { buildConceptTopicTree } from '@/lib/concept-topic-tree';
import { resolveActiveLibraryContext } from '@/lib/library-context';
import { getServerCreatorCapabilityManifest } from '@/lib/server-creator-capabilities';
import { loadCreatorPersonalContent } from '@/lib/creator-personal-content';
import { readCreatorQueryData } from '@/lib/creator-data-access';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export default async function EditConceptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ question?: string }>;
}) {
  const { id } = await params;
  const context = await resolveActiveLibraryContext({ failOnQueryError: true });
  if (!context.library) redirect('/');
  const capabilities = await getServerCreatorCapabilityManifest({
    activeLibraryContext: context,
  });
  if (!capabilities) redirect(`/login?next=/creator/concepts/${id}`);
  if (capabilities.subject.role === 'learner') redirect('/creator');
  const supabase = await createSupabaseServerClient();
  const [activeLibraryResult, conceptResult, personalContent] = await Promise.all([
    supabase
      .from('libraries')
      .select('id, library_nodes(id, name, parent_id, sort_order)')
      .eq('id', context.library.id)
      .eq('status', 'active')
      .maybeSingle(),
    supabase
      .from('concepts')
      .select('id, name, body_markdown, body_format, current_version_id, updated_at')
      .eq('id', id)
      .maybeSingle(),
    loadCreatorPersonalContent(supabase, capabilities.subject.userId),
  ]);
  const activeLibrary = readCreatorQueryData(
    activeLibraryResult,
    'the active Library and Topic Tree'
  );
  const concept = readCreatorQueryData(conceptResult, 'the requested Concept');

  if (!activeLibrary || !concept) notFound();
  const questionId = (await searchParams)?.question;
  let initialQuestion = null;
  if (questionId) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(questionId)) notFound();
    const result = await supabase.rpc('get_creator_questions_with_media', { p_concept_id: concept.id, p_active_library_id: activeLibrary.id });
    const rows = readCreatorQueryData(result, 'the requested Question');
    initialQuestion = (rows || []).find((row: { id: string; concept_id: string }) => row.id === questionId && row.concept_id === concept.id) || null;
    if (!initialQuestion) notFound();
  }
  const nodes = [...(activeLibrary.library_nodes || [])].sort(
    (left, right) => {
      if (left.sort_order === null && right.sort_order !== null) return 1;
      if (left.sort_order !== null && right.sort_order === null) return -1;
      return (
        (left.sort_order ?? 0) - (right.sort_order ?? 0) ||
        left.name.localeCompare(right.name)
      );
    }
  );
  const [placementResult, referenceResult] = await Promise.all([
    supabase
      .from('concept_placements')
      .select('library_node_id, library_nodes!inner(library_id)')
      .eq('concept_id', concept.id)
      .eq('library_nodes.library_id', activeLibrary.id),
    supabase
      .from('content_source_notes')
      .select('id, source_id, note, created_at, sources(id, title, author, url)')
      .eq('concept_id', concept.id)
      .is('learn_section_id', null)
      .order('created_at'),
  ]);
  const placements = readCreatorQueryData(
    placementResult,
    'the selected Concept placements'
  );
  const referenceRows = readCreatorQueryData(
    referenceResult,
    'the selected Concept references'
  );

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
      key={activeLibrary.id}
      activeLibraryId={activeLibrary.id}
      creatorCapabilities={capabilities}
      initialPersonalContent={personalContent}
      initialQuestion={initialQuestion}
      initialTopics={buildConceptTopicTree(nodes || [], true)}
      initialConcept={{
        id: concept.id,
        name: concept.name,
        bodyMarkdown: concept.body_markdown || '',
        currentVersionId: concept.current_version_id,
        bodyFormat: concept.body_format,
        updatedAt: concept.updated_at,
        placementIds: (placements || []).map(
          (placement) => placement.library_node_id
        ),
      }}
      initialReferences={initialReferences}
    />
  );
}
