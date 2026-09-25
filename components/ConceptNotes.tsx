'use client';

import { useEffect, useState } from 'react';
import { loadConceptNote, saveConceptNote } from '@/lib/concept-notes';
import { supabase } from '@/lib/supabase';

export function ConceptNotes({ conceptId }: { conceptId: string }) {
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('Loading notes...');

  useEffect(() => {
    async function loadNote() {
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        setStatus('Log in to save personal notes.');
        return;
      }

      const { data } = await loadConceptNote(
        supabase,
        userData.user.id,
        conceptId
      );

      setNote(data?.note ?? '');
      setStatus('');
    }

    loadNote();
  }, [conceptId]);

  async function saveNote() {
    setStatus('Saving...');

    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      setStatus('You must be logged in to save notes.');
      return;
    }

    const { error } = await saveConceptNote(supabase, {
      userId: userData.user.id,
      conceptId,
      note,
    });

    if (error) {
      setStatus(`Error: ${error.message}`);
      return;
    }

    setStatus('Notes saved.');
  }

  return (
    <div>
      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Write your personal notes for this concept..."
      />

      <br />
      <br />

      <button className="btn primary" type="button" onClick={saveNote}>
        Save Notes
      </button>

      {status && <p className="muted">{status}</p>}
    </div>
  );
}
