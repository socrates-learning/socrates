'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

type ReviewSection = {
  id: string;
  title: string;
  body: string;
  sort_order: number | null;
};

function getPrompt(section: ReviewSection) {
  if (section.title.toLowerCase() === 'overview') {
    return 'What is the core idea of this concept?';
  }

  return `What should you know about ${section.title}?`;
}

export function ConceptReview({
  conceptId,
  sections,
}: {
  conceptId: string;
  sections: ReviewSection[];
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [complete, setComplete] = useState(false);
  const [sessionScores, setSessionScores] = useState<number[]>([]);

  const currentSection = sections[currentIndex];
  const sessionMastery = sessionScores.length
    ? Math.round(
        sessionScores.reduce((total, score) => total + score * 25, 0) /
          sessionScores.length
      )
    : null;

  async function saveScore(score: number) {
    if (!currentSection || saving) return;

    const isLastCard = currentIndex === sections.length - 1;

    setSaving(true);
    setStatus('Saving review...');

    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      setStatus('Log in to save review progress.');
      setSaving(false);
      return;
    }

    const result = score >= 4 ? 'knew' : score >= 2 ? 'guessed' : 'missed';

    const { error } = await supabase.from('review_attempts').insert({
      user_id: userData.user.id,
      concept_id: conceptId,
      score,
      result,
    });

    if (error) {
      setStatus(`Error: ${error.message}`);
      setSaving(false);
      return;
    }

    setSessionScores((scores) => [...scores, score]);

    if (isLastCard) {
      setComplete(true);
      setRevealed(false);
      setStatus('');
    } else {
      const nextIndex = currentIndex + 1;

      setCurrentIndex(nextIndex);
      setRevealed(false);
      setStatus(`Review saved. Next card: ${nextIndex + 1}/${sections.length}`);
    }

    setSaving(false);
  }

  if (sections.length === 0) {
    return (
      <div>
        <h3>Review</h3>
        <p className="muted">
          No article sections are available yet. Add sections in Creator Studio
          before reviewing this concept.
        </p>
      </div>
    );
  }

  if (complete) {
    return (
      <div>
        <h3>Review Complete</h3>
        <p className="muted">Completed {sections.length} of {sections.length} cards</p>
        <p>Session Mastery: {sessionMastery ?? 0}%</p>
        <button
          className="btn primary"
          type="button"
          onClick={() => {
            setCurrentIndex(0);
            setRevealed(false);
            setComplete(false);
            setStatus('');
            setSessionScores([]);
          }}
        >
          Restart Review
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="muted">
        Session Mastery: {sessionMastery === null ? '—' : `${sessionMastery}%`}
      </p>

      <p className="muted">
        Card {currentIndex + 1} of {sections.length}
      </p>

      <h3>{currentSection.title}</h3>

      <p>{getPrompt(currentSection)}</p>

      {!revealed && (
        <button
          className="btn primary"
          type="button"
          onClick={() => setRevealed(true)}
        >
          Reveal Answer
        </button>
      )}

      {revealed && (
        <>
          <div className="card">
            <h3>Answer</h3>
            <p>{currentSection.body}</p>
          </div>

          <p className="muted">
            Grade how well you remembered this section before revealing the
            answer.
          </p>

          <div className="tabs">
            <button
              className="tab"
              type="button"
              disabled={saving}
              onClick={() => saveScore(1)}
            >
              1 Forgot
            </button>
            <button
              className="tab"
              type="button"
              disabled={saving}
              onClick={() => saveScore(2)}
            >
              2 Hard
            </button>
            <button
              className="tab"
              type="button"
              disabled={saving}
              onClick={() => saveScore(3)}
            >
              3 Good
            </button>
            <button
              className="tab"
              type="button"
              disabled={saving}
              onClick={() => saveScore(4)}
            >
              4 Easy
            </button>
          </div>
        </>
      )}

      {status && <p className="muted">{status}</p>}
    </div>
  );
}
