'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export function ConceptNetwork({ conceptId }: { conceptId: string }) {
  const [distinctions, setDistinctions] = useState<any[]>([]);

  useEffect(() => {
    async function loadNetwork() {
      const { data } = await supabase
        .from('concept_distinctions')
        .select('*')
        .eq('concept_id', conceptId);

      setDistinctions(data || []);
    }

    loadNetwork();
  }, [conceptId]);

  return (
    <div>
      <p className="muted">Current concept</p>

      <div className="card">
        <strong>This concept</strong>
      </div>

      <br />

      <p className="muted">Connected distinctions</p>

      {distinctions.length === 0 ? (
        <p className="muted">No network connections yet.</p>
      ) : (
        distinctions.map((item) => (
          <div className="card" key={item.id}>
            <strong>Connected concept</strong>
            <p>{item.distinction}</p>
          </div>
        ))
      )}
    </div>
  );
}