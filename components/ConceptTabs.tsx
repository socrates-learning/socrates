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
    mastery: number;
    attemptCount: number;
  }>;
}) {
  const [activeTab, setActiveTab] = useState('learn');

  function getMasteryLabel(mastery: number) {
    if (mastery < 50) return 'Needs review';
    if (mastery < 75) return 'Developing';
    if (mastery < 90) return 'Strong';
    return 'Mastered';
  }

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
            {sections.map((section) => (
              <div key={section.id} style={{ marginBottom: '16px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '16px',
                    marginBottom: '6px',
                  }}
                >
                  <strong>{section.title}</strong>
                  <span className="muted">
                    {section.attemptCount === 0
                      ? 'Not reviewed yet'
                      : `${section.mastery}% · ${getMasteryLabel(section.mastery)}`}
                  </span>
                </div>
                <div className="bar">
                  <span style={{ width: `${section.mastery}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'review' && (
        <div className="card">
          <ConceptReview conceptId={conceptId} sections={sections} />
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
