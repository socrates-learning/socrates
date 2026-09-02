'use client';

import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Header, HeaderSessionProvider } from '@/components/Header';
import {
  getBootstrapErrorMessage,
  getHomeBootstrapView,
  hasAuthoritativeInitialDeckData,
} from '@/lib/home-bootstrap';
import { supabase } from '@/lib/supabase';
import type { ActiveLibrary, ActiveLibraryRole } from '@/lib/library-context';
import type { StudyPlannerInitialData } from '@/lib/study-planner-initial-data';
import {
  selectNextStudyCandidate,
  type StudyCandidate,
} from '@/lib/study-candidates';
import { recordPersonalStudyAttempt } from '@/lib/personal-study-attempts';
import {
  classifyStudySessionStart,
  type StudySessionStartOutcome,
} from '@/lib/study-session-start';
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

type PersonalTopic = {
  id: string;
  parent_id: string | null;
  name: string;
  sort_order: number;
};

type PersonalConcept = {
  id: string;
  topic_id: string;
  name: string;
};

type PersonalCard = {
  id: string;
  concept_id: string;
};

type PersonalCollection = {
  id: string;
  name: string;
  cardCount: number;
};

type PersonalCollectionRow = {
  id: string;
  name: string;
  personal_collection_cards:
    | { count: number }[]
    | { count: number }
    | null;
};

type LearnerProgressMetric = {
  total_concepts: number;
  assessed_concepts: number;
  unseen_concepts: number;
  assessed_mastery_percent: number | null;
  coverage_adjusted_progress_percent: number;
  evidence_count: number;
  questions_answered: number;
};

type LearnerProgressNode = LearnerProgressMetric & {
  library_node_id: string;
  name: string;
  parent_id: string | null;
  sort_order: number | null;
};

type LearnerProgressResponse = {
  library_id: string;
  summary: LearnerProgressMetric & {
    recent_session_count: number;
  };
  nodes: LearnerProgressNode[];
  recent_sessions: Array<{
    id: string;
    study_deck_id: string | null;
    deck_name: string | null;
    started_at: string;
    ended_at: string | null;
    answered_count: number;
  }>;
};

const emptyLearnerProgress: LearnerProgressResponse = {
  library_id: '',
  summary: {
    total_concepts: 0,
    assessed_concepts: 0,
    unseen_concepts: 0,
    assessed_mastery_percent: null,
    coverage_adjusted_progress_percent: 0,
    evidence_count: 0,
    questions_answered: 0,
    recent_session_count: 0,
  },
  nodes: [],
  recent_sessions: [],
};

type ConceptOverride = 'included' | 'excluded';
type PlannerMode = 'dashboard' | 'setup' | 'stats' | 'study';
type StudyFeedback = 'up' | 'more' | 'down' | null;
type StudyCardFeedbackType = 'error' | 'suggestion';
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
  { href: '/creator/concepts/new', icon: 'creator', label: 'Creator Studio' },
  { href: '/admin/users', icon: 'admin', label: 'Admin' },
];

