import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Header } from '@/components/Header';
import { createSupabaseServerClient } from '@/lib/supabase-server';

type LibraryNode = {
  id: string;
  name: string;
  parent_id: string | null;
};

type ConceptRecord = {
  id: string;
  name: string;
  status: string;
};

type ConceptPlacement = {
  concept_id: string;
  library_node_id: string;
  concepts: ConceptRecord | ConceptRecord[] | null;
};

function conceptFromPlacement(placement: ConceptPlacement) {
  return Array.isArray(placement.concepts)
    ? placement.concepts[0] || null
    : placement.concepts;
}

function topicPath(nodeId: string, nodesById: Map<string, LibraryNode>) {
  const names: string[] = [];
  const visited = new Set<string>();
  let current = nodesById.get(nodeId);

  while (current && !visited.has(current.id)) {
    names.unshift(current.name);
    visited.add(current.id);
    current = current.parent_id
      ? nodesById.get(current.parent_id)
      : undefined;
  }

  return names.join(' > ');
}

export default async function ManageConceptsPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const query = (resolvedSearchParams.q || '').trim();
  const normalizedQuery = query.toLocaleLowerCase();
  const supabase = await createSupabaseServerClient();
  const { data: nursingLibrary } = await supabase
    .from('libraries')
    .select('id, name')
    .eq('slug', 'nursing')
    .eq('status', 'active')
    .maybeSingle();

  if (!nursingLibrary) notFound();

  const { data: nodes, error: nodeError } = await supabase
    .from('library_nodes')
    .select('id, name, parent_id')
    .eq('library_id', nursingLibrary.id)
    .order('name');

  if (nodeError) throw nodeError;

  const nodeIds = (nodes || []).map((node) => node.id);
  const { data: placements, error: placementError } = nodeIds.length
    ? await supabase
        .from('concept_placements')
        .select(
          'concept_id, library_node_id, concepts!inner(id, name, status)'
        )
        .in('library_node_id', nodeIds)
    : { data: [], error: null };

  if (placementError) throw placementError;

  const nodesById = new Map(
    ((nodes || []) as LibraryNode[]).map((node) => [node.id, node])
  );
  const conceptsById = new Map<
    string,
    ConceptRecord & { topicPaths: Set<string> }
  >();

  for (const placement of (placements || []) as unknown as ConceptPlacement[]) {
    const concept = conceptFromPlacement(placement);
    if (!concept) continue;

    const path = topicPath(placement.library_node_id, nodesById);
    const existing = conceptsById.get(concept.id);
    if (existing) {
      if (path) existing.topicPaths.add(path);
      continue;
    }

    conceptsById.set(concept.id, {
      ...concept,
      topicPaths: new Set(path ? [path] : []),
    });
  }

  const allConcepts = [...conceptsById.values()].sort((left, right) =>
    left.name.localeCompare(right.name)
  );
  const visibleConcepts = normalizedQuery
    ? allConcepts.filter((concept) =>
        concept.name.toLocaleLowerCase().includes(normalizedQuery)
      )
    : allConcepts;

  return (
    <>
      <Header />
      <main className="layout" style={{ gridTemplateColumns: '1fr' }}>
        <section className="stack" style={{ width: 'min(1100px, 100%)', margin: '0 auto' }}>
          <div
            className="panel"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <p className="muted" style={{ margin: '0 0 6px' }}>
                Nursing
              </p>
              <h2 style={{ margin: 0 }}>Concepts</h2>
            </div>
            <Link className="btn primary" href="/creator/concepts/new">
              + New Concept
            </Link>
          </div>

          <div className="panel">
            <form
              action="/creator/concepts"
              method="get"
              style={{ display: 'flex', gap: 10, alignItems: 'center' }}
            >
              <input
                type="search"
                name="q"
                defaultValue={query}
                placeholder="Search concepts..."
                aria-label="Search concepts"
              />
              <button className="btn primary" type="submit">
                Search
              </button>
              {query && (
                <Link className="btn ghost" href="/creator/concepts">
                  Clear
                </Link>
              )}
            </form>
          </div>

          {allConcepts.length === 0 ? (
            <div className="panel">
              <p>No concepts have been created yet.</p>
              <Link className="btn primary" href="/creator/concepts/new">
                Create First Concept
              </Link>
            </div>
          ) : visibleConcepts.length === 0 ? (
            <div className="panel">
              <p className="muted">No concepts match “{query}”.</p>
            </div>
          ) : (
            <div className="stack">
              {visibleConcepts.map((concept) => (
                <article className="card" key={concept.id}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: 18,
                    }}
                  >
                    <div>
                      <h3 style={{ marginTop: 0 }}>{concept.name}</h3>
                      <p className="muted" style={{ marginBottom: 0 }}>
                        Status: {concept.status}
                        {[...concept.topicPaths].map((path) => (
                          <span key={path} style={{ display: 'block', marginTop: 5 }}>
                            {path}
                          </span>
                        ))}
                      </p>
                    </div>
                    <Link
                      className="btn ghost"
                      href={`/creator/concepts/${concept.id}`}
                    >
                      Edit
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
