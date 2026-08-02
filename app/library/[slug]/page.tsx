import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Header } from '@/components/Header';
import { LibrarySwitcher } from '@/components/LibrarySwitcher';
import { Sidebar } from '@/components/Sidebar';
import { resolveActiveLibraryContext } from '@/lib/library-context';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export default async function LibraryLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const context = await resolveActiveLibraryContext({ requestedSlug: slug });

  if (!context.library || context.isUnauthorized) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();
  const { data: nodes, error: nodesError } = await supabase
    .from('library_nodes')
    .select('id')
    .eq('library_id', context.library.id);
  const nodeIds = (nodes || []).map((node) => node.id);
  const placementsResult =
    nodeIds.length > 0
      ? await supabase
          .from('concept_placements')
          .select('concept_id, concepts!inner(id, name, status)')
          .eq('concepts.status', 'published')
          .in('library_node_id', nodeIds)
      : { data: [], error: null };
  const publishedConceptCount = new Set(
    (placementsResult.data || []).map((placement) => placement.concept_id)
  ).size;

  return (
    <>
      <Header />
      <main className="layout">
        <Sidebar />

        <section className="stack">
          <LibrarySwitcher context={context} />

          <div className="panel hero">
            <p className="muted" style={{ marginTop: 0 }}>
              Active library · resolved from {context.source}
            </p>
            <h2>{context.library.name}</h2>
            <p>
              {context.library.description ||
                'This library is ready for structured learning content.'}
            </p>
          </div>

          <div className="panel">
            <h3>Library Landing</h3>

            {nodesError || placementsResult.error ? (
              <p className="muted">Could not load library placement summary.</p>
            ) : publishedConceptCount > 0 ? (
              <>
                <p>
                  <strong>{publishedConceptCount}</strong>{' '}
                  {publishedConceptCount === 1
                    ? 'published concept'
                    : 'published concepts'}{' '}
                  currently placed in this library.
                </p>
                {context.library.slug === 'pharmacology' && (
                  <Link className="btn primary" href="/pharmacology">
                    Open Current Pharmacology View
                  </Link>
                )}
              </>
            ) : (
              <p className="muted">
                No published concepts are placed in this library yet.
              </p>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
