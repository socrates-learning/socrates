import { redirect, notFound } from 'next/navigation';
import { CreatorStudioV2Client } from '@/components/CreatorStudioV2Client';
import { buildConceptTopicTree } from '@/lib/concept-topic-tree';
import { resolveActiveLibraryContext } from '@/lib/library-context';
import { getServerCreatorCapabilityManifest } from '@/lib/server-creator-capabilities';
import { loadCreatorPersonalContent } from '@/lib/creator-personal-content';
import { readCreatorQueryData } from '@/lib/creator-data-access';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export default async function NewConceptPage() {
  const context = await resolveActiveLibraryContext({ failOnQueryError: true });
  if (!context.library) redirect('/');
  const capabilities = await getServerCreatorCapabilityManifest({
    activeLibraryContext: context,
  });
  if (!capabilities) redirect('/login?next=/creator/concepts/new');
  const supabase = await createSupabaseServerClient();
  const [activeLibraryResult, personalContent] = await Promise.all([
    supabase
      .from('libraries')
      .select('id, library_nodes(id, name, parent_id, sort_order)')
      .eq('id', context.library.id)
      .eq('status', 'active')
      .maybeSingle(),
    loadCreatorPersonalContent(supabase, capabilities.subject.userId),
  ]);
  const activeLibrary = readCreatorQueryData(
    activeLibraryResult,
    'the active Library and Topic Tree'
  );

  if (!activeLibrary) notFound();
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

  return (
    <CreatorStudioV2Client
      key={activeLibrary.id}
      activeLibraryId={activeLibrary.id}
      creatorCapabilities={capabilities}
      initialPersonalContent={personalContent}
      initialTopics={buildConceptTopicTree(nodes || [])}
      initialConcept={{
        id: null,
        name: '',
        bodyMarkdown: '',
        placementIds: [],
      }}
      initialReferences={[]}
    />
  );
}
