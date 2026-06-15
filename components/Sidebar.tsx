'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type Concept = {
  id: string;
  name: string;
  concept_type: string | null;
};

export function Sidebar({ activeId }: { activeId?: string }) {
  const [concepts, setConcepts] = useState<Concept[]>([]);

  useEffect(() => {
    async function loadConcepts() {
      const { data } = await supabase
        .from('concepts')
        .select('id, name, concept_type')
        .order('name');

      setConcepts(data || []);
    }

    loadConcepts();
  }, []);

  return (
    <aside className="panel sidebar">
      <h3>Knowledge Library</h3>

      <strong>Pharmacology</strong>

      <div className="sub">
        <strong>Cardiovascular Pharmacology</strong>

        <div className="sub">
          <strong>Hypertension Drugs</strong>

          {concepts.map((concept) => (
            <Link
              key={concept.id}
              className={`tree-item ${activeId === concept.id ? 'active' : ''}`}
              href={`/concepts/${concept.id}`}
            >
              {concept.name}
              <br />
              <small className="muted">
                {concept.concept_type || 'Concept'}
              </small>
            </Link>
          ))}
        </div>
      </div>
    </aside>
  );
}