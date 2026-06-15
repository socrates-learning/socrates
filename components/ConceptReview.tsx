'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export function ConceptReview({ conceptId }: { conceptId: string }) {
  const [revealed, setRevealed] = useState(false);
  const [status, setStatus] = useState('');

  async function saveScore(score: number) {
    setStatus('Saving review...');

    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      setStatus('Log in to save review progress.');
      return;
    }

    const result =
  score >= 4 ? 'knew' : score >= 2 ? 'guessed' : 'missed';

const { error } = await supabase.from('review_attempts').insert({
  user_id: userData.user.id,
  concept_id: conceptId,
  score,
  result,
});

    if (error) {
      setStatus(`Error: ${error.message}`);
      return;
    }

    setStatus(`Review saved. Score: ${score}/4`);
  }

  return (
    <div>
      <h3>Review Question</h3>

      <p>
        What is the key idea behind this concept?
      </p>

      {!revealed && (
        <button className="btn primary" type="button" onClick={() => setRevealed(true)}>
          Reveal Answer
        </button>
      )}

      {revealed && (
        <>
          <p className="muted">
            Try explaining the concept in your own words, then grade how well you remembered it.
          </p>

          <div className="tabs">
            <button className="tab" type="button" onClick={() => saveScore(1)}>
              1 Forgot
            </button>
            <button className="tab" type="button" onClick={() => saveScore(2)}>
              2 Hard
            </button>
            <button className="tab" type="button" onClick={() => saveScore(3)}>
              3 Good
            </button>
            <button className="tab" type="button" onClick={() => saveScore(4)}>
              4 Easy
            </button>
          </div>
        </>
      )}

      {status && <p className="muted">{status}</p>}
    </div>
  );
}