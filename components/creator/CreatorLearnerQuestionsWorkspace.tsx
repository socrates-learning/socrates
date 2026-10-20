'use client';

import { useState, type ReactNode } from 'react';
import { cardMarkdownSummary } from '@/components/MarkdownContent';
import { EMPTY_LEARNER_CARD_FILTERS, filterLearnerCards, type LearnerSearchCard, type LearnerCardTopic } from '@/lib/learner-card-search';
import styles from '../CreatorStudioV2Client.module.css';
import toolStyles from './LearnerCardTools.module.css';

// Presentation only: ownership, attachment validation and persistence stay in Creator.
export function CreatorLearnerQuestionsWorkspace({ editor, topicTree, cards, busy, onOpen, onNew, topics = [] }: {
  editor: ReactNode;
  topicTree: ReactNode;
  cards: readonly LearnerSearchCard[];
  topics?: readonly LearnerCardTopic[];
  busy: boolean;
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  const [filters, setFilters] = useState(EMPTY_LEARNER_CARD_FILTERS);
  const visible = filterLearnerCards(cards, filters);
  const active = !!(filters.text || filters.topic || filters.from || filters.to);
  return <>
    <div className={styles.mainGrid}>
      <section className={`${styles.panel} ${styles.conceptPanel}`} aria-label="Card authoring">
    <section aria-label="Your Cards">
      <h2>My Cards</h2>
      <label className={styles.searchBox}>Search Cards<input type="search" value={filters.text} placeholder="Front, Back, or Source / Reference" onChange={event => setFilters({ ...filters, text: event.target.value })} /></label>
      {filters.text && <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => setFilters({ ...filters, text: '' })}>Clear search</button>}
      <details className={toolStyles.filters}><summary>Card filters{active ? ' · Active' : ''}</summary>
        <div className={toolStyles.filterGrid}>
          <label>Topic<select value={filters.topic} onChange={event => setFilters({ ...filters, topic: event.target.value })}>
            <option value="">All Topics</option>{topics.map(topic => <option key={topic.key} value={topic.key}>{topic.paths[0]}{topic.paths.length > 1 ? ' (shared Topic)' : ''}</option>)}
          </select></label>
          <button type="button" disabled={busy || !filters.topic} onClick={() => setFilters({ ...filters, topic: '' })}>Clear Topic</button>
          <label>Date field<select value={filters.dateField} onChange={event => setFilters({ ...filters, dateField: event.target.value as 'createdAt' | 'updatedAt' })}>
            <option value="createdAt">Created</option><option value="updatedAt">Last modified</option>
          </select></label>
          <span />
          <label>From<input type="date" value={filters.from} onChange={event => setFilters({ ...filters, from: event.target.value })} /></label>
          <label>Through<input type="date" value={filters.to} onChange={event => setFilters({ ...filters, to: event.target.value })} /></label>
          <button type="button" disabled={busy || !filters.from && !filters.to} onClick={() => setFilters({ ...filters, from: '', to: '' })}>Clear dates</button>
          <button type="button" disabled={busy || !active} onClick={() => setFilters(EMPTY_LEARNER_CARD_FILTERS)}>Reset all filters</button>
        </div>
        <p className={toolStyles.hint}>Topic filters match the selected Topic only, without its subtopics. Shared locations refer to the same Topic. Dates include both endpoints and use UTC.</p>
        {filters.from && filters.to && filters.from > filters.to && <p role="alert">The start date must be on or before the end date.</p>}
      </details>
      <div className={styles.existingQuestionList}>
        {visible.map(card => <button key={`personal:card:${card.id}`} className={styles.questionSearchResult} type="button" disabled={busy} onClick={() => onOpen(card.id)}>{card.standalone ? cardMarkdownSummary(card.front) : card.front}</button>)}
        {!cards.length && <p>No Cards yet. Select a Topic to create one.</p>}
        {!!cards.length && !visible.length && <p role="status">No Cards match your search and filters.</p>}
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
