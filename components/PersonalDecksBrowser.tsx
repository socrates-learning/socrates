'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { PersonalCard, PersonalConcept, PersonalTopic } from './StudyCreatorClient';
import styles from './PersonalDecksBrowser.module.css';

type PersonalCollection = {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

type PersonalCollectionCard = {
  collection_id: string;
  owner_id: string;
  personal_card_id: string;
  created_at: string;
};

type Props = {
  ownerId: string;
  material: {
    topics: PersonalTopic[];
    concepts: PersonalConcept[];
    cards: PersonalCard[];
  };
};

type DialogState =
  | { kind: 'create' }
  | { kind: 'rename'; collection: PersonalCollection }
  | { kind: 'delete'; collection: PersonalCollection };

function errorMessage(error: unknown) {
  if (typeof error === 'object' && error && 'message' in error) return String(error.message);
  return 'Something went wrong. Please try again.';
}

export function PersonalDecksBrowser({ ownerId, material }: Props) {
  const [collections, setCollections] = useState<PersonalCollection[]>([]);
  const [memberships, setMemberships] = useState<PersonalCollectionCard[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deckSearch, setDeckSearch] = useState('');
  const [contentSearch, setContentSearch] = useState('');
  const [availableSearch, setAvailableSearch] = useState('');
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const loadCollections = useCallback(async () => {
    const [collectionResult, membershipResult] = await Promise.all([
      supabase
        .from('personal_collections')
        .select('id, owner_id, name, created_at, updated_at')
        .eq('owner_id', ownerId)
        .order('created_at'),
      supabase
        .from('personal_collection_cards')
        .select('collection_id, owner_id, personal_card_id, created_at')
        .eq('owner_id', ownerId)
        .order('created_at'),
    ]);
    const loadError = collectionResult.error || membershipResult.error;
    if (loadError) setError(errorMessage(loadError));
    else {
      setCollections((collectionResult.data ?? []) as PersonalCollection[]);
      setMemberships((membershipResult.data ?? []) as PersonalCollectionCard[]);
    }
    setIsLoading(false);
  }, [ownerId]);

  useEffect(() => { loadCollections(); }, [loadCollections]);

  useEffect(() => {
    if (!collections.length) setSelectedId(null);
    else if (!selectedId || !collections.some((item) => item.id === selectedId)) {
      setSelectedId(collections[0].id);
    }
  }, [collections, selectedId]);

  useEffect(() => {
    if (!dialog) {
      const opener = openerRef.current;
      openerRef.current = null;
      opener?.focus();
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSaving) {
        event.preventDefault();
        setDialog(null);
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dialog, isSaving]);

  const topicById = useMemo(() => new Map(material.topics.map((topic) => [topic.id, topic])), [material.topics]);
  const conceptById = useMemo(() => new Map(material.concepts.map((concept) => [concept.id, concept])), [material.concepts]);
  const selected = collections.find((item) => item.id === selectedId) ?? null;
  const selectedCardIds = useMemo(() => new Set(
    memberships.filter((item) => item.collection_id === selectedId).map((item) => item.personal_card_id)
  ), [memberships, selectedId]);

  const topicPath = useCallback((topicId: string) => {
    const names: string[] = [];
    const visited = new Set<string>();
    let topic = topicById.get(topicId);
    while (topic && !visited.has(topic.id)) {
      visited.add(topic.id);
      names.unshift(topic.name);
      topic = topic.parent_id ? topicById.get(topic.parent_id) : undefined;
    }
    return names.join(' › ') || 'Unplaced';
  }, [topicById]);

  const grouped = useCallback((cards: PersonalCard[], search: string) => {
    const needle = search.trim().toLowerCase();
    const groups = new Map<string, { topic: PersonalTopic; concepts: Map<string, { concept: PersonalConcept; cards: PersonalCard[] }> }>();
    for (const card of cards) {
      const concept = conceptById.get(card.concept_id);
      const topic = concept ? topicById.get(concept.topic_id) : undefined;
      if (!concept || !topic) continue;
      if (needle && !`${topicPath(topic.id)} ${concept.name} ${card.question} ${card.answer}`.toLowerCase().includes(needle)) continue;
      const topicGroup = groups.get(topic.id) ?? { topic, concepts: new Map() };
      const conceptGroup = topicGroup.concepts.get(concept.id) ?? { concept, cards: [] };
      conceptGroup.cards.push(card);
      topicGroup.concepts.set(concept.id, conceptGroup);
      groups.set(topic.id, topicGroup);
    }
    return [...groups.values()].sort((a, b) => topicPath(a.topic.id).localeCompare(topicPath(b.topic.id)));
  }, [conceptById, topicById, topicPath]);

  const deckGroups = useMemo(
    () => grouped(material.cards.filter((card) => selectedCardIds.has(card.id)), contentSearch),
    [contentSearch, grouped, material.cards, selectedCardIds]
  );
  const availableGroups = useMemo(
    () => grouped(material.cards, availableSearch),
    [availableSearch, grouped, material.cards]
  );
  const filteredCollections = collections.filter((item) => item.name.toLowerCase().includes(deckSearch.trim().toLowerCase()));

  function openDialog(next: DialogState) {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setName(next.kind === 'rename' ? next.collection.name : '');
    setError('');
    setMessage('');
    setDialog(next);
  }

  async function saveCollection(event: React.FormEvent) {
    event.preventDefault();
    if (!dialog || dialog.kind === 'delete' || !name.trim()) return;
    setIsSaving(true);
    setError('');
    const result = dialog.kind === 'create'
      ? await supabase.from('personal_collections').insert({ owner_id: ownerId, name: name.trim() }).select('id').single()
      : await supabase.from('personal_collections').update({ name: name.trim() }).eq('id', dialog.collection.id).eq('owner_id', ownerId).select('id').single();
    if (result.error) setError(errorMessage(result.error));
    else {
      await loadCollections();
      setSelectedId(result.data.id);
      setDialog(null);
      setMessage(dialog.kind === 'create' ? 'Personal Deck created.' : 'Personal Deck renamed.');
    }
    setIsSaving(false);
  }

  async function deleteCollection() {
    if (!dialog || dialog.kind !== 'delete') return;
    setIsSaving(true);
    setError('');
    const { error: deleteError } = await supabase.from('personal_collections').delete()
      .eq('id', dialog.collection.id).eq('owner_id', ownerId);
    if (deleteError) setError(errorMessage(deleteError));
    else {
      setDialog(null);
      await loadCollections();
      setMessage('Personal Deck deleted. Your underlying Cards were preserved.');
    }
    setIsSaving(false);
  }

  async function addCards(cardIds: string[], conceptName?: string) {
    if (!selected || !cardIds.length) return;
    const newIds = cardIds.filter((id) => !selectedCardIds.has(id));
    if (!newIds.length) {
      setMessage(conceptName ? `All current Cards from ${conceptName} are already in this deck.` : 'This Card is already in the deck.');
      return;
    }
    setIsSaving(true);
    setError('');
    const { error: addError } = await supabase.from('personal_collection_cards').insert(
      newIds.map((personalCardId) => ({ collection_id: selected.id, owner_id: ownerId, personal_card_id: personalCardId }))
    );
    if (addError) setError(errorMessage(addError));
    else {
      await loadCollections();
      setMessage(conceptName
        ? `Added ${newIds.length} current Card${newIds.length === 1 ? '' : 's'} from ${conceptName}. Future Cards are not added automatically.`
        : 'Card added to Personal Deck.');
    }
    setIsSaving(false);
  }

  async function removeCard(card: PersonalCard) {
    if (!selected) return;
    setIsSaving(true);
    setError('');
    const { error: removeError } = await supabase.from('personal_collection_cards').delete()
      .eq('collection_id', selected.id).eq('personal_card_id', card.id).eq('owner_id', ownerId);
    if (removeError) setError(errorMessage(removeError));
    else {
      await loadCollections();
      setMessage('Card removed from this deck. The underlying Card was preserved.');
    }
    setIsSaving(false);
  }

  return (
    <>
      {(message || error) && <div className={`${styles.notice} ${error ? styles.error : ''}`} role={error ? 'alert' : 'status'}>
        <span>{error || message}</span><button aria-label="Dismiss message" onClick={() => { setMessage(''); setError(''); }} type="button">×</button>
      </div>}
      <div className={styles.columns} aria-label="Personal Decks workspace">
        <section className={styles.pane} aria-label="Personal Deck list">
          <div className={styles.heading}><div><p>Collections</p><h2>Personal Decks</h2></div><span>Private</span></div>
          <button className={styles.primaryWide} onClick={() => openDialog({ kind: 'create' })} type="button">＋ New Personal Deck</button>
          <label className={styles.search}><span>⌕</span><span className={styles.srOnly}>Search Personal Decks</span><input aria-label="Search Personal Decks" onChange={(event) => setDeckSearch(event.target.value)} placeholder="Search decks…" value={deckSearch} /></label>
          <div className={styles.deckList}>
            {filteredCollections.map((collection) => {
              const count = memberships.filter((item) => item.collection_id === collection.id).length;
              return <article className={`${styles.deckRow} ${selectedId === collection.id ? styles.selected : ''}`} key={collection.id}>
                <button className={styles.deckSelect} onClick={() => setSelectedId(collection.id)} type="button"><strong>{collection.name}</strong><small>{count} Card{count === 1 ? '' : 's'}</small></button>
                <div className={styles.rowActions}><button aria-label={`Rename ${collection.name}`} onClick={() => openDialog({ kind: 'rename', collection })} title="Rename deck" type="button">✎</button><button aria-label={`Delete ${collection.name}`} onClick={() => openDialog({ kind: 'delete', collection })} title="Delete deck" type="button">⌫</button></div>
              </article>;
            })}
            {!isLoading && !filteredCollections.length && <div className={styles.empty}>{collections.length ? 'No decks match your search.' : 'Create your first Personal Deck. Cards remain in My Topics.'}</div>}
          </div>
        </section>

        <section className={styles.pane} aria-label="Selected Personal Deck contents">
          <div className={styles.heading}><div><p>Deck contents</p><h2>{selected?.name ?? 'Choose a deck'}</h2></div>{selected && <span>{selectedCardIds.size} Card{selectedCardIds.size === 1 ? '' : 's'}</span>}</div>
          <label className={styles.search}><span>⌕</span><span className={styles.srOnly}>Search selected deck</span><input aria-label="Search selected Personal Deck" disabled={!selected} onChange={(event) => setContentSearch(event.target.value)} placeholder="Filter this deck…" value={contentSearch} /></label>
          <div className={styles.scrollPane}>
            {deckGroups.map((group) => <section className={styles.topicGroup} key={group.topic.id}><h3>{topicPath(group.topic.id)}</h3>{[...group.concepts.values()].map(({ concept, cards }) => <div className={styles.conceptGroup} key={concept.id}><h4>{concept.name}<span>{cards.length}</span></h4>{cards.map((card) => <article className={styles.card} key={card.id}><div><strong>{card.question}</strong><p>{card.answer}</p></div><button aria-label={`Remove ${card.question} from ${selected?.name}`} disabled={isSaving} onClick={() => removeCard(card)} type="button">Remove</button></article>)}</div>)}</section>)}
            {selected && !deckGroups.length && <div className={styles.empty}>{selectedCardIds.size ? 'No Cards match this filter.' : 'This deck is empty. Add Cards from your personal material.'}</div>}
            {!selected && <div className={styles.empty}>Choose or create a Personal Deck to organize Cards.</div>}
          </div>
        </section>

        <section className={styles.pane} aria-label="Available personal material">
          <div className={styles.heading}><div><p>My Topics</p><h2>Available material</h2></div><span>{material.cards.length} Cards</span></div>
          <p className={styles.explainer}>“Add all current Cards” is a one-time snapshot. Cards created later are not added automatically.</p>
          <label className={styles.search}><span>⌕</span><span className={styles.srOnly}>Search available material</span><input aria-label="Search available personal material" onChange={(event) => setAvailableSearch(event.target.value)} placeholder="Search Topics, Concepts, Cards…" value={availableSearch} /></label>
          <div className={styles.scrollPane}>
            {availableGroups.map((group) => <section className={styles.topicGroup} key={group.topic.id}><h3>{topicPath(group.topic.id)}</h3>{[...group.concepts.values()].map(({ concept, cards }) => <div className={styles.conceptGroup} key={concept.id}><div className={styles.conceptHeading}><h4>{concept.name}<span>{cards.length}</span></h4><button disabled={!selected || isSaving || cards.every((card) => selectedCardIds.has(card.id))} onClick={() => addCards(cards.map((card) => card.id), concept.name)} title="Adds only the Cards that exist now" type="button">Add all current Cards</button></div>{cards.map((card) => <article className={styles.card} key={card.id}><div><strong>{card.question}</strong><p>{card.answer}</p></div><button aria-label={`Add ${card.question} to ${selected?.name ?? 'selected deck'}`} disabled={!selected || isSaving || selectedCardIds.has(card.id)} onClick={() => addCards([card.id])} type="button">{selectedCardIds.has(card.id) ? 'Added' : 'Add'}</button></article>)}</div>)}</section>)}
            {!availableGroups.length && <div className={styles.empty}>{material.cards.length ? 'No personal material matches this search.' : 'Create Cards in My Topics before adding them to a Personal Deck.'}</div>}
          </div>
        </section>
      </div>

      {dialog && <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget && !isSaving) setDialog(null); }} role="presentation"><section aria-labelledby="personal-deck-dialog-title" aria-modal="true" className={styles.dialog} ref={dialogRef} role="dialog">
        <div className={styles.dialogHeader}><div><p>Personal Deck</p><h2 id="personal-deck-dialog-title">{dialog.kind === 'create' ? 'New Personal Deck' : dialog.kind === 'rename' ? 'Rename Personal Deck' : 'Delete Personal Deck?'}</h2></div><button aria-label="Close dialog" disabled={isSaving} onClick={() => setDialog(null)} type="button">×</button></div>
        {dialog.kind === 'delete' ? <><p className={styles.deleteCopy}>Deleting “{dialog.collection.name}” removes only its memberships. Every underlying Card, Concept, Topic, and learning-history record is preserved.</p><div className={styles.dialogActions}><button disabled={isSaving} onClick={() => setDialog(null)} type="button">Cancel</button><button className={styles.danger} disabled={isSaving} onClick={deleteCollection} type="button">{isSaving ? 'Deleting…' : 'Delete Personal Deck'}</button></div></> : <form onSubmit={saveCollection}><label>Deck name<input autoFocus maxLength={160} onChange={(event) => setName(event.target.value)} required value={name} /></label><div className={styles.dialogActions}><button disabled={isSaving} onClick={() => setDialog(null)} type="button">Cancel</button><button className={styles.primary} disabled={isSaving} type="submit">{isSaving ? 'Saving…' : dialog.kind === 'create' ? 'Create deck' : 'Save name'}</button></div></form>}
      </section></div>}
    </>
  );
}
