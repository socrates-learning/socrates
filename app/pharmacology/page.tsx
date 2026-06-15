import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { supabase } from '@/lib/supabase';

export default async function PharmacologyLibrary() {
  const { data: allNodes, error: nodesError } = await supabase
    .from('library_nodes')
    .select('id, name, node_type, parent_id')
    .order('name');

  const pharmacologyNode = allNodes?.find((node) => node.name === 'Pharmacology');

  const childNodes = pharmacologyNode
    ? allNodes?.filter((node) => node.parent_id === pharmacologyNode.id)
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

            {childNodes && childNodes.length > 0 ? (
              childNodes.map((node) => (
                <div className="card" key={node.id}>
                  <strong>{node.name}</strong>
                  <p className="muted">{node.node_type}</p>
                </div>
              ))
            ) : (
              <p className="muted">No child nodes found yet.</p>
            )}
          </div>
        </section>
      </main>
    </>
  );
}