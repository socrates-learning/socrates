import { redirect, notFound } from 'next/navigation';
import { CreatorStudioV2Client } from '@/components/CreatorStudioV2Client';
import { buildConceptTopicTree } from '@/lib/concept-topic-tree';
import { resolveActiveLibraryContext } from '@/lib/library-context';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export default async function NewConceptPage() {
  const context = await resolveActiveLibraryContext();
  if (!context.library) redirect('/');
  const supabase = await createSupabaseServerClient();
  const { data: activeLibrary } = await supabase
    .from('libraries')
    .select('id, library_nodes(id, name, parent_id, sort_order)')
    .eq('id', context.library.id)
    .eq('status', 'active')
    .maybeSingle();

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
