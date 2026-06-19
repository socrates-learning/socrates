import { ConceptTabs } from '@/components/ConceptTabs';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import Link from 'next/link';

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export default async function ConceptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  let concept = null;

  if (isUuid(id)) {
    const { data, error } = await supabase
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

    if (error && process.env.NODE_ENV !== 'production') {
      console.error('Failed to load concept by ID:', error);
    }

    concept = data;
  } else {
    const { data, error } = await supabase
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
      `);

    if (error && process.env.NODE_ENV !== 'production') {
      console.error('Failed to load concepts by slug:', error);
    }

    concept = data?.find((item) => slugify(item.name) === id) || null;
  }

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
