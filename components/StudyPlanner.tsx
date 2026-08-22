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
type PlannerMode = 'dashboard' | 'setup';

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

    openSetupFromHash();
    window.addEventListener('hashchange', openSetupFromHash);

    return () => {
      window.removeEventListener('hashchange', openSetupFromHash);
    };
  }, []);

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
        className="card"
        key={node.id}
        style={{
          marginLeft: depth ? 16 : 0,
          borderColor: selected ? '#2563eb' : undefined,
        }}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            className="btn ghost"
            type="button"
            onClick={() => toggleExpandedNode(node.id)}
            disabled={children.length === 0}
            aria-label={isExpanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
          >
            {children.length === 0 ? '•' : isExpanded ? '▼' : '▶'}
          </button>
          <label
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              flex: 1,
            }}
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={() => toggleNodeSelection(node.id)}
            />
            <span>
              <strong>{node.name}</strong>
              <br />
              <span className="muted">
                {branchConceptCount} concepts · {branchQuestionCount(node.id)} questions
              </span>
            </span>
          </label>
          <button
            className="btn ghost"
            type="button"
            onClick={() => setFocusedNodeId(node.id)}
          >
            Customize
          </button>
        </div>

        {isExpanded && children.length > 0 && (
          <div className="stack" style={{ marginTop: 12 }}>
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
  const includedOverrides = Object.values(conceptOverrides).filter(
    (state) => state === 'included'
  ).length;
  const excludedOverrides = Object.values(conceptOverrides).filter(
    (state) => state === 'excluded'
  ).length;

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
      <div className="stack" id="set-up-deck">
        <div className="panel hero">
          <p className="muted" style={{ marginTop: 0 }}>
            Current Subject: {activeLibrary.name}
          </p>
          <h2>Set Up Deck</h2>
          <p>
            Build your deck from topic branches. Selecting a parent includes its
            descendant topics, and you can fine-tune individual concepts when needed.
          </p>
        </div>

        <div className="dashboard">
          <div className="panel">
            <h3>Topic Branches</h3>
            {rootNodes.length === 0 ? (
              <p className="muted">No topics are available in this library yet.</p>
            ) : (
              <div className="stack">{rootNodes.map((node) => renderNode(node))}</div>
            )}
          </div>

          <div className="panel">
            <h3>Selected Deck</h3>
            <p>
              <strong>{resolvedConcepts.length}</strong>
              <br />
              <span className="muted">concepts selected</span>
            </p>
            <p>
              <strong>{totalQuestions}</strong>
              <br />
              <span className="muted">published questions available</span>
            </p>
            <p className="muted">
              {selectedNodeIds.size} selected branches · {includedOverrides} manual
              includes · {excludedOverrides} manual exclusions
            </p>
            <button
              className="btn primary"
              type="button"
              onClick={saveAndReturnToDashboard}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save / Update Deck'}
            </button>
            <button
              className="btn ghost"
              type="button"
              onClick={() => setMode('dashboard')}
              style={{ marginLeft: 8 }}
            >
              Back to Dashboard
            </button>
          </div>
        </div>

        <div className="panel">
          <h3>Customize Topic Concepts</h3>
          {focusedNode ? (
            <>
              <p className="muted">
                {getNodePath(focusedNode, nodesById)} · concepts directly placed here
              </p>
              {focusedConcepts.length === 0 ? (
                <p className="muted">
                  No concepts are directly placed in this topic. Selecting the branch
                  still includes concepts in descendant topics.
                </p>
              ) : (
                <div className="stack">
                  {focusedConcepts.map((concept) => (
                    <div className="card" key={concept.id}>
                      <label
                        style={{ display: 'flex', gap: 10, alignItems: 'start' }}
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
                          <span className="muted">
                            {concept.concept_type || 'Concept'} ·{' '}
                            {questionCounts[concept.id] || 0} published questions
                          </span>
                          {concept.summary && <p>{concept.summary}</p>}
                          <Link href={`/concepts/${concept.id}`}>
                            Open concept detail
                          </Link>
                        </span>
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="muted">Choose a topic to customize individual concepts.</p>
          )}
        </div>

        <div className="panel">
          <h3>Setup Note</h3>
          <p className="muted">
            Deck changes are saved as you select topics. Use Save / Update Deck when
            you are ready to return to the dashboard summary.
          </p>
        </div>

        {message && <p className="muted">{message}</p>}
      </div>
    );
  }

  return (
    <div className="stack" id="deck-dashboard">
      <div className="panel hero">
        <p className="muted" style={{ marginTop: 0 }}>
          Current Subject: {activeLibrary.name}
        </p>
        <h2>Deck Dashboard</h2>
        <p>
          Welcome back. Your current deck is the starting point for studying in{' '}
          {activeLibrary.name}.
        </p>
      </div>

      <div className="dashboard">
        <div className="panel">
          <h3>Current Deck</h3>
          <p>
            <strong>{deck.name}</strong>
            <br />
            <span className="muted">{activeLibrary.name}</span>
          </p>
          <div
            className="card"
            style={{
              display: 'grid',
              gap: 12,
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            }}
          >
            <p style={{ margin: 0 }}>
              <strong>{resolvedConcepts.length}</strong>
              <br />
              <span className="muted">concepts selected</span>
            </p>
            <p style={{ margin: 0 }}>
              <strong>{totalQuestions}</strong>
              <br />
              <span className="muted">questions available</span>
            </p>
          </div>
          {selectedNodeSummaries.length === 0 ? (
            <p className="muted">No branches selected yet.</p>
          ) : (
            selectedNodeSummaries.slice(0, 4).map((selection) => (
              <p key={selection.id}>
                <strong>{selection.label}</strong>
                <br />
                <span className="muted">
                  {selection.conceptCount} concepts · {selection.questionTotal} questions
                </span>
              </p>
            ))
          )}
          {selectedNodeSummaries.length > 4 && (
            <p className="muted">
              + {selectedNodeSummaries.length - 4} more selected branches
            </p>
          )}
          <button
            className="btn ghost"
            type="button"
            onClick={() => setMode('setup')}
          >
            {resolvedConcepts.length === 0 ? 'Set Up Deck' : 'Edit Deck'}
          </button>
        </div>

        <div className="panel">
          <h3>Ready to Study?</h3>
          <button
            className="btn primary"
            type="button"
            disabled
            style={{
              fontSize: 18,
              justifyContent: 'center',
              minHeight: 56,
              width: '100%',
            }}
          >
            STUDY
          </button>
          <p className="muted">
            {resolvedConcepts.length === 0
              ? 'Set up your deck to begin studying.'
              : 'Study Mode coming next.'}
          </p>
          <button className="btn ghost" type="button" onClick={() => setMode('setup')}>
            {resolvedConcepts.length === 0 ? 'Set Up Deck' : 'Edit Deck'}
          </button>
        </div>
      </div>

      <div className="panel">
        <h3>Deck Contents</h3>
        {resolvedConcepts.length === 0 ? (
          <p className="muted">No concepts selected yet.</p>
        ) : (
          <div className="stack">
            {resolvedConcepts.slice(0, 8).map((concept) => (
              <div className="card" key={concept.concept_id}>
                <strong>{concept.concept_name}</strong>
                <p className="muted" style={{ marginBottom: 0 }}>
                  {concept.concept_type || 'Concept'} ·{' '}
                  {concept.published_question_count || 0} published questions
                </p>
              </div>
            ))}
            {resolvedConcepts.length > 8 && (
              <p className="muted">+ {resolvedConcepts.length - 8} more concepts</p>
            )}
          </div>
        )}
      </div>

      {message && <p className="muted">{message}</p>}
    </div>
  );
}
