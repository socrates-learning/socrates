import { ConceptNotes } from '@/components/ConceptNotes';
import { ConceptReview } from '@/components/ConceptReview';
import { ConceptDistinctions } from '@/components/ConceptDistinctions';
import { ConceptNetwork } from '@/components/ConceptNetwork';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default async function ConceptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: concept } = await supabase
    .from('concepts')
    .select(`
      id,
      name,
      concept_type,
      importance,
      difficulty,
      estimated_time,
      summary,
      why_it_matters,
      status
    `)
    .eq('id', id)
    .single();

  if (!concept) {
    return (
      <>
        <Header />
        <main className="layout">
          <Sidebar />
          <section className="panel">
            <h2>Concept not found</h2>
            <p className="muted">This concept does not exist or is not published yet.</p>
            <Link className="btn primary" href="/pharmacology">
              Back to Pharmacology
            </Link>
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="layout">
        <Sidebar />

        <section className="stack">
          <div className="panel concept-title">
            <div>
              <h2>{concept.name}</h2>
              <p className="muted">
                {concept.concept_type} · {concept.importance} importance ·{' '}
                {concept.difficulty} · {concept.estimated_time}
              </p>
            </div>

            <div className="mastery">
              <strong>Overall Mastery</strong>
              <h2 style={{ margin: '4px 0' }}>50%</h2>
              <div className="bar">
                <span style={{ width: '50%' }} />
              </div>
            </div>
          </div>

          <div className="tabs">
            <button className="tab active">Learn</button>
            <button className="tab">Review</button>
            <button className="tab">Distinctions</button>
            <button className="tab">Notes</button>
            <button className="tab">Network</button>
            <Link className="tab" href="/creator">
              Create
            </Link>
          </div>

          <div className="grid">
            <div className="card">
              <h3>Summary</h3>
              <p>{concept.summary}</p>
            </div>

            <div className="card">
              <h3>Why this matters</h3>
              <p>{concept.why_it_matters || 'No explanation added yet.'}</p>
            </div>

            <div className="card">
              <h3>Status</h3>
              <p className="muted">{concept.status}</p>
            </div>

            <div className="card">
  <h3>Notes</h3>
  <ConceptNotes conceptId={concept.id} />
</div>

<div className="card">
  <ConceptReview conceptId={concept.id} />
</div>

            <div className="card">
              <h3>Sub-Mastery</h3>
              {['Mechanism', 'Clinical Uses', 'Adverse Effects', 'Contraindications', 'Distinctions'].map((s) => (
                <p key={s}>
                  <strong>{s}</strong>
                  <br />
                  <span className="muted">50%</span>
                  <span className="bar">
                    <span style={{ width: '50%' }} />
                  </span>
                </p>
              ))}
            </div>

            <div className="card">
  <h3>Distinctions</h3>
  <ConceptDistinctions conceptId={concept.id} />
</div>

<div className="card">
  <h3>Network</h3>
  <ConceptNetwork conceptId={concept.id} />
</div>

          </div>
        </section>
      </main>
    </>
  );
}