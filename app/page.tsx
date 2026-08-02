import { Header } from '@/components/Header';
import { LibrarySwitcher } from '@/components/LibrarySwitcher';
import { Sidebar } from '@/components/Sidebar';
import { resolveActiveLibraryContext } from '@/lib/library-context';
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
  const activeLibraryContext = await resolveActiveLibraryContext();
  const activeLibrary = activeLibraryContext.library;
  const shouldShowDashboard = !activeLibraryContext.needsSelection;

  const activeNodesResult = activeLibrary
    ? await supabase
        .from('library_nodes')
        .select('id')
        .eq('library_id', activeLibrary.id)
    : { data: [], error: null };
  const activeNodeIds = (activeNodesResult.data || []).map((node) => node.id);
  const activePlacementsResult =
    activeNodeIds.length > 0
      ? await supabase
          .from('concept_placements')
          .select(`
            concept_id,
            library_node_id,
            concepts!inner (
              id,
              name,
              concept_type,
              summary,
              created_at,
              status
            )
          `)
          .eq('concepts.status', 'published')
          .in('library_node_id', activeNodeIds)
      : { data: [], error: null };
  const activeConceptsById = new Map<
    string,
    {
      id: string;
      name: string;
      concept_type: string | null;
      summary: string | null;
      created_at: string | null;
    }
  >();

  for (const placement of activePlacementsResult.data || []) {
    const conceptValue = Array.isArray(placement.concepts)
      ? placement.concepts[0]
      : placement.concepts;

    if (conceptValue && !activeConceptsById.has(conceptValue.id)) {
      activeConceptsById.set(conceptValue.id, conceptValue);
    }
  }

  const activeConceptIds = [...activeConceptsById.keys()];
  const recentConcepts = [...activeConceptsById.values()]
    .sort(
      (a, b) =>
        new Date(b.created_at || 0).getTime() -
        new Date(a.created_at || 0).getTime()
    )
    .slice(0, 4);
  const reviewAttemptsResult =
    user && activeConceptIds.length > 0
      ? await supabase
          .from('review_attempts')
          .select('concept_id, score, created_at')
          .in('concept_id', activeConceptIds)
          .order('created_at', { ascending: false })
          .limit(100)
      : { data: [], error: null };

  const newestReviewAttempt = reviewAttemptsResult.data?.find((attempt) =>
    activeConceptsById.has(attempt.concept_id || '')
  ) || null;
  const continueConcept = newestReviewAttempt?.concept_id
    ? activeConceptsById.get(newestReviewAttempt.concept_id)
    : null;

  const continueScores = continueConcept
    ? (reviewAttemptsResult.data || []).flatMap((attempt) =>
        attempt.concept_id === continueConcept.id && attempt.score !== null
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
        <Sidebar activeLibrary={activeLibrary} />

        <section className="stack">
          <LibrarySwitcher context={activeLibraryContext} />

          <div className="panel hero">
            <h2>{user ? 'Welcome back' : 'Welcome to Socrates'}</h2>
            <p>
              {user
                ? `Signed in as ${user.email || 'your Socrates account'}.`
                : 'Explore the public learning library or sign in to track your review activity.'}
            </p>
            {activeLibrary ? (
              <>
                <p className="muted">
                  Active library: <strong>{activeLibrary.name}</strong> ·
                  resolved from {activeLibraryContext.source}
                </p>
                <Link
                  className="btn primary"
                  href={`/library/${activeLibrary.slug}`}
                >
                  Open {activeLibrary.name} Library
                </Link>
              </>
            ) : (
              <p className="muted">
                No active library is assigned yet. An admin can assign a primary
                library membership.
              </p>
            )}
          </div>

          {activeLibraryContext.needsSelection && (
            <div className="panel">
              <h3>Library Selection Needed</h3>
              <p className="muted">
                Your account does not have a primary library membership yet, so
                Socrates is not showing global learning data here.
              </p>
            </div>
          )}

          {shouldShowDashboard && (
          <div className="dashboard">
            <div className="panel">
              <h3>Continue Learning</h3>
              {!user ? (
                <p className="muted">
                  Sign in to resume from your latest review activity.
                </p>
              ) : continueConcept && newestReviewAttempt ? (
                <>
                  <strong>{continueConcept.name}</strong>
                  <p className="muted">
                    {continueConcept.concept_type || 'Concept'}
                    <br />
                    {continueMastery}% mastered
                    <br />
                    Last reviewed:{' '}
                    {formatLastReviewed(newestReviewAttempt.created_at)}
                  </p>
                  <Link
                    className="btn primary"
                    href={`/concepts/${continueConcept.id}`}
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
                    recent review attempts in {activeLibrary?.name || 'this library'}
                  </span>
                </p>
              ) : (
                <p className="muted">Review tracking starts after login.</p>
              )}
            </div>

            <div className="panel">
              <h3>Recent Published Concepts</h3>
              {(activeNodesResult.error || activePlacementsResult.error) && (
                <p className="muted">Could not load recent concepts.</p>
              )}

              {!activeNodesResult.error &&
                !activePlacementsResult.error &&
                (recentConcepts.length ? (
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
                  <p className="muted">
                    No published concepts are placed in this library yet.
                  </p>
                ))}
            </div>

            <div className="panel">
              <h3>Active Library Summary</h3>
              {activeLibrary ? (
                <>
                  <p>
                    <strong>{activeConceptIds.length}</strong>
                    <br />
                    <span className="muted">
                      published concepts placed in {activeLibrary.name}
                    </span>
                  </p>
                  <p>
                    <strong>{activeNodeIds.length}</strong>
                    <br />
                    <span className="muted">library categories</span>
                  </p>
                </>
              ) : (
                <p className="muted">No active library selected.</p>
              )}
            </div>
          </div>
          )}
        </section>
      </main>
    </>
  );
}
