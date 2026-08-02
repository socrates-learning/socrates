import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Header } from '@/components/Header';
import { LibrarySwitcher } from '@/components/LibrarySwitcher';
import { Sidebar } from '@/components/Sidebar';
import { resolveActiveLibraryContext } from '@/lib/library-context';
import { createSupabaseServerClient } from '@/lib/supabase-server';

type LibraryNode = {
  id: string;
  name: string;
  node_type: string | null;
  parent_id: string | null;
};

type PlacedConcept = {
  id: string;
  name: string;
  concept_type: string | null;
  summary: string | null;
  created_at: string | null;
};

type Placement = {
  concept_id: string;
  library_node_id: string;
  concepts: PlacedConcept | PlacedConcept[] | null;
};

function getConceptFromPlacement(placement: Placement) {
  return Array.isArray(placement.concepts)
    ? placement.concepts[0] || null
    : placement.concepts;
}

function renderLibraryNode(
  node: LibraryNode,
  nodes: LibraryNode[],
  placements: Placement[]
) {
  const children = nodes.filter((child) => child.parent_id === node.id);
  const nodePlacements = placements.filter(
    (placement) => placement.library_node_id === node.id
  );

  return (
    <div className="card" key={node.id}>
      <strong>{node.name}</strong>
      <p className="muted">{node.node_type || 'node'}</p>

      {nodePlacements.map((placement) => {
        const concept = getConceptFromPlacement(placement);

        if (!concept) return null;

        return (
          <p key={`${node.id}-${concept.id}`}>
            <Link href={`/concepts/${concept.id}`}>
              <strong>{concept.name}</strong>
            </Link>
            <br />
            <span className="muted">{concept.concept_type || 'Concept'}</span>
          </p>
        );
      })}

      {children.length > 0 && (
        <div className="sub">
          {children.map((child) =>
            renderLibraryNode(child, nodes, placements)
          )}
        </div>
      )}
    </div>
  );
}

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
    .select('id, name, node_type, parent_id')
    .eq('library_id', context.library.id)
    .order('name');
  const nodeIds = (nodes || []).map((node) => node.id);
  const placementsResult =
    nodeIds.length > 0
      ? await supabase
          .from('concept_placements')
          .select(`
            concept_id,
            library_node_id,
            concepts!inner (
              id,
              name,
              concept_type,
              summary,
              created_at,
              status
            )
          `)
          .eq('concepts.status', 'published')
          .in('library_node_id', nodeIds)
      : { data: [], error: null };
  const placements = (placementsResult.data || []) as unknown as Placement[];
  const publishedConcepts = [
    ...new Map(
      placements.flatMap((placement) => {
        const concept = getConceptFromPlacement(placement);
        return concept ? [[concept.id, concept] as const] : [];
      })
    ).values(),
  ].sort(
    (a, b) =>
      new Date(b.created_at || 0).getTime() -
      new Date(a.created_at || 0).getTime()
  );
  const rootNodes = ((nodes || []) as LibraryNode[]).filter(
    (node) => node.parent_id === null
  );

  return (
    <>
      <Header />
      <main className="layout">
        <Sidebar activeLibrary={context.library} />

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
            ) : publishedConcepts.length > 0 ? (
              <>
                <p>
                  <strong>{publishedConcepts.length}</strong>{' '}
                  {publishedConcepts.length === 1
                    ? 'published concept'
                    : 'published concepts'}{' '}
                  currently placed in this library.
                </p>
                <div className="grid">
                  {publishedConcepts.slice(0, 6).map((concept) => (
                    <div className="card" key={concept.id}>
                      <Link href={`/concepts/${concept.id}`}>
                        <strong>{concept.name}</strong>
                      </Link>
                      <p className="muted">{concept.concept_type || 'Concept'}</p>
                      {concept.summary && <p>{concept.summary}</p>}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="muted">
                No published concepts are placed in this library yet.
              </p>
            )}
          </div>

          <div className="panel">
            <h3>{context.library.name} Structure</h3>
            {nodesError ? (
              <p className="muted">Could not load library hierarchy.</p>
            ) : rootNodes.length > 0 ? (
              <div className="stack">
                {rootNodes.map((node) =>
                  renderLibraryNode(node, (nodes || []) as LibraryNode[], placements)
                )}
              </div>
            ) : (
              <p className="muted">No categories have been created yet.</p>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
