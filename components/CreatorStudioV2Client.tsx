'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Folder,
  Info,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { Header } from '@/components/Header';
import {
  buildConceptTopicTree,
  type ConceptTopic as Topic,
} from '@/lib/concept-topic-tree';
import { MarkdownContent } from '@/components/MarkdownContent';
import { supabase } from '@/lib/supabase';
import { navigateBackOrFallback } from '@/lib/safe-navigation';
import {
  broadcastTagCatalogUsageInvalidation,
  TAG_CATALOG_USAGE_INVALIDATION_KEY,
} from '@/lib/tag-catalog-invalidation';
import styles from './CreatorStudioV2Client.module.css';

type Reference = {
  id: string;
  sourceId: string | null;
  attributionId: string | null;
  title: string;
  author: string;
  url: string;
  notes: string;
};

type ReferenceDraft = Pick<Reference, 'title' | 'author' | 'url' | 'notes'>;
type ConceptTag = {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'archived';
};
type CatalogTag = ConceptTag & {
  conceptUsage: number;
  questionUsage: number;
  articleUsage: number;
};
type QuestionConceptOption = {
  id: string;
  name: string;
};
type LifecycleStatus = 'draft' | 'published' | 'archived';
type ExistingQuestion = {
  id: string;
  prompt: string;
  answer: string;
  difficulty: QuestionDifficulty;
  testingAngle: string;
  status: LifecycleStatus;
  tags: ConceptTag[];
};

type CreatorTab = 'content' | 'questions' | 'tags';
type EditorMode = 'write' | 'preview';
type QuestionDifficulty = 'easy' | 'medium' | 'hard';
type MarkdownFormat =
  | 'bold'
  | 'italic'
  | 'heading'
  | 'bulleted-list'
  | 'numbered-list'
  | 'link'
  | 'quote';
type DialogMode = 'add' | 'rename' | 'move' | null;
type StatusTone = 'error' | 'success' | 'info';
type Status = { tone: StatusTone; message: string } | null;
type InitialConcept = {
  id: string | null;
  name: string;
  bodyMarkdown: string;
  placementIds: string[];
};

type CreatorStudioV2ClientProps = {
  activeLibraryId?: string | null;
  initialTopics?: Topic[];
  initialConcept?: InitialConcept;
  initialReferences?: Reference[];
};

const ROOT_TOPIC_ID = 'nursing';
const emptyReferenceDraft: ReferenceDraft = {
  title: '',
  author: '',
  url: '',
  notes: '',
};
const testingAngleOptions = [
  'General Understanding',
  'Recognition / Definition',
  'Mechanism / Pathophysiology',
  'Clinical Manifestations',
  'Assessment / Interpretation',
  'Clinical Application',
  'Intervention / Management',
  'Complications / Outcomes',
  'Differentiation / Comparison',
];

const prototypeTopics: Topic[] = [
  {
    id: ROOT_TOPIC_ID,
    name: 'Nursing',
    children: [
      { id: 'fundamentals', name: 'Fundamentals', children: [] },
      {
        id: 'adult-health',
        name: 'Adult Health',
        children: [
          {
            id: 'cardiovascular',
            name: 'Cardiovascular',
            children: [
              { id: 'heart-failure', name: 'Heart Failure', children: [] },
              {
                id: 'fluids-electrolytes',
                name: 'Fluids & Electrolytes',
                children: [
                  { id: 'fluid-overload', name: 'Fluid Overload', children: [] },
                ],
              },
              { id: 'respiratory', name: 'Respiratory', children: [] },
            ],
          },
          { id: 'endocrine', name: 'Endocrine', children: [] },
        ],
      },
      { id: 'pediatrics', name: 'Pediatrics', children: [] },
      { id: 'mental-health', name: 'Mental Health', children: [] },
    ],
  },
];

function findTopic(topics: Topic[], topicId: string): Topic | null {
  for (const topic of topics) {
    if (topic.id === topicId) return topic;
    const nested = findTopic(topic.children, topicId);
    if (nested) return nested;
  }
  return null;
}

function findTopicPath(
  topics: Topic[],
  topicId: string,
  ancestors: Topic[] = []
): Topic[] | null {
  for (const topic of topics) {
    const nextPath = [...ancestors, topic];
    if (topic.id === topicId) return nextPath;
    const nested = findTopicPath(topic.children, topicId, nextPath);
    if (nested) return nested;
  }
  return null;
}

function updateTopic(
  topics: Topic[],
  topicId: string,
  updater: (topic: Topic) => Topic
): Topic[] {
  return topics.map((topic) => {
    if (topic.id === topicId) return updater(topic);
    return {
      ...topic,
      children: updateTopic(topic.children, topicId, updater),
    };
  });
}

function removeTopic(topics: Topic[], topicId: string): Topic[] {
  return topics
    .filter((topic) => topic.id !== topicId)
    .map((topic) => ({
      ...topic,
      children: removeTopic(topic.children, topicId),
    }));
}

function descendantIds(topic: Topic): Set<string> {
  const ids = new Set<string>();
  const visit = (current: Topic) => {
    current.children.forEach((child) => {
      ids.add(child.id);
      visit(child);
    });
  };
  visit(topic);
  return ids;
}

function collectSearchIds(
  topics: Topic[],
  query: string,
  ancestors: string[] = []
): Set<string> {
  const visible = new Set<string>();
  topics.forEach((topic) => {
    const nextAncestors = [...ancestors, topic.id];
    if (topic.name.toLocaleLowerCase().includes(query)) {
      nextAncestors.forEach((id) => visible.add(id));
    }
    const childMatches = collectSearchIds(topic.children, query, nextAncestors);
    childMatches.forEach((id) => visible.add(id));
  });
  return visible;
}

function flattenTopics(
  topics: Topic[],
  prefix: string[] = []
): Array<{ id: string; label: string }> {
  return topics.flatMap((topic) => {
    const path = [...prefix, topic.name];
    return [
      { id: topic.id, label: path.join(' > ') },
      ...flattenTopics(topic.children, path),
    ];
  });
}

