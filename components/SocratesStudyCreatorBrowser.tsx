'use client';

import { useMemo, useState } from 'react';
import {
  buildConceptTopicTree,
  collectConceptTopicSearchIds,
  findConceptTopicPath,
  type ConceptTopic,
} from '@/lib/concept-topic-tree';
import { MarkdownContent } from './MarkdownContent';
import { StudyCreatorIcon as Icon } from './StudyCreatorIcon';
import type {
  PersonalMaterial,
  PersonalOverlay,
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

export type OfficialBrowserData = {
  libraryId: string;
  libraryName: string;
  nodes: OfficialNode[];
  concepts: OfficialConcept[];
};

type SocratesStudyCreatorBrowserProps = {
  data: OfficialBrowserData | null;
  material: PersonalMaterial;
  onAddConcept: (target: OverlayActionTarget) => void;
  onAddCard: (target: OverlayActionTarget) => void;
  onDetach: (overlay: PersonalOverlay) => void;
};

type OverlayActionTarget = {
  libraryNodeId: string;
  officialConceptId: string | null;
  officialName: string;
  officialPath: string;
  openCardAfterSave: boolean;
};

function pathLabel(topics: ConceptTopic[], topicId: string) {
  return (
    findConceptTopicPath(topics, topicId)
      ?.map((topic) => topic.name)
      .join(' › ') || 'Unplaced'
  );
}

function addPathAndAncestors(
  topics: ConceptTopic[],
  topicId: string,
  visibleIds: Set<string>
) {
  findConceptTopicPath(topics, topicId)?.forEach((topic) =>
    visibleIds.add(topic.id)
  );
}

export function SocratesStudyCreatorBrowser({
  data,
  material,
  onAddConcept,
  onAddCard,
  onDetach,
}: SocratesStudyCreatorBrowserProps) {
  const topicTree = useMemo(
    () => buildConceptTopicTree(data?.nodes ?? []),
    [data?.nodes]
  );
  const [search, setSearch] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(topicTree.map((topic) => topic.id))
  );
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(
    topicTree[0]?.id ?? null
  );
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);
  const normalizedSearch = search.trim().toLocaleLowerCase();

  const visibleTopicIds = useMemo(() => {
    if (!normalizedSearch) return new Set<string>();
    const visible = collectConceptTopicSearchIds(topicTree, normalizedSearch);

    data?.concepts.forEach((concept) => {
      const conceptMatches =
        concept.name.toLocaleLowerCase().includes(normalizedSearch) ||
        concept.placementNodeIds.some((topicId) =>
          pathLabel(topicTree, topicId)
            .toLocaleLowerCase()
            .includes(normalizedSearch)
        );
      if (conceptMatches) {
        concept.placementNodeIds.forEach((topicId) =>
          addPathAndAncestors(topicTree, topicId, visible)
        );
      }
    });

    return visible;
  }, [data?.concepts, normalizedSearch, topicTree]);

  const conceptSearchResults = useMemo(() => {
    if (!normalizedSearch) return [];
    return (data?.concepts ?? [])
      .map((concept) => ({
        ...concept,
        paths: concept.placementNodeIds.map((topicId) =>
          pathLabel(topicTree, topicId)
        ),
      }))
      .filter(
        (concept) =>
          concept.name.toLocaleLowerCase().includes(normalizedSearch) ||
          concept.paths.some((path) =>
            path.toLocaleLowerCase().includes(normalizedSearch)
          )
      )
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [data?.concepts, normalizedSearch, topicTree]);

  const selectedTopic = selectedTopicId
    ? data?.nodes.find((node) => node.id === selectedTopicId) ?? null
    : null;
  const selectedTopicPath = selectedTopic
    ? pathLabel(topicTree, selectedTopic.id)
    : '';
  const directConcepts = (data?.concepts ?? [])
    .filter((concept) =>
      selectedTopicId ? concept.placementNodeIds.includes(selectedTopicId) : false
    )
    .sort((left, right) => left.name.localeCompare(right.name));
  const selectedConcept = selectedConceptId
    ? data?.concepts.find((concept) => concept.id === selectedConceptId) ?? null
    : null;
  const selectedConceptPaths = selectedConcept
    ? selectedConcept.placementNodeIds.map((topicId) =>
        pathLabel(topicTree, topicId)
      )
    : [];
  const selectedTopicOverlays = material.overlays.filter(
    (overlay) =>
      overlay.library_node_id === selectedTopicId &&
      overlay.official_concept_id === null
  );
  const selectedConceptOverlays = material.overlays.filter(
    (overlay) =>
      overlay.library_node_id === selectedTopicId &&
      overlay.official_concept_id === selectedConceptId
  );

  function personalConcept(overlay: PersonalOverlay) {
    return material.concepts.find(
      (concept) => concept.id === overlay.personal_concept_id
    );
  }

  function personalTopicLabel(topicId: string) {
    const names: string[] = [];
    const visited = new Set<string>();
    let topic = material.topics.find((candidate) => candidate.id === topicId);
    while (topic && !visited.has(topic.id)) {
      visited.add(topic.id);
      names.unshift(topic.name);
      topic = topic.parent_id
        ? material.topics.find((candidate) => candidate.id === topic?.parent_id)
        : undefined;
    }
    return names.join(' › ') || 'My Topics';
  }

  function cardsForOverlay(overlay: PersonalOverlay) {
    return material.cards.filter(
      (card) => card.concept_id === overlay.personal_concept_id
    );
  }

  function toggleTopic(topicId: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
  }

  function selectTopic(topicId: string) {
    setSelectedTopicId(topicId);
    setSelectedConceptId(null);
    setExpandedIds((current) => new Set(current).add(topicId));
  }

  function selectConcept(concept: OfficialConcept, topicId?: string) {
    const placementId =
      topicId ||
      (selectedTopicId && concept.placementNodeIds.includes(selectedTopicId)
        ? selectedTopicId
        : concept.placementNodeIds[0]);
    if (placementId) {
      setSelectedTopicId(placementId);
      setExpandedIds((current) => {
        const next = new Set(current);
        findConceptTopicPath(topicTree, placementId)?.forEach((topic) =>
          next.add(topic.id)
        );
        return next;
      });
    }
    setSelectedConceptId(concept.id);
  }

  function renderTopic(topic: ConceptTopic, depth = 0): React.ReactNode {
    if (normalizedSearch && !visibleTopicIds.has(topic.id)) return null;
    const isExpanded = normalizedSearch
      ? topic.children.some((child) => visibleTopicIds.has(child.id))
      : expandedIds.has(topic.id);
    const isSelected = selectedTopicId === topic.id;
    const directCount = (data?.concepts ?? []).filter((concept) =>
      concept.placementNodeIds.includes(topic.id)
    ).length;

    return (
      <div
        aria-selected={isSelected}
        className={styles.topicBranch}
        key={topic.id}
        role="treeitem"
      >
        <div
          className={`${styles.topicRow} ${isSelected ? styles.selectedTopic : ''}`}
          style={{ paddingLeft: 10 + depth * 18 }}
        >
          <button
            aria-expanded={topic.children.length ? isExpanded : undefined}
            aria-label={
              topic.children.length
                ? `${isExpanded ? 'Collapse' : 'Expand'} ${topic.name}`
                : `${topic.name} has no subtopics`
            }
            className={styles.expandButton}
            disabled={!topic.children.length}
            onClick={() => toggleTopic(topic.id)}
            type="button"
          >
            {topic.children.length > 0 && (
              <Icon name={isExpanded ? 'chevron-down' : 'chevron-right'} />
            )}
          </button>
          <button
            aria-current={isSelected ? 'true' : undefined}
            className={styles.topicSelect}
            onClick={() => selectTopic(topic.id)}
            type="button"
          >
            <span className={styles.folderIcon}><Icon name="folder" /></span>
            <span>
              <strong>{topic.name}</strong>
              <small>{directCount} published Concept{directCount === 1 ? '' : 's'}</small>
            </span>
          </button>
          <span className={styles.readOnlyMark} title="Socrates read-only">S</span>
        </div>
        {isExpanded && topic.children.length > 0 && (
          <div className={styles.topicChildren} role="group">
            {topic.children.map((child) => renderTopic(child, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.columns} data-study-creator-mode="socrates">
      <aside className={`${styles.column} ${styles.topicsColumn}`} aria-label="Socrates Topics">
        <div className={styles.columnTitle}>
          <h2>Socrates</h2>
          <span className={styles.socratesBadge}>Read only</span>
        </div>
        <p className={styles.libraryContext}>{data ? `${data.libraryName} Library` : 'No active Library'}</p>
        <label className={styles.searchField}>
          <span aria-hidden="true"><Icon name="search" /></span>
          <input
            aria-label="Search Socrates Topics and Concepts"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search Socrates..."
            type="search"
            value={search}
          />
        </label>
        <div className={styles.topicTree} role="tree" aria-label="Socrates Topic Tree">
          {topicTree.map((topic) => renderTopic(topic))}
          {!data && (
            <div className={styles.inlineEmpty}>Choose an active Library from Home to browse Socrates.</div>
          )}
          {data && topicTree.length === 0 && (
            <div className={styles.inlineEmpty}>This Library does not have a Topic Tree yet.</div>
          )}
          {normalizedSearch && visibleTopicIds.size === 0 && (
            <p className={styles.noResults}>No Socrates Topics or Concepts match your search.</p>
          )}
        </div>
        {conceptSearchResults.length > 0 && (
          <section className={styles.officialSearchResults} aria-label="Socrates Concept search results">
            <h3>Concept matches</h3>
            {conceptSearchResults.map((concept) => (
              <button key={concept.id} onClick={() => selectConcept(concept)} type="button">
                <strong>{concept.name}</strong>
                <small>{concept.paths.join(' · ')}</small>
              </button>
            ))}
          </section>
        )}
        <div className={styles.quickStats}>
          <h3>Socrates Library</h3>
          <p><span><i className={styles.statBlue}><Icon name="folder" /></i> Topics</span><strong>{data?.nodes.length ?? 0}</strong></p>
          <p><span><i className={styles.statGreen}><Icon name="book" /></i> Published Concepts</span><strong>{data?.concepts.length ?? 0}</strong></p>
        </div>
      </aside>

      <section className={`${styles.column} ${styles.conceptsColumn}`} aria-label="Socrates Concepts">
        <div className={styles.selectionHeading}>
          <span className={styles.headingIcon}><Icon name="folder" /></span>
          <div>
            <p>Socrates Topic · Read only</p>
            <h2>{selectedTopic?.name ?? 'No Topic selected'}</h2>
          </div>
        </div>
        <div className={styles.readOnlyStrip}>{selectedTopicPath || 'Select a Topic from the Socrates tree'}</div>
        <div className={styles.panelBody}>
          <div className={styles.sectionLead}>
            <div>
              <h3>Published Concepts</h3>
              <p>Placed directly at this Topic in the active Library.</p>
            </div>
            {selectedTopic ? (
              <button
                className={styles.primary}
                onClick={() => onAddConcept({
                  libraryNodeId: selectedTopic.id,
                  officialConceptId: null,
                  officialName: selectedTopic.name,
                  officialPath: selectedTopicPath,
                  openCardAfterSave: false,
                })}
                type="button"
              >
                ＋ Add My Concept
              </button>
            ) : (
              <span className={styles.socratesBadge}>Socrates</span>
            )}
          </div>
          {selectedTopicOverlays.length > 0 && (
            <section className={styles.mineSection} aria-label="My Concepts linked to this Socrates Topic">
              <div className={styles.mineSectionTitle}>
                <h3>My material here</h3>
                <span className={styles.mineBadge}>Mine · Private</span>
              </div>
              {selectedTopicOverlays.map((overlay) => {
                const concept = personalConcept(overlay);
                if (!concept) return null;
                return (
                  <article className={styles.mineConceptRow} key={overlay.id}>
                    <div>
                      <strong>{concept.name}</strong>
                      <small>{personalTopicLabel(concept.topic_id)} · {cardsForOverlay(overlay).length} Card{cardsForOverlay(overlay).length === 1 ? '' : 's'}</small>
                    </div>
                    <button className={styles.linkButton} onClick={() => onDetach(overlay)} type="button">Detach</button>
                  </article>
                );
              })}
            </section>
          )}
          <div className={styles.conceptList}>
            {directConcepts.map((concept) => (
              <article
                className={`${styles.conceptRow} ${selectedConceptId === concept.id ? styles.selectedConcept : ''} ${styles.officialConceptRow}`}
                key={concept.id}
              >
                <button className={styles.conceptSelect} onClick={() => selectConcept(concept)} type="button">
                  <span className={styles.bookIcon}><Icon name="book" /></span>
                  <span>
                    <strong>{concept.name}</strong>
                    <small>{concept.placementNodeIds.length > 1 ? `${concept.placementNodeIds.length} placements` : selectedTopicPath}</small>
                  </span>
                </button>
                <span className={styles.chevron}><Icon name="chevron-right" /></span>
              </article>
            ))}
            {selectedTopic && directConcepts.length === 0 && (
              <div className={styles.inlineEmpty}>No published Concepts are placed directly at this Topic.</div>
            )}
            {!selectedTopic && (
              <div className={styles.inlineEmpty}>Select a Socrates Topic to browse its published Concepts.</div>
            )}
          </div>
        </div>
      </section>

      <section className={`${styles.column} ${styles.cardsColumn}`} aria-label="Socrates Concept context">
        <div className={styles.selectionHeading}>
          <span className={`${styles.headingIcon} ${styles.purpleIcon}`}><Icon name="book" /></span>
          <div>
            <p>Socrates Concept · Read only</p>
            <h2>{selectedConcept?.name ?? 'No Concept selected'}</h2>
          </div>
        </div>
        <div className={styles.readOnlyStrip}>Official learner-visible context</div>
        {selectedConcept ? (
          <div className={styles.panelBody}>
            <div className={styles.overlayActionBar}>
              <div>
                <strong>Add your own study material</strong>
                <small>Private to your account; Socrates stays unchanged.</small>
              </div>
              <button
                className={styles.primary}
                onClick={() => onAddCard({
                  libraryNodeId: selectedTopicId!,
                  officialConceptId: selectedConcept.id,
                  officialName: selectedConcept.name,
                  officialPath: selectedTopicPath,
                  openCardAfterSave: true,
                })}
                type="button"
              >
                ＋ Add My Card
              </button>
            </div>
            {selectedConceptOverlays.map((overlay) => {
              const concept = personalConcept(overlay);
              if (!concept) return null;
              const overlayCards = cardsForOverlay(overlay);
              return (
                <section className={styles.mineDetailCard} key={overlay.id} aria-label={`My material for ${selectedConcept.name}`}>
                  <div className={styles.mineSectionTitle}>
                    <div><span className={styles.mineBadge}>Mine · Private</span><h3>{concept.name}</h3></div>
                    <button className={styles.linkButton} onClick={() => onDetach(overlay)} type="button">Detach</button>
                  </div>
                  <p>Canonical home: <strong>{personalTopicLabel(concept.topic_id)}</strong></p>
                  {concept.description && <p>{concept.description}</p>}
                  <div className={styles.mineCards}>
                    {overlayCards.map((card) => (
                      <article key={card.id}>
                        <p><strong>Q:</strong> {card.question}</p>
                        <p><strong>A:</strong> {card.answer}</p>
                      </article>
                    ))}
                    {overlayCards.length === 0 && <p>No personal Cards yet.</p>}
                  </div>
                </section>
              );
            })}
            <div className={`${styles.detailCard} ${styles.officialDetailCard}`}>
              <div><span>Concept name</span><strong>{selectedConcept.name}</strong></div>
              <div>
                <span>{selectedConceptPaths.length === 1 ? 'Topic path' : 'Topic paths'}</span>
                <ul className={styles.placementPaths}>
                  {selectedConceptPaths.map((path) => <li key={path}>{path}</li>)}
                </ul>
              </div>
              {selectedConcept.summary && <div><span>Summary</span><p>{selectedConcept.summary}</p></div>}
              {selectedConcept.whyItMatters && <div><span>Why it matters</span><p>{selectedConcept.whyItMatters}</p></div>}
              {selectedConcept.bodyMarkdown && (
                <div>
                  <span>Overview</span>
                  <div className={styles.officialBody}><MarkdownContent markdown={selectedConcept.bodyMarkdown} /></div>
                </div>
              )}
              {!selectedConcept.summary && !selectedConcept.whyItMatters && !selectedConcept.bodyMarkdown && (
                <p>No learner-visible summary is available for this Concept yet.</p>
              )}
              <p className={styles.readOnlyNote}>Official Socrates material is read-only. Personal material above remains yours.</p>
            </div>
          </div>
        ) : (
          <div className={styles.emptyColumn}>
            <span><Icon name="book" /></span>
            <h2>Choose a Socrates Concept</h2>
            <p>Its official context and Topic placement will appear here.</p>
          </div>
        )}
      </section>
    </div>
  );
}
