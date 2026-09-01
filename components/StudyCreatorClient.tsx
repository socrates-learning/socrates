'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './StudyCreatorClient.module.css';

type View = 'home' | 'card' | 'concept' | 'material';

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

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'message' in error) {
    return String(error.message);
  }
  return 'Something went wrong. Please try again.';
}

export function StudyCreatorClient({ ownerId }: StudyCreatorClientProps) {
  const [view, setView] = useState<View>('home');
  const [topics, setTopics] = useState<PersonalTopic[]>([]);
  const [concepts, setConcepts] = useState<PersonalConcept[]>([]);
  const [cards, setCards] = useState<PersonalCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const [cardId, setCardId] = useState<string | null>(null);
  const [cardConceptId, setCardConceptId] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');

  const [conceptId, setConceptId] = useState<string | null>(null);
  const [conceptTopicId, setConceptTopicId] = useState('');
  const [conceptName, setConceptName] = useState('');
  const [conceptDescription, setConceptDescription] = useState('');
  const [addCardAfterConcept, setAddCardAfterConcept] = useState(false);

  const [newTopicName, setNewTopicName] = useState('');
  const [newTopicParentId, setNewTopicParentId] = useState('');

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
    } else {
      setTopics((topicResult.data ?? []) as PersonalTopic[]);
      setConcepts((conceptResult.data ?? []) as PersonalConcept[]);
      setCards((cardResult.data ?? []) as PersonalCard[]);
    }
    setIsLoading(false);
  }, [ownerId]);

  useEffect(() => {
    loadMaterial();
  }, [loadMaterial]);

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

  const clearFeedback = () => {
    setMessage('');
    setError('');
  };

  function openView(nextView: View) {
    clearFeedback();
    setView(nextView);
  }

  function resetCardForm(nextConceptId = '') {
    setCardId(null);
    setCardConceptId(nextConceptId || concepts[0]?.id || '');
    setQuestion('');
    setAnswer('');
  }

  function resetConceptForm() {
    setConceptId(null);
    setConceptTopicId(topics[0]?.id || '');
    setConceptName('');
    setConceptDescription('');
    setAddCardAfterConcept(false);
  }

  function beginCreateCard() {
    resetCardForm();
    openView('card');
  }

  function beginCreateConcept(shouldAddCard = false) {
    resetConceptForm();
    setAddCardAfterConcept(shouldAddCard);
    openView('concept');
  }

  function beginEditCard(card: PersonalCard) {
    setCardId(card.id);
    setCardConceptId(card.concept_id);
    setQuestion(card.question);
    setAnswer(card.answer);
    openView('card');
  }

  function beginEditConcept(concept: PersonalConcept) {
    setConceptId(concept.id);
    setConceptTopicId(concept.topic_id);
    setConceptName(concept.name);
    setConceptDescription(concept.description ?? '');
    setAddCardAfterConcept(false);
    openView('concept');
  }

  async function saveCard(event: React.FormEvent) {
    event.preventDefault();
    clearFeedback();

    if (!cardConceptId || !question.trim() || !answer.trim()) {
      setError('Choose a Concept and complete both the Question and Answer.');
      return;
    }

    setIsSaving(true);
    const values = {
      owner_id: ownerId,
      concept_id: cardConceptId,
      question: question.trim(),
      answer: answer.trim(),
    };
    const result = cardId
      ? await supabase
          .from('personal_cards')
          .update(values)
          .eq('id', cardId)
          .eq('owner_id', ownerId)
      : await supabase.from('personal_cards').insert(values);

    if (result.error) {
      setError(getErrorMessage(result.error));
    } else {
      await loadMaterial();
      resetCardForm(cardConceptId);
      setMessage(cardId ? 'Card updated.' : 'Card saved. You can add another.');
    }
    setIsSaving(false);
  }

  async function saveConcept(event: React.FormEvent) {
    event.preventDefault();
    clearFeedback();

    if (!conceptTopicId || !conceptName.trim()) {
      setError('Add a Topic and enter a Concept name.');
      return;
    }

    setIsSaving(true);
    const values = {
      owner_id: ownerId,
      topic_id: conceptTopicId,
      name: conceptName.trim(),
      description: conceptDescription.trim() || null,
    };

    if (conceptId) {
      const result = await supabase
        .from('personal_concepts')
        .update(values)
        .eq('id', conceptId)
        .eq('owner_id', ownerId);

      if (result.error) {
        setError(getErrorMessage(result.error));
      } else {
        await loadMaterial();
        setMessage('Concept updated.');
      }
      setIsSaving(false);
      return;
    }

    const result = await supabase
      .from('personal_concepts')
      .insert(values)
      .select('id')
      .single();

    if (result.error) {
      setError(getErrorMessage(result.error));
    } else {
      await loadMaterial();
      if (addCardAfterConcept) {
        resetCardForm(result.data.id);
        setView('card');
        setMessage('Concept saved. Add its first card.');
      } else {
        setConceptId(result.data.id);
        setMessage('Concept saved.');
      }
    }
    setIsSaving(false);
  }

  async function createTopic(event: React.FormEvent) {
    event.preventDefault();
    clearFeedback();

    if (!newTopicName.trim()) {
      setError('Enter a Topic name.');
      return;
    }

    setIsSaving(true);
    const { data: createdTopic, error: createError } = await supabase
      .from('personal_topics')
      .insert({
        owner_id: ownerId,
        parent_id: newTopicParentId || null,
        name: newTopicName.trim(),
      })
      .select('id')
      .single();

    if (createError) {
      setError(getErrorMessage(createError));
    } else {
      setNewTopicName('');
      setNewTopicParentId('');
      await loadMaterial();
      if (!conceptTopicId) setConceptTopicId(createdTopic.id);
      setMessage('Topic added to your personal Topic Tree.');
    }
    setIsSaving(false);
  }

  async function renameTopic(topic: PersonalTopic) {
    const nextName = window.prompt('Rename this Topic', topic.name)?.trim();
    if (!nextName || nextName === topic.name) return;

    clearFeedback();
    const { error: renameError } = await supabase
      .from('personal_topics')
      .update({ name: nextName })
      .eq('id', topic.id)
      .eq('owner_id', ownerId);

    if (renameError) setError(getErrorMessage(renameError));
    else {
      await loadMaterial();
      setMessage('Topic renamed.');
    }
  }

  function descendantIds(topicId: string) {
    const found = new Set<string>();
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

  async function moveTopic(topic: PersonalTopic, parentId: string) {
    clearFeedback();
    const { error: moveError } = await supabase
      .from('personal_topics')
      .update({ parent_id: parentId || null })
      .eq('id', topic.id)
      .eq('owner_id', ownerId);

    if (moveError) setError(getErrorMessage(moveError));
    else {
      await loadMaterial();
      setMessage('Topic moved.');
    }
  }

  async function deleteTopic(topic: PersonalTopic) {
    const hasChildren = topics.some((item) => item.parent_id === topic.id);
    const hasConcepts = concepts.some((concept) => concept.topic_id === topic.id);
    if (hasChildren || hasConcepts) {
      setError('Move or delete this Topic’s child Topics and Concepts first.');
      return;
    }
    if (!window.confirm(`Delete the empty Topic “${topic.name}”?`)) return;

    clearFeedback();
    const { error: deleteError } = await supabase
      .from('personal_topics')
      .delete()
      .eq('id', topic.id)
      .eq('owner_id', ownerId);

    if (deleteError) setError(getErrorMessage(deleteError));
    else {
      await loadMaterial();
      setMessage('Empty Topic deleted.');
    }
  }

  async function deleteCard(card: PersonalCard) {
    if (!window.confirm('Delete this personal Card?')) return;
    clearFeedback();
    const { error: deleteError } = await supabase
      .from('personal_cards')
      .delete()
      .eq('id', card.id)
      .eq('owner_id', ownerId);

    if (deleteError) setError(getErrorMessage(deleteError));
    else {
      await loadMaterial();
      setMessage('Card deleted.');
    }
  }

  async function deleteConcept(concept: PersonalConcept) {
    const cardCount = cards.filter((card) => card.concept_id === concept.id).length;
    const warning = cardCount
      ? `Delete “${concept.name}” and its ${cardCount} personal Card${cardCount === 1 ? '' : 's'}?`
      : `Delete the personal Concept “${concept.name}”?`;
    if (!window.confirm(warning)) return;

    clearFeedback();
    const { error: deleteError } = await supabase
      .from('personal_concepts')
      .delete()
      .eq('id', concept.id)
      .eq('owner_id', ownerId);

    if (deleteError) setError(getErrorMessage(deleteError));
    else {
      await loadMaterial();
      setMessage('Concept deleted.');
    }
  }

  const query = search.trim().toLowerCase();
  const visibleConcepts = concepts.filter((concept) => {
    if (!query) return true;
    const conceptCards = cards.filter((card) => card.concept_id === concept.id);
    return (
      concept.name.toLowerCase().includes(query) ||
      (concept.description ?? '').toLowerCase().includes(query) ||
      topicLabel(concept.topic_id).toLowerCase().includes(query) ||
      conceptCards.some(
        (card) =>
          card.question.toLowerCase().includes(query) ||
          card.answer.toLowerCase().includes(query)
      )
    );
  });

  function renderFeedback() {
    return (
      <>
        {message && <p className={styles.status} role="status">{message}</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </>
    );
  }

  function renderTopicTree(parentId: string | null, depth = 0): React.ReactNode {
    return topics
      .filter((topic) => topic.parent_id === parentId)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
      .map((topic) => {
        const unavailableParents = descendantIds(topic.id);
        unavailableParents.add(topic.id);
        return (
          <div className={styles.topicItem} key={topic.id} style={{ marginLeft: depth * 12 }}>
            <div className={styles.topicName}>
              <span>{topic.name}</span>
              <span>
                <button className={styles.tinyButton} type="button" onClick={() => renameTopic(topic)}>
                  Rename
                </button>
                <button
                  className={`${styles.tinyButton} ${styles.tinyDanger}`}
                  type="button"
                  onClick={() => deleteTopic(topic)}
                >
                  Delete
                </button>
              </span>
            </div>
            <div className={styles.topicControls}>
              <label className={styles.field}>
                <small>Move under</small>
                <select
                  className={styles.select}
                  value={topic.parent_id ?? ''}
                  onChange={(event) => moveTopic(topic, event.target.value)}
                >
                  <option value="">Top level</option>
                  {orderedTopics
                    .filter((candidate) => !unavailableParents.has(candidate.id))
                    .map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {topicLabel(candidate.id)}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            {renderTopicTree(topic.id, depth + 1)}
          </div>
        );
      });
  }

  if (isLoading) {
    return <main className={styles.loading}>Loading your Study Creator…</main>;
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.titleRow}>
          <div>
            <p className={styles.eyebrow}>Private to your account</p>
            <h1>Study Creator</h1>
            <p>Turn what you learn into simple personal Concepts and Cards. Only you can see and manage what you create here.</p>
          </div>
          {view !== 'home' && (
            <button className={styles.backLink} type="button" onClick={() => openView('home')}>
              Study Creator home
            </button>
          )}
        </div>

        {view === 'home' && (
          <section className={styles.actionGrid} aria-label="Study Creator actions">
            <button className={styles.actionCard} type="button" onClick={beginCreateCard}>
              <span className={styles.actionIcon}>+</span>
              <span><strong>Create a Card</strong><span>Add a question and answer to one of your Concepts.</span></span>
            </button>
            <button className={styles.actionCard} type="button" onClick={() => beginCreateConcept(true)}>
              <span className={styles.actionIcon}>C</span>
              <span><strong>Create a Concept</strong><span>Group related Cards under a simple idea you want to learn.</span></span>
            </button>
            <button className={styles.actionCard} type="button" onClick={() => openView('material')}>
              <span className={styles.actionIcon}>⌕</span>
              <span><strong>My Study Material</strong><span>Browse, search, organize, and edit your private material.</span></span>
            </button>
          </section>
        )}

        {view === 'card' && (
          <section className={styles.panel}>
            <div className={styles.sectionHeading}>
              <div><h2>{cardId ? 'Edit Card' : 'Create a Card'}</h2><p>Keep it focused: one useful question and one clear answer.</p></div>
            </div>
            {renderFeedback()}
            {!concepts.length ? (
              <div className={styles.empty}>
                <p>Create a Concept before adding your first Card.</p>
                <button className={styles.primary} type="button" onClick={() => beginCreateConcept(true)}>Create a Concept</button>
              </div>
            ) : (
              <form className={styles.form} onSubmit={saveCard}>
                <label className={styles.field}>Question / Front
                  <textarea className={styles.textarea} maxLength={10000} required value={question} onChange={(event) => setQuestion(event.target.value)} />
                </label>
                <label className={styles.field}>Answer / Back
                  <textarea className={styles.textarea} maxLength={20000} required value={answer} onChange={(event) => setAnswer(event.target.value)} />
                </label>
                <label className={styles.field}>Concept
                  <select className={styles.select} required value={cardConceptId} onChange={(event) => setCardConceptId(event.target.value)}>
                    <option value="">Choose a Concept</option>
                    {concepts.map((concept) => <option key={concept.id} value={concept.id}>{concept.name} — {topicLabel(concept.topic_id)}</option>)}
                  </select>
                </label>
                <button className={styles.textButton} type="button" onClick={() => beginCreateConcept(true)}>+ Create new Concept</button>
                <div className={styles.buttonRow}>
                  <button className={styles.primary} disabled={isSaving} type="submit">{isSaving ? 'Saving…' : cardId ? 'Save changes' : 'Save Card'}</button>
                  {cardId && <button className={styles.secondary} type="button" onClick={() => openView('material')}>Cancel</button>}
                </div>
              </form>
            )}
          </section>
        )}

        {view === 'concept' && (
          <section className={styles.panel}>
            <div className={styles.sectionHeading}>
              <div><h2>{conceptId ? 'Edit Concept' : 'Create a Concept'}</h2><p>A lightweight home for related personal Cards.</p></div>
            </div>
            {renderFeedback()}
            {!topics.length && (
              <div className={styles.empty}>
                <p>Start your personal Topic Tree with a top-level Topic.</p>
                <form className={styles.row} onSubmit={createTopic}>
                  <input className={styles.input} maxLength={120} placeholder="Example: Cardiovascular" value={newTopicName} onChange={(event) => setNewTopicName(event.target.value)} />
                  <button className={styles.secondary} disabled={isSaving} type="submit">Add Topic</button>
                </form>
              </div>
            )}
            <form className={styles.form} onSubmit={saveConcept}>
              <label className={styles.field}>Concept name
                <input className={styles.input} maxLength={160} required value={conceptName} onChange={(event) => setConceptName(event.target.value)} />
              </label>
              <label className={styles.field}>Short description <small>Optional</small>
                <textarea className={styles.textarea} maxLength={1000} value={conceptDescription} onChange={(event) => setConceptDescription(event.target.value)} />
              </label>
              <label className={styles.field}>Personal Topic
                <select className={styles.select} disabled={!topics.length} required value={conceptTopicId} onChange={(event) => setConceptTopicId(event.target.value)}>
                  <option value="">Choose a Topic</option>
                  {orderedTopics.map((topic) => <option key={topic.id} value={topic.id}>{topicLabel(topic.id)}</option>)}
                </select>
              </label>
              <div className={styles.buttonRow}>
                <button className={styles.primary} disabled={isSaving || !topics.length} type="submit">{isSaving ? 'Saving…' : conceptId ? 'Save changes' : 'Save Concept'}</button>
                {conceptId && <button className={styles.secondary} type="button" onClick={() => { resetCardForm(conceptId); openView('card'); }}>Add a Card</button>}
              </div>
            </form>
          </section>
        )}

        {view === 'material' && (
          <section>
            <div className={styles.sectionHeading}>
              <div><h2>My Study Material</h2><p>Only your private personal Topics, Concepts, and Cards appear here.</p></div>
              <div className={styles.buttonRow}>
                <button className={styles.secondary} type="button" onClick={() => beginCreateConcept(true)}>Create Concept</button>
                <button className={styles.primary} type="button" onClick={beginCreateCard}>Create Card</button>
              </div>
            </div>
            {renderFeedback()}
            <div className={styles.materialLayout}>
              <aside className={styles.topicPanel}>
                <h3>Personal Topic Tree</h3>
                <form className={styles.form} onSubmit={createTopic}>
                  <input className={styles.input} maxLength={120} placeholder="New Topic name" value={newTopicName} onChange={(event) => setNewTopicName(event.target.value)} />
                  <select className={styles.select} value={newTopicParentId} onChange={(event) => setNewTopicParentId(event.target.value)}>
                    <option value="">Top level</option>
                    {orderedTopics.map((topic) => <option key={topic.id} value={topic.id}>Under {topicLabel(topic.id)}</option>)}
                  </select>
                  <button className={styles.secondary} disabled={isSaving} type="submit">Add Topic</button>
                </form>
                <div className={styles.topicList}>{topics.length ? renderTopicTree(null) : <p className={styles.empty}>No personal Topics yet.</p>}</div>
              </aside>
              <div className={styles.contentPanel}>
                <label className={styles.field}>Search my material
                  <input className={styles.search} placeholder="Concept, Topic, question, or answer" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
                </label>
                <div className={styles.conceptList}>
                  {visibleConcepts.length ? visibleConcepts.map((concept) => {
                    const conceptCards = cards.filter((card) => card.concept_id === concept.id);
                    return (
                      <article className={styles.conceptCard} key={concept.id}>
                        <div className={styles.sectionHeading}>
                          <div><h3>{concept.name}</h3><p className={styles.meta}>{topicLabel(concept.topic_id)} · {conceptCards.length} Card{conceptCards.length === 1 ? '' : 's'}</p></div>
                          <div className={styles.itemActions}>
                            <button className={styles.secondary} type="button" onClick={() => beginEditConcept(concept)}>Edit</button>
                            <button className={styles.danger} type="button" onClick={() => deleteConcept(concept)}>Delete</button>
                          </div>
                        </div>
                        {concept.description && <p className={styles.description}>{concept.description}</p>}
                        <div className={styles.cardList}>
                          {conceptCards.map((card) => (
                            <div className={styles.studyCard} key={card.id}>
                              <p><strong>Question:</strong> {card.question}</p>
                              <p><strong>Answer:</strong> {card.answer}</p>
                              <div className={styles.itemActions}>
                                <button className={styles.tinyButton} type="button" onClick={() => beginEditCard(card)}>Edit Card</button>
                                <button className={`${styles.tinyButton} ${styles.tinyDanger}`} type="button" onClick={() => deleteCard(card)}>Delete Card</button>
                              </div>
                            </div>
                          ))}
                          {!conceptCards.length && <p className={styles.empty}>No Cards yet.</p>}
                        </div>
                      </article>
                    );
                  }) : <p className={styles.empty}>{query ? 'No personal material matches your search.' : 'Create your first Concept to get started.'}</p>}
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
