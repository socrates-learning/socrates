import { Header, HeaderSessionProvider } from '@/components/Header';
import { StudyCreatorClient } from '@/components/StudyCreatorClient';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getVerifiedRequestAuthContext } from '@/lib/server-auth-context';
import { resolveActiveLibraryContext } from '@/lib/library-context';
import { redirect } from 'next/navigation';

export default async function StudyCreatorPage() {
  const requestAuth = await getVerifiedRequestAuthContext();
  let userId = requestAuth?.userId ?? null;
  let email = requestAuth?.email ?? null;
  let role = requestAuth?.role ?? null;

  if (!requestAuth) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect('/login?next=/study-creator');

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (
      roleData?.role !== 'learner' &&
      roleData?.role !== 'editor' &&
      roleData?.role !== 'admin'
    ) {
      redirect('/pending-approval');
    }

    userId = user.id;
    email = user.email ?? 'Account';
    role = roleData.role;
  }

  if (!userId) redirect('/login?next=/study-creator');

  const activeLibraryContext = await resolveActiveLibraryContext();
  const activeLibrary = activeLibraryContext.library;
  let officialBrowser = null;

  if (activeLibrary) {
    const supabase = await createSupabaseServerClient();
    const { data: nodeRows, error: nodeError } = await supabase
      .from('library_nodes')
      .select('id, parent_id, name, sort_order')
      .eq('library_id', activeLibrary.id)
      .order('sort_order')
      .order('name');

    if (nodeError && process.env.NODE_ENV !== 'production') {
      console.error('Failed to load Study Creator Socrates Topics:', nodeError);
    }

    const placementResult = nodeRows?.length
      ? await supabase
          .from('concept_placements')
          .select(`
            library_node_id,
            sort_order,
            library_nodes!inner(library_id),
            concepts!inner(
              id,
              name,
              summary,
              why_it_matters,
              body_markdown,
              status
            )
          `)
          .eq('library_nodes.library_id', activeLibrary.id)
          .eq('concepts.status', 'published')
          .order('sort_order')
      : { data: [], error: null };

    if (placementResult.error && process.env.NODE_ENV !== 'production') {
      console.error(
        'Failed to load Study Creator Socrates Concepts:',
        placementResult.error
      );
    }

    const conceptsById = new Map<
      string,
      {
        id: string;
        name: string;
        summary: string | null;
        whyItMatters: string | null;
        bodyMarkdown: string;
        placementNodeIds: string[];
      }
    >();

    (placementResult.data ?? []).forEach((placement) => {
      const related = placement.concepts as unknown as
        | {
            id: string;
            name: string;
            summary: string | null;
            why_it_matters: string | null;
            body_markdown: string | null;
          }
        | Array<{
            id: string;
            name: string;
            summary: string | null;
            why_it_matters: string | null;
            body_markdown: string | null;
          }>
        | null;
      const concept = Array.isArray(related) ? related[0] : related;
      if (!concept || !placement.library_node_id) return;

      const existing = conceptsById.get(concept.id);
      if (existing) {
        if (!existing.placementNodeIds.includes(placement.library_node_id)) {
          existing.placementNodeIds.push(placement.library_node_id);
        }
        return;
      }

      conceptsById.set(concept.id, {
        id: concept.id,
        name: concept.name,
        summary: concept.summary,
        whyItMatters: concept.why_it_matters,
        bodyMarkdown: concept.body_markdown ?? '',
        placementNodeIds: [placement.library_node_id],
      });
    });

    officialBrowser = {
      libraryId: activeLibrary.id,
      libraryName: activeLibrary.name,
      nodes: nodeRows ?? [],
      concepts: Array.from(conceptsById.values()),
    };
  }

  return (
    <HeaderSessionProvider email={email ?? 'Account'} role={role}>
      <Header />
      <StudyCreatorClient officialBrowser={officialBrowser} ownerId={userId} />
    </HeaderSessionProvider>
  );
}
