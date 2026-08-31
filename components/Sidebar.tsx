'use client';

import { useEffect, useState } from 'react';
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
  const [isDeckSetupOpen, setIsDeckSetupOpen] = useState(false);

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
  function syncDeckSetupState() {
    setIsDeckSetupOpen(window.location.hash === '#set-up-deck');
  }

  function markFocusedModeOpen() {
    setIsDeckSetupOpen(true);
  }

  function markDashboardOpen() {
    setIsDeckSetupOpen(false);
  }

  syncDeckSetupState();

  window.addEventListener('hashchange', syncDeckSetupState);
  window.addEventListener('socrates-open-deck-setup', markFocusedModeOpen);
  window.addEventListener('socrates-open-deck-dashboard', markDashboardOpen);

  return () => {
    window.removeEventListener('hashchange', syncDeckSetupState);
    window.removeEventListener('socrates-open-deck-setup', markFocusedModeOpen);
    window.removeEventListener('socrates-open-deck-dashboard', markDashboardOpen);
  };
}, []);

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

  function openDeckSetup() {
    window.location.hash = 'set-up-deck';
    window.dispatchEvent(new Event('socrates-open-deck-setup'));
  }

  if (!activeId && isDeckSetupOpen) {
    return null;
  }

  if (!activeId) {
  const navItemStyle = {
    alignItems: 'center',
    background: 'transparent',
    border: 'none',
    borderRadius: 12,
    color: 'white',
    display: 'flex',
    fontSize: 16,
    fontWeight: 600,
    gap: 14,
    padding: '13px 12px',
    textAlign: 'left' as const,
    width: '100%',
  };

  const iconStyle = {
    flexShrink: 0,
    height: 24,
    width: 24,
  };

  return (
    <aside
      style={{
        background: 'linear-gradient(180deg, #063b67 0%, #052f56 100%)',
        borderRadius: 18,
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 720,
        padding: '24px 18px',
        boxShadow: '0 12px 30px rgba(15, 23, 42, 0.18)',
      }}
    >
      {/* Current Subject */}
      <div style={{ marginBottom: 28 }}>
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            margin: '0 0 10px',
            opacity: 0.75,
            textTransform: 'uppercase',
          }}
        >
          Current Subject
        </p>

        <div
          style={{
            alignItems: 'center',
            display: 'flex',
            gap: 12,
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={iconStyle}
            aria-hidden="true"
          >
            <path d="M12 3 3 8l9 5 9-5-9-5Z" />
            <path d="m3 12 9 5 9-5" />
            <path d="m3 16 9 5 9-5" />
          </svg>

          <strong style={{ flex: 1, fontSize: 20 }}>
            {activeLibrary?.name || 'Knowledge Library'}
          </strong>

          <span style={{ fontSize: 18 }}>⌄</span>
        </div>
      </div>

      {/* Main STUDY button */}
      <button
        type="button"
        onClick={openDeckSetup}
        style={{
          alignItems: 'center',
          background: 'linear-gradient(135deg, #2563eb, #4f46e5)',
          border: '2px solid #60a5fa',
          borderRadius: 14,
          boxShadow: '0 6px 16px rgba(37, 99, 235, 0.35)',
          color: 'white',
          display: 'flex',
          fontSize: 20,
          fontWeight: 700,
          gap: 14,
          justifyContent: 'center',
          marginBottom: 18,
          minHeight: 64,
          width: '100%',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          style={{ height: 28, width: 28 }}
          aria-hidden="true"
        >
          <path d="M8 5v14l11-7L8 5Z" />
        </svg>
        STUDY
      </button>

      {/* Main navigation */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <button type="button" onClick={openDeckSetup} style={navItemStyle}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={iconStyle}
            aria-hidden="true"
          >
            <path d="M4 6h16" />
            <circle cx="9" cy="6" r="2" />
            <path d="M4 12h16" />
            <circle cx="15" cy="12" r="2" />
            <path d="M4 18h16" />
            <circle cx="7" cy="18" r="2" />
          </svg>
          Set Up Deck
        </button>

        <button type="button" disabled style={{ ...navItemStyle, opacity: 0.65 }}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={iconStyle}
            aria-hidden="true"
          >
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <path d="M12 8v8M8 12h8" />
          </svg>
          Make Cards
        </button>

        <button type="button" disabled style={{ ...navItemStyle, opacity: 0.65 }}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={iconStyle}
            aria-hidden="true"
          >
            <path d="M5 20V10" />
            <path d="M10 20V4" />
            <path d="M15 20v-7" />
            <path d="M20 20V7" />
          </svg>
          Stats
        </button>

        <button type="button" disabled style={{ ...navItemStyle, opacity: 0.65 }}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={iconStyle}
            aria-hidden="true"
          >
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
          Menu
        </button>
      </div>

      {/* Bottom account navigation */}
      <div
        style={{
          borderTop: '1px solid rgba(255,255,255,0.25)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          marginTop: 'auto',
          paddingTop: 20,
        }}
      >
        <button type="button" disabled style={{ ...navItemStyle, opacity: 0.75 }}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={iconStyle}
            aria-hidden="true"
          >
            <circle cx="12" cy="8" r="4" />
            <path d="M5 21c0-4 3-7 7-7s7 3 7 7" />
          </svg>
          Account
        </button>

        <button type="button" disabled style={{ ...navItemStyle, opacity: 0.75 }}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={iconStyle}
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.06.06-2.83 2.83-.06-.06A1.8 1.8 0 0 0 15 19.4a1.8 1.8 0 0 0-1 .6 1.8 1.8 0 0 0-.42 1.16V21h-4v-.09A1.8 1.8 0 0 0 8.6 19.4a1.8 1.8 0 0 0-1.98.36l-.06.06-2.83-2.83.06-.06A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-.6-1 1.8 1.8 0 0 0-1.16-.42H3v-4h.09A1.8 1.8 0 0 0 4.6 8.6a1.8 1.8 0 0 0-.36-1.98l-.06-.06 2.83-2.83.06.06A1.8 1.8 0 0 0 9 4.6a1.8 1.8 0 0 0 1-.6A1.8 1.8 0 0 0 10.42 3H14v.09A1.8 1.8 0 0 0 15 4.6a1.8 1.8 0 0 0 1.98-.36l.06-.06 2.83 2.83-.06.06A1.8 1.8 0 0 0 19.4 9c.34.3.72.5 1.16.58H21v4h-.09A1.8 1.8 0 0 0 19.4 15Z" />
          </svg>
          Settings
        </button>

        <button
          type="button"
          style={navItemStyle}
          onClick={async () => {
            try {
              await fetch('/library/clear', { method: 'POST' });
            } finally {
              await supabase.auth.signOut();
              window.location.href = '/login';
            }
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={iconStyle}
            aria-hidden="true"
          >
            <path d="M10 17l5-5-5-5" />
            <path d="M15 12H3" />
            <path d="M14 4h6v16h-6" />
          </svg>
          Log out
        </button>
      </div>
    </aside>
  );
}

  return (
    <aside className="panel sidebar">
      <p className="muted" style={{ marginTop: 0, textTransform: 'uppercase' }}>
        Current Subject
      </p>
      <h3>{activeLibrary?.name || 'Knowledge Library'}</h3>

      <div className="stack" style={{ marginBottom: 16 }}>
        <button className="btn primary" type="button" onClick={openDeckSetup}>
          STUDY
        </button>
        <button className="btn ghost" type="button" onClick={openDeckSetup}>
          Set Up Deck
        </button>
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
