'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './StudyCreatorClient.module.css';

type PersonalTopic = {
  id: string;
  owner_id: string;
  parent_id: string | null;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type PersonalConcept = {
  id: string;
  owner_id: string;
  topic_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

type PersonalCard = {
  id: string;
  owner_id: string;
  concept_id: string;
  question: string;
  answer: string;
  created_at: string;
  updated_at: string;
};

type StudyCreatorClientProps = {
  ownerId: string;
};

type EditorModal =
  | { kind: 'topic'; record: PersonalTopic | null }
  | { kind: 'concept'; record: PersonalConcept | null }
  | { kind: 'card'; record: PersonalCard | null };

type DeleteTarget =
  | { kind: 'topic'; record: PersonalTopic }
  | { kind: 'concept'; record: PersonalConcept }
  | { kind: 'card'; record: PersonalCard };

type IconName =
  | 'book'
  | 'card'
  | 'chevron-down'
  | 'chevron-right'
  | 'folder'
  | 'more'
  | 'pencil'
  | 'search'
  | 'trash';

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v14H6.5A2.5 2.5 0 0 0 4 19.5z" /><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v14h4.5a2.5 2.5 0 0 1 2.5 2.5z" /></>,
    card: <><path d="M6 2.75h8l4 4V21.25H6z" /><path d="M14 2.75v4h4M9 12h6M9 16h6" /></>,
    'chevron-down': <path d="m7 9.5 5 5 5-5" />,
    'chevron-right': <path d="m9.5 7 5 5-5 5" />,
    folder: <path d="M3 6.5h6l2-2h4.5A2.5 2.5 0 0 1 18 7v1H5.5A2.5 2.5 0 0 0 3 10.5zm0 4A2.5 2.5 0 0 1 5.5 8H21l-2 11.5H3z" />,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    pencil: <><path d="m4 20 4.25-1 10.5-10.5-3.25-3.25L5 15.75z" /><path d="m13.75 7 3.25 3.25" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 4 4" /></>,
    trash: <><path d="M4 7h16M9 3h6l1 4H8zM6 7l1 14h10l1-14M10 11v6M14 11v6" /></>,
  };

  return (
    <svg aria-hidden="true" className={styles.svgIcon} fill="none" viewBox="0 0 24 24">
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">
        {paths[name]}
      </g>
    </svg>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'message' in error) {
    return String(error.message);
  }
  return 'Something went wrong. Please try again.';
}

