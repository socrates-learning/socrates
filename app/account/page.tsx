import Link from 'next/link';
import { Header, HeaderSessionProvider } from '@/components/Header';
import { LibrarySwitcher } from '@/components/LibrarySwitcher';
import {
  ResetStudyProgress,
  type StudyProgressResetConcept,
  type StudyProgressResetTopic,
} from '@/components/ResetStudyProgress';
import { resolveActiveLibraryContext } from '@/lib/library-context';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';

type AccessibleLibrary = {
  id: string;
  name: string;
  slug: string;
  isPrimary: boolean;
};

type ResetPlacementRow = {
  concepts:
    | { id: string; name: string; status: string | null }
    | { id: string; name: string; status: string | null }[]
    | null;
};

export default async function AccountPage() {
  const context = await resolveActiveLibraryContext();
  if (!context.user) redirect('/login?next=/account');

  const supabase = await createSupabaseServerClient();
  let accessibleLibraries: AccessibleLibrary[] = [];
  let resetConcepts: StudyProgressResetConcept[] = [];
  let resetTopics: StudyProgressResetTopic[] = [];

  if (context.role === 'admin' || context.role === 'editor') {
    const { data } = await supabase
      .from('libraries')
      .select('id, name, slug')
      .eq('status', 'active')
      .order('name');

    accessibleLibraries = (data || []).map((library) => ({
      ...library,
      isPrimary: false,
    }));
  } else {
    const { data } = await supabase
      .from('user_libraries')
      .select('is_primary, libraries!inner(id, name, slug, status)')
      .eq('user_id', context.user.id)
      .eq('libraries.status', 'active');

    accessibleLibraries = (data || []).flatMap((membership) => {
      const value = Array.isArray(membership.libraries)
        ? membership.libraries[0]
        : membership.libraries;

      return value
        ? [
            {
              id: value.id,
              name: value.name,
              slug: value.slug,
              isPrimary: Boolean(membership.is_primary),
            },
          ]
        : [];
    });
  }

  if (context.library) {
    const [topicResult, placementResult] = await Promise.all([
      supabase
        .from('library_nodes')
        .select('id, name, parent_id, sort_order')
        .eq('library_id', context.library.id)
        .order('sort_order')
        .order('name'),
      supabase
        .from('concept_placements')
        .select(`
          library_nodes!inner(library_id),
          concepts!inner(id, name, status)
        `)
        .eq('library_nodes.library_id', context.library.id)
        .eq('concepts.status', 'published'),
    ]);

    resetTopics = (topicResult.data || []).map((topic) => ({
      id: topic.id,
      name: topic.name,
      parentId: topic.parent_id,
      sortOrder: topic.sort_order ?? 0,
    }));

    const conceptsById = new Map<string, StudyProgressResetConcept>();
    for (const placement of (placementResult.data || []) as unknown as ResetPlacementRow[]) {
      const concept = Array.isArray(placement.concepts)
        ? placement.concepts[0]
        : placement.concepts;
      if (concept?.id && !conceptsById.has(concept.id)) {
        conceptsById.set(concept.id, { id: concept.id, name: concept.name });
      }
    }
    resetConcepts = Array.from(conceptsById.values()).sort((left, right) =>
      left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
    );
  }

  return (
    <HeaderSessionProvider email={context.user.email} role={context.role}>
      <Header />
      <main className="layout" style={{ gridTemplateColumns: '1fr' }}>
        <section
          className="stack"
          style={{ margin: '0 auto', maxWidth: 860, minWidth: 0, width: '100%' }}
        >
          <section className="panel">
            <div
              style={{
                alignItems: 'center',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 14,
                justifyContent: 'space-between',
              }}
            >
              <div>
                <p className="muted" style={{ margin: '0 0 5px' }}>
                  Your Socrates account
                </p>
                <h2 style={{ margin: 0 }}>Account Settings</h2>
              </div>
              <Link className="btn ghost" href="/">
                Back to Home
              </Link>
            </div>
          </section>

          <section className="panel stack" aria-labelledby="account-details-title">
            <h3 id="account-details-title" style={{ margin: 0 }}>
              Account details
            </h3>
            <dl
              style={{
                display: 'grid',
                gap: 12,
                gridTemplateColumns:
                  'repeat(auto-fit, minmax(min(220px, 100%), 1fr))',
                margin: 0,
              }}
            >
              <div>
                <dt className="muted">Signed in as</dt>
                <dd style={{ margin: '4px 0 0', overflowWrap: 'anywhere' }}>
                  <strong>{context.user.email || 'Account'}</strong>
                </dd>
              </div>
              <div>
                <dt className="muted">Role</dt>
                <dd style={{ margin: '4px 0 0', textTransform: 'capitalize' }}>
                  <strong>{context.role}</strong>
                </dd>
              </div>
              <div>
                <dt className="muted">Current Library</dt>
                <dd style={{ margin: '4px 0 0' }}>
                  <strong>{context.library?.name || 'No Library selected'}</strong>
                </dd>
              </div>
            </dl>
          </section>

          <section
            className="panel stack"
            aria-labelledby="accessible-libraries-title"
          >
            <div>
              <h3 id="accessible-libraries-title" style={{ margin: 0 }}>
                Accessible Libraries
              </h3>
              <p className="muted" style={{ margin: '6px 0 0' }}>
                Libraries currently available to this account.
              </p>
            </div>

            {accessibleLibraries.length ? (
              <ul
                style={{
                  display: 'grid',
                  gap: 8,
                  listStyle: 'none',
                  margin: 0,
                  padding: 0,
                }}
              >
                {accessibleLibraries.map((library) => (
                  <li
                    key={library.id}
                    style={{
                      alignItems: 'center',
                      background:
                        context.library?.id === library.id ? '#eef5ff' : '#f8fafc',
                      border: '1px solid #dbe3ef',
                      borderRadius: 10,
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 8,
                      justifyContent: 'space-between',
                      padding: '11px 13px',
                    }}
                  >
                    <strong>{library.name}</strong>
                    <span className="muted" style={{ fontSize: 13 }}>
                      {context.library?.id === library.id
                        ? 'Current'
                        : library.isPrimary
                          ? 'Primary'
                          : 'Available'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                No active Library is currently assigned to this account.
              </p>
            )}

            <LibrarySwitcher context={context} returnTo="/account" />
          </section>

          <ResetStudyProgress
            concepts={resetConcepts}
            library={context.library ? { id: context.library.id, name: context.library.name } : null}
            topics={resetTopics}
          />
        </section>
      </main>
    </HeaderSessionProvider>
  );
}
