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

function formatLastReviewed(createdAt: string | null) {
  if (!createdAt) return 'Never';

  const reviewedAt = new Date(createdAt);
  const now = new Date();
  const reviewedDay = Date.UTC(
    reviewedAt.getUTCFullYear(),
    reviewedAt.getUTCMonth(),
    reviewedAt.getUTCDate()
  );
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  const daysAgo = Math.max(
    0,
    Math.floor((today - reviewedDay) / (24 * 60 * 60 * 1000))
  );

  if (daysAgo === 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  return `${daysAgo} days ago`;
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

  const { data: sections, error: sectionsError } = await supabase
    .from('learn_sections')
    .select('id, title, body, sort_order')
    .eq('concept_id', concept.id)
    .order('sort_order')
    .order('created_at');

  if (sectionsError && process.env.NODE_ENV !== 'production') {
    console.error('Failed to load concept sections:', sectionsError);
  }

  const { data: sourceNotes, error: sourceNotesError } = await supabase
    .from('content_source_notes')
    .select('id, note, sources(title, source_type, url)')
    .eq('concept_id', concept.id)
    .is('learn_section_id', null)
    .order('created_at');

  if (sourceNotesError && process.env.NODE_ENV !== 'production') {
    console.error('Failed to load concept sources:', sourceNotesError);
  }

  const sources = (sourceNotes || []).flatMap((sourceNote) => {
    const source = Array.isArray(sourceNote.sources)
      ? sourceNote.sources[0]
      : sourceNote.sources;

    return source
      ? [
          {
            id: sourceNote.id,
            title: source.title,
            source_type: source.source_type,
            note: sourceNote.note,
            url: source.url,
          },
        ]
      : [];
  });

  const { data: reviewAttempts, error: reviewAttemptsError } = await supabase
    .from('review_attempts')
    .select('score, learn_section_id, created_at')
    .eq('concept_id', concept.id)
    .not('score', 'is', null);

  if (reviewAttemptsError && process.env.NODE_ENV !== 'production') {
    console.error('Failed to load review attempts:', reviewAttemptsError);
  }

  const scores = (reviewAttempts || []).flatMap((attempt) =>
    attempt.score === null ? [] : [attempt.score]
  );
  const mastery = scores.length
    ? Math.round(
        scores.reduce((total, score) => total + score * 25, 0) / scores.length
      )
    : 0;
  const newestReviewDate = (reviewAttempts || []).reduce<string | null>(
    (latest, attempt) =>
      !latest || new Date(attempt.created_at) > new Date(latest)
        ? attempt.created_at
        : latest,
    null
  );
  const lastReviewed = formatLastReviewed(newestReviewDate);

  const sectionScores = new Map<string, number[]>();

  for (const attempt of reviewAttempts || []) {
    if (attempt.score === null || attempt.learn_section_id === null) continue;

    const scoresForSection = sectionScores.get(attempt.learn_section_id) || [];
    scoresForSection.push(attempt.score);
    sectionScores.set(attempt.learn_section_id, scoresForSection);
  }

  const sectionsWithMastery = (sections || []).map((section) => {
    const scoresForSection = sectionScores.get(section.id) || [];
    const sectionMastery = scoresForSection.length
      ? Math.round(
          scoresForSection.reduce((total, score) => total + score * 25, 0) /
            scoresForSection.length
        )
      : 0;

    return {
      ...section,
      mastery: sectionMastery,
      attemptCount: scoresForSection.length,
    };
  });

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
              <h2 style={{ margin: '4px 0' }}>{mastery}%</h2>
              <div className="bar">
                <span style={{ width: `${mastery}%` }} />
              </div>
              <p className="muted" style={{ marginBottom: 0 }}>
                Last reviewed: {lastReviewed}
              </p>
            </div>
          </div>

          <ConceptTabs
            conceptId={concept.id}
            summary={concept.summary}
            whyItMatters={concept.why_it_matters}
            status={concept.status}
            sections={sectionsWithMastery}
            sources={sources}
          />
        </section>
      </main>
    </>
  );
}
