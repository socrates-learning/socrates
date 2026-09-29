'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { Header, HeaderSessionProvider } from '@/components/Header';
import { MarkdownContent } from '@/components/MarkdownContent';
import { LearnerHeader, HomeRail, LibrarySubjectSwitcher, PlannerFallback, type LearnerHeaderPrefix, type LearnerNavIcon, type HeaderItem, type RailItem } from '@/components/study-planner/LearnerShell';
import { PlannerStats } from '@/components/study-planner/PlannerStats';
import { StudyModeStyles } from '@/components/study-planner/StudyModeStyles';
import {
  getBootstrapErrorMessage,
  getHomeBootstrapView,
  hasAuthoritativeInitialDeckData,
} from '@/lib/home-bootstrap';
import { supabase } from '@/lib/supabase';
import {
  getTopicSelectionPresentation,
} from '@/lib/topic-selection-presentation';
import type { ActiveLibrary, ActiveLibraryRole } from '@/lib/library-context';
import type { StudyPlannerInitialData } from '@/lib/study-planner-initial-data';
import {
  getOfficialStudyReadyQuestionCounts,
  selectNextStudyCandidate,
  startStudySessionWithCandidate,
  type StudyCandidate,
  type StudyCandidateRow,
  type StudySessionStartup,
} from '@/lib/study-candidates';
import {
  loadOfficialStudyConceptReview,
  type StudyConceptReview,
} from '@/lib/study-concept-review';
import { recordPersonalStudyAttempt } from '@/lib/personal-study-attempts';
import {
  EMPTY_STUDY_DECK_ERROR,
  type StudySessionStartOutcome,
} from '@/lib/study-session-start';
import type { ReactNode } from 'react';
import { composeHomeGroups, groupSelection, mutateHomeSettings, requireHomeSettings, type HomeGroup, type HomeSettings, type TopicPlacement } from '@/lib/home-deck-settings';

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

