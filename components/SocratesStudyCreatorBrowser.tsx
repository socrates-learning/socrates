'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  buildConceptTopicTree,
  collectConceptTopicSearchIds,
  findConceptTopicPath,
  type ConceptTopic,
} from '@/lib/concept-topic-tree';
import { MarkdownContent } from './MarkdownContent';
import { StudyCreatorIcon as Icon } from './StudyCreatorIcon';
import type {
  PersonalCard,
  PersonalConcept,
  PersonalMaterial,
  PersonalOverlay,
  PersonalTopic,
} from './StudyCreatorClient';
import styles from './StudyCreatorClient.module.css';

type OfficialNode = {
  id: string;
  parent_id: string | null;
  name: string;
  sort_order: number | null;
};

type OfficialConcept = {
  id: string;
  name: string;
  summary: string | null;
  whyItMatters: string | null;
  bodyMarkdown: string;
  placementNodeIds: string[];
};

type OfficialQuestion = {
  id: string;
  concept_id: string;
  prompt: string;
  explanation: string | null;
  difficulty: string | null;
  testing_angle: string | null;
  question_type: string;
  status: string;
  sort_order: number | null;
  created_at: string;
};

export type OfficialBrowserData = {
  libraryId: string;
  libraryName: string;
  nodes: OfficialNode[];
  concepts: OfficialConcept[];
  questions: OfficialQuestion[];
};

export type UnifiedBrowseFilter =
  | 'all'
  | 'official'
  | 'personal'
  | 'concepts'
  | 'cards';

type OverlayActionTarget = {
  libraryNodeId: string;
  officialConceptId: string | null;
  officialName: string;
  officialPath: string;
  openCardAfterSave: boolean;
};

type UnifiedStudyCreatorBrowserProps = {
  data: OfficialBrowserData | null;
  filter: UnifiedBrowseFilter;
  material: PersonalMaterial;
  onAddCard: (target: OverlayActionTarget) => void;
  onAddConcept: (target: OverlayActionTarget) => void;
  onCreateCard: (conceptId: string) => void;
  onCreateConcept: (topicId: string) => void;
  onCreateTopic: (parentId?: string) => void;
  onDeleteCard: (card: PersonalCard) => void;
  onDeleteConcept: (concept: PersonalConcept) => void;
  onDeleteTopic: (topic: PersonalTopic) => void;
  onDetach: (overlay: PersonalOverlay) => void;
  onEditCard: (card: PersonalCard) => void;
  onEditConcept: (concept: PersonalConcept) => void;
  onEditTopic: (topic: PersonalTopic) => void;
  search: string;
};

type SelectedTopic =
  | { source: 'official'; id: string }
  | { source: 'personal'; id: string };

type BrowseItem =
  | { kind: 'official-concept'; id: string; concept: OfficialConcept }
  | {
      kind: 'official-question';
      id: string;
      question: OfficialQuestion;
      concept: OfficialConcept;
    }
  | {
      kind: 'personal-concept';
      id: string;
      concept: PersonalConcept;
      overlay: PersonalOverlay | null;
    }
  | {
      kind: 'personal-card';
      id: string;
      card: PersonalCard;
      concept: PersonalConcept;
      overlay: PersonalOverlay | null;
    };

function officialPath(topics: ConceptTopic[], topicId: string) {
  return (
    findConceptTopicPath(topics, topicId)
      ?.map((topic) => topic.name)
      .join(' › ') || 'Unplaced'
  );
}

function addOfficialPath(
  topics: ConceptTopic[],
  topicId: string,
  visibleIds: Set<string>
) {
  findConceptTopicPath(topics, topicId)?.forEach((topic) =>
    visibleIds.add(topic.id)
  );
}

function ownerFor(item: BrowseItem) {
  return item.kind.startsWith('official') ? 'official' : 'personal';
}

function typeFor(item: BrowseItem) {
  if (item.kind.endsWith('concept')) return 'Concept';
  return item.kind === 'official-question' ? 'Question' : 'Card';
}

function titleFor(item: BrowseItem) {
  if (item.kind === 'official-concept' || item.kind === 'personal-concept') {
    return item.concept.name;
  }
  return item.kind === 'official-question'
    ? item.question.prompt
    : item.card.question;
}