const homeRailItems: Array<{ label: string; icon: string; href?: string }> = [
  { label: 'Study Creator', icon: 'edit', href: '/study-creator' },
  { label: 'Stats', icon: 'bars' },
  { label: 'Account Settings', icon: 'gear' },
  { label: 'Menu', icon: 'people' },
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
    <div
      className="home-v2-progress"
      aria-label={`${value}% coverage-adjusted progress`}
    >
      <span style={{ width: `${value}%` }} />
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
  initialDeckData,
  initialSession,
}: {
  activeLibrary: ActiveLibrary | null;
  initialDeckData?: StudyPlannerInitialData;
  initialSession?: {
    userId: string;
    email: string | null;
    displayName: string;
    role: ActiveLibraryRole;
  } | null;
}) {
  const router = useRouter();
  const initialRootNodeId =
    initialDeckData?.nodes.find((node) => node.parent_id === null)?.id || null;
  const initialPersonalRootTopicIds =
    initialDeckData?.personalTopics
      .filter((topic) => topic.parent_id === null)
      .map((topic) => topic.id) || [];
  const [mode, setMode] = useState<PlannerMode>('dashboard');
  const [userId, setUserId] = useState<string | null>(
    initialSession?.userId ?? null
  );
  const [email, setEmail] = useState<string | null>(
    initialSession?.email ?? null
  );
  const [role, setRole] = useState<string | null>(
    initialSession?.role ?? null
  );
  const [displayName, setDisplayName] = useState(
    initialSession?.displayName ?? 'there'
  );
  const [availableLibraries, setAvailableLibraries] = useState<ActiveLibrary[]>(
    initialDeckData?.availableLibraries || (activeLibrary ? [activeLibrary] : [])
  );
  const [deck, setDeck] = useState<StudyDeck | null>(initialDeckData?.deck || null);
  const [nodes, setNodes] = useState<LibraryNode[]>(initialDeckData?.nodes || []);
  const [placements, setPlacements] = useState<Placement[]>(
    initialDeckData?.placements || []
  );
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>(
    initialDeckData?.questionCounts || {}
  );
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(
    new Set(initialDeckData?.selectedNodeIds || [])
  );
  const [nodePreferences, setNodePreferences] = useState<Record<string, number>>(
    initialDeckData?.nodePreferences || {}
  );
  const [conceptOverrides, setConceptOverrides] = useState<
    Record<string, ConceptOverride>
  >(initialDeckData?.conceptOverrides || {});
  const [resolvedConcepts, setResolvedConcepts] = useState<StudyDeckConcept[]>(
    initialDeckData?.resolvedConcepts || []
  );
  const [personalTopics, setPersonalTopics] = useState<PersonalTopic[]>(
    initialDeckData?.personalTopics || []
  );
  const [personalConcepts, setPersonalConcepts] = useState<PersonalConcept[]>(
    initialDeckData?.personalConcepts || []
  );
  const [personalCards, setPersonalCards] = useState<PersonalCard[]>(
    initialDeckData?.personalCards || []
  );
  const [selectedPersonalTopicIds, setSelectedPersonalTopicIds] = useState<
    Set<string>
  >(new Set(initialDeckData?.selectedPersonalTopicIds || []));
  const [personalCollections, setPersonalCollections] = useState<
    PersonalCollection[]
  >(initialDeckData?.personalCollections || []);
  const [selectedPersonalCollectionIds, setSelectedPersonalCollectionIds] =
    useState<Set<string>>(
      new Set(initialDeckData?.selectedPersonalCollectionIds || [])
    );
  const [expandedPersonalTopicIds, setExpandedPersonalTopicIds] = useState<
    Set<string>
  >(new Set(initialPersonalRootTopicIds));
  const [learnerProgress, setLearnerProgress] =
    useState<LearnerProgressResponse>(
      initialDeckData?.learnerProgress || emptyLearnerProgress
    );
  const [learnerProgressError, setLearnerProgressError] = useState(
    initialDeckData?.learnerProgressError || ''
  );
  const [studyCandidate, setStudyCandidate] = useState<StudyCandidate | null>(null);
  const [isStudySequenceComplete, setIsStudySequenceComplete] = useState(false);
  const [studyStartFailure, setStudyStartFailure] = useState<
    Exclude<StudySessionStartOutcome['kind'], 'started'> | null
  >(null);
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(
    new Set(initialRootNodeId ? [initialRootNodeId] : [])
  );
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(
    initialRootNodeId
  );
  const [message, setMessage] = useState(initialDeckData?.loadError || '');
  const [bootstrapError, setBootstrapError] = useState('');
  const [isLoading, setIsLoading] = useState(!initialDeckData);
  const [isSaving, setIsSaving] = useState(false);
  const [homeExpandedIds, setHomeExpandedIds] = useState<Set<string>>(
    new Set(initialRootNodeId ? [initialRootNodeId] : [])
  );
  const [isSetupCramMode, setIsSetupCramMode] = useState(
    Boolean(initialDeckData?.deck?.cram_mode)
  );
  const [isAnswerVisible, setIsAnswerVisible] = useState(false);
  const [studyFeedback, setStudyFeedback] = useState<StudyFeedback>(null);
  const [studyResponse, setStudyResponse] = useState<StudyResponse>(null);
  const [studyCardFeedbackType, setStudyCardFeedbackType] =
    useState<StudyCardFeedbackType | null>(null);
  const [studyCardFeedbackMessage, setStudyCardFeedbackMessage] = useState('');
  const [studyCardFeedbackError, setStudyCardFeedbackError] = useState('');
  const [isStudyCardFeedbackSubmitting, setIsStudyCardFeedbackSubmitting] =
    useState(false);
  const [isStudyCardFeedbackSent, setIsStudyCardFeedbackSent] = useState(false);
  const studyResponseSaveLock = useRef(false);
  const studyCardFeedbackSaveLock = useRef(false);
  const studyCardFeedbackConfirmationTimer = useRef<number | null>(null);
  const studyResponseRecordedForCard = useRef(false);
  const studyModeOpenLock = useRef(false);
  const studySessionIdRef = useRef<string | null>(null);
  const studySessionCreatePromiseRef = useRef<Promise<string | null> | null>(null);
  const authoredStudyQuestion = studyCandidate?.kind === 'official'
    ? {
        id: studyCandidate.questionId,
        concept_id: studyCandidate.conceptId,
        prompt: studyCandidate.prompt,
        explanation: studyCandidate.explanation,
        difficulty: studyCandidate.difficulty,
        testing_angle: studyCandidate.testingAngle,
        question_accepted_answers: [
          {
            answer_text: studyCandidate.answer,
            sort_order: 0,
          },
        ],
      }
    : null;

  const nodesById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes]
  );
  const learnerProgressByNodeId = useMemo(
    () =>
      new Map(
        learnerProgress.nodes.map((nodeProgress) => [
          nodeProgress.library_node_id,
          nodeProgress,
        ])
      ),
    [learnerProgress.nodes]
  );

  useEffect(() => {
    return () => {
      if (studyCardFeedbackConfirmationTimer.current !== null) {
        window.clearTimeout(studyCardFeedbackConfirmationTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    if (hasAuthoritativeInitialDeckData(initialDeckData, activeLibrary)) {
      setMode(
        window.location.hash === '#set-up-deck'
          ? 'setup'
          : window.location.hash === '#stats'
            ? 'stats'
            : 'dashboard'
      );

      return () => {
        isMounted = false;
      };
    }

    async function loadDeck() {
      setIsLoading(true);
      setMessage('');
      setBootstrapError('');
      setLearnerProgressError('');
      setDeck(null);
      setNodes([]);
      setPlacements([]);
      setQuestionCounts({});
      setSelectedNodeIds(new Set());
      setNodePreferences({});
      setConceptOverrides({});
      setResolvedConcepts([]);
      setPersonalTopics([]);
      setPersonalConcepts([]);
      setPersonalCards([]);
      setSelectedPersonalTopicIds(new Set());
      setExpandedPersonalTopicIds(new Set());
      setLearnerProgress(emptyLearnerProgress);
      setMode(
        window.location.hash === '#set-up-deck'
          ? 'setup'
          : window.location.hash === '#stats'
            ? 'stats'
            : 'dashboard'
      );

      try {
        let loadedUserId: string | null = null;
        let loadedEmail: string | null = null;
        let loadedRole: string | null = null;
        let loadedDisplayName = 'there';

        if (initialSession !== undefined) {
          loadedUserId = initialSession?.userId ?? null;
          loadedEmail = initialSession?.email ?? null;
          loadedRole = initialSession?.role ?? null;
          loadedDisplayName = initialSession?.displayName ?? 'there';
        } else {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) {
          throw new Error(`Unable to verify your session: ${authError.message}`);
        }

        if (user) {
          const { data: roleData, error: roleError } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .maybeSingle();

          if (roleError) {
            throw new Error(`Unable to load your account role: ${roleError.message}`);
          }

          loadedUserId = user.id;
          loadedEmail = user.email ?? 'Account';
          loadedRole = roleData?.role ?? null;
          loadedDisplayName =
            (user.user_metadata?.full_name as string | undefined) ||
            (user.email ? user.email.split('@')[0] : 'there');
          }
        }

        if (!isMounted) return;

        if (!loadedUserId) {
          setUserId(null);
          setEmail(null);
          setRole(null);
          setMessage('Sign in to set up your deck.');
          return;
        }

      const availableLibrariesPromise =
        loadedRole === 'editor' || loadedRole === 'admin'
          ? supabase
              .from('libraries')
              .select('id, name, slug, description, status')
              .eq('status', 'active')
              .order('name')
          : Promise.resolve({
              data: activeLibrary ? [activeLibrary] : [],
              error: null,
            });

        if (!isMounted) return;

      setUserId(loadedUserId);
      setEmail(loadedEmail ?? 'Account');
      setRole(loadedRole);
      setDisplayName(loadedDisplayName);

        if (!activeLibrary?.id) {
          const { data: libraryData, error: libraryError } =
            await availableLibrariesPromise;

          if (!isMounted) return;

          if (libraryError) {
            throw new Error(
              `Unable to load available Libraries: ${libraryError.message}`
            );
          }

          setAvailableLibraries((libraryData || []) as ActiveLibrary[]);
          setDeck(null);
          setNodes([]);
          setPlacements([]);
          setSelectedNodeIds(new Set());
          setNodePreferences({});
          setConceptOverrides({});
          setResolvedConcepts([]);
          setPersonalTopics([]);
          setPersonalConcepts([]);
          setPersonalCards([]);
          setSelectedPersonalTopicIds(new Set());
          setExpandedPersonalTopicIds(new Set());
          setLearnerProgress(emptyLearnerProgress);
          return;
        }

      const [availableLibrariesResult, deckResult] = await Promise.all([
        availableLibrariesPromise,
        supabase.rpc('get_or_create_active_study_deck', {
          p_library_id: activeLibrary.id,
        }),
      ]);

      if (!isMounted) return;

      if (availableLibrariesResult.error) {
        throw new Error(
          `Unable to load available Libraries: ${availableLibrariesResult.error.message}`
        );
      }

      const { data: deckData, error: deckError } = deckResult;

      if (deckError || !deckData) {
        setMessage(
          `Unable to load your deck: ${deckError?.message || 'No active deck found.'}`
        );
        return;
      }

      const activeDeck = deckData as StudyDeck;
      const [
        nodeResult,
        selectedNodesResult,
        overridesResult,
        preferenceResult,
        resolvedResult,
        learnerProgressResult,
        personalTopicsResult,
        personalConceptsResult,
        personalCardsResult,
        personalSelectionsResult,
        personalCollectionsResult,
        personalCollectionSelectionsResult,
      ] = await Promise.all([
        supabase
          .from('library_nodes')
          .select('id, name, node_type, parent_id')
          .eq('library_id', activeLibrary.id)
          .order('name'),
        supabase
          .from('user_study_node_selections')
          .select('node_id')
          .eq('deck_id', activeDeck.id),
        supabase
          .from('user_study_concept_overrides')
          .select('concept_id, selection_state')
          .eq('deck_id', activeDeck.id),
        supabase
          .from('study_deck_node_preferences')
          .select('library_node_id, new_mastery_balance')
          .eq('deck_id', activeDeck.id),
        supabase.rpc('resolve_study_deck', {
          p_deck_id: activeDeck.id,
        }),
        supabase.rpc('get_library_learner_progress', {
          p_library_id: activeLibrary.id,
        }),
        supabase
          .from('personal_topics')
          .select('id, parent_id, name, sort_order')
          .order('sort_order')
          .order('name'),
        supabase
          .from('personal_concepts')
          .select('id, topic_id, name')
          .order('name'),
        supabase
          .from('personal_cards')
          .select('id, concept_id')
          .order('created_at'),
        supabase
          .from('study_deck_personal_topic_selections')
          .select('personal_topic_id')
          .eq('deck_id', activeDeck.id),
        supabase
          .from('personal_collections')
          .select('id, name, personal_collection_cards(count)')
          .order('name'),
        supabase
          .from('study_deck_personal_collection_selections')
          .select('personal_collection_id')
          .eq('deck_id', activeDeck.id),
      ]);
      const { data: nodeData, error: nodeError } = nodeResult;
      const { data: selectedNodesData, error: selectedNodesError } =
        selectedNodesResult;
      const { data: overridesData, error: overridesError } = overridesResult;
      const { data: preferenceData, error: preferenceError } = preferenceResult;
      const { data: resolvedData, error: resolvedError } = resolvedResult;
      const {
        data: learnerProgressData,
        error: learnerProgressLoadError,
      } = learnerProgressResult;
      const { data: personalTopicsData, error: personalTopicsError } =
        personalTopicsResult;
      const { data: personalConceptsData, error: personalConceptsError } =
        personalConceptsResult;
      const { data: personalCardsData, error: personalCardsError } =
        personalCardsResult;
      const { data: personalSelectionsData, error: personalSelectionsError } =
        personalSelectionsResult;
      const { data: personalCollectionsData, error: personalCollectionsError } =
        personalCollectionsResult;
      const {
        data: personalCollectionSelectionsData,
        error: personalCollectionSelectionsError,
      } = personalCollectionSelectionsResult;

      if (!isMounted) return;

      const deckStateError =
        nodeError ||
        selectedNodesError ||
        overridesError ||
        preferenceError ||
        resolvedError;

      if (deckStateError) {
        setMessage(`Unable to load your deck: ${deckStateError.message}`);
        return;
      }

      const loadedNodes = (nodeData || []) as LibraryNode[];
      const { data: placementData, error: placementError } = loadedNodes.length
        ? await supabase
            .from('concept_placements')
            .select(
              `
              concept_id,
              library_node_id,
              library_nodes!inner (library_id),
              concepts!inner (
                id,
                name,
                concept_type,
                summary,
                status
              )
            `
            )
            .eq('library_nodes.library_id', activeLibrary.id)
            .eq('concepts.status', 'published')
        : { data: [], error: null };

      if (!isMounted) return;

      if (placementError) {
        setMessage(`Unable to load deck concepts: ${placementError.message}`);
        return;
      }

      const loadedPlacements = (placementData || []) as unknown as Placement[];
      const conceptIds = [
        ...new Set(loadedPlacements.map((placement) => placement.concept_id)),
      ];
      const { data: questionData, error: questionError } = conceptIds.length
        ? await supabase
            .from('questions')
            .select('concept_id')
            .eq('status', 'published')
            .in('concept_id', conceptIds)
        : { data: [], error: null };

      if (!isMounted) return;

      if (questionError) {
        setMessage(`Unable to load deck questions: ${questionError.message}`);
        return;
      }
      const nextQuestionCounts: Record<string, number> = {};

      (questionData || []).forEach((question) => {
        if (!question.concept_id) return;
        nextQuestionCounts[question.concept_id] =
          (nextQuestionCounts[question.concept_id] || 0) + 1;
      });

      if (!isMounted) return;

      const rootNode = loadedNodes.find((node) => node.parent_id === null);
      const loadedAvailableLibraries = availableLibrariesResult.data?.length
        ? (availableLibrariesResult.data as ActiveLibrary[])
        : [activeLibrary];

      setDeck(activeDeck);
      setAvailableLibraries(loadedAvailableLibraries);
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
      const loadedPersonalTopics = personalTopicsError
        ? []
        : ((personalTopicsData || []) as PersonalTopic[]);
      setPersonalTopics(loadedPersonalTopics);
      setPersonalConcepts(
        personalConceptsError
          ? []
          : ((personalConceptsData || []) as PersonalConcept[])
      );
      setPersonalCards(
        personalCardsError ? [] : ((personalCardsData || []) as PersonalCard[])
      );
      setSelectedPersonalTopicIds(
        new Set(
          personalSelectionsError
            ? []
            : (personalSelectionsData || []).map(
                (selection) => selection.personal_topic_id
              )
        )
      );
      setPersonalCollections(
        personalCollectionsError
          ? []
          : ((personalCollectionsData || []) as unknown as PersonalCollectionRow[]).map(
              (collection) => {
                const count = Array.isArray(collection.personal_collection_cards)
                  ? collection.personal_collection_cards[0]?.count
                  : collection.personal_collection_cards?.count;
                return {
                  id: collection.id,
                  name: collection.name,
                  cardCount: Number(count || 0),
                };
              }
            )
      );
      setSelectedPersonalCollectionIds(
        new Set(
          personalCollectionSelectionsError
            ? []
            : (personalCollectionSelectionsData || []).map(
                (selection) => selection.personal_collection_id
              )
        )
      );
      setExpandedPersonalTopicIds(
        new Set(
          loadedPersonalTopics
            .filter((topic) => topic.parent_id === null)
            .map((topic) => topic.id)
        )
      );
      setLearnerProgress(
        learnerProgressLoadError || !learnerProgressData
          ? { ...emptyLearnerProgress, library_id: activeLibrary.id }
          : (learnerProgressData as unknown as LearnerProgressResponse)
      );
      setLearnerProgressError(
        learnerProgressLoadError
          ? `Progress could not be loaded: ${learnerProgressLoadError.message}`
          : ''
      );
      setExpandedNodeIds(rootNode ? new Set([rootNode.id]) : new Set());
      setHomeExpandedIds(rootNode ? new Set([rootNode.id]) : new Set());
      setFocusedNodeId(rootNode?.id || null);
      } catch (error) {
        if (!isMounted) return;

        console.error('Home bootstrap failed.', error);
        setBootstrapError(getBootstrapErrorMessage(error));
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadDeck();

    return () => {
      isMounted = false;
    };
  }, [activeLibrary, initialDeckData, initialSession]);

  useEffect(() => {
    function openModeFromHash() {
      if (window.location.hash === '#set-up-deck') {
        setMode('setup');
      } else if (window.location.hash === '#stats') {
        setMode('stats');
      } else {
        setMode('dashboard');
      }
    }

    function openDashboard() {
      setMode('dashboard');
    }

    openModeFromHash();
    window.addEventListener('hashchange', openModeFromHash);
    window.addEventListener('socrates-open-deck-setup', openModeFromHash);
    window.addEventListener('socrates-open-deck-dashboard', openDashboard);

    return () => {
      window.removeEventListener('hashchange', openModeFromHash);
      window.removeEventListener('socrates-open-deck-setup', openModeFromHash);
      window.removeEventListener('socrates-open-deck-dashboard', openDashboard);
    };
  }, []);

  useEffect(() => {
  const layout = document.querySelector<HTMLElement>('main.layout');

  if (mode === 'setup') {
    window.history.replaceState(null, '', '#set-up-deck');
  } else if (mode === 'stats') {
    window.history.replaceState(null, '', '#stats');
  } else if (
    window.location.hash === '#set-up-deck' ||
    window.location.hash === '#stats'
  ) {
    window.history.replaceState(null, '', window.location.pathname);
  }

  if (!layout) return;

  if (mode === 'setup' || mode === 'study') {
    // Page 2 and Page 3 use the focused full-width layout.
    layout.style.gridTemplateColumns = '1fr';

    window.dispatchEvent(new Event('socrates-open-deck-setup'));
  } else {
    // Page 1 returns to the normal dashboard layout.
    layout.style.gridTemplateColumns = '';

    if (mode === 'dashboard') {
      window.dispatchEvent(new Event('socrates-open-deck-dashboard'));
    }
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
    if (!deck || !userId) return null;

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
      const outcome = classifyStudySessionStart(data as string | null, error);

      if (outcome.kind === 'empty-deck') {
        setStudyStartFailure('empty-deck');
        return null;
      }

      if (outcome.kind === 'error') {
        setStudyStartFailure('error');
        console.error('Unable to start Study Mode session.', error);
        return null;
      }

      setStudyStartFailure(null);
      const sessionId = outcome.sessionId;
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

  function resetStudyCardFeedback() {
    if (studyCardFeedbackConfirmationTimer.current !== null) {
      window.clearTimeout(studyCardFeedbackConfirmationTimer.current);
      studyCardFeedbackConfirmationTimer.current = null;
    }

    studyCardFeedbackSaveLock.current = false;
    setStudyCardFeedbackType(null);
    setStudyCardFeedbackMessage('');
    setStudyCardFeedbackError('');
    setIsStudyCardFeedbackSubmitting(false);
    setIsStudyCardFeedbackSent(false);
  }

  function openStudyCardMorePanel() {
    resetStudyCardFeedback();
    setStudyFeedback('more');
    setStudyResponse(null);
  }

  function closeStudyCardMorePanel() {
    resetStudyCardFeedback();
    setStudyFeedback(null);
    setStudyResponse(null);
  }

  async function submitStudyCardFeedback() {
    const normalizedMessage = studyCardFeedbackMessage.trim();

    if (
      studyCardFeedbackSaveLock.current ||
      isStudyCardFeedbackSubmitting ||
      !studyCardFeedbackType ||
      !normalizedMessage
    ) return;

    if (!authoredStudyQuestion || !userId) {
      setStudyCardFeedbackError(
        'Feedback can only be sent for a real authored question.'
      );
      return;
    }

    studyCardFeedbackSaveLock.current = true;
    setIsStudyCardFeedbackSubmitting(true);
    setStudyCardFeedbackError('');

    try {
      const { error } = await supabase.rpc('submit_study_card_feedback', {
        p_question_id: authoredStudyQuestion.id,
        p_concept_id: authoredStudyQuestion.concept_id,
        p_study_session_id: studySessionIdRef.current,
        p_feedback_type: studyCardFeedbackType,
        p_message: normalizedMessage,
      });

      if (error) {
        setStudyCardFeedbackError(
          error.message || 'Feedback could not be sent. Please try again.'
        );
        return;
      }

      setStudyCardFeedbackMessage('');
      setIsStudyCardFeedbackSent(true);
      studyCardFeedbackConfirmationTimer.current = window.setTimeout(() => {
        studyCardFeedbackConfirmationTimer.current = null;
        studyCardFeedbackSaveLock.current = false;
        setStudyCardFeedbackType(null);
        setStudyCardFeedbackError('');
        setIsStudyCardFeedbackSubmitting(false);
        setIsStudyCardFeedbackSent(false);
        setStudyFeedback(null);
        setStudyResponse(null);
      }, 1400);
    } catch (error) {
      console.error('Unable to submit Study Mode card feedback.', error);
      setStudyCardFeedbackError('Feedback could not be sent. Please try again.');
    } finally {
      setIsStudyCardFeedbackSubmitting(false);
      if (studyCardFeedbackConfirmationTimer.current === null) {
        studyCardFeedbackSaveLock.current = false;
      }
    }
  }

  async function openStudyMode() {
    if (studyModeOpenLock.current) return;

    studyModeOpenLock.current = true;
    setStudyCandidate(null);
    setIsStudySequenceComplete(false);
    setStudyStartFailure(null);
    setIsAnswerVisible(false);
    setStudyFeedback(null);
    setStudyResponse(null);
    resetStudyCardFeedback();
    studyResponseRecordedForCard.current = false;

    try {
      const sessionId = await ensureStudySession();

      if (sessionId) {
        const selectedCandidate = await selectNextStudyCandidate(
          supabase,
          sessionId
        );
        if (selectedCandidate) {
          setStudyCandidate(selectedCandidate);
        }
      }
    } catch (error) {
      setStudyStartFailure('error');
      console.error('Unable to open Study Mode.', error);
    } finally {
      setMode('study');
      studyModeOpenLock.current = false;
    }
  }

  async function leaveStudyMode(nextMode: Exclude<PlannerMode, 'study'>) {
    const pendingSession =
      studySessionIdRef.current ||
      (studySessionCreatePromiseRef.current
        ? studySessionCreatePromiseRef.current
        : null);

    studySessionIdRef.current = null;
    studySessionCreatePromiseRef.current = null;
    studyResponseRecordedForCard.current = false;
    resetStudyCardFeedback();
    setStudyCandidate(null);
    setIsStudySequenceComplete(false);
    setStudyStartFailure(null);
    setMode(nextMode);

    const sessionId = await pendingSession;

    if (!sessionId) return;

    const { error } = await supabase.rpc('end_study_session', {
      p_study_session_id: sessionId,
    });

    if (error) {
      console.error('Unable to end Study Mode session.', error);
      return;
    }

    void refreshLearnerProgress();
  }

  async function persistFinalStudyResponse(
    response: Exclude<StudyResponse, null>
  ) {
    if (
      studyResponseSaveLock.current ||
      studyResponseRecordedForCard.current
    ) return;

    setStudyResponse(response);

    if (!studyCandidate || !userId || !deck) return;

    studyResponseSaveLock.current = true;

    try {
      const sessionId = await ensureStudySession();

      if (!sessionId) return;

      if (studyCandidate.kind === 'official') {
        const { error } = await supabase.rpc('record_study_session_attempt', {
          p_study_session_id: sessionId,
          p_question_id: studyCandidate.questionId,
          p_concept_id: studyCandidate.conceptId,
          p_result: response,
        });

        if (error) {
          console.error('Unable to record Study Mode response.', error);
          return;
        }
      } else {
        await recordPersonalStudyAttempt(supabase, {
          studySessionId: sessionId,
          studyDeckId: deck.id,
          personalCardId: studyCandidate.cardId,
          personalConceptId: studyCandidate.personalConceptId,
          result: response,
        });
      }

      studyResponseRecordedForCard.current = true;
      void refreshLearnerProgress();

      const selectedCandidate = await selectNextStudyCandidate(
        supabase,
        sessionId
      );

      if (!selectedCandidate) {
        setStudyCandidate(null);
        setIsStudySequenceComplete(true);
      } else {
        setStudyCandidate(selectedCandidate);
        setIsStudySequenceComplete(false);
      }

      setIsAnswerVisible(false);
      setStudyFeedback(null);
      setStudyResponse(null);
      resetStudyCardFeedback();
      studyResponseRecordedForCard.current = false;
    } catch (error) {
      console.error('Unable to record Study Mode response.', error);
    } finally {
      studyResponseSaveLock.current = false;
    }
  }

  async function handleLogout() {
    try {
      await fetch('/library/clear', { method: 'POST' });
    } finally {
      await supabase.auth.signOut();
      window.location.href = '/login';
    }
  }

  function handleCreatorClick() {
    window.dispatchEvent(new Event('socrates-open-creator-dashboard'));
  }

  function handleHomeClick(event: MouseEvent<HTMLAnchorElement>) {
    if (window.location.pathname === '/') {
      event.preventDefault();
      setMode('dashboard');
    }
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

  function formatProgressDetail(metric: LearnerProgressMetric) {
    const assessedAverage =
      metric.assessed_mastery_percent === null
        ? 'no assessed mastery yet'
        : `${Math.round(metric.assessed_mastery_percent)}% assessed average`;

    return `${metric.assessed_concepts}/${metric.total_concepts} assessed · ${metric.unseen_concepts} unseen · ${assessedAverage}`;
  }

  function renderLearnerHeader(classPrefix: LearnerHeaderPrefix) {
    const isEditor = role === 'editor' || role === 'admin';
    const isAdmin = role === 'admin';

    return (
      <header className={`${classPrefix}-header`}>
        <Link
          className={`${classPrefix}-brand`}
          href="/"
          onClick={handleHomeClick}
          prefetch={false}
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
                      ? handleHomeClick
                      : item.icon === 'creator'
                        ? handleCreatorClick
                        : undefined
                  }
                  prefetch={item.icon === 'home' ? false : undefined}
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
    node: LibraryNode,
    depth: number
  ): ReactNode {
    const childNodes = nodes
      .filter((candidate) => candidate.parent_id === node.id)
      .sort((left, right) => left.name.localeCompare(right.name));
    const hasChildren = childNodes.length > 0;
    const isExpanded = homeExpandedIds.has(node.id);
    const metric =
      learnerProgressByNodeId.get(node.id) || emptyLearnerProgress.summary;
    const progress = Math.round(metric.coverage_adjusted_progress_percent);

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
          <span className="home-v2-topic-copy">
            <span className="home-v2-topic-name">{node.name}</span>
            <small>{formatProgressDetail(metric)}</small>
          </span>
          <HomeProgressBar value={progress} />
          <span className="home-v2-percent">{progress}%</span>
        </div>
        {hasChildren &&
          isExpanded &&
          childNodes.map((child) => renderHomeTreeRow(child, depth + 1))}
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

  function descendantPersonalTopicIds(topicId: string) {
    const ids = new Set([topicId]);
    const queue = [topicId];

    while (queue.length) {
      const currentId = queue.shift();
      const children = personalTopics.filter(
        (topic) => topic.parent_id === currentId
      );

      children.forEach((child) => {
        if (!ids.has(child.id)) {
          ids.add(child.id);
          queue.push(child.id);
        }
      });
    }

    return ids;
  }

  function personalConceptsForTopic(topicId: string) {
    return personalConcepts
      .filter((concept) => concept.topic_id === topicId)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  function personalCardCountForConcept(conceptId: string) {
    return personalCards.filter((card) => card.concept_id === conceptId).length;
  }

  function personalBranchCounts(topicId: string) {
    const topicIds = descendantPersonalTopicIds(topicId);
    const conceptIds = new Set(
      personalConcepts
        .filter((concept) => topicIds.has(concept.topic_id))
        .map((concept) => concept.id)
    );

    return {
      concepts: conceptIds.size,
      cards: personalCards.filter((card) => conceptIds.has(card.concept_id)).length,
    };
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

  async function refreshLearnerProgress() {
    if (!activeLibrary?.id) return;

    const { data, error } = await supabase.rpc('get_library_learner_progress', {
      p_library_id: activeLibrary.id,
    });

    if (error || !data) {
      setLearnerProgressError(
        `Progress could not be loaded: ${error?.message || 'No progress data returned.'}`
      );
      return;
    }

    setLearnerProgress(data as unknown as LearnerProgressResponse);
    setLearnerProgressError('');
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
    router.refresh();
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
    router.refresh();
    setIsSaving(false);
  }

  async function togglePersonalTopicSelection(topicId: string) {
    if (!activeLibrary?.id || !deck || !userId || isSaving) return;

    const isSelected = selectedPersonalTopicIds.has(topicId);
    setIsSaving(true);
    setMessage(
      isSelected
        ? 'Removing personal Topic from deck...'
        : 'Adding personal Topic to deck...'
    );

    if (isSelected) {
      const { error } = await supabase
        .from('study_deck_personal_topic_selections')
        .delete()
        .eq('deck_id', deck.id)
        .eq('personal_topic_id', topicId);

      if (error) {
        setMessage(`Unable to update personal study material: ${error.message}`);
        setIsSaving(false);
        return;
      }

      setSelectedPersonalTopicIds((current) => {
        const next = new Set(current);
        next.delete(topicId);
        return next;
      });
    } else {
      const { error } = await supabase
        .from('study_deck_personal_topic_selections')
        .insert({
          deck_id: deck.id,
          user_id: userId,
          library_id: activeLibrary.id,
          personal_topic_id: topicId,
        });

      if (error) {
        setMessage(`Unable to update personal study material: ${error.message}`);
        setIsSaving(false);
        return;
      }

      setSelectedPersonalTopicIds((current) => new Set(current).add(topicId));
    }

    setMessage('Personal study selection saved.');
    router.refresh();
    setIsSaving(false);
  }

  async function togglePersonalCollectionSelection(collectionId: string) {
    if (!activeLibrary?.id || !deck || !userId || isSaving) return;

    const isSelected = selectedPersonalCollectionIds.has(collectionId);
    setIsSaving(true);
    setMessage(
      isSelected
        ? 'Removing Personal Deck from study...'
        : 'Adding Personal Deck to study...'
    );

    if (isSelected) {
      const { error } = await supabase
        .from('study_deck_personal_collection_selections')
        .delete()
        .eq('deck_id', deck.id)
        .eq('personal_collection_id', collectionId);

      if (error) {
        setMessage(`Unable to update Personal Deck selection: ${error.message}`);
        setIsSaving(false);
        return;
      }

      setSelectedPersonalCollectionIds((current) => {
        const next = new Set(current);
        next.delete(collectionId);
        return next;
      });
    } else {
      const { error } = await supabase
        .from('study_deck_personal_collection_selections')
        .insert({
          deck_id: deck.id,
          user_id: userId,
          library_id: activeLibrary.id,
          personal_collection_id: collectionId,
        });

      if (error) {
        setMessage(`Unable to update Personal Deck selection: ${error.message}`);
        setIsSaving(false);
        return;
      }

      setSelectedPersonalCollectionIds((current) =>
        new Set(current).add(collectionId)
      );
    }

    setMessage('Personal Deck study selection saved.');
    router.refresh();
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

  function toggleExpandedPersonalTopic(topicId: string) {
    setExpandedPersonalTopicIds((current) => {
      const next = new Set(current);

      if (next.has(topicId)) {
        next.delete(topicId);
      } else {
        next.add(topicId);
      }

      return next;
    });
  }

  function renderPersonalTopic(topic: PersonalTopic, depth = 0): ReactNode {
    const children = personalTopics
      .filter((child) => child.parent_id === topic.id)
      .sort(
        (left, right) =>
          left.sort_order - right.sort_order || left.name.localeCompare(right.name)
      );
    const directConcepts = personalConceptsForTopic(topic.id);
    const hasDetails = children.length > 0 || directConcepts.length > 0;
    const isExpanded = expandedPersonalTopicIds.has(topic.id);
    const isSelected = selectedPersonalTopicIds.has(topic.id);
    const counts = personalBranchCounts(topic.id);

    return (
      <div
        key={topic.id}
        style={{
          marginLeft: depth ? Math.min(depth * 20, 40) : 0,
          position: 'relative',
        }}
      >
        {depth > 0 && (
          <span
            aria-hidden="true"
            style={{
              borderLeft: '2px solid #dbeafe',
              bottom: 0,
              left: -11,
              position: 'absolute',
              top: -9,
            }}
          />
        )}

        <div
          style={{
            background: isSelected ? '#eff6ff' : '#ffffff',
            border: isSelected ? '1px solid #93c5fd' : '1px solid #e2e8f0',
            borderRadius: 14,
            marginBottom: 8,
            padding: '10px 12px',
          }}
        >
          <div style={{ alignItems: 'center', display: 'flex', gap: 10 }}>
            <button
              type="button"
              aria-label={isExpanded ? `Collapse ${topic.name}` : `Expand ${topic.name}`}
              disabled={!hasDetails}
              onClick={() => toggleExpandedPersonalTopic(topic.id)}
              style={{
                alignItems: 'center',
                background: hasDetails ? '#e0f2fe' : '#f8fafc',
                border: 0,
                borderRadius: 10,
                color: '#0369a1',
                cursor: hasDetails ? 'pointer' : 'default',
                display: 'flex',
                flexShrink: 0,
                fontSize: 13,
                height: 34,
                justifyContent: 'center',
                width: 34,
              }}
            >
              {!hasDetails ? '•' : isExpanded ? '▼' : '▶'}
            </button>

            <label
              style={{
                alignItems: 'center',
                cursor: isSaving ? 'wait' : 'pointer',
                display: 'flex',
                flex: 1,
                gap: 10,
                minWidth: 0,
              }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                disabled={isSaving}
                onChange={() => void togglePersonalTopicSelection(topic.id)}
                style={{
                  accentColor: '#2563eb',
                  cursor: isSaving ? 'wait' : 'pointer',
                  height: 18,
                  width: 18,
                }}
              />
              <span style={{ minWidth: 0 }}>
                <strong style={{ display: 'block', fontSize: 15, lineHeight: 1.2 }}>
                  {topic.name}
                </strong>
                <span className="muted" style={{ fontSize: 12 }}>
                  {counts.concepts} {counts.concepts === 1 ? 'Concept' : 'Concepts'} ·{' '}
                  {counts.cards} {counts.cards === 1 ? 'Card' : 'Cards'}
                </span>
              </span>
            </label>
          </div>

          {isExpanded && directConcepts.length > 0 && (
            <div
              style={{
                borderTop: '1px solid #dbeafe',
                display: 'grid',
                gap: 6,
                marginTop: 10,
                padding: '9px 0 1px 44px',
              }}
            >
              {directConcepts.map((concept) => {
                const cardCount = personalCardCountForConcept(concept.id);

                return (
                  <div
                    key={concept.id}
                    style={{
                      alignItems: 'center',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: 10,
                      display: 'flex',
                      gap: 8,
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                    }}
                  >
                    <span style={{ color: '#0f172a', fontSize: 13, fontWeight: 700 }}>
                      {concept.name}
                    </span>
                    <span className="muted" style={{ flexShrink: 0, fontSize: 12 }}>
                      {cardCount} {cardCount === 1 ? 'Card' : 'Cards'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {isExpanded && children.length > 0 && (
          <div style={{ marginTop: 4 }}>
            {children.map((child) => renderPersonalTopic(child, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  function renderPersonalMaterialSection() {
    const rootTopics = personalTopics
      .filter((topic) => topic.parent_id === null)
      .sort(
        (left, right) =>
          left.sort_order - right.sort_order || left.name.localeCompare(right.name)
      );

    return (
      <section
        aria-labelledby="personal-study-material-title"
        style={{
          borderTop: '1px solid #dbe3ee',
          marginTop: 18,
          paddingTop: 16,
        }}
      >
        <div style={{ marginBottom: 12 }}>
          <h2
            id="personal-study-material-title"
            style={{ fontSize: 18, margin: 0 }}
          >
            My Study Material
          </h2>
        </div>

        {rootTopics.length > 0 ? (
          <div aria-label="Personal study material Topic tree">
            {rootTopics.map((topic) => renderPersonalTopic(topic))}
          </div>
        ) : (
          <div
            style={{
              background: '#ffffff',
              border: '1px dashed #cbd5e1',
              borderRadius: 12,
              color: '#64748b',
              padding: '14px',
            }}
          >
            Create personal Topics, Concepts, and Cards in Study Creator to select them here.
          </div>
        )}

        <section
          aria-labelledby="personal-decks-study-title"
          style={{ borderTop: '1px solid #e2e8f0', marginTop: 16, paddingTop: 14 }}
        >
          <h3 id="personal-decks-study-title" style={{ fontSize: 16, margin: '0 0 10px' }}>
            Personal Decks
          </h3>
          {personalCollections.length > 0 ? (
            <div aria-label="Personal Deck study selections" style={{ display: 'grid', gap: 8 }}>
              {personalCollections.map((collection) => (
                <label
                  key={collection.id}
                  style={{
                    alignItems: 'center',
                    background: selectedPersonalCollectionIds.has(collection.id)
                      ? '#eff6ff'
                      : '#ffffff',
                    border: selectedPersonalCollectionIds.has(collection.id)
                      ? '1px solid #93c5fd'
                      : '1px solid #e2e8f0',
                    borderRadius: 12,
                    cursor: isSaving ? 'wait' : 'pointer',
                    display: 'flex',
                    gap: 10,
                    padding: '10px 12px',
                  }}
                >
                  <input
                    checked={selectedPersonalCollectionIds.has(collection.id)}
                    disabled={isSaving}
                    onChange={() =>
                      void togglePersonalCollectionSelection(collection.id)
                    }
                    style={{ accentColor: '#2563eb', height: 18, width: 18 }}
                    type="checkbox"
                  />
                  <span style={{ minWidth: 0 }}>
                    <strong style={{ display: 'block', fontSize: 15 }}>
                      {collection.name}
                    </strong>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {collection.cardCount}{' '}
                      {collection.cardCount === 1 ? 'Card' : 'Cards'}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              No Personal Decks yet. Create one in Study Creator when you need it.
            </p>
          )}
        </section>
      </section>
    );
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

  const rootNodes = nodes
    .filter((node) => node.parent_id === null)
    .sort((left, right) => left.name.localeCompare(right.name));
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
  const homeBootstrapView = getHomeBootstrapView({
    activeLibraryId: activeLibrary?.id,
    availableLibraryCount: availableLibraries.length,
    bootstrapError,
    hasDeck: Boolean(deck),
    isLoading,
    role,
  });

  function renderLibrarySubjectSwitcher(
    currentSlug: string | null,
    standalone = false
  ) {
    if (
      (role !== 'admin' && role !== 'editor') ||
      !availableLibraries.length ||
      (Boolean(currentSlug) && availableLibraries.length === 1)
    ) {
      return null;
    }

    return (
      <form
        action="/library/switch"
        className="home-v2-library-switcher"
        method="post"
        style={
          standalone
            ? {
                alignItems: 'end',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 10,
                marginTop: 18,
                maxWidth: 420,
              }
            : undefined
        }
      >
        <label
          style={
            standalone
              ? { display: 'grid', flex: '1 1 240px', gap: 5 }
              : undefined
          }
        >
          <span
            style={
              standalone
                ? {
                    color: '#59687f',
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }
                : undefined
            }
          >
            {currentSlug ? 'Current Subject' : 'Choose a Library'}
          </span>
          <select
            aria-label={currentSlug ? 'Current Subject' : 'Choose a Library'}
            defaultValue={currentSlug || availableLibraries[0].slug}
            name="library_slug"
            style={
              standalone
                ? {
                    background: '#ffffff',
                    border: '1px solid #c7d1e0',
                    borderRadius: 8,
                    color: '#17233a',
                    font: 'inherit',
                    minHeight: 42,
                    padding: '8px 10px',
                    width: '100%',
                  }
                : undefined
            }
          >
            {availableLibraries.map((library) => (
              <option key={library.id} value={library.slug}>
                {library.name}
              </option>
            ))}
          </select>
        </label>
        <input name="return_to" type="hidden" value="/" />
        <button
          disabled={Boolean(currentSlug) && availableLibraries.length < 2}
          type="submit"
          style={
            standalone
              ? {
                  background: '#155ee8',
                  border: '1px solid #0f4fc7',
                  borderRadius: 8,
                  color: '#ffffff',
                  cursor: 'pointer',
                  font: 'inherit',
                  fontWeight: 800,
                  minHeight: 42,
                  padding: '8px 14px',
                }
              : undefined
          }
        >
          {currentSlug ? 'Switch' : 'Choose Library'}
        </button>
      </form>
    );
  }

  if (homeBootstrapView === 'loading') {
    return (
      <HeaderSessionProvider email={email} role={role}>
        <Header />
        <main
          aria-label="Loading your deck"
          aria-live="polite"
          style={{
            alignItems: 'stretch',
            background: '#f3f6fb',
            display: 'flex',
            flexWrap: 'wrap',
            minHeight: 'calc(100vh - 126px)',
          }}
        >
          <aside
            aria-hidden="true"
            style={{
              background: 'linear-gradient(180deg, #0c4dc3, #0a3c9f)',
              boxSizing: 'border-box',
              display: 'grid',
              flex: '1 1 190px',
              gap: 14,
              minHeight: 420,
              padding: 22,
            }}
          >
            {homeRailItems.map((item) => (
              <div
                key={item.label}
                style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  borderRadius: 12,
                  minHeight: 62,
                }}
              />
            ))}
          </aside>
          <section
            style={{
              boxSizing: 'border-box',
              flex: '5 1 540px',
              padding: '32px clamp(20px, 4vw, 54px)',
            }}
          >
            <p
              style={{
                color: '#48617f',
                fontSize: 15,
                fontWeight: 700,
                margin: '0 0 14px',
              }}
            >
              Loading your deck…
            </p>
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #dfe6f0',
                borderRadius: 18,
                boxShadow: '0 12px 30px rgba(15, 23, 42, 0.07)',
                minHeight: 130,
              }}
            />
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #dfe6f0',
                borderRadius: 18,
                boxShadow: '0 12px 30px rgba(15, 23, 42, 0.07)',
                marginTop: 22,
                minHeight: 300,
              }}
            />
          </section>
        </main>
      </HeaderSessionProvider>
    );
  }

  if (homeBootstrapView === 'error') {
    return (
      <HeaderSessionProvider email={email} role={role}>
        <Header />
        <main style={{ padding: 24 }}>
          <div className="panel" role="alert">
            <h2>Home could not be loaded</h2>
            <p className="muted">{bootstrapError}</p>
            <button type="button" onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        </main>
      </HeaderSessionProvider>
    );
  }

  if (!activeLibrary?.id) {
    return (
      <HeaderSessionProvider email={email} role={role}>
        <Header />
        <main style={{ padding: 24 }}>
          <div className="panel">
            <h2>Choose a Library</h2>
            <p className="muted">
              Choose an active Library before setting up or opening your deck.
            </p>
            {renderLibrarySubjectSwitcher(null, true)}
            {(role === 'admin' || role === 'editor') &&
              !availableLibraries.length && (
                <p className="muted">No active Libraries are available.</p>
              )}
          </div>
        </main>
      </HeaderSessionProvider>
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

              {renderPersonalMaterialSection()}
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
  const studyAnswer = studyCandidate?.answer || null;
  const authoredStudyExplanation =
    authoredStudyQuestion?.explanation?.trim() || null;
  const hasStudyCandidate = Boolean(studyCandidate && studyAnswer);
  const emptyStudyTitle = isStudySequenceComplete
    ? 'Study complete'
    : studyStartFailure === 'empty-deck'
      ? 'No study material selected'
      : studyStartFailure === 'error'
        ? 'Study Mode could not start'
        : 'No study material available';
  const emptyStudyMessage = isStudySequenceComplete
    ? 'You reviewed every selected personal Card in this session.'
    : studyStartFailure === 'empty-deck'
      ? 'Select an official Topic or a personal Topic in Set Up Deck, then try again.'
      : studyStartFailure === 'error'
        ? 'Study Mode could not be started. Please try again.'
        : 'This deck does not currently contain an eligible published Question or selected personal Card.';

  const studyCardActions = (
    <div className="study-v2-card-actions" aria-label="Study card controls">
      <button type="button" onClick={() => void leaveStudyMode('dashboard')}>
        <span aria-hidden="true">←</span>
        Exit
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

  return (
    <>
      {renderLearnerHeader('study-v2')}
      <main className="study-v2-page">
        <section className="study-v2-shell" aria-label="Study Mode">
          <article
            aria-label={
              hasStudyCandidate
                ? isAnswerVisible
                  ? 'Revealed study card'
                  : 'Question card'
                : isStudySequenceComplete
                  ? 'Study sequence complete'
                  : emptyStudyTitle
            }
            className={`study-v2-card ${
              !hasStudyCandidate
                ? 'study-v2-card-empty'
                : isAnswerVisible
                  ? 'study-v2-card-revealed'
                  : 'study-v2-card-front'
            }`}
            onClick={
              !hasStudyCandidate || isAnswerVisible
                ? undefined
                : () => setIsAnswerVisible(true)
            }
            onKeyDown={(event) => {
              if (
                hasStudyCandidate &&
                !isAnswerVisible &&
                (event.key === 'Enter' || event.key === ' ')
              ) {
                event.preventDefault();
                setIsAnswerVisible(true);
              }
            }}
            role={!hasStudyCandidate || isAnswerVisible ? undefined : 'button'}
            tabIndex={!hasStudyCandidate || isAnswerVisible ? undefined : 0}
          >
            <div className="study-v2-card-topline">
              {studyCardActions}
            </div>

            {!hasStudyCandidate ? (
              <div className="study-v2-empty-state">
                <h1>{emptyStudyTitle}</h1>
                <p>{emptyStudyMessage}</p>
                <div className="study-v2-empty-actions">
                  <button type="button" onClick={() => void leaveStudyMode('setup')}>
                    Set Up Deck
                  </button>
                  <button
                    type="button"
                    onClick={() => void leaveStudyMode('dashboard')}
                  >
                    Home
                  </button>
                  {(role === 'editor' || role === 'admin') && (
                    <button
                      type="button"
                      onClick={() => {
                        void leaveStudyMode('dashboard').then(() => {
                          router.push('/creator/concepts/new');
                        });
                      }}
                    >
                      Creator Studio
                    </button>
                  )}
                </div>
              </div>
            ) : !isAnswerVisible ? (
              <div className="study-v2-question-content">
                <h1>{studyCandidate?.prompt}</h1>
                <p>Tap to reveal answer</p>
              </div>
            ) : (
              <>
                <div className="study-v2-answer-body">
                  <section
                    className="study-v2-answer-section"
                    aria-labelledby="study-answer-heading"
                  >
                    <h1 id="study-answer-heading">Answer</h1>
                    <p>{studyAnswer}</p>
                  </section>
                  {authoredStudyExplanation && (
                    <section
                      className="study-v2-explanation-section"
                      aria-labelledby="study-explanation-heading"
                    >
                      <h2 id="study-explanation-heading">Explanation</h2>
                      <p>{authoredStudyExplanation}</p>
                    </section>
                  )}
                </div>

                {studyFeedback === null ? (
                  <div
                    className={`study-v2-feedback-row${
                      studyCandidate?.kind === 'personal'
                        ? ' study-v2-feedback-row-personal'
                        : ''
                    }`}
                  >
                    {(
                      studyCandidate?.kind === 'official'
                        ? [
                            ['up', 'Thumbs Up'],
                            ['more', 'More'],
                            ['down', 'Thumbs Down'],
                          ]
                        : [
                            ['up', 'Thumbs Up'],
                            ['down', 'Thumbs Down'],
                          ]
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          if (value === 'more') {
                            openStudyCardMorePanel();
                          } else {
                            resetStudyCardFeedback();
                            setStudyFeedback(value as StudyFeedback);
                            setStudyResponse(null);
                          }
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
                  <div className="study-v2-more-panel">
                    {isStudyCardFeedbackSent ? (
                      <p
                        aria-live="polite"
                        className="study-v2-more-confirmation"
                        role="status"
                      >
                        Thanks — feedback sent.
                      </p>
                    ) : studyCardFeedbackType === null ? (
                      <div className="study-v2-more-choice-row">
                        <button
                          type="button"
                          onClick={() => {
                            setStudyCardFeedbackType('error');
                            setStudyCardFeedbackError('');
                          }}
                        >
                          Report an error
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setStudyCardFeedbackType('suggestion');
                            setStudyCardFeedbackError('');
                          }}
                        >
                          Suggest an improvement
                        </button>
                        <button type="button" onClick={closeStudyCardMorePanel}>
                          ← Back
                        </button>
                      </div>
                    ) : (
                      <form
                        className="study-v2-more-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void submitStudyCardFeedback();
                        }}
                      >
                        <label>
                          <span>
                            {studyCardFeedbackType === 'error'
                              ? 'What looks incorrect or misleading?'
                              : 'How could this question or answer be improved?'}
                          </span>
                          <textarea
                            autoFocus
                            maxLength={4000}
                            placeholder="Share a concise note"
                            value={studyCardFeedbackMessage}
                            onChange={(event) => {
                              setStudyCardFeedbackMessage(event.target.value);
                              if (studyCardFeedbackError) {
                                setStudyCardFeedbackError('');
                              }
                            }}
                          />
                        </label>
                        <div className="study-v2-more-form-footer">
                          <p aria-live="polite" role="status">
                            {studyCardFeedbackError}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setStudyCardFeedbackType(null);
                              setStudyCardFeedbackMessage('');
                              setStudyCardFeedbackError('');
                            }}
                            disabled={isStudyCardFeedbackSubmitting}
                          >
                            Cancel
                          </button>
                          <button
                            className="study-v2-more-submit"
                            disabled={
                              isStudyCardFeedbackSubmitting ||
                              !studyCardFeedbackMessage.trim()
                            }
                            type="submit"
                          >
                            {isStudyCardFeedbackSubmitting ? 'Sending…' : 'Submit'}
                          </button>
                        </div>
                      </form>
                    )}
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
              </>
            )}
          </article>
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
          padding: 28px 24px;
        }

        .study-v2-shell {
          background: #ffffff;
          border: 1px solid #e5eaf2;
          border-radius: 8px;
          box-shadow: 0 18px 36px rgba(15, 23, 42, 0.14);
          margin: 0 auto;
          max-width: 906px;
          padding: 24px 28px;
        }

        .study-v2-card {
          background: #ffffff;
          border: 1px solid #dbe2ee;
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          height: clamp(480px, calc(100vh - 235px), 640px);
          overflow: hidden;
          padding-top: 13px;
          transition:
            border-color 200ms ease,
            box-shadow 200ms ease;
        }

        .study-v2-card-front {
          cursor: pointer;
        }

        .study-v2-card-front:focus-visible {
          border-color: #0f5ee8;
          box-shadow: 0 0 0 3px rgba(15, 94, 232, 0.2);
          outline: 0;
        }

        .study-v2-card-topline {
          align-items: center;
          display: flex;
          justify-content: flex-end;
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

        .study-v2-card-topline {
          flex: 0 0 auto;
          padding: 0 22px;
        }

        .study-v2-question-content {
          animation: study-v2-content-in 200ms ease-out;
          display: flex;
          flex: 1;
          flex-direction: column;
          justify-content: center;
          padding: 24px 22px 64px;
        }

        .study-v2-question-content h1 {
          color: #08143b;
          font-family: Georgia, "Times New Roman", Times, serif;
          font-size: 43px;
          font-weight: 650;
          letter-spacing: -0.035em;
          line-height: 1.45;
          margin: auto auto 0;
          max-width: 620px;
          text-align: center;
        }

        .study-v2-question-content > p {
          color: #77797e;
          font-size: 25px;
          font-weight: 650;
          margin: auto 0 0;
          text-align: center;
        }

        .study-v2-card-empty {
          cursor: default;
        }

        .study-v2-empty-state {
          align-items: center;
          display: flex;
          flex: 1;
          flex-direction: column;
          justify-content: center;
          padding: 56px 32px 72px;
          text-align: center;
        }

        .study-v2-empty-state h1 {
          color: #0f2f28;
          font-size: clamp(2rem, 4vw, 3.5rem);
          margin: 0;
        }

        .study-v2-empty-state p {
          color: #55706a;
          font-size: 1.05rem;
          line-height: 1.6;
          margin: 18px 0 30px;
          max-width: 540px;
        }

        .study-v2-empty-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          justify-content: center;
        }

        .study-v2-empty-actions button {
          background: #0f766e;
          border: 1px solid #0f766e;
          border-radius: 999px;
          color: #fff;
          cursor: pointer;
          font: inherit;
          font-weight: 700;
          padding: 11px 20px;
        }

        .study-v2-empty-actions button:hover {
          background: #115e59;
          border-color: #115e59;
        }

        @keyframes study-v2-content-in {
          from {
            opacity: 0;
            transform: translateY(4px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .study-v2-answer-body {
          animation: study-v2-content-in 200ms ease-out;
          color: #08143b;
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          overscroll-behavior: contain;
          padding: 28px clamp(28px, 8vw, 88px) 32px;
          scrollbar-gutter: stable;
        }

        .study-v2-answer-section,
        .study-v2-explanation-section {
          margin: 0 auto;
          max-width: 680px;
        }

        .study-v2-answer-section h1,
        .study-v2-explanation-section h2 {
          font-family: Georgia, "Times New Roman", Times, serif;
          letter-spacing: -0.035em;
          margin: 0 0 14px;
        }

        .study-v2-answer-section h1 {
          color: #0f5ee8;
          font-size: 24px;
          font-weight: 750;
        }

        .study-v2-answer-section p {
          font-family: Georgia, "Times New Roman", Times, serif;
          font-size: clamp(25px, 3vw, 34px);
          font-weight: 600;
          letter-spacing: -0.025em;
          line-height: 1.3;
          margin: 0;
        }

        .study-v2-explanation-section {
          border-top: 1px solid #dbe2ee;
          margin-top: 28px;
          padding-top: 24px;
        }

        .study-v2-explanation-section h2 {
          font-size: 21px;
          font-weight: 700;
        }

        .study-v2-explanation-section p {
          color: #334155;
          font-size: 18px;
          line-height: 1.65;
          margin: 0;
        }

        .study-v2-feedback-row {
          border-top: 1px solid #dbe2ee;
          display: grid;
          flex: 0 0 auto;
          grid-template-columns: repeat(3, 1fr);
          min-height: 148px;
        }

        .study-v2-feedback-row-personal {
          grid-template-columns: repeat(2, 1fr);
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

        .study-v2-more-panel {
          background: #f8fafc;
          border-top: 1px solid #dbe2ee;
          flex: 0 0 auto;
          max-height: 270px;
          overflow-y: auto;
        }

        .study-v2-more-choice-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          min-height: 96px;
        }

        .study-v2-more-choice-row button {
          background: #ffffff;
          border: 0;
          border-right: 1px solid #dbe2ee;
          color: #0f5ee8;
          cursor: pointer;
          font: inherit;
          font-weight: 750;
          padding: 18px;
        }

        .study-v2-more-choice-row button:last-child {
          border-right: 0;
        }

        .study-v2-more-form {
          display: grid;
          gap: 10px;
          padding: 14px 18px 16px;
        }

        .study-v2-more-form label {
          color: #08143b;
          display: grid;
          font-size: 15px;
          font-weight: 700;
          gap: 7px;
        }

        .study-v2-more-form textarea {
          border: 1px solid #b8c4d6;
          border-radius: 7px;
          color: #0f172a;
          font: inherit;
          line-height: 1.4;
          min-height: 76px;
          padding: 9px 11px;
          resize: vertical;
          width: 100%;
        }

        .study-v2-more-form textarea:focus {
          border-color: #0f5ee8;
          box-shadow: 0 0 0 3px rgba(15, 94, 232, 0.14);
          outline: 0;
        }

        .study-v2-more-form-footer {
          align-items: center;
          display: flex;
          gap: 10px;
          justify-content: flex-end;
        }

        .study-v2-more-form-footer p {
          color: #b91c1c;
          flex: 1;
          font-size: 14px;
          margin: 0;
        }

        .study-v2-more-form-footer button {
          background: #ffffff;
          border: 1px solid #b8c4d6;
          border-radius: 7px;
          color: #0f5ee8;
          cursor: pointer;
          font: inherit;
          font-weight: 750;
          min-height: 38px;
          padding: 8px 14px;
        }

        .study-v2-more-form-footer button:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }

        .study-v2-more-form-footer .study-v2-more-submit {
          background: #0f5ee8;
          border-color: #0f5ee8;
          color: #ffffff;
        }

        .study-v2-more-confirmation {
          align-items: center;
          color: #166534;
          display: flex;
          font-weight: 750;
          justify-content: center;
          margin: 0;
          min-height: 96px;
          padding: 20px;
          text-align: center;
        }

        .study-v2-response-toolbar {
          align-items: center;
          border-top: 1px solid #dbe2ee;
          display: flex;
          flex: 0 0 auto;
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
          min-height: 148px;
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

          .study-v2-card {
            height: min(620px, 72dvh);
            min-height: 500px;
          }

          .study-v2-question-content h1 {
            font-size: 33px;
          }

          .study-v2-answer-body {
            padding: 24px 22px 28px;
          }

          .study-v2-card-topline {
            justify-content: flex-end;
          }

          .study-v2-card-actions {
            justify-content: flex-end;
          }

          .study-v2-feedback-row {
            grid-template-columns: 1fr;
          }

          .study-v2-feedback-row button {
            border-bottom: 1px solid #dbe2ee;
            border-right: 0;
            min-height: 140px;
          }

          .study-v2-more-choice-row {
            grid-template-columns: 1fr;
          }

          .study-v2-more-choice-row button {
            border-bottom: 1px solid #dbe2ee;
            border-right: 0;
            min-height: 52px;
            padding: 12px 16px;
          }

          .study-v2-more-choice-row button:last-child {
            border-bottom: 0;
          }

          .study-v2-more-form-footer {
            flex-wrap: wrap;
          }

          .study-v2-more-form-footer p {
            flex-basis: 100%;
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
            {homeRailItems.map((item) => {
              const content = (
                <>
                  <RailIcon icon={item.icon} />
                  <span>{item.label}</span>
                </>
              );

              return item.href ? (
                <Link
                  className="home-v2-rail-card"
                  href={item.href}
                  key={item.label}
                  onClick={
                    item.href.startsWith('/creator/') ? handleCreatorClick : undefined
                  }
                >
                  {content}
                </Link>
              ) : (
                <button
                  className="home-v2-rail-card"
                  key={item.label}
                  title={
                    item.label === 'Account Settings' && email
                      ? `Signed in as ${email}`
                      : undefined
                  }
                  type="button"
                  onClick={
                    item.label === 'Stats' ? () => setMode('stats') : undefined
                  }
                >
                  {content}
                </button>
              );
            })}
          </div>
          <button className="home-v2-logout" type="button" onClick={handleLogout}>
            <RailIcon icon="edit" />
            <span>Log Out</span>
          </button>
        </aside>

        <section className="home-v2-workspace">
          {mode === 'stats' ? (
            <>
              <div className="home-v2-topline">
                <h2>Learner Progress</h2>
              </div>

              <section className="home-v2-deck-card" aria-labelledby="tree-title">
                <h3 id="tree-title">
                  Current Deck: <span>{activeLibrary.name}</span>
                </h3>
                <p className="home-v2-progress-overview">
                  {learnerProgress.summary.assessed_concepts}/
                  {learnerProgress.summary.total_concepts} Concepts assessed ·{' '}
                  {learnerProgress.summary.unseen_concepts} unseen ·{' '}
                  {learnerProgress.summary.questions_answered} Questions answered ·{' '}
                  {learnerProgress.summary.recent_session_count} recent sessions
                </p>
                {learnerProgressError && (
                  <p className="home-v2-progress-overview">{learnerProgressError}</p>
                )}
                <div className="home-v2-tree">
                  {rootNodes.map((node) => renderHomeTreeRow(node, 0))}
                </div>
              </section>
            </>
          ) : (
            <>
              <div className="home-v2-topline">
                <h2>Welcome back, {displayName}!</h2>
              </div>

              <div className="home-v2-hero">
                <button
                  className="home-v2-study"
                  type="button"
                  onClick={openStudyMode}
                >
                  STUDY
                </button>

                <div className="home-v2-study-options" aria-label="Study options">
                  <label className="home-v2-study-option">
                    <input
                      checked={isSetupCramMode}
                      disabled={isSaving}
                      type="checkbox"
                      onChange={() => void toggleSetupCramMode()}
                    />
                    <span>Cram Mode</span>
                  </label>

                  <label className="home-v2-study-option home-v2-study-option-soon">
                    <input disabled type="checkbox" />
                    <span>
                      Game Mode <small>Coming soon</small>
                    </span>
                  </label>

                  <label className="home-v2-study-option home-v2-study-option-soon">
                    <input disabled type="checkbox" />
                    <span>
                      Community / Trial Content <small>Coming soon</small>
                    </span>
                  </label>
                </div>
              </div>

              <section
                className="home-v2-deck-card home-v2-setup-card"
                aria-labelledby="home-v2-setup-title"
              >
                <div className="home-v2-setup-heading">
                  <div>
                    <h3 id="home-v2-setup-title">Set Up Deck</h3>
                    <p>
                      Choose eligible areas and balance new material with mastery review.
                    </p>
                  </div>

                  {renderLibrarySubjectSwitcher(activeLibrary.slug)}
                </div>

                <div
                  className="home-v2-setup-tree"
                  aria-label="Set Up Deck Topic Tree"
                >
                  {rootNodes.map((node) => renderNode(node))}
                  {renderPersonalMaterialSection()}
                </div>

              </section>
            </>
          )}
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
        .home-v2-logout {
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
          text-decoration: none;
        }

        .home-v2-rail-card:hover,
        .home-v2-logout:hover {
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

        .home-v2-hero {
          align-items: stretch;
          display: grid;
          gap: 18px;
          grid-template-columns: minmax(320px, 596px) minmax(230px, 280px);
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

        .home-v2-study-options {
          background: #ffffff;
          border: 1px solid #dbe3ef;
          border-radius: 8px;
          display: grid;
          gap: 4px;
          padding: 10px 12px;
        }

        .home-v2-study-option {
          align-items: center;
          color: #0f172a;
          display: flex;
          font-size: 14px;
          font-weight: 750;
          gap: 9px;
          min-height: 38px;
          padding: 4px 2px;
        }

        .home-v2-study-option input {
          accent-color: #2563eb;
          flex: 0 0 auto;
          height: 18px;
          margin: 0;
          width: 18px;
        }

        .home-v2-study-option span {
          min-width: 0;
        }

        .home-v2-study-option small {
          color: #64748b;
          display: block;
          font-size: 10px;
          font-weight: 650;
          margin-top: 1px;
        }

        .home-v2-study-option-soon {
          color: #64748b;
        }

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

        .home-v2-setup-heading {
          align-items: end;
          display: flex;
          flex-wrap: wrap;
          gap: 18px;
          justify-content: space-between;
        }

        .home-v2-setup-heading p {
          color: #64748b;
          font-size: 14px;
          margin: -8px 0 0;
        }

        .home-v2-library-switcher {
          align-items: end;
          display: flex;
          flex: 0 1 360px;
          gap: 10px;
          justify-content: flex-end;
          margin-bottom: 18px;
        }

        .home-v2-library-switcher label {
          display: grid;
          flex: 1 1 220px;
          gap: 5px;
        }

        .home-v2-library-switcher label span {
          color: #59687f;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .home-v2-library-switcher select,
        .home-v2-library-switcher button {
          border: 1px solid #c7d1e0;
          border-radius: 8px;
          font: inherit;
          min-height: 42px;
        }

        .home-v2-library-switcher select {
          background: #ffffff;
          color: #17233a;
          padding: 8px 10px;
          width: 100%;
        }

        .home-v2-library-switcher button {
          background: #155ee8;
          color: #ffffff;
          cursor: pointer;
          font-weight: 800;
          padding: 8px 14px;
        }

        .home-v2-library-switcher button:disabled {
          cursor: default;
          opacity: 0.55;
        }

        .home-v2-setup-tree {
          text-align: left;
        }

        .home-v2-progress-list,
        .home-v2-tree {
          display: grid;
          gap: 12px;
        }

        .home-v2-progress-overview {
          color: #64748b;
          font-size: 14px;
          margin: -8px 0 18px;
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
          display: block;
          font-size: 17px;
          font-weight: 500;
          letter-spacing: -0.01em;
        }

        .home-v2-topic-copy small {
          color: #64748b;
          display: block;
          font-size: 12px;
          line-height: 1.35;
          margin-top: 2px;
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
            grid-template-columns: minmax(0, 1fr);
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
