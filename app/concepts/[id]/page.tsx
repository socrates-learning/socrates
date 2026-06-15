import { ConceptTabs } from '@/components/ConceptTabs';
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
            <p className="muted">
              This concept does not exist or is not published yet.
            </p>
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
        <Sidebar activeId={concept.id} />

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

          <ConceptTabs
            conceptId={concept.id}
            summary={concept.summary}
            whyItMatters={concept.why_it_matters}
            status={concept.status}
          />
        </section>
      </main>
    </>
  );
}