export function SocratesStudyCreatorBrowser({
  data,
  filter,
  material,
  onAddCard,
  onAddConcept,
  onCreateCard,
  onCreateConcept,
  onCreateTopic,
  onDeleteCard,
  onDeleteConcept,
  onDeleteTopic,
  onDetach,
  onEditCard,
  onEditConcept,
  onEditTopic,
  search,
}: UnifiedStudyCreatorBrowserProps) {
  const officialTree = useMemo(
    () => buildConceptTopicTree(data?.nodes ?? []),
    [data?.nodes]
  );
  const [selectedTopic, setSelectedTopic] = useState<SelectedTopic | null>(
    () =>
      officialTree[0]
        ? { source: 'official', id: officialTree[0].id }
        : null
  );
  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null);
  const [expandedOfficialIds, setExpandedOfficialIds] = useState<Set<string>>(
    () => new Set(officialTree.map((topic) => topic.id))
  );
  const [expandedPersonalIds, setExpandedPersonalIds] = useState<Set<string>>(
    () =>
      new Set(
        material.topics
          .filter((topic) => topic.parent_id === null)
          .map((topic) => topic.id)
      )
  );
  const [inspectorTab, setInspectorTab] = useState<
    'overview' | 'questions' | 'details' | 'cards'
  >('overview');
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const allowsOfficial = filter !== 'personal';
  const allowsPersonal = filter !== 'official';
  const allowsConcepts = filter !== 'cards';
  const allowsCards = filter !== 'concepts';

  const personalTopicsById = useMemo(
    () => new Map(material.topics.map((topic) => [topic.id, topic])),
    [material.topics]
  );

  function personalTopicPath(topicId: string) {
    const names: string[] = [];
    const visited = new Set<string>();
    let topic = personalTopicsById.get(topicId);
    while (topic && !visited.has(topic.id)) {
      visited.add(topic.id);
      names.unshift(topic.name);
      topic = topic.parent_id
        ? personalTopicsById.get(topic.parent_id)
        : undefined;
    }
    return names.join(' › ') || 'My Custom Topics';
  }

  function personalBranchCounts(topicId: string) {
    const ids = new Set([topicId]);
    const queue = [topicId];
    while (queue.length) {
      const parentId = queue.shift();
      material.topics.forEach((topic) => {
        if (topic.parent_id === parentId && !ids.has(topic.id)) {
          ids.add(topic.id);
          queue.push(topic.id);
        }
      });
    }
    const branchConcepts = material.concepts.filter((concept) =>
      ids.has(concept.topic_id)
    );
    const conceptIds = new Set(branchConcepts.map((concept) => concept.id));
    return {
      cards: material.cards.filter((card) => conceptIds.has(card.concept_id))
        .length,
      concepts: branchConcepts.length,
    };
  }

  const visibleOfficialIds = (() => {
    if (!normalizedSearch) return new Set<string>();
    const visible = collectConceptTopicSearchIds(
      officialTree,
      normalizedSearch
    );
    data?.concepts.forEach((concept) => {
      const questions = data.questions.filter(
        (question) => question.concept_id === concept.id
      );
      const matches =
        concept.name.toLocaleLowerCase().includes(normalizedSearch) ||
        (concept.summary ?? '').toLocaleLowerCase().includes(normalizedSearch) ||
        questions.some((question) =>
          question.prompt.toLocaleLowerCase().includes(normalizedSearch)
        );
      if (matches) {
        concept.placementNodeIds.forEach((topicId) =>
          addOfficialPath(officialTree, topicId, visible)
        );
      }
    });
    return visible;
  })();

  const visiblePersonalIds = (() => {
    const visible = new Set<string>();
    if (!normalizedSearch) return visible;
    const addAncestors = (topicId: string) => {
      let topic = personalTopicsById.get(topicId);
      while (topic && !visible.has(topic.id)) {
        visible.add(topic.id);
        topic = topic.parent_id
          ? personalTopicsById.get(topic.parent_id)
          : undefined;
      }
    };
    material.topics.forEach((topic) => {
      if (
        personalTopicPath(topic.id)
          .toLocaleLowerCase()
          .includes(normalizedSearch)
      ) {
        addAncestors(topic.id);
      }
    });
    material.concepts.forEach((concept) => {
      const conceptCards = material.cards.filter(
        (card) => card.concept_id === concept.id
      );
      if (
        concept.name.toLocaleLowerCase().includes(normalizedSearch) ||
        (concept.description ?? '')
          .toLocaleLowerCase()
          .includes(normalizedSearch) ||
        conceptCards.some((card) =>
          `${card.question} ${card.answer}`
            .toLocaleLowerCase()
            .includes(normalizedSearch)
        )
      ) {
        addAncestors(concept.topic_id);
      }
    });
    return visible;
  })();

  useEffect(() => {
    if (selectedTopic) return;
    if (officialTree[0]) {
      setSelectedTopic({ source: 'official', id: officialTree[0].id });
      return;
    }
    const firstPersonal =
      material.topics.find((topic) => topic.parent_id === null) ??
      material.topics[0];
    if (firstPersonal) {
      setSelectedTopic({ source: 'personal', id: firstPersonal.id });
    }
  }, [material.topics, officialTree, selectedTopic]);

  const selectedOfficialTopic =
    selectedTopic?.source === 'official'
      ? data?.nodes.find((node) => node.id === selectedTopic.id) ?? null
      : null;
  const selectedPersonalTopic =
    selectedTopic?.source === 'personal'
      ? personalTopicsById.get(selectedTopic.id) ?? null
      : null;

  const items = (() => {
    const next: BrowseItem[] = [];
    if (normalizedSearch) {
      if (allowsOfficial) {
        const officialConcepts = data?.concepts ?? [];
        if (allowsConcepts) {
          officialConcepts.forEach((concept) =>
            next.push({ kind: 'official-concept', id: concept.id, concept })
          );
        }
        if (allowsCards) {
          (data?.questions ?? []).forEach((question) => {
            const concept = officialConcepts.find(
              (candidate) => candidate.id === question.concept_id
            );
            if (concept) {
              next.push({
                kind: 'official-question',
                id: question.id,
                question,
                concept,
              });
            }
          });
        }
      }
      if (allowsPersonal) {
        material.concepts.forEach((concept) => {
          const overlay =
            material.overlays.find(
              (candidate) => candidate.personal_concept_id === concept.id
            ) ?? null;
          if (allowsConcepts) {
            next.push({
              kind: 'personal-concept',
              id: concept.id,
              concept,
              overlay,
            });
          }
          if (allowsCards) {
            material.cards
              .filter((card) => card.concept_id === concept.id)
              .forEach((card) =>
                next.push({
                  kind: 'personal-card',
                  id: card.id,
                  card,
                  concept,
                  overlay,
                })
              );
          }
        });
      }
    } else if (selectedTopic?.source === 'official') {
      const directConcepts = (data?.concepts ?? []).filter((concept) =>
        concept.placementNodeIds.includes(selectedTopic.id)
      );
      const directConceptIds = new Set(
        directConcepts.map((concept) => concept.id)
      );
      if (allowsOfficial && allowsConcepts) {
        directConcepts.forEach((concept) =>
          next.push({ kind: 'official-concept', id: concept.id, concept })
        );
      }
      if (allowsOfficial && allowsCards) {
        (data?.questions ?? [])
          .filter((question) => directConceptIds.has(question.concept_id))
          .forEach((question) => {
            const concept = directConcepts.find(
              (candidate) => candidate.id === question.concept_id
            );
            if (concept) {
              next.push({
                kind: 'official-question',
                id: question.id,
                question,
                concept,
              });
            }
          });
      }
      if (allowsPersonal) {
        const topicOverlays = material.overlays.filter(
          (overlay) => overlay.library_node_id === selectedTopic.id
        );
        const seen = new Set<string>();
        topicOverlays.forEach((overlay) => {
          const concept = material.concepts.find(
            (candidate) => candidate.id === overlay.personal_concept_id
          );
          if (!concept || seen.has(concept.id)) return;
          seen.add(concept.id);
          if (allowsConcepts) {
            next.push({
              kind: 'personal-concept',
              id: concept.id,
              concept,
              overlay,
            });
          }
          if (allowsCards) {
            material.cards
              .filter((card) => card.concept_id === concept.id)
              .forEach((card) =>
                next.push({
                  kind: 'personal-card',
                  id: card.id,
                  card,
                  concept,
                  overlay,
                })
              );
          }
        });
      }
    }
    if (
      !normalizedSearch &&
      selectedTopic?.source === 'personal' &&
      allowsPersonal
    ) {
      const directConcepts = material.concepts.filter(
        (concept) => concept.topic_id === selectedTopic.id
      );
      directConcepts.forEach((concept) => {
        const overlay =
          material.overlays.find(
            (candidate) => candidate.personal_concept_id === concept.id
          ) ?? null;
        if (allowsConcepts) {
          next.push({
            kind: 'personal-concept',
            id: concept.id,
            concept,
            overlay,
          });
        }
        if (allowsCards) {
          material.cards
            .filter((card) => card.concept_id === concept.id)
            .forEach((card) =>
              next.push({
                kind: 'personal-card',
                id: card.id,
                card,
                concept,
                overlay,
              })
            );
        }
      });
    }

    return next
      .filter((item) => {
        if (!normalizedSearch) return true;
        const context =
          item.kind === 'official-question'
            ? `${item.question.prompt} ${item.concept.name} ${item.question.testing_angle ?? ''}`
            : item.kind === 'personal-card'
              ? `${item.card.question} ${item.card.answer} ${item.concept.name}`
              : `${item.concept.name} ${
                  'summary' in item.concept
                    ? item.concept.summary ?? ''
                    : item.concept.description ?? ''
                }`;
        return context.toLocaleLowerCase().includes(normalizedSearch);
      })
      .sort((left, right) => {
        const ownerOrder = ownerFor(left).localeCompare(ownerFor(right));
        return (
          ownerOrder ||
          titleFor(left).localeCompare(titleFor(right)) ||
          left.id.localeCompare(right.id)
        );
      });
  })();

  const selectedItem =
    items.find((item) => `${item.kind}:${item.id}` === selectedItemKey) ??
    items[0] ??
    null;
  const effectiveSelectedItemKey = selectedItem
    ? `${selectedItem.kind}:${selectedItem.id}`
    : null;

  function chooseItem(item: BrowseItem) {
    setSelectedItemKey(`${item.kind}:${item.id}`);
    if (item.kind === 'official-concept') setInspectorTab('overview');
    else if (item.kind === 'personal-concept') setInspectorTab('cards');
    else setInspectorTab('details');
  }

  function selectOfficialTopic(topicId: string) {
    setSelectedTopic({ source: 'official', id: topicId });
    setSelectedItemKey(null);
    setExpandedOfficialIds((current) => new Set(current).add(topicId));
  }

  function selectPersonalTopic(topicId: string) {
    setSelectedTopic({ source: 'personal', id: topicId });
    setSelectedItemKey(null);
    setExpandedPersonalIds((current) => new Set(current).add(topicId));
  }

  function toggleExpanded(source: 'official' | 'personal', topicId: string) {
    const setExpanded =
      source === 'official' ? setExpandedOfficialIds : setExpandedPersonalIds;
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
  }

  function renderOfficialTopic(topic: ConceptTopic, depth = 0): React.ReactNode {
    if (
      !allowsOfficial ||
      (normalizedSearch && !visibleOfficialIds.has(topic.id))
    ) {
      return null;
    }
    const isExpanded = normalizedSearch
      ? true
      : expandedOfficialIds.has(topic.id);
    const isSelected =
      selectedTopic?.source === 'official' && selectedTopic.id === topic.id;
    const conceptIds = new Set(
      (data?.concepts ?? [])
        .filter((concept) => concept.placementNodeIds.includes(topic.id))
        .map((concept) => concept.id)
    );
    const count =
      conceptIds.size +
      (data?.questions ?? []).filter((question) =>
        conceptIds.has(question.concept_id)
      ).length;
    return (
      <div
        aria-selected={isSelected}
        className={styles.topicBranch}
        key={`official-${topic.id}`}
        role="treeitem"
      >
        <div
          className={`${styles.topicRow} ${
            isSelected ? styles.selectedTopic : ''
          }`}
          style={{ paddingLeft: 8 + depth * 16 }}
        >
          <button
            aria-expanded={topic.children.length ? isExpanded : undefined}
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${topic.name}`}
            className={styles.expandButton}
            disabled={!topic.children.length}
            onClick={() => toggleExpanded('official', topic.id)}
            type="button"
          >
            {topic.children.length > 0 && (
              <Icon
                name={isExpanded ? 'chevron-down' : 'chevron-right'}
              />
            )}
          </button>
          <button
            className={styles.topicSelect}
            onClick={() => selectOfficialTopic(topic.id)}
            type="button"
          >
            <span className={styles.folderIcon}>
              <Icon name="folder" />
            </span>
            <span>
              <strong>{topic.name}</strong>
              <small>
                {count} item{count === 1 ? '' : 's'}
              </small>
            </span>
          </button>
          <span
            className={styles.officialOwnerMark}
            title="Socrates (Official)"
          >
            S
          </span>
        </div>
        {isExpanded && topic.children.length > 0 && (
          <div className={styles.topicChildren} role="group">
            {topic.children.map((child) =>
              renderOfficialTopic(child, depth + 1)
            )}
          </div>
        )}
      </div>
    );
  }

  function renderPersonalTopic(
    topic: PersonalTopic,
    depth = 0
  ): React.ReactNode {
    if (
      !allowsPersonal ||
      (normalizedSearch && !visiblePersonalIds.has(topic.id))
    ) {
      return null;
    }
    const children = material.topics
      .filter((candidate) => candidate.parent_id === topic.id)
      .sort(
        (left, right) =>
          left.sort_order - right.sort_order ||
          left.name.localeCompare(right.name)
      );
    const isExpanded = normalizedSearch
      ? true
      : expandedPersonalIds.has(topic.id);
    const isSelected =
      selectedTopic?.source === 'personal' && selectedTopic.id === topic.id;
    const counts = personalBranchCounts(topic.id);
    return (
      <div
        aria-selected={isSelected}
        className={styles.topicBranch}
        key={`personal-${topic.id}`}
        role="treeitem"
      >
        <div
          className={`${styles.topicRow} ${styles.personalTopicRow} ${
            isSelected ? styles.selectedTopic : ''
          }`}
          style={{ paddingLeft: 8 + depth * 16 }}
        >
          <button
            aria-expanded={children.length ? isExpanded : undefined}
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${topic.name}`}
            className={styles.expandButton}
            disabled={!children.length}
            onClick={() => toggleExpanded('personal', topic.id)}
            type="button"
          >
            {children.length > 0 && (
              <Icon
                name={isExpanded ? 'chevron-down' : 'chevron-right'}
              />
            )}
          </button>
          <button
            className={styles.topicSelect}
            onClick={() => selectPersonalTopic(topic.id)}
            type="button"
          >
            <span className={`${styles.folderIcon} ${styles.personalFolderIcon}`}>
              <Icon name="folder" />
            </span>
            <span>
              <strong>{topic.name}</strong>
              <small>
                {counts.concepts} Concept{counts.concepts === 1 ? '' : 's'} ·{' '}
                {counts.cards} Card{counts.cards === 1 ? '' : 's'}
              </small>
            </span>
          </button>
          <span className={styles.personalOwnerMark} title="Mine (Personal)">
            M
          </span>
        </div>
        {isExpanded && children.length > 0 && (
          <div className={styles.topicChildren} role="group">
            {children.map((child) =>
              renderPersonalTopic(child, depth + 1)
            )}
          </div>
        )}
      </div>
    );
  }

  const topicHeading = normalizedSearch
    ? 'Search Results'
    : selectedOfficialTopic?.name ??
      selectedPersonalTopic?.name ??
      'Choose a Topic';
  const topicPath = normalizedSearch
    ? `Across ${data?.libraryName ?? 'Socrates'} and My Custom Topics`
    : selectedOfficialTopic
      ? officialPath(officialTree, selectedOfficialTopic.id)
      : selectedPersonalTopic
        ? personalTopicPath(selectedPersonalTopic.id)
        : 'Select a Topic from the unified tree';
  const topicSource = normalizedSearch
    ? null
    : selectedOfficialTopic
      ? 'official'
      : selectedPersonalTopic
        ? 'personal'
        : null;

  function renderInspector() {
    if (!selectedItem) {
      return (
        <div className={styles.inlineEmpty}>
          Select a Concept, Question, or Card to inspect it here.
        </div>
      );
    }

    if (selectedItem.kind === 'official-concept') {
      const concept = selectedItem.concept;
      const contextNodeId =
        selectedOfficialTopic &&
        concept.placementNodeIds.includes(selectedOfficialTopic.id)
          ? selectedOfficialTopic.id
          : concept.placementNodeIds[0]!;
      const conceptOfficialPath = contextNodeId
        ? officialPath(officialTree, contextNodeId)
        : 'Unplaced';
      const questions = (data?.questions ?? []).filter(
        (question) => question.concept_id === concept.id
      );
      const conceptOverlays = material.overlays.filter(
        (overlay) => overlay.official_concept_id === concept.id
      );
      const personalConceptIds = new Set(
        conceptOverlays.map((overlay) => overlay.personal_concept_id)
      );
      const personalCards = material.cards.filter((card) =>
        personalConceptIds.has(card.concept_id)
      );
      return (
        <>
          <div
            className={styles.inspectorTabs}
            role="tablist"
            aria-label="Official Concept details"
          >
            <button
              className={
                inspectorTab === 'overview' ? styles.activeInspectorTab : ''
              }
              onClick={() => setInspectorTab('overview')}
              type="button"
            >
              Overview
            </button>
            <button
              className={
                inspectorTab === 'questions' ? styles.activeInspectorTab : ''
              }
              onClick={() => setInspectorTab('questions')}
              type="button"
            >
              Questions <span>{questions.length}</span>
            </button>
            <button
              className={
                inspectorTab === 'details' ? styles.activeInspectorTab : ''
              }
              onClick={() => setInspectorTab('details')}
              type="button"
            >
              Details
            </button>
          </div>
          <div className={styles.personalLayerCard}>
            <div>
              <p>Your Content for This Concept</p>
              <strong>
                {personalCards.length} My Card
                {personalCards.length === 1 ? '' : 's'} ·{' '}
                {conceptOverlays.length} My Note
                {conceptOverlays.length === 1 ? '' : 's'}
              </strong>
            </div>
            <div className={styles.personalLayerActions}>
              <button
                onClick={() =>
                  onAddConcept({
                    libraryNodeId: contextNodeId,
                    officialConceptId: concept.id,
                    officialName: concept.name,
                    officialPath: conceptOfficialPath,
                    openCardAfterSave: false,
                  })
                }
                type="button"
              >
                ＋ Add My Concept
              </button>
              <button
                onClick={() =>
                  onAddCard({
                    libraryNodeId: contextNodeId,
                    officialConceptId: concept.id,
                    officialName: concept.name,
                    officialPath: conceptOfficialPath,
                    openCardAfterSave: true,
                  })
                }
                type="button"
              >
                ＋ Add My Card
              </button>
            </div>
          </div>
          {inspectorTab === 'questions' ? (
            <div className={styles.inspectorList}>
              {questions.map((question) => (
                <article key={question.id}>
                  <span className={styles.officialOwnerMark}>S</span>
                  <div>
                    <strong>{question.prompt}</strong>
                    <small>
                      {question.difficulty ?? 'Unspecified difficulty'} ·{' '}
                      {question.testing_angle ?? 'General'}
                    </small>
                  </div>
                </article>
              ))}
              {!questions.length && (
                <div className={styles.inlineEmpty}>
                  No published Questions are currently attached to this Concept.
                </div>
              )}
            </div>
          ) : inspectorTab === 'details' ? (
            <div className={styles.detailCard}>
              <div>
                <span>Status</span>
                <strong>Published</strong>
              </div>
              <div>
                <span>
                  {concept.placementNodeIds.length === 1
                    ? 'Topic path'
                    : 'Topic paths'}
                </span>
                <ul className={styles.placementPaths}>
                  {concept.placementNodeIds.map((topicId) => (
                    <li key={topicId}>{officialPath(officialTree, topicId)}</li>
                  ))}
                </ul>
              </div>
              <div>
                <span>Published Questions</span>
                <strong>{questions.length}</strong>
              </div>
            </div>
          ) : (
            <div className={`${styles.detailCard} ${styles.officialDetailCard}`}>
              {concept.summary && (
                <div>
                  <span>Summary</span>
                  <p>{concept.summary}</p>
                </div>
              )}
              {concept.whyItMatters && (
                <div>
                  <span>Why it matters</span>
                  <p>{concept.whyItMatters}</p>
                </div>
              )}
              {concept.bodyMarkdown && (
                <div>
                  <span>Concept content</span>
                  <div className={styles.officialBody}>
                    <MarkdownContent markdown={concept.bodyMarkdown} />
                  </div>
                </div>
              )}
              {!concept.summary &&
                !concept.whyItMatters &&
                !concept.bodyMarkdown && (
                  <p>No learner-visible overview is available yet.</p>
                )}
            </div>
          )}
        </>
      );
    }

    if (selectedItem.kind === 'official-question') {
      const { question, concept } = selectedItem;
      return (
        <div className={styles.detailCard}>
          <div>
            <span>Question</span>
            <p>{question.prompt}</p>
          </div>
          <div>
            <span>Official Concept</span>
            <strong>{concept.name}</strong>
          </div>
          <div>
            <span>Difficulty</span>
            <strong>{question.difficulty ?? 'Not specified'}</strong>
          </div>
          <div>
            <span>Testing Angle</span>
            <strong>{question.testing_angle ?? 'General'}</strong>
          </div>
          {question.explanation && (
            <div>
              <span>Explanation</span>
              <p>{question.explanation}</p>
            </div>
          )}
          <p className={styles.readOnlyNote}>
            Socrates Questions are read-only in Study Creator.
          </p>
        </div>
      );
    }

    if (selectedItem.kind === 'personal-concept') {
      const { concept, overlay } = selectedItem;
      const conceptCards = material.cards.filter(
        (card) => card.concept_id === concept.id
      );
      return (
        <>
          <div
            className={styles.inspectorTabs}
            role="tablist"
            aria-label="Personal Concept details"
          >
            <button
              className={
                inspectorTab === 'details' ? styles.activeInspectorTab : ''
              }
              onClick={() => setInspectorTab('details')}
              type="button"
            >
              Details
            </button>
            <button
              className={
                inspectorTab === 'cards' ? styles.activeInspectorTab : ''
              }
              onClick={() => setInspectorTab('cards')}
              type="button"
            >
              Cards <span>{conceptCards.length}</span>
            </button>
          </div>
          {inspectorTab === 'details' ? (
            <div className={styles.detailCard}>
              <div>
                <span>Personal Topic</span>
                <strong>{personalTopicPath(concept.topic_id)}</strong>
              </div>
              <div>
                <span>Description</span>
                <p>{concept.description || 'No description yet.'}</p>
              </div>
              {concept.source_reference && (
                <div>
                  <span>Source / Reference</span>
                  <p className={styles.sourceReferenceText}>
                    {concept.source_reference}
                  </p>
                </div>
              )}
              {overlay && (
                <div>
                  <span>Socrates connection</span>
                  <p>Linked to the selected official curriculum context.</p>
                </div>
              )}
              <div className={styles.detailActions}>
                <button
                  className={styles.secondary}
                  onClick={() => onEditConcept(concept)}
                  type="button"
                >
                  Edit
                </button>
                {overlay && (
                  <button
                    className={styles.secondary}
                    onClick={() => onDetach(overlay)}
                    type="button"
                  >
                    Detach
                  </button>
                )}
                <button
                  className={styles.dangerButton}
                  onClick={() => onDeleteConcept(concept)}
                  type="button"
                >
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.inspectorList}>
              <button
                className={styles.primary}
                onClick={() => onCreateCard(concept.id)}
                type="button"
              >
                ＋ New Card
              </button>
              {conceptCards.map((card) => (
                <article key={card.id}>
                  <span className={styles.personalOwnerMark}>M</span>
                  <button
                    onClick={() =>
                      chooseItem({
                        kind: 'personal-card',
                        id: card.id,
                        card,
                        concept,
                        overlay,
                      })
                    }
                    type="button"
                  >
                    <strong>{card.question}</strong>
                    <small>Personal Card</small>
                  </button>
                </article>
              ))}
              {!conceptCards.length && (
                <div className={styles.inlineEmpty}>
                  No Cards yet. Create the first Card for this Concept.
                </div>
              )}
            </div>
          )}
        </>
      );
    }

    const { card, concept } = selectedItem;
    return (
      <div className={styles.detailCard}>
        <div>
          <span>Question / Front</span>
          <p>{card.question}</p>
        </div>
        <div>
          <span>Answer / Back</span>
          <p>{card.answer}</p>
        </div>
        {card.source_reference && (
          <div>
            <span>Source / Reference</span>
            <p className={styles.sourceReferenceText}>{card.source_reference}</p>
          </div>
        )}
        <div>
          <span>Personal Concept</span>
          <strong>{concept.name}</strong>
        </div>
        <div>
          <span>Personal Topic</span>
          <strong>{personalTopicPath(concept.topic_id)}</strong>
        </div>
        <div className={styles.detailActions}>
          <button
            className={styles.secondary}
            onClick={() => onEditCard(card)}
            type="button"
          >
            Edit Card
          </button>
          <button
            className={styles.dangerButton}
            onClick={() => onDeleteCard(card)}
            type="button"
          >
            Delete Card
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${styles.columns} ${styles.browseColumns}`}
      data-study-creator-mode="browse"
    >
      <aside
        className={`${styles.column} ${styles.topicsColumn}`}
        aria-label="Unified Topic Tree"
      >
        <div className={styles.workspaceSectionIntro}>
          <div>
            <h2>1. Topic Tree</h2>
            <p>Browse Socrates Topics or organize your personal Topics.</p>
          </div>
          <span className={styles.libraryPill}>
            {data?.libraryName ?? 'No Library'}
          </span>
        </div>
        <div
          className={styles.unifiedTree}
          role="tree"
          aria-label="Official and personal Topic Tree"
        >
          <section
            className={styles.treeSection}
            aria-label="Socrates official Topics"
          >
            <div className={styles.treeSectionTitle}>
              <span className={styles.officialOwnerMark}>S</span>
              <div>
                <strong>Socrates</strong>
                <small>Official</small>
              </div>
            </div>
            {officialTree.map((topic) => renderOfficialTopic(topic))}
            {!data && (
              <div className={styles.inlineEmpty}>
                Choose an active Library from Home to browse Socrates.
              </div>
            )}
            {data && !officialTree.length && (
              <div className={styles.inlineEmpty}>
                This Library does not have a Topic Tree yet.
              </div>
            )}
          </section>
          <section
            className={`${styles.treeSection} ${styles.personalTreeSection}`}
            aria-label="My Topics"
          >
            <div className={styles.treeSectionTitle}>
              <span className={styles.personalOwnerMark}>M</span>
              <div>
                <strong>My Topics</strong>
                <small>Personal</small>
              </div>
            </div>
            {material.topics
              .filter((topic) => topic.parent_id === null)
              .sort(
                (left, right) =>
                  left.sort_order - right.sort_order ||
                  left.name.localeCompare(right.name)
              )
              .map((topic) => renderPersonalTopic(topic))}
            {!material.topics.length && (
              <div className={styles.compactEmpty}>No custom Topics yet.</div>
            )}
            <button
              className={styles.newCustomTopic}
              onClick={() => onCreateTopic()}
              type="button"
            >
              ＋ New Custom Topic
            </button>
          </section>
          {normalizedSearch &&
            visibleOfficialIds.size === 0 &&
            visiblePersonalIds.size === 0 && (
              <p className={styles.noResults}>
                No Topics or material match your search.
              </p>
            )}
        </div>
        <div className={styles.quickStats}>
          <h3>Quick Stats</h3>
          <p>
            <span>
              <i className={styles.statBlue}>
                <Icon name="book" />
              </i>{' '}
              Socrates Concepts
            </span>
            <strong>{data?.concepts.length ?? 0}</strong>
          </p>
          <p>
            <span>
              <i className={styles.statGreen}>
                <Icon name="book" />
              </i>{' '}
              My Concepts
            </span>
            <strong>{material.concepts.length}</strong>
          </p>
          <p>
            <span>
              <i className={styles.statPurple}>
                <Icon name="card" />
              </i>{' '}
              My Cards
            </span>
            <strong>{material.cards.length}</strong>
          </p>
        </div>
      </aside>

      <section
        className={`${styles.column} ${styles.conceptsColumn}`}
        aria-label="Unified content list"
      >
        <div className={styles.workspaceSectionIntro}>
          <div>
            <h2>2. Concepts &amp; Cards</h2>
            <p>Official Socrates material and your personal study material for this Topic.</p>
          </div>
        </div>
        <div className={`${styles.selectionHeading} ${styles.sectionSelection}`}>
          <span className={styles.headingIcon}>
            <Icon name="folder" />
          </span>
          <div>
            <p>
              {topicSource === 'official'
                ? 'Socrates'
                : topicSource === 'personal'
                  ? 'Mine'
                  : 'Selected Topic'}
            </p>
            <h2>{topicHeading}</h2>
          </div>
          {selectedPersonalTopic && (
            <button
              aria-label="Edit selected personal Topic"
              className={styles.iconButton}
              onClick={() => onEditTopic(selectedPersonalTopic)}
              title="Edit Topic"
              type="button"
            >
              <Icon name="pencil" />
            </button>
          )}
        </div>
        {selectedPersonalTopic && (
          <div className={styles.contextCreationBar}>
            <button
              className={styles.primary}
              onClick={() => onCreateConcept(selectedPersonalTopic.id)}
              type="button"
            >
              ＋ New Personal Concept
            </button>
          </div>
        )}
        {selectedOfficialTopic && !normalizedSearch && (
          <div className={styles.contextCreationBar}>
            <button
              className={styles.primary}
              onClick={() =>
                onAddConcept({
                  libraryNodeId: selectedOfficialTopic.id,
                  officialConceptId: null,
                  officialName: selectedOfficialTopic.name,
                  officialPath: topicPath,
                  openCardAfterSave: false,
                })
              }
              type="button"
            >
              ＋ Add My Concept Here
            </button>
          </div>
        )}
        <div className={styles.contentListHeader}>
          <span>Name</span>
          <span>Type</span>
          <span>Owner</span>
        </div>
        <div className={styles.unifiedContentList}>
          {items.map((item) => {
            const itemKey = `${item.kind}:${item.id}`;
            const personal = ownerFor(item) === 'personal';
            const context =
              item.kind === 'official-question' ||
              item.kind === 'personal-card'
                ? item.concept.name
                : item.kind === 'personal-concept'
                  ? personalTopicPath(item.concept.topic_id)
                  : officialPath(
                      officialTree,
                      item.concept.placementNodeIds[0]
                    );
            return (
              <button
                className={`${styles.unifiedContentRow} ${
                  effectiveSelectedItemKey === itemKey
                    ? styles.selectedContentRow
                    : ''
                }`}
                key={itemKey}
                onClick={() => chooseItem(item)}
                type="button"
              >
                <span className={styles.contentName}>
                  <i
                    className={
                      personal
                        ? styles.personalContentIcon
                        : styles.officialContentIcon
                    }
                  >
                    <Icon
                      name={item.kind.endsWith('concept') ? 'book' : 'card'}
                    />
                  </i>
                  <span>
                    <strong>{titleFor(item)}</strong>
                    <small>{context}</small>
                  </span>
                </span>
                <span className={styles.typeCell}>{typeFor(item)}</span>
                <span className={styles.ownerCell}>
                  <i
                    className={
                      personal
                        ? styles.personalOwnerMark
                        : styles.officialOwnerMark
                    }
                  >
                    {personal ? 'M' : 'S'}
                  </i>
                  <small>{personal ? 'Mine' : 'Socrates'}</small>
                </span>
              </button>
            );
          })}
          {!selectedTopic && (
            <div className={styles.inlineEmpty}>
              Choose an official or personal Topic to browse its material.
            </div>
          )}
          {selectedTopic && !items.length && (
            <div className={styles.inlineEmpty}>
              {normalizedSearch
                ? 'No Socrates or personal material matches this search.'
                : filter !== 'all'
                  ? 'No material in this Topic matches the current filter.'
                : 'This Topic does not contain any material yet.'}
            </div>
          )}
        </div>
        {selectedPersonalTopic && (
          <div className={styles.contextActions}>
            <button
              className={styles.secondary}
              onClick={() => onCreateTopic(selectedPersonalTopic.id)}
              type="button"
            >
              ＋ Child Topic
            </button>
            <button
              className={styles.dangerButton}
              onClick={() => onDeleteTopic(selectedPersonalTopic)}
              type="button"
            >
              Delete Topic
            </button>
          </div>
        )}
      </section>

      <section
        className={`${styles.column} ${styles.cardsColumn}`}
        aria-label="Material inspector"
      >
        <div className={styles.workspaceSectionIntro}>
          <div>
            <h2>3. Details</h2>
            <p>Review the selected Concept, Question, or Card.</p>
          </div>
        </div>
        <div className={`${styles.selectionHeading} ${styles.sectionSelection}`}>
          <span
            className={`${styles.headingIcon} ${
              selectedItem && ownerFor(selectedItem) === 'personal'
                ? styles.personalHeadingIcon
                : styles.purpleIcon
            }`}
          >
            <Icon
              name={selectedItem?.kind.endsWith('concept') ? 'book' : 'card'}
            />
          </span>
          <div>
            <p>
              {selectedItem
                ? `${
                    ownerFor(selectedItem) === 'official'
                      ? 'Socrates'
                      : 'Mine'
                  } · ${typeFor(selectedItem)}`
                : 'Selected Material'}
            </p>
            <h2>{selectedItem ? titleFor(selectedItem) : 'Select material'}</h2>
          </div>
        </div>
        <div className={styles.inspectorBody}>{renderInspector()}</div>
      </section>
    </div>
  );
}
