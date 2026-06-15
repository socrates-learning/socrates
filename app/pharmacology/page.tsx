import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { supabase } from '@/lib/supabase';

type LibraryNode = {
  id: string;
  name: string;
  node_type: string | null;
  parent_id: string | null;
};

function renderNode(node: LibraryNode, allNodes: LibraryNode[]) {
  const children = allNodes.filter((child) => child.parent_id === node.id);

  return (
    <div className="card" key={node.id}>
      <strong>{node.name}</strong>
      <p className="muted">{node.node_type || 'node'}</p>

      {children.length > 0 && (
        <div className="sub">
          {children.map((child) => renderNode(child, allNodes))}
        </div>
      )}
    </div>
  );
}

export default async function PharmacologyLibrary() {
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
                {rootChildren.map((node) => renderNode(node, nodes))}
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