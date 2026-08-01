'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type ConceptDistinction = {
  id: string;
  distinction: string;
};

export function ConceptDistinctions({ conceptId }: { conceptId: string }) {
  const [items, setItems] = useState<ConceptDistinction[]>([]);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('concept_distinctions')
        .select('*')
        .eq('concept_id', conceptId);

      setItems(data || []);
    }

    load();
  }, [conceptId]);

  return (
    <div>
      {items.length === 0 ? (
        <p className="muted">No distinctions added yet.</p>
      ) : (
        items.map((item) => (
          <div key={item.id}>
            <p>{item.distinction}</p>
            <hr />
          </div>
        ))
      )}
    </div>
  );
}
