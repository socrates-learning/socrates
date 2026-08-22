'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { ActiveLibrary } from '@/lib/library-context';
import type { ReactNode } from 'react';

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
  summary: string | null;
};

type Placement = {
  concept_id: string;
  library_node_id: string;
  concepts: Concept | Concept[] | null;
};

type StudyDeck = {
  id: string;
  user_id: string;
  library_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type StudyDeckConcept = {
  concept_id: string;
  concept_name: string;
  concept_type: string | null;
  summary: string | null;
  published_question_count: number;
  selection_source: string;
};

type ConceptOverride = 'included' | 'excluded';
type PlannerMode = 'dashboard' | 'setup' | 'study' | 'feedback';

function getConceptFromPlacement(placement: Placement) {
  return Array.isArray(placement.concepts)
    ? placement.concepts[0] || null
    : placement.concepts;
}

function getNodePath(node: LibraryNode, nodesById: Map<string, LibraryNode>) {
  const names = [node.name];
  const visited = new Set([node.id]);
  let parentId = node.parent_id;

  while (parentId) {
    const parent = nodesById.get(parentId);

    if (!parent || visited.has(parent.id)) break;

    names.unshift(parent.name);
    visited.add(parent.id);
    parentId = parent.parent_id;
  }

  return names.join(' / ');
}

export function StudyPlanner({
  activeLibrary,
}: {
  activeLibrary: ActiveLibrary | null;
}) {
  const [mode, setMode] = useState<PlannerMode>('dashboard');
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('there');
  const [deck, setDeck] = useState<StudyDeck | null>(null);
  const [nodes, setNodes] = useState<LibraryNode[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>({});
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [conceptOverrides, setConceptOverrides] = useState<
    Record<string, ConceptOverride>
  >({});
  const [resolvedConcepts, setResolvedConcepts] = useState<StudyDeckConcept[]>([]);
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set());
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(Boolean(activeLibrary?.id));
  const [isSaving, setIsSaving] = useState(false);

  const nodesById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes]
  );

  useEffect(() => {
    let isMounted = true;

    async function loadDeck() {
      if (!activeLibrary?.id) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setMessage('');
      setMode('dashboard');

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setUserId(null);
        setMessage('Sign in to set up your deck.');
        setIsLoading(false);
        return;
      }

      const { data: deckData, error: deckError } = await supabase.rpc(
        'get_or_create_active_study_deck',
        { p_library_id: activeLibrary.id }
      );

      if (deckError || !deckData) {
        setMessage(
          `Unable to load your deck: ${deckError?.message || 'No active deck found.'}`
        );
        setIsLoading(false);
        return;
      }

      const activeDeck = deckData as StudyDeck;
      const { data: nodeData, error: nodeError } = await supabase
        .from('library_nodes')
        .select('id, name, node_type, parent_id')
        .eq('library_id', activeLibrary.id)
        .order('name');

      if (nodeError) {
        setMessage(`Unable to load topics: ${nodeError.message}`);
        setIsLoading(false);
        return;
      }

      const loadedNodes = (nodeData || []) as LibraryNode[];
      const nodeIds = loadedNodes.map((node) => node.id);
      const { data: placementData, error: placementError } = nodeIds.length
        ? await supabase
            .from('concept_placements')
            .select(
              `
              concept_id,
              library_node_id,
              concepts!inner (
                id,
                name,
                concept_type,
                summary,
                status
              )
            `
            )
            .eq('concepts.status', 'published')
            .in('library_node_id', nodeIds)
        : { data: [], error: null };

      if (placementError) {
        setMessage(`Unable to load deck concepts: ${placementError.message}`);
        setIsLoading(false);
        return;
      }

      const loadedPlacements = (placementData || []) as unknown as Placement[];
      const conceptIds = [
        ...new Set(loadedPlacements.map((placement) => placement.concept_id)),
      ];
      const { data: questionData } = conceptIds.length
        ? await supabase
            .from('questions')
            .select('concept_id')
            .eq('status', 'published')
            .in('concept_id', conceptIds)
        : { data: [] };
      const nextQuestionCounts: Record<string, number> = {};

      (questionData || []).forEach((question) => {
        if (!question.concept_id) return;
        nextQuestionCounts[question.concept_id] =
          (nextQuestionCounts[question.concept_id] || 0) + 1;
      });

      const { data: selectedNodesData } = await supabase
        .from('user_study_node_selections')
        .select('node_id')
        .eq('deck_id', activeDeck.id);
      const { data: overridesData } = await supabase
        .from('user_study_concept_overrides')
        .select('concept_id, selection_state')
        .eq('deck_id', activeDeck.id);
      const { data: resolvedData } = await supabase.rpc('resolve_study_deck', {
        p_deck_id: activeDeck.id,
      });

      if (!isMounted) return;

      const rootNode = loadedNodes.find((node) => node.parent_id === null);

      setUserId(user.id);
      setDisplayName(
        (user.user_metadata?.full_name as string | undefined) ||
          (user.email ? user.email.split('@')[0] : 'there')
      );
      setDeck(activeDeck);
      setNodes(loadedNodes);
      setPlacements(loadedPlacements);
      setQuestionCounts(nextQuestionCounts);
      setSelectedNodeIds(
        new Set((selectedNodesData || []).map((selection) => selection.node_id))
      );
      setConceptOverrides(
        Object.fromEntries(
          (overridesData || []).map((override) => [
            override.concept_id,
            override.selection_state as ConceptOverride,
          ])
        )
      );
      setResolvedConcepts((resolvedData || []) as StudyDeckConcept[]);
      setExpandedNodeIds(rootNode ? new Set([rootNode.id]) : new Set());
      setFocusedNodeId(rootNode?.id || null);
      setIsLoading(false);
    }

    loadDeck();

    return () => {
      isMounted = false;
    };
  }, [activeLibrary?.id]);

  useEffect(() => {
    function openSetupFromHash() {
      if (window.location.hash === '#set-up-deck') {
        setMode('setup');
      }
    }

    function openDashboard() {
      setMode('dashboard');
    }

    openSetupFromHash();
    window.addEventListener('hashchange', openSetupFromHash);
    window.addEventListener('socrates-open-deck-setup', openSetupFromHash);
    window.addEventListener('socrates-open-deck-dashboard', openDashboard);

    return () => {
      window.removeEventListener('hashchange', openSetupFromHash);
      window.removeEventListener('socrates-open-deck-setup', openSetupFromHash);
      window.removeEventListener('socrates-open-deck-dashboard', openDashboard);
    };
  }, []);

  useEffect(() => {
  const layout = document.querySelector<HTMLElement>('main.layout');

  if (!layout) return;

  if (mode === 'setup' || mode === 'study' || mode === 'feedback') {
    // Page 2 and Page 3 use the focused full-width layout.
    layout.style.gridTemplateColumns = '1fr';

    if (mode === 'setup') {
      window.history.replaceState(null, '', '#set-up-deck');
    } else if (window.location.hash === '#set-up-deck') {
      window.history.replaceState(null, '', window.location.pathname);
    }

    window.dispatchEvent(new Event('socrates-open-deck-setup'));
  } else {
    // Page 1 returns to the normal dashboard layout.
    layout.style.gridTemplateColumns = '';

    if (window.location.hash === '#set-up-deck') {
      window.history.replaceState(null, '', window.location.pathname);
    }

    window.dispatchEvent(new Event('socrates-open-deck-dashboard'));
  }
}, [mode]);

  function openSetupMode() {
    setMode('setup');
  }

  function openStudyMode() {
  setMode('study');
}

  function descendantNodeIds(nodeId: string) {
    const ids = new Set<string>([nodeId]);
    const queue = [nodeId];

    while (queue.length) {
      const currentId = queue.shift();
      const children = nodes.filter((node) => node.parent_id === currentId);

      children.forEach((child) => {
        if (!ids.has(child.id)) {
          ids.add(child.id);
          queue.push(child.id);
        }
      });
    }

    return ids;
  }

  function branchConceptIds(nodeId: string) {
    const descendantIds = descendantNodeIds(nodeId);
    return [
      ...new Set(
        placements
          .filter((placement) => descendantIds.has(placement.library_node_id))
          .map((placement) => placement.concept_id)
      ),
    ];
  }

  function branchQuestionCount(nodeId: string) {
    return branchConceptIds(nodeId).reduce(
      (total, conceptId) => total + (questionCounts[conceptId] || 0),
      0
    );
  }

  function directConceptsForNode(nodeId: string) {
    return placements
      .filter((placement) => placement.library_node_id === nodeId)
      .flatMap((placement) => {
        const concept = getConceptFromPlacement(placement);
        return concept ? [concept] : [];
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function isConceptSelectedByBranch(conceptId: string) {
    return [...selectedNodeIds].some((nodeId) =>
      branchConceptIds(nodeId).includes(conceptId)
    );
  }

  function effectiveConceptSelected(conceptId: string) {
    const override = conceptOverrides[conceptId];

    if (override === 'included') return true;
    if (override === 'excluded') return false;

    return isConceptSelectedByBranch(conceptId);
  }

  async function refreshResolvedDeck(deckId = deck?.id) {
    if (!deckId) return;

    const { data, error } = await supabase.rpc('resolve_study_deck', {
      p_deck_id: deckId,
    });

    if (error) {
      setMessage(`Deck saved, but summary could not refresh: ${error.message}`);
      return;
    }

    setResolvedConcepts((data || []) as StudyDeckConcept[]);
  }

  async function toggleNodeSelection(nodeId: string) {
    if (!activeLibrary?.id || !deck || !userId) return;

    const isSelected = selectedNodeIds.has(nodeId);
    setIsSaving(true);
    setMessage(isSelected ? 'Removing topic from deck...' : 'Adding topic to deck...');

    if (isSelected) {
      const { error } = await supabase
        .from('user_study_node_selections')
        .delete()
        .eq('deck_id', deck.id)
        .eq('node_id', nodeId);

      if (error) {
        setMessage(`Unable to update deck: ${error.message}`);
        setIsSaving(false);
        return;
      }

      setSelectedNodeIds((current) => {
        const next = new Set(current);
        next.delete(nodeId);
        return next;
      });
    } else {
      const { error } = await supabase.from('user_study_node_selections').insert({
        deck_id: deck.id,
        user_id: userId,
        library_id: activeLibrary.id,
        node_id: nodeId,
      });

      if (error) {
        setMessage(`Unable to update deck: ${error.message}`);
        setIsSaving(false);
        return;
      }

      setSelectedNodeIds((current) => new Set(current).add(nodeId));
    }

    setMessage('Deck updated.');
    await refreshResolvedDeck();
    setIsSaving(false);
  }

  async function setConceptSelection(conceptId: string, shouldSelect: boolean) {
    if (!activeLibrary?.id || !deck || !userId) return;

    const selectedByBranch = isConceptSelectedByBranch(conceptId);
    const nextState: ConceptOverride | null = shouldSelect
      ? selectedByBranch
        ? null
        : 'included'
      : selectedByBranch
        ? 'excluded'
        : null;

    setIsSaving(true);
    setMessage('Saving concept selection...');

    if (!nextState) {
      const { error } = await supabase
        .from('user_study_concept_overrides')
        .delete()
        .eq('deck_id', deck.id)
        .eq('concept_id', conceptId);

      if (error) {
        setMessage(`Unable to update concept selection: ${error.message}`);
        setIsSaving(false);
        return;
      }

      setConceptOverrides((current) => {
        const next = { ...current };
        delete next[conceptId];
        return next;
      });
    } else {
      const { error } = await supabase.from('user_study_concept_overrides').upsert(
        {
          deck_id: deck.id,
          user_id: userId,
          library_id: activeLibrary.id,
          concept_id: conceptId,
          selection_state: nextState,
        },
        { onConflict: 'deck_id,concept_id' }
      );

      if (error) {
        setMessage(`Unable to update concept selection: ${error.message}`);
        setIsSaving(false);
        return;
      }

      setConceptOverrides((current) => ({
        ...current,
        [conceptId]: nextState,
      }));
    }

    setMessage('Deck updated.');
    await refreshResolvedDeck();
    setIsSaving(false);
  }

  async function saveAndReturnToDashboard() {
    setIsSaving(true);
    await refreshResolvedDeck();
    setIsSaving(false);
    setMode('dashboard');
    setMessage('Deck saved.');
  }

  async function clearDeck() {
    if (!deck) return;

    setIsSaving(true);
    setMessage('Clearing deck...');

    const { error: nodeError } = await supabase
      .from('user_study_node_selections')
      .delete()
      .eq('deck_id', deck.id);
    const { error: overrideError } = await supabase
      .from('user_study_concept_overrides')
      .delete()
      .eq('deck_id', deck.id);

    if (nodeError || overrideError) {
      setMessage(
        `Unable to clear deck: ${nodeError?.message || overrideError?.message}`
      );
      setIsSaving(false);
      return;
    }

    setSelectedNodeIds(new Set());
    setConceptOverrides({});
    await refreshResolvedDeck();
    setMessage('Deck cleared.');
    setIsSaving(false);
  }

  function toggleExpandedNode(nodeId: string) {
    setExpandedNodeIds((current) => {
      const next = new Set(current);

      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }

      return next;
    });
    setFocusedNodeId(nodeId);
  }

  function renderNode(node: LibraryNode, depth = 0): ReactNode {
  const children = nodes.filter((child) => child.parent_id === node.id);
  const isExpanded = expandedNodeIds.has(node.id);
  const branchConceptCount = branchConceptIds(node.id).length;
  const selected = selectedNodeIds.has(node.id);

  return (
    <div
      key={node.id}
      style={{
        marginLeft: depth ? 22 : 0,
        position: 'relative',
      }}
    >
      {depth > 0 && (
        <div
          aria-hidden="true"
          style={{
            borderLeft: '2px solid #dbeafe',
            bottom: 0,
            left: -12,
            position: 'absolute',
            top: -10,
          }}
        />
      )}

      <div
        style={{
          alignItems: 'center',
          background: selected ? '#eff6ff' : '#ffffff',
          border: selected ? '1px solid #93c5fd' : '1px solid #e2e8f0',
          borderRadius: 14,
          display: 'flex',
          gap: 10,
          marginBottom: 8,
          minHeight: 62,
          padding: '10px 12px',
          transition: 'all 0.15s ease',
        }}
      >
        <button
          type="button"
          onClick={() => toggleExpandedNode(node.id)}
          disabled={children.length === 0}
          aria-label={isExpanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
          style={{
            alignItems: 'center',
            background: children.length === 0 ? '#f8fafc' : '#e0f2fe',
            border: 'none',
            borderRadius: 10,
            color: '#0369a1',
            cursor: children.length === 0 ? 'default' : 'pointer',
            display: 'flex',
            flexShrink: 0,
            fontSize: 13,
            height: 34,
            justifyContent: 'center',
            width: 34,
          }}
        >
          {children.length === 0 ? '•' : isExpanded ? '▼' : '▶'}
        </button>

        <label
          style={{
            alignItems: 'center',
            cursor: 'pointer',
            display: 'flex',
            flex: 1,
            gap: 10,
            minWidth: 0,
          }}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={() => toggleNodeSelection(node.id)}
            style={{
              accentColor: '#2563eb',
              cursor: 'pointer',
              height: 18,
              width: 18,
            }}
          />

          <span style={{ minWidth: 0 }}>
            <strong
              style={{
                display: 'block',
                fontSize: 15,
                lineHeight: 1.2,
              }}
            >
              {node.name}
            </strong>

            <span
              className="muted"
              style={{
                fontSize: 12,
              }}
            >
              {branchConceptCount}{' '}
              {branchConceptCount === 1 ? 'concept' : 'concepts'}
            </span>
          </span>
        </label>

        <span
          title="Published questions in this branch"
          style={{
            background: '#f8fafc',
            border: '1px solid #dbe3ee',
            borderRadius: 999,
            color: '#475569',
            flexShrink: 0,
            fontSize: 12,
            fontWeight: 700,
            minWidth: 40,
            padding: '5px 9px',
            textAlign: 'center',
          }}
        >
          {branchQuestionCount(node.id)}
        </span>

        <button
          type="button"
          onClick={() => setFocusedNodeId(node.id)}
          style={{
            background: '#f1f5f9',
            border: '1px solid #dbe3ee',
            borderRadius: 9,
            color: '#334155',
            cursor: 'pointer',
            flexShrink: 0,
            fontSize: 12,
            fontWeight: 600,
            padding: '7px 10px',
          }}
        >
          Customize
        </button>
      </div>

      {isExpanded && children.length > 0 && (
        <div
          style={{
            marginTop: 4,
          }}
        >
          {children.map((child) => renderNode(child, depth + 1))}
        </div>
      )}
    </div>
  );
}

  const rootNodes = nodes.filter((node) => node.parent_id === null);
  const focusedNode = focusedNodeId ? nodesById.get(focusedNodeId) : null;
  const focusedConcepts = focusedNode ? directConceptsForNode(focusedNode.id) : [];
  const selectedNodeSummaries = [...selectedNodeIds].flatMap((nodeId) => {
    const node = nodesById.get(nodeId);
    if (!node) return [];

    const conceptIds = branchConceptIds(nodeId).filter(
      (conceptId) => conceptOverrides[conceptId] !== 'excluded'
    );

    const questionTotal = conceptIds.reduce(
      (total, conceptId) => total + (questionCounts[conceptId] || 0),
      0
    );

    return [
      {
        id: node.id,
        label: getNodePath(node, nodesById),
        conceptCount: conceptIds.length,
        questionTotal,
      },
    ];
  });
  const totalQuestions = resolvedConcepts.reduce(
    (total, concept) => total + Number(concept.published_question_count || 0),
    0
  );

  if (!activeLibrary?.id) {
    return (
      <div className="panel">
        <h2>Deck Dashboard</h2>
        <p className="muted">Choose an active library before setting up a deck.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="panel">
        <h2>Deck Dashboard</h2>
        <p className="muted">Loading your deck...</p>
      </div>
    );
  }

  if (!deck) {
    return (
      <div className="panel">
        <h2>Deck Dashboard</h2>
        <p className="muted">{message || 'Unable to load your active deck.'}</p>
      </div>
    );
  }

  if (mode === 'setup') {
  return (
    <div
      id="set-up-deck"
      style={{
        margin: '0 auto',
        maxWidth: 1180,
        width: '100%',
      }}
    >
      {/* Page heading */}
      <section
        style={{
          background: '#ffffff',
          border: '1px solid #dbe3ee',
          borderRadius: 18,
          boxShadow: '0 10px 30px rgba(15, 23, 42, 0.07)',
          marginBottom: 18,
          padding: '24px 28px',
        }}
      >
        <p
          style={{
            color: '#64748b',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.08em',
            margin: '0 0 6px',
            textTransform: 'uppercase',
          }}
        >
          Study Setup
        </p>

        <h1 style={{ margin: '0 0 6px' }}>Set Up Deck</h1>

        <p className="muted" style={{ margin: 0 }}>
          Choose what you want to study and how you want this session to behave.
        </p>
      </section>

      {/* New ↔ Mastery balance */}
      <section
        style={{
          background: '#ffffff',
          border: '1px solid #dbe3ee',
          borderRadius: 18,
          boxShadow: '0 10px 30px rgba(15, 23, 42, 0.07)',
          marginBottom: 18,
          padding: 26,
        }}
      >
        <div
          style={{
            alignItems: 'flex-start',
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 22,
          }}
        >
          <div>
            <h2 style={{ margin: '0 0 5px' }}>Content Balance</h2>
            <p className="muted" style={{ margin: 0 }}>
              Choose whether this session emphasizes new material or repetition for mastery.
            </p>
          </div>
        </div>

        <div
          style={{
            margin: '0 auto',
            maxWidth: 820,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 10,
            }}
          >
            <div>
              <strong>More New Content</strong>
              <p className="muted" style={{ fontSize: 13, margin: '3px 0 0' }}>
                Introduce more material
              </p>
            </div>

            <div style={{ textAlign: 'right' }}>
              <strong>More Repetition</strong>
              <p className="muted" style={{ fontSize: 13, margin: '3px 0 0' }}>
                Reinforce for mastery
              </p>
            </div>
          </div>

          <input
            aria-label="New content versus mastery balance"
            type="range"
            min="0"
            max="100"
            defaultValue="50"
            style={{
              accentColor: '#2563eb',
              cursor: 'pointer',
              width: '100%',
            }}
          />

          <div
            style={{
              color: '#64748b',
              display: 'flex',
              fontSize: 13,
              fontWeight: 700,
              justifyContent: 'space-between',
              marginTop: 4,
            }}
          >
            <span>NEW</span>
            <span>BALANCED</span>
            <span>MASTERY</span>
          </div>

          <p
            className="muted"
            style={{
              fontSize: 12,
              margin: '12px 0 0',
              textAlign: 'center',
            }}
          >
            Session balance is a design preview for now. Adaptive scheduling will use it later.
          </p>
        </div>
      </section>

      {/* Topic selection */}
      <section
        style={{
          background: '#ffffff',
          border: '1px solid #dbe3ee',
          borderRadius: 18,
          boxShadow: '0 10px 30px rgba(15, 23, 42, 0.07)',
          marginBottom: 18,
          padding: 26,
        }}
      >
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ margin: '0 0 5px' }}>Select What to Study</h2>
          <p className="muted" style={{ margin: 0 }}>
            Build your deck from meaningful topic branches.
          </p>
        </div>

        <div
          style={{
            alignItems: 'start',
            display: 'grid',
            gap: 20,
            gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 0.8fr)',
          }}
        >
          {/* Knowledge tree */}
          <div
            style={{
              border: '1px solid #dbe3ee',
              borderRadius: 16,
              minWidth: 0,
              padding: 18,
            }}
          >
            <div
              style={{
                alignItems: 'center',
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 14,
              }}
            >
              <h3 style={{ margin: 0 }}>Knowledge Tree</h3>

              <span
                style={{
                  background: '#eff6ff',
                  borderRadius: 999,
                  color: '#1d4ed8',
                  fontSize: 12,
                  fontWeight: 700,
                  padding: '5px 10px',
                }}
              >
                {activeLibrary.name}
              </span>
            </div>

            {rootNodes.length === 0 ? (
              <p className="muted">
                No topics are available in this library yet.
              </p>
            ) : (
              <div className="stack">
                {rootNodes.map((node) => renderNode(node))}
              </div>
            )}
          </div>

          {/* Selected summary */}
          <aside
            style={{
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: 16,
              padding: 20,
              position: 'sticky',
              top: 18,
            }}
          >
            <h3 style={{ margin: '0 0 14px' }}>Selected Deck</h3>

            {selectedNodeSummaries.length === 0 ? (
              <p className="muted">
                No topic branches selected yet.
              </p>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                {selectedNodeSummaries.map((selection) => (
                  <div
                    key={selection.id}
                    style={{
                      borderBottom: '1px solid #e2e8f0',
                      paddingBottom: 10,
                    }}
                  >
                    <strong
                      style={{
                        display: 'block',
                        fontSize: 14,
                        marginBottom: 3,
                      }}
                    >
                      {selection.label}
                    </strong>

                    <span className="muted" style={{ fontSize: 12 }}>
                      {selection.conceptCount} concepts ·{' '}
                      {selection.questionTotal} questions
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div
              style={{
                borderTop: '1px solid #cbd5e1',
                marginTop: 18,
                paddingTop: 18,
              }}
            >
              <div style={{ marginBottom: 14 }}>
                <span className="muted" style={{ fontSize: 12 }}>
                  Concepts selected
                </span>
                <br />
                <strong style={{ fontSize: 28 }}>
                  {resolvedConcepts.length}
                </strong>
              </div>

              <div>
                <span className="muted" style={{ fontSize: 12 }}>
                  Questions available
                </span>
                <br />
                <strong
                  style={{
                    color: '#1d4ed8',
                    fontSize: 36,
                  }}
                >
                  {totalQuestions}
                </strong>
              </div>
            </div>
          </aside>
        </div>
      </section>

      {/* Parent selection explanation */}
      <section
        style={{
          alignItems: 'flex-start',
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: 16,
          display: 'flex',
          gap: 14,
          marginBottom: 18,
          padding: '18px 20px',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            alignItems: 'center',
            background: '#ffffff',
            borderRadius: 999,
            color: '#2563eb',
            display: 'flex',
            flexShrink: 0,
            fontSize: 18,
            fontWeight: 700,
            height: 34,
            justifyContent: 'center',
            width: 34,
          }}
        >
          i
        </div>

        <div>
          <strong>Selecting a parent includes all children.</strong>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Build your deck from topic branches. You can customize individual concepts when needed.
          </p>
        </div>
      </section>

      {/* Individual concept customization */}
      <section
        style={{
          background: '#ffffff',
          border: '1px solid #dbe3ee',
          borderRadius: 18,
          boxShadow: '0 10px 30px rgba(15, 23, 42, 0.07)',
          marginBottom: 18,
          padding: 24,
        }}
      >
        <h3 style={{ margin: '0 0 5px' }}>Customize Selected Topic</h3>

        {focusedNode ? (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              {getNodePath(focusedNode, nodesById)} · concepts directly placed here
            </p>

            {focusedConcepts.length === 0 ? (
              <p className="muted">
                No concepts are directly placed in this topic. Selecting the branch
                still includes concepts in descendant topics.
              </p>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gap: 10,
                  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                }}
              >
                {focusedConcepts.map((concept) => (
                  <label
                    key={concept.id}
                    style={{
                      alignItems: 'flex-start',
                      border: '1px solid #e2e8f0',
                      borderRadius: 12,
                      display: 'flex',
                      gap: 10,
                      padding: 14,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={effectiveConceptSelected(concept.id)}
                      onChange={(event) =>
                        setConceptSelection(concept.id, event.target.checked)
                      }
                    />

                    <span>
                      <strong>{concept.name}</strong>
                      <br />

                      <span className="muted" style={{ fontSize: 12 }}>
                        {concept.concept_type || 'Concept'} ·{' '}
                        {questionCounts[concept.id] || 0} published questions
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="muted">
            Choose a topic if you want to customize individual concepts.
          </p>
        )}
      </section>

      {/* Actions */}
      <section
        style={{
          alignItems: 'center',
          background: '#ffffff',
          border: '1px solid #dbe3ee',
          borderRadius: 18,
          boxShadow: '0 10px 30px rgba(15, 23, 42, 0.07)',
          display: 'flex',
          gap: 14,
          justifyContent: 'space-between',
          padding: 20,
        }}
      >
        <button
          className="btn ghost"
          type="button"
          onClick={clearDeck}
          disabled={isSaving}
        >
          Clear All
        </button>

        <div
          style={{
            display: 'flex',
            gap: 12,
          }}
        >
          <button
            className="btn ghost"
            type="button"
            onClick={saveAndReturnToDashboard}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save / Update Deck'}
          </button>

          <button
            className="btn primary"
            type="button"
            onClick={openStudyMode}
            style={{
              fontSize: 16,
              minWidth: 150,
              padding: '12px 20px',
            }}
           >
              ▶ START STUDY
          </button>
        </div>
      </section>

      {message && <p className="muted">{message}</p>}
    </div>
  );
}

if (mode === 'study') {
  return (
    <div
      id="study-mode"
      style={{
        margin: '0 auto',
        maxWidth: 820,
        width: '100%',
      }}
    >
      {/* Study header */}
      <section
        style={{
          alignItems: 'center',
          background: '#ffffff',
          border: '1px solid #dbe3ee',
          borderRadius: 18,
          boxShadow: '0 10px 30px rgba(15, 23, 42, 0.07)',
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 18,
          padding: '18px 22px',
        }}
      >
        <div>
          <p
            style={{
              color: '#64748b',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.08em',
              margin: '0 0 4px',
              textTransform: 'uppercase',
            }}
          >
            Socrates
          </p>

          <h2 style={{ margin: 0 }}>Study Mode</h2>
        </div>

        <button
          className="btn ghost"
          type="button"
          onClick={() => setMode('dashboard')}
        >
          × Exit Study
        </button>
      </section>

      {/* Progress */}
      <section
        style={{
          background: '#ffffff',
          border: '1px solid #dbe3ee',
          borderRadius: 18,
          boxShadow: '0 10px 30px rgba(15, 23, 42, 0.07)',
          marginBottom: 18,
          padding: 22,
        }}
      >
        <div
          style={{
            alignItems: 'center',
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 10,
          }}
        >
          <strong>Card 1 of 40</strong>
          <span className="muted">2%</span>
        </div>

        <div
          style={{
            background: '#e2e8f0',
            borderRadius: 999,
            height: 8,
            overflow: 'hidden',
            width: '100%',
          }}
        >
          <div
            style={{
              background: '#2563eb',
              height: '100%',
              width: '2%',
            }}
          />
        </div>
      </section>

      {/* Question card */}
      <section
        style={{
          background: '#ffffff',
          border: '1px solid #cbd5e1',
          borderRadius: 20,
          boxShadow: '0 12px 34px rgba(15, 23, 42, 0.08)',
          marginBottom: 18,
          minHeight: 320,
          padding: 34,
        }}
      >
        <p
          style={{
            color: '#64748b',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.08em',
            margin: '0 0 18px',
            textTransform: 'uppercase',
          }}
        >
          Question
        </p>

        <h2
          style={{
            fontSize: 28,
            lineHeight: 1.35,
            margin: '0 0 80px',
          }}
        >
          What is the most common cause of acute decompensated heart failure in adults?
        </h2>

        <button
          className="btn ghost"
          type="button"
          style={{
            display: 'block',
            fontSize: 16,
            margin: '0 auto',
            padding: '12px 18px',
          }}
        >
          👆 Tap to reveal answer
        </button>
      </section>

      {/* Answer preview */}
      <section
        style={{
          background: '#ffffff',
          border: '1px solid #dbe3ee',
          borderRadius: 18,
          boxShadow: '0 10px 30px rgba(15, 23, 42, 0.07)',
          marginBottom: 18,
          padding: 26,
        }}
      >
        <p
          style={{
            color: '#2563eb',
            fontSize: 14,
            fontWeight: 800,
            margin: '0 0 8px',
            textTransform: 'uppercase',
          }}
        >
          Answer
        </p>

        <p
          style={{
            fontSize: 18,
            lineHeight: 1.6,
            margin: '0 0 22px',
          }}
        >
          Non-adherence to medications and/or dietary restrictions.
        </p>

        <hr
          style={{
            border: 0,
            borderTop: '1px solid #e2e8f0',
            margin: '0 0 22px',
          }}
        />

        <p
          style={{
            color: '#2563eb',
            fontSize: 14,
            fontWeight: 800,
            margin: '0 0 8px',
            textTransform: 'uppercase',
          }}
        >
          Explanation
        </p>

        <p
          style={{
            lineHeight: 1.7,
            margin: '0 0 22px',
          }}
        >
          Dietary indiscretion and medication non-compliance are leading precipitants
          of acute decompensated heart failure.
        </p>

        <button
          className="btn ghost"
          type="button"
        >
          📖 Review Concept
        </button>
      </section>

      {/* Feedback */}
      <section
        style={{
          display: 'grid',
          gap: 14,
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          marginBottom: 18,
        }}
      >
        <button
          type="button"
          onClick={() => setMode('feedback')}
          style={{
            background: '#ffffff',
            border: '1px solid #bbf7d0',
            borderRadius: 18,
            cursor: 'pointer',
            fontSize: 16,
            fontWeight: 700,
            minHeight: 110,
            padding: 18,
          }}
        >
          <div style={{ fontSize: 34, marginBottom: 8 }}>👍</div>
          Got it
        </button>

        <button
          type="button"
          onClick={() => setMode('feedback')}
          style={{
            background: '#ffffff',
            border: '1px solid #fecaca',
            borderRadius: 18,
            cursor: 'pointer',
            fontSize: 16,
            fontWeight: 700,
            minHeight: 110,
            padding: 18,
          }}
        >
          <div style={{ fontSize: 34, marginBottom: 8 }}>👎</div>
          Didn't get it
        </button>

        <button
          type="button"
           onClick={() => setMode('feedback')}
           style={{
            background: '#ffffff',
            border: '1px solid #dbe3ee',
            borderRadius: 18,
            cursor: 'pointer',
            fontSize: 16,
            fontWeight: 700,
            minHeight: 110,
            padding: 18,
          }}
        >
          <div style={{ fontSize: 34, marginBottom: 8 }}>•••</div>
          More
        </button>
      </section>

      {/* Minimal distraction note */}
      <section
        style={{
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: 16,
          padding: '16px 18px',
          textAlign: 'center',
        }}
      >
        <span style={{ marginRight: 8 }}>💡</span>
        <strong>Minimal distractions</strong>
        <span className="muted"> — focus on one card at a time.</span>
      </section>
    </div>
  );
}

if (mode === 'feedback') {
  const FaceIcon = ({
    mood,
    color,
  }: {
    mood: 'happy' | 'neutral' | 'sad';
    color: string;
  }) => (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 64"
      style={{
        height: 62,
        width: 62,
      }}
    >
      <circle
        cx="32"
        cy="32"
        r="25"
        fill="none"
        stroke={color}
        strokeWidth="4"
      />

      <circle cx="23" cy="26" r="2.8" fill={color} />
      <circle cx="41" cy="26" r="2.8" fill={color} />

      {mood === 'happy' && (
        <path
          d="M20 37 C25 46, 39 46, 44 37"
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
        />
      )}

      {mood === 'neutral' && (
        <path
          d="M22 40 H42"
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
        />
      )}

      {mood === 'sad' && (
        <path
          d="M20 43 C25 34, 39 34, 44 43"
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
        />
      )}
    </svg>
  );

  const troubleCardStyle = {
    background: '#fffafa',
    border: '1.5px solid #fecaca',
    borderRadius: 18,
    color: '#991b1b',
    cursor: 'pointer',
    minHeight: 145,
    padding: 20,
    textAlign: 'center' as const,
  };

  return (
    <div
      id="feedback-mode"
      style={{
        margin: '0 auto',
        maxWidth: 900,
        width: '100%',
      }}
    >
      {/* Header */}
      <section
        style={{
          alignItems: 'center',
          background: '#ffffff',
          border: '1px solid #dbe3ee',
          borderRadius: 18,
          boxShadow: '0 10px 30px rgba(15, 23, 42, 0.07)',
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 18,
          padding: '18px 24px',
        }}
      >
        <div>
          <p
            style={{
              color: '#64748b',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.08em',
              margin: '0 0 4px',
              textTransform: 'uppercase',
            }}
          >
            Socrates
          </p>

          <h2 style={{ margin: 0 }}>Feedback & Mastery</h2>
        </div>

        <button
          className="btn ghost"
          type="button"
          onClick={() => setMode('dashboard')}
        >
          × Exit Study
        </button>
      </section>

      {/* Main feedback */}
      <section
        style={{
          background: '#ffffff',
          border: '1px solid #dbe3ee',
          borderRadius: 20,
          boxShadow: '0 10px 30px rgba(15, 23, 42, 0.07)',
          marginBottom: 18,
          padding: 28,
        }}
      >
        <h2
          style={{
            color: '#1d4ed8',
            margin: '0 0 22px',
          }}
        >
          How well did you know this?
        </h2>

        {/* Easy / Average / Hard */}
        <div
          style={{
            display: 'grid',
            gap: 16,
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            marginBottom: 32,
          }}
        >
          {/* EASY */}
          <button
            type="button"
            style={{
              background: '#ffffff',
              border: '2px solid #bbdfc5',
              borderRadius: 20,
              cursor: 'pointer',
              minHeight: 230,
              padding: 22,
            }}
          >
            <FaceIcon mood="happy" color="#2f8f46" />

            <strong
              style={{
                color: '#2f8f46',
                display: 'block',
                fontSize: 24,
                margin: '8px 0 10px',
              }}
            >
              Easy
            </strong>

            <span
              style={{
                color: '#334155',
                fontSize: 16,
                fontWeight: 600,
                lineHeight: 1.4,
              }}
            >
              I knew this well
            </span>
          </button>

          {/* AVERAGE */}
          <button
            type="button"
            style={{
              background: '#ffffff',
              border: '2px solid #ead69b',
              borderRadius: 20,
              cursor: 'pointer',
              minHeight: 230,
              padding: 22,
            }}
          >
            <FaceIcon mood="neutral" color="#d69e17" />

            <strong
              style={{
                color: '#334155',
                display: 'block',
                fontSize: 24,
                margin: '8px 0 10px',
              }}
            >
              Average
            </strong>

            <span
              style={{
                color: '#334155',
                fontSize: 16,
                fontWeight: 600,
                lineHeight: 1.4,
              }}
            >
              I knew part of this
            </span>
          </button>

          {/* HARD */}
          <button
            type="button"
            style={{
              background: '#ffffff',
              border: '2px solid #f3c2a7',
              borderRadius: 20,
              cursor: 'pointer',
              minHeight: 230,
              padding: 22,
            }}
          >
            <FaceIcon mood="sad" color="#e3642a" />

            <strong
              style={{
                color: '#e3642a',
                display: 'block',
                fontSize: 24,
                margin: '8px 0 10px',
              }}
            >
              Hard
            </strong>

            <span
              style={{
                color: '#334155',
                fontSize: 16,
                fontWeight: 600,
                lineHeight: 1.4,
              }}
            >
              This was challenging
            </span>
          </button>
        </div>

        {/* Trouble choices */}
        <h2
          style={{
            color: '#1d4ed8',
            margin: '0 0 18px',
          }}
        >
          Having trouble?
        </h2>

        <div
          style={{
            display: 'grid',
            gap: 14,
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            marginBottom: 30,
          }}
        >
          <button type="button" style={troubleCardStyle}>
            <strong style={{ display: 'block', fontSize: 18, marginBottom: 8 }}>
              Didn't know
            </strong>
            <span style={{ color: '#475569' }}>I had no idea</span>
          </button>

          <button type="button" style={troubleCardStyle}>
            <strong style={{ display: 'block', fontSize: 18, marginBottom: 8 }}>
              Forgot / Got it wrong
            </strong>
            <span style={{ color: '#475569' }}>
              I knew it before but missed it
            </span>
          </button>

          <button type="button" style={troubleCardStyle}>
            <strong style={{ display: 'block', fontSize: 18, marginBottom: 8 }}>
              Too hard
            </strong>
            <span style={{ color: '#475569' }}>Above my level</span>
          </button>

          <button type="button" style={troubleCardStyle}>
            <strong style={{ display: 'block', fontSize: 18, marginBottom: 8 }}>
              Unclear
            </strong>
            <span style={{ color: '#475569' }}>Question was unclear</span>
          </button>

          <button type="button" style={troubleCardStyle}>
            <strong style={{ display: 'block', fontSize: 18, marginBottom: 8 }}>
              Error
            </strong>
            <span style={{ color: '#475569' }}>Question has an error</span>
          </button>

          <button type="button" style={troubleCardStyle}>
            <strong style={{ display: 'block', fontSize: 18, marginBottom: 8 }}>
              Make suggestion
            </strong>
            <span style={{ color: '#475569' }}>Improve this card</span>
          </button>
        </div>

        <div
          style={{
            borderTop: '1px solid #e2e8f0',
            color: '#475569',
            fontSize: 15,
            paddingTop: 20,
            textAlign: 'center',
          }}
        >
          👆 <strong>Second tap advances to the next card</strong>
        </div>
      </section>

      {/* Mastery */}
      <section
        style={{
          background: '#f8fafc',
          border: '1px solid #dbe3ee',
          borderRadius: 18,
          marginBottom: 18,
          padding: 24,
        }}
      >
        <h3
          style={{
            color: '#1d4ed8',
            margin: '0 0 18px',
          }}
        >
          📈 Mastery & Progress
        </h3>

        <div
          style={{
            display: 'grid',
            gap: 20,
            gridTemplateColumns: '1fr 1fr',
          }}
        >
          <div>
            <span className="muted">Mastery</span>
            <h3 style={{ margin: '5px 0' }}>Not calculated yet</h3>
            <p className="muted" style={{ margin: 0 }}>
              Mastery will develop from real study history.
            </p>
          </div>

          <div
            style={{
              borderLeft: '1px solid #cbd5e1',
              paddingLeft: 20,
            }}
          >
            <span className="muted">Next review</span>
            <h3 style={{ margin: '5px 0' }}>Not scheduled yet</h3>
            <p className="muted" style={{ margin: 0 }}>
              Scheduling will update as study data develops.
            </p>
          </div>
        </div>
      </section>

      {/* Review concept */}
      <button
        className="btn ghost"
        type="button"
        style={{
          border: '1.5px solid #93c5fd',
          fontSize: 16,
          padding: '14px 18px',
          width: '100%',
        }}
      >
        ↗ 📖 Review concept / article if needed
      </button>
    </div>
  );
}
  return (
  <div
    id="deck-dashboard"
    style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 22,
      width: '100%',
    }}
  >
    {/* Welcome + activity summary */}
    <section
      style={{
        background: '#ffffff',
        border: '1px solid #dbe3ee',
        borderRadius: 18,
        boxShadow: '0 10px 30px rgba(15, 23, 42, 0.07)',
        padding: 24,
      }}
    >
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 20,
        }}
      >
        <div>
          <p
            className="muted"
            style={{
              fontSize: 13,
              margin: '0 0 4px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {activeLibrary.name}
          </p>

          <h2 style={{ margin: 0 }}>Welcome back, {displayName}!</h2>
        </div>

        <button
          className="btn ghost"
          type="button"
          aria-label="Settings"
          title="Settings"
          style={{
            borderRadius: 12,
            fontSize: 20,
            minHeight: 42,
            minWidth: 42,
            padding: 8,
          }}
        >
          ⚙
        </button>
      </div>

      <div
  style={{
    display: 'flex',
    justifyContent: 'flex-end',
    marginBottom: 16,
  }}
>
  <div
    style={{
      display: 'flex',
      gap: 16,
      alignItems: 'center',
      flexWrap: 'wrap',
    }}
  >
    {['Learn', 'Study', 'Custom'].map((modeLabel) => (
      <label
        key={modeLabel}
        style={{
          alignItems: 'center',
          display: 'flex',
          gap: 7,
          fontSize: 14,
          fontWeight: 600,
          color: '#334155',
        }}
      >
        <input
          type="radio"
          name="study-mode-preview"
          value={modeLabel}
          defaultChecked={modeLabel === 'Study'}
        />
        {modeLabel}
      </label>
    ))}
  </div>
</div>
      <div
        style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        }}
      >
        <div
          className="card"
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: 14,
            padding: 16,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 22, marginBottom: 6 }}>🔥</div>
          <strong style={{ display: 'block', fontSize: 22 }}>0</strong>
          <span className="muted" style={{ fontSize: 13 }}>
            Day Streak
          </span>
        </div>

        <div
          className="card"
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: 14,
            padding: 16,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 22, marginBottom: 6 }}>▣</div>
          <strong style={{ display: 'block', fontSize: 18 }}>Not yet</strong>
          <span className="muted" style={{ fontSize: 13 }}>
            Last Study
          </span>
        </div>

        <div
          className="card"
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: 14,
            padding: 16,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 22, marginBottom: 6 }}>◷</div>
          <strong style={{ display: 'block', fontSize: 22 }}>0m</strong>
          <span className="muted" style={{ fontSize: 13 }}>
            This Week
          </span>
        </div>
      </div>
    </section>

    {/* Current Deck */}
    <section
      style={{
        background: '#ffffff',
        border: '1px solid #dbe3ee',
        borderRadius: 18,
        boxShadow: '0 10px 30px rgba(15, 23, 42, 0.07)',
        padding: 24,
      }}
    >
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 18,
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Current Deck</h2>
          <p className="muted" style={{ margin: '5px 0 0' }}>
            {deck.name} · {activeLibrary.name}
          </p>
        </div>

        <button
          className="btn ghost"
          type="button"
          onClick={openSetupMode}
        >
          Edit Deck
        </button>
      </div>

      {selectedNodeSummaries.length === 0 ? (
       <div
  style={{
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  }}
>
  {[
  { name: 'Clinical Practice', icon: '♡', depth: 0 },
  { name: 'Modules', icon: '▱', depth: 1 },
  { name: 'Cardiac', icon: '♡', depth: 2 },
  { name: 'ECG', icon: '⌁', depth: 3 },
].map((item) => (
    <div
      key={item.name}
      style={{
        alignItems: 'center',
        background: '#ffffff',
        border: '1px solid #dbe3ee',
        borderRadius: 14,
        display: 'grid',
        gap: 14,
        gridTemplateColumns: '42px minmax(0, 1fr)',
        padding: '16px 18px',
        marginLeft: item.depth * 18,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          alignItems: 'center',
          background: '#eff6ff',
          borderRadius: 12,
          color: '#1d4ed8',
          display: 'flex',
          fontSize: 20,
          height: 42,
          justifyContent: 'center',
          width: 42,
        }}
      >
        {item.icon}
      </div>

      <div>
        <div
  style={{
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  }}
>
  {item.depth > 0 && (
    <span
      aria-hidden="true"
      style={{
        color: '#94a3b8',
        fontSize: 14,
      }}
    >
      ↳
    </span>
  )}

  <strong>{item.name}</strong>

  <span
    className="muted"
    style={{
      marginLeft: 'auto',
      fontSize: 13,
    }}
  >
    —
  </span>
</div>

        <div
          style={{
            background: '#e2e8f0',
            borderRadius: 999,
            height: 7,
            marginBottom: 7,
            overflow: 'hidden',
            width: '100%',
          }}
        >
          <div
            style={{
              background: '#60a5fa',
              height: '100%',
              width: '0%',
            }}
          />
        </div>

        <span
          className="muted"
          style={{
            fontSize: 13,
          }}
        >
          Not reviewed yet
        </span>
      </div>
    </div>
  ))}

  <button
    className="btn ghost"
    type="button"
    onClick={openSetupMode}
    style={{
      alignSelf: 'flex-start',
      marginTop: 4,
    }}
  >
    Set Up / Edit Deck
  </button>
</div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {selectedNodeSummaries.slice(0, 6).map((selection, index) => (
            <div
              key={selection.id}
              style={{
                alignItems: 'center',
                background: '#ffffff',
                border: '1px solid #dbe3ee',
                borderRadius: 14,
                display: 'grid',
                gap: 14,
                gridTemplateColumns: '42px minmax(0, 1fr) auto',
                padding: '16px 18px',

              }}
            >
              <div
                aria-hidden="true"
                style={{
                  alignItems: 'center',
                  background: '#eff6ff',
                  borderRadius: 12,
                  color: '#1d4ed8',
                  display: 'flex',
                  fontSize: 20,
                  height: 42,
                  justifyContent: 'center',
                  width: 42,
                }}
              >
                {index % 3 === 0 ? '♡' : index % 3 === 1 ? '▱' : '⌁'}
              </div>

              <div>
                <strong style={{ display: 'block', marginBottom: 5 }}>
                  {selection.label}
                </strong>

                <div
                  aria-hidden="true"
                  style={{
                    background: '#e2e8f0',
                    borderRadius: 999,
                    height: 7,
                    marginBottom: 7,
                    overflow: 'hidden',
                    width: '100%',
                  }}
                >
                  <div
                    style={{
                      background: '#60a5fa',
                      height: '100%',
                      width: '0%',
                    }}
                  />
                </div>

                <span className="muted" style={{ fontSize: 13 }}>
                  {selection.conceptCount} concepts ·{' '}
                  {selection.questionTotal} questions · Not reviewed yet
                </span>
              </div>

              <div
                style={{
                  color: '#475569',
                  fontSize: 13,
                  textAlign: 'right',
                  whiteSpace: 'nowrap',
                }}
              >
                {selection.questionTotal} cards
              </div>
            </div>
          ))}

          {selectedNodeSummaries.length > 6 && (
            <p className="muted" style={{ margin: 0 }}>
              + {selectedNodeSummaries.length - 6} more selected topics
            </p>
          )}
        </div>
      )}

      {selectedNodeSummaries.length > 0 && (
        <div
          style={{
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            gap: 24,
            marginTop: 18,
            paddingTop: 16,
          }}
        >
          <span>
            <strong>{resolvedConcepts.length}</strong>
            <br />
            <span className="muted">concepts</span>
          </span>

          <span>
            <strong>{totalQuestions}</strong>
            <br />
            <span className="muted">questions available</span>
          </span>
        </div>
      )}
    </section>

    {/* Ready to study */}
    <section
      style={{
        alignItems: 'center',
        background: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderRadius: 18,
        display: 'flex',
        gap: 18,
        padding: 22,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          alignItems: 'center',
          background: '#ffffff',
          borderRadius: 999,
          display: 'flex',
          fontSize: 28,
          height: 54,
          justifyContent: 'center',
          width: 54,
        }}
      >
        🚀
      </div>

      <div style={{ flex: 1 }}>
        <h3 style={{ margin: '0 0 4px' }}>Ready to study?</h3>
        <p className="muted" style={{ margin: 0 }}>
          Jump in now or adjust your deck.
        </p>
      </div>

      <button
        className="btn ghost"
        type="button"
        onClick={openSetupMode}
      >
        {resolvedConcepts.length === 0 ? 'Set Up Deck' : 'Adjust Deck'}
      </button>
    </section>

        {message && <p className="muted">{message}</p>}
  </div>
);
}
