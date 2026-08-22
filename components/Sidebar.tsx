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

type Placement = {
  concept_id: string;
  library_node_id: string;
};

export function Sidebar({
  activeId,
  activeLibrary,
}: {
  activeId?: string;
  activeLibrary?: { id: string; name: string } | null;
}) {
  const [nodes, setNodes] = useState<LibraryNode[]>([]);
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(Boolean(activeLibrary?.id));

  useEffect(() => {
    let isMounted = true;

    async function loadSidebar() {
      if (!activeLibrary?.id) {
        setNodes([]);
        setExpandedNodeIds(new Set());
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      const { data: nodeData } = await supabase
        .from('library_nodes')
        .select('id, name, node_type, parent_id')
        .eq('library_id', activeLibrary.id)
        .order('name');
      const loadedNodes = nodeData || [];
      const rootNode = loadedNodes.find((node) => node.parent_id === null);
      const initiallyExpanded = new Set<string>();

      if (rootNode) initiallyExpanded.add(rootNode.id);

      if (activeId) {
        const nodeIds = loadedNodes.map((node) => node.id);
        const { data: placementData } = nodeIds.length
          ? await supabase
              .from('concept_placements')
              .select('concept_id, library_node_id')
              .eq('concept_id', activeId)
              .in('library_node_id', nodeIds)
              .limit(1)
          : { data: [] };
        const activePlacement = (placementData || [])[0] as Placement | undefined;

        if (activePlacement) {
          const nodesById = new Map(loadedNodes.map((node) => [node.id, node]));
          let currentNode: LibraryNode | undefined = nodesById.get(
            activePlacement.library_node_id
          );

          while (currentNode) {
            initiallyExpanded.add(currentNode.id);
            currentNode = currentNode.parent_id
              ? nodesById.get(currentNode.parent_id)
              : undefined;
          }
        }
      }

      if (isMounted) {
        setNodes(loadedNodes);
        setExpandedNodeIds(initiallyExpanded);
        setIsLoading(false);
      }
    }

    loadSidebar();

    return () => {
      isMounted = false;
    };
  }, [activeId, activeLibrary?.id]);

  useEffect(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) return;

    const matchingNode = nodes.find((node) =>
      node.name.toLowerCase().includes(query)
    );

    if (!matchingNode) return;

    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const expandedPath: string[] = [matchingNode.id];
    let parentId = matchingNode.parent_id;

    while (parentId) {
      expandedPath.unshift(parentId);
      parentId = nodesById.get(parentId)?.parent_id || null;
    }

    setExpandedNodeIds(new Set(expandedPath));
  }, [searchQuery, nodes]);

  function nodeMatchesSearch(node: LibraryNode, visited = new Set<string>()): boolean {
    const query = searchQuery.trim().toLowerCase();

    if (!query) return true;
    if (visited.has(node.id)) return false;

    const nextVisited = new Set(visited).add(node.id);

    if (node.name.toLowerCase().includes(query)) return true;

    return nodes
      .filter((child) => child.parent_id === node.id)
      .some((child) => nodeMatchesSearch(child, nextVisited));
  }

  function toggleNode(nodeId: string) {
    setExpandedNodeIds((current) => {
      const next = new Set(current);

      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }

      return next;
    });
  }

  function renderNode(node: LibraryNode, ancestorMatchesSearch = false) {
    const query = searchQuery.trim().toLowerCase();
    const nodeNameMatches = Boolean(
      query && node.name.toLowerCase().includes(query)
    );
    const showEntireBranch = ancestorMatchesSearch || nodeNameMatches;

    if (query && !showEntireBranch && !nodeMatchesSearch(node)) return null;

    const childNodes = nodes.filter((child) => child.parent_id === node.id);
    const visibleChildNodes =
      query && !showEntireBranch
        ? childNodes.filter((child) => nodeMatchesSearch(child))
        : childNodes;
    const isExpanded = expandedNodeIds.has(node.id);

    return (
      <div className="library-node" key={node.id}>
        <button
          className="library-node-toggle"
          type="button"
          aria-expanded={isExpanded}
          onClick={() => toggleNode(node.id)}
        >
          <span aria-hidden="true">{isExpanded ? '-' : '+'}</span>
          {node.name}
        </button>

        {isExpanded && visibleChildNodes.length > 0 && (
          <div className="library-node-children">
            {visibleChildNodes.map((child) => renderNode(child, showEntireBranch))}
          </div>
        )}
      </div>
    );
  }

  const rootNodes = nodes.filter((node) => node.parent_id === null);
  const visibleRootNodes = searchQuery.trim()
    ? rootNodes.filter((node) => nodeMatchesSearch(node))
    : rootNodes;

  return (
    <aside className="panel sidebar">
      <p className="muted" style={{ marginTop: 0, textTransform: 'uppercase' }}>
        Current Subject
      </p>
      <h3>{activeLibrary?.name || 'Knowledge Library'}</h3>

      <div className="stack" style={{ marginBottom: 16 }}>
        <button className="btn primary" type="button" disabled>
          STUDY
        </button>
        <Link className="btn ghost" href="/#set-up-deck">
          Set Up Deck
        </Link>
      </div>

      <input
        className="library-search"
        type="search"
        aria-label="Search knowledge library topics"
        placeholder="Search topics"
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
      />

      {isLoading ? (
        <p className="muted">Loading library...</p>
      ) : !activeLibrary?.id ? (
        <p className="muted">No active library selected.</p>
      ) : rootNodes.length > 0 ? (
        visibleRootNodes.length > 0 ? (
          visibleRootNodes.map((node) => renderNode(node))
        ) : (
          <p className="muted">No matching topics found.</p>
        )
      ) : (
        <p className="muted">No library categories found yet.</p>
      )}
    </aside>
  );
}
