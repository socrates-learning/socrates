'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Folder,
  Info,
  Menu,
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
  references: Reference[]
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
  });
}

export function CreatorStudioV2Client({
  activeLibraryId = null,
  initialTopics,
  initialConcept,
  initialReferences = [],
}: CreatorStudioV2ClientProps = {}) {
  const router = useRouter();
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
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [moveDestinationId, setMoveDestinationId] = useState('');
  const [status, setStatus] = useState<Status>(null);
  const [references, setReferences] = useState<Reference[]>(initialReferences);
  const [referenceDraft, setReferenceDraft] = useState<ReferenceDraft>(
    emptyReferenceDraft
  );
  const [editingReferenceId, setEditingReferenceId] = useState<string | null>(null);
  const [pendingRemovalId, setPendingRemovalId] = useState<string | null>(null);
  const [referenceStatus, setReferenceStatus] = useState<Status>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isMutatingTopic, setIsMutatingTopic] = useState(false);
  const [isCreatorMenuOpen, setIsCreatorMenuOpen] = useState(false);
  const [savedDraftFingerprint, setSavedDraftFingerprint] = useState(() =>
    draftFingerprint(
      resolvedConcept.bodyMarkdown,
      resolvedConcept.placementIds,
      initialReferences
    )
  );
  const editingReference = editingReferenceId
    ? references.find((reference) => reference.id === editingReferenceId) || null
    : null;
  const isEditingPersistedReference = Boolean(editingReference?.sourceId);
  const currentDraftFingerprint = useMemo(
    () => draftFingerprint(concept, selectedTopicIds, references),
    [concept, references, selectedTopicIds]
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
  const isDirty =
    currentDraftFingerprint !== savedDraftFingerprint ||
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
    setReferenceDraft(emptyReferenceDraft);
    setEditingReferenceId(null);
    setPendingRemovalId(null);
    setReferenceStatus(null);
    setStatus(null);
  }

  function navigateFromCreator(destination: string) {
    if (window.location.pathname === destination) {
      setIsCreatorMenuOpen(false);
      return;
    }

    if (
      isDirty &&
      !window.confirm('You have unsaved changes. Leave without saving?')
    ) {
      return;
    }

    setIsCreatorMenuOpen(false);
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
        confirmedReferences
      )
    );

    showStatus('success', 'Concept draft and references saved.');

    if (wasNewConcept) {
      router.replace(`/creator/concepts/${savedConceptId}`);
    } else {
      router.refresh();
    }
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
                onClick={saveConcept}
                disabled={isSaving}
              >
                {isSaving ? 'Saving…' : 'Save Concept'}
              </button>
              <div className={styles.creatorMenu}>
                <button
                  className={styles.menuButton}
                  type="button"
                  title="Creator Studio navigation"
                  aria-label="Open Creator Studio navigation"
                  aria-expanded={isCreatorMenuOpen}
                  aria-haspopup="menu"
                  onClick={() => setIsCreatorMenuOpen((current) => !current)}
                >
                  <Menu size={27} />
                </button>
                {isCreatorMenuOpen && (
                  <div
                    className={styles.creatorMenuPanel}
                    role="menu"
                    aria-label="Creator Studio navigation"
                  >
                    <p className={styles.creatorMenuHeading}>Concepts</p>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => navigateFromCreator('/creator/concepts')}
                    >
                      Browse Concepts
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => navigateFromCreator('/creator/concepts/new')}
                    >
                      New Concept
                    </button>
                    <p className={styles.creatorMenuHeading}>Articles</p>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => navigateFromCreator('/creator/articles')}
                    >
                      Browse Articles
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => navigateFromCreator('/creator/articles/new')}
                    >
                      New Article
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          <div className={styles.mainGrid}>
            <section className={`${styles.panel} ${styles.conceptPanel}`}>
              <div>
                <h2>1. Concept / Explanation</h2>
                <p>Main concept creation space.</p>
              </div>
              <textarea
                className={styles.conceptEditor}
                value={concept}
                onChange={(event) => {
                  setConcept(event.target.value);
                  setStatus(null);
                }}
                placeholder="Write your concept or explanation here..."
                aria-label="Concept or explanation"
              />
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
            <button
              className={`${styles.primaryButton} ${styles.largeSaveButton}`}
              type="button"
              onClick={saveConcept}
              disabled={isSaving}
            >
              {isSaving ? 'Saving…' : 'Save Concept'}
            </button>
          </footer>

          {status && (
            <div className={`${styles.status} ${styles[status.tone]}`} role="status" aria-live="polite">
              {status.message}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
