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
  sources,
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
  sources: Array<{
    id: string;
    title: string;
    source_type: string | null;
    note: string | null;
    url: string | null;
  }>;
}) {
  const [activeTab, setActiveTab] = useState('learn');

  function getMasteryLabel(mastery: number) {
    if (mastery < 50) return 'Needs review';
    if (mastery < 75) return 'Developing';
    if (mastery < 90) return 'Strong';
    return 'Mastered';
  }

  const needsReviewSections = sections
    .filter((section) => section.attemptCount === 0 || section.mastery < 75)
    .sort((a, b) => {
      const aIsUnreviewed = a.attemptCount === 0;
      const bIsUnreviewed = b.attemptCount === 0;

      if (aIsUnreviewed !== bIsUnreviewed) return aIsUnreviewed ? -1 : 1;
      return a.mastery - b.mastery;
    })
    .slice(0, 3);

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

          <div className="card">
            <h3>Needs Review</h3>
            {needsReviewSections.length === 0 ? (
              <p className="muted">
                All reviewed sections are currently strong.
              </p>
            ) : (
              needsReviewSections.map((section) => (
                <div
                  key={section.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '16px',
                    marginBottom: '10px',
                  }}
                >
                  <strong>{section.title}</strong>
                  <span className="muted">
                    {section.attemptCount === 0
                      ? 'Not reviewed yet'
                      : `${section.mastery}% · ${getMasteryLabel(section.mastery)}`}
                  </span>
                </div>
              ))
            )}
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

          <div className="card">
            <h3>Sources</h3>
            {sources.length === 0 ? (
              <p className="muted">No sources attached yet.</p>
            ) : (
              sources.map((source) => (
                <div key={source.id} style={{ marginBottom: '16px' }}>
                  <strong>{source.title}</strong>
                  <p className="muted">{source.source_type || 'Unspecified'}</p>
                  <p>{source.note || 'No note added.'}</p>
                  {source.url && (
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.url}
                    </a>
                  )}
                </div>
              ))
            )}
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
