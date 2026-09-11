import 'server-only';

import type { ActiveLibrary, ActiveLibraryRole } from '@/lib/library-context';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import type { ServerTimingRecorder } from '@/lib/request-performance';

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
  card_count: number;
};

type HomeStudyBootstrapResponse = {
  available_libraries: ActiveLibrary[];
  nodes: LibraryNode[];
  placements: Placement[];
  official_question_counts: Record<string, number>;
  selected_node_ids: string[];
  excluded_node_ids: string[];
  node_preferences: Record<string, number>;
  concept_overrides: Record<string, 'included' | 'excluded'>;
  resolved_concepts: StudyDeckConcept[];
  personal_topics: PersonalTopic[];
  personal_concepts: PersonalConcept[];
  personal_cards: PersonalCard[];
  selected_personal_topic_ids: string[];
  personal_collections: PersonalCollectionRow[];
  selected_personal_collection_ids: string[];
  learner_progress: LearnerProgressResponse;
};

type ExistingHomeStudyBootstrapResponse = {
  deck: StudyDeck | null;
  bootstrap: HomeStudyBootstrapResponse | null;
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

type LearnerProgressResponse = {
  library_id: string;
  summary: LearnerProgressMetric & {
    recent_session_count: number;
  };
  nodes: Array<
    LearnerProgressMetric & {
      library_node_id: string;
      name: string;
      parent_id: string | null;
      sort_order: number | null;
    }
  >;
  recent_sessions: Array<{
    id: string;
    study_deck_id: string | null;
    deck_name: string | null;
    started_at: string;
    ended_at: string | null;
    answered_count: number;
  }>;
};

export type StudyPlannerInitialData = {
  libraryId: string;
  availableLibraries: ActiveLibrary[];
  deck: StudyDeck | null;
  nodes: LibraryNode[];
  placements: Placement[];
  questionCounts: Record<string, number>;
  selectedNodeIds: string[];
  excludedNodeIds: string[];
  nodePreferences: Record<string, number>;
  conceptOverrides: Record<string, 'included' | 'excluded'>;
  resolvedConcepts: StudyDeckConcept[];
  personalTopics: PersonalTopic[];
  personalConcepts: PersonalConcept[];
  personalCards: PersonalCard[];
  selectedPersonalTopicIds: string[];
  personalCollections: PersonalCollection[];
  selectedPersonalCollectionIds: string[];
  learnerProgress: LearnerProgressResponse;
  learnerProgressError: string;
  loadError: string;
};

function emptyLearnerProgress(libraryId: string): LearnerProgressResponse {
  return {
    library_id: libraryId,
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
}

function emptyInitialData(
  activeLibrary: ActiveLibrary,
  availableLibraries: ActiveLibrary[] = [activeLibrary]
): StudyPlannerInitialData {
  return {
    libraryId: activeLibrary.id,
    availableLibraries,
    deck: null,
    nodes: [],
    placements: [],
    questionCounts: {},
    selectedNodeIds: [],
    excludedNodeIds: [],
    nodePreferences: {},
    conceptOverrides: {},
    resolvedConcepts: [],
    personalTopics: [],
    personalConcepts: [],
    personalCards: [],
    selectedPersonalTopicIds: [],
    personalCollections: [],
    selectedPersonalCollectionIds: [],
    learnerProgress: emptyLearnerProgress(activeLibrary.id),
    learnerProgressError: '',
    loadError: '',
  };
}

export async function loadStudyPlannerInitialData({
  activeLibrary,
  timing,
}: {
  activeLibrary: ActiveLibrary;
  role: ActiveLibraryRole;
  timing?: ServerTimingRecorder;
}): Promise<StudyPlannerInitialData> {
  const supabase = await createSupabaseServerClient();
  const loadExistingBootstrap = () =>
    supabase.rpc('get_existing_home_study_bootstrap', {
      p_library_id: activeLibrary.id,
    });
  const existingResult = timing
    ? await timing.measure('existing_deck_bootstrap', loadExistingBootstrap)
    : await loadExistingBootstrap();

  if (existingResult.error || !existingResult.data) {
    return {
      ...emptyInitialData(activeLibrary),
      loadError: `Unable to load your deck: ${
        existingResult.error?.message || 'No Home bootstrap result returned.'
      }`,
    };
  }

  const existing = existingResult.data as unknown as ExistingHomeStudyBootstrapResponse;
  let activeDeck = existing.deck;
  let bootstrap = existing.bootstrap;

  if (!activeDeck) {
    const createDeck = () =>
      supabase.rpc('get_or_create_active_study_deck', {
        p_library_id: activeLibrary.id,
      });
    const deckResult = timing
      ? await timing.measure('active_deck_create', createDeck)
      : await createDeck();

    if (deckResult.error || !deckResult.data) {
      return {
        ...emptyInitialData(activeLibrary),
        loadError: `Unable to load your deck: ${
          deckResult.error?.message || 'No active deck found.'
        }`,
      };
    }

    activeDeck = deckResult.data as StudyDeck;
    const loadBootstrap = () => supabase.rpc('get_home_study_bootstrap', {
      p_library_id: activeLibrary.id,
      p_deck_id: activeDeck?.id,
    });
    const bootstrapResult = timing
      ? await timing.measure('bootstrap_after_create', loadBootstrap)
      : await loadBootstrap();

    if (bootstrapResult.error || !bootstrapResult.data) {
      return {
        ...emptyInitialData(activeLibrary),
        deck: activeDeck,
        loadError: `Unable to load Home study data: ${
          bootstrapResult.error?.message || 'No bootstrap data returned.'
        }`,
      };
    }

    bootstrap = bootstrapResult.data as unknown as HomeStudyBootstrapResponse;
  }

  if (!bootstrap) {
    return {
      ...emptyInitialData(activeLibrary),
      deck: activeDeck,
      loadError: 'Unable to load Home study data: No bootstrap data returned.',
    };
  }
  const availableLibraries = bootstrap.available_libraries?.length
    ? bootstrap.available_libraries
    : [activeLibrary];

  return {
    libraryId: activeLibrary.id,
    availableLibraries,
    deck: activeDeck,
    nodes: bootstrap.nodes || [],
    placements: bootstrap.placements || [],
    questionCounts: bootstrap.official_question_counts || {},
    selectedNodeIds: bootstrap.selected_node_ids || [],
    excludedNodeIds: bootstrap.excluded_node_ids || [],
    nodePreferences: bootstrap.node_preferences || {},
    conceptOverrides: bootstrap.concept_overrides || {},
    resolvedConcepts: bootstrap.resolved_concepts || [],
    personalTopics: bootstrap.personal_topics || [],
    personalConcepts: bootstrap.personal_concepts || [],
    personalCards: bootstrap.personal_cards || [],
    selectedPersonalTopicIds: bootstrap.selected_personal_topic_ids || [],
    personalCollections: (bootstrap.personal_collections || []).map(
      (collection) => ({
        id: collection.id,
        name: collection.name,
        cardCount: Number(collection.card_count || 0),
      })
    ),
    selectedPersonalCollectionIds:
      bootstrap.selected_personal_collection_ids || [],
    learnerProgress:
      bootstrap.learner_progress || emptyLearnerProgress(activeLibrary.id),
    learnerProgressError: '',
    loadError: '',
  };
}
