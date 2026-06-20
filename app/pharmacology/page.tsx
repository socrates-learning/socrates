import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { createSupabaseServerClient } from '@/lib/supabase-server';

type LibraryNode = {
  id: string;
  name: string;
  node_type: string | null;
  parent_id: string | null;
};

type NodeProgress = {
  conceptCount: number;
  mastery: number;
};

function getDescendantNodeIds(nodeId: string, allNodes: LibraryNode[]) {
  const descendantIds = new Set([nodeId]);
  const pendingIds = [nodeId];

  while (pendingIds.length > 0) {
    const parentId = pendingIds.pop();

    for (const node of allNodes) {
      if (node.parent_id === parentId && !descendantIds.has(node.id)) {
        descendantIds.add(node.id);
        pendingIds.push(node.id);
      }
    }
  }

  return descendantIds;
}

function renderNode(
  node: LibraryNode,
  allNodes: LibraryNode[],
  progressByNode: Map<string, NodeProgress>
) {
  const children = allNodes.filter((child) => child.parent_id === node.id);
  const progress = progressByNode.get(node.id) || {
    conceptCount: 0,
    mastery: 0,
  };

  return (
    <div className="card" key={node.id}>
      <strong>{node.name}</strong>
      <p className="muted" style={{ marginBottom: 0 }}>
        {progress.conceptCount}{' '}
        {progress.conceptCount === 1 ? 'concept' : 'concepts'}
        <br />
        {progress.mastery}% mastered
      </p>
      <p className="muted">{node.node_type || 'node'}</p>

      {children.length > 0 && (
        <div className="sub">
          {children.map((child) =>
            renderNode(child, allNodes, progressByNode)
          )}
        </div>
      )}
    </div>
  );
}

export default async function PharmacologyLibrary() {
  const supabase = await createSupabaseServerClient();
  const { data: allNodes, error } = await supabase
    .from('library_nodes')
    .select('id, name, node_type, parent_id')
    .order('name');

  if (error) {
    return (
      <>
        <Header />
        <main className="layout">
          <Sidebar />
          <section className="panel">
            <h2>Pharmacology Library</h2>
            <p className="muted">Could not load library nodes.</p>
            <p className="muted">{error.message}</p>
          </section>
        </main>
      </>
    );
  }

  const nodes = allNodes || [];
  const pharmacologyNode = nodes.find((node) => node.name === 'Pharmacology');

  const rootChildren = pharmacologyNode
    ? nodes.filter((node) => node.parent_id === pharmacologyNode.id)
    : [];

  const pharmacologyNodeIds = pharmacologyNode
    ? getDescendantNodeIds(pharmacologyNode.id, nodes)
    : new Set<string>();
  const placementsResult =
    pharmacologyNodeIds.size > 0
      ? await supabase
          .from('concept_placements')
          .select('concept_id, library_node_id')
          .in('library_node_id', [...pharmacologyNodeIds])
      : { data: [], error: null };

  const conceptIds = [
    ...new Set(
      (placementsResult.data || []).map((placement) => placement.concept_id)
    ),
  ];
  const reviewAttemptsResult =
    conceptIds.length > 0
      ? await supabase
          .from('review_attempts')
          .select('concept_id, score')
          .in('concept_id', conceptIds)
          .not('score', 'is', null)
      : { data: [], error: null };

  if (placementsResult.error || reviewAttemptsResult.error) {
    return (
      <>
        <Header />
        <main className="layout">
          <Sidebar />
          <section className="panel">
            <h2>Pharmacology Library</h2>
            <p className="muted">Could not load library progress.</p>
            <p className="muted">
              {(placementsResult.error || reviewAttemptsResult.error)?.message}
            </p>
          </section>
        </main>
      </>
    );
  }

  const progressByNode = new Map<string, NodeProgress>();

  for (const node of nodes) {
    const descendantNodeIds = getDescendantNodeIds(node.id, nodes);
    const descendantConceptIds = new Set(
      (placementsResult.data || [])
        .filter((placement) =>
          descendantNodeIds.has(placement.library_node_id)
        )
        .map((placement) => placement.concept_id)
    );
    const scores = (reviewAttemptsResult.data || []).flatMap((attempt) =>
      attempt.concept_id &&
      descendantConceptIds.has(attempt.concept_id) &&
      attempt.score !== null
        ? [attempt.score]
        : []
    );

    progressByNode.set(node.id, {
      conceptCount: descendantConceptIds.size,
      mastery: scores.length
        ? Math.round(
            scores.reduce((total, score) => total + score * 25, 0) /
              scores.length
          )
        : 0,
    });
  }

  return (
    <>
      <Header />
      <main className="layout">
        <Sidebar />

        <section className="stack">
          <div className="panel">
            <h2>Pharmacology Library</h2>
            <p className="muted">
              A nested concept library where concepts can belong to multiple categories.
            </p>

            <hr />

            <h3>Pharmacology Structure</h3>

            {rootChildren.length > 0 ? (
              <div className="stack">
                {rootChildren.map((node) =>
                  renderNode(node, nodes, progressByNode)
                )}
              </div>
            ) : (
              <p className="muted">No child nodes found yet.</p>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
