'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ConceptNotes } from '@/components/ConceptNotes';
import { ConceptReview } from '@/components/ConceptReview';
import { ConceptDistinctions } from '@/components/ConceptDistinctions';
import { ConceptNetwork } from '@/components/ConceptNetwork';

export function ConceptTabs({
  conceptId,
  summary,
  whyItMatters,
  status,
  sections,
}: {
  conceptId: string;
  summary: string | null;
  whyItMatters: string | null;
  status: string | null;
  sections: Array<{
    id: string;
    title: string;
    body: string;
    sort_order: number | null;
  }>;
}) {
  const [activeTab, setActiveTab] = useState('learn');

  return (
    <>
      <div className="tabs">
        {['learn', 'review', 'distinctions', 'notes', 'network'].map((tab) => (
          <button
            key={tab}
            className={`tab ${activeTab === tab ? 'active' : ''}`}
            type="button"
            onClick={() => setActiveTab(tab)}
          >
            {tab[0].toUpperCase() + tab.slice(1)}
          </button>
        ))}

        <Link className="tab" href="/creator">
          Create
        </Link>
      </div>

      {activeTab === 'learn' && (
        <div className="grid">
          <div className="card">
            <h3>Summary</h3>
            <p>{summary || 'No summary added yet.'}</p>
          </div>

          <div className="card">
            <h3>Why this matters</h3>
            <p>{whyItMatters || 'No explanation added yet.'}</p>
          </div>

          {sections.map((section) => (
            <div className="card" key={section.id}>
              <h3>{section.title}</h3>
              <p>{section.body}</p>
            </div>
          ))}

          <div className="card">
            <h3>Status</h3>
            <p className="muted">{status || 'draft'}</p>
          </div>

          <div className="card">
            <h3>Sub-Mastery</h3>
            {[
              'Mechanism',
              'Clinical Uses',
              'Adverse Effects',
              'Contraindications',
              'Distinctions',
            ].map((section) => (
              <p key={section}>
                <strong>{section}</strong>
                <br />
                <span className="muted">50%</span>
                <span className="bar">
                  <span style={{ width: '50%' }} />
                </span>
              </p>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'review' && (
        <div className="card">
          <ConceptReview conceptId={conceptId} />
        </div>
      )}

      {activeTab === 'distinctions' && (
        <div className="card">
          <h3>Distinctions</h3>
          <ConceptDistinctions conceptId={conceptId} />
        </div>
      )}

      {activeTab === 'notes' && (
        <div className="card">
          <h3>Notes</h3>
          <ConceptNotes conceptId={conceptId} />
        </div>
      )}

      {activeTab === 'network' && (
        <div className="card">
          <h3>Network</h3>
          <ConceptNetwork conceptId={conceptId} />
        </div>
      )}
    </>
  );
}
