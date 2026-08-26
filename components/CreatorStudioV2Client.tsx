'use client';

import { useMemo, useState } from 'react';
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
import styles from './CreatorStudioV2Client.module.css';

type Topic = {
  id: string;
  name: string;
  children: Topic[];
};

type DialogMode = 'add' | 'rename' | 'move' | null;
type StatusTone = 'error' | 'success' | 'info';
type Status = { tone: StatusTone; message: string } | null;

const ROOT_TOPIC_ID = 'nursing';

const initialTopics: Topic[] = [
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

export function CreatorStudioV2Client() {
  const [concept, setConcept] = useState('');
  const [topics, setTopics] = useState<Topic[]>(initialTopics);
  const [activeTopicId, setActiveTopicId] = useState('fluids-electrolytes');
  const [selectedTopicIds, setSelectedTopicIds] = useState<Set<string>>(
    new Set(['fluids-electrolytes', 'fluid-overload'])
  );
  const [expandedTopicIds, setExpandedTopicIds] = useState<Set<string>>(
    new Set([ROOT_TOPIC_ID, 'adult-health', 'cardiovascular', 'fluids-electrolytes'])
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [moveDestinationId, setMoveDestinationId] = useState('');
  const [status, setStatus] = useState<Status>(null);

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
    if (activeTopic.id === ROOT_TOPIC_ID) {
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
    if (activeTopic.id === ROOT_TOPIC_ID) {
      showStatus('error', 'The Nursing root cannot be moved.');
      return;
    }
    setMoveDestinationId(moveDestinations[0]?.id ?? '');
    setDialogMode('move');
  }

  function saveNameDialog() {
    const name = nameDraft.trim();
    if (!activeTopic || !name) {
      showStatus('error', 'Enter a subtopic name.');
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

  function moveActiveTopic() {
    if (!activeTopic || !moveDestinationId) {
      showStatus('error', 'Choose a destination topic.');
      return;
    }
    const destination = findTopic(topics, moveDestinationId);
    if (!destination) {
      showStatus('error', 'The selected destination is unavailable.');
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

  function deleteActiveTopic() {
    if (!activeTopic) {
      showStatus('error', 'Select a topic to delete.');
      return;
    }
    if (activeTopic.id === ROOT_TOPIC_ID) {
      showStatus('error', 'The Nursing root cannot be deleted.');
      return;
    }
    if (activeTopic.children.length) {
      showStatus('error', 'Move or remove this topic’s subtopics first.');
      return;
    }
    if (!window.confirm(`Delete “${activeTopic.name}”?`)) return;
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
    if (
      (concept.trim() || selectedTopicIds.size > 0) &&
      !window.confirm('Clear the concept draft and its selected topics?')
    ) {
      return;
    }
    setConcept('');
    setSelectedTopicIds(new Set());
    setStatus(null);
  }

  function saveConcept() {
    if (!concept.trim()) {
      showStatus('error', 'Write a concept or explanation before saving.');
      return;
    }
    if (!selectedTopicIds.size) {
      showStatus('error', 'Select at least one topic before saving.');
      return;
    }
    showStatus('success', 'Concept ready for future persistence.');
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
              <button className={styles.secondaryButton} type="button" onClick={clearDraft}>
                Clear
              </button>
              <button className={styles.primaryButton} type="button" onClick={saveConcept}>
                Save Concept
              </button>
              <button
                className={styles.menuButton}
                type="button"
                title="More Creator Studio options will be added later"
                aria-label="Creator Studio menu placeholder"
              >
                <Menu size={27} />
              </button>
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
                <button className={styles.toolButton} type="button" onClick={openAddDialog}>
                  <Plus size={18} /> Add Subtopic
                </button>
                <button className={styles.toolButton} type="button" onClick={openRenameDialog}>
                  <Pencil size={17} /> Rename
                </button>
                <button className={styles.toolButton} type="button" onClick={deleteActiveTopic}>
                  <Trash2 size={17} /> Delete
                </button>
                <button className={styles.toolButton} type="button" onClick={openMoveDialog}>
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
                        <button className={styles.primaryButton} type="button" onClick={moveActiveTopic}>
                          Move
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
                            if (event.key === 'Enter') saveNameDialog();
                          }}
                          placeholder={dialogMode === 'add' ? 'Subtopic name' : 'Topic name'}
                        />
                      </label>
                      <div className={styles.dialogActions}>
                        <button className={styles.secondaryButton} type="button" onClick={() => setDialogMode(null)}>
                          Cancel
                        </button>
                        <button className={styles.primaryButton} type="button" onClick={saveNameDialog}>
                          Save
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

          <footer className={styles.bottomActions}>
            <div className={styles.infoMessage}>
              <Info size={22} />
              <span>Select multiple topics to assign this concept to more than one location.</span>
            </div>
            <button className={`${styles.primaryButton} ${styles.largeSaveButton}`} type="button" onClick={saveConcept}>
              Save Concept
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
