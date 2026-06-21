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
  status: string | null;
};

type Placement = {
  concept_id: string;
  library_node_id: string;
  concepts: Concept | Concept[] | null;
};

export function Sidebar({ activeId }: { activeId?: string }) {
  const [nodes, setNodes] = useState<LibraryNode[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(
    new Set()
  );
  const [searchQuery, setSearchQuery] = useState('');

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
          concepts!inner (
            id,
            name,
            concept_type,
            status
          )
        `)
        .neq('concepts.status', 'archived')
        .order('sort_order');

      const loadedNodes = nodeData || [];
      const loadedPlacements = (placementData || []) as unknown as Placement[];
      const initiallyExpanded = new Set<string>();
      const pharmacologyNode = loadedNodes.find(
        (node) => node.name === 'Pharmacology'
      );

      if (pharmacologyNode) initiallyExpanded.add(pharmacologyNode.id);

      setNodes(loadedNodes);
      setPlacements(loadedPlacements);
      setExpandedNodeIds(initiallyExpanded);
    }

    loadSidebar();
  }, [activeId]);

  useEffect(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) return;

    const matchingNode =
      nodes.find((node) => node.name.toLowerCase().includes(query)) ||
      nodes.find((node) =>
        placements.some((placement) => {
          if (placement.library_node_id !== node.id) return false;

          const concept = getConceptFromPlacement(placement);
          return concept ? conceptMatchesSearch(concept) : false;
        })
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
  }, [searchQuery, nodes, placements]);

  function getConceptFromPlacement(placement: Placement): Concept | null {
    if (Array.isArray(placement.concepts)) {
      return placement.concepts[0] || null;
    }

    return placement.concepts || null;
  }

  function conceptMatchesSearch(concept: Concept) {
    const query = searchQuery.trim().toLowerCase();

    return (
      concept.name.toLowerCase().includes(query) ||
      (concept.concept_type || '').toLowerCase().includes(query)
    );
  }

  function nodeMatchesSearch(
    node: LibraryNode,
    visited = new Set<string>()
  ): boolean {
    const query = searchQuery.trim().toLowerCase();

    if (!query) return true;
    if (visited.has(node.id)) return false;

    const nextVisited = new Set(visited).add(node.id);

    if (node.name.toLowerCase().includes(query)) return true;

    const hasMatchingConcept = placements.some((placement) => {
      if (placement.library_node_id !== node.id) return false;

      const concept = getConceptFromPlacement(placement);
      return concept ? conceptMatchesSearch(concept) : false;
    });

    if (hasMatchingConcept) return true;

    return nodes
      .filter((child) => child.parent_id === node.id)
      .some((child) => nodeMatchesSearch(child, nextVisited));
  }

  function toggleNode(nodeId: string) {
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const ancestorIds: string[] = [];
    let parentId = nodesById.get(nodeId)?.parent_id;

    while (parentId) {
      ancestorIds.unshift(parentId);
      parentId = nodesById.get(parentId)?.parent_id || null;
    }

    setExpandedNodeIds((current) => {
      return current.has(nodeId)
        ? new Set(ancestorIds)
        : new Set([...ancestorIds, nodeId]);
    });
  }

  function collapseNode(nodeId: string) {
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const ancestorIds: string[] = [];
    let parentId = nodesById.get(nodeId)?.parent_id;

    while (parentId) {
      ancestorIds.unshift(parentId);
      parentId = nodesById.get(parentId)?.parent_id || null;
    }

    setExpandedNodeIds(new Set(ancestorIds));
  }

  function renderNode(node: LibraryNode, ancestorMatchesSearch = false) {
    const query = searchQuery.trim().toLowerCase();
    const nodeNameMatches = Boolean(
      query && node.name.toLowerCase().includes(query)
    );
    const showEntireBranch = ancestorMatchesSearch || nodeNameMatches;

    if (query && !showEntireBranch && !nodeMatchesSearch(node)) return null;

    const childNodes = nodes.filter((child) => child.parent_id === node.id);
    const nodePlacements = placements.filter(
      (placement) => placement.library_node_id === node.id
    );
    const visibleChildNodes = query && !showEntireBranch
      ? childNodes.filter((child) => nodeMatchesSearch(child))
      : childNodes;
    const visiblePlacements = query && !showEntireBranch
      ? nodePlacements.filter((placement) => {
          const concept = getConceptFromPlacement(placement);
          return concept ? conceptMatchesSearch(concept) : false;
        })
      : nodePlacements;
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

        {isExpanded && (
          <div className="library-node-children">
            {visibleChildNodes.map((child) =>
              renderNode(child, showEntireBranch)
            )}

            {visiblePlacements.map((placement) => {
              const concept = getConceptFromPlacement(placement);

              if (!concept) return null;

              return (
                <Link
                  key={`${node.id}-${placement.concept_id}`}
                  className={`tree-item ${
                    activeId === placement.concept_id ? 'active' : ''
                  }`}
                  href={`/concepts/${placement.concept_id}`}
                  onClick={() => collapseNode(node.id)}
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
      <h3>Knowledge Library</h3>

      <input
        className="library-search"
        type="search"
        aria-label="Search knowledge library"
        placeholder="Search concepts"
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
      />

      {rootNodes.length > 0 ? (
        visibleRootNodes.length > 0 ? (
          visibleRootNodes.map((node) => renderNode(node))
        ) : (
          <p className="muted">No matching concepts found.</p>
        )
      ) : (
        <p className="muted">Loading library...</p>
      )}
    </aside>
  );
}
