'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type LibraryNode = {
  id: string;
  name: string;
  node_type: string | null;
  parent_id: string | null;
};

type Concept = {
  id: string;
  name: string;
  concept_type: string | null;
};

type Placement = {
  concept_id: string;
  library_node_id: string;
  concepts: Concept | Concept[] | null;
};

export function Sidebar({ activeId }: { activeId?: string }) {
  const [nodes, setNodes] = useState<LibraryNode[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);

  useEffect(() => {
    async function loadSidebar() {
      const { data: nodeData } = await supabase
        .from('library_nodes')
        .select('id, name, node_type, parent_id')
        .order('name');

      const { data: placementData } = await supabase
        .from('concept_placements')
        .select(`
          concept_id,
          library_node_id,
          concepts (
            id,
            name,
            concept_type
          )
        `)
        .order('sort_order');

      setNodes(nodeData || []);
      setPlacements((placementData || []) as unknown as Placement[]);
    }

    loadSidebar();
  }, []);

  function getConceptFromPlacement(placement: Placement): Concept | null {
    if (Array.isArray(placement.concepts)) {
      return placement.concepts[0] || null;
    }

    return placement.concepts || null;
  }

  function renderNode(node: LibraryNode) {
    const childNodes = nodes.filter((child) => child.parent_id === node.id);
    const nodePlacements = placements.filter(
      (placement) => placement.library_node_id === node.id
    );

    return (
      <div className="sub" key={node.id}>
        <strong>{node.name}</strong>

        {childNodes.map((child) => renderNode(child))}

        {nodePlacements.map((placement) => {
          const concept = getConceptFromPlacement(placement);

          if (!concept) return null;

          return (
            <Link
              key={`${node.id}-${placement.concept_id}`}
              className={`tree-item ${
                activeId === placement.concept_id ? 'active' : ''
              }`}
              href={`/concepts/${placement.concept_id}`}
            >
              {concept.name}
              <br />
              <small className="muted">
                {concept.concept_type || 'Concept'}
              </small>
            </Link>
          );
        })}
      </div>
    );
  }

  const pharmacologyNode = nodes.find((node) => node.name === 'Pharmacology');

  return (
    <aside className="panel sidebar">
      <h3>Knowledge Library</h3>

      {pharmacologyNode ? (
        <>
          <strong>{pharmacologyNode.name}</strong>
          {nodes
            .filter((node) => node.parent_id === pharmacologyNode.id)
            .map((node) => renderNode(node))}
        </>
      ) : (
        <p className="muted">Loading library...</p>
      )}
    </aside>
  );
}