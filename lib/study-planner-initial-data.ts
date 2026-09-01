import 'server-only';

import type { ActiveLibrary, ActiveLibraryRole } from '@/lib/library-context';
import { createSupabaseServerClient } from '@/lib/supabase-server';

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
  nodePreferences: Record<string, number>;
  conceptOverrides: Record<string, 'included' | 'excluded'>;
  resolvedConcepts: StudyDeckConcept[];
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
    nodePreferences: {},
    conceptOverrides: {},
    resolvedConcepts: [],
    learnerProgress: emptyLearnerProgress(activeLibrary.id),
    learnerProgressError: '',
    loadError: '',
  };
}

export async function loadStudyPlannerInitialData({
  activeLibrary,
  role,
}: {
  activeLibrary: ActiveLibrary;
  role: ActiveLibraryRole;
}): Promise<StudyPlannerInitialData> {
  const supabase = await createSupabaseServerClient();
  const availableLibrariesPromise =
    role === 'editor' || role === 'admin'
      ? supabase
          .from('libraries')
          .select('id, name, slug, description, status')
          .eq('status', 'active')
          .order('name')
      : Promise.resolve({ data: [activeLibrary], error: null });
  const [availableLibrariesResult, deckResult] = await Promise.all([
    availableLibrariesPromise,
    supabase.rpc('get_or_create_active_study_deck', {
      p_library_id: activeLibrary.id,
    }),
  ]);
  const availableLibraries = availableLibrariesResult.data?.length
    ? (availableLibrariesResult.data as ActiveLibrary[])
    : [activeLibrary];

  if (deckResult.error || !deckResult.data) {
    return {
      ...emptyInitialData(activeLibrary, availableLibraries),
      loadError: `Unable to load your deck: ${
        deckResult.error?.message || 'No active deck found.'
      }`,
    };
  }

  const activeDeck = deckResult.data as StudyDeck;
  const [
    nodeResult,
    selectedNodesResult,
    overridesResult,
    preferenceResult,
    resolvedResult,
    learnerProgressResult,
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
  ]);

  if (nodeResult.error) {
    return {
      ...emptyInitialData(activeLibrary, availableLibraries),
      deck: activeDeck,
      loadError: `Unable to load topics: ${nodeResult.error.message}`,
    };
  }

  if (preferenceResult.error) {
    return {
      ...emptyInitialData(activeLibrary, availableLibraries),
      deck: activeDeck,
      loadError: `Unable to load deck preferences: ${preferenceResult.error.message}`,
    };
  }

  const nodes = (nodeResult.data || []) as LibraryNode[];
  const nodeIds = nodes.map((node) => node.id);
  const placementResult = nodeIds.length
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

  if (placementResult.error) {
    return {
      ...emptyInitialData(activeLibrary, availableLibraries),
      deck: activeDeck,
      nodes,
      loadError: `Unable to load deck concepts: ${placementResult.error.message}`,
    };
  }

  const placements = (placementResult.data || []) as unknown as Placement[];
  const conceptIds = [
    ...new Set(placements.map((placement) => placement.concept_id)),
  ];
  const questionResult = conceptIds.length
    ? await supabase
        .from('questions')
        .select('concept_id')
        .eq('status', 'published')
        .in('concept_id', conceptIds)
    : { data: [], error: null };
  const questionCounts: Record<string, number> = {};

  (questionResult.data || []).forEach((question) => {
    if (!question.concept_id) return;
    questionCounts[question.concept_id] =
      (questionCounts[question.concept_id] || 0) + 1;
  });

  return {
    libraryId: activeLibrary.id,
    availableLibraries,
    deck: activeDeck,
    nodes,
    placements,
    questionCounts,
    selectedNodeIds: (selectedNodesResult.data || []).map(
      (selection) => selection.node_id
    ),
    nodePreferences: Object.fromEntries(
      (preferenceResult.data || []).map((preference) => [
        preference.library_node_id,
        Number(preference.new_mastery_balance),
      ])
    ),
    conceptOverrides: Object.fromEntries(
      (overridesResult.data || []).map((override) => [
        override.concept_id,
        override.selection_state as 'included' | 'excluded',
      ])
    ),
    resolvedConcepts: (resolvedResult.data || []) as StudyDeckConcept[],
    learnerProgress:
      learnerProgressResult.error || !learnerProgressResult.data
        ? emptyLearnerProgress(activeLibrary.id)
        : (learnerProgressResult.data as unknown as LearnerProgressResponse),
    learnerProgressError: learnerProgressResult.error
      ? `Progress could not be loaded: ${learnerProgressResult.error.message}`
      : '',
    loadError: '',
  };
}