type StudyCandidateFlag = {
  id: string;
  note: string | null;
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
type PlannerMode = 'dashboard' | 'stats' | 'study';
type StatsTab = 'progress' | 'history' | 'algorithm';
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

const learnerNavItems: Array<{
  icon: LearnerNavIcon;
  label: string;
  href?: string;
}> = [
    { href: '/', icon: 'home', label: 'Home' },
    { href: '/creator/concepts/new', icon: 'creator', label: 'Creator Studio' },
    { href: '/admin/users', icon: 'admin', label: 'Admin' },
  ];

function createHomeRailItems(homeCreatorEntry: {
  label: 'Creator Studio';
  href: '/creator';
}): Array<{ label: string; icon: string; href?: string }> {
  return [
    { ...homeCreatorEntry, icon: 'edit' },
    { label: 'Stats', icon: 'bars' },
    { label: 'Account Settings', icon: 'gear', href: '/account' },
    { label: 'Menu', icon: 'people' },
  ];
}

const CreatorAlgorithmDiagnostics = dynamic(
  () =>
    import('./CreatorAlgorithmDiagnostics').then(
      (module) => module.CreatorAlgorithmDiagnostics
    ),
  {
    loading: () => (
      <p className="home-v2-stats-loading" role="status">
        Loading Algorithm diagnostics…
      </p>
    ),
  }
);

const statsTabHashes: Record<StatsTab, string> = {
  progress: '#stats',
  history: '#stats-history',
  algorithm: '#stats-algorithm',
};

function getStatsTabFromHash(hash: string): StatsTab | null {
  if (hash === statsTabHashes.progress) return 'progress';
  if (hash === statsTabHashes.history) return 'history';
  if (hash === statsTabHashes.algorithm) return 'algorithm';
  return null;
}

function StudyFeedbackIcon({ type }: { type: 'up' | 'more' | 'down' }) {
  if (type === 'more') {
    return <span className="study-v2-other-label">Other</span>;
  }

  return (
    <span aria-hidden="true" className="study-v2-feedback-emoji">
      {type === 'up' ? '👍' : '👎'}
    </span>
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
  homeCreatorEntry = { label: 'Creator Studio', href: '/creator' },
  initialDeckData,
  initialSession,
}: {
  activeLibrary: ActiveLibrary | null;
  homeCreatorEntry?: {
    label: 'Creator Studio';
    href: '/creator';
  };
  initialDeckData?: StudyPlannerInitialData;
  initialSession?: {
    userId: string;
    email: string | null;
    displayName: string;
    role: ActiveLibraryRole;
  } | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const homeRailItems = createHomeRailItems(homeCreatorEntry);
  const initialRootNodeId =
    initialDeckData?.nodes.find((node) => node.parent_id === null)?.id || null;
  const initialPersonalRootTopicIds =
    initialDeckData?.personalTopics
      .filter((topic) => topic.parent_id === null)
      .map((topic) => `personal:topic:${topic.id}`) || [];
  const [mode, setMode] = useState<PlannerMode>('dashboard');
  const [statsTab, setStatsTab] = useState<StatsTab>('progress');
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
  const [libraryAvailabilityQuestionCounts, setLibraryAvailabilityQuestionCounts] =
    useState<Record<string, number>>(
      initialDeckData?.libraryAvailabilityQuestionCounts || {}
    );
  const [selectedDeckQuestionCounts, setSelectedDeckQuestionCounts] =
    useState<Record<string, number>>(initialDeckData?.selectedDeckQuestionCounts || {});
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(
    new Set(initialDeckData?.selectedNodeIds || [])
  );
  const [excludedNodeIds, setExcludedNodeIds] = useState<Set<string>>(
    new Set(initialDeckData?.excludedNodeIds || [])
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
  const [homeSettings, setHomeSettings] = useState<HomeSettings | null>(initialDeckData?.homeSettings || null);
  const [homeTopicPlacements, setHomeTopicPlacements] = useState<TopicPlacement[]>(initialDeckData?.homeTopicPlacements || []);
  const [settingsError, setSettingsError] = useState(initialDeckData?.settingsLoadError || '');
  const [groupDrafts, setGroupDrafts] = useState<Record<string, number>>({});
  const settingsRequest = useRef(false);
  const settingsContext = useRef('');
  const settingsDeckId = deck?.id;
  const settingsLibraryId = activeLibrary?.id;

  useEffect(() => {
    settingsContext.current = `${settingsDeckId || ''}:${settingsLibraryId || ''}:${userId || ''}`;
    if (!settingsDeckId || !settingsLibraryId || !userId) return;
    if (initialDeckData?.deck?.id === settingsDeckId && initialDeckData.libraryId === settingsLibraryId
      && (initialDeckData.homeSettings || initialDeckData.settingsLoadError)) return;
    let cancelled = false;
    setHomeSettings(null);
    setSettingsError('');
    setGroupDrafts({});
    async function loadSettings() {
      try {
        const [snapshot, placementResult] = await Promise.all([
          supabase.rpc('get_home_study_bootstrap', { p_library_id: settingsLibraryId, p_deck_id: settingsDeckId }),
          supabase.from('personal_topic_official_placements').select('personal_topic_id,library_node_id').eq('owner_id', userId!),
        ]);
        if (snapshot.error) throw new Error(snapshot.error.message);
        if (placementResult.error) throw new Error(placementResult.error.message);
        const loaded = requireHomeSettings(snapshot.data);
        if (cancelled) return;
        setHomeTopicPlacements(placementResult.data || []);
        setHomeSettings(loaded);
      } catch (error) {
        if (!cancelled) setSettingsError(error instanceof Error ? error.message : 'Unable to load Deck settings.');
      }
    }
    void loadSettings();
    return () => { cancelled = true; };
  }, [settingsDeckId, settingsLibraryId, userId, initialDeckData]);

  // Bootstrap supplies initial progress/history; confirmed Study activity refreshes it.
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
  const [configuredGroupKey, setConfiguredGroupKey] = useState<string | null>(
    initialRootNodeId ? `official:topic:${initialRootNodeId}` : null
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
  const [candidateFlag, setCandidateFlag] = useState<StudyCandidateFlag | null>(null);
  const [isCandidateFlagLoading, setIsCandidateFlagLoading] = useState(false);
  const [isFlagModalOpen, setIsFlagModalOpen] = useState(false);
  const [isFlagSaving, setIsFlagSaving] = useState(false);
  const [flagNote, setFlagNote] = useState('');
  const [flagError, setFlagError] = useState('');
  const [isConceptReviewOpen, setIsConceptReviewOpen] = useState(false);
  const [isConceptReviewLoading, setIsConceptReviewLoading] = useState(false);
  const [conceptReview, setConceptReview] =
    useState<StudyConceptReview | null>(null);
  const [conceptReviewError, setConceptReviewError] = useState('');
  const [studyActionStatus, setStudyActionStatus] = useState('');
  const [studySubmissionStatus, setStudySubmissionStatus] = useState<'idle' | 'saving' | 'save-error' | 'loading-next' | 'next-error'>('idle');
  const studySubmission = useRef<{ id: string; response: Exclude<StudyResponse, null> } | null>(null);
  const studyResponseSaveLock = useRef(false);
  const studyCardFeedbackSaveLock = useRef(false);
  const studyCardFeedbackConfirmationTimer = useRef<number | null>(null);
  const studyResponseRecordedForCard = useRef(false);
  const studyModeOpenLock = useRef(false);
  const studySessionIdRef = useRef<string | null>(null);
  const studySessionCreatePromiseRef =
    useRef<Promise<StudySessionStartup | null> | null>(null);
  const studySessionStartRequestIdRef = useRef<string | null>(null);
  const conceptReviewTriggerRef = useRef<HTMLButtonElement | null>(null);
  const conceptReviewDialogRef = useRef<HTMLElement | null>(null);
  const conceptReviewRequestRef = useRef<{
    key: string;
    request: Promise<StudyConceptReview | null>;
  } | null>(null);
  const conceptReviewLoadedKeyRef = useRef<string | null>(null);
  const conceptReviewRequestVersionRef = useRef(0);
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
    const candidate = studyCandidate;
    let isCurrent = true;

    setIsFlagModalOpen(false);
    setIsConceptReviewOpen(false);
    setIsConceptReviewLoading(false);
    setConceptReview(null);
    setConceptReviewError('');
    conceptReviewRequestRef.current = null;
    conceptReviewLoadedKeyRef.current = null;
    conceptReviewRequestVersionRef.current += 1;
    setCandidateFlag(null);
    setFlagNote('');
    setFlagError('');
    setStudyActionStatus('');

    if (!candidate || !userId) {
      setIsCandidateFlagLoading(false);
      return () => {
        isCurrent = false;
      };
    }
    const candidateToLoad = candidate;

    async function loadCandidateFlag() {
      setIsCandidateFlagLoading(true);
      const targetColumn =
        candidateToLoad.kind === 'official' ? 'question_id' : 'personal_card_id';
      const targetId =
        candidateToLoad.kind === 'official'
          ? candidateToLoad.questionId
          : candidateToLoad.cardId;
      const { data, error } = await supabase
        .from('study_candidate_flags')
        .select('id, note')
        .eq(targetColumn, targetId)
        .maybeSingle();

      if (!isCurrent) return;

      if (error) {
        console.error('Unable to load the private Study flag.', error);
      } else {
        setCandidateFlag((data as StudyCandidateFlag | null) ?? null);
      }
      setIsCandidateFlagLoading(false);
    }

    void loadCandidateFlag();

    return () => {
      isCurrent = false;
    };
  }, [studyCandidate, userId]);

  useEffect(() => {
    if (!isConceptReviewOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const trigger = conceptReviewTriggerRef.current;
    const dialog = conceptReviewDialogRef.current;
    const focusableSelector =
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusable = () =>
      dialog
        ? Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
        : [];
    const focusFrame = window.requestAnimationFrame(() => {
      focusable()[0]?.focus();
    });

    function handleConceptReviewKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsConceptReviewOpen(false);
        return;
      }

      if (event.key !== 'Tab') return;

      const elements = focusable();
      if (elements.length === 0) {
        event.preventDefault();
        dialog?.focus();
        return;
      }

      const first = elements[0];
      const last = elements[elements.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleConceptReviewKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleConceptReviewKeyDown);
      if (trigger?.isConnected) {
        trigger.focus();
      } else {
        previouslyFocused?.focus();
      }
    };
  }, [isConceptReviewOpen]);

  useEffect(() => {
    if (!isFlagModalOpen) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (!isFlagSaving) setIsFlagModalOpen(false);
    }

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isFlagModalOpen, isFlagSaving]);

  useEffect(() => {
    let isMounted = true;

    if (hasAuthoritativeInitialDeckData(initialDeckData, activeLibrary)) {
      // Hash navigation owns the initial mode. A save-triggered route refresh
      // must not send a Study session that has just opened back to Home.
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
      setSelectedDeckQuestionCounts({});
      setLibraryAvailabilityQuestionCounts({});
      setSelectedNodeIds(new Set());
      setExcludedNodeIds(new Set());
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
        window.location.hash === '#stats' ? 'stats' : 'dashboard'
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
          setExcludedNodeIds(new Set());
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
          excludedNodesResult,
          overridesResult,
          preferenceResult,
          resolvedResult,
          learnerProgressResult,
          libraryAvailabilityResult,
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
            .from('study_deck_node_exclusions')
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
          supabase.rpc('get_library_official_availability_counts', {
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
        const { data: excludedNodesData, error: excludedNodesError } =
          excludedNodesResult;
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
          excludedNodesError ||
          overridesError ||
          preferenceError ||
          resolvedError ||
          libraryAvailabilityResult.error;

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
        const { data: candidateData, error: questionError } = conceptIds.length
          ? await supabase.rpc('resolve_study_candidates', {
            p_deck_id: activeDeck.id,
          })
          : { data: [], error: null };

        if (!isMounted) return;

        if (questionError) {
          setMessage(`Unable to load deck questions: ${questionError.message}`);
          return;
        }
        const nextQuestionCounts = getOfficialStudyReadyQuestionCounts(
          (candidateData || []) as StudyCandidateRow[]
        );

        if (!isMounted) return;

        const rootNode = loadedNodes.find((node) => node.parent_id === null);
        const loadedAvailableLibraries = availableLibrariesResult.data?.length
          ? (availableLibrariesResult.data as ActiveLibrary[])
          : [activeLibrary];

        setDeck(activeDeck);
        setAvailableLibraries(loadedAvailableLibraries);
        setNodes(loadedNodes);
        setPlacements(loadedPlacements);
        setSelectedDeckQuestionCounts(nextQuestionCounts);
        setLibraryAvailabilityQuestionCounts(libraryAvailabilityResult.data || {});
        setSelectedNodeIds(
          new Set((selectedNodesData || []).map((selection) => selection.node_id))
        );
        setExcludedNodeIds(
          new Set((excludedNodesData || []).map((exclusion) => exclusion.node_id))
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
              .map((topic) => `personal:topic:${topic.id}`)
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
        setConfiguredGroupKey(rootNode ? `official:topic:${rootNode.id}` : null);
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

  const canViewAlgorithmDiagnostics = role === 'editor' || role === 'admin';

  useEffect(() => {
    if (pathname !== '/') return;

    function openModeFromHash() {
      // Old bookmarks now return to Home without losing Library query parameters.
      if (window.location.hash === '#set-up-deck') {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      const requestedStatsTab = getStatsTabFromHash(window.location.hash);

      if (requestedStatsTab) {
        if (requestedStatsTab === 'algorithm' && !canViewAlgorithmDiagnostics) {
          setStatsTab('progress');
          window.history.replaceState(null, '', statsTabHashes.progress);
        } else {
          setStatsTab(requestedStatsTab);
        }
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
    window.addEventListener('popstate', openModeFromHash);
    window.addEventListener('socrates-open-deck-dashboard', openDashboard);

    return () => {
      window.removeEventListener('hashchange', openModeFromHash);
      window.removeEventListener('popstate', openModeFromHash);
      window.removeEventListener('socrates-open-deck-dashboard', openDashboard);
    };
  }, [canViewAlgorithmDiagnostics, pathname]);

  useEffect(() => {
    const layout = document.querySelector<HTMLElement>('main.layout');

    if (mode === 'stats') {
      const requestedStatsTab = getStatsTabFromHash(window.location.hash);

      if (requestedStatsTab !== statsTab) {
        window.history.replaceState(null, '', statsTabHashes[statsTab]);
      }
    } else if (
      window.location.hash === '#set-up-deck' ||
      getStatsTabFromHash(window.location.hash)
    ) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    if (!layout) return;

    if (mode === 'study') {
      // Study uses the focused full-width layout.
      layout.style.gridTemplateColumns = '1fr';

      window.dispatchEvent(new Event('socrates-open-study'));
    } else {
      // Page 1 returns to the normal dashboard layout.
      layout.style.gridTemplateColumns = '';

      if (mode === 'dashboard') {
        window.dispatchEvent(new Event('socrates-open-deck-dashboard'));
      }
    }
  }, [mode, statsTab]);

  // Tab changes own mode/hash navigation; they do not fetch progress.
  function openStatsTab(tab: StatsTab) {
    if (tab === 'algorithm' && !canViewAlgorithmDiagnostics) return;

    setStatsTab(tab);
    setMode('stats');
    if (window.location.hash !== statsTabHashes[tab]) {
      window.history.pushState(null, '', statsTabHashes[tab]);
    }
  }

  async function ensureStudySessionWithCandidate() {
    if (studySessionIdRef.current) {
      const selectedCandidate = await selectNextStudyCandidate(
        supabase,
        studySessionIdRef.current
      );
      return selectedCandidate
        ? { sessionId: studySessionIdRef.current, candidate: selectedCandidate }
        : null;
    }
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
      const requestId =
        studySessionStartRequestIdRef.current ?? window.crypto.randomUUID();
      studySessionStartRequestIdRef.current = requestId;

      try {
        const startup = await startStudySessionWithCandidate(
          supabase,
          deck.id,
          sessionBalance,
          requestId
        );
        if (studySessionStartRequestIdRef.current === requestId) {
          setStudyStartFailure(null);
          studySessionIdRef.current = startup.sessionId;
          studySessionStartRequestIdRef.current = null;
        }
        return startup;
      } catch (error) {
        const isEmptyDeck =
          error instanceof Error && error.message === EMPTY_STUDY_DECK_ERROR;
        if (studySessionStartRequestIdRef.current === requestId) {
          setStudyStartFailure(isEmptyDeck ? 'empty-deck' : 'error');
          if (isEmptyDeck) {
            studySessionStartRequestIdRef.current = null;
          }
        }
        if (!isEmptyDeck) {
          console.error('Unable to start Study Mode session.', error);
        }
        return null;
      }
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

  function returnToStudyQuestion() {
    if (
      studySubmissionStatus !== 'idle' ||
      studyResponseSaveLock.current ||
      studyResponseRecordedForCard.current
    ) {
      return;
    }

    resetStudyCardFeedback();
    setStudyFeedback(null);
    setStudyResponse(null);
    setIsAnswerVisible(false);
  }

  async function loadStudyConceptReview({ retry = false } = {}) {
    const candidate = studyCandidate;

    if (candidate?.kind !== 'official' || !activeLibrary?.id) return;

    const requestKey = `${candidate.candidateId}:${candidate.conceptId}:${activeLibrary.id}`;

    if (!retry && conceptReviewLoadedKeyRef.current === requestKey) return;

    const existingRequest = conceptReviewRequestRef.current;
    if (existingRequest?.key === requestKey) {
      return;
    }

    const requestVersion = conceptReviewRequestVersionRef.current + 1;
    conceptReviewRequestVersionRef.current = requestVersion;
    setIsConceptReviewLoading(true);
    setConceptReviewError('');

    const request = loadOfficialStudyConceptReview(supabase, {
      conceptId: candidate.conceptId,
      libraryId: activeLibrary.id,
    });
    conceptReviewRequestRef.current = { key: requestKey, request };

    try {
      const review = await request;

      if (conceptReviewRequestVersionRef.current !== requestVersion) return;

      conceptReviewLoadedKeyRef.current = requestKey;
      setConceptReview(review);
      setConceptReviewError(
        review
          ? ''
          : 'Concept review content is not available for this Study card.'
      );
    } catch (error) {
      if (conceptReviewRequestVersionRef.current !== requestVersion) return;

      console.error('Unable to load Study Concept review.', error);
      setConceptReviewError(
        'Concept review content could not be loaded. Please try again.'
      );
    } finally {
      if (conceptReviewRequestRef.current?.request === request) {
        conceptReviewRequestRef.current = null;
      }
      if (conceptReviewRequestVersionRef.current === requestVersion) {
        setIsConceptReviewLoading(false);
      }
    }
  }

  function openStudyConceptReview() {
    if (studyCandidate?.kind !== 'official' || !activeLibrary?.id) return;

    setIsConceptReviewOpen(true);
    void loadStudyConceptReview();
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

  function openFlagModal() {
    setFlagNote(candidateFlag?.note || '');
    setFlagError('');
    setIsFlagModalOpen(true);
  }

  async function saveCandidateFlag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const candidate = studyCandidate;
    if (!candidate || !userId || isFlagSaving) return;

    setIsFlagSaving(true);
    setFlagError('');
    const normalizedNote = flagNote.trim() || null;
    const targetColumn =
      candidate.kind === 'official' ? 'question_id' : 'personal_card_id';
    const payload = {
      user_id: userId,
      question_id: candidate.kind === 'official' ? candidate.questionId : null,
      personal_card_id: candidate.kind === 'personal' ? candidate.cardId : null,
      note: normalizedNote,
    };

    const { data, error } = await supabase
      .from('study_candidate_flags')
      .upsert(payload, { onConflict: `user_id,${targetColumn}` })
      .select('id, note')
      .single();

    if (error) {
      console.error('Unable to save the private Study flag.', error);
      setFlagError(error.message || 'The flag could not be saved.');
      setIsFlagSaving(false);
      return;
    }

    if (studyCandidate?.candidateId === candidate.candidateId) {
      setCandidateFlag(data as StudyCandidateFlag);
      setFlagNote((data as StudyCandidateFlag).note || '');
      setStudyActionStatus(candidateFlag ? 'Flag changes saved.' : 'Card flagged.');
      setIsFlagModalOpen(false);
    }
    setIsFlagSaving(false);
  }

  async function removeCandidateFlag() {
    const candidate = studyCandidate;
    if (!candidateFlag || !candidate || isFlagSaving) return;

    setIsFlagSaving(true);
    setFlagError('');
    const { error } = await supabase
      .from('study_candidate_flags')
      .delete()
      .eq('id', candidateFlag.id);

    if (error) {
      console.error('Unable to remove the private Study flag.', error);
      setFlagError(error.message || 'The flag could not be removed.');
      setIsFlagSaving(false);
      return;
    }

    if (studyCandidate?.candidateId === candidate.candidateId) {
      setCandidateFlag(null);
      setFlagNote('');
      setStudyActionStatus('Flag removed.');
      setIsFlagModalOpen(false);
    }
    setIsFlagSaving(false);
  }

  async function openStudyMode() {
    if (studyModeOpenLock.current || isSaving || !deck || !userId) return;

    studyModeOpenLock.current = true;
    setStudyCandidate(null);
    setIsStudySequenceComplete(false);
    setStudyStartFailure(null);
    setIsAnswerVisible(false);
    setStudyFeedback(null);
    setStudyResponse(null);
    resetStudyCardFeedback();
    studyResponseRecordedForCard.current = false;
    studySubmission.current = null;
    setStudySubmissionStatus('idle');

    try {
      const startup = await ensureStudySessionWithCandidate();

      if (startup) {
        setStudyCandidate(startup.candidate);
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
        ? studySessionCreatePromiseRef.current.then(
          (startup) => startup?.sessionId ?? null
        )
        : studySessionStartRequestIdRef.current);

    studySessionIdRef.current = null;
    studySessionCreatePromiseRef.current = null;
    studySessionStartRequestIdRef.current = null;
    studyResponseRecordedForCard.current = false;
    studySubmission.current = null;
    setStudySubmissionStatus('idle');
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

  async function loadNextStudyCard(sessionId: string) {
    setStudySubmissionStatus('loading-next');
    try {
      const selectedCandidate = await selectNextStudyCandidate(supabase, sessionId);
      // Ignore a request that finishes after Exit or a different session starts.
      if (studySessionIdRef.current !== sessionId) return;
      setStudyCandidate(selectedCandidate);
      setIsStudySequenceComplete(!selectedCandidate);
      setIsAnswerVisible(false);
      setStudyFeedback(null);
      setStudyResponse(null);
      resetStudyCardFeedback();
      studyResponseRecordedForCard.current = false;
      studySubmission.current = null;
      setStudySubmissionStatus('idle');
    } catch (error) {
      if (studySessionIdRef.current !== sessionId) return;
      console.error('Unable to load the next Study card.', error);
      setStudySubmissionStatus('next-error');
    }
  }

  async function retryNextStudyCard() {
    const sessionId = studySessionIdRef.current;
    if (!sessionId || studyResponseSaveLock.current || !studyResponseRecordedForCard.current) return;
    studyResponseSaveLock.current = true;
    try {
      await loadNextStudyCard(sessionId);
    } finally {
      studyResponseSaveLock.current = false;
    }
  }

  async function persistFinalStudyResponse(
    response: Exclude<StudyResponse, null>
  ) {
    if (studyResponseSaveLock.current || studyResponseRecordedForCard.current) return;
    if (!studyCandidate || !userId || !deck) return;

    // Freeze both the identity and rating before sending. An uncertain outcome
    // can only retry this exact response, never submit a second rating.
    studySubmission.current ??= { id: crypto.randomUUID(), response };
    const submission = studySubmission.current;
    setStudyResponse(submission.response);
    studyResponseSaveLock.current = true;
    setStudySubmissionStatus('saving');
    const sessionId = studySessionIdRef.current;

    try {
      if (!sessionId) throw new Error('Study session is unavailable.');
      if (studyCandidate.kind === 'official') {
        const { error } = await supabase.rpc('record_study_session_attempt', {
          p_study_session_id: sessionId,
          p_question_id: studyCandidate.questionId,
          p_concept_id: studyCandidate.conceptId,
          p_result: submission.response,
          p_submission_id: submission.id,
        });
        if (error) throw error;
      } else {
        await recordPersonalStudyAttempt(supabase, {
          studySessionId: sessionId,
          studyDeckId: deck.id,
          personalCardId: studyCandidate.cardId,
          personalConceptId: studyCandidate.personalConceptId,
          result: submission.response,
          submissionId: submission.id,
        });
      }
      if (studySessionIdRef.current !== sessionId) return;
      studyResponseRecordedForCard.current = true;
      void refreshLearnerProgress();
      await loadNextStudyCard(sessionId);
    } catch (error) {
      if (studySessionIdRef.current !== sessionId) return;
      console.error('Unable to confirm Study Mode response.', error);
      setStudySubmissionStatus('save-error');
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
      if (window.location.hash) {
        window.history.pushState(
          null,
          '',
          window.location.pathname + window.location.search
        );
      }
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

  const classPrefix: LearnerHeaderPrefix = mode === 'study' ? 'study-v2' : 'home-v2';
  const isEditor = role === 'editor' || role === 'admin';
  const isAdmin = role === 'admin';
  const items = learnerNavItems.map((item): HeaderItem | null => {
    if (item.icon === 'creator' && (!isEditor || (classPrefix === 'home-v2' && mode !== 'stats'))) return null;
    if (item.icon === 'admin' && !isAdmin) return null;
    const isStudy = item.icon === 'study';
    const isAccount = item.icon === 'account';
    const className = [
      `${classPrefix}-nav-item`,
      classPrefix !== 'home-v2' && isStudy ? `${classPrefix}-nav-active` : '',
      classPrefix !== 'home-v2' && isAccount ? `${classPrefix}-nav-account` : '',
      classPrefix === 'home-v2' && isAccount ? 'home-v2-nav-account' : '',
    ].filter(Boolean).join(' ');
    const presentation = { label: item.label, icon: item.icon, className, accountChevron: isAccount };
    if (item.href) {
      return { ...presentation, kind: 'link', href: item.href,
        onClick: item.icon === 'home' ? handleHomeClick : item.icon === 'creator' ? handleCreatorClick : undefined,
        prefetch: item.icon === 'home' ? false : undefined };
    } else if (isStudy) {
      return { ...presentation, kind: 'button', onClick: openStudyMode, disabled: isSaving };
    } else if (isAccount) {
      return { ...presentation, kind: 'button', onClick: handleLogout,
        title: email ? `Signed in as ${email}. Click to log out.` : 'Account' };
    } else {
      return { ...presentation, kind: 'button', disabled: true };
    }
  }).filter((item): item is HeaderItem => item !== null);

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

  function branchAvailabilityQuestionCount(nodeId: string) {
    return branchConceptIds(nodeId).reduce(
      (total, conceptId) => total + (libraryAvailabilityQuestionCounts[conceptId] || 0),
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



  async function refreshResolvedDeck(deckId = deck?.id) {
    if (!deckId) return;

    const [resolvedResult, candidateResult] = await Promise.all([
      supabase.rpc('resolve_study_deck', {
        p_deck_id: deckId,
      }),
      supabase.rpc('resolve_study_candidates', {
        p_deck_id: deckId,
      }),
    ]);

    if (resolvedResult.error || candidateResult.error) {
      setMessage(
        `Deck saved, but summary could not refresh: ${resolvedResult.error?.message || candidateResult.error?.message
        }`
      );
      return;
    }

    setResolvedConcepts((resolvedResult.data || []) as StudyDeckConcept[]);
    setSelectedDeckQuestionCounts(
      getOfficialStudyReadyQuestionCounts(
        (candidateResult.data || []) as StudyCandidateRow[]
      )
    );
  }

  // Shared progress/history read model; keep existing data when refresh fails.
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

  async function toggleNodeSelection(nodeId: string, shouldInclude: boolean) {
    if (!activeLibrary?.id || !deck || !userId) return;

    setIsSaving(true);
    setMessage(
      shouldInclude ? 'Adding topic to deck...' : 'Removing topic from deck...'
    );

    const { data, error } = await supabase.rpc('set_study_deck_node_selection', {
      p_deck_id: deck.id,
      p_node_id: nodeId,
      p_should_include: shouldInclude,
    });

    if (error) {
      setMessage(`Unable to update deck: ${error.message}`);
      setIsSaving(false);
      return;
    }

    const persisted = data as {
      selected_node_ids?: string[];
      excluded_node_ids?: string[];
    } | null;
    const nextSelectedIds = new Set(persisted?.selected_node_ids || []);
    setSelectedNodeIds(nextSelectedIds);
    setExcludedNodeIds(new Set(persisted?.excluded_node_ids || []));
    setNodePreferences((current) => {
      const next = { ...current };
      for (const selectedId of nextSelectedIds) {
        if (next[selectedId] === undefined) next[selectedId] = 50;
      }
      return next;
    });

    setMessage('Deck updated.');
    await refreshResolvedDeck();
    router.refresh();
    setIsSaving(false);
  }

  async function saveGroupSetting(group: HomeGroup, value: boolean | number) {
    if (!deck || !activeLibrary || !homeSettings || settingsRequest.current || isSaving) return;
    const preference = typeof value === 'number';
    const saved = (group.source === 'collection' ? homeSettings.personal_collection_preferences : homeSettings.personal_topic_preferences)[group.id] ?? 50;
    if (preference && value === saved) return;
    settingsRequest.current = true;
    const context = settingsContext.current;
    setIsSaving(true);
    setMessage('Saving deck settings...');
    try {
      const next = await mutateHomeSettings((name, args) => supabase.rpc(name, args), deck.id, activeLibrary.id,
        group.source === 'collection' ? (preference ? 'collection-preference' : 'collection-selection')
          : (preference ? 'topic-preference' : 'topic-selection'), group.id, value);
      if (settingsContext.current !== context) return;
      setHomeSettings(next);
      setSelectedPersonalTopicIds(new Set(next.unified_deck_settings.included_topic_ids));
      setSelectedPersonalCollectionIds(new Set(next.unified_deck_settings.selected_collection_ids));
      setGroupDrafts({});
      setMessage('Deck settings saved.');
      router.refresh();
    } catch (error) {
      if (settingsContext.current !== context) return;
      setGroupDrafts({});
      // Preserve the last confirmed state; an uncertain write needs a reload, not a retry.
      setSettingsError(error instanceof Error ? error.message : 'Unable to confirm deck settings. Reload Home.');
      setMessage('Unable to confirm deck settings. Reload Home before changing settings.');
    } finally {
      settingsRequest.current = false;
      if (settingsContext.current === context) setIsSaving(false);
    }
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

  function renderNode(node: HomeGroup, depth = 0): ReactNode {
    const children = node.children;
    const isLibraryTopic = node.source === 'official';
    const isCollection = node.source === 'collection';
    const isExpanded = isLibraryTopic ? expandedNodeIds.has(node.id) : expandedPersonalTopicIds.has(node.key);
    const branchConceptCount = branchConceptIds(node.id).filter(
      (conceptId) => (libraryAvailabilityQuestionCounts[conceptId] || 0) > 0
    ).length;
    const selection = isLibraryTopic ? getTopicSelectionPresentation(
      node.id,
      nodes,
      placements,
      selectedNodeIds,
      excludedNodeIds,
      conceptOverrides
    ) : groupSelection(node, homeSettings!);
    const preference = isLibraryTopic ? (nodePreferences[node.id] ?? 50)
      : (groupDrafts[node.key] ?? (isCollection ? homeSettings!.personal_collection_preferences : homeSettings!.personal_topic_preferences)[node.id] ?? 50);
    const conceptCount = isLibraryTopic ? branchConceptCount : isCollection ? null : personalBranchCounts(node.id).concepts;
    const questionCount = isLibraryTopic ? branchAvailabilityQuestionCount(node.id)
      : isCollection ? personalCollections.find(c => c.id === node.id)?.cardCount || 0 : personalBranchCounts(node.id).cards;

    return (
      <div
        key={node.key}
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
            background: 'transparent',
            borderBottom: 'none',
            marginBottom: 0,
            minHeight: 48,
            padding: '6px 4px',
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
              onClick={() => isLibraryTopic ? toggleExpandedNode(node.id) : toggleExpandedPersonalTopic(node.key)}
              disabled={children.length === 0}
              aria-label={
                isExpanded ? `Collapse ${node.name}` : `Expand ${node.name}`
              }
              style={{
                alignItems: 'center',
                background: 'transparent',
                border: 'none',
                borderRadius: 0,
                color: '#08143b',
                cursor: children.length === 0 ? 'default' : 'pointer',
                display: 'flex',
                flexShrink: 0,
                fontSize: 13,
                height: 28,
                justifyContent: 'center',
                padding: 0,
                width: 28,
              }}
            >
              {children.length === 0 ? '•' : isExpanded ? '▼' : '▶'}
            </button>

            <div
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
                aria-label={`Include ${node.name} in Study`}
                checked={selection.checked}
                ref={(input) => { if (input) input.indeterminate = selection.partial; }}
                aria-checked={selection.partial ? 'mixed' : selection.checked}
                disabled={isSaving || Boolean(settingsError)}
                aria-describedby={isCollection ? `topic-selection-${node.key}` : undefined}
                title={selection.inherited ? 'Included through a selected parent Topic. Uncheck to exclude this branch.' : undefined}
                onChange={(event) =>
                  void (isLibraryTopic ? toggleNodeSelection(node.id, event.currentTarget.checked) : saveGroupSetting(node, event.currentTarget.checked))
                }
                style={{
                  accentColor: '#08143b',
                  cursor: 'pointer',
                  height: 18,
                  width: 18,
                }}
              />

              <span style={{ minWidth: 0 }}>
                <button
                  type="button"
                  aria-label={`Configure ${node.name} New to Mastery balance`}
                  aria-pressed={configuredGroupKey === node.key}
                  onClick={() => setConfiguredGroupKey(node.key)}
                  style={{
                    background: 'none',
                    border: 0,
                    color: 'inherit',
                    cursor: 'pointer',
                    display: 'block',
                    fontFamily: 'inherit',
                    fontSize: 15,
                    fontWeight: 700,
                    lineHeight: 1.2,
                    padding: 0,
                    textAlign: 'left',
                  }}
                >
                  {node.name}
                </button>

                {isCollection && (
                  <>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {conceptCount === null ? questionCount : conceptCount}{' '}
                      {conceptCount === null ? (questionCount === 1 ? 'Card' : 'Cards') : (conceptCount === 1 ? 'concept' : 'concepts')}
                    </span>
                    <span id={`topic-selection-${node.key}`} className="muted" style={{ display: 'block', fontSize: 12 }}>
                      {selection.partial ? 'Partially included. ' : ''}
                      {selection.excluded
                        ? 'Excluded'
                        : selection.excludedByAncestor
                          ? 'Excluded by parent'
                          : selection.inherited
                            ? 'Included by parent'
                            : selection.explicit ? 'Selected directly' : ''}
                    </span>
                  </>
                )}
              </span>
            </div>

            <span
              title="Study-ready questions in this branch"
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
              {questionCount}
            </span>
          </div>

        </div>

        {selection.explicit && configuredGroupKey === node.key && (
          <div
            style={{
              marginBottom: 8,
              padding: '0 14px 2px 56px',
            }}
          >
            <div
              style={{
                alignItems: 'center',
                display: 'flex',
                gap: 12,
              }}
            >
              <span style={{ color: '#08143b', fontSize: 12, fontWeight: 700 }}>
                New
              </span>
              <input
                className="home-v2-preference-slider"
                aria-label={`${node.name} New to Mastery balance`}
                disabled={isSetupCramMode || isSaving || Boolean(settingsError)}
                max="100"
                min="0"
                type="range"
                value={preference}
                onChange={(event) => {
                  const nextBalance = Number(event.target.value);
                  if (isLibraryTopic) setNodePreferences((current) => ({ ...current, [node.id]: nextBalance }));
                  else setGroupDrafts((current) => ({ ...current, [node.key]: nextBalance }));
                }}
                onBlur={(event) =>
                  void (isLibraryTopic ? persistNodePreference(node.id, Number(event.currentTarget.value)) : saveGroupSetting(node, Number(event.currentTarget.value)))
                }
                onKeyUp={(event) =>
                  void (isLibraryTopic ? persistNodePreference(node.id, Number(event.currentTarget.value)) : saveGroupSetting(node, Number(event.currentTarget.value)))
                }
                onPointerUp={(event) =>
                  void (isLibraryTopic ? persistNodePreference(node.id, Number(event.currentTarget.value)) : saveGroupSetting(node, Number(event.currentTarget.value)))
                }
                style={{
                  accentColor: '#08143b',
                  cursor: isSetupCramMode ? 'not-allowed' : 'pointer',
                  flex: 1,
                  opacity: isSetupCramMode ? 0.5 : 1,
                }}
              />
              <span style={{ color: '#08143b', fontSize: 12, fontWeight: 700 }}>
                Mastery
              </span>
              <strong style={{ color: '#0f172a', minWidth: 30, textAlign: 'right' }}>
                {preference}
              </strong>
            </div>
          </div>
        )}
        {isExpanded && children.length > 0 && (
          <div style={{ marginTop: 4 }}>
            {children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  let homeGroups: HomeGroup[] = [];
  let homeTreeError = settingsError;
  if (homeSettings && !homeTreeError) {
    try {
      homeGroups = composeHomeGroups(nodes, personalTopics, homeTopicPlacements, personalCollections);
      // Validate every authoritative state before rendering a partially assembled tree.
      const inspect = (group: HomeGroup) => { if (group.source !== 'official') groupSelection(group, homeSettings); group.children.forEach(inspect); };
      homeGroups.forEach(inspect);
    } catch (error) {
      homeTreeError = error instanceof Error ? error.message : 'Unable to display Deck settings.';
    }
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
      (conceptId) =>
        conceptOverrides[conceptId] !== 'excluded' &&
        (selectedDeckQuestionCounts[conceptId] || 0) > 0
    );

    const questionTotal = conceptIds.reduce(
      (total, conceptId) => total + (selectedDeckQuestionCounts[conceptId] || 0),
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
  const homeBootstrapView = getHomeBootstrapView({
    activeLibraryId: activeLibrary?.id,
    availableLibraryCount: availableLibraries.length,
    bootstrapError: bootstrapError || homeTreeError,
    hasDeck: Boolean(deck),
    isLoading: isLoading || Boolean(deck && !homeSettings && !homeTreeError),
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

    return <LibrarySubjectSwitcher
      options={availableLibraries}
      label={currentSlug ? 'Current Subject' : 'Choose a Library'}
      defaultSlug={currentSlug || availableLibraries[0].slug}
      submitLabel={currentSlug ? 'Switch' : 'Choose Library'}
      disabled={Boolean(currentSlug) && availableLibraries.length < 2}
      standalone={standalone}
      action="/library/switch"
      returnTo="/"
    />;
  }

  if (homeBootstrapView === 'loading') {
    return (
      <HeaderSessionProvider email={email} role={role}>
        <Header />
        <PlannerFallback variant="loading" skeletonKeys={homeRailItems.map((item) => item.label)} />
      </HeaderSessionProvider>
    );
  }

  if (homeBootstrapView === 'error') {
    return (
      <HeaderSessionProvider email={email} role={role}>
        <Header />
        <PlannerFallback variant="error" errorText={bootstrapError || homeTreeError} onRetry={() => window.location.reload()} />
      </HeaderSessionProvider>
    );
  }

  if (!activeLibrary?.id) {
    return (
      <HeaderSessionProvider email={email} role={role}>
        <Header />
        <PlannerFallback variant="no-library" librarySwitcher={renderLibrarySubjectSwitcher(null, true)}
          showNoActiveLibraries={(role === 'admin' || role === 'editor') && !availableLibraries.length} />
      </HeaderSessionProvider>
    );
  }

  if (!deck) {
    return (
      <PlannerFallback variant="deck-error" message={message || 'Unable to load your active deck.'} />
    );
  }

  if (mode === 'study') {
    const studyAnswer = studyCandidate?.answer || null;
    const authoredStudyExplanation =
      authoredStudyQuestion?.explanation?.trim() || null;
    const hasConceptReviewContent = Boolean(
      conceptReview &&
      (conceptReview.bodyMarkdown.trim() ||
        conceptReview.summary?.trim() ||
        conceptReview.whyItMatters?.trim())
    );
    const hasStudyCandidate = Boolean(studyCandidate && studyAnswer);
    const hasStudySelections =
      selectedNodeIds.size > 0 ||
      selectedPersonalTopicIds.size > 0 ||
      selectedPersonalCollectionIds.size > 0 ||
      Object.values(conceptOverrides).some((state) => state === 'included');
    const emptyStudyTitle = isStudySequenceComplete
      ? 'Study complete'
      : studyStartFailure === 'empty-deck'
        ? hasStudySelections
          ? 'No eligible study material'
          : 'No study material selected'
        : studyStartFailure === 'error'
          ? 'Study Mode could not start'
          : 'No study material available';
    const emptyStudyMessage = isStudySequenceComplete
      ? 'You reviewed every selected personal Card in this session.'
      : studyStartFailure === 'empty-deck'
        ? hasStudySelections
          ? 'Your selections are saved, but they contain no eligible Published official Questions or selected personal Cards. Review your deck settings on Home.'
          : 'Choose an official Topic, personal Topic, or Personal Deck on Home, then start Study.'
        : studyStartFailure === 'error'
          ? 'Study Mode could not be started. Please try again.'
          : 'This deck does not currently contain an eligible published Question or selected personal Card.';

    const studyCardActions = (
      <div className="study-v2-card-actions" aria-label="Study card controls">
        {hasStudyCandidate && isAnswerVisible && (
          <button
            aria-label="Back to question"
            className="study-v2-context-action"
            disabled={studySubmissionStatus !== 'idle'}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              returnToStudyQuestion();
            }}
            onKeyDown={(event) => event.stopPropagation()}
          >
            Back
          </button>
        )}
        {hasStudyCandidate && (
          <button
            aria-pressed={Boolean(candidateFlag)}
            className={`study-v2-context-action study-v2-flag-action${candidateFlag ? ' study-v2-flag-action-active' : ''
              }`}
            disabled={isCandidateFlagLoading}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              openFlagModal();
            }}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <span aria-hidden="true">⚑</span>
            {isCandidateFlagLoading ? 'Loading…' : 'Flag'}
          </button>
        )}
        <button
          className="study-v2-context-action"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void leaveStudyMode('dashboard');
          }}
          onKeyDown={(event) => event.stopPropagation()}
        >
          Exit
        </button>
      </div>
    );

    return (
      <>
        <LearnerHeader classPrefix="study-v2" brandHref="/" onHomeClick={handleHomeClick} items={items} />
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
              aria-describedby={
                hasStudyCandidate && !isAnswerVisible
                  ? 'study-card-reveal-instruction'
                  : undefined
              }
              className={`study-v2-card ${!hasStudyCandidate
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
                    {studyStartFailure === 'error' && (
                      <button type="button" onClick={() => void openStudyMode()}>
                        Retry
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void leaveStudyMode('dashboard')}
                    >
                      Go Home
                    </button>
                  </div>
                </div>
              ) : !isAnswerVisible ? (
                <div className="study-v2-question-content">
                  {studyCandidate?.kind === 'personal' && studyCandidate.personalConceptId === null
                    ? <MarkdownContent markdown={studyCandidate.prompt} mode="card" interactiveLinks={false} />
                    : <h1>{studyCandidate?.prompt}</h1>}
                  <p
                    className="study-v2-sr-only"
                    id="study-card-reveal-instruction"
                  >
                    Press Enter or Space, or activate the card, to reveal the answer.
                  </p>
                </div>
              ) : (
                <>
                  {studySubmissionStatus !== 'idle' && (
                    <div className="study-v2-submission-status" role="status" aria-live="polite">
                      <p>{studySubmissionStatus === 'saving' ? 'Saving answer…'
                        : studySubmissionStatus === 'loading-next' ? 'Answer saved. Loading next card…'
                          : studySubmissionStatus === 'next-error' ? 'Answer saved. Unable to load next card.'
                            : 'Unable to confirm your answer was saved. Retry the same answer safely.'}</p>
                      {studySubmissionStatus === 'save-error' && (
                        <button className="btn primary" type="button" onClick={() => {
                          if (studySubmission.current) void persistFinalStudyResponse(studySubmission.current.response);
                        }}>Retry answer</button>
                      )}
                      {studySubmissionStatus === 'next-error' && (
                        <button className="btn primary" type="button" onClick={() => void retryNextStudyCard()}>Retry next card</button>
                      )}
                      <button className="btn" type="button" onClick={() => void leaveStudyMode('dashboard')}>Exit</button>
                    </div>
                  )}
                  <div className="study-v2-answer-body">
                    <section
                      className="study-v2-revealed-question"
                      aria-labelledby="study-revealed-question-heading"
                    >
                      <p>Question</p>
                      {studyCandidate?.kind === 'personal' && studyCandidate.personalConceptId === null ? <>
                        <h2 id="study-revealed-question-heading" className="study-v2-sr-only">{studyCandidate.prompt}</h2>
                        <MarkdownContent markdown={studyCandidate.prompt} mode="card" />
                      </> : <h2 id="study-revealed-question-heading">
                        {studyCandidate?.prompt}
                      </h2>}
                    </section>
                    <section
                      className="study-v2-answer-section"
                      aria-labelledby="study-answer-heading"
                    >
                      <h1 id="study-answer-heading">Answer</h1>
                      {studyCandidate?.kind === 'personal' && studyCandidate.personalConceptId === null
                        ? <MarkdownContent markdown={studyAnswer ?? ''} mode="card" />
                        : <p>{studyAnswer}</p>}
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
                    {studyCandidate?.kind === 'official' && activeLibrary?.id && (
                      <div className="study-v2-review-concept-action">
                        <button
                          ref={conceptReviewTriggerRef}
                          type="button"
                          onClick={openStudyConceptReview}
                        >
                          Review Concept
                        </button>
                      </div>
                    )}
                  </div>

                  {studyFeedback === null ? (
                    <div
                      className={`study-v2-feedback-row${studyCandidate?.kind === 'personal'
                        ? ' study-v2-feedback-row-personal'
                        : ''
                        }`}
                    >
                      {(
                        studyCandidate?.kind === 'official'
                          ? [
                            ['up', 'Thumbs up'],
                            ['more', 'Other'],
                            ['down', 'Thumbs down'],
                          ]
                          : [
                            ['up', 'Thumbs up'],
                            ['down', 'Thumbs down'],
                          ]
                      ).map(([value, label]) => (
                        <button
                          aria-label={label}
                          key={value}
                          title={label}
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
                  ) : studySubmissionStatus !== 'idle' ? null : (
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
                            className={`study-v2-rating-button study-v2-rating-${value}${studyResponse === value
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

            {isConceptReviewOpen && studyCandidate?.kind === 'official' && (
              <div
                className="study-v2-modal-backdrop"
                role="presentation"
                onMouseDown={(event) => {
                  if (event.currentTarget === event.target) {
                    setIsConceptReviewOpen(false);
                  }
                }}
              >
                <section
                  aria-labelledby="study-concept-review-title"
                  aria-modal="true"
                  className="study-v2-modal study-v2-concept-review-modal"
                  ref={conceptReviewDialogRef}
                  role="dialog"
                  tabIndex={-1}
                >
                  <div className="study-v2-modal-header">
                    <h2 id="study-concept-review-title">Review Concept</h2>
                    <button
                      aria-label="Close Concept review"
                      type="button"
                      onClick={() => setIsConceptReviewOpen(false)}
                    >
                      ×
                    </button>
                  </div>

                  <div
                    aria-busy={isConceptReviewLoading}
                    className="study-v2-concept-review-body"
                  >
                    {isConceptReviewLoading ? (
                      <p className="study-v2-concept-review-status" role="status">
                        Loading Concept review…
                      </p>
                    ) : conceptReview ? (
                      <>
                        <h3>{conceptReview.name}</h3>

                        {!hasConceptReviewContent && (
                          <p className="study-v2-concept-review-empty">
                            No Concept review content is available yet.
                          </p>
                        )}

                        {conceptReview.summary?.trim() && (
                          <section>
                            <h4>Summary</h4>
                            <p>{conceptReview.summary}</p>
                          </section>
                        )}

                        {conceptReview.whyItMatters?.trim() && (
                          <section>
                            <h4>Why it matters</h4>
                            <p>{conceptReview.whyItMatters}</p>
                          </section>
                        )}

                        {conceptReview.bodyMarkdown.trim() && (
                          <section className="study-v2-concept-review-content">
                            <MarkdownContent markdown={conceptReview.bodyMarkdown} />
                          </section>
                        )}

                        {conceptReview.sources.length > 0 && (
                          <section className="study-v2-concept-review-sources">
                            <h4>Sources</h4>
                            {conceptReview.sources.map((source) => (
                              <div key={source.id}>
                                <strong>{source.title}</strong>
                                {(source.author || source.sourceType) && (
                                  <p>
                                    {[source.author, source.sourceType]
                                      .filter(Boolean)
                                      .join(' · ')}
                                  </p>
                                )}
                                {source.note && <p>{source.note}</p>}
                                {source.url && (
                                  <a
                                    href={source.url}
                                    rel="noreferrer"
                                    target="_blank"
                                  >
                                    Open source
                                  </a>
                                )}
                              </div>
                            ))}
                          </section>
                        )}
                      </>
                    ) : (
                      <div className="study-v2-concept-review-status" role="alert">
                        <p>{conceptReviewError}</p>
                        <button
                          type="button"
                          onClick={() => void loadStudyConceptReview({ retry: true })}
                        >
                          Try again
                        </button>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            )}

            {isFlagModalOpen && studyCandidate && (
              <div
                className="study-v2-modal-backdrop"
                role="presentation"
                onMouseDown={(event) => {
                  if (event.currentTarget === event.target && !isFlagSaving) {
                    setIsFlagModalOpen(false);
                  }
                }}
              >
                <section
                  aria-labelledby="study-flag-title"
                  aria-modal="true"
                  className="study-v2-modal study-v2-flag-modal"
                  role="dialog"
                >
                  <div className="study-v2-modal-header">
                    <div>
                      <p>Private reminder</p>
                      <h2 id="study-flag-title">
                        {candidateFlag ? 'Edit Flag' : 'Flag this Card'}
                      </h2>
                    </div>
                    <button
                      aria-label="Close Flag"
                      disabled={isFlagSaving}
                      type="button"
                      onClick={() => setIsFlagModalOpen(false)}
                    >
                      ×
                    </button>
                  </div>
                  <form className="study-v2-modal-form" onSubmit={saveCandidateFlag}>
                    <p className="study-v2-private-explainer">
                      Only you can see this flag. It does not affect scheduling,
                      mastery, or whether this Card appears in Study Mode.
                    </p>
                    <label>
                      Note <small>Optional</small>
                      <textarea
                        autoFocus
                        maxLength={4000}
                        placeholder="Why do you want to revisit this?"
                        value={flagNote}
                        onChange={(event) => {
                          setFlagNote(event.target.value);
                          setFlagError('');
                        }}
                      />
                    </label>
                    <div className="study-v2-modal-footer">
                      <p aria-live="polite" role="status">
                        {flagError}
                      </p>
                      {candidateFlag && (
                        <button
                          className="study-v2-modal-danger"
                          disabled={isFlagSaving}
                          type="button"
                          onClick={() => void removeCandidateFlag()}
                        >
                          Remove Flag
                        </button>
                      )}
                      <button
                        className="study-v2-modal-secondary"
                        disabled={isFlagSaving}
                        type="button"
                        onClick={() => setIsFlagModalOpen(false)}
                      >
                        Cancel
                      </button>
                      <button
                        className="study-v2-modal-primary"
                        disabled={isFlagSaving}
                        type="submit"
                      >
                        {isFlagSaving
                          ? 'Saving…'
                          : candidateFlag
                            ? 'Save Changes'
                            : 'Save Flag'}
                      </button>
                    </div>
                  </form>
                </section>
              </div>
            )}

            <p
              aria-live="polite"
              className="study-v2-action-status"
              role="status"
            >
              {studyActionStatus}
            </p>
          </section>
        </main>

        <StudyModeStyles />
      </>
    );
  }

  return (
    <>
      <LearnerHeader classPrefix="home-v2" brandHref="/" onHomeClick={handleHomeClick} items={items} />
      <main className={`home-v2-shell${mode === 'stats' ? ' home-v2-shell-stats' : ''}`}>
        {mode !== 'stats' && (
          <HomeRail
            items={homeRailItems.map((item): RailItem => item.href ? {
              kind: 'link', label: item.label, icon: item.icon, href: item.href,
              className: `home-v2-rail-card${item.label === 'Creator Studio' ? ' home-v2-rail-card-primary' : ''}`,
              onClick: item.href === '/creator' || item.href.startsWith('/creator/') ? handleCreatorClick : undefined,
            } : {
              kind: 'button', label: item.label, icon: item.icon, className: 'home-v2-rail-card',
              title: item.label === 'Account Settings' && email ? `Signed in as ${email}` : undefined,
              onClick: item.label === 'Stats' ? () => openStatsTab('progress') : undefined,
            })}
            onLogout={handleLogout}
          />
        )}

        <section className="home-v2-workspace">
          {mode === 'stats' ? (
            <PlannerStats
              activeTab={statsTab} onTabChange={openStatsTab}
              libraryName={activeLibrary.name} progress={learnerProgress} progressError={learnerProgressError}
              nodes={nodes} rootNodes={rootNodes} progressByNodeId={learnerProgressByNodeId}
              fallbackProgressMetric={emptyLearnerProgress.summary}
              expandedNodeIds={homeExpandedIds} onToggleNode={toggleHomeExpanded}
              showAlgorithmTab={canViewAlgorithmDiagnostics}
              // Preserve the existing diagnostics owner, request scope and conditional mounting.
              algorithmPanel={statsTab === 'algorithm' && canViewAlgorithmDiagnostics ? (
                <div className="home-v2-algorithm-workspace">
                  <CreatorAlgorithmDiagnostics
                    libraryId={activeLibrary.id}
                    requestScope={userId ?? 'signed-out'}
                  />
                </div>
              ) : null}
            />
          ) : (
            <>
              <div className="home-v2-topline">
                <h2>Welcome back, {displayName}!</h2>
              </div>

              <div className="home-v2-hero">
                <button
                  className="home-v2-study"
                  disabled={isSaving}
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
                  <div className="home-v2-setup-title-row">
                    <span className="home-v2-deck-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <path d="M12 3 3 7.5 12 12l9-4.5L12 3Z" />
                        <path d="m3 12 9 4.5 9-4.5" />
                        <path d="m3 16.5 9 4.5 9-4.5" />
                      </svg>
                    </span>

                    <div>
                      <h3 id="home-v2-setup-title">Deck settings</h3>
                      <p>
                        Choose eligible areas and balance new material with mastery review.
                      </p>
                    </div>
                  </div>

                  {renderLibrarySubjectSwitcher(activeLibrary.slug)}
                </div>

                <div
                  className="home-v2-setup-tree"
                  aria-label="Home deck settings Topic Tree"
                >
                  {homeGroups.map((node) => renderNode(node))}
                </div>

              </section>
            </>
          )}
        </section>
      </main>

    </>
  );
}
