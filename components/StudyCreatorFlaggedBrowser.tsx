'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { PersonalMaterial } from './StudyCreatorClient';
import { StudyCreatorIcon as Icon } from './StudyCreatorIcon';
import styles from './StudyCreatorClient.module.css';

type FlagRow = {
  id: string;
  question_id: string | null;
  personal_card_id: string | null;
  note: string | null;
  created_at: string;
};

type OfficialQuestion = {
  id: string;
  concept_id: string;
  prompt: string;
  difficulty: string | null;
  testing_angle: string | null;
};

type OfficialConcept = {
  id: string;
  name: string;
};

type StudyCreatorFlaggedBrowserProps = {
  material: PersonalMaterial;
  ownerId: string;
};

function messageFor(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'message' in error) {
    return String(error.message);
  }
  return 'Flagged material could not be loaded.';
}

export function StudyCreatorFlaggedBrowser({
  material,
  ownerId,
}: StudyCreatorFlaggedBrowserProps) {
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [officialQuestions, setOfficialQuestions] = useState<OfficialQuestion[]>([]);
  const [officialConcepts, setOfficialConcepts] = useState<OfficialConcept[]>([]);
  const [selectedFlagId, setSelectedFlagId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const loadFlags = useCallback(async () => {
    setIsLoading(true);
    setError('');
    const flagResult = await supabase
      .from('study_candidate_flags')
      .select('id, question_id, personal_card_id, note, created_at')
      .eq('user_id', ownerId)
      .order('created_at', { ascending: false });

    if (flagResult.error) {
      setError(messageFor(flagResult.error));
      setIsLoading(false);
      return;
    }

    const nextFlags = (flagResult.data ?? []) as FlagRow[];
    const questionIds = nextFlags
      .map((flag) => flag.question_id)
      .filter((id): id is string => Boolean(id));
    let nextQuestions: OfficialQuestion[] = [];
    let nextConcepts: OfficialConcept[] = [];

    if (questionIds.length) {
      const questionResult = await supabase
        .from('questions')
        .select('id, concept_id, prompt, difficulty, testing_angle')
        .in('id', questionIds);
      if (questionResult.error) {
        setError(messageFor(questionResult.error));
        setIsLoading(false);
        return;
      }
      nextQuestions = (questionResult.data ?? []) as OfficialQuestion[];
      const conceptIds = [
        ...new Set(nextQuestions.map((question) => question.concept_id)),
      ];
      if (conceptIds.length) {
        const conceptResult = await supabase
          .from('concepts')
          .select('id, name')
          .in('id', conceptIds);
        if (conceptResult.error) {
          setError(messageFor(conceptResult.error));
          setIsLoading(false);
          return;
        }
        nextConcepts = (conceptResult.data ?? []) as OfficialConcept[];
      }
    }

    setFlags(nextFlags);
    setOfficialQuestions(nextQuestions);
    setOfficialConcepts(nextConcepts);
    setSelectedFlagId((current) =>
      current && nextFlags.some((flag) => flag.id === current)
        ? current
        : nextFlags[0]?.id ?? null
    );
    setIsLoading(false);
  }, [ownerId]);

  useEffect(() => {
    void loadFlags();
  }, [loadFlags]);

  const resolvedFlags = useMemo(
    () =>
      flags.map((flag) => {
        if (flag.question_id) {
          const question = officialQuestions.find(
            (candidate) => candidate.id === flag.question_id
          );
          const concept = question
            ? officialConcepts.find(
                (candidate) => candidate.id === question.concept_id
              )
            : null;
          return {
            flag,
            owner: 'official' as const,
            title: question?.prompt ?? 'Official Question no longer available',
            context: concept?.name ?? 'Socrates material',
            question,
            concept,
            card: null,
            personalConcept: null,
          };
        }

        const card = material.cards.find(
          (candidate) => candidate.id === flag.personal_card_id
        );
        const personalConcept = card
          ? material.concepts.find(
              (candidate) => candidate.id === card.concept_id
            )
          : null;
        return {
          flag,
          owner: 'personal' as const,
          title: card?.question ?? 'Personal Card no longer available',
          context: personalConcept?.name ?? 'My personal material',
          question: null,
          concept: null,
          card,
          personalConcept,
        };
      }),
    [flags, material.cards, material.concepts, officialConcepts, officialQuestions]
  );

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleFlags = resolvedFlags.filter((item) =>
    normalizedSearch
      ? `${item.title} ${item.context} ${item.flag.note ?? ''}`
          .toLocaleLowerCase()
          .includes(normalizedSearch)
      : true
  );
  const selected =
    resolvedFlags.find((item) => item.flag.id === selectedFlagId) ?? null;

  async function unflag(flagId: string) {
    setRemovingId(flagId);
    setError('');
    const { error: removeError } = await supabase
      .from('study_candidate_flags')
      .delete()
      .eq('id', flagId)
      .eq('user_id', ownerId);
    if (removeError) {
      setError(messageFor(removeError));
      setRemovingId(null);
      return;
    }
    await loadFlags();
    setRemovingId(null);
  }

  return (
    <div className={styles.flaggedWorkspace}>
      <section className={styles.flaggedListPane} aria-label="Flagged material">
        <div className={styles.workspaceSectionIntro}>
          <div>
            <h2>1. Flagged Material</h2>
            <p>Review Questions and Cards you saved for later.</p>
          </div>
          <span className={styles.flagCount}>{flags.length}</span>
        </div>
        <label className={styles.searchField}>
          <span aria-hidden="true"><Icon name="search" /></span>
          <input
            aria-label="Search flagged material"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search flagged material..."
            type="search"
            value={search}
          />
        </label>
        {error && <p className={styles.flagError} role="alert">{error}</p>}
        <div className={styles.flaggedList}>
          {isLoading && <div className={styles.inlineEmpty}>Loading your flags…</div>}
          {!isLoading && visibleFlags.map((item) => (
            <button
              className={`${styles.flaggedRow} ${selectedFlagId === item.flag.id ? styles.selectedFlag : ''}`}
              key={item.flag.id}
              onClick={() => setSelectedFlagId(item.flag.id)}
              type="button"
            >
              <i className={item.owner === 'official' ? styles.officialOwnerMark : styles.personalOwnerMark}>{item.owner === 'official' ? 'S' : 'M'}</i>
              <span><strong>{item.title}</strong><small>{item.context} · {new Date(item.flag.created_at).toLocaleDateString()}</small></span>
              <Icon name="chevron-right" />
            </button>
          ))}
          {!isLoading && !flags.length && <div className={styles.inlineEmpty}>Nothing is flagged yet. Use the flag action during Study to save material for later review.</div>}
          {!isLoading && flags.length > 0 && !visibleFlags.length && <div className={styles.inlineEmpty}>No flagged material matches your search.</div>}
        </div>
      </section>

      <section className={styles.flaggedDetailPane} aria-label="Flagged item review">
        <div className={styles.workspaceSectionIntro}>
          <div>
            <h2>2. Details</h2>
            <p>Review the selected Question or Card.</p>
          </div>
        </div>
        <div className={`${styles.selectionHeading} ${styles.sectionSelection}`}>
          <span className={`${styles.headingIcon} ${selected?.owner === 'personal' ? styles.personalHeadingIcon : styles.purpleIcon}`}><Icon name="flag" /></span>
          <div><p>{selected ? `${selected.owner === 'official' ? 'Socrates' : 'Mine'} · Flagged` : 'Selected Material'}</p><h2>{selected?.context ?? 'Choose flagged material'}</h2></div>
        </div>
        <div className={styles.inspectorBody}>
          {selected ? (
            <div className={styles.flagReviewCard}>
              <div><span>{selected.owner === 'official' ? 'Question' : 'Card'}</span><p>{selected.title}</p></div>
              {selected.card && <div><span>Answer</span><p>{selected.card.answer}</p></div>}
              {selected.question && <div className={styles.flagMetadata}><span>{selected.question.difficulty ?? 'Unspecified difficulty'}</span><span>{selected.question.testing_angle ?? 'General angle'}</span></div>}
              {selected.flag.note && <div><span>Your note</span><p>{selected.flag.note}</p></div>}
              <div><span>Flagged</span><p>{new Date(selected.flag.created_at).toLocaleString()}</p></div>
              <button className={styles.dangerButton} disabled={removingId === selected.flag.id} onClick={() => void unflag(selected.flag.id)} type="button">{removingId === selected.flag.id ? 'Removing…' : 'Unflag'}</button>
            </div>
          ) : (
            <div className={styles.inlineEmpty}>Select a flagged Question or personal Card to review it.</div>
          )}
        </div>
      </section>
    </div>
  );
}
