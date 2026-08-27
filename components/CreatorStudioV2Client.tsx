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
};
type QuestionConceptOption = {
  id: string;
  name: string;
};

type CreatorTab = 'content' | 'questions';
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
  tagNames: Iterable<string>
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
    tags: Array.from(tagNames).map(tagIdentity).sort(),
  });
}

function questionDraftFingerprint({
  questionId,
  conceptId,
  prompt,
  answer,
  explanation,
  difficulty,
  testingAngle,
}: {
  questionId: string | null;
  conceptId: string | null;
  prompt: string;
  answer: string;
  explanation: string;
  difficulty: QuestionDifficulty;
  testingAngle: string;
}) {
  return JSON.stringify({
    questionId,
    conceptId,
    prompt,
    answer,
    explanation,
    difficulty,
    testingAngle,
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
  const [questionId, setQuestionId] = useState<string | null>(null);
  const [questionConceptId, setQuestionConceptId] = useState<string | null>(
    resolvedConcept.id
  );
  const [questionTopicId, setQuestionTopicId] = useState(activeTopicId);
  const [questionConceptOptions, setQuestionConceptOptions] = useState<
    QuestionConceptOption[]
  >([]);
  const [isLoadingQuestionConcepts, setIsLoadingQuestionConcepts] = useState(false);
  const [questionPrompt, setQuestionPrompt] = useState('');
  const [questionAnswer, setQuestionAnswer] = useState('');
  const [questionExplanation, setQuestionExplanation] = useState('');
  const [questionDifficulty, setQuestionDifficulty] =
    useState<QuestionDifficulty>('medium');
  const [questionTestingAngle, setQuestionTestingAngle] = useState(
    'General Understanding'
  );
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
      []
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
        conceptTags.map((tag) => tag.name)
      ),
    [concept, conceptTags, references, selectedTopicIds]
  );
  const currentQuestionFingerprint = useMemo(
    () =>
      questionDraftFingerprint({
        questionId,
        conceptId: questionConceptId,
        prompt: questionPrompt,
        answer: questionAnswer,
        explanation: questionExplanation,
        difficulty: questionDifficulty,
        testingAngle: questionTestingAngle,
      }),
    [
      questionAnswer,
      questionConceptId,
      questionDifficulty,
      questionExplanation,
      questionId,
      questionPrompt,
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
      questionExplanation.trim() ||
      questionDifficulty !== 'medium' ||
      questionTestingAngle.trim() !== 'General Understanding'
  );
  const isQuestionDirty =
    hasQuestionDraft && currentQuestionFingerprint !== savedQuestionFingerprint;
  const isDirty =
    currentDraftFingerprint !== savedDraftFingerprint ||
    isQuestionDirty ||
    hasPendingReferenceDraft;

  useEffect(() => {
    if (!isDirty) return;

    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }

    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (!resolvedConcept.id || !activeLibraryId) return;

    let isMounted = true;

    async function loadConceptTags() {
      const { data, error } = await supabase.rpc('get_concept_tags', {
        p_concept_id: resolvedConcept.id,
      });

      if (!isMounted) return;

      if (error) {
        setTagStatus({
          tone: 'error',
          message: 'Tags could not be loaded for this concept.',
        });
        return;
      }

      const loadedTags = ((data || []) as ConceptTag[]).map((tag) => ({
        id: tag.id,
        name: tag.name,
        slug: tag.slug,
      }));

      setConceptTags(loadedTags);
      setSavedDraftFingerprint(
        draftFingerprint(
          resolvedConcept.bodyMarkdown,
          resolvedConcept.placementIds,
          initialReferences,
          loadedTags.map((tag) => tag.name)
        )
      );
    }

    loadConceptTags();

    return () => {
      isMounted = false;
    };
  }, [
    activeLibraryId,
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
      setIsLoadingQuestionConcepts(true);
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
        setIsLoadingQuestionConcepts(false);
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
      setIsLoadingQuestionConcepts(false);
    }

    void loadQuestionConcepts();

    return () => {
      isMounted = false;
    };
  }, [activeLibraryId, questionTopicId, resolvedConcept.id]);

  const rootTopicId = topics[0]?.id || ROOT_TOPIC_ID;
  const activeTopic = activeTopicId
    ? findTopic(topics, activeTopicId)
    : null;
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
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

  function showStatus(tone: StatusTone, message: string) {
    setStatus({ tone, message });
  }

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

    if (conceptTags.some((tag) => tagIdentity(tag.name) === tagIdentity(name))) {
      setTagStatus({ tone: 'info', message: 'That tag is already added.' });
      setTagDraft('');
      return;
    }

    setConceptTags((current) => [
      ...current,
      {
        id: `draft-tag-${globalThis.crypto.randomUUID()}`,
        name,
        slug: tagIdentity(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      },
    ]);
    setTagDraft('');
    setTagStatus(null);
    setStatus(null);
  }

  function removeTag(tagId: string) {
    setConceptTags((current) => current.filter((tag) => tag.id !== tagId));
    setTagStatus(null);
    setStatus(null);
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

    setTopics((current) => removeTopic(current, activeTopic.id));
    setSelectedTopicIds((current) => {
      const next = new Set(current);
      next.delete(activeTopic.id);
      return next;
    });
    setActiveTopicId('');
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

    router.push(destination);
  }

  function openConceptBrowser() {
    navigateFromCreator('/creator/concepts');
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
    const tagNamesToSave = conceptTags.map((tag) => tag.name);
    const name =
      conceptName.trim() || conceptNameFromMarkdown(bodyMarkdownToSave);
    setIsSaving(true);
    setStatus(null);

    const { data, error } = await supabase.rpc('save_concept_draft', {
      p_concept_id: conceptId,
      p_name: name,
      p_body_markdown: bodyMarkdownToSave,
      p_active_library_id: activeLibraryId,
      p_library_node_ids: placementIdsToSave,
      p_tag_names: tagNamesToSave,
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

    const { data: referenceData, error: referenceError } = await supabase.rpc(
      'sync_concept_references',
      {
        p_concept_id: savedConceptId,
        p_references: referencesToSave.map((reference) => ({
          client_id: reference.id,
          source_id: reference.sourceId,
          title: reference.title,
          author: reference.author,
          url: reference.url,
          note: reference.notes,
        })),
      }
    );

    setIsSaving(false);

    if (referenceError) {
      showStatus(
        'error',
        `Concept draft saved, but references could not be saved: ${referenceError.message}`
      );
      return;
    }

    const synchronizedReferences = (
      referenceData as {
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
        tagNamesToSave
      )
    );

    showStatus('success', 'Concept draft and references saved.');

    if (wasNewConcept) {
      router.replace(`/creator/concepts/${savedConceptId}`);
    } else {
      router.refresh();
    }
  }

  async function saveQuestion() {
    const prompt = questionPrompt.trim();
    const answer = questionAnswer.trim();
    const explanation = questionExplanation.trim();
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
      p_explanation: explanation || null,
      p_review_article_concept_id: null,
      p_sort_order: 0,
      p_difficulty: questionDifficulty,
      p_testing_angle: testingAngle,
    };

    let savedQuestionId = questionId;

    if (questionId) {
      const { data, error } = await supabase.rpc('update_question', {
        p_question_id: questionId,
        ...questionPayload,
        p_status: 'draft',
      });

      if (error) {
        setIsSavingQuestion(false);
        setQuestionStatus({
          tone: 'error',
          message: error.message || 'Question could not be updated.',
        });
        return;
      }

      savedQuestionId = (data as { id?: string } | null)?.id || questionId;
    } else {
      const { data, error } = await supabase.rpc('create_question', {
        p_concept_id: questionConceptId,
        ...questionPayload,
      });

      if (error) {
        setIsSavingQuestion(false);
        setQuestionStatus({
          tone: 'error',
          message: error.message || 'Question could not be created.',
        });
        return;
      }

      savedQuestionId = (data as { id?: string } | null)?.id || null;
      if (!savedQuestionId) {
        setIsSavingQuestion(false);
        setQuestionStatus({
          tone: 'error',
          message: 'Question was saved without a returned identifier.',
        });
        return;
      }
      setQuestionId(savedQuestionId);
    }

    const { error: answerError } = await supabase.rpc(
      'replace_question_accepted_answers',
      {
        p_question_id: savedQuestionId,
        p_answers: [{ answer_text: answer, sort_order: 0 }],
      }
    );

    if (answerError) {
      setIsSavingQuestion(false);
      setQuestionStatus({
        tone: 'error',
        message: `Question saved, but the answer could not be saved: ${answerError.message}`,
      });
      return;
    }

    const nextFingerprint = questionDraftFingerprint({
      questionId: savedQuestionId,
      conceptId: questionConceptId,
      prompt,
      answer,
      explanation,
      difficulty: questionDifficulty,
      testingAngle,
    });

    setQuestionPrompt(prompt);
    setQuestionAnswer(answer);
    setQuestionExplanation(explanation);
    setQuestionTestingAngle(testingAngle);
    setSavedQuestionFingerprint(nextFingerprint);
    setIsSavingQuestion(false);
    setQuestionStatus({
      tone: 'success',
      message: questionId ? 'Question updated.' : 'Question saved.',
    });
  }

  function renderQuestionTopic(topic: Topic, depth = 0) {
    const searching = Boolean(normalizedSearch);
    if (searching && !searchIds.has(topic.id)) return null;
    const hasChildren = topic.children.length > 0;
    const hasVisibleChild = topic.children.some((child) => searchIds.has(child.id));
    const isExpanded = searching ? hasVisibleChild : expandedTopicIds.has(topic.id);
    const isActive = questionTopicId === topic.id;

    return (
      <div className={styles.topicBranch} key={`question-${topic.id}`}>
        <div
          className={`${styles.topicRow} ${isActive ? styles.activeTopicRow : ''}`}
          style={{ paddingLeft: `${12 + depth * 38}px` }}
          onClick={() => {
            if (questionId) return;
            setQuestionTopicId(topic.id);
            setQuestionStatus(null);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (!questionId && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault();
              setQuestionTopicId(topic.id);
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
        </div>
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
              <button
                className={styles.primaryButton}
                type="button"
                onClick={activeCreatorTab === 'content' ? saveConcept : saveQuestion}
                disabled={
                  activeCreatorTab === 'content' ? isSaving : isSavingQuestion
                }
              >
                {activeCreatorTab === 'content'
                  ? isSaving
                    ? 'Saving…'
                    : 'Save Concept'
                  : isSavingQuestion
                    ? 'Saving…'
                    : questionId
                      ? 'Save Changes'
                      : 'Save Question'}
              </button>
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
            {(['content', 'questions'] as const).map((tab) => {
              const isActive = activeCreatorTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveCreatorTab(tab)}
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
                  {tab === 'content' ? 'Content' : 'Questions'}
                </button>
              );
            })}
          </nav>

          {activeCreatorTab === 'content' ? (
            <>
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
                      <span>{tag.name}</span>
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
                    placeholder="Add a tag..."
                  />
                </label>
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
          ) : (
            <>
              <div className={styles.mainGrid}>
                <section className={`${styles.panel} ${styles.conceptPanel}`}>
                  <div>
                    <h2>1. Question / Answer</h2>
                    <p>Create the front and back of the study card.</p>
                  </div>

                  <label style={{ display: 'grid', gap: 8 }}>
                    <strong>Question</strong>
                    <textarea
                      className={styles.conceptEditor}
                      style={{ minHeight: 180 }}
                      value={questionPrompt}
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
                  </div>

                  <div className={styles.treeViewport} aria-label="Question Topic Tree">
                    {topics.map((topic) => renderQuestionTopic(topic))}
                    {normalizedSearch && searchIds.size === 0 && (
                      <div className={styles.emptyTree}>
                        No topics match “{searchQuery.trim()}”.
                      </div>
                    )}
                  </div>

                  <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 16, paddingTop: 16 }}>
                    <label style={{ display: 'grid', gap: 8 }}>
                      <strong>Concept</strong>
                      <select
                        value={questionConceptId || ''}
                        disabled={
                          Boolean(questionId) ||
                          isLoadingQuestionConcepts ||
                          !questionConceptOptions.length
                        }
                        onChange={(event) => {
                          setQuestionConceptId(event.target.value || null);
                          setQuestionStatus(null);
                        }}
                      >
                        <option value="">
                          {isLoadingQuestionConcepts
                            ? 'Loading concepts…'
                            : questionConceptOptions.length
                              ? 'Choose a concept…'
                              : 'No concepts in this topic'}
                        </option>
                        {questionConceptOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                      {questionId && (
                        <small style={{ color: '#687386' }}>
                          The concept is fixed after the question&apos;s first save.
                        </small>
                      )}
                    </label>
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
                    <input
                      value={questionTestingAngle}
                      onChange={(event) => {
                        setQuestionTestingAngle(event.target.value);
                        setQuestionStatus(null);
                      }}
                      placeholder="General Understanding"
                    />
                  </label>
                </div>

                <label style={{ display: 'grid', gap: 8, marginTop: 18 }}>
                  <strong>Explanation (optional)</strong>
                  <textarea
                    value={questionExplanation}
                    onChange={(event) => {
                      setQuestionExplanation(event.target.value);
                      setQuestionStatus(null);
                    }}
                    rows={4}
                    placeholder="Explain why the answer is correct..."
                  />
                </label>
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
          )}
        </section>
      </main>
    </>
  );
}
