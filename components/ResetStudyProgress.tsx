'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import styles from './ResetStudyProgress.module.css';

export type StudyProgressResetConcept = {
  id: string;
  name: string;
};

export type StudyProgressResetTopic = {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
};

type ResetScope = 'concept' | 'topic' | 'library';

type ResetSummary = {
  request_id: string;
  reset_at: string;
  scope: ResetScope;
  target_id: string | null;
  target_name: string;
  concepts_reset: number;
  mastery_rows_reset: number;
  testing_angle_rows_reset: number;
  submastery_rows_reset: number;
  study_sessions_closed: number;
  historical_attempts_preserved: boolean;
};

export function ResetStudyProgress({
  concepts,
  library,
  topics,
}: {
  concepts: StudyProgressResetConcept[];
  library: { id: string; name: string } | null;
  topics: StudyProgressResetTopic[];
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [scope, setScope] = useState<ResetScope>('concept');
  const [conceptId, setConceptId] = useState(concepts[0]?.id ?? '');
  const [topicId, setTopicId] = useState(
    topics.find((topic) => !topic.parentId)?.id ?? topics[0]?.id ?? ''
  );
  const [requestId, setRequestId] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<ResetSummary | null>(null);

  const topicOptions = useMemo(() => {
    const byId = new Map(topics.map((topic) => [topic.id, topic]));
    const childrenByParent = new Map<string | null, StudyProgressResetTopic[]>();
    const compareTopics = (left: StudyProgressResetTopic, right: StudyProgressResetTopic) =>
      left.sortOrder - right.sortOrder ||
      left.name.localeCompare(right.name) ||
      left.id.localeCompare(right.id);

    for (const topic of topics) {
      const parentId = topic.parentId && byId.has(topic.parentId) ? topic.parentId : null;
      const siblings = childrenByParent.get(parentId) ?? [];
      siblings.push(topic);
      childrenByParent.set(parentId, siblings);
    }
    for (const siblings of childrenByParent.values()) siblings.sort(compareTopics);

    const ordered: Array<StudyProgressResetTopic & { label: string }> = [];
    const visited = new Set<string>();
    const append = (topic: StudyProgressResetTopic, depth: number) => {
      if (visited.has(topic.id)) return;
      visited.add(topic.id);
      ordered.push({ ...topic, label: `${'— '.repeat(depth)}${topic.name}` });
      for (const child of childrenByParent.get(topic.id) ?? []) append(child, depth + 1);
    };

    for (const root of childrenByParent.get(null) ?? []) append(root, 0);
    for (const topic of [...topics].sort(compareTopics)) append(topic, 0);
    return ordered;
  }, [topics]);

  const selectedTarget = scope === 'concept'
    ? concepts.find((concept) => concept.id === conceptId)
    : scope === 'topic'
      ? topics.find((topic) => topic.id === topicId)
      : library;
  const canOpen = Boolean(
    library &&
      (scope === 'library' || (scope === 'concept' && conceptId) || (scope === 'topic' && topicId))
  );

  function openConfirmation() {
    if (!canOpen || !selectedTarget) return;
    setError('');
    setSummary(null);
    setRequestId(crypto.randomUUID());
    dialogRef.current?.showModal();
    setIsDialogOpen(true);
  }

  function closeConfirmation() {
    if (isResetting) return;
    dialogRef.current?.close();
    setIsDialogOpen(false);
    setRequestId(null);
  }

  async function confirmReset() {
    if (!library || !requestId || !selectedTarget) return;

    setIsResetting(true);
    setError('');

    const targetId = scope === 'concept' ? conceptId : scope === 'topic' ? topicId : null;
    const { data, error: resetError } = await supabase.rpc('reset_study_progress', {
      p_library_id: library.id,
      p_request_id: requestId,
      p_scope: scope,
      p_target_id: targetId,
    });

    if (resetError) {
      setError(resetError.message);
      setIsResetting(false);
      return;
    }

    const result = data as ResetSummary;
    setSummary(result);
    setIsResetting(false);
    dialogRef.current?.close();
    setIsDialogOpen(false);
    router.refresh();
  }

  return (
    <section className={`panel stack ${styles.section}`} aria-labelledby="reset-study-progress-title">
      <div>
        <h3 id="reset-study-progress-title">Reset Study Progress</h3>
        <p className="muted">
          Start over for selected official learning material without deleting your curriculum or authored content.
        </p>
      </div>

      {library ? (
        <div className={styles.controls}>
          <fieldset className={styles.scopeGroup}>
            <legend>Scope</legend>
            {(['concept', 'topic', 'library'] as const).map((value) => (
              <label key={value}>
                <input
                  checked={scope === value}
                  name="reset-scope"
                  onChange={() => setScope(value)}
                  type="radio"
                  value={value}
                />
                <span>{value === 'concept' ? 'Concept' : value === 'topic' ? 'Topic / Branch' : 'Current Library'}</span>
              </label>
            ))}
          </fieldset>

          {scope === 'concept' && (
            <label className={styles.targetLabel}>
              Concept
              <select
                name="reset-concept-id"
                onChange={(event) => setConceptId(event.target.value)}
                value={conceptId}
              >
                {concepts.length ? concepts.map((concept) => (
                  <option key={concept.id} value={concept.id}>{concept.name}</option>
                )) : <option value="">No published Concepts in this Library</option>}
              </select>
            </label>
          )}

          {scope === 'topic' && (
            <label className={styles.targetLabel}>
              Topic / Branch
              <select
                name="reset-topic-id"
                onChange={(event) => setTopicId(event.target.value)}
                value={topicId}
              >
                {topicOptions.length ? topicOptions.map((topic) => (
                  <option key={topic.id} value={topic.id}>{topic.label}</option>
                )) : <option value="">No Topics in this Library</option>}
              </select>
            </label>
          )}

          {scope === 'library' && (
            <div className={styles.libraryTarget}>
              <span>Current Library</span>
              <strong>{library.name}</strong>
            </div>
          )}

          <button className={styles.resetButton} disabled={!canOpen} onClick={openConfirmation} type="button">
            Reset Progress…
          </button>
        </div>
      ) : (
        <p className="muted">Choose an active Library before resetting Study progress.</p>
      )}

      {summary && (
        <p className={styles.success} role="status">
          Reset complete for {summary.target_name}: {summary.concepts_reset} {summary.concepts_reset === 1 ? 'Concept' : 'Concepts'} restarted. Historical attempts were preserved.
        </p>
      )}
      {error && !isDialogOpen && <p className={styles.error} role="alert">{error}</p>}

      <dialog
        aria-describedby="reset-study-progress-confirmation-description"
        aria-labelledby="reset-study-progress-confirmation-title"
        className={styles.dialog}
        ref={dialogRef}
        onCancel={(event) => {
          if (isResetting) event.preventDefault();
          else closeConfirmation();
        }}
      >
        <div className={styles.dialogBody}>
          <div>
            <p className={styles.eyebrow}>Reset Study Progress</p>
            <h2 id="reset-study-progress-confirmation-title">Reset progress for “{selectedTarget?.name}”?</h2>
          </div>
          <p id="reset-study-progress-confirmation-description">
            Socrates will restart your active mastery, Testing Angle evidence, lapse history, and review recency for this {scope === 'topic' ? 'Topic branch' : scope === 'library' ? 'Library' : 'Concept'}.
          </p>
          <ul>
            <li>Your Concepts, Questions, curriculum, deck selections, preferences, and exclusions will not be deleted.</li>
            <li>Historical attempts remain in Study History, but attempts before this reset will no longer influence the new learning run.</li>
            <li>Open Study sessions in {library?.name} will close so an old card cannot submit into the reset state.</li>
            <li>Current mastery and priority may change immediately.</li>
          </ul>
          <p className={styles.warning}>This reset cannot be undone automatically.</p>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.dialogActions}>
            <button disabled={isResetting} onClick={closeConfirmation} type="button">Cancel</button>
            <button className={styles.confirmButton} disabled={isResetting} onClick={confirmReset} type="button">
              {isResetting ? 'Resetting…' : 'Reset Progress'}
            </button>
          </div>
        </div>
      </dialog>
    </section>
  );
}
