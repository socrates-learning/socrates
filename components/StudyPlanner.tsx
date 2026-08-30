'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
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
  cram_mode: boolean;
  created_at: string;
  updated_at: string;
};

type StudyDeckNodePreference = {
  library_node_id: string;
  new_mastery_balance: number;
};

type StudyDeckConcept = {
  concept_id: string;
  concept_name: string;
  concept_type: string | null;
  summary: string | null;
  published_question_count: number;
  selection_source: string;
};

type AuthoredStudyQuestion = {
  id: string;
  concept_id: string;
  prompt: string;
  difficulty: string;
  testing_angle: string;
  sort_order: number;
  created_at: string;
  question_accepted_answers: Array<{
    answer_text: string;
    sort_order: number;
  }>;
};

type ConceptOverride = 'included' | 'excluded';
type PlannerMode = 'dashboard' | 'setup' | 'study';
type DeckMode = 'Learn' | 'Study' | 'Cram';
type StudyFeedback = 'up' | 'more' | 'down' | null;
type StudyResponse =
  | 'easy'
  | 'average'
  | 'hard'
  | 'didnt_know'
  | 'forgot'
  | 'too_hard'
  | null;

type LearnerHeaderPrefix = 'home-v2' | 'study-setup-v2' | 'study-v2';
type LearnerNavIcon =
  | 'home'
  | 'learn'
  | 'study'
  | 'progress'
  | 'creator'
  | 'admin'
  | 'account';

const learnerNavItems: Array<{
  icon: LearnerNavIcon;
  label: string;
  href?: string;
}> = [
  { href: '/', icon: 'home', label: 'Home' },
  { icon: 'learn', label: 'Learn' },
  { icon: 'study', label: 'Study' },
  { icon: 'progress', label: 'Progress' },
  { href: '/creator', icon: 'creator', label: 'Creator Studio' },
  { href: '/admin/users', icon: 'admin', label: 'Admin' },
  { icon: 'account', label: 'Account' },
];

const homeRailItems = [
  { label: 'Deck Menu', icon: 'document' },
  { label: 'Set Up Deck', icon: 'gear' },
  { label: 'Make Cards', icon: 'edit' },
  { label: 'Stats', icon: 'bars' },
  { label: 'Menu', icon: 'people' },
  { label: 'Buttons', icon: 'dots' },
];

const prototypeProgressRows = [
  { id: 'clinical-practice', name: 'Clinical Practice', progress: 68, canExpand: true },
  { id: 'mother-baby', name: 'Mother Baby', progress: 52, canExpand: true },
  { id: 'cardiac', name: 'Cardiac', progress: 37, canExpand: true },
  { id: 'ecg', name: 'ECG', progress: 74, canExpand: true },
];

type PrototypeTopicNode = {
  id: string;
  name: string;
  progress: number;
  children?: PrototypeTopicNode[];
};

const prototypeTopicTree: PrototypeTopicNode[] = [
  {
    id: 'nursing',
    name: 'Nursing',
    progress: 64,
    children: [
      {
        id: 'clinical-practice-tree',
        name: 'Clinical Practice',
        progress: 68,
        children: [
          { id: 'monitors', name: 'Monitors', progress: 54 },
          { id: 'invasive-lines', name: 'Invasive Lines', progress: 41 },
        ],
      },
      {
        id: 'mother-baby-tree',
        name: 'Mother Baby',
        progress: 52,
        children: [{ id: 'newborn-care', name: 'Newborn Care', progress: 38 }],
      },
      { id: 'cardiac-tree', name: 'Cardiac', progress: 37 },
      { id: 'ecg-tree', name: 'ECG', progress: 74 },
    ],
  },
];

function LearnerHeaderIcon({
  icon,
  classPrefix,
}: {
  icon: LearnerNavIcon;
  classPrefix: LearnerHeaderPrefix;
}) {
  return (
    <span className={`${classPrefix}-nav-icon`} aria-hidden="true">
      {icon === 'home' && (
        <svg viewBox="0 0 24 24">
          <path d="M3 11l9-8 9 8" />
          <path d="M5 10v10h5v-6h4v6h5V10" />
        </svg>
      )}
      {icon === 'learn' && (
        <svg viewBox="0 0 24 24">
          <path d="M4 5c3 0 5 .8 8 3v12c-3-2.2-5-3-8-3zM20 5c-3 0-5 .8-8 3v12c3-2.2 5-3 8-3z" />
        </svg>
      )}
      {icon === 'study' && (
        <svg viewBox="0 0 24 24">
          <path d="M3 8l9-4 9 4-9 4z" />
          <path d="M7 10v5c3 2 7 2 10 0v-5" />
        </svg>
      )}
      {icon === 'progress' && (
        <svg viewBox="0 0 24 24">
          <path d="M5 20V9M12 20V4M19 20v-8" />
          <path d="M3 20h18" />
        </svg>
      )}
      {icon === 'creator' && (
        <svg viewBox="0 0 24 24">
          <path d="M4 20l4-1 11-11-3-3L5 16z" />
          <path d="M14 7l3 3" />
        </svg>
      )}
      {icon === 'admin' && (
        <svg viewBox="0 0 24 24">
          <path d="M12 3l8 4v5c0 5-3 8-8 10-5-2-8-5-8-10V7z" />
          <path d="M9 12l2 2 4-5" />
        </svg>
      )}
      {icon === 'account' && (
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c1.5-5 4-7 8-7s6.5 2 8 7" />
        </svg>
      )}
    </span>
  );
}

function RailIcon({ icon }: { icon: string }) {
  return (
    <span className="home-v2-rail-icon" aria-hidden="true">
      {icon === 'document' && (
        <svg viewBox="0 0 40 40">
          <path d="M12 7h12l5 5v21H12z" />
          <path d="M24 7v7h7M16 19h10M16 24h10M16 29h7" />
        </svg>
      )}
      {icon === 'gear' && (
        <svg viewBox="0 0 40 40">
          <path d="M20 13a7 7 0 1 0 0 14 7 7 0 0 0 0-14z" />
          <path d="M20 5v6M20 29v6M5 20h6M29 20h6M9 9l4 4M27 27l4 4M31 9l-4 4M13 27l-4 4" />
        </svg>
      )}
      {icon === 'edit' && (
        <svg viewBox="0 0 40 40">
          <path d="M10 30h20M12 26l2-8 13-13 6 6-13 13zM25 7l6 6" />
        </svg>
      )}
      {icon === 'bars' && (
        <svg viewBox="0 0 40 40">
          <path d="M9 31V19h6v12M17 31V11h6v20M25 31V5h6v26" />
        </svg>
      )}
      {icon === 'people' && (
        <svg viewBox="0 0 40 40">
          <path d="M15 19a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM5 33c1-7 5-10 10-10s9 3 10 10" />
          <path d="M27 20a5 5 0 1 0-1-10M26 24c4 1 7 4 8 9" />
        </svg>
      )}
      {icon === 'dots' && (
        <svg viewBox="0 0 40 40">
          <path d="M11 20h.1M20 20h.1M29 20h.1" />
        </svg>
      )}
    </span>
  );
}

function HomeProgressBar({ value }: { value: number }) {
  return (
    <div className="home-v2-progress" aria-label={`${value}% progress`}>
      <span style={{ width: `${value}%` }} />
    </div>
  );
}

function StudyProgressBar() {
  return (
    <div className="study-v2-progress" aria-label="Study progress">
      <span />
    </div>
  );
}