export function StudyCreatorClient({ ownerId }: StudyCreatorClientProps) {
  const [topics, setTopics] = useState<PersonalTopic[]>([]);
  const [concepts, setConcepts] = useState<PersonalConcept[]>([]);
  const [cards, setCards] = useState<PersonalCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);
  const [expandedTopicIds, setExpandedTopicIds] = useState<Set<string>>(new Set());
  const [topicSearch, setTopicSearch] = useState('');
  const [centerTab, setCenterTab] = useState<'concepts' | 'details'>('concepts');
  const [rightTab, setRightTab] = useState<'details' | 'cards'>('cards');
  const [topicMenuId, setTopicMenuId] = useState<string | null>(null);
  const [conceptMenuId, setConceptMenuId] = useState<string | null>(null);
  const [cardMenuId, setCardMenuId] = useState<string | null>(null);

  const [editorModal, setEditorModal] = useState<EditorModal | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [topicName, setTopicName] = useState('');
  const [topicParentId, setTopicParentId] = useState('');
  const [conceptName, setConceptName] = useState('');
  const [conceptDescription, setConceptDescription] = useState('');
  const [conceptTopicId, setConceptTopicId] = useState('');
  const [cardQuestion, setCardQuestion] = useState('');
  const [cardAnswer, setCardAnswer] = useState('');
  const [cardConceptId, setCardConceptId] = useState('');
  const dialogRef = useRef<HTMLElement | null>(null);
  const modalOpenerRef = useRef<HTMLElement | null>(null);

  const loadMaterial = useCallback(async () => {
    setError('');
    const [topicResult, conceptResult, cardResult] = await Promise.all([
      supabase
        .from('personal_topics')
        .select('id, owner_id, parent_id, name, sort_order, created_at, updated_at')
        .eq('owner_id', ownerId)
        .order('sort_order')
        .order('created_at'),
      supabase
        .from('personal_concepts')
        .select('id, owner_id, topic_id, name, description, created_at, updated_at')
        .eq('owner_id', ownerId)
        .order('created_at'),
      supabase
        .from('personal_cards')
        .select('id, owner_id, concept_id, question, answer, created_at, updated_at')
        .eq('owner_id', ownerId)
        .order('created_at'),
    ]);

    const loadError = topicResult.error || conceptResult.error || cardResult.error;
    if (loadError) {
      setError(getErrorMessage(loadError));
      setIsLoading(false);
      return null;
    }

    const nextTopics = (topicResult.data ?? []) as PersonalTopic[];
    const nextConcepts = (conceptResult.data ?? []) as PersonalConcept[];
    const nextCards = (cardResult.data ?? []) as PersonalCard[];
    setTopics(nextTopics);
    setConcepts(nextConcepts);
    setCards(nextCards);
    setIsLoading(false);
    return { topics: nextTopics, concepts: nextConcepts, cards: nextCards };
  }, [ownerId]);

  useEffect(() => {
    loadMaterial();
  }, [loadMaterial]);

  useEffect(() => {
    if (!topics.length) {
      setSelectedTopicId(null);
      return;
    }
    if (!selectedTopicId || !topics.some((topic) => topic.id === selectedTopicId)) {
      const firstTopic = topics.find((topic) => topic.parent_id === null) ?? topics[0];
      setSelectedTopicId(firstTopic.id);
      setExpandedTopicIds((current) => new Set(current).add(firstTopic.id));
    }
  }, [selectedTopicId, topics]);

  const topicsById = useMemo(
    () => new Map(topics.map((topic) => [topic.id, topic])),
    [topics]
  );

  const topicLabel = useCallback(
    (topicId: string) => {
      const names: string[] = [];
      const visited = new Set<string>();
      let topic = topicsById.get(topicId);
      while (topic && !visited.has(topic.id)) {
        visited.add(topic.id);
        names.unshift(topic.name);
        topic = topic.parent_id ? topicsById.get(topic.parent_id) : undefined;
      }
      return names.join(' › ') || 'Unplaced';
    },
    [topicsById]
  );

  const orderedTopics = useMemo(
    () => [...topics].sort((a, b) => topicLabel(a.id).localeCompare(topicLabel(b.id))),
    [topicLabel, topics]
  );

  const selectedTopic = selectedTopicId ? topicsById.get(selectedTopicId) ?? null : null;
  const selectedTopicConcepts = useMemo(
    () => concepts.filter((concept) => concept.topic_id === selectedTopicId),
    [concepts, selectedTopicId]
  );

  useEffect(() => {
    if (!selectedTopicConcepts.length) {
      setSelectedConceptId(null);
      return;
    }
    if (
      !selectedConceptId ||
      !selectedTopicConcepts.some((concept) => concept.id === selectedConceptId)
    ) {
      setSelectedConceptId(selectedTopicConcepts[0].id);
    }
  }, [selectedConceptId, selectedTopicConcepts]);

  const selectedConcept = selectedConceptId
    ? concepts.find((concept) => concept.id === selectedConceptId) ?? null
    : null;
  const selectedConceptCards = useMemo(
    () => cards.filter((card) => card.concept_id === selectedConceptId),
    [cards, selectedConceptId]
  );

  function clearFeedback() {
    setMessage('');
    setError('');
  }

  function closeMenus() {
    setTopicMenuId(null);
    setConceptMenuId(null);
    setCardMenuId(null);
  }

  function rememberModalOpener() {
    modalOpenerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  }

  function closeEditor() {
    if (!isSaving) setEditorModal(null);
  }

  function closeDeleteConfirmation() {
    if (!isSaving) setDeleteTarget(null);
  }

  function toggleMenu(kind: 'topic' | 'concept' | 'card', id: string) {
    const isOpen =
      (kind === 'topic' && topicMenuId === id) ||
      (kind === 'concept' && conceptMenuId === id) ||
      (kind === 'card' && cardMenuId === id);
    closeMenus();
    if (isOpen) return;
    if (kind === 'topic') setTopicMenuId(id);
    if (kind === 'concept') setConceptMenuId(id);
    if (kind === 'card') setCardMenuId(id);
  }

  useEffect(() => {
    if (!topicMenuId && !conceptMenuId && !cardMenuId) return;
    function dismissMenu(event: PointerEvent | KeyboardEvent) {
      if (event instanceof KeyboardEvent) {
        if (event.key === 'Escape') closeMenus();
        return;
      }
      if (!(event.target instanceof Element) || !event.target.closest('[data-overflow-menu]')) {
        closeMenus();
      }
    }
    document.addEventListener('pointerdown', dismissMenu);
    document.addEventListener('keydown', dismissMenu);
    return () => {
      document.removeEventListener('pointerdown', dismissMenu);
      document.removeEventListener('keydown', dismissMenu);
    };
  }, [cardMenuId, conceptMenuId, topicMenuId]);

  useEffect(() => {
    closeMenus();
  }, [centerTab, rightTab, selectedConceptId, selectedTopicId]);

  useEffect(() => {
    const modalIsOpen = Boolean(editorModal || deleteTarget);
    if (!modalIsOpen) {
      const opener = modalOpenerRef.current;
      modalOpenerRef.current = null;
      opener?.focus();
      return;
    }

    function handleModalKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && editorModal && !isSaving) {
        event.preventDefault();
        setEditorModal(null);
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        )
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleModalKeyDown);
    return () => document.removeEventListener('keydown', handleModalKeyDown);
  }, [deleteTarget, editorModal, isSaving]);

  function descendantTopicIds(topicId: string, includeSelf = false) {
    const found = new Set<string>(includeSelf ? [topicId] : []);
    const queue = [topicId];
    while (queue.length) {
      const parentId = queue.shift();
      topics.forEach((topic) => {
        if (topic.parent_id === parentId && !found.has(topic.id)) {
          found.add(topic.id);
          queue.push(topic.id);
        }
      });
    }
    return found;
  }

  function topicCounts(topicId: string) {
    const branchIds = descendantTopicIds(topicId, true);
    const branchConcepts = concepts.filter((concept) => branchIds.has(concept.topic_id));
    const conceptIds = new Set(branchConcepts.map((concept) => concept.id));
    return {
      concepts: branchConcepts.length,
      cards: cards.filter((card) => conceptIds.has(card.concept_id)).length,
    };
  }

  const normalizedSearch = topicSearch.trim().toLowerCase();

  function topicMatchesSearch(topic: PersonalTopic) {
    if (!normalizedSearch) return true;
    const branchIds = descendantTopicIds(topic.id, true);
    if (topicLabel(topic.id).toLowerCase().includes(normalizedSearch)) return true;
    const branchConcepts = concepts.filter((concept) => branchIds.has(concept.topic_id));
    const conceptIds = new Set(branchConcepts.map((concept) => concept.id));
    return (
      branchConcepts.some(
        (concept) =>
          concept.name.toLowerCase().includes(normalizedSearch) ||
          (concept.description ?? '').toLowerCase().includes(normalizedSearch)
      ) ||
      cards.some(
        (card) =>
          conceptIds.has(card.concept_id) &&
          (card.question.toLowerCase().includes(normalizedSearch) ||
            card.answer.toLowerCase().includes(normalizedSearch))
      )
    );
  }

  function selectTopic(topic: PersonalTopic) {
    clearFeedback();
    closeMenus();
    setSelectedTopicId(topic.id);
    setExpandedTopicIds((current) => new Set(current).add(topic.id));
    setCenterTab('concepts');
    setRightTab('cards');
  }

  function selectConcept(concept: PersonalConcept) {
    clearFeedback();
    closeMenus();
    setSelectedTopicId(concept.topic_id);
    setExpandedTopicIds((current) => new Set(current).add(concept.topic_id));
    setSelectedConceptId(concept.id);
    setCenterTab('concepts');
    setRightTab('cards');
  }

  function toggleTopic(topicId: string) {
    setExpandedTopicIds((current) => {
      const next = new Set(current);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
  }

  function openTopicEditor(record: PersonalTopic | null, parentId = '') {
    clearFeedback();
    closeMenus();
    rememberModalOpener();
    setTopicName(record?.name ?? '');
    setTopicParentId(record?.parent_id ?? parentId);
    setEditorModal({ kind: 'topic', record });
  }

  function openConceptEditor(record: PersonalConcept | null) {
    clearFeedback();
    closeMenus();
    rememberModalOpener();
    setConceptName(record?.name ?? '');
    setConceptDescription(record?.description ?? '');
    setConceptTopicId(record?.topic_id ?? selectedTopicId ?? topics[0]?.id ?? '');
    setEditorModal({ kind: 'concept', record });
  }

  function openCardEditor(record: PersonalCard | null, defaultConceptId = '') {
    clearFeedback();
    closeMenus();
    rememberModalOpener();
    setCardQuestion(record?.question ?? '');
    setCardAnswer(record?.answer ?? '');
    setCardConceptId(record?.concept_id ?? (defaultConceptId || selectedConceptId || concepts[0]?.id || ''));
    setEditorModal({ kind: 'card', record });
  }

  async function saveTopic(event: React.FormEvent) {
    event.preventDefault();
    if (!editorModal || editorModal.kind !== 'topic' || !topicName.trim()) return;
    setIsSaving(true);
    clearFeedback();
    const values = {
      owner_id: ownerId,
      name: topicName.trim(),
      parent_id: topicParentId || null,
    };
    const result = editorModal.record
      ? await supabase
          .from('personal_topics')
          .update(values)
          .eq('id', editorModal.record.id)
          .eq('owner_id', ownerId)
          .select('id')
          .single()
      : await supabase.from('personal_topics').insert(values).select('id').single();

    if (result.error) {
      setError(getErrorMessage(result.error));
    } else {
      await loadMaterial();
      setSelectedTopicId(result.data.id);
      setExpandedTopicIds((current) => {
        const next = new Set(current).add(result.data.id);
        if (topicParentId) next.add(topicParentId);
        return next;
      });
      setEditorModal(null);
      setMessage(editorModal.record ? 'Topic updated.' : 'Topic created.');
    }
    setIsSaving(false);
  }

  async function saveConcept(event: React.FormEvent) {
    event.preventDefault();
    if (
      !editorModal ||
      editorModal.kind !== 'concept' ||
      !conceptName.trim() ||
      !conceptTopicId
    ) return;
    setIsSaving(true);
    clearFeedback();
    const values = {
      owner_id: ownerId,
      topic_id: conceptTopicId,
      name: conceptName.trim(),
      description: conceptDescription.trim() || null,
    };
    const result = editorModal.record
      ? await supabase
          .from('personal_concepts')
          .update(values)
          .eq('id', editorModal.record.id)
          .eq('owner_id', ownerId)
          .select('id')
          .single()
      : await supabase.from('personal_concepts').insert(values).select('id').single();

    if (result.error) {
      setError(getErrorMessage(result.error));
    } else {
      await loadMaterial();
      setSelectedTopicId(conceptTopicId);
      setSelectedConceptId(result.data.id);
      setEditorModal(null);
      setRightTab(editorModal.record ? rightTab : 'cards');
      setMessage(editorModal.record ? 'Concept updated.' : 'Concept created. Add its first Card.');
    }
    setIsSaving(false);
  }

  async function saveCard(event: React.FormEvent) {
    event.preventDefault();
    if (
      !editorModal ||
      editorModal.kind !== 'card' ||
      !cardQuestion.trim() ||
      !cardAnswer.trim() ||
      !cardConceptId
    ) return;
    setIsSaving(true);
    clearFeedback();
    const values = {
      owner_id: ownerId,
      concept_id: cardConceptId,
      question: cardQuestion.trim(),
      answer: cardAnswer.trim(),
    };
    const result = editorModal.record
      ? await supabase
          .from('personal_cards')
          .update(values)
          .eq('id', editorModal.record.id)
          .eq('owner_id', ownerId)
          .select('id')
          .single()
      : await supabase.from('personal_cards').insert(values).select('id').single();

    if (result.error) {
      setError(getErrorMessage(result.error));
    } else {
      const next = await loadMaterial();
      const concept = next?.concepts.find((item) => item.id === cardConceptId);
      if (concept) setSelectedTopicId(concept.topic_id);
      setSelectedConceptId(cardConceptId);
      setRightTab('cards');
      setEditorModal(null);
      setMessage(editorModal.record ? 'Card updated.' : 'Card created.');
    }
    setIsSaving(false);
  }

  async function moveSelectedTopic(parentId: string) {
    if (!selectedTopic) return;
    clearFeedback();
    const { error: moveError } = await supabase
      .from('personal_topics')
      .update({ parent_id: parentId || null })
      .eq('id', selectedTopic.id)
      .eq('owner_id', ownerId);
    if (moveError) setError(getErrorMessage(moveError));
    else {
      await loadMaterial();
      setMessage('Topic moved.');
    }
  }

  function requestDelete(target: DeleteTarget) {
    clearFeedback();
    closeMenus();
    rememberModalOpener();
    if (target.kind === 'topic') {
      const hasChildren = topics.some((topic) => topic.parent_id === target.record.id);
      const hasConcepts = concepts.some((concept) => concept.topic_id === target.record.id);
      if (hasChildren || hasConcepts) {
        setError('Move or delete this Topic’s child Topics and Concepts first.');
        return;
      }
    }
    setDeleteTarget(target);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setIsSaving(true);
    clearFeedback();
    const table =
      deleteTarget.kind === 'topic'
        ? 'personal_topics'
        : deleteTarget.kind === 'concept'
          ? 'personal_concepts'
          : 'personal_cards';
    const { error: deleteError } = await supabase
      .from(table)
      .delete()
      .eq('id', deleteTarget.record.id)
      .eq('owner_id', ownerId);
    if (deleteError) {
      setError(getErrorMessage(deleteError));
    } else {
      const deletedKind = deleteTarget.kind;
      const deletedId = deleteTarget.record.id;
      const next = await loadMaterial();
      if (deletedKind === 'topic' && selectedTopicId === deletedId) {
        setSelectedTopicId(next?.topics[0]?.id ?? null);
      }
      if (deletedKind === 'concept' && selectedConceptId === deletedId) {
        setSelectedConceptId(null);
      }
      setMessage(`${deletedKind[0].toUpperCase()}${deletedKind.slice(1)} deleted.`);
      setDeleteTarget(null);
    }
    setIsSaving(false);
  }

  function deleteDescription() {
    if (!deleteTarget) return '';
    if (deleteTarget.kind === 'concept') {
      const cardCount = cards.filter(
        (card) => card.concept_id === deleteTarget.record.id
      ).length;
      return cardCount
        ? `This will permanently delete “${deleteTarget.record.name}” and its ${cardCount} Card${cardCount === 1 ? '' : 's'}.`
        : `This will permanently delete “${deleteTarget.record.name}”.`;
    }
    if (deleteTarget.kind === 'card') {
      return 'This personal Card will be permanently deleted.';
    }
    return `The empty Topic “${deleteTarget.record.name}” will be permanently deleted.`;
  }

  function renderTopicTree(parentId: string | null, depth = 0): React.ReactNode {
    return topics
      .filter((topic) => topic.parent_id === parentId && topicMatchesSearch(topic))
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
      .map((topic) => {
        const children = topics.filter((item) => item.parent_id === topic.id);
        const directConcepts = concepts.filter((concept) => concept.topic_id === topic.id);
        const hasExpandableContent = children.length > 0 || directConcepts.length > 0;
        const isExpanded = expandedTopicIds.has(topic.id) || Boolean(normalizedSearch);
        const counts = topicCounts(topic.id);
        const isSelected = selectedTopicId === topic.id;
        return (
          <div className={styles.topicBranch} key={topic.id}>
            <div
              className={`${styles.topicRow} ${isSelected ? styles.selectedTopic : ''}`}
              style={{ paddingLeft: 10 + depth * 18 }}
            >
              <button
                aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${topic.name}`}
                className={styles.expandButton}
                disabled={!hasExpandableContent}
                onClick={() => toggleTopic(topic.id)}
                type="button"
              >
                {hasExpandableContent && <Icon name={isExpanded ? 'chevron-down' : 'chevron-right'} />}
              </button>
              <button className={styles.topicSelect} onClick={() => selectTopic(topic)} type="button">
                <span className={styles.folderIcon}><Icon name="folder" /></span>
                <span>
                  <strong>{topic.name}</strong>
                  <small>{counts.concepts} Concept{counts.concepts === 1 ? '' : 's'} · {counts.cards} Card{counts.cards === 1 ? '' : 's'}</small>
                </span>
              </button>
              <button
                aria-expanded={topicMenuId === topic.id}
                aria-haspopup="menu"
                aria-label={`Actions for ${topic.name}`}
                className={styles.moreButton}
                data-overflow-menu
                onClick={() => toggleMenu('topic', topic.id)}
                type="button"
              >
                <Icon name="more" />
              </button>
              {topicMenuId === topic.id && (
                <div className={styles.actionMenu} data-overflow-menu role="menu">
                  <button onClick={() => openTopicEditor(topic)} role="menuitem" type="button">Edit Topic</button>
                  <button onClick={() => openTopicEditor(null, topic.id)} role="menuitem" type="button">Add child Topic</button>
                  <button className={styles.menuDanger} onClick={() => requestDelete({ kind: 'topic', record: topic })} role="menuitem" type="button">Delete Topic</button>
                </div>
              )}
            </div>
            {isExpanded && (
              <div className={styles.topicChildren}>
                {directConcepts.map((concept) => {
                  const conceptCardCount = cards.filter((card) => card.concept_id === concept.id).length;
                  return (
                    <button
                      className={`${styles.topicConceptSummary} ${selectedConceptId === concept.id ? styles.selectedTopicConcept : ''}`}
                      key={concept.id}
                      onClick={() => selectConcept(concept)}
                      style={{ paddingLeft: 42 + depth * 18 }}
                      type="button"
                    >
                      <span className={styles.conceptBranchMark}><Icon name="book" /></span>
                      <span>
                        <strong>{concept.name}</strong>
                        <small>{conceptCardCount} Card{conceptCardCount === 1 ? '' : 's'}</small>
                      </span>
                    </button>
                  );
                })}
                {renderTopicTree(topic.id, depth + 1)}
              </div>
            )}
          </div>
        );
      });
  }

  if (isLoading) {
    return (
      <main className={styles.page}>
        <section className={styles.loadingShell}>
          <div className={styles.loadingBar} />
          <div className={styles.loadingColumns}>
            <span /><span /><span />
          </div>
        </section>
      </main>
    );
  }

  const unavailableTopicParents = selectedTopic
    ? descendantTopicIds(selectedTopic.id, true)
    : new Set<string>();

  return (
    <main className={styles.page}>
      <section className={styles.workspace} aria-label="Study Creator workspace">
        <header className={styles.workspaceHeader}>
          <div>
            <p>Private to your account</p>
            <h1>Study Creator</h1>
          </div>
        </header>

        {(message || error) && (
          <div className={`${styles.notice} ${error ? styles.noticeError : ''}`} role={error ? 'alert' : 'status'}>
            <span>{error || message}</span>
            <button aria-label="Dismiss message" onClick={clearFeedback} type="button">×</button>
          </div>
        )}

        <div className={styles.columns}>
          <aside className={`${styles.column} ${styles.topicsColumn}`} aria-label="My Topics">
            <div className={styles.columnTitle}>
              <h2>My Topics</h2>
              <span className={styles.privateBadge}>Private</span>
            </div>
            <button className={styles.primaryWide} onClick={() => openTopicEditor(null)} type="button">
              <span>＋</span> New Topic
            </button>
            <label className={styles.searchField}>
              <span aria-hidden="true"><Icon name="search" /></span>
              <input
                aria-label="Search topics and material"
                onChange={(event) => setTopicSearch(event.target.value)}
                placeholder="Search your material..."
                type="search"
                value={topicSearch}
              />
            </label>
            <div className={styles.topicTree}>
              {topics.length ? (
                renderTopicTree(null)
              ) : (
                <div className={styles.emptyState}>
                  <span><Icon name="folder" /></span>
                  <strong>Create your first Topic</strong>
                  <p>Topics keep your personal Concepts organized.</p>
                </div>
              )}
              {topics.length > 0 && normalizedSearch && !topics.some(topicMatchesSearch) && (
                <p className={styles.noResults}>No personal material matches your search.</p>
              )}
            </div>
            <div className={styles.quickStats}>
              <h3>Quick Stats</h3>
              <p><span><i className={styles.statBlue}><Icon name="folder" /></i> Topics</span><strong>{topics.length}</strong></p>
              <p><span><i className={styles.statGreen}><Icon name="book" /></i> Concepts</span><strong>{concepts.length}</strong></p>
              <p><span><i className={styles.statPurple}><Icon name="card" /></i> Cards</span><strong>{cards.length}</strong></p>
            </div>
          </aside>

          <section className={`${styles.column} ${styles.conceptsColumn}`} aria-label="Concepts">
            {selectedTopic ? (
              <>
                <div className={styles.selectionHeading}>
                  <span className={styles.headingIcon}><Icon name="folder" /></span>
                  <div>
                    <p>Selected Topic</p>
                    <h2>{selectedTopic.name}</h2>
                  </div>
                  <button aria-label="Edit selected Topic" className={styles.iconButton} onClick={() => openTopicEditor(selectedTopic)} title="Edit Topic" type="button"><Icon name="pencil" /></button>
                </div>
                <div className={styles.tabs}>
                  <button className={centerTab === 'concepts' ? styles.activeTab : ''} onClick={() => { closeMenus(); setCenterTab('concepts'); }} type="button">Concepts</button>
                  <button className={centerTab === 'details' ? styles.activeTab : ''} onClick={() => { closeMenus(); setCenterTab('details'); }} type="button">Topic Details</button>
                </div>

                {centerTab === 'concepts' ? (
                  <div className={styles.panelBody}>
                    <div className={styles.sectionLead}>
                      <div><h3>Concepts</h3><p>Organize ideas within this Topic.</p></div>
                      <button className={styles.primary} onClick={() => openConceptEditor(null)} type="button">＋ New Concept</button>
                    </div>
                    <div className={styles.conceptList}>
                      {selectedTopicConcepts.map((concept) => {
                        const conceptCardCount = cards.filter((card) => card.concept_id === concept.id).length;
                        return (
                          <article className={`${styles.conceptRow} ${selectedConceptId === concept.id ? styles.selectedConcept : ''}`} key={concept.id}>
                            <button className={styles.conceptSelect} onClick={() => selectConcept(concept)} type="button">
                              <span className={styles.bookIcon}><Icon name="book" /></span>
                              <span><strong>{concept.name}</strong><small>{conceptCardCount} Card{conceptCardCount === 1 ? '' : 's'}</small></span>
                            </button>
                            <button aria-expanded={conceptMenuId === concept.id} aria-haspopup="menu" aria-label={`Actions for ${concept.name}`} className={styles.moreButton} data-overflow-menu onClick={() => toggleMenu('concept', concept.id)} type="button"><Icon name="more" /></button>
                            <span className={styles.chevron}><Icon name="chevron-right" /></span>
                            {conceptMenuId === concept.id && (
                              <div className={styles.actionMenu} data-overflow-menu role="menu">
                                <button onClick={() => openConceptEditor(concept)} role="menuitem" type="button">Edit Concept</button>
                                <button onClick={() => { setSelectedConceptId(concept.id); openCardEditor(null, concept.id); }} role="menuitem" type="button">Add Card</button>
                                <button className={styles.menuDanger} onClick={() => requestDelete({ kind: 'concept', record: concept })} role="menuitem" type="button">Delete Concept</button>
                              </div>
                            )}
                          </article>
                        );
                      })}
                      {!selectedTopicConcepts.length && (
                        <button className={styles.addPlaceholder} onClick={() => openConceptEditor(null)} type="button">⊕ Create the first Concept in this Topic</button>
                      )}
                      {selectedTopicConcepts.length > 0 && (
                        <button className={styles.addPlaceholder} onClick={() => openConceptEditor(null)} type="button">⊕ Add another Concept to this Topic</button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className={styles.panelBody}>
                    <div className={styles.detailCard}>
                      <div><span>Topic name</span><strong>{selectedTopic.name}</strong></div>
                      <label>
                        Move under
                        <select value={selectedTopic.parent_id ?? ''} onChange={(event) => moveSelectedTopic(event.target.value)}>
                          <option value="">Top level</option>
                          {orderedTopics.filter((topic) => !unavailableTopicParents.has(topic.id)).map((topic) => (
                            <option key={topic.id} value={topic.id}>{topicLabel(topic.id)}</option>
                          ))}
                        </select>
                      </label>
                      <p>{topicCounts(selectedTopic.id).concepts} Concepts · {topicCounts(selectedTopic.id).cards} Cards in this branch</p>
                      <div className={styles.detailActions}>
                        <button className={styles.secondary} onClick={() => openTopicEditor(selectedTopic)} type="button">Edit Topic</button>
                        <button className={styles.secondary} onClick={() => openTopicEditor(null, selectedTopic.id)} type="button">Add child Topic</button>
                        <button className={styles.dangerButton} onClick={() => requestDelete({ kind: 'topic', record: selectedTopic })} type="button">Delete Topic</button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className={styles.emptyColumn}>
                <span><Icon name="folder" /></span>
                <h2>Select or create a Topic</h2>
                <p>Your Concepts will appear here.</p>
                <button className={styles.primary} onClick={() => openTopicEditor(null)} type="button">＋ New Topic</button>
              </div>
            )}
          </section>

          <section className={`${styles.column} ${styles.cardsColumn}`} aria-label="Concept and Cards">
            {selectedConcept ? (
              <>
                <div className={styles.selectionHeading}>
                  <span className={`${styles.headingIcon} ${styles.purpleIcon}`}><Icon name="book" /></span>
                  <div>
                    <p>Selected Concept</p>
                    <h2>{selectedConcept.name}</h2>
                  </div>
                  <div className={styles.headingActions}>
                    <button aria-label="Edit selected Concept" onClick={() => openConceptEditor(selectedConcept)} title="Edit Concept" type="button"><Icon name="pencil" /> <span className={styles.actionLabel}>Edit</span></button>
                    <button aria-label="Delete selected Concept" className={styles.headingDanger} onClick={() => requestDelete({ kind: 'concept', record: selectedConcept })} title="Delete Concept" type="button"><Icon name="trash" /> <span className={styles.actionLabel}>Delete</span></button>
                  </div>
                </div>
                <div className={styles.tabs}>
                  <button className={rightTab === 'details' ? styles.activeTab : ''} onClick={() => { closeMenus(); setRightTab('details'); }} type="button">Details</button>
                  <button className={rightTab === 'cards' ? styles.activeTab : ''} onClick={() => { closeMenus(); setRightTab('cards'); }} type="button">Cards</button>
                </div>
                {rightTab === 'cards' ? (
                  <div className={styles.panelBody}>
                    <div className={styles.sectionLead}>
                      <div><h3>Cards</h3><p>Create simple prompts to study this Concept.</p></div>
                      <button className={styles.primary} onClick={() => openCardEditor(null)} type="button">＋ New Card</button>
                    </div>
                    <div className={styles.cardList}>
                      {selectedConceptCards.map((card) => (
                        <article className={styles.cardRow} key={card.id}>
                          <p><strong>Q:</strong> {card.question}</p>
                          <p><strong>A:</strong> {card.answer}</p>
                          <button aria-expanded={cardMenuId === card.id} aria-haspopup="menu" aria-label={`Actions for card ${card.question}`} className={styles.moreButton} data-overflow-menu onClick={() => toggleMenu('card', card.id)} type="button"><Icon name="more" /></button>
                          {cardMenuId === card.id && (
                            <div className={styles.actionMenu} data-overflow-menu role="menu">
                              <button onClick={() => openCardEditor(card)} role="menuitem" type="button">Edit Card</button>
                              <button className={styles.menuDanger} onClick={() => requestDelete({ kind: 'card', record: card })} role="menuitem" type="button">Delete Card</button>
                            </div>
                          )}
                        </article>
                      ))}
                      <button className={styles.addPlaceholder} onClick={() => openCardEditor(null)} type="button">⊕ {selectedConceptCards.length ? 'Add another Card to this Concept' : 'Create the first Card for this Concept'}</button>
                    </div>
                  </div>
                ) : (
                  <div className={styles.panelBody}>
                    <div className={styles.detailCard}>
                      <div><span>Concept name</span><strong>{selectedConcept.name}</strong></div>
                      <div><span>Topic</span><strong>{topicLabel(selectedConcept.topic_id)}</strong></div>
                      <div><span>Description</span><p>{selectedConcept.description || 'No description yet.'}</p></div>
                      <p>{selectedConceptCards.length} personal Card{selectedConceptCards.length === 1 ? '' : 's'}</p>
                      <div className={styles.detailActions}>
                        <button className={styles.secondary} onClick={() => openConceptEditor(selectedConcept)} type="button">Edit Concept</button>
                        <button className={styles.primary} onClick={() => openCardEditor(null)} type="button">＋ New Card</button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className={styles.emptyColumn}>
                <span><Icon name="book" /></span>
                <h2>Select or create a Concept</h2>
                <p>Its Cards and details will appear here.</p>
                {selectedTopic && <button className={styles.primary} onClick={() => openConceptEditor(null)} type="button">＋ New Concept</button>}
              </div>
            )}
          </section>
        </div>
      </section>

      {editorModal && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) closeEditor(); }}>
          <section aria-labelledby="editor-title" aria-modal="true" className={styles.modal} ref={dialogRef} role="dialog">
            <div className={styles.modalHeader}>
              <div>
                <p>{editorModal.record ? 'Edit personal content' : 'Create personal content'}</p>
                <h2 id="editor-title">
                  {editorModal.record ? 'Edit' : 'New'} {editorModal.kind === 'card' ? 'Card' : editorModal.kind === 'concept' ? 'Concept' : 'Topic'}
                </h2>
              </div>
              <button aria-label="Close editor" disabled={isSaving} onClick={closeEditor} type="button">×</button>
            </div>

            {editorModal.kind === 'topic' && (
              <form className={styles.modalForm} onSubmit={saveTopic}>
                <label>Topic name<input autoFocus maxLength={120} onChange={(event) => setTopicName(event.target.value)} required value={topicName} /></label>
                <label>Parent Topic<select onChange={(event) => setTopicParentId(event.target.value)} value={topicParentId}>
                  <option value="">Top level</option>
                  {orderedTopics.filter((topic) => !editorModal.record || !descendantTopicIds(editorModal.record.id, true).has(topic.id)).map((topic) => (
                    <option key={topic.id} value={topic.id}>{topicLabel(topic.id)}</option>
                  ))}
                </select></label>
                <div className={styles.modalActions}><button className={styles.secondary} disabled={isSaving} onClick={closeEditor} type="button">Cancel</button><button className={styles.primary} disabled={isSaving} type="submit">{isSaving ? 'Saving…' : 'Save Topic'}</button></div>
              </form>
            )}

            {editorModal.kind === 'concept' && (
              <form className={styles.modalForm} onSubmit={saveConcept}>
                <label>Concept name<input autoFocus maxLength={160} onChange={(event) => setConceptName(event.target.value)} required value={conceptName} /></label>
                <label>Short description <small>Optional</small><textarea maxLength={1000} onChange={(event) => setConceptDescription(event.target.value)} value={conceptDescription} /></label>
                <label>Topic<select onChange={(event) => setConceptTopicId(event.target.value)} required value={conceptTopicId}><option value="">Choose a Topic</option>{orderedTopics.map((topic) => <option key={topic.id} value={topic.id}>{topicLabel(topic.id)}</option>)}</select></label>
                <div className={styles.modalActions}><button className={styles.secondary} disabled={isSaving} onClick={closeEditor} type="button">Cancel</button><button className={styles.primary} disabled={isSaving} type="submit">{isSaving ? 'Saving…' : 'Save Concept'}</button></div>
              </form>
            )}

            {editorModal.kind === 'card' && (
              <form className={styles.modalForm} onSubmit={saveCard}>
                <label>Question / Front<textarea autoFocus maxLength={10000} onChange={(event) => setCardQuestion(event.target.value)} required value={cardQuestion} /></label>
                <label>Answer / Back<textarea maxLength={20000} onChange={(event) => setCardAnswer(event.target.value)} required value={cardAnswer} /></label>
                <label>Concept<select onChange={(event) => setCardConceptId(event.target.value)} required value={cardConceptId}><option value="">Choose a Concept</option>{concepts.map((concept) => <option key={concept.id} value={concept.id}>{concept.name} — {topicLabel(concept.topic_id)}</option>)}</select></label>
                <div className={styles.modalActions}><button className={styles.secondary} disabled={isSaving} onClick={closeEditor} type="button">Cancel</button><button className={styles.primary} disabled={isSaving} type="submit">{isSaving ? 'Saving…' : 'Save Card'}</button></div>
              </form>
            )}
          </section>
        </div>
      )}

      {deleteTarget && (
        <div className={styles.modalBackdrop} role="presentation">
          <section aria-labelledby="delete-title" aria-modal="true" className={`${styles.modal} ${styles.deleteModal}`} ref={dialogRef} role="dialog">
            <div className={styles.deleteIcon}>!</div>
            <h2 id="delete-title">Delete this {deleteTarget.kind}?</h2>
            <p>{deleteDescription()}</p>
            <p className={styles.deleteNote}>This action cannot be undone.</p>
            <div className={styles.modalActions}>
              <button autoFocus className={styles.secondary} disabled={isSaving} onClick={closeDeleteConfirmation} type="button">Cancel</button>
              <button className={styles.dangerButton} disabled={isSaving} onClick={confirmDelete} type="button">{isSaving ? 'Deleting…' : `Delete ${deleteTarget.kind}`}</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
