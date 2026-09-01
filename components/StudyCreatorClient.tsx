'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
    setTopicName(record?.name ?? '');
    setTopicParentId(record?.parent_id ?? parentId);
    setEditorModal({ kind: 'topic', record });
  }

  function openConceptEditor(record: PersonalConcept | null) {
    clearFeedback();
    closeMenus();
    setConceptName(record?.name ?? '');
    setConceptDescription(record?.description ?? '');
    setConceptTopicId(record?.topic_id ?? selectedTopicId ?? topics[0]?.id ?? '');
    setEditorModal({ kind: 'concept', record });
  }

  function openCardEditor(record: PersonalCard | null, defaultConceptId = '') {
    clearFeedback();
    closeMenus();
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
                {hasExpandableContent ? (isExpanded ? '⌃' : '⌄') : '·'}
              </button>
              <button className={styles.topicSelect} onClick={() => selectTopic(topic)} type="button">
                <span className={styles.folderIcon}>▢</span>
                <span>
                  <strong>{topic.name}</strong>
                  <small>{counts.concepts} Concept{counts.concepts === 1 ? '' : 's'} · {counts.cards} Card{counts.cards === 1 ? '' : 's'}</small>
                </span>
              </button>
              <button
                aria-label={`Actions for ${topic.name}`}
                className={styles.moreButton}
                onClick={() => setTopicMenuId(topicMenuId === topic.id ? null : topic.id)}
                type="button"
              >
                •••
              </button>
              {topicMenuId === topic.id && (
                <div className={styles.actionMenu}>
                  <button onClick={() => openTopicEditor(topic)} type="button">Edit Topic</button>
                  <button onClick={() => openTopicEditor(null, topic.id)} type="button">Add child Topic</button>
                  <button className={styles.menuDanger} onClick={() => requestDelete({ kind: 'topic', record: topic })} type="button">Delete Topic</button>
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
                      <span className={styles.conceptBranchMark}>⌄</span>
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
          <span>Navigate → Select → Create</span>
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
              <div>
                <p>Step 1</p>
                <h2>My Topics</h2>
              </div>
              <span className={styles.privateBadge}>Private</span>
            </div>
            <button className={styles.primaryWide} onClick={() => openTopicEditor(null)} type="button">
              <span>＋</span> New Topic
            </button>
            <label className={styles.searchField}>
              <span aria-hidden="true">⌕</span>
              <input
                aria-label="Search topics and material"
                onChange={(event) => setTopicSearch(event.target.value)}
                placeholder="Search topics…"
                type="search"
                value={topicSearch}
              />
            </label>
            <div className={styles.topicTree}>
              {topics.length ? (
                renderTopicTree(null)
              ) : (
                <div className={styles.emptyState}>
                  <span>▢</span>
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
              <p><span><i className={styles.statBlue}>▢</i> Topics</span><strong>{topics.length}</strong></p>
              <p><span><i className={styles.statGreen}>▤</i> Concepts</span><strong>{concepts.length}</strong></p>
              <p><span><i className={styles.statPurple}>▥</i> Cards</span><strong>{cards.length}</strong></p>
            </div>
          </aside>

          <section className={`${styles.column} ${styles.conceptsColumn}`} aria-label="Concepts">
            {selectedTopic ? (
              <>
                <div className={styles.selectionHeading}>
                  <span className={styles.headingIcon}>▢</span>
                  <div>
                    <p>Selected Topic</p>
                    <h2>{selectedTopic.name}</h2>
                  </div>
                  <button aria-label="Edit selected Topic" className={styles.iconButton} onClick={() => openTopicEditor(selectedTopic)} type="button">✎</button>
                </div>
                <div className={styles.tabs}>
                  <button className={centerTab === 'concepts' ? styles.activeTab : ''} onClick={() => setCenterTab('concepts')} type="button">Concepts</button>
                  <button className={centerTab === 'details' ? styles.activeTab : ''} onClick={() => setCenterTab('details')} type="button">Topic Details</button>
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
                              <span className={styles.bookIcon}>▥</span>
                              <span><strong>{concept.name}</strong><small>{conceptCardCount} Card{conceptCardCount === 1 ? '' : 's'}</small></span>
                            </button>
                            <button aria-label={`Actions for ${concept.name}`} className={styles.moreButton} onClick={() => setConceptMenuId(conceptMenuId === concept.id ? null : concept.id)} type="button">•••</button>
                            <span className={styles.chevron}>›</span>
                            {conceptMenuId === concept.id && (
                              <div className={styles.actionMenu}>
                                <button onClick={() => openConceptEditor(concept)} type="button">Edit Concept</button>
                                <button onClick={() => { setSelectedConceptId(concept.id); openCardEditor(null, concept.id); }} type="button">Add Card</button>
                                <button className={styles.menuDanger} onClick={() => requestDelete({ kind: 'concept', record: concept })} type="button">Delete Concept</button>
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
                <span>▢</span>
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
                  <span className={`${styles.headingIcon} ${styles.purpleIcon}`}>▥</span>
                  <div>
                    <p>Selected Concept</p>
                    <h2>{selectedConcept.name}</h2>
                  </div>
                  <div className={styles.headingActions}>
                    <button aria-label="Edit selected Concept" onClick={() => openConceptEditor(selectedConcept)} type="button">✎ <span className={styles.actionLabel}>Edit</span></button>
                    <button aria-label="Delete selected Concept" className={styles.headingDanger} onClick={() => requestDelete({ kind: 'concept', record: selectedConcept })} type="button">⌫ <span className={styles.actionLabel}>Delete</span></button>
                  </div>
                </div>
                <div className={styles.tabs}>
                  <button className={rightTab === 'details' ? styles.activeTab : ''} onClick={() => setRightTab('details')} type="button">Details</button>
                  <button className={rightTab === 'cards' ? styles.activeTab : ''} onClick={() => setRightTab('cards')} type="button">Cards</button>
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
                          <button aria-label={`Actions for card ${card.question}`} className={styles.moreButton} onClick={() => setCardMenuId(cardMenuId === card.id ? null : card.id)} type="button">•••</button>
                          {cardMenuId === card.id && (
                            <div className={styles.actionMenu}>
                              <button onClick={() => openCardEditor(card)} type="button">Edit Card</button>
                              <button className={styles.menuDanger} onClick={() => requestDelete({ kind: 'card', record: card })} type="button">Delete Card</button>
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
                <span>▥</span>
                <h2>Select or create a Concept</h2>
                <p>Its Cards and details will appear here.</p>
                {selectedTopic && <button className={styles.primary} onClick={() => openConceptEditor(null)} type="button">＋ New Concept</button>}
              </div>
            )}
          </section>
        </div>
      </section>

      {editorModal && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !isSaving) setEditorModal(null); }}>
          <section aria-labelledby="editor-title" aria-modal="true" className={styles.modal} role="dialog">
            <div className={styles.modalHeader}>
              <div>
                <p>{editorModal.record ? 'Edit personal content' : 'Create personal content'}</p>
                <h2 id="editor-title">
                  {editorModal.record ? 'Edit' : 'New'} {editorModal.kind === 'card' ? 'Card' : editorModal.kind === 'concept' ? 'Concept' : 'Topic'}
                </h2>
              </div>
              <button aria-label="Close editor" disabled={isSaving} onClick={() => setEditorModal(null)} type="button">×</button>
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
                <div className={styles.modalActions}><button className={styles.secondary} disabled={isSaving} onClick={() => setEditorModal(null)} type="button">Cancel</button><button className={styles.primary} disabled={isSaving} type="submit">{isSaving ? 'Saving…' : 'Save Topic'}</button></div>
              </form>
            )}

            {editorModal.kind === 'concept' && (
              <form className={styles.modalForm} onSubmit={saveConcept}>
                <label>Concept name<input autoFocus maxLength={160} onChange={(event) => setConceptName(event.target.value)} required value={conceptName} /></label>
                <label>Short description <small>Optional</small><textarea maxLength={1000} onChange={(event) => setConceptDescription(event.target.value)} value={conceptDescription} /></label>
                <label>Topic<select onChange={(event) => setConceptTopicId(event.target.value)} required value={conceptTopicId}><option value="">Choose a Topic</option>{orderedTopics.map((topic) => <option key={topic.id} value={topic.id}>{topicLabel(topic.id)}</option>)}</select></label>
                <div className={styles.modalActions}><button className={styles.secondary} disabled={isSaving} onClick={() => setEditorModal(null)} type="button">Cancel</button><button className={styles.primary} disabled={isSaving} type="submit">{isSaving ? 'Saving…' : 'Save Concept'}</button></div>
              </form>
            )}

            {editorModal.kind === 'card' && (
              <form className={styles.modalForm} onSubmit={saveCard}>
                <label>Question / Front<textarea autoFocus maxLength={10000} onChange={(event) => setCardQuestion(event.target.value)} required value={cardQuestion} /></label>
                <label>Answer / Back<textarea maxLength={20000} onChange={(event) => setCardAnswer(event.target.value)} required value={cardAnswer} /></label>
                <label>Concept<select onChange={(event) => setCardConceptId(event.target.value)} required value={cardConceptId}><option value="">Choose a Concept</option>{concepts.map((concept) => <option key={concept.id} value={concept.id}>{concept.name} — {topicLabel(concept.topic_id)}</option>)}</select></label>
                <div className={styles.modalActions}><button className={styles.secondary} disabled={isSaving} onClick={() => setEditorModal(null)} type="button">Cancel</button><button className={styles.primary} disabled={isSaving} type="submit">{isSaving ? 'Saving…' : 'Save Card'}</button></div>
              </form>
            )}
          </section>
        </div>
      )}

      {deleteTarget && (
        <div className={styles.modalBackdrop} role="presentation">
          <section aria-labelledby="delete-title" aria-modal="true" className={`${styles.modal} ${styles.deleteModal}`} role="dialog">
            <div className={styles.deleteIcon}>!</div>
            <h2 id="delete-title">Delete this {deleteTarget.kind}?</h2>
            <p>{deleteDescription()}</p>
            <p className={styles.deleteNote}>This action cannot be undone.</p>
            <div className={styles.modalActions}>
              <button className={styles.secondary} disabled={isSaving} onClick={() => setDeleteTarget(null)} type="button">Cancel</button>
              <button className={styles.dangerButton} disabled={isSaving} onClick={confirmDelete} type="button">{isSaving ? 'Deleting…' : `Delete ${deleteTarget.kind}`}</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