function StudyFeedbackIcon({ type }: { type: 'up' | 'more' | 'down' }) {
  if (type === 'more') {
    return <span className="study-v2-more-dots">•••</span>;
  }

  return (
    <svg aria-hidden="true" className="study-v2-feedback-svg" viewBox="0 0 64 64">
      {type === 'up' ? (
        <path d="M23 54h-8c-4 0-7-3-7-7V30c0-4 3-7 7-7h8l8-15c2-4 8-2 8 3v12h10c5 0 8 4 7 9l-3 14c-1 5-5 8-10 8z" />
      ) : (
        <path d="M23 10h-8c-4 0-7 3-7 7v17c0 4 3 7 7 7h8l8 15c2 4 8 2 8-3V41h10c5 0 8-4 7-9l-3-14c-1-5-5-8-10-8z" />
      )}
    </svg>
  );
}

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
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('there');
  const [deck, setDeck] = useState<StudyDeck | null>(null);
  const [nodes, setNodes] = useState<LibraryNode[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>({});
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [nodePreferences, setNodePreferences] = useState<Record<string, number>>(
    {}
  );
  const [conceptOverrides, setConceptOverrides] = useState<
    Record<string, ConceptOverride>
  >({});
  const [resolvedConcepts, setResolvedConcepts] = useState<StudyDeckConcept[]>([]);
  const [authoredStudyQuestions, setAuthoredStudyQuestions] = useState<
    AuthoredStudyQuestion[]
  >([]);
  const [authoredStudyQuestionIndex, setAuthoredStudyQuestionIndex] = useState(0);
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set());
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(Boolean(activeLibrary?.id));
  const [isSaving, setIsSaving] = useState(false);
  const [selectedDeckModes, setSelectedDeckModes] = useState<Set<DeckMode>>(
    new Set(['Study'])
  );
  const [homeExpandedIds, setHomeExpandedIds] = useState<Set<string>>(
    new Set(['nursing', 'clinical-practice-tree'])
  );
  const [isSetupCramMode, setIsSetupCramMode] = useState(false);
  const [isAnswerVisible, setIsAnswerVisible] = useState(false);
  const [studyFeedback, setStudyFeedback] = useState<StudyFeedback>(null);
  const [studyResponse, setStudyResponse] = useState<StudyResponse>(null);
  const studyResponseSaveLock = useRef(false);
  const studySessionIdRef = useRef<string | null>(null);
  const studySessionCreatePromiseRef = useRef<Promise<string | null> | null>(null);
  const authoredStudyQuestion =
    authoredStudyQuestions[authoredStudyQuestionIndex] || null;

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
      setMode(window.location.hash === '#set-up-deck' ? 'setup' : 'dashboard');

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setUserId(null);
        setEmail(null);
        setRole(null);
        setMessage('Sign in to set up your deck.');
        setIsLoading(false);
        return;
      }

      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();

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
      const { data: preferenceData, error: preferenceError } = await supabase
        .from('study_deck_node_preferences')
        .select('library_node_id, new_mastery_balance')
        .eq('deck_id', activeDeck.id);

      if (preferenceError) {
        setMessage(`Unable to load deck preferences: ${preferenceError.message}`);
        setIsLoading(false);
        return;
      }

      const { data: resolvedData } = await supabase.rpc('resolve_study_deck', {
        p_deck_id: activeDeck.id,
      });

      if (!isMounted) return;

      const rootNode = loadedNodes.find((node) => node.parent_id === null);

      setUserId(user.id);
      setEmail(user.email ?? 'Account');
      setRole(roleData?.role ?? null);
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
      setNodePreferences(
        Object.fromEntries(
          ((preferenceData || []) as StudyDeckNodePreference[]).map((preference) => [
            preference.library_node_id,
            Number(preference.new_mastery_balance),
          ])
        )
      );
      setIsSetupCramMode(Boolean(activeDeck.cram_mode));
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
    let isMounted = true;
    const conceptIds = resolvedConcepts.map((concept) => concept.concept_id);

    async function loadAuthoredStudyQuestions() {
      if (!conceptIds.length) {
        setAuthoredStudyQuestions([]);
        setAuthoredStudyQuestionIndex(0);
        return;
      }

      const { data, error } = await supabase
        .from('questions')
        .select(
          `
          id,
          concept_id,
          prompt,
          difficulty,
          testing_angle,
          sort_order,
          created_at,
          question_accepted_answers!inner (
            answer_text,
            sort_order
          )
        `
        )
        .eq('status', 'published')
        .eq('question_type', 'short_answer')
        .in('concept_id', conceptIds)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });

      if (!isMounted) return;

      if (error || !data?.length) {
        setAuthoredStudyQuestions([]);
        setAuthoredStudyQuestionIndex(0);
        return;
      }

      const conceptOrder = new Map(
        resolvedConcepts.map((concept, index) => [concept.concept_id, index])
      );
      const loadedQuestions = (data as unknown as AuthoredStudyQuestion[])
        .map((question) => ({
          ...question,
          question_accepted_answers: [
            ...(question.question_accepted_answers || []),
          ].sort((a, b) => a.sort_order - b.sort_order),
        }))
        .sort((left, right) => {
          const conceptDifference =
            (conceptOrder.get(left.concept_id) ?? Number.MAX_SAFE_INTEGER) -
            (conceptOrder.get(right.concept_id) ?? Number.MAX_SAFE_INTEGER);
          if (conceptDifference !== 0) return conceptDifference;
          if (left.sort_order !== right.sort_order) {
            return left.sort_order - right.sort_order;
          }
          const createdDifference = left.created_at.localeCompare(right.created_at);
          if (createdDifference !== 0) return createdDifference;
          return left.id.localeCompare(right.id);
        });

      setAuthoredStudyQuestions(loadedQuestions);
      setAuthoredStudyQuestionIndex(0);
    }

    void loadAuthoredStudyQuestions();

    return () => {
      isMounted = false;
    };
  }, [resolvedConcepts]);

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

  if (mode === 'setup' || mode === 'study') {
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

  async function ensureStudySession() {
    if (studySessionIdRef.current) return studySessionIdRef.current;
    if (studySessionCreatePromiseRef.current) {
      return studySessionCreatePromiseRef.current;
    }
    if (!deck || !userId || !authoredStudyQuestions.length) return null;

    const createPromise = (async () => {
      const selectedBalances = [...selectedNodeIds].map(
        (nodeId) => nodePreferences[nodeId] ?? 50
      );
      const sessionBalance = selectedBalances.length
        ? Math.round(
            selectedBalances.reduce((total, balance) => total + balance, 0) /
              selectedBalances.length
          )
        : 50;
      const { data, error } = await supabase.rpc('start_study_session', {
        p_study_deck_id: deck.id,
        p_new_mastery_balance: sessionBalance,
      });

      if (error || !data) {
        console.error('Unable to start Study Mode session.', error);
        return null;
      }

      const sessionId = data as string;
      studySessionIdRef.current = sessionId;
      return sessionId;
    })();

    studySessionCreatePromiseRef.current = createPromise;

    try {
      return await createPromise;
    } finally {
      studySessionCreatePromiseRef.current = null;
    }
  }

  function openStudyMode() {
    setAuthoredStudyQuestionIndex(0);
    setIsAnswerVisible(false);
    setStudyFeedback(null);
    setStudyResponse(null);
    setMode('study');
    void ensureStudySession();
  }

  async function leaveStudyMode(nextMode: Exclude<PlannerMode, 'study'>) {
    const pendingSession =
      studySessionIdRef.current ||
      (studySessionCreatePromiseRef.current
        ? studySessionCreatePromiseRef.current
        : null);

    studySessionIdRef.current = null;
    studySessionCreatePromiseRef.current = null;
    setMode(nextMode);

    const sessionId = await pendingSession;

    if (!sessionId) return;

    const { error } = await supabase.rpc('end_study_session', {
      p_study_session_id: sessionId,
    });

    if (error) {
      console.error('Unable to end Study Mode session.', error);
    }
  }

  async function persistFinalStudyResponse(
    response: Exclude<StudyResponse, null>
  ) {
    if (studyResponseSaveLock.current) return;

    setStudyResponse(response);

    if (!authoredStudyQuestion || !userId) return;

    studyResponseSaveLock.current = true;

    try {
      const sessionId = await ensureStudySession();

      if (!sessionId) return;

      const { error } = await supabase.rpc('record_study_session_attempt', {
        p_study_session_id: sessionId,
        p_question_id: authoredStudyQuestion.id,
        p_concept_id: authoredStudyQuestion.concept_id,
        p_result: response,
      });

      if (error) {
        console.error('Unable to record Study Mode response.', error);
        return;
      }

      setAuthoredStudyQuestionIndex((currentIndex) =>
        authoredStudyQuestions.length
          ? (currentIndex + 1) % authoredStudyQuestions.length
          : 0
      );
      setIsAnswerVisible(false);
      setStudyFeedback(null);
      setStudyResponse(null);
    } catch (error) {
      console.error('Unable to record Study Mode response.', error);
    } finally {
      studyResponseSaveLock.current = false;
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  function handleCreatorClick() {
    window.dispatchEvent(new Event('socrates-open-creator-dashboard'));
  }

  function toggleDeckMode(deckMode: DeckMode) {
    setSelectedDeckModes((current) => {
      const next = new Set(current);

      if (next.has(deckMode)) {
        next.delete(deckMode);
      } else {
        next.add(deckMode);
      }

      return next;
    });
  }

  function toggleHomeExpanded(id: string) {
    setHomeExpandedIds((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  function findPersistedHomeNode(
    homeNode: PrototypeTopicNode,
    parentNodeId: string | null | undefined
  ) {
    if (parentNodeId === undefined) return null;

    const siblings = nodes.filter(
      (node) => node.parent_id === parentNodeId
    );
    return (
      siblings.find((node) => node.id === homeNode.id) ||
      siblings.find(
        (node) =>
          node.name.trim().toLocaleLowerCase() ===
          homeNode.name.trim().toLocaleLowerCase()
      ) ||
      null
    );
  }

  function renderLearnerHeader(classPrefix: LearnerHeaderPrefix) {
    const isEditor = role === 'editor' || role === 'admin';
    const isAdmin = role === 'admin';

    return (
      <header className={`${classPrefix}-header`}>
        <Link
          className={`${classPrefix}-brand`}
          href="/"
          onClick={() => setMode('dashboard')}
        >
          {classPrefix === 'home-v2' ? (
            <Image
              alt="Socrates — Learn anything."
              className="home-v2-brand-logo"
              height={152}
              priority
              src="/brand/socrates-logo-dark.png"
              width={270}
            />
          ) : (
            <>
              <Image
                alt="Socrates owl mark"
                className={`${classPrefix}-brand-mark`}
                height={66}
                src="/brand/socrates-mark.png"
                width={76}
              />
              <div>
                <strong>Socrates</strong>
                <span>Learn anything.</span>
              </div>
            </>
          )}
        </Link>

        <nav className={`${classPrefix}-nav`} aria-label="Socrates learner navigation">
          {learnerNavItems.map((item) => {
            if (item.icon === 'creator' && !isEditor) return null;
            if (item.icon === 'admin' && !isAdmin) return null;

            const isStudy = item.icon === 'study';
            const isAccount = item.icon === 'account';
            const className = [
              `${classPrefix}-nav-item`,
              classPrefix !== 'home-v2' && isStudy ? `${classPrefix}-nav-active` : '',
              classPrefix !== 'home-v2' && isAccount ? `${classPrefix}-nav-account` : '',
              classPrefix === 'home-v2' && isAccount ? 'home-v2-nav-account' : '',
            ]
              .filter(Boolean)
              .join(' ');
            const content = (
              <>
                <LearnerHeaderIcon icon={item.icon} classPrefix={classPrefix} />
                {item.label}
                {isAccount && <span aria-hidden="true">⌄</span>}
              </>
            );

            if (item.href) {
              return (
                <Link
                  className={className}
                  href={item.href}
                  key={item.label}
                  onClick={
                    item.icon === 'home'
                      ? () => setMode('dashboard')
                      : item.icon === 'creator'
                        ? handleCreatorClick
                        : undefined
                  }
                >
                  {content}
                </Link>
              );
            }

            if (isStudy) {
              return (
                <button
                  className={className}
                  key={item.label}
                  type="button"
                  onClick={openSetupMode}
                >
                  {content}
                </button>
              );
            }

            if (isAccount) {
              return (
                <button
                  className={className}
                  key={item.label}
                  type="button"
                  onClick={handleLogout}
                  title={email ? `Signed in as ${email}. Click to log out.` : 'Account'}
                >
                  {content}
                </button>
              );
            }

            return (
              <button className={className} key={item.label} type="button" disabled>
                {content}
              </button>
            );
          })}
        </nav>
      </header>
    );
  }

  function renderHomeTreeRow(
    node: PrototypeTopicNode,
    depth: number,
    parentNodeId: string | null | undefined = null
  ): ReactNode {
    const hasChildren = Boolean(node.children?.length);
    const isExpanded = homeExpandedIds.has(node.id);
    const persistedNode = findPersistedHomeNode(node, parentNodeId);

    return (
      <div key={node.id}>
        <div className="home-v2-tree-row" style={{ paddingLeft: 10 + depth * 34 }}>
          <button
            aria-label={
              hasChildren
                ? `${isExpanded ? 'Collapse' : 'Expand'} ${node.name}`
                : undefined
            }
            className="home-v2-chevron"
            disabled={!hasChildren}
            type="button"
            onClick={() => toggleHomeExpanded(node.id)}
          >
            {hasChildren ? (isExpanded ? '⌄' : '›') : ''}
          </button>
          <span className="home-v2-topic-name">{node.name}</span>
          <HomeProgressBar value={node.progress} />
          <span className="home-v2-percent">{node.progress}%</span>
          <input
            aria-label={`Select ${node.name}`}
            checked={Boolean(
              persistedNode && selectedNodeIds.has(persistedNode.id)
            )}
            className="home-v2-checkbox"
            type="checkbox"
            onChange={() => {
              if (persistedNode) {
                void toggleNodeSelection(persistedNode.id);
              }
            }}
          />
        </div>
        {hasChildren &&
          isExpanded &&
          node.children?.map((child) =>
            renderHomeTreeRow(child, depth + 1, persistedNode?.id)
          )}
      </div>
    );
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

  async function persistNodePreference(nodeId: string, balance: number) {
    if (!activeLibrary?.id || !deck || !userId || !selectedNodeIds.has(nodeId)) {
      return;
    }

    setIsSaving(true);
    setMessage('Saving study preference...');

    const { error } = await supabase.from('study_deck_node_preferences').upsert(
      {
        deck_id: deck.id,
        user_id: userId,
        library_id: activeLibrary.id,
        library_node_id: nodeId,
        new_mastery_balance: balance,
      },
      { onConflict: 'deck_id,library_node_id' }
    );

    if (error) {
      setMessage(`Unable to save study preference: ${error.message}`);
      setIsSaving(false);
      return;
    }

    setMessage('Study preference saved.');
    setIsSaving(false);
  }

  async function toggleSetupCramMode() {
    if (!deck || !userId || isSaving) return;

    const nextCramMode = !isSetupCramMode;
    setIsSaving(true);
    setMessage('Saving Cram Mode preference...');

    const { error } = await supabase
      .from('study_decks')
      .update({ cram_mode: nextCramMode })
      .eq('id', deck.id)
      .eq('user_id', userId);

    if (error) {
      setMessage(`Unable to save Cram Mode preference: ${error.message}`);
      setIsSaving(false);
      return;
    }

    setIsSetupCramMode(nextCramMode);
    setDeck((current) =>
      current ? { ...current, cram_mode: nextCramMode } : current
    );
    setMessage('Cram Mode preference saved.');
    setIsSaving(false);
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
      setNodePreferences((current) =>
        current[nodeId] === undefined ? { ...current, [nodeId]: 50 } : current
      );
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
    const preference = nodePreferences[node.id] ?? 50;

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
            background: selected ? '#eff6ff' : '#ffffff',
            border: selected ? '1px solid #93c5fd' : '1px solid #e2e8f0',
            borderRadius: 14,
            marginBottom: 8,
            minHeight: 62,
            padding: '10px 12px',
            transition: 'all 0.15s ease',
          }}
        >
          <div
            style={{
              alignItems: 'center',
              display: 'flex',
              gap: 10,
            }}
          >
            <button
              type="button"
              onClick={() => toggleExpandedNode(node.id)}
              disabled={children.length === 0}
              aria-label={
                isExpanded ? `Collapse ${node.name}` : `Expand ${node.name}`
              }
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
                onChange={() => void toggleNodeSelection(node.id)}
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

                <span className="muted" style={{ fontSize: 12 }}>
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
          </div>

          {selected && (
            <div
              style={{
                borderTop: '1px solid #dbeafe',
                marginTop: 10,
                padding: '10px 2px 2px 44px',
              }}
            >
              <div
                style={{
                  alignItems: 'center',
                  display: 'flex',
                  gap: 12,
                }}
              >
                <span style={{ color: '#2563eb', fontSize: 12, fontWeight: 700 }}>
                  New
                </span>
                <input
                  aria-label={`${node.name} New to Mastery balance`}
                  disabled={isSetupCramMode}
                  max="100"
                  min="0"
                  type="range"
                  value={preference}
                  onChange={(event) => {
                    const nextBalance = Number(event.target.value);
                    setNodePreferences((current) => ({
                      ...current,
                      [node.id]: nextBalance,
                    }));
                  }}
                  onBlur={(event) =>
                    void persistNodePreference(node.id, Number(event.currentTarget.value))
                  }
                  onKeyUp={(event) =>
                    void persistNodePreference(node.id, Number(event.currentTarget.value))
                  }
                  onPointerUp={(event) =>
                    void persistNodePreference(node.id, Number(event.currentTarget.value))
                  }
                  style={{
                    accentColor: '#2563eb',
                    cursor: isSetupCramMode ? 'not-allowed' : 'pointer',
                    flex: 1,
                    opacity: isSetupCramMode ? 0.5 : 1,
                  }}
                />
                <span style={{ color: '#1e3a8a', fontSize: 12, fontWeight: 700 }}>
                  Mastery
                </span>
                <strong style={{ color: '#0f172a', minWidth: 30, textAlign: 'right' }}>
                  {preference}
                </strong>
              </div>
            </div>
          )}
        </div>

        {isExpanded && children.length > 0 && (
          <div style={{ marginTop: 4 }}>
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
      <>
        {renderLearnerHeader('study-setup-v2')}
        <main className="study-setup-v2-page">
          <section className="study-setup-v2-card" aria-labelledby="study-setup-v2-title">
            <div className="study-setup-v2-title-block">
              <h1 id="study-setup-v2-title">Set Up Deck</h1>
              <p>Choose eligible areas and balance new material with mastery review.</p>
            </div>

            <div className="study-setup-v2-copy-row">
              <div>
                <h2>More New Evidence</h2>
                <p>Focus on new concepts and building knowledge.</p>
              </div>
              <div>
                <h2>More Repetition for Mastery</h2>
                <p>Reinforce what you know and strengthen long-term mastery.</p>
              </div>
            </div>

            <section
              className="study-setup-v2-slider-area"
              aria-label="Topic Tree eligibility and study preferences"
            >
              <div style={{ marginBottom: 14, textAlign: 'left' }}>
                <h2 style={{ marginBottom: 4 }}>Eligible Topic Tree</h2>
                <p className="muted" style={{ margin: 0 }}>
                  Select each area that may contribute questions, then set its New to
                  Mastery preference.
                </p>
              </div>

              <div aria-label="Set Up Deck Topic Tree" style={{ textAlign: 'left' }}>
                {rootNodes.map((node) => renderNode(node))}
              </div>
            </section>

            <div className="study-setup-v2-rule" aria-hidden="true" />

            <section className="study-setup-v2-info">
              <span className="study-setup-v2-info-icon" aria-hidden="true">
                i
              </span>
              <div>
                <h2>How it works</h2>
                <p>
                  Questions are selected based on your chosen balance, your progress,
                  and what will help you learn most effectively right now.
                </p>
              </div>
            </section>

            <div className="study-setup-v2-footer-actions">
              <label className="study-setup-v2-cram">
                <input
                  checked={isSetupCramMode}
                  disabled={isSaving}
                  type="checkbox"
                  onChange={() => void toggleSetupCramMode()}
                />
                <span>
                  <strong>Cram Mode</strong>
                  <small>Maximize number of questions. Less variety, more volume.</small>
                </span>
              </label>

              <button className="study-setup-v2-start" type="button" onClick={openStudyMode}>
                START STUDY
              </button>
            </div>
          </section>
        </main>

        <style jsx global>{`
          .study-setup-v2-header {
            align-items: center;
            background: linear-gradient(180deg, #061846, #041238);
            color: #ffffff;
            display: flex;
            gap: 28px;
            justify-content: space-between;
            min-height: 126px;
            padding: 34px 36px 28px;
          }

          .study-setup-v2-brand {
            align-items: center;
            color: #ffffff;
            display: flex;
            gap: 12px;
            min-width: 500px;
          }

          .study-setup-v2-brand-mark {
            flex: 0 0 auto;
            height: 66px;
            object-fit: contain;
            width: 76px;
          }

          .study-setup-v2-brand strong {
            display: block;
            font-family: Georgia, "Times New Roman", Times, serif;
            font-size: 42px;
            font-weight: 900;
            letter-spacing: -0.055em;
            line-height: 0.95;
          }

          .study-setup-v2-brand span {
            color: #edf4ff;
            display: block;
            font-size: 16px;
            font-weight: 500;
            letter-spacing: -0.02em;
            margin-top: 10px;
          }

          .study-setup-v2-nav {
            align-items: center;
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            justify-content: flex-end;
          }

          .study-setup-v2-nav-item {
            align-items: center;
            background: rgba(6, 24, 70, 0.72);
            border: 1px solid rgba(214, 224, 246, 0.36);
            border-radius: 9px;
            color: #ffffff;
            display: inline-flex;
            font: inherit;
            font-size: 16px;
            font-weight: 800;
            gap: 9px;
            min-height: 58px;
            padding: 13px 16px;
            white-space: nowrap;
          }

          .study-setup-v2-nav-item:disabled {
            cursor: default;
            opacity: 1;
          }

          .study-setup-v2-nav-active,
          .study-setup-v2-nav-account {
            background: #155ee8;
            border-color: #2b71ff;
            box-shadow: 0 12px 26px rgba(21, 94, 232, 0.25);
          }

          .study-setup-v2-nav-icon {
            display: inline-flex;
            height: 23px;
            width: 23px;
          }

          .study-setup-v2-nav-icon svg {
            fill: none;
            height: 100%;
            stroke: currentColor;
            stroke-linecap: round;
            stroke-linejoin: round;
            stroke-width: 2.1;
            width: 100%;
          }

          .study-setup-v2-page {
            background: #f8fafc;
            display: flex;
            justify-content: center;
            min-height: calc(100vh - 126px);
            padding: 52px 40px 64px;
          }

          .study-setup-v2-card {
            background: #ffffff;
            border: 1px solid #e5eaf2;
            border-radius: 14px;
            box-shadow: 0 18px 36px rgba(15, 23, 42, 0.14);
            max-width: 1228px;
            padding: 36px 62px 72px;
            width: 100%;
          }

          .study-setup-v2-title-block {
            text-align: center;
          }

          .study-setup-v2-title-block h1 {
            color: #08143b;
            font-family: Georgia, "Times New Roman", Times, serif;
            font-size: 50px;
            font-weight: 900;
            letter-spacing: -0.055em;
            line-height: 1;
            margin: 0 0 18px;
          }

          .study-setup-v2-title-block p {
            color: #384463;
            font-size: 21px;
            letter-spacing: -0.02em;
            margin: 0;
          }

          .study-setup-v2-copy-row {
            display: grid;
            gap: 28px;
            grid-template-columns: 1fr 1fr;
            margin: 58px 0 44px;
          }

          .study-setup-v2-copy-row div:last-child {
            justify-self: end;
            max-width: 370px;
          }

          .study-setup-v2-copy-row h2 {
            color: #0955e8;
            font-size: 23px;
            font-weight: 900;
            letter-spacing: -0.045em;
            line-height: 1.1;
            margin: 0 0 12px;
          }

          .study-setup-v2-copy-row p {
            color: #2c3654;
            font-size: 19px;
            line-height: 1.45;
            margin: 0;
            max-width: 310px;
          }

          .study-setup-v2-slider-area {
            position: relative;
          }

          .study-setup-v2-slider-wrap {
            height: 58px;
            position: relative;
          }

          .study-setup-v2-slider-track {
            background: #e5e8ee;
            border-radius: 999px;
            box-shadow: inset 0 1px 3px rgba(15, 23, 42, 0.14);
            height: 14px;
            left: 0;
            overflow: hidden;
            position: absolute;
            right: 0;
            top: 22px;
          }

          .study-setup-v2-slider-track span {
            background: #0f5ee8;
            border-radius: inherit;
            display: block;
            height: 100%;
          }

          .study-setup-v2-slider {
            appearance: none;
            background: transparent;
            border: 0;
            height: 58px;
            margin: 0;
            padding: 0;
            position: relative;
            width: 100%;
            z-index: 2;
          }

          .study-setup-v2-slider::-webkit-slider-runnable-track {
            background: transparent;
            border: 0;
            height: 14px;
          }

          .study-setup-v2-slider::-moz-range-track {
            background: transparent;
            border: 0;
            height: 14px;
          }

          .study-setup-v2-slider::-webkit-slider-thumb {
            appearance: none;
            background: #ffffff;
            border: 1px solid #e5e7eb;
            border-radius: 999px;
            box-shadow: 0 8px 18px rgba(15, 23, 42, 0.18);
            height: 58px;
            margin-top: -22px;
            width: 58px;
          }

          .study-setup-v2-slider::-moz-range-thumb {
            background: #ffffff;
            border: 1px solid #e5e7eb;
            border-radius: 999px;
            box-shadow: 0 8px 18px rgba(15, 23, 42, 0.18);
            height: 58px;
            width: 58px;
          }

          .study-setup-v2-ticks {
            display: grid;
            grid-template-columns: repeat(9, 1fr);
            margin: 0 84px;
          }

          .study-setup-v2-ticks span {
            background: #c7ced8;
            height: 13px;
            justify-self: center;
            width: 1px;
          }

          .study-setup-v2-labels {
            color: #161f38;
            display: flex;
            font-size: 18px;
            justify-content: space-between;
            margin-top: 24px;
            padding: 0 24px;
          }

          .study-setup-v2-labels strong {
            font-weight: 900;
          }

          .study-setup-v2-rule {
            border-top: 1px solid #d9dee8;
            margin: 64px 0 54px;
          }

          .study-setup-v2-info {
            align-items: flex-start;
            background: #eff6ff;
            border-radius: 10px;
            display: flex;
            gap: 26px;
            margin: 0 14px;
            padding: 34px 34px 32px;
          }

          .study-setup-v2-info-icon {
            align-items: center;
            border: 2px solid #0f5ee8;
            border-radius: 999px;
            color: #0f5ee8;
            display: inline-flex;
            flex: 0 0 30px;
            font-family: Georgia, "Times New Roman", Times, serif;
            font-size: 22px;
            font-weight: 900;
            height: 30px;
            justify-content: center;
            line-height: 1;
            margin-top: 4px;
            width: 30px;
          }

          .study-setup-v2-info h2 {
            color: #0955e8;
            font-size: 23px;
            font-weight: 900;
            letter-spacing: -0.04em;
            margin: 0 0 12px;
          }

          .study-setup-v2-info p {
            color: #2d3654;
            font-size: 18px;
            line-height: 1.45;
            margin: 0;
            max-width: 720px;
          }

          .study-setup-v2-footer-actions {
            align-items: center;
            display: flex;
            gap: 28px;
            justify-content: center;
            margin: 50px auto 0;
          }

          .study-setup-v2-cram {
            align-items: flex-start;
            color: #101a36;
            display: flex;
            gap: 14px;
            margin: 0;
            max-width: 320px;
          }

          .study-setup-v2-cram input {
            accent-color: #0f5ee8;
            height: 24px;
            margin-top: 3px;
            width: 24px;
          }

          .study-setup-v2-cram strong {
            display: block;
            font-size: 22px;
            font-weight: 900;
            letter-spacing: -0.035em;
            line-height: 1.1;
            margin-bottom: 10px;
          }

          .study-setup-v2-cram small {
            color: #2f3a59;
            display: block;
            font-size: 16px;
            line-height: 1.45;
          }

          .study-setup-v2-start {
            background: #155ee8;
            border: 1px solid #0f4fc7;
            border-radius: 9px;
            box-shadow: 0 12px 26px rgba(21, 94, 232, 0.22);
            color: #ffffff;
            font: inherit;
            font-size: 18px;
            font-weight: 900;
            min-height: 54px;
            padding: 14px 24px;
          }

          @media (max-width: 1100px) {
            .study-setup-v2-header {
              align-items: flex-start;
              flex-direction: column;
              min-height: auto;
            }

            .study-setup-v2-brand {
              min-width: 0;
            }

            .study-setup-v2-brand-mark {
              height: 48px;
              width: 55px;
            }

            .study-setup-v2-nav {
              justify-content: flex-start;
            }
          }

          @media (max-width: 900px) {
            .study-setup-v2-page {
              min-height: auto;
              padding: 28px 18px 42px;
            }

            .study-setup-v2-card {
              padding: 30px 24px 42px;
            }

            .study-setup-v2-title-block h1 {
              font-size: 40px;
            }

            .study-setup-v2-copy-row {
              grid-template-columns: 1fr;
            }

            .study-setup-v2-copy-row div:last-child {
              justify-self: start;
            }

            .study-setup-v2-labels {
              padding: 0;
            }

            .study-setup-v2-footer-actions {
              align-items: stretch;
              flex-direction: column;
            }
          }
        `}</style>
      </>
    );
  }

if (mode === 'study') {
  const authoredStudyAnswer =
    authoredStudyQuestion?.question_accepted_answers[0]?.answer_text || null;

  function StudyCardActions() {
    return (
      <div className="study-v2-card-actions" aria-label="Study card controls">
        <button type="button" onClick={() => void leaveStudyMode('setup')}>
          <span aria-hidden="true">←</span>
          Go Back
        </button>
        <button
          aria-label="Close study mode"
          type="button"
          onClick={() => void leaveStudyMode('dashboard')}
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <>
      {renderLearnerHeader('study-v2')}
      <main className="study-v2-page">
        <section className="study-v2-shell" aria-label="Study Mode">
          <article
            className="study-v2-question-card"
            aria-label="Question card"
            onClick={() => setIsAnswerVisible(true)}
          >
            <div className="study-v2-card-topline">
              <StudyProgressBar />
              <StudyCardActions />
            </div>

            <h1>
              {authoredStudyQuestion ? (
                authoredStudyQuestion.prompt
              ) : (
                <>
                  What is the primary purpose
                  <br />
                  of isolating a patient with
                  <br />
                  suspected MRSA?
                </>
              )}
            </h1>

            <p>Tap to reveal answer</p>
          </article>

          {isAnswerVisible && (
            <article className="study-v2-answer-card" aria-label="Answer card">
              <div className="study-v2-card-topline">
                <StudyProgressBar />
                <StudyCardActions />
              </div>

              <div className="study-v2-answer-body">
                <div className="study-v2-answer-lines">
                  <div className="study-v2-rule" aria-hidden="true" />
                  <p>Answer</p>
                  <p>{authoredStudyAnswer || 'Answer'}</p>
                  <p>Answer</p>
                  <div className="study-v2-rule" aria-hidden="true" />
                  <p>Explanation</p>
                </div>

                <div className="study-v2-scroll-indicator" aria-hidden="true">
                  <span />
                </div>
              </div>

              {studyFeedback === null ? (
                <div className="study-v2-feedback-row">
                  {[
                    ['up', 'Thumbs Up'],
                    ['more', 'More'],
                    ['down', 'Thumbs Down'],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setStudyFeedback(value as StudyFeedback);
                        setStudyResponse(null);
                      }}
                    >
                      <StudyFeedbackIcon
                        type={value as Exclude<StudyFeedback, null>}
                      />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              ) : studyFeedback === 'more' ? (
                <div className="study-v2-response-toolbar">
                  <button
                    className="study-v2-response-back"
                    type="button"
                    onClick={() => {
                      setStudyFeedback(null);
                      setStudyResponse(null);
                    }}
                  >
                    ← Back
                  </button>
                  <p>More options coming later</p>
                </div>
              ) : (
                <div className="study-v2-response-stage">
                  <div className="study-v2-response-toolbar">
                    <button
                      className="study-v2-response-back"
                      type="button"
                      onClick={() => {
                        setStudyFeedback(null);
                        setStudyResponse(null);
                      }}
                    >
                      ← Back
                    </button>
                  </div>
                  <div className="study-v2-rating-row">
                    {(studyFeedback === 'up'
                      ? [
                          ['easy', 'Easy', 'I knew this well'],
                          ['average', 'Average', 'I knew part of this'],
                          ['hard', 'Hard', 'This was challenging'],
                        ]
                      : [
                          ['didnt_know', "Didn't Know", 'I had no idea'],
                          [
                            'forgot',
                            'Forgot / Got It Wrong',
                            'I knew it before but missed it',
                          ],
                          ['too_hard', 'Too Hard', 'This was above my level'],
                        ]
                    ).map(([value, label, subtitle]) => (
                      <button
                        aria-pressed={studyResponse === value}
                        className={`study-v2-rating-button study-v2-rating-${value}${
                          studyResponse === value
                            ? ' study-v2-rating-active'
                            : ''
                        }`}
                        key={value}
                        type="button"
                        onClick={() =>
                          void persistFinalStudyResponse(
                            value as Exclude<StudyResponse, null>
                          )
                        }
                      >
                        <strong>{label}</strong>
                        <span>{subtitle}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </article>
          )}

        </section>
      </main>

      <style jsx global>{`
        .study-v2-header {
          align-items: center;
          background: linear-gradient(180deg, #061846, #041238);
          color: #ffffff;
          display: flex;
          gap: 28px;
          justify-content: space-between;
          min-height: 107px;
          padding: 26px 22px 24px;
        }

        .study-v2-brand {
          align-items: center;
          color: #ffffff;
          display: flex;
          gap: 12px;
          min-width: 320px;
        }

        .study-v2-brand-mark {
          flex: 0 0 auto;
          height: 66px;
          object-fit: contain;
          width: 76px;
        }

        .study-v2-brand strong {
          display: block;
          font-family: Georgia, "Times New Roman", Times, serif;
          font-size: 40px;
          font-weight: 900;
          letter-spacing: -0.055em;
          line-height: 0.95;
        }

        .study-v2-brand span {
          color: #edf4ff;
          display: block;
          font-size: 14px;
          font-weight: 500;
          letter-spacing: -0.03em;
          margin-top: 9px;
        }

        .study-v2-nav {
          align-items: center;
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          justify-content: flex-end;
        }

        .study-v2-nav-item {
          align-items: center;
          background: rgba(6, 24, 70, 0.72);
          border: 1px solid rgba(214, 224, 246, 0.36);
          border-radius: 7px;
          color: #ffffff;
          display: inline-flex;
          font: inherit;
          font-size: 14px;
          font-weight: 800;
          gap: 8px;
          min-height: 54px;
          padding: 13px 14px;
          white-space: nowrap;
        }

        .study-v2-nav-item:disabled {
          cursor: default;
          opacity: 1;
        }

        .study-v2-nav-active,
        .study-v2-nav-account {
          background: #155ee8;
          border-color: #2b71ff;
          box-shadow: 0 12px 26px rgba(21, 94, 232, 0.25);
        }

        .study-v2-nav-icon {
          display: inline-flex;
          height: 22px;
          width: 22px;
        }

        .study-v2-nav-icon svg {
          fill: none;
          height: 100%;
          stroke: currentColor;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-width: 2.1;
          width: 100%;
        }

        .study-v2-page {
          background: #f8fafc;
          min-height: calc(100vh - 107px);
          padding: 50px 24px 58px;
        }

        .study-v2-shell {
          background: #ffffff;
          border: 1px solid #e5eaf2;
          border-radius: 8px;
          box-shadow: 0 18px 36px rgba(15, 23, 42, 0.14);
          margin: 0 auto;
          max-width: 906px;
          padding: 48px 28px 28px;
        }

        .study-v2-question-card,
        .study-v2-answer-card {
          background: #ffffff;
          border: 1px solid #dbe2ee;
          border-radius: 8px;
          overflow: hidden;
        }

        .study-v2-question-card {
          cursor: pointer;
          min-height: 540px;
          padding: 13px 22px 90px;
        }

        .study-v2-answer-card {
          margin-top: 24px;
          min-height: 620px;
          padding-top: 13px;
        }

        .study-v2-card-topline {
          align-items: center;
          display: grid;
          gap: 38px;
          grid-template-columns: minmax(0, 1fr) auto;
        }

        .study-v2-progress {
          background: #e5e8ee;
          border-radius: 999px;
          height: 13px;
          overflow: hidden;
        }

        .study-v2-progress span {
          background: #0f5ee8;
          border-radius: inherit;
          display: block;
          height: 100%;
          width: 56%;
        }

        .study-v2-card-actions {
          align-items: center;
          color: #06133c;
          display: flex;
          gap: 28px;
        }

        .study-v2-card-actions button {
          align-items: center;
          background: transparent;
          border: 0;
          color: inherit;
          display: inline-flex;
          font: inherit;
          font-size: 23px;
          font-weight: 650;
          gap: 10px;
          padding: 0;
        }

        .study-v2-card-actions button:last-child {
          font-size: 48px;
          font-weight: 300;
          line-height: 0.8;
        }

        .study-v2-question-card h1 {
          color: #08143b;
          font-family: Georgia, "Times New Roman", Times, serif;
          font-size: 43px;
          font-weight: 650;
          letter-spacing: -0.035em;
          line-height: 1.45;
          margin: 108px auto 0;
          max-width: 620px;
          text-align: center;
        }

        .study-v2-question-card p {
          color: #77797e;
          font-size: 25px;
          font-weight: 650;
          margin: 84px 0 0;
          text-align: center;
        }

        .study-v2-answer-card .study-v2-card-topline {
          padding: 0 22px;
        }

        .study-v2-answer-body {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 84px;
          min-height: 398px;
          padding: 52px 0 0;
        }

        .study-v2-answer-lines {
          color: #08143b;
          font-family: Georgia, "Times New Roman", Times, serif;
          font-size: 31px;
          font-weight: 500;
          justify-self: center;
          letter-spacing: -0.035em;
          line-height: 1.12;
          max-width: 330px;
          text-align: center;
          width: 100%;
        }

        .study-v2-answer-lines p {
          margin: 0 0 26px;
        }

        .study-v2-answer-lines p:nth-of-type(4) {
          margin-top: 42px;
        }

        .study-v2-rule {
          border-top: 2px solid #cfd3da;
          margin: 0 0 30px;
          width: 100%;
        }

        .study-v2-answer-lines .study-v2-rule:last-of-type {
          margin: 10px 0 42px;
        }

        .study-v2-scroll-indicator {
          align-self: center;
          background: #c9ccd2;
          border-radius: 999px;
          height: 300px;
          justify-self: center;
          position: relative;
          width: 6px;
        }

        .study-v2-scroll-indicator::before {
          border: solid #c9ccd2;
          border-width: 0 4px 4px 0;
          content: '';
          height: 11px;
          left: -5px;
          position: absolute;
          top: -2px;
          transform: rotate(-135deg);
          width: 11px;
        }

        .study-v2-scroll-indicator::after {
          background: #0f5ee8;
          border-radius: 999px;
          bottom: -3px;
          content: '';
          height: 15px;
          left: -4px;
          position: absolute;
          width: 15px;
        }

        .study-v2-scroll-indicator span {
          background: #0f5ee8;
          border-radius: 999px;
          display: block;
          height: 108px;
          margin-top: 43px;
          width: 100%;
        }

        .study-v2-feedback-row {
          border-top: 1px solid #dbe2ee;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          min-height: 174px;
        }

        .study-v2-feedback-row button {
          align-items: center;
          background: transparent;
          border: 0;
          border-right: 1px solid #dbe2ee;
          color: #08143b;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          font: inherit;
          font-family: Georgia, "Times New Roman", Times, serif;
          font-size: 24px;
          gap: 18px;
          justify-content: center;
        }

        .study-v2-feedback-row button:last-child {
          border-right: 0;
        }

        .study-v2-feedback-active {
          background: #eff6ff !important;
        }

        .study-v2-feedback-svg {
          fill: none;
          height: 58px;
          stroke: #0f5ee8;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-width: 3;
          width: 58px;
        }

        .study-v2-more-dots {
          color: #0f5ee8;
          font-family: system-ui, sans-serif;
          font-size: 45px;
          font-weight: 900;
          letter-spacing: 0.12em;
          line-height: 0.8;
        }

        .study-v2-response-toolbar {
          align-items: center;
          border-top: 1px solid #dbe2ee;
          display: flex;
          gap: 18px;
          min-height: 64px;
          padding: 12px 20px;
        }

        .study-v2-response-toolbar p {
          color: #475569;
          flex: 1;
          margin: 0;
          text-align: center;
        }

        .study-v2-response-back {
          background: transparent;
          border: 0;
          color: #0f5ee8;
          cursor: pointer;
          font: inherit;
          font-weight: 700;
        }

        .study-v2-rating-row {
          border-top: 1px solid #dbe2ee;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          min-height: 174px;
        }

        .study-v2-rating-button {
          align-items: center;
          border: 0;
          border-right: 1px solid #dbe2ee;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          font: inherit;
          font-family: Georgia, "Times New Roman", Times, serif;
          gap: 12px;
          justify-content: center;
          padding: 24px;
        }

        .study-v2-rating-button:last-child {
          border-right: 0;
        }

        .study-v2-rating-button strong {
          font-size: 26px;
        }

        .study-v2-rating-button span {
          color: #334155;
          font-family: system-ui, sans-serif;
          font-size: 16px;
          font-weight: 600;
        }

        .study-v2-rating-easy {
          background: #f0fdf4;
          color: #2f8f46;
        }

        .study-v2-rating-average {
          background: #fffbeb;
          color: #9a6c00;
        }

        .study-v2-rating-hard {
          background: #fff7ed;
          color: #e3642a;
        }

        .study-v2-rating-didnt_know {
          background: #fff1f2;
          color: #be123c;
        }

        .study-v2-rating-forgot {
          background: #fff7ed;
          color: #c2410c;
        }

        .study-v2-rating-too_hard {
          background: #fef2f2;
          color: #b91c1c;
        }

        .study-v2-rating-active {
          box-shadow: inset 0 0 0 3px currentColor;
        }

        .study-v2-cram {
          align-items: center;
          color: #08143b;
          display: flex;
          font-size: 24px;
          gap: 16px;
          justify-content: flex-end;
          margin: 34px 16px 0 0;
        }

        .study-v2-cram input {
          accent-color: #0f5ee8;
          height: 25px;
          width: 25px;
        }

        @media (max-width: 900px) {
          .study-v2-header {
            align-items: flex-start;
            flex-direction: column;
          }

          .study-v2-brand-mark {
            height: 48px;
            width: 55px;
          }

          .study-v2-nav {
            justify-content: flex-start;
          }

          .study-v2-page {
            padding: 24px 14px 36px;
          }

          .study-v2-shell {
            padding: 24px 14px;
          }

          .study-v2-question-card h1 {
            font-size: 33px;
          }

          .study-v2-card-topline {
            gap: 18px;
            grid-template-columns: 1fr;
          }

          .study-v2-card-actions {
            justify-content: flex-end;
          }

          .study-v2-answer-body {
            grid-template-columns: 1fr;
          }

          .study-v2-scroll-indicator {
            display: none;
          }

          .study-v2-feedback-row {
            grid-template-columns: 1fr;
          }

          .study-v2-feedback-row button {
            border-bottom: 1px solid #dbe2ee;
            border-right: 0;
            min-height: 140px;
          }

          .study-v2-rating-row {
            grid-template-columns: 1fr;
          }

          .study-v2-rating-button {
            border-bottom: 1px solid #dbe2ee;
            border-right: 0;
            min-height: 140px;
          }
        }
      `}</style>
    </>
  );
}

  return (
    <>
      {renderLearnerHeader('home-v2')}
      <main className="home-v2-shell">
        <aside className="home-v2-rail" aria-label="Deck navigation">
          <div className="home-v2-rail-list">
            {homeRailItems.map((item) => (
              <button
                className="home-v2-rail-card"
                key={item.label}
                type="button"
                onClick={item.label === 'Set Up Deck' ? openSetupMode : undefined}
              >
                <RailIcon icon={item.icon} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
          <button className="home-v2-logout" type="button" onClick={handleLogout}>
            <RailIcon icon="edit" />
            <span>Log Out</span>
          </button>
        </aside>

        <section className="home-v2-workspace">
          <div className="home-v2-topline">
            <h2>Welcome back, {displayName}!</h2>
            <button
              className="home-v2-account"
              type="button"
              title={email ? `Signed in as ${email}` : 'Account settings'}
            >
              <RailIcon icon="gear" />
              <span>Account Settings</span>
              <span aria-hidden="true">⌄</span>
            </button>
          </div>

          <div className="home-v2-hero">
            <button className="home-v2-study" type="button" onClick={openStudyMode}>
              STUDY
            </button>

            <div className="home-v2-modes" aria-label="Study mode controls">
              {(['Learn', 'Study', 'Cram'] as DeckMode[]).map((deckMode) => (
                <label key={deckMode}>
                  <input
                    checked={selectedDeckModes.has(deckMode)}
                    type="checkbox"
                    onChange={() => toggleDeckMode(deckMode)}
                  />
                  <span>{deckMode}</span>
                </label>
              ))}
            </div>
          </div>

          <section className="home-v2-deck-card" aria-labelledby="progress-summary-title">
            <h3 id="progress-summary-title">
              Current Deck: <span>{activeLibrary.name}</span>
            </h3>
            <div className="home-v2-progress-list">
              {prototypeProgressRows.map((row) => (
                <div className="home-v2-progress-row" key={row.id}>
                  <span className="home-v2-chevron">{row.canExpand ? '›' : ''}</span>
                  <span className="home-v2-topic-name">{row.name}</span>
                  <HomeProgressBar value={row.progress} />
                  <span className="home-v2-percent">{row.progress}%</span>
                </div>
              ))}
            </div>
          </section>

          <section className="home-v2-deck-card" aria-labelledby="tree-title">
            <h3 id="tree-title">
              Current Deck: <span>{activeLibrary.name}</span>
            </h3>
            <div className="home-v2-tree">
              {prototypeTopicTree.map((node) => renderHomeTreeRow(node, 0))}
            </div>
          </section>
        </section>
      </main>

      <style jsx global>{`
        .home-v2-header {
          align-items: center;
          background: linear-gradient(180deg, #061846, #041238);
          box-shadow: 0 1px 0 rgba(255, 255, 255, 0.1);
          color: #ffffff;
          display: flex;
          gap: 24px;
          justify-content: space-between;
          min-height: 88px;
          padding: 16px 28px;
        }

        .home-v2-brand {
          align-items: center;
          color: #ffffff;
          display: flex;
          min-width: 0;
          width: fit-content;
        }

        .home-v2-brand-logo {
          flex: 0 0 auto;
          height: auto;
          object-fit: contain;
          width: clamp(220px, 20vw, 270px);
        }

        .home-v2-brand strong {
          display: block;
          font-size: 31px;
          font-weight: 900;
          letter-spacing: -0.04em;
          line-height: 1;
        }

        .home-v2-brand small {
          color: #c8d4ee;
          display: block;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.01em;
          line-height: 1.15;
          margin-top: 4px;
        }

        .home-v2-nav {
          align-items: center;
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          justify-content: flex-end;
        }

        .home-v2-nav-item {
          align-items: center;
          background: rgba(7, 25, 70, 0.72);
          border: 1px solid rgba(198, 210, 236, 0.32);
          border-radius: 8px;
          color: #ffffff;
          display: inline-flex;
          font: inherit;
          font-size: 16px;
          font-weight: 650;
          gap: 8px;
          min-height: 46px;
          padding: 10px 14px;
          white-space: nowrap;
        }

        .home-v2-nav-item:disabled {
          cursor: default;
          opacity: 1;
        }

        .home-v2-nav-account {
          background: rgba(19, 55, 129, 0.7);
          border-color: rgba(219, 226, 242, 0.42);
        }

        .home-v2-nav-icon {
          display: inline-flex;
          height: 22px;
          width: 22px;
        }

        .home-v2-nav-icon svg {
          fill: none;
          height: 100%;
          stroke: currentColor;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-width: 2.1;
          width: 100%;
        }

        .home-v2-shell {
          background: #f8fafc;
          display: grid;
          grid-template-columns: 376px minmax(0, 1fr);
          min-height: calc(100vh - 88px);
        }

        .home-v2-rail {
          background: #ffffff;
          border-right: 1px solid #dbe3ef;
          display: flex;
          flex-direction: column;
          gap: 28px;
          justify-content: space-between;
          padding: 28px 32px;
        }

        .home-v2-rail-list {
          display: grid;
          gap: 22px;
        }

        .home-v2-rail-card,
        .home-v2-logout,
        .home-v2-account {
          align-items: center;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          color: #08143b;
          display: flex;
          font: inherit;
          font-size: 22px;
          font-weight: 800;
          gap: 28px;
          min-height: 112px;
          padding: 20px 34px;
          text-align: left;
          transition:
            border-color 0.15s ease,
            box-shadow 0.15s ease,
            transform 0.15s ease;
          width: 100%;
        }

        .home-v2-rail-card {
          background: linear-gradient(180deg, #155ee8, #0f4fc7);
          border-color: #0d47b7;
          box-shadow: 0 14px 26px rgba(15, 79, 199, 0.18);
          color: #ffffff;
          font-size: 24px;
          font-weight: 900;
          letter-spacing: -0.04em;
          line-height: 1;
        }

        .home-v2-rail-card:hover,
        .home-v2-logout:hover,
        .home-v2-account:hover {
          border-color: #2563eb;
          box-shadow: 0 12px 30px rgba(37, 99, 235, 0.12);
          transform: translateY(-1px);
        }

        .home-v2-logout {
          border: 0;
          border-radius: 0;
          border-top: 1px solid #dbe3ef;
          font-size: 21px;
          font-weight: 900;
          letter-spacing: -0.035em;
          min-height: 86px;
          padding: 28px 34px 0;
        }

        .home-v2-rail-icon {
          color: #0b5ee8;
          display: inline-flex;
          flex: 0 0 46px;
          height: 46px;
          width: 46px;
        }

        .home-v2-rail-card .home-v2-rail-icon {
          color: #ffffff;
        }

        .home-v2-rail-icon svg {
          fill: none;
          height: 100%;
          stroke: currentColor;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-width: 2.3;
          width: 100%;
        }

        .home-v2-workspace {
          padding: 38px 34px 54px 40px;
        }

        .home-v2-topline {
          align-items: center;
          display: flex;
          gap: 24px;
          justify-content: space-between;
          margin: 0 auto 28px;
          max-width: 1050px;
        }

        .home-v2-topline h2 {
          color: #08143b;
          font-size: 31px;
          font-weight: 900;
          letter-spacing: -0.045em;
          line-height: 1.08;
          margin: 0;
        }

        .home-v2-account {
          border: 0;
          color: #475569;
          font-size: 16px;
          font-weight: 600;
          gap: 12px;
          justify-content: flex-end;
          min-height: auto;
          padding: 8px 0;
          width: auto;
        }

        .home-v2-account .home-v2-rail-icon {
          color: #475569;
          flex-basis: 26px;
          height: 26px;
          width: 26px;
        }

        .home-v2-hero {
          align-items: center;
          display: grid;
          gap: 54px;
          grid-template-columns: minmax(320px, 596px) 180px;
          justify-content: center;
          margin-bottom: 30px;
        }

        .home-v2-study {
          background: linear-gradient(180deg, #2563eb, #1555d5);
          border: 1px solid #0f4fc7;
          border-radius: 8px;
          box-shadow: 0 16px 30px rgba(37, 99, 235, 0.22);
          color: #ffffff;
          font-size: 58px;
          font-weight: 900;
          letter-spacing: 0.01em;
          line-height: 0.95;
          min-height: 144px;
          text-shadow: 0 2px 6px rgba(8, 20, 59, 0.24);
          width: 100%;
        }

        .home-v2-modes {
          display: grid;
          gap: 18px;
        }

        .home-v2-modes label {
          align-items: center;
          color: #0f172a;
          display: flex;
          font-size: 20px;
          gap: 16px;
        }

        .home-v2-modes input,
        .home-v2-checkbox {
          accent-color: #2563eb;
          height: 25px;
          width: 25px;
        }

        .home-v2-deck-card {
          background: #ffffff;
          border: 1px solid #dbe3ef;
          border-radius: 8px;
          margin: 0 auto 18px;
          max-width: 840px;
          padding: 24px 28px;
        }

        .home-v2-deck-card h3 {
          color: #08143b;
          font-size: 24px;
          font-weight: 900;
          letter-spacing: -0.04em;
          line-height: 1.12;
          margin: 0 0 20px;
        }

        .home-v2-deck-card h3 span {
          color: #0b5ee8;
          font-weight: 900;
          margin-left: 8px;
        }

        .home-v2-progress-list,
        .home-v2-tree {
          display: grid;
          gap: 12px;
        }

        .home-v2-progress-row,
        .home-v2-tree-row {
          align-items: center;
          color: #172554;
          display: grid;
          gap: 16px;
          grid-template-columns: 22px minmax(170px, 1fr) minmax(220px, 382px) 48px;
          min-height: 32px;
        }

        .home-v2-tree-row {
          grid-template-columns: 22px minmax(150px, 1fr) minmax(170px, 326px) 54px 34px;
          position: relative;
        }

        .home-v2-tree-row:not(:first-child)::before {
          background: #e2e8f0;
          content: '';
          height: 1px;
          left: 42px;
          position: absolute;
          top: -6px;
          width: 44px;
        }

        .home-v2-chevron {
          background: transparent;
          border: 0;
          color: #08143b;
          font: inherit;
          font-size: 24px;
          line-height: 1;
          padding: 0;
          text-align: center;
        }

        .home-v2-chevron:disabled {
          cursor: default;
        }

        .home-v2-topic-name {
          color: #101b43;
          font-size: 17px;
          font-weight: 500;
          letter-spacing: -0.01em;
        }

        .home-v2-progress {
          background: #e8edf5;
          border-radius: 999px;
          box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.08);
          height: 10px;
          overflow: hidden;
          width: 100%;
        }

        .home-v2-progress span {
          background: linear-gradient(90deg, #0b5ee8, #155ee8);
          border-radius: inherit;
          display: block;
          height: 100%;
        }

        .home-v2-percent {
          color: #172554;
          font-size: 17px;
          font-weight: 650;
          text-align: right;
        }

        @media (max-width: 1100px) {
          .home-v2-header,
          .home-v2-brand,
          .home-v2-nav {
            align-items: flex-start;
          }

          .home-v2-header {
            flex-direction: column;
          }

          .home-v2-brand {
            min-width: 0;
          }

          .home-v2-shell {
            grid-template-columns: 1fr;
          }

          .home-v2-rail {
            border-right: 0;
            border-bottom: 1px solid #dbe3ef;
          }

          .home-v2-rail-list {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .home-v2-hero {
            grid-template-columns: 1fr;
            gap: 24px;
          }

          .home-v2-modes {
            grid-template-columns: repeat(3, max-content);
            justify-content: center;
          }
        }

        @media (max-width: 720px) {
          .home-v2-rail,
          .home-v2-workspace {
            padding: 20px;
          }

          .home-v2-rail-list {
            grid-template-columns: 1fr;
          }

          .home-v2-topline {
            align-items: flex-start;
            flex-direction: column;
          }

          .home-v2-study {
            font-size: 40px;
            min-height: 112px;
          }

          .home-v2-progress-row,
          .home-v2-tree-row {
            grid-template-columns: 22px minmax(0, 1fr) 48px;
          }

          .home-v2-progress-row .home-v2-progress,
          .home-v2-tree-row .home-v2-progress,
          .home-v2-tree-row .home-v2-checkbox {
            grid-column: 2 / -1;
          }

          .home-v2-tree-row .home-v2-checkbox {
            justify-self: start;
          }
        }
      `}</style>
    </>
  );
}