function wordCount(value: string): number {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function questionCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'question' : 'questions'}`;
}

function normalizeTagName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function tagIdentity(value: string): string {
  return normalizeTagName(value).toLocaleLowerCase();
}

function initialExpandedTopicIds(topics: Topic[], selectedIds: string[]) {
  const expandedIds = new Set<string>();
  const rootId = topics[0]?.id;
  if (rootId) expandedIds.add(rootId);

  selectedIds.forEach((id) => {
    findTopicPath(topics, id)?.forEach((topic) => expandedIds.add(topic.id));
  });

  return expandedIds;
}

function conceptNameFromMarkdown(markdown: string) {
  const firstLine = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || '';
  const cleaned = firstLine
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[-*+]\s+/, '')
    .trim();

  return (cleaned || firstLine).slice(0, 160);
}

function draftFingerprint(
  bodyMarkdown: string,
  placementIds: Iterable<string>,
  references: Reference[],
  tagIds: Iterable<string>,
  recordStatus: LifecycleStatus
) {
  return JSON.stringify({
    bodyMarkdown,
    placementIds: Array.from(placementIds).sort(),
    references: references
      .map((reference) => ({
        identity: reference.sourceId
          ? `source:${reference.sourceId}`
          : `draft:${reference.id}`,
        title: reference.title,
        author: reference.author,
        url: reference.url,
        notes: reference.notes,
      }))
      .sort((left, right) => left.identity.localeCompare(right.identity)),
    tagIds: Array.from(tagIds).sort(),
    recordStatus,
  });
}

function questionDraftFingerprint({
  questionId,
  conceptId,
  prompt,
  answer,
  difficulty,
  testingAngle,
  recordStatus,
  tagIds,
}: {
  questionId: string | null;
  conceptId: string | null;
  prompt: string;
  answer: string;
  difficulty: QuestionDifficulty;
  testingAngle: string;
  recordStatus: LifecycleStatus;
  tagIds: Iterable<string>;
}) {
  return JSON.stringify({
    questionId,
    conceptId,
    prompt,
    answer,
    difficulty,
    testingAngle,
    recordStatus,
    tagIds: Array.from(tagIds).sort(),
  });
}

export function CreatorStudioV2Client({
  activeLibraryId = null,
  initialTopics,
  initialConcept,
  initialReferences = [],
}: CreatorStudioV2ClientProps = {}) {
  const router = useRouter();
  const conceptEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const resolvedTopics = initialTopics || prototypeTopics;
  const resolvedConcept = initialConcept || {
    id: null,
    name: '',
    bodyMarkdown: '',
    placementIds: ['fluids-electrolytes', 'fluid-overload'],
  };
  const [conceptId, setConceptId] = useState<string | null>(resolvedConcept.id);
  const [conceptName, setConceptName] = useState(resolvedConcept.name);
  const [concept, setConcept] = useState(resolvedConcept.bodyMarkdown);
  const [conceptRecordStatus, setConceptRecordStatus] =
    useState<LifecycleStatus>('draft');
  const [topics, setTopics] = useState<Topic[]>(resolvedTopics);
  const [activeTopicId, setActiveTopicId] = useState(
    resolvedConcept.placementIds[0] || resolvedTopics[0]?.id || ''
  );
  const [selectedTopicIds, setSelectedTopicIds] = useState<Set<string>>(
    new Set(resolvedConcept.placementIds)
  );
  const [expandedTopicIds, setExpandedTopicIds] = useState<Set<string>>(() =>
    initialTopics
      ? initialExpandedTopicIds(resolvedTopics, resolvedConcept.placementIds)
      : new Set([
          ROOT_TOPIC_ID,
          'adult-health',
          'cardiovascular',
          'fluids-electrolytes',
        ])
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [contentConceptSearch, setContentConceptSearch] = useState('');
  const [activeCreatorTab, setActiveCreatorTab] = useState<CreatorTab>('content');
  const [editorMode, setEditorMode] = useState<EditorMode>('write');
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [moveDestinationId, setMoveDestinationId] = useState('');
  const [status, setStatus] = useState<Status>(null);
  const [references, setReferences] = useState<Reference[]>(initialReferences);
  const [conceptTags, setConceptTags] = useState<ConceptTag[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [tagStatus, setTagStatus] = useState<Status>(null);
  const [availableTags, setAvailableTags] = useState<CatalogTag[]>([]);
  const [tagCatalogSearch, setTagCatalogSearch] = useState('');
  const [newCatalogTagName, setNewCatalogTagName] = useState('');
  const [tagCatalogStatus, setTagCatalogStatus] = useState<Status>(null);
  const [isMutatingTagCatalog, setIsMutatingTagCatalog] = useState(false);
  const [questionId, setQuestionId] = useState<string | null>(null);
  const [questionConceptId, setQuestionConceptId] = useState<string | null>(
    resolvedConcept.id
  );
  const [questionTopicId, setQuestionTopicId] = useState(activeTopicId);
  const [questionConceptOptions, setQuestionConceptOptions] = useState<
    QuestionConceptOption[]
  >([]);
  const [questionConceptsByTopicId, setQuestionConceptsByTopicId] = useState<
    Record<string, QuestionConceptOption[]>
  >({});
  const [questionCountsByConceptId, setQuestionCountsByConceptId] = useState<
    Record<string, number>
  >({});
  const [questionConceptSearch, setQuestionConceptSearch] = useState('');
  const [needsQuestionsOnly, setNeedsQuestionsOnly] = useState(false);
  const [questionPrompt, setQuestionPrompt] = useState('');
  const [questionAnswer, setQuestionAnswer] = useState('');
  const [questionDifficulty, setQuestionDifficulty] =
    useState<QuestionDifficulty>('medium');
  const [questionTestingAngle, setQuestionTestingAngle] = useState(
    'General Understanding'
  );
  const [questionRecordStatus, setQuestionRecordStatus] =
    useState<LifecycleStatus>('draft');
  const [questionTags, setQuestionTags] = useState<ConceptTag[]>([]);
  const [questionTagDraft, setQuestionTagDraft] = useState('');
  const [questionTagStatus, setQuestionTagStatus] = useState<Status>(null);
  const [existingQuestions, setExistingQuestions] = useState<
    ExistingQuestion[]
  >([]);
  const [isLoadingExistingQuestions, setIsLoadingExistingQuestions] =
    useState(false);
  const [questionStatus, setQuestionStatus] = useState<Status>(null);
  const [isSavingQuestion, setIsSavingQuestion] = useState(false);
  const [referenceDraft, setReferenceDraft] = useState<ReferenceDraft>(
    emptyReferenceDraft
  );
  const [editingReferenceId, setEditingReferenceId] = useState<string | null>(null);
  const [pendingRemovalId, setPendingRemovalId] = useState<string | null>(null);
  const [referenceStatus, setReferenceStatus] = useState<Status>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isMutatingTopic, setIsMutatingTopic] = useState(false);
  const [savedDraftFingerprint, setSavedDraftFingerprint] = useState(() =>
    draftFingerprint(
      resolvedConcept.bodyMarkdown,
      resolvedConcept.placementIds,
      initialReferences,
      [],
      'draft'
    )
  );
  const editingReference = editingReferenceId
    ? references.find((reference) => reference.id === editingReferenceId) || null
    : null;
  const isEditingPersistedReference = Boolean(editingReference?.sourceId);
  const currentDraftFingerprint = useMemo(
    () =>
      draftFingerprint(
        concept,
        selectedTopicIds,
        references,
        conceptTags.map((tag) => tag.id),
        conceptRecordStatus
      ),
    [concept, conceptRecordStatus, conceptTags, references, selectedTopicIds]
  );
  const currentQuestionFingerprint = useMemo(
    () =>
      questionDraftFingerprint({
        questionId,
        conceptId: questionConceptId,
        prompt: questionPrompt,
        answer: questionAnswer,
        difficulty: questionDifficulty,
        testingAngle: questionTestingAngle,
        recordStatus: questionRecordStatus,
        tagIds: questionTags.map((tag) => tag.id),
      }),
    [
      questionAnswer,
      questionConceptId,
      questionDifficulty,
      questionId,
      questionPrompt,
      questionRecordStatus,
      questionTags,
      questionTestingAngle,
    ]
  );
  const [savedQuestionFingerprint, setSavedQuestionFingerprint] = useState(
    currentQuestionFingerprint
  );
  const hasPendingReferenceDraft = useMemo(() => {
    if (editingReference) {
      return (
        referenceDraft.title !== editingReference.title ||
        referenceDraft.author !== editingReference.author ||
        referenceDraft.url !== editingReference.url ||
        referenceDraft.notes !== editingReference.notes
      );
    }

    return Object.values(referenceDraft).some((value) => value.trim());
  }, [editingReference, referenceDraft]);
  const hasQuestionDraft = Boolean(
    questionId ||
      questionPrompt.trim() ||
      questionAnswer.trim() ||
      questionDifficulty !== 'medium' ||
      questionTestingAngle.trim() !== 'General Understanding' ||
      questionTags.length
  );
  const isQuestionDirty =
    hasQuestionDraft && currentQuestionFingerprint !== savedQuestionFingerprint;
  const isContentDirty =
    currentDraftFingerprint !== savedDraftFingerprint || hasPendingReferenceDraft;
  const isDirty =
    isContentDirty || isQuestionDirty;

  useEffect(() => {
    if (!isDirty) return;

    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }

    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [isDirty]);

  async function loadTagCatalog() {
    const [tagResult, conceptUsageResult, questionUsageResult, articleUsageResult] =
      await Promise.all([
        supabase
          .from('tags')
          .select('id, name, slug, status')
          .order('name'),
        supabase.from('concept_tags').select('tag_id'),
        supabase.from('question_tags').select('tag_id'),
        supabase.from('article_tags').select('tag_id'),
      ]);

    if (tagResult.error) {
      setTagCatalogStatus({
        tone: 'error',
        message: 'Tags could not be loaded.',
      });
      return;
    }

    function usageCounts(rows: Array<{ tag_id: string | null }> | null) {
      return (rows || []).reduce<Record<string, number>>((counts, row) => {
        if (row.tag_id) counts[row.tag_id] = (counts[row.tag_id] || 0) + 1;
        return counts;
      }, {});
    }

    const conceptUsage = usageCounts(conceptUsageResult.data);
    const questionUsage = usageCounts(questionUsageResult.data);
    const articleUsage = usageCounts(articleUsageResult.data);
    const catalog = (tagResult.data || []).map((tag) => ({
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
      status: tag.status === 'archived' ? 'archived' : 'active',
      conceptUsage: conceptUsage[tag.id] || 0,
      questionUsage: questionUsage[tag.id] || 0,
      articleUsage: articleUsage[tag.id] || 0,
    })) satisfies CatalogTag[];
    const catalogById = new Map(catalog.map((tag) => [tag.id, tag]));

    setAvailableTags(catalog);
    setConceptTags((current) =>
      current.map((tag) => catalogById.get(tag.id) || tag)
    );
    setQuestionTags((current) =>
      current.map((tag) => catalogById.get(tag.id) || tag)
    );
    setExistingQuestions((current) =>
      current.map((question) => ({
        ...question,
        tags: question.tags.map((tag) => catalogById.get(tag.id) || tag),
      }))
    );
  }

  useEffect(() => {
    void loadTagCatalog();
  }, []);

  useEffect(() => {
    function refreshTagCatalogUsage(event: StorageEvent) {
      if (event.key === TAG_CATALOG_USAGE_INVALIDATION_KEY) {
        void loadTagCatalog();
      }
    }

    window.addEventListener('storage', refreshTagCatalogUsage);
    return () => window.removeEventListener('storage', refreshTagCatalogUsage);
  }, []);

  useEffect(() => {
    if (
      !resolvedConcept.id ||
      !activeLibraryId ||
      conceptId !== resolvedConcept.id
    ) {
      return;
    }

    let isMounted = true;

    async function loadConceptMetadata() {
      const [tagResult, statusResult] = await Promise.all([
        supabase.rpc('get_concept_tags', {
          p_concept_id: resolvedConcept.id,
        }),
        supabase
          .from('concepts')
          .select('status')
          .eq('id', resolvedConcept.id)
          .single(),
      ]);

      if (!isMounted) return;

      if (tagResult.error) {
        setTagStatus({
          tone: 'error',
          message: 'Tags could not be loaded for this concept.',
        });
        return;
      }

      if (statusResult.error || !statusResult.data) {
        setStatus({
          tone: 'error',
          message: 'Concept status could not be loaded.',
        });
        return;
      }

      const loadedStatus: LifecycleStatus =
        statusResult.data.status === 'published' ||
        statusResult.data.status === 'archived'
          ? statusResult.data.status
          : 'draft';

      const loadedTags: ConceptTag[] = ((tagResult.data || []) as ConceptTag[]).map((tag) => ({
        id: tag.id,
        name: tag.name,
        slug: tag.slug,
        status: tag.status === 'archived' ? ('archived' as const) : ('active' as const),
      }));

      setConceptRecordStatus(loadedStatus);
      setConceptTags(loadedTags);
      setSavedDraftFingerprint(
        draftFingerprint(
          resolvedConcept.bodyMarkdown,
          resolvedConcept.placementIds,
          initialReferences,
          loadedTags.map((tag) => tag.id),
          loadedStatus
        )
      );
    }

    void loadConceptMetadata();

    return () => {
      isMounted = false;
    };
  }, [
    activeLibraryId,
    conceptId,
    initialReferences,
    resolvedConcept.bodyMarkdown,
    resolvedConcept.id,
    resolvedConcept.placementIds,
  ]);

  useEffect(() => {
    if (!activeLibraryId || !questionTopicId) {
      setQuestionConceptOptions([]);
      return;
    }

    let isMounted = true;

    async function loadQuestionConcepts() {
      const { data, error } = await supabase
        .from('concept_placements')
        .select('concept_id, concepts!inner(id, name)')
        .eq('library_node_id', questionTopicId);

      if (!isMounted) return;

      if (error) {
        setQuestionConceptOptions([]);
        setQuestionStatus({
          tone: 'error',
          message: 'Concepts could not be loaded for this topic.',
        });
        return;
      }

      const options = (data || [])
        .map((placement) => {
          const related = placement.concepts as unknown as
            | { id: string; name: string }
            | { id: string; name: string }[]
            | null;
          const relatedConcept = Array.isArray(related) ? related[0] : related;
          return relatedConcept
            ? { id: relatedConcept.id, name: relatedConcept.name }
            : null;
        })
        .filter(
          (option): option is QuestionConceptOption => option !== null
        )
        .filter(
          (option, index, all) =>
            all.findIndex((candidate) => candidate.id === option.id) === index
        )
        .sort((left, right) => left.name.localeCompare(right.name));

      setQuestionConceptOptions(options);
      setQuestionConceptId((current) => {
        if (current && options.some((option) => option.id === current)) return current;
        if (resolvedConcept.id && options.some((option) => option.id === resolvedConcept.id)) {
          return resolvedConcept.id;
        }
        return options.length === 1 ? options[0].id : null;
      });
      setQuestionStatus(null);
    }

    void loadQuestionConcepts();

    return () => {
      isMounted = false;
    };
  }, [activeLibraryId, questionTopicId, resolvedConcept.id]);

  useEffect(() => {
    if (!activeLibraryId) {
      setQuestionConceptsByTopicId({});
      return;
    }

    const topicIds = flattenTopics(topics).map((topic) => topic.id);
    if (!topicIds.length) {
      setQuestionConceptsByTopicId({});
      return;
    }

    let isMounted = true;

    async function loadQuestionConceptPlacements() {
      const { data, error } = await supabase
        .from('concept_placements')
        .select('library_node_id, concept_id, concepts!inner(id, name)')
        .in('library_node_id', topicIds);

      if (!isMounted) return;

      if (error) {
        setQuestionConceptsByTopicId({});
        return;
      }

      const conceptsByTopicId: Record<string, QuestionConceptOption[]> = {};

      (data || []).forEach((placement) => {
        const topicId = placement.library_node_id;
        const related = placement.concepts as unknown as
          | { id: string; name: string }
          | { id: string; name: string }[]
          | null;
        const relatedConcept = Array.isArray(related) ? related[0] : related;
        if (!topicId || !relatedConcept) return;

        const topicConcepts = conceptsByTopicId[topicId] || [];
        if (!topicConcepts.some((concept) => concept.id === relatedConcept.id)) {
          topicConcepts.push({
            id: relatedConcept.id,
            name: relatedConcept.name,
          });
        }
        conceptsByTopicId[topicId] = topicConcepts;
      });

      Object.values(conceptsByTopicId).forEach((concepts) =>
        concepts.sort((left, right) => left.name.localeCompare(right.name))
      );
      setQuestionConceptsByTopicId(conceptsByTopicId);
    }

    void loadQuestionConceptPlacements();

    return () => {
      isMounted = false;
    };
  }, [activeLibraryId, topics]);

  useEffect(() => {
    const conceptIds = Array.from(
      new Set(
        Object.values(questionConceptsByTopicId)
          .flat()
          .map((conceptOption) => conceptOption.id)
      )
    );

    if (!activeLibraryId || !conceptIds.length) {
      setQuestionCountsByConceptId({});
      return;
    }

    let isMounted = true;

    async function loadQuestionCounts() {
      const { data, error } = await supabase
        .from('questions')
        .select('concept_id')
        .in('concept_id', conceptIds);

      if (!isMounted || error) return;

      const counts = Object.fromEntries(
        conceptIds.map((conceptId) => [conceptId, 0])
      ) as Record<string, number>;

      (data || []).forEach((question) => {
        if (question.concept_id && question.concept_id in counts) {
          counts[question.concept_id] += 1;
        }
      });

      setQuestionCountsByConceptId(counts);
    }

    void loadQuestionCounts();

    return () => {
      isMounted = false;
    };
  }, [activeLibraryId, questionConceptsByTopicId]);

  const previousQuestionConceptIdRef = useRef(questionConceptId);
  useEffect(() => {
    if (previousQuestionConceptIdRef.current === questionConceptId) return;

    previousQuestionConceptIdRef.current = questionConceptId;
    setQuestionId(null);
    setQuestionPrompt('');
    setQuestionAnswer('');
    setQuestionDifficulty('medium');
    setQuestionTestingAngle('General Understanding');
    setQuestionRecordStatus('draft');
    setSavedQuestionFingerprint(
      questionDraftFingerprint({
        questionId: null,
        conceptId: questionConceptId,
        prompt: '',
        answer: '',
        difficulty: 'medium',
        testingAngle: 'General Understanding',
        recordStatus: 'draft',
        tagIds: [],
      })
    );
    setQuestionTags([]);
    setQuestionTagDraft('');
    setQuestionTagStatus(null);
  }, [questionConceptId]);

  const rootTopicId = topics[0]?.id || ROOT_TOPIC_ID;
  const activeTopic = activeTopicId
    ? findTopic(topics, activeTopicId)
    : null;
  const normalizedContentConceptSearch = contentConceptSearch
    .trim()
    .toLocaleLowerCase();
  const contentConceptSearchResults = useMemo(() => {
    if (!normalizedContentConceptSearch) return [];

    const conceptsById = new Map<
      string,
      { id: string; name: string; paths: string[] }
    >();

    Object.entries(questionConceptsByTopicId).forEach(
      ([topicId, conceptOptions]) => {
        const path = findTopicPath(topics, topicId) || [];
        const displayPath = path.length > 1 ? path.slice(1) : path;
        const pathLabel = displayPath.map((topic) => topic.name).join(' > ');

        conceptOptions.forEach((conceptOption) => {
          const existing = conceptsById.get(conceptOption.id) || {
            id: conceptOption.id,
            name: conceptOption.name,
            paths: [],
          };

          if (pathLabel && !existing.paths.includes(pathLabel)) {
            existing.paths.push(pathLabel);
          }
          conceptsById.set(conceptOption.id, existing);
        });
      }
    );

    return Array.from(conceptsById.values())
      .filter((conceptOption) =>
        conceptOption.name
          .toLocaleLowerCase()
          .includes(normalizedContentConceptSearch)
      )
      .sort((left, right) => left.name.localeCompare(right.name))
      .slice(0, 20);
  }, [normalizedContentConceptSearch, questionConceptsByTopicId, topics]);
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  const normalizedQuestionConceptSearch = questionConceptSearch
    .trim()
    .toLocaleLowerCase();
  const questionConceptSearchResults = useMemo(
    () =>
      normalizedQuestionConceptSearch
        ? questionConceptOptions
            .filter((option) =>
              option.name
                .toLocaleLowerCase()
                .includes(normalizedQuestionConceptSearch)
            )
            .filter(
              (option) =>
                !needsQuestionsOnly ||
                (questionCountsByConceptId[option.id] || 0) === 0
            )
        : [],
    [
      needsQuestionsOnly,
      normalizedQuestionConceptSearch,
      questionConceptOptions,
      questionCountsByConceptId,
    ]
  );
  const questionConceptSearchPath = useMemo(() => {
    const path = findTopicPath(topics, questionTopicId) || [];
    const displayPath = path.length > 1 ? path.slice(1) : path;
    return displayPath.map((topic) => topic.name).join(' > ');
  }, [questionTopicId, topics]);
  const questionConceptBranchTopicIds = useMemo(() => {
    const topicIdsWithConcepts = new Set<string>();

    function collectConceptBranches(topic: Topic): boolean {
      const hasDirectConcepts =
        (questionConceptsByTopicId[topic.id] || []).length > 0;
      let hasConceptsBelow = false;

      topic.children.forEach((child) => {
        if (collectConceptBranches(child)) hasConceptsBelow = true;
      });

      if (hasDirectConcepts || hasConceptsBelow) {
        topicIdsWithConcepts.add(topic.id);
      }
      return hasDirectConcepts || hasConceptsBelow;
    }

    topics.forEach((topic) => collectConceptBranches(topic));
    return topicIdsWithConcepts;
  }, [questionConceptsByTopicId, topics]);
  const needsQuestionTopicIds = useMemo(() => {
    const visibleTopicIds = new Set<string>();

    function collectVisibleTopics(topic: Topic): boolean {
      const hasDirectMatch = (questionConceptsByTopicId[topic.id] || []).some(
        (conceptOption) =>
          (questionCountsByConceptId[conceptOption.id] || 0) === 0
      );
      let hasChildMatch = false;

      topic.children.forEach((child) => {
        if (collectVisibleTopics(child)) hasChildMatch = true;
      });

      if (hasDirectMatch || hasChildMatch) visibleTopicIds.add(topic.id);
      return hasDirectMatch || hasChildMatch;
    }

    topics.forEach((topic) => collectVisibleTopics(topic));
    return visibleTopicIds;
  }, [questionConceptsByTopicId, questionCountsByConceptId, topics]);
  const searchIds = useMemo(
    () =>
      normalizedSearch
        ? collectSearchIds(topics, normalizedSearch)
        : new Set<string>(),
    [normalizedSearch, topics]
  );
  const selectedPaths = useMemo(
    () =>
      Array.from(selectedTopicIds)
        .map((id) => ({ id, path: findTopicPath(topics, id) }))
        .filter(
          (item): item is { id: string; path: Topic[] } => item.path !== null
        ),
    [selectedTopicIds, topics]
  );
  const moveDestinations = useMemo(() => {
    if (!activeTopic) return [];
    const blocked = descendantIds(activeTopic);
    blocked.add(activeTopic.id);
    return flattenTopics(topics).filter((topic) => !blocked.has(topic.id));
  }, [activeTopic, topics]);
  const activeCatalogTags = useMemo(
    () => availableTags.filter((tag) => tag.status === 'active'),
    [availableTags]
  );
  const filteredCatalogTags = useMemo(() => {
    const query = tagCatalogSearch.trim().toLocaleLowerCase();
    if (!query) return availableTags;
    return availableTags.filter(
      (tag) =>
        tag.name.toLocaleLowerCase().includes(query) ||
        tag.slug.toLocaleLowerCase().includes(query)
    );
  }, [availableTags, tagCatalogSearch]);

  function showStatus(tone: StatusTone, message: string) {
    if (activeCreatorTab === 'questions') {
      setQuestionStatus({ tone, message });
      return;
    }
    setStatus({ tone, message });
  }

  async function createCatalogTag() {
    const name = normalizeTagName(newCatalogTagName);
    if (!name || isMutatingTagCatalog) return;

    setIsMutatingTagCatalog(true);
    setTagCatalogStatus(null);
    const { error } = await supabase.rpc('create_catalog_tag', { p_name: name });
    if (error) {
      setTagCatalogStatus({
        tone: 'error',
        message: error.message || 'Tag could not be created.',
      });
      setIsMutatingTagCatalog(false);
      return;
    }

    setNewCatalogTagName('');
    await loadTagCatalog();
    setIsMutatingTagCatalog(false);
    setTagCatalogStatus({ tone: 'success', message: 'Tag created.' });
  }

  async function renameCatalogTag(tag: CatalogTag) {
    if (isMutatingTagCatalog) return;
    const proposedName = window.prompt('Rename tag', tag.name);
    if (proposedName === null) return;
    const name = normalizeTagName(proposedName);
    if (!name || name === tag.name) return;

    setIsMutatingTagCatalog(true);
    setTagCatalogStatus(null);
    const { error } = await supabase.rpc('rename_catalog_tag', {
      p_tag_id: tag.id,
      p_name: name,
    });
    if (error) {
      setTagCatalogStatus({
        tone: 'error',
        message: error.message || 'Tag could not be renamed.',
      });
      setIsMutatingTagCatalog(false);
      return;
    }

    await loadTagCatalog();
    setIsMutatingTagCatalog(false);
    setTagCatalogStatus({ tone: 'success', message: 'Tag renamed.' });
  }

  async function setCatalogTagStatus(
    tag: CatalogTag,
    nextStatus: 'active' | 'archived'
  ) {
    if (isMutatingTagCatalog) return;
    if (
      nextStatus === 'archived' &&
      !window.confirm(
        `Archive “${tag.name}”? Existing assignments will be preserved.`
      )
    ) {
      return;
    }

    setIsMutatingTagCatalog(true);
    setTagCatalogStatus(null);
    const rpcName =
      nextStatus === 'archived'
        ? 'archive_catalog_tag'
        : 'reactivate_catalog_tag';
    const { error } = await supabase.rpc(rpcName, { p_tag_id: tag.id });
    if (error) {
      setTagCatalogStatus({
        tone: 'error',
        message: error.message || 'Tag status could not be changed.',
      });
      setIsMutatingTagCatalog(false);
      return;
    }

    await loadTagCatalog();
    setIsMutatingTagCatalog(false);
    setTagCatalogStatus({
      tone: 'success',
      message: nextStatus === 'archived' ? 'Tag archived.' : 'Tag reactivated.',
    });
  }

  async function deleteCatalogTag(tag: CatalogTag) {
    if (isMutatingTagCatalog) return;
    if (
      !window.confirm(
        `Permanently delete “${tag.name}”? This cannot be undone.`
      )
    ) {
      return;
    }

    setIsMutatingTagCatalog(true);
    setTagCatalogStatus(null);
    const { error } = await supabase.rpc('delete_empty_tag', {
      p_tag_id: tag.id,
    });
    if (error) {
      setTagCatalogStatus({
        tone: 'error',
        message: error.message || 'Tag could not be deleted.',
      });
      setIsMutatingTagCatalog(false);
      return;
    }

    await loadTagCatalog();
    setIsMutatingTagCatalog(false);
    setTagCatalogStatus({ tone: 'success', message: 'Tag deleted.' });
  }

  async function fetchExistingQuestions(
    conceptId: string
  ): Promise<ExistingQuestion[] | null> {
    const { data, error } = await supabase
      .from('questions')
      .select(
        'id, prompt, difficulty, testing_angle, status, sort_order, question_accepted_answers(answer_text, sort_order), question_tags(tag_id, tags(id, name, slug, status))'
      )
      .eq('concept_id', conceptId)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true });

    if (error) return null;

    type ExistingQuestionRow = {
      id: string;
      prompt: string | null;
      difficulty: string | null;
      testing_angle: string | null;
      status: string | null;
      question_accepted_answers:
        | Array<{ answer_text: string | null; sort_order: number | null }>
        | null;
      question_tags:
        | Array<{
            tag_id: string;
            tags:
              | {
                  id: string;
                  name: string;
                  slug: string;
                  status: string | null;
                }
              | Array<{
                  id: string;
                  name: string;
                  slug: string;
                  status: string | null;
                }>
              | null;
          }>
        | null;
    };

    return ((data || []) as unknown as ExistingQuestionRow[]).map((question) => {
      const acceptedAnswers = [...(question.question_accepted_answers || [])].sort(
        (left, right) => (left.sort_order || 0) - (right.sort_order || 0)
      );
      const difficulty: QuestionDifficulty =
        question.difficulty === 'easy' ||
        question.difficulty === 'medium' ||
        question.difficulty === 'hard'
          ? question.difficulty
          : 'medium';
      const recordStatus: LifecycleStatus =
        question.status === 'published' || question.status === 'archived'
          ? question.status
          : 'draft';
      const tags = (question.question_tags || [])
        .map((assignment) => {
          const related = Array.isArray(assignment.tags)
            ? assignment.tags[0]
            : assignment.tags;
          if (!related) return null;
          return {
            id: related.id,
            name: related.name,
            slug: related.slug,
            status:
              related.status === 'archived'
                ? ('archived' as const)
                : ('active' as const),
          };
        })
        .filter((tag): tag is ConceptTag => tag !== null)
        .sort((left, right) => left.name.localeCompare(right.name));

      return {
        id: question.id,
        prompt: question.prompt || '',
        answer: acceptedAnswers[0]?.answer_text || '',
        difficulty,
        testingAngle: question.testing_angle || 'General Understanding',
        status: recordStatus,
        tags,
      };
    });
  }

  async function refreshExistingQuestionList(conceptId: string) {
    const loadedQuestions = await fetchExistingQuestions(conceptId);
    if (!loadedQuestions) return;

    setExistingQuestions(loadedQuestions);
    setQuestionCountsByConceptId((current) => ({
      ...current,
      [conceptId]: loadedQuestions.length,
    }));
  }

  function resetQuestionEditor(conceptId: string | null) {
    setQuestionId(null);
    setQuestionPrompt('');
    setQuestionAnswer('');
    setQuestionDifficulty('medium');
    setQuestionTestingAngle('General Understanding');
    setQuestionRecordStatus('draft');
    setQuestionTags([]);
    setQuestionTagDraft('');
    setQuestionTagStatus(null);
    setSavedQuestionFingerprint(
      questionDraftFingerprint({
        questionId: null,
        conceptId,
        prompt: '',
        answer: '',
        difficulty: 'medium',
        testingAngle: 'General Understanding',
        recordStatus: 'draft',
        tagIds: [],
      })
    );
  }

  function confirmDiscardQuestionChanges() {
    return (
      !isQuestionDirty ||
      window.confirm('Discard the unsaved changes to this question?')
    );
  }

  function selectQuestionConcept(
    conceptId: string | null,
    topicId?: string
  ): boolean {
    if (isSavingQuestion) return false;
    if (conceptId !== questionConceptId && !confirmDiscardQuestionChanges()) {
      return false;
    }

    if (topicId) {
      setActiveTopicId(topicId);
      setQuestionTopicId(topicId);
    }

    if (conceptId !== questionConceptId) {
      setQuestionConceptId(conceptId);
      setExistingQuestions([]);
      resetQuestionEditor(conceptId);
    }
    setQuestionStatus(null);
    return true;
  }

  function selectExistingQuestion(question: ExistingQuestion) {
    if (isSavingQuestion) return;
    if (question.id === questionId) return;
    if (!confirmDiscardQuestionChanges()) return;

    setQuestionId(question.id);
    setQuestionPrompt(question.prompt);
    setQuestionAnswer(question.answer);
    setQuestionDifficulty(question.difficulty);
    setQuestionTestingAngle(question.testingAngle);
    setQuestionRecordStatus(question.status);
    setQuestionTags(question.tags);
    setQuestionTagDraft('');
    setQuestionTagStatus(null);
    setSavedQuestionFingerprint(
      questionDraftFingerprint({
        questionId: question.id,
        conceptId: questionConceptId,
        prompt: question.prompt,
        answer: question.answer,
        difficulty: question.difficulty,
        testingAngle: question.testingAngle,
        recordStatus: question.status,
        tagIds: question.tags.map((tag) => tag.id),
      })
    );
    setQuestionStatus(null);
  }

  function startNewQuestion() {
    if (
      isSavingQuestion ||
      !questionConceptId ||
      !confirmDiscardQuestionChanges()
    ) {
      return;
    }
    resetQuestionEditor(questionConceptId);
    setQuestionStatus(null);
  }

  useEffect(() => {
    if (!activeLibraryId || !questionConceptId) {
      setExistingQuestions([]);
      setIsLoadingExistingQuestions(false);
      return;
    }

    const conceptId = questionConceptId;
    let isMounted = true;
    setIsLoadingExistingQuestions(true);

    async function loadExistingQuestions() {
      const loadedQuestions = await fetchExistingQuestions(conceptId);

      if (!isMounted) return;

      setIsLoadingExistingQuestions(false);
      if (!loadedQuestions) {
        setExistingQuestions([]);
        setQuestionStatus({
          tone: 'error',
          message: 'Existing questions could not be loaded.',
        });
        return;
      }

      setExistingQuestions(loadedQuestions);
      setQuestionCountsByConceptId((current) => ({
        ...current,
        [conceptId]: loadedQuestions.length,
      }));
    }

    void loadExistingQuestions();

    return () => {
      isMounted = false;
    };
  }, [activeLibraryId, questionConceptId]);

  async function reloadRealTopicTree(preferredActiveTopicId?: string) {
    if (!activeLibraryId) return;

    const { data, error } = await supabase
      .from('library_nodes')
      .select('id, name, parent_id, sort_order')
      .eq('library_id', activeLibraryId)
      .order('sort_order')
      .order('name');

    if (error) throw error;

    const nextTopics = buildConceptTopicTree(data || []);
    const nextActiveId = preferredActiveTopicId || activeTopicId;
    const nextActivePath = nextActiveId
      ? findTopicPath(nextTopics, nextActiveId)
      : null;

    setTopics(nextTopics);
    if (nextActivePath) {
      setActiveTopicId(nextActiveId);
      setExpandedTopicIds((current) => {
        const next = new Set(current);
        nextActivePath.forEach((topic) => next.add(topic.id));
        return next;
      });
    } else {
      setActiveTopicId(nextTopics[0]?.id || '');
    }
  }

  function topicMutationErrorMessage(error: unknown) {
    if (error && typeof error === 'object' && 'message' in error) {
      return String(error.message);
    }
    return 'The Topic Tree could not be updated.';
  }

  function resetReferenceForm() {
    setReferenceDraft(emptyReferenceDraft);
    setEditingReferenceId(null);
    setReferenceStatus(null);
  }

  function submitReference(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = referenceDraft.title.trim();
    const author = referenceDraft.author.trim();
    const url = referenceDraft.url.trim();
    const notes = referenceDraft.notes.trim();

    if (!isEditingPersistedReference && !title) {
      setReferenceStatus({ tone: 'error', message: 'Source Title is required.' });
      return;
    }

    if (!isEditingPersistedReference && url) {
      try {
        const parsedUrl = new URL(url);
        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
          throw new Error('Unsupported URL protocol');
        }
      } catch {
        setReferenceStatus({
          tone: 'error',
          message: 'Enter a valid URL beginning with http:// or https://.',
        });
        return;
      }
    }

    const nextReference = { title, author, url, notes };
    if (editingReferenceId) {
      setReferences((current) =>
        current.map((reference) =>
          reference.id === editingReferenceId
            ? reference.sourceId
              ? { ...reference, notes }
              : { ...reference, ...nextReference }
            : reference
        )
      );
      setReferenceStatus({ tone: 'success', message: 'Reference updated.' });
      setEditingReferenceId(null);
      setReferenceDraft(emptyReferenceDraft);
      return;
    }

    setReferences((current) => [
      ...current,
      {
        id: globalThis.crypto.randomUUID(),
        sourceId: null,
        attributionId: null,
        ...nextReference,
      },
    ]);
    setReferenceDraft(emptyReferenceDraft);
    setReferenceStatus({ tone: 'success', message: 'Reference added.' });
  }

  function editReference(reference: Reference) {
    setEditingReferenceId(reference.id);
    setReferenceDraft({
      title: reference.title,
      author: reference.author,
      url: reference.url,
      notes: reference.notes,
    });
    setPendingRemovalId(null);
    setReferenceStatus(
      reference.sourceId
        ? {
            tone: 'info',
            message:
              'Shared source details are read-only. You may update this concept’s citation or note.',
          }
        : null
    );
  }

  function removeReference(referenceId: string) {
    setReferences((current) =>
      current.filter((reference) => reference.id !== referenceId)
    );
    if (editingReferenceId === referenceId) resetReferenceForm();
    setPendingRemovalId(null);
    setReferenceStatus({ tone: 'success', message: 'Reference removed.' });
  }

  function addTag() {
    const name = normalizeTagName(tagDraft);
    if (!name) return;

    const catalogTag = activeCatalogTags.find(
      (tag) => tagIdentity(tag.name) === tagIdentity(name)
    );
    if (!catalogTag) {
      setTagStatus({
        tone: 'error',
        message: 'Choose an active tag from the Tag Catalog.',
      });
      return;
    }

    if (conceptTags.some((tag) => tag.id === catalogTag.id)) {
      setTagStatus({ tone: 'info', message: 'That tag is already added.' });
      setTagDraft('');
      return;
    }

    setConceptTags((current) => [...current, catalogTag]);
    setTagDraft('');
    setTagStatus(null);
    setStatus(null);
  }

  function removeTag(tagId: string) {
    setConceptTags((current) => current.filter((tag) => tag.id !== tagId));
    setTagStatus(null);
    setStatus(null);
  }

  function addQuestionTag() {
    const name = normalizeTagName(questionTagDraft);
    if (!name) return;

    const catalogTag = activeCatalogTags.find(
      (tag) => tagIdentity(tag.name) === tagIdentity(name)
    );
    if (!catalogTag) {
      setQuestionTagStatus({
        tone: 'error',
        message: 'Choose an active tag from the Tag Catalog.',
      });
      return;
    }
    if (questionTags.some((tag) => tag.id === catalogTag.id)) {
      setQuestionTagStatus({
        tone: 'info',
        message: 'That tag is already added.',
      });
      setQuestionTagDraft('');
      return;
    }

    setQuestionTags((current) => [...current, catalogTag]);
    setQuestionTagDraft('');
    setQuestionTagStatus(null);
    setQuestionStatus(null);
  }

  function removeQuestionTag(tagId: string) {
    setQuestionTags((current) => current.filter((tag) => tag.id !== tagId));
    setQuestionTagStatus(null);
    setQuestionStatus(null);
  }

  function toggleExpanded(topicId: string) {
    setExpandedTopicIds((current) => {
      const next = new Set(current);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
  }

  function toggleSelected(topicId: string) {
    setSelectedTopicIds((current) => {
      const next = new Set(current);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
    setStatus(null);
  }

  function applyMarkdownFormat(format: MarkdownFormat) {
    const editor = conceptEditorRef.current;
    const start = editor?.selectionStart ?? concept.length;
    const end = editor?.selectionEnd ?? concept.length;
    const selectedText = concept.slice(start, end);
    let replacement = '';
    let selectionStart = start;
    let selectionEnd = start;

    const wrapSelection = (
      prefix: string,
      suffix: string,
      placeholder: string
    ) => {
      const innerText = selectedText || placeholder;
      replacement = `${prefix}${innerText}${suffix}`;
      selectionStart = start + prefix.length;
      selectionEnd = selectionStart + innerText.length;
    };

    const prefixLines = (prefix: string, placeholder: string) => {
      const innerText = selectedText || placeholder;
      replacement = innerText
        .split(/\r?\n/)
        .map((line) => `${prefix}${line || placeholder}`)
        .join('\n');
      selectionStart = start + prefix.length;
      selectionEnd = start + replacement.length;
    };

    switch (format) {
      case 'bold':
        wrapSelection('**', '**', 'bold text');
        break;
      case 'italic':
        wrapSelection('*', '*', 'italic text');
        break;
      case 'heading':
        prefixLines('## ', 'Heading');
        break;
      case 'bulleted-list':
        prefixLines('- ', 'Item');
        break;
      case 'numbered-list':
        prefixLines('1. ', 'Item');
        break;
      case 'link': {
        const linkText = selectedText || 'link text';
        replacement = `[${linkText}](https://example.com)`;
        selectionStart = start + 1;
        selectionEnd = selectionStart + linkText.length;
        break;
      }
      case 'quote':
        prefixLines('> ', 'Quote');
        break;
    }

    const nextConcept =
      concept.slice(0, start) + replacement + concept.slice(end);
    setConcept(nextConcept);
    setStatus(null);
    setEditorMode('write');

    window.requestAnimationFrame(() => {
      conceptEditorRef.current?.focus();
      conceptEditorRef.current?.setSelectionRange(selectionStart, selectionEnd);
    });
  }

  function openAddDialog() {
    if (!activeTopic) {
      showStatus('error', 'Select a topic before adding a subtopic.');
      return;
    }
    setNameDraft('');
    setDialogMode('add');
  }

  function openRenameDialog() {
    if (!activeTopic) {
      showStatus('error', 'Select a topic to rename.');
      return;
    }
    if (activeTopic.id === rootTopicId) {
      showStatus('error', 'The Nursing root cannot be renamed.');
      return;
    }
    setNameDraft(activeTopic.name);
    setDialogMode('rename');
  }

  function openMoveDialog() {
    if (!activeTopic) {
      showStatus('error', 'Select a topic to move.');
      return;
    }
    if (activeTopic.id === rootTopicId) {
      showStatus('error', 'The Nursing root cannot be moved.');
      return;
    }
    setMoveDestinationId(moveDestinations[0]?.id ?? '');
    setDialogMode('move');
  }

  async function saveNameDialog() {
    const name = nameDraft.trim();
    if (!activeTopic || !name) {
      showStatus('error', 'Enter a subtopic name.');
      return;
    }

    if (activeLibraryId) {
      setIsMutatingTopic(true);
      setStatus(null);

      if (dialogMode === 'add') {
        const { data, error } = await supabase.rpc(
          'create_library_node_in_library',
          {
            p_library_id: activeLibraryId,
            p_parent_id: activeTopic.id,
            p_name: name,
            p_node_type: 'topic',
            p_sort_order: activeTopic.children.length,
          }
        );

        if (error) {
          setIsMutatingTopic(false);
          showStatus(
            'error',
            `Unable to create topic: ${topicMutationErrorMessage(error)}`
          );
          return;
        }

        try {
          const createdTopicId = (data as { id?: string } | null)?.id;
          await reloadRealTopicTree(createdTopicId || activeTopic.id);
          if (
            activeCreatorTab === 'questions' &&
            !questionId &&
            !isSavingQuestion
          ) {
            setQuestionTopicId(createdTopicId || activeTopic.id);
          }
          setExpandedTopicIds((current) =>
            new Set(current).add(activeTopic.id)
          );
          setSearchQuery('');
          setDialogMode(null);
          setNameDraft('');
          showStatus('success', 'Topic created successfully.');
        } catch (error) {
          showStatus(
            'error',
            `Topic was created, but the tree could not be refreshed: ${topicMutationErrorMessage(error)}`
          );
        } finally {
          setIsMutatingTopic(false);
        }
        return;
      }

      if (dialogMode === 'rename') {
        const { error } = await supabase.rpc(
          'rename_library_node_in_library',
          {
            p_library_id: activeLibraryId,
            p_node_id: activeTopic.id,
            p_name: name,
          }
        );

        if (error) {
          setIsMutatingTopic(false);
          showStatus(
            'error',
            `Unable to rename topic: ${topicMutationErrorMessage(error)}`
          );
          return;
        }

        try {
          await reloadRealTopicTree(activeTopic.id);
          setSearchQuery('');
          setDialogMode(null);
          setNameDraft('');
          showStatus('success', 'Topic renamed successfully.');
        } catch (error) {
          showStatus(
            'error',
            `Topic was renamed, but the tree could not be refreshed: ${topicMutationErrorMessage(error)}`
          );
        } finally {
          setIsMutatingTopic(false);
        }
        return;
      }

      setIsMutatingTopic(false);
      return;
    }

    if (dialogMode === 'add') {
      const newTopic: Topic = {
        id: `topic-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name,
        children: [],
      };
      setTopics((current) =>
        updateTopic(current, activeTopic.id, (topic) => ({
          ...topic,
          children: [...topic.children, newTopic],
        }))
      );
      setExpandedTopicIds((current) => new Set(current).add(activeTopic.id));
      setActiveTopicId(newTopic.id);
      if (
        activeCreatorTab === 'questions' &&
        !questionId &&
        !isSavingQuestion
      ) {
        setQuestionTopicId(newTopic.id);
      }
      showStatus('success', `Added “${name}” beneath ${activeTopic.name}.`);
    } else if (dialogMode === 'rename') {
      setTopics((current) =>
        updateTopic(current, activeTopic.id, (topic) => ({ ...topic, name }))
      );
      showStatus('success', `Renamed topic to “${name}”.`);
    }
    setDialogMode(null);
    setNameDraft('');
  }

  async function moveActiveTopic() {
    if (!activeTopic || !moveDestinationId) {
      showStatus('error', 'Choose a destination topic.');
      return;
    }
    const destination = findTopic(topics, moveDestinationId);
    if (!destination) {
      showStatus('error', 'The selected destination is unavailable.');
      return;
    }

    if (activeLibraryId) {
      setIsMutatingTopic(true);
      setStatus(null);
      const { error } = await supabase.rpc('move_library_node_in_library', {
        p_library_id: activeLibraryId,
        p_node_id: activeTopic.id,
        p_new_parent_id: moveDestinationId,
      });

      if (error) {
        setIsMutatingTopic(false);
        showStatus(
          'error',
          `Unable to move topic: ${topicMutationErrorMessage(error)}`
        );
        return;
      }

      try {
        await reloadRealTopicTree(activeTopic.id);
        setExpandedTopicIds((current) =>
          new Set(current).add(moveDestinationId)
        );
        setSearchQuery('');
        setDialogMode(null);
        showStatus('success', 'Topic moved successfully.');
      } catch (error) {
        showStatus(
          'error',
          `Topic was moved, but the tree could not be refreshed: ${topicMutationErrorMessage(error)}`
        );
      } finally {
        setIsMutatingTopic(false);
      }
      return;
    }

    setTopics((current) => {
      const withoutActive = removeTopic(current, activeTopic.id);
      return updateTopic(withoutActive, moveDestinationId, (topic) => ({
        ...topic,
        children: [...topic.children, activeTopic],
      }));
    });
    setExpandedTopicIds((current) => new Set(current).add(moveDestinationId));
    setDialogMode(null);
    showStatus('success', `Moved “${activeTopic.name}” beneath ${destination.name}.`);
  }

  async function deleteActiveTopic() {
    if (!activeTopic) {
      showStatus('error', 'Select a topic to delete.');
      return;
    }
    if (activeTopic.id === rootTopicId) {
      showStatus('error', 'The Nursing root cannot be deleted.');
      return;
    }
    if (!activeLibraryId && activeTopic.children.length) {
      showStatus('error', 'Move or remove this topic’s subtopics first.');
      return;
    }
    if (!window.confirm(`Delete “${activeTopic.name}”?`)) return;

    if (activeLibraryId) {
      const activePath = findTopicPath(topics, activeTopic.id);
      const parentTopicId = activePath?.at(-2)?.id;
      setIsMutatingTopic(true);
      setStatus(null);
      const { error } = await supabase.rpc(
        'delete_empty_library_node_in_library',
        {
          p_library_id: activeLibraryId,
          p_node_id: activeTopic.id,
        }
      );

      if (error) {
        setIsMutatingTopic(false);
        showStatus(
          'error',
          `Unable to remove topic: ${topicMutationErrorMessage(error)}`
        );
        return;
      }

      setSelectedTopicIds((current) => {
        const next = new Set(current);
        next.delete(activeTopic.id);
        return next;
      });

      try {
        await reloadRealTopicTree(parentTopicId);
        if (
          activeCreatorTab === 'questions' &&
          !questionId &&
          !isSavingQuestion &&
          questionTopicId === activeTopic.id
        ) {
          setQuestionTopicId(parentTopicId || rootTopicId);
        }
        setSearchQuery('');
        setDialogMode(null);
        showStatus('success', 'Topic removed successfully.');
      } catch (error) {
        showStatus(
          'error',
          `Topic was removed, but the tree could not be refreshed: ${topicMutationErrorMessage(error)}`
        );
      } finally {
        setIsMutatingTopic(false);
      }
      return;
    }

    const activePath = findTopicPath(topics, activeTopic.id);
    const parentTopicId = activePath?.at(-2)?.id;
    setTopics((current) => removeTopic(current, activeTopic.id));
    setSelectedTopicIds((current) => {
      const next = new Set(current);
      next.delete(activeTopic.id);
      return next;
    });
    setActiveTopicId(
      activeCreatorTab === 'questions'
        ? parentTopicId || rootTopicId
        : ''
    );
    if (
      activeCreatorTab === 'questions' &&
      !questionId &&
      !isSavingQuestion &&
      questionTopicId === activeTopic.id
    ) {
      setQuestionTopicId(parentTopicId || rootTopicId);
    }
    setDialogMode(null);
    showStatus('success', `Deleted “${activeTopic.name}”.`);
  }

  function clearDraft() {
    const referenceDraftHasContent = Object.values(referenceDraft).some((value) =>
      value.trim()
    );
    if (
      (concept.trim() ||
        selectedTopicIds.size > 0 ||
        references.length > 0 ||
        referenceDraftHasContent) &&
      !window.confirm(
        'Clear the concept draft, its selected topics, and its references?'
      )
    ) {
      return;
    }
    setConcept('');
    setSelectedTopicIds(new Set());
    setReferences([]);
    setConceptTags([]);
    setTagDraft('');
    setTagStatus(null);
    setReferenceDraft(emptyReferenceDraft);
    setEditingReferenceId(null);
    setPendingRemovalId(null);
    setReferenceStatus(null);
    setStatus(null);
  }

  function navigateFromCreator(destination: string) {
    if (window.location.pathname === destination) {
      return;
    }

    if (
      isDirty &&
      !window.confirm('You have unsaved changes. Leave without saving?')
    ) {
      return;
    }

    window.location.assign(destination);
  }

  function goBackFromCreator() {
    if (
      isDirty &&
      !window.confirm('You have unsaved changes. Leave without saving?')
    ) {
      return;
    }

    navigateBackOrFallback(router);
  }

  function openConceptBrowser() {
    navigateFromCreator('/creator/concepts');
  }

  function openConceptFromSearch(selectedConceptId: string) {
    if (selectedConceptId === conceptId) return;
    navigateFromCreator(`/creator/concepts/${selectedConceptId}`);
  }

  function startNewConcept() {
    if (
      isContentDirty &&
      !window.confirm('Discard the unsaved changes to this concept?')
    ) {
      return;
    }

    setConceptId(null);
    setConceptName('');
    setConcept('');
    setConceptRecordStatus('draft');
    setSelectedTopicIds(new Set());
    setConceptTags([]);
    setTagDraft('');
    setTagStatus(null);
    setReferences([]);
    setReferenceDraft(emptyReferenceDraft);
    setEditingReferenceId(null);
    setPendingRemovalId(null);
    setReferenceStatus(null);
    setContentConceptSearch('');
    setEditorMode('write');
    setActiveCreatorTab('content');
    setStatus(null);
    setSavedDraftFingerprint(draftFingerprint('', [], [], [], 'draft'));
    window.location.assign('/creator/concepts/new');
  }

  async function saveConcept() {
    if (!concept.trim()) {
      showStatus('error', 'Write a concept or explanation before saving.');
      return;
    }
    if (!selectedTopicIds.size) {
      showStatus('error', 'Select at least one topic before saving.');
      return;
    }
    if (hasPendingReferenceDraft) {
      showStatus(
        'error',
        'Add, save, or cancel the reference currently being edited before saving the concept.'
      );
      return;
    }

    if (!activeLibraryId) {
      showStatus('success', 'Concept ready for future persistence.');
      return;
    }

    const bodyMarkdownToSave = concept;
    const placementIdsToSave = Array.from(selectedTopicIds);
    const referencesToSave = references;
    const tagIdsToSave = conceptTags.map((tag) => tag.id);
    const name =
      conceptName.trim() || conceptNameFromMarkdown(bodyMarkdownToSave);
    setIsSaving(true);
    setStatus(null);

    const { data, error } = await supabase.rpc('save_concept_with_version', {
      p_concept_id: conceptId,
      p_name: name,
      p_body_markdown: bodyMarkdownToSave,
      p_active_library_id: activeLibraryId,
      p_library_node_ids: placementIdsToSave,
      p_tag_ids: tagIdsToSave,
      p_status: conceptRecordStatus,
      p_references: referencesToSave.map((reference) => ({
        client_id: reference.id,
        source_id: reference.sourceId,
        title: reference.title,
        author: reference.author,
        url: reference.url,
        note: reference.notes,
      })),
    });

    if (error) {
      setIsSaving(false);
      showStatus('error', error.message || 'Concept could not be saved.');
      return;
    }

    const savedConceptId = (data as { concept_id?: string } | null)?.concept_id;
    if (!savedConceptId) {
      setIsSaving(false);
      showStatus('error', 'Concept was saved without a returned identifier.');
      return;
    }

    const wasNewConcept = conceptId === null;
    setConceptId(savedConceptId);
    setConceptName(name);

    if (wasNewConcept) {
      window.history.replaceState(
        window.history.state,
        '',
        `/creator/concepts/${savedConceptId}`
      );
    }

    setIsSaving(false);

    const synchronizedReferences = (
      data as {
        references?: Array<{
          client_id: string;
          source_id: string;
          attribution_id: string;
        }>;
      } | null
    )?.references;

    if (!Array.isArray(synchronizedReferences)) {
      showStatus(
        'error',
        'Concept draft saved, but the reference save response was incomplete. Please retry.'
      );
      return;
    }

    const synchronizedByClientId = new Map(
      synchronizedReferences.map((reference) => [
        reference.client_id,
        reference,
      ])
    );
    const savedReferences = referencesToSave.map((reference) => {
      const synchronized = synchronizedByClientId.get(reference.id);
      return synchronized
        ? {
            ...reference,
            sourceId: synchronized.source_id,
            attributionId: synchronized.attribution_id,
          }
        : null;
    });

    if (savedReferences.some((reference) => reference === null)) {
      showStatus(
        'error',
        'Concept draft saved, but one or more references were not confirmed. Please retry.'
      );
      return;
    }

    const confirmedReferences = savedReferences.filter(
      (
        reference
      ): reference is NonNullable<(typeof savedReferences)[number]> =>
        reference !== null
    );
    setReferences((current) =>
      current.map((reference) => {
        const synchronized = synchronizedByClientId.get(reference.id);
        return synchronized
          ? {
              ...reference,
              sourceId: synchronized.source_id,
              attributionId: synchronized.attribution_id,
            }
          : reference;
      })
    );
    setSavedDraftFingerprint(
      draftFingerprint(
        bodyMarkdownToSave,
        placementIdsToSave,
        confirmedReferences,
        tagIdsToSave,
        conceptRecordStatus
      )
    );

    await loadTagCatalog();
    broadcastTagCatalogUsageInvalidation();

    showStatus('success', 'Concept and references saved.');

    if (wasNewConcept) {
      router.replace(`/creator/concepts/${savedConceptId}`);
    } else {
      router.refresh();
    }
  }

  async function saveQuestion() {
    const prompt = questionPrompt.trim();
    const answer = questionAnswer.trim();
    const testingAngle = questionTestingAngle.trim() || 'General Understanding';

    if (!questionConceptId) {
      setQuestionStatus({
        tone: 'error',
        message: 'Choose a topic and concept before saving the question.',
      });
      return;
    }
    if (!prompt) {
      setQuestionStatus({ tone: 'error', message: 'Enter the question text.' });
      return;
    }
    if (!answer) {
      setQuestionStatus({ tone: 'error', message: 'Enter the answer text.' });
      return;
    }

    setIsSavingQuestion(true);
    setQuestionStatus(null);

    const questionPayload = {
      p_question_type: 'short_answer',
      p_prompt: prompt,
      p_explanation: null,
      p_review_article_concept_id: null,
      p_sort_order: 0,
      p_difficulty: questionDifficulty,
      p_testing_angle: testingAngle,
    };

    const { data, error } = await supabase.rpc('save_question_with_version', {
      p_question_id: questionId,
      p_concept_id: questionConceptId,
      ...questionPayload,
      p_status: questionRecordStatus,
      p_accepted_answers: [{ answer_text: answer, sort_order: 0 }],
      p_options: null,
      p_source_ids: null,
      p_tag_ids: questionTags.map((tag) => tag.id),
    });

    if (error) {
      setIsSavingQuestion(false);
      setQuestionStatus({
        tone: 'error',
        message: error.message || 'Question could not be saved.',
      });
      return;
    }

    const savedQuestionId = (data as { id?: string } | null)?.id || null;
    if (!savedQuestionId) {
      setIsSavingQuestion(false);
      setQuestionStatus({
        tone: 'error',
        message: 'Question was saved without a returned identifier.',
      });
      return;
    }

    if (!questionId) setQuestionId(savedQuestionId);

    const nextFingerprint = questionDraftFingerprint({
      questionId: savedQuestionId,
      conceptId: questionConceptId,
      prompt,
      answer,
      difficulty: questionDifficulty,
      testingAngle,
      recordStatus: questionRecordStatus,
      tagIds: questionTags.map((tag) => tag.id),
    });

    setQuestionPrompt(prompt);
    setQuestionAnswer(answer);
    setQuestionTestingAngle(testingAngle);
    setSavedQuestionFingerprint(nextFingerprint);
    await Promise.all([
      refreshExistingQuestionList(questionConceptId),
      loadTagCatalog(),
    ]);
    broadcastTagCatalogUsageInvalidation();
    setIsSavingQuestion(false);
    setQuestionStatus({
      tone: 'success',
      message: questionId ? 'Question updated.' : 'Question saved.',
    });
  }

  function renderQuestionTopic(topic: Topic, depth = 0) {
    const searching = Boolean(normalizedSearch);
    if (searching && !searchIds.has(topic.id)) return null;
    if (needsQuestionsOnly && !needsQuestionTopicIds.has(topic.id)) return null;
    const hasChildren = topic.children.length > 0;
    const directConcepts = (questionConceptsByTopicId[topic.id] || []).filter(
      (conceptOption) =>
        !needsQuestionsOnly ||
        (questionCountsByConceptId[conceptOption.id] || 0) === 0
    );
    const hasSearchVisibleChild = topic.children.some((child) =>
      searchIds.has(child.id)
    );
    const hasNeedsQuestionsVisibleChild = topic.children.some((child) =>
      needsQuestionTopicIds.has(child.id)
    );
    const isExpanded = needsQuestionsOnly
      ? directConcepts.length > 0 || hasNeedsQuestionsVisibleChild
      : searching
        ? hasSearchVisibleChild
        : expandedTopicIds.has(topic.id);
    const isActive = activeTopicId === topic.id;
    const hasConceptsInBranch = questionConceptBranchTopicIds.has(topic.id);

    return (
      <div className={styles.topicBranch} key={`question-${topic.id}`}>
        <div
          className={`${styles.topicRow} ${isActive ? styles.activeTopicRow : ''}`}
          style={{
            background: hasConceptsInBranch ? undefined : '#f8fafc',
            color: hasConceptsInBranch ? undefined : '#94a3b8',
            paddingLeft: `${12 + depth * 38}px`,
          }}
          onClick={() => {
            setActiveTopicId(topic.id);
            if (!questionId && !isQuestionDirty && !isSavingQuestion) {
              setQuestionTopicId(topic.id);
            }
            setQuestionStatus(null);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setActiveTopicId(topic.id);
              if (!questionId && !isQuestionDirty && !isSavingQuestion) {
                setQuestionTopicId(topic.id);
              }
              setQuestionStatus(null);
            }
          }}
          aria-label={`Use ${topic.name} for question sourcing`}
        >
          <button
            className={styles.expandButton}
            type="button"
            disabled={!hasChildren}
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${topic.name}`}
            onClick={(event) => {
              event.stopPropagation();
              if (hasChildren) toggleExpanded(topic.id);
            }}
          >
            {hasChildren ? (
              isExpanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />
            ) : (
              <span className={styles.arrowSpacer} />
            )}
          </button>
          {hasChildren ? (
            <Folder className={styles.folderIcon} size={21} strokeWidth={1.7} />
          ) : (
            <span className={styles.leafSpacer} />
          )}
          <span className={styles.topicName} title={topic.name}>
            {topic.name}
          </span>
          {!hasConceptsInBranch && (
            <span
              style={{
                color: '#94a3b8',
                fontSize: 12,
                marginLeft: 'auto',
                paddingRight: 10,
              }}
            >
              No concepts
            </span>
          )}
        </div>
        {directConcepts.length > 0 && (!hasChildren || isExpanded) && (
          <div style={{ display: 'grid', gap: 3 }}>
            {directConcepts.map((conceptOption) => {
              const isSelected = questionConceptId === conceptOption.id;

              return (
                <label
                  key={`${topic.id}-${conceptOption.id}`}
                  style={{
                    alignItems: 'center',
                    background: isSelected ? '#e8f0ff' : '#f7f9fc',
                    border: isSelected
                      ? '1px solid #8eb2f3'
                      : '1px solid transparent',
                    borderRadius: 8,
                    color: isSelected ? '#0f4eb8' : '#475569',
                    cursor: isSavingQuestion ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    fontSize: 14,
                    gap: 8,
                    margin: `2px 10px 2px ${50 + depth * 38}px`,
                    padding: '7px 10px',
                    textAlign: 'left',
                  }}
                >
                  <input
                    className={styles.topicCheckbox}
                    type="checkbox"
                    checked={isSelected}
                    disabled={isSavingQuestion}
                    onChange={(event) => {
                      selectQuestionConcept(
                        event.target.checked ? conceptOption.id : null,
                        topic.id
                      );
                    }}
                  />
                  <span>
                    {conceptOption.name} ·{' '}
                    {questionCountLabel(
                      questionCountsByConceptId[conceptOption.id] || 0
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        )}
        {hasChildren && isExpanded && (
          <div className={depth > 0 ? styles.nestedTopics : undefined}>
            {topic.children.map((child) => renderQuestionTopic(child, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  function renderTopic(topic: Topic, depth = 0) {
    const searching = Boolean(normalizedSearch);
    if (searching && !searchIds.has(topic.id)) return null;
    const hasChildren = topic.children.length > 0;
    const hasVisibleChild = topic.children.some((child) => searchIds.has(child.id));
    const isExpanded = searching ? hasVisibleChild : expandedTopicIds.has(topic.id);
    const isActive = activeTopicId === topic.id;
    const isChecked = selectedTopicIds.has(topic.id);

    return (
      <div className={styles.topicBranch} key={topic.id}>
        <div
          className={`${styles.topicRow} ${isActive ? styles.activeTopicRow : ''}`}
          style={{ paddingLeft: `${12 + depth * 38}px` }}
          onClick={() => {
            setActiveTopicId(topic.id);
            setStatus(null);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setActiveTopicId(topic.id);
              setStatus(null);
            }
          }}
          aria-label={`Make ${topic.name} the active topic`}
        >
          <button
            className={styles.expandButton}
            type="button"
            disabled={!hasChildren}
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${topic.name}`}
            onClick={(event) => {
              event.stopPropagation();
              if (hasChildren) toggleExpanded(topic.id);
            }}
          >
            {hasChildren ? (
              isExpanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />
            ) : (
              <span className={styles.arrowSpacer} />
            )}
          </button>
          <input
            className={styles.topicCheckbox}
            type="checkbox"
            checked={isChecked}
            aria-label={`Assign concept to ${topic.name}`}
            onClick={(event) => event.stopPropagation()}
            onChange={() => toggleSelected(topic.id)}
          />
          {hasChildren ? (
            <Folder className={styles.folderIcon} size={21} strokeWidth={1.7} />
          ) : (
            <span className={styles.leafSpacer} />
          )}
          <span className={styles.topicName} title={topic.name}>
            {topic.name}
          </span>
        </div>
        {hasChildren && isExpanded && (
          <div className={depth > 0 ? styles.nestedTopics : undefined}>
            {topic.children.map((child) => renderTopic(child, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <Header />
      <main className={styles.workspace}>
        <section className={styles.studioShell}>
          <header className={styles.localHeader}>
            <h1>Creator Studio</h1>
            <div className={styles.headerActions}>
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={goBackFromCreator}
              >
                ← Back
              </button>
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() => navigateFromCreator('/creator/libraries')}
              >
                Library Organizer
              </button>
              <span
                className={`${styles.saveState} ${isDirty ? styles.unsaved : ''}`}
                aria-live="polite"
              >
                {isDirty ? 'Unsaved changes' : 'Saved'}
              </span>
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={openConceptBrowser}
              >
                Concepts
              </button>
              <button className={styles.secondaryButton} type="button" onClick={clearDraft}>
                Clear
              </button>
              {activeCreatorTab !== 'tags' && (
                <button
                  className={styles.primaryButton}
                  type="button"
                  onClick={
                    activeCreatorTab === 'content' ? saveConcept : saveQuestion
                  }
                  disabled={
                    activeCreatorTab === 'content' ? isSaving : isSavingQuestion
                  }
                >
                  {activeCreatorTab === 'content'
                    ? isSaving
                      ? 'Saving…'
                      : 'Save'
                    : isSavingQuestion
                      ? 'Saving…'
                      : 'Save'}
                </button>
              )}
            </div>
          </header>

          <nav
            aria-label="Creator Studio sections"
            role="tablist"
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 0,
              padding: '0 28px',
              borderBottom: '1px solid #d9dde3',
              background: 'linear-gradient(180deg, #f8fbff, #eef4fc)',
            }}
          >
            {(['content', 'questions', 'tags'] as const).map((tab) => {
              const isActive = activeCreatorTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => {
                    setActiveCreatorTab(tab);
                    if (tab === 'questions') {
                      setActiveTopicId(questionTopicId);
                    }
                  }}
                  style={{
                    position: 'relative',
                    zIndex: isActive ? 1 : 0,
                    minHeight: '48px',
                    margin: '0 -1px -1px 0',
                    border: '1px solid',
                    borderColor: isActive ? '#9fb8dc' : '#c7d5e8',
                    borderBottomColor: isActive ? '#ffffff' : '#d9dde3',
                    borderRadius: '10px 10px 0 0',
                    padding: '12px 28px 11px',
                    background: isActive ? '#ffffff' : '#eaf2ff',
                    color: isActive ? '#061846' : '#24405f',
                    font: 'inherit',
                    fontWeight: 800,
                    cursor: 'pointer',
                    clipPath:
                      'polygon(0 0, calc(100% - 14px) 0, 100% 100%, 0 100%)',
                  }}
                >
                  {tab === 'content'
                    ? 'Content'
                    : tab === 'questions'
                      ? 'Questions'
                      : 'Tags'}
                </button>
              );
            })}
          </nav>

          {activeCreatorTab === 'tags' && (
            <section
              className={`${styles.panel} ${styles.selectedPanel}`}
              aria-label="Tag Manager"
              style={{ margin: '18px 28px 0' }}
            >
              <div>
                <h2>Tag Manager</h2>
                <p>Create and maintain the shared tag vocabulary.</p>
                <p style={{ color: '#687386', marginTop: 6 }}>
                  Archived tags remain on existing content and in history, but are
                  unavailable for new assignments.
                </p>
              </div>
              <div
                style={{
                  alignItems: 'center',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  marginTop: 12,
                }}
              >
                <label className={styles.searchBox} style={{ flex: '1 1 220px' }}>
                  <span className={styles.srOnly}>Search tag catalog</span>
                  <input
                    value={tagCatalogSearch}
                    onChange={(event) => setTagCatalogSearch(event.target.value)}
                    placeholder="Search tags"
                  />
                  <Search size={20} />
                </label>
                <label className={styles.searchBox} style={{ flex: '1 1 220px' }}>
                  <span className={styles.srOnly}>New tag name</span>
                  <input
                    value={newCatalogTagName}
                    disabled={isMutatingTagCatalog}
                    onChange={(event) => {
                      setNewCatalogTagName(event.target.value);
                      setTagCatalogStatus(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void createCatalogTag();
                      }
                    }}
                    placeholder="New tag name"
                  />
                </label>
                <button
                  className={styles.toolButton}
                  type="button"
                  disabled={isMutatingTagCatalog || !newCatalogTagName.trim()}
                  onClick={() => void createCatalogTag()}
                >
                  <Plus size={18} /> Create Tag
                </button>
              </div>
              <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
                {filteredCatalogTags.length ? (
                  filteredCatalogTags.map((tag) => (
                    <div
                      key={tag.id}
                      style={{
                        alignItems: 'center',
                        border: '1px solid #d8e1ef',
                        borderRadius: 8,
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 8,
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                      }}
                    >
                      <span>
                        <strong>{tag.name}</strong>{' '}
                        <small style={{ color: '#687386' }}>
                          {tag.status} · {tag.conceptUsage} concepts ·{' '}
                          {tag.questionUsage} questions · {tag.articleUsage} articles
                        </small>
                      </span>
                      <span style={{ display: 'flex', gap: 6 }}>
                        <button
                          className={styles.secondaryButton}
                          type="button"
                          disabled={isMutatingTagCatalog}
                          onClick={() => void renameCatalogTag(tag)}
                        >
                          Rename
                        </button>
                        <button
                          className={styles.secondaryButton}
                          type="button"
                          disabled={isMutatingTagCatalog}
                          onClick={() =>
                            void setCatalogTagStatus(
                              tag,
                              tag.status === 'active' ? 'archived' : 'active'
                            )
                          }
                        >
                          {tag.status === 'active' ? 'Archive' : 'Reactivate'}
                        </button>
                        <button
                          className={styles.secondaryButton}
                          type="button"
                          disabled={isMutatingTagCatalog}
                          onClick={() => void deleteCatalogTag(tag)}
                        >
                          Delete Tag
                        </button>
                      </span>
                    </div>
                  ))
                ) : (
                  <p className={styles.emptySelection}>No tags found.</p>
                )}
              </div>
              {tagCatalogStatus && (
                <div
                  className={`${styles.referenceStatus} ${styles[tagCatalogStatus.tone]}`}
                  role="status"
                  aria-live="polite"
                  style={{ marginTop: 10 }}
                >
                  {tagCatalogStatus.message}
                </div>
              )}
            </section>
          )}

          {activeCreatorTab === 'content' ? (
            <>
              <section
                className={styles.panel}
                style={{ marginBottom: 18 }}
              >
                <div
                  style={{
                    alignItems: 'center',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 10,
                  }}
                >
                  <label
                    className={styles.searchBox}
                    style={{ flex: '1 1 260px' }}
                  >
                    <span className={styles.srOnly}>Search concepts</span>
                    <input
                      value={contentConceptSearch}
                      onChange={(event) =>
                        setContentConceptSearch(event.target.value)
                      }
                      placeholder="Search concepts"
                    />
                    <Search size={20} />
                  </label>
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    onClick={startNewConcept}
                  >
                    <Plus size={17} /> New Concept
                  </button>
                </div>

                <div
                  style={{
                    alignItems: 'center',
                    color: '#687386',
                    display: 'flex',
                    flexWrap: 'wrap',
                    fontSize: 13,
                    gap: 12,
                    justifyContent: 'space-between',
                    marginTop: 8,
                  }}
                >
                  <span>
                    Editing:{' '}
                    <strong style={{ color: '#334155' }}>
                      {conceptId ? conceptName || 'Untitled concept' : 'New concept'}
                    </strong>
                  </span>
                  <label
                    style={{
                      alignItems: 'center',
                      display: 'flex',
                      gap: 6,
                    }}
                  >
                    <strong style={{ color: '#334155' }}>Status</strong>
                    <select
                      aria-label="Concept status"
                      value={conceptRecordStatus}
                      disabled={!conceptId || isSaving}
                      onChange={(event) => {
                        setConceptRecordStatus(
                          event.target.value as LifecycleStatus
                        );
                        setStatus(null);
                      }}
                    >
                      <option value="draft">Draft</option>
                      <option value="published">Published</option>
                      <option value="archived">Archived</option>
                    </select>
                  </label>
                </div>

                {normalizedContentConceptSearch && (
                  <div
                    style={{
                      border: '1px solid #d8e1ef',
                      borderRadius: 12,
                      display: 'grid',
                      gap: 4,
                      marginTop: 10,
                      padding: 8,
                    }}
                  >
                    {contentConceptSearchResults.length ? (
                      contentConceptSearchResults.map((conceptOption) => {
                        const isSelected = conceptOption.id === conceptId;
                        const firstPath = conceptOption.paths[0];

                        return (
                          <button
                            className={styles.secondaryButton}
                            key={conceptOption.id}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() =>
                              openConceptFromSearch(conceptOption.id)
                            }
                            style={{
                              alignItems: 'flex-start',
                              background: isSelected ? '#e8f0ff' : undefined,
                              borderColor: isSelected ? '#8eb2f3' : undefined,
                              color: isSelected ? '#0f4eb8' : undefined,
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'flex-start',
                              textAlign: 'left',
                            }}
                          >
                            <span>{conceptOption.name}</span>
                            {firstPath && (
                              <small style={{ color: '#687386' }}>
                                {firstPath}
                                {conceptOption.paths.length > 1
                                  ? ` +${conceptOption.paths.length - 1}`
                                  : ''}
                              </small>
                            )}
                          </button>
                        );
                      })
                    ) : (
                      <p className={styles.emptySelection}>
                        No concepts match “{contentConceptSearch.trim()}”.
                      </p>
                    )}
                  </div>
                )}
              </section>

              <div className={styles.mainGrid}>
                <section className={`${styles.panel} ${styles.conceptPanel}`}>
              <div>
                <h2>1. Concept / Explanation</h2>
                <p>Main concept creation space.</p>
              </div>
              <div
                aria-label="Concept formatting tools"
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  alignItems: 'center',
                }}
              >
                {[
                  ['bold', 'Bold'],
                  ['italic', 'Italic'],
                  ['heading', 'Heading'],
                  ['bulleted-list', 'Bulleted List'],
                  ['numbered-list', 'Numbered List'],
                  ['link', 'Link'],
                  ['quote', 'Quote'],
                ].map(([format, label]) => (
                  <button
                    className={styles.toolButton}
                    key={format}
                    type="button"
                    onClick={() => applyMarkdownFormat(format as MarkdownFormat)}
                  >
                    {label}
                  </button>
                ))}
                <span style={{ flex: 1 }} />
                {(['write', 'preview'] as const).map((mode) => (
                  <button
                    className={
                      editorMode === mode
                        ? styles.primaryButton
                        : styles.secondaryButton
                    }
                    key={mode}
                    type="button"
                    onClick={() => setEditorMode(mode)}
                  >
                    {mode === 'write' ? 'Write' : 'Preview'}
                  </button>
                ))}
              </div>
              {editorMode === 'write' ? (
                <textarea
                  ref={conceptEditorRef}
                  className={styles.conceptEditor}
                  value={concept}
                  onChange={(event) => {
                    setConcept(event.target.value);
                    setStatus(null);
                  }}
                  placeholder="Write your concept or explanation here..."
                  aria-label="Concept or explanation"
                />
              ) : (
                <div
                  className={styles.conceptEditor}
                  style={{
                    overflow: 'auto',
                    whiteSpace: 'normal',
                  }}
                  aria-label="Concept preview"
                >
                  {concept.trim() ? (
                    <MarkdownContent markdown={concept} />
                  ) : (
                    <p className="muted">Nothing to preview yet.</p>
                  )}
                </div>
              )}
              <div className={styles.wordCount}>Word count: {wordCount(concept)}</div>
                </section>

                <section className={`${styles.panel} ${styles.topicPanel}`}>
              <div>
                <h2>2. Topic Tree</h2>
                <p>Select a topic, then add a subtopic beneath it.</p>
              </div>

              <div className={styles.treeControls}>
                <label className={styles.searchBox}>
                  <span className={styles.srOnly}>Search topics</span>
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search topics..."
                  />
                  <Search size={20} />
                </label>
                <button className={styles.toolButton} type="button" onClick={openAddDialog} disabled={isMutatingTopic}>
                  <Plus size={18} /> Add Subtopic
                </button>
                <button className={styles.toolButton} type="button" onClick={openRenameDialog} disabled={isMutatingTopic}>
                  <Pencil size={17} /> Rename
                </button>
                <button className={styles.toolButton} type="button" onClick={deleteActiveTopic} disabled={isMutatingTopic}>
                  <Trash2 size={17} /> Delete
                </button>
                <button className={styles.toolButton} type="button" onClick={openMoveDialog} disabled={isMutatingTopic}>
                  <ArrowUpDown size={17} /> Move
                </button>
              </div>

              {dialogMode && (
                <div className={styles.inlineDialog} role="dialog" aria-modal="false">
                  {dialogMode === 'move' ? (
                    <>
                      <label>
                        Move “{activeTopic?.name}” beneath
                        <select
                          value={moveDestinationId}
                          onChange={(event) => setMoveDestinationId(event.target.value)}
                        >
                          {moveDestinations.map((destination) => (
                            <option key={destination.id} value={destination.id}>
                              {destination.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className={styles.dialogActions}>
                        <button className={styles.secondaryButton} type="button" onClick={() => setDialogMode(null)}>
                          Cancel
                        </button>
                        <button className={styles.primaryButton} type="button" onClick={moveActiveTopic} disabled={isMutatingTopic}>
                          {isMutatingTopic ? 'Moving…' : 'Move'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <label>
                        {dialogMode === 'add'
                          ? `Add Subtopic beneath ${activeTopic?.name}`
                          : `Rename “${activeTopic?.name}”`}
                        <input
                          autoFocus
                          value={nameDraft}
                          onChange={(event) => setNameDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' && !isMutatingTopic) saveNameDialog();
                          }}
                          placeholder={dialogMode === 'add' ? 'Subtopic name' : 'Topic name'}
                        />
                      </label>
                      <div className={styles.dialogActions}>
                        <button className={styles.secondaryButton} type="button" onClick={() => setDialogMode(null)}>
                          Cancel
                        </button>
                        <button className={styles.primaryButton} type="button" onClick={saveNameDialog} disabled={isMutatingTopic}>
                          {isMutatingTopic ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className={styles.treeViewport} aria-label="Topic Tree">
                {topics.map((topic) => renderTopic(topic))}
                {normalizedSearch && searchIds.size === 0 && (
                  <div className={styles.emptyTree}>No topics match “{searchQuery.trim()}”.</div>
                )}
              </div>
              <p className={styles.treeFooter}>
                Keep nesting subtopics to any level. There’s no limit how deep you can go.
              </p>
                </section>
              </div>

              <section className={`${styles.panel} ${styles.selectedPanel}`}>
            <div className={styles.selectedHeading}>
              <div>
                <h2>
                  3. Selected Topics
                  <span>Concept will be assigned to all selected topics.</span>
                </h2>
              </div>
              <button
                className={styles.secondaryButton}
                type="button"
                disabled={!selectedTopicIds.size}
                onClick={() => {
                  setSelectedTopicIds(new Set());
                  setStatus(null);
                }}
              >
                Clear All
              </button>
            </div>
            <div className={styles.topicChips}>
              {selectedPaths.length ? (
                selectedPaths.map(({ id, path }) => (
                  <div className={styles.topicChip} key={id} title={path.map((topic) => topic.name).join(' > ')}>
                    <span>
                      {path.map((topic, index) => (
                        <span key={topic.id}>
                          {index > 0 && <ChevronRight size={14} />}
                          {topic.name}
                        </span>
                      ))}
                    </span>
                    <button type="button" onClick={() => toggleSelected(id)} aria-label={`Remove ${path.at(-1)?.name} from selected topics`}>
                      <X size={16} />
                    </button>
                  </div>
                ))
              ) : (
                <p className={styles.emptySelection}>No topics selected yet.</p>
              )}
            </div>
            <div
              style={{
                borderTop: '1px solid #e2e8f0',
                marginTop: 16,
                paddingTop: 16,
              }}
            >
              <h3 style={{ margin: '0 0 8px' }}>Tags</h3>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                {conceptTags.length ? (
                  conceptTags.map((tag) => (
                    <div className={styles.topicChip} key={tag.id}>
                      <span>
                        {tag.name}
                        {tag.status === 'archived' ? ' (Archived)' : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeTag(tag.id)}
                        aria-label={`Remove ${tag.name} tag`}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className={styles.emptySelection}>No tags added yet.</p>
                )}
              </div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  alignItems: 'center',
                }}
              >
                <label className={styles.searchBox} style={{ maxWidth: 360 }}>
                  <span className={styles.srOnly}>Add a tag</span>
                  <input
                    value={tagDraft}
                    list="concept-tag-options"
                    onChange={(event) => {
                      setTagDraft(event.target.value);
                      setTagStatus(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addTag();
                      }
                    }}
                    placeholder="Search tags"
                  />
                </label>
                <datalist id="concept-tag-options">
                  {activeCatalogTags
                    .filter(
                      (tag) =>
                        !conceptTags.some((selected) => selected.id === tag.id)
                    )
                    .map((tag) => (
                      <option key={tag.id} value={tag.name} />
                    ))}
                </datalist>
                <button className={styles.toolButton} type="button" onClick={addTag}>
                  <Plus size={18} /> Add Tag
                </button>
              </div>
              {tagStatus && (
                <div
                  className={`${styles.referenceStatus} ${styles[tagStatus.tone]}`}
                  role="status"
                  aria-live="polite"
                  style={{ marginTop: 10 }}
                >
                  {tagStatus.message}
                </div>
              )}
            </div>
              </section>

              <section className={`${styles.panel} ${styles.sourcesPanel}`}>
            <div>
              <h2>4. Sources / References</h2>
              <p>Add the references used to create or support this concept.</p>
            </div>

            <form className={styles.referenceForm} onSubmit={submitReference}>
              <label>
                Source Title
                <input
                  value={referenceDraft.title}
                  disabled={isEditingPersistedReference}
                  title={
                    isEditingPersistedReference
                      ? 'Shared source details cannot be changed here.'
                      : undefined
                  }
                  onChange={(event) => {
                    setReferenceDraft((current) => ({
                      ...current,
                      title: event.target.value,
                    }));
                    setReferenceStatus(null);
                  }}
                  aria-required="true"
                />
              </label>
              <label>
                Author / Organization
                <input
                  value={referenceDraft.author}
                  disabled={isEditingPersistedReference}
                  title={
                    isEditingPersistedReference
                      ? 'Shared source details cannot be changed here.'
                      : undefined
                  }
                  onChange={(event) => {
                    setReferenceDraft((current) => ({
                      ...current,
                      author: event.target.value,
                    }));
                    setReferenceStatus(null);
                  }}
                />
              </label>
              <label className={styles.fullWidthField}>
                URL
                <input
                  type="url"
                  value={referenceDraft.url}
                  disabled={isEditingPersistedReference}
                  title={
                    isEditingPersistedReference
                      ? 'Shared source details cannot be changed here.'
                      : undefined
                  }
                  onChange={(event) => {
                    setReferenceDraft((current) => ({
                      ...current,
                      url: event.target.value,
                    }));
                    setReferenceStatus(null);
                  }}
                  placeholder="https://example.org/reference"
                />
              </label>
              <label className={styles.fullWidthField}>
                Optional Citation / Notes
                <textarea
                  value={referenceDraft.notes}
                  onChange={(event) => {
                    setReferenceDraft((current) => ({
                      ...current,
                      notes: event.target.value,
                    }));
                    setReferenceStatus(null);
                  }}
                  rows={3}
                />
              </label>
              <div className={`${styles.referenceFormActions} ${styles.fullWidthField}`}>
                <button className={styles.primaryButton} type="submit">
                  {editingReferenceId ? 'Save Changes' : (
                    <>
                      <Plus size={18} /> Add Reference
                    </>
                  )}
                </button>
                {editingReferenceId && (
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    onClick={resetReferenceForm}
                  >
                    Cancel
                  </button>
                )}
              </div>
              {referenceStatus && (
                <div
                  className={`${styles.referenceStatus} ${styles[referenceStatus.tone]} ${styles.fullWidthField}`}
                  role="status"
                  aria-live="polite"
                >
                  {referenceStatus.message}
                </div>
              )}
            </form>

            <div className={styles.referenceList}>
              <h3>References</h3>
              {references.length ? (
                references.map((reference) => (
                  <article className={styles.referenceCard} key={reference.id}>
                    <div className={styles.referenceContent}>
                      <h4>{reference.title}</h4>
                      {reference.author && <p>{reference.author}</p>}
                      {reference.url && (
                        <a href={reference.url} target="_blank" rel="noreferrer">
                          {reference.url}
                        </a>
                      )}
                      {reference.notes && <p>{reference.notes}</p>}
                    </div>
                    {pendingRemovalId === reference.id ? (
                      <div className={styles.removeConfirmation}>
                        <span>Remove “{reference.title}”?</span>
                        <div>
                          <button
                            className={styles.dangerButton}
                            type="button"
                            onClick={() => removeReference(reference.id)}
                          >
                            Remove Reference
                          </button>
                          <button
                            className={styles.secondaryButton}
                            type="button"
                            onClick={() => setPendingRemovalId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className={styles.referenceActions}>
                        <button
                          className={styles.secondaryButton}
                          type="button"
                          onClick={() => editReference(reference)}
                        >
                          Edit
                        </button>
                        <button
                          className={styles.secondaryButton}
                          type="button"
                          onClick={() => setPendingRemovalId(reference.id)}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </article>
                ))
              ) : (
                <p className={styles.emptyReferences}>No references added yet.</p>
              )}
            </div>
              </section>

              <footer className={styles.bottomActions}>
            <div className={styles.infoMessage}>
              <Info size={22} />
              <span>Select multiple topics to assign this concept to more than one location.</span>
            </div>
              </footer>

              {status && (
                <div className={`${styles.status} ${styles[status.tone]}`} role="status" aria-live="polite">
                  {status.message}
                </div>
              )}
            </>
          ) : activeCreatorTab === 'questions' ? (
            <>
              <div className={styles.mainGrid}>
                <section className={`${styles.panel} ${styles.conceptPanel}`}>
                  <div>
                    <h2>1. Question / Answer</h2>
                    <p>Create the front and back of the study card.</p>
                  </div>

                  <div
                    style={{
                      borderBottom: '1px solid #e2e8f0',
                      marginBottom: 18,
                      paddingBottom: 16,
                    }}
                  >
                    <div
                      style={{
                        alignItems: 'center',
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        marginBottom: 10,
                      }}
                    >
                      <h3 style={{ margin: 0 }}>Existing Questions</h3>
                      <button
                        className={styles.secondaryButton}
                        type="button"
                        disabled={!questionConceptId || isSavingQuestion}
                        onClick={startNewQuestion}
                      >
                        <Plus size={16} /> New Question
                      </button>
                    </div>

                    {!questionConceptId ? (
                      <p className={styles.emptySelection}>
                        Select a concept to view its questions.
                      </p>
                    ) : isLoadingExistingQuestions ? (
                      <p className={styles.emptySelection}>
                        Loading questions…
                      </p>
                    ) : existingQuestions.length ? (
                      <div style={{ display: 'grid', gap: 6 }}>
                        {existingQuestions.map((question) => {
                          const isSelected = question.id === questionId;

                          return (
                            <button
                              key={question.id}
                              type="button"
                              disabled={isSavingQuestion}
                              aria-pressed={isSelected}
                              onClick={() => selectExistingQuestion(question)}
                              style={{
                                alignItems: 'stretch',
                                background: isSelected ? '#e8f0ff' : '#f7f9fc',
                                border: isSelected
                                  ? '1px solid #8eb2f3'
                                  : '1px solid #d8e1ef',
                                borderRadius: 8,
                                color: isSelected ? '#0f4eb8' : '#334155',
                                cursor: isSavingQuestion
                                  ? 'not-allowed'
                                  : 'pointer',
                                display: 'grid',
                                gap: 3,
                                padding: '8px 10px',
                                textAlign: 'left',
                              }}
                            >
                              <span
                                title={question.prompt}
                                style={{
                                  fontWeight: 700,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {question.prompt || 'Untitled question'}
                              </span>
                              <small style={{ color: '#687386' }}>
                                {question.difficulty} · {question.testingAngle} ·{' '}
                                {question.status}
                              </small>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className={styles.emptySelection}>No questions yet.</p>
                    )}
                  </div>

                  <label style={{ display: 'grid', gap: 8 }}>
                    <strong>Question</strong>
                    <textarea
                      className={styles.conceptEditor}
                      style={{ minHeight: 180 }}
                      value={questionPrompt}
                      disabled={isSavingQuestion}
                      onChange={(event) => {
                        setQuestionPrompt(event.target.value);
                        setQuestionStatus(null);
                      }}
                      placeholder="Front of card"
                      aria-label="Question front of card"
                    />
                  </label>

                  <label style={{ display: 'grid', gap: 8, marginTop: 18 }}>
                    <strong>Answer</strong>
                    <textarea
                      className={styles.conceptEditor}
                      style={{ minHeight: 180 }}
                      value={questionAnswer}
                      disabled={isSavingQuestion}
                      onChange={(event) => {
                        setQuestionAnswer(event.target.value);
                        setQuestionStatus(null);
                      }}
                      placeholder="Back of card"
                      aria-label="Answer back of card"
                    />
                  </label>
                </section>

                <section className={`${styles.panel} ${styles.topicPanel}`}>
                  <div>
                    <h2>2. Topic Tree</h2>
                    <p>Select the topic, then choose the concept this question tests.</p>
                  </div>

                  <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
                    <div
                      style={{
                        alignItems: 'center',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 8,
                      }}
                    >
                      <label className={styles.searchBox} style={{ flex: '1 1 220px' }}>
                        <span className={styles.srOnly}>Search concepts</span>
                        <input
                          value={questionConceptSearch}
                          onChange={(event) =>
                            setQuestionConceptSearch(event.target.value)
                          }
                          placeholder="Search concepts"
                        />
                        <Search size={20} />
                      </label>
                      <label
                        style={{
                          alignItems: 'center',
                          cursor: 'pointer',
                          display: 'flex',
                          fontSize: 14,
                          gap: 6,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={needsQuestionsOnly}
                          onChange={(event) =>
                            setNeedsQuestionsOnly(event.target.checked)
                          }
                        />
                        <span>Needs Questions</span>
                      </label>
                    </div>
                    {normalizedQuestionConceptSearch && (
                      <div
                        style={{
                          border: '1px solid #d8e1ef',
                          borderRadius: 12,
                          display: 'grid',
                          gap: 4,
                          padding: 8,
                        }}
                      >
                        {questionConceptSearchResults.length ? (
                          questionConceptSearchResults.map((option) => (
                            <button
                              className={styles.secondaryButton}
                              key={option.id}
                              type="button"
                              disabled={isSavingQuestion}
                              onClick={() => {
                                if (
                                  selectQuestionConcept(
                                    option.id,
                                    questionTopicId
                                  )
                                ) {
                                  setQuestionConceptSearch('');
                                }
                              }}
                              style={{
                                alignItems: 'flex-start',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'flex-start',
                                textAlign: 'left',
                              }}
                            >
                              <span>{option.name}</span>
                              <small style={{ color: '#687386' }}>
                                {questionConceptSearchPath
                                  ? `${questionConceptSearchPath} · `
                                  : ''}
                                {questionCountLabel(
                                  questionCountsByConceptId[option.id] || 0
                                )}
                              </small>
                            </button>
                          ))
                        ) : (
                          <p className={styles.emptySelection}>
                            No concepts match “{questionConceptSearch.trim()}”.
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className={styles.treeControls}>
                    <label className={styles.searchBox}>
                      <span className={styles.srOnly}>Search topics</span>
                      <input
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="Search topics..."
                      />
                      <Search size={20} />
                    </label>
                    <button
                      className={styles.toolButton}
                      type="button"
                      onClick={openAddDialog}
                      disabled={isMutatingTopic}
                    >
                      <Plus size={18} /> Add Subtopic
                    </button>
                    <button
                      className={styles.toolButton}
                      type="button"
                      onClick={openRenameDialog}
                      disabled={isMutatingTopic}
                    >
                      <Pencil size={17} /> Rename
                    </button>
                    <button
                      className={styles.toolButton}
                      type="button"
                      onClick={deleteActiveTopic}
                      disabled={isMutatingTopic}
                    >
                      <Trash2 size={17} /> Delete
                    </button>
                    <button
                      className={styles.toolButton}
                      type="button"
                      onClick={openMoveDialog}
                      disabled={isMutatingTopic}
                    >
                      <ArrowUpDown size={17} /> Move
                    </button>
                  </div>

                  {dialogMode && (
                    <div
                      className={styles.inlineDialog}
                      role="dialog"
                      aria-modal="false"
                    >
                      {dialogMode === 'move' ? (
                        <>
                          <label>
                            Move “{activeTopic?.name}” beneath
                            <select
                              value={moveDestinationId}
                              onChange={(event) =>
                                setMoveDestinationId(event.target.value)
                              }
                            >
                              {moveDestinations.map((destination) => (
                                <option
                                  key={destination.id}
                                  value={destination.id}
                                >
                                  {destination.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className={styles.dialogActions}>
                            <button
                              className={styles.secondaryButton}
                              type="button"
                              onClick={() => setDialogMode(null)}
                            >
                              Cancel
                            </button>
                            <button
                              className={styles.primaryButton}
                              type="button"
                              onClick={moveActiveTopic}
                              disabled={isMutatingTopic}
                            >
                              {isMutatingTopic ? 'Moving…' : 'Move'}
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <label>
                            {dialogMode === 'add'
                              ? `Add Subtopic beneath ${activeTopic?.name}`
                              : `Rename “${activeTopic?.name}”`}
                            <input
                              autoFocus
                              value={nameDraft}
                              onChange={(event) =>
                                setNameDraft(event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (
                                  event.key === 'Enter' &&
                                  !isMutatingTopic
                                ) {
                                  void saveNameDialog();
                                }
                              }}
                              placeholder={
                                dialogMode === 'add'
                                  ? 'Subtopic name'
                                  : 'Topic name'
                              }
                            />
                          </label>
                          <div className={styles.dialogActions}>
                            <button
                              className={styles.secondaryButton}
                              type="button"
                              onClick={() => setDialogMode(null)}
                            >
                              Cancel
                            </button>
                            <button
                              className={styles.primaryButton}
                              type="button"
                              onClick={saveNameDialog}
                              disabled={isMutatingTopic}
                            >
                              {isMutatingTopic ? 'Saving…' : 'Save'}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  <div className={styles.treeViewport} aria-label="Question Topic Tree">
                    {topics.map((topic) => renderQuestionTopic(topic))}
                    {normalizedSearch && searchIds.size === 0 && (
                      <div className={styles.emptyTree}>
                        No topics match “{searchQuery.trim()}”.
                      </div>
                    )}
                    {needsQuestionsOnly && needsQuestionTopicIds.size === 0 && (
                      <div className={styles.emptyTree}>
                        Every concept has at least one question.
                      </div>
                    )}
                  </div>

                </section>
              </div>

              <section className={`${styles.panel} ${styles.selectedPanel}`}>
                <div>
                  <h2>3. Additional Options</h2>
                  <p>Optional authoring details used by the question and future delivery logic.</p>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 16,
                    marginTop: 16,
                  }}
                >
                  <label style={{ display: 'grid', gap: 8 }}>
                    <strong>Difficulty</strong>
                    <select
                      value={questionDifficulty}
                      disabled={isSavingQuestion}
                      onChange={(event) => {
                        setQuestionDifficulty(event.target.value as QuestionDifficulty);
                        setQuestionStatus(null);
                      }}
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </label>

                  <label style={{ display: 'grid', gap: 8 }}>
                    <strong>Testing Angle</strong>
                    <select
                      value={questionTestingAngle}
                      disabled={isSavingQuestion}
                      onChange={(event) => {
                        setQuestionTestingAngle(event.target.value);
                        setQuestionStatus(null);
                      }}
                    >
                      {testingAngleOptions.map((angle) => (
                        <option key={angle} value={angle}>
                          {angle}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={{ display: 'grid', gap: 8 }}>
                    <strong>Status</strong>
                    <select
                      aria-label="Question status"
                      value={questionRecordStatus}
                      disabled={!questionId || isSavingQuestion}
                      onChange={(event) => {
                        setQuestionRecordStatus(
                          event.target.value as LifecycleStatus
                        );
                        setQuestionStatus(null);
                      }}
                    >
                      <option value="draft">Draft</option>
                      <option value="published">Published</option>
                      <option value="archived">Archived</option>
                    </select>
                  </label>
                </div>

                <div
                  style={{
                    borderTop: '1px solid #e2e8f0',
                    marginTop: 16,
                    paddingTop: 16,
                  }}
                >
                  <strong>Tags</strong>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 8,
                      margin: '10px 0',
                    }}
                  >
                    {questionTags.length ? (
                      questionTags.map((tag) => (
                        <div className={styles.topicChip} key={tag.id}>
                          <span>
                            {tag.name}
                            {tag.status === 'archived' ? ' (Archived)' : ''}
                          </span>
                          <button
                            type="button"
                            disabled={isSavingQuestion}
                            onClick={() => removeQuestionTag(tag.id)}
                            aria-label={`Remove ${tag.name} tag`}
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className={styles.emptySelection}>No tags added yet.</p>
                    )}
                  </div>
                  <div
                    style={{
                      alignItems: 'center',
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 8,
                    }}
                  >
                    <label className={styles.searchBox} style={{ maxWidth: 360 }}>
                      <span className={styles.srOnly}>Add a question tag</span>
                      <input
                        value={questionTagDraft}
                        list="question-tag-options"
                        disabled={isSavingQuestion}
                        onChange={(event) => {
                          setQuestionTagDraft(event.target.value);
                          setQuestionTagStatus(null);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            addQuestionTag();
                          }
                        }}
                        placeholder="Search tags"
                      />
                    </label>
                    <datalist id="question-tag-options">
                      {activeCatalogTags
                        .filter(
                          (tag) =>
                            !questionTags.some(
                              (selected) => selected.id === tag.id
                            )
                        )
                        .map((tag) => (
                          <option key={tag.id} value={tag.name} />
                        ))}
                    </datalist>
                    <button
                      className={styles.toolButton}
                      type="button"
                      disabled={isSavingQuestion}
                      onClick={addQuestionTag}
                    >
                      <Plus size={18} /> Add Tag
                    </button>
                  </div>
                  {questionTagStatus && (
                    <div
                      className={`${styles.referenceStatus} ${styles[questionTagStatus.tone]}`}
                      role="status"
                      aria-live="polite"
                      style={{ marginTop: 10 }}
                    >
                      {questionTagStatus.message}
                    </div>
                  )}
                </div>
              </section>

              <footer className={styles.bottomActions}>
                <div className={styles.infoMessage}>
                  <Info size={22} />
                  <span>Questions are saved as draft short-answer cards for the selected concept.</span>
                </div>
              </footer>

              {questionStatus && (
                <div
                  className={`${styles.status} ${styles[questionStatus.tone]}`}
                  role="status"
                  aria-live="polite"
                >
                  {questionStatus.message}
                </div>
              )}
            </>
          ) : null}
        </section>
      </main>
    </>
  );
}
