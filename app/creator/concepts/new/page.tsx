import { notFound } from 'next/navigation';
import { CreatorStudioV2Client } from '@/components/CreatorStudioV2Client';
import { buildConceptTopicTree } from '@/lib/concept-topic-tree';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export default async function NewConceptPage() {
  const supabase = await createSupabaseServerClient();
  const { data: nursingLibrary } = await supabase
    .from('libraries')
    .select('id')
    .eq('slug', 'nursing')
    .eq('status', 'active')
    .maybeSingle();

  if (!nursingLibrary) notFound();

  const { data: nodes } = await supabase
    .from('library_nodes')
    .select('id, name, parent_id, sort_order')
    .eq('library_id', nursingLibrary.id)
    .order('sort_order')
    .order('name');

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
