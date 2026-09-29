'use client';

import { useState, type ReactNode } from 'react';
import { cardMarkdownSummary } from '@/components/MarkdownContent';
import styles from '../CreatorStudioV2Client.module.css';

// Presentation only: ownership, attachment validation and persistence stay in Creator.
export function CreatorLearnerQuestionsWorkspace({ editor, topicTree, cards, busy, onOpen, onNew }: {
  editor: ReactNode;
  topicTree: ReactNode;
  cards: ReadonlyArray<{ id: string; front: string; back: string; standalone?: boolean }>;
  busy: boolean;
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  const [search, setSearch] = useState('');
  const query = search.trim().toLocaleLowerCase();
  const visible = cards.filter(card => `${card.front} ${card.back}`.toLocaleLowerCase().includes(query));
  return <>
    <div className={styles.mainGrid}>
      <section className={`${styles.panel} ${styles.conceptPanel}`} aria-label="Card authoring">
    <section aria-label="Your Cards">
      <h2>My Cards</h2>
      <label className={styles.searchBox}>Search Cards<input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <div className={styles.existingQuestionList}>
        {visible.map(card => <button key={`personal:card:${card.id}`} className={styles.questionSearchResult} type="button" disabled={busy} onClick={() => onOpen(card.id)}>{card.standalone ? cardMarkdownSummary(card.front) : card.front}</button>)}
        {!cards.length && <p>No Cards yet. Select a Topic to create one.</p>}
        {!!cards.length && !visible.length && <p>No Cards match your search.</p>}
      </div>
    </section>
        <h2>1. Question / Answer</h2>
        <button className={styles.secondaryButton} type="button" disabled={busy} onClick={onNew}>New Card</button>
        {editor}
      </section>
      {topicTree}
    </div>

  </>;
}
