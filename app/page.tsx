import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import Link from 'next/link';

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

export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: libraries, error: librariesError } = await supabase
    .from('libraries')
    .select('id, name, description')
    .order('name');

  const { data: recentConcepts, error: recentConceptsError } = await supabase
    .from('concepts')
    .select('id, name, concept_type, summary, created_at')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(4);

  const reviewAttemptsResult = user
    ? await supabase
        .from('review_attempts')
        .select('concept_id, score, created_at')
        .order('created_at', { ascending: false })
        .limit(100)
    : { data: [], error: null };

  const newestReviewAttempt = reviewAttemptsResult.data?.[0] || null;
  const continueConceptResult = newestReviewAttempt?.concept_id
    ? await supabase
        .from('concepts')
        .select('id, name, concept_type')
        .eq('id', newestReviewAttempt.concept_id)
        .maybeSingle()
    : { data: null, error: null };

  const continueScores = continueConceptResult.data
    ? (reviewAttemptsResult.data || []).flatMap((attempt) =>
        attempt.concept_id === continueConceptResult.data?.id &&
        attempt.score !== null
          ? [attempt.score]
          : []
      )
    : [];
  const continueMastery = continueScores.length
    ? Math.round(
        continueScores.reduce((total, score) => total + score * 25, 0) /
          continueScores.length
      )
    : 0;

  return (
    <>
      <Header />
      <main className="layout">
        <Sidebar />

        <section className="stack">
          <div className="panel hero">
            <h2>{user ? 'Welcome back' : 'Welcome to Socrates'}</h2>
            <p>
              {user
                ? `Signed in as ${user.email || 'your Socrates account'}.`
                : 'Explore the public learning library or sign in to track your review activity.'}
            </p>
            <Link className="btn primary" href="/pharmacology">
              Open Pharmacology Library
            </Link>
          </div>

          <div className="dashboard">
            <div className="panel">
              <h3>Continue Learning</h3>
              {!user ? (
                <p className="muted">
                  Sign in to resume from your latest review activity.
                </p>
              ) : continueConceptResult.data && newestReviewAttempt ? (
                <>
                  <strong>{continueConceptResult.data.name}</strong>
                  <p className="muted">
                    {continueConceptResult.data.concept_type || 'Concept'}
                    <br />
                    {continueMastery}% mastered
                    <br />
                    Last reviewed:{' '}
                    {formatLastReviewed(newestReviewAttempt.created_at)}
                  </p>
                  <Link
                    className="btn primary"
                    href={`/concepts/${continueConceptResult.data.id}`}
                  >
                    Resume
                  </Link>
                </>
              ) : (
                <p className="muted">
                  No review activity yet. Start with a published concept from
                  the library.
                </p>
              )}
            </div>

            <div className="panel">
              <h3>Review Activity</h3>
              {reviewAttemptsResult.error ? (
                <p className="muted">Could not load review activity.</p>
              ) : user ? (
                <p>
                  <strong>{reviewAttemptsResult.data?.length || 0}</strong>
                  <br />
                  <span className="muted">
                    recent review attempts recorded for your account
                  </span>
                </p>
              ) : (
                <p className="muted">Review tracking starts after login.</p>
              )}
            </div>

            <div className="panel">
              <h3>Recent Published Concepts</h3>
              {recentConceptsError && (
                <p className="muted">Could not load recent concepts.</p>
              )}

              {!recentConceptsError &&
                (recentConcepts?.length ? (
                  recentConcepts.map((concept) => (
                    <p key={concept.id}>
                      <Link href={`/concepts/${concept.id}`}>
                        <strong>{concept.name}</strong>
                      </Link>
                      <br />
                      <span className="muted">
                        {concept.concept_type || 'Concept'}
                      </span>
                    </p>
                  ))
                ) : (
                  <p className="muted">No published concepts available yet.</p>
                ))}
            </div>

            <div className="panel">
              <h3>Libraries</h3>
              {librariesError && (
                <p className="muted">Could not load libraries.</p>
              )}

              {!librariesError &&
                (libraries?.length ? (
                  libraries.map((library) => (
                    <p key={library.id}>
                      <strong>{library.name}</strong>
                      <br />
                      <span className="muted">{library.description}</span>
                    </p>
                  ))
                ) : (
                  <p className="muted">No libraries available yet.</p>
                ))}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
