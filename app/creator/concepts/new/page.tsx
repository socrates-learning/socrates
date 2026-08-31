import { notFound } from 'next/navigation';
import { CreatorStudioV2Client } from '@/components/CreatorStudioV2Client';
import { buildConceptTopicTree } from '@/lib/concept-topic-tree';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export default async function NewConceptPage() {
  const supabase = await createSupabaseServerClient();
  const { data: nursingLibrary } = await supabase
    .from('libraries')
    .select('id, library_nodes(id, name, parent_id, sort_order)')
    .eq('slug', 'nursing')
    .eq('status', 'active')
    .maybeSingle();

  if (!nursingLibrary) notFound();
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

  return (
    <CreatorStudioV2Client
      activeLibraryId={nursingLibrary.id}
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
