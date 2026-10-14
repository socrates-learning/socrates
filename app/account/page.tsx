import Link from 'next/link';
import DeleteAccount from '@/components/DeleteAccount';
import Image from 'next/image';
import { ArrowLeft, BookOpen, ExternalLink, LockKeyhole, Palette, RefreshCw, UserRound } from 'lucide-react';
import { AppearanceSelector } from '@/components/AppearanceSelector';
import styles from '@/components/AccountSettings.module.css';
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
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.logo} prefetch={false}><Image src="/brand/socrates-logo-dark.png" alt="Socrates — Learn anything." width={270} height={152} priority /></Link>
        <Link href="/" className={styles.back}><ArrowLeft size={18} aria-hidden="true" />Back to Home</Link>
      </header>
      <main className={styles.main}>
        <div className={styles.title}>
          <h1>Account Settings</h1>
          <p>Manage your account, appearance, and learning experience.</p>
        </div>
        <div className={styles.sections}>
          <section className={styles.panel} aria-labelledby="account-details-title">
            <div className={styles.heading}><span className={styles.icon}><UserRound aria-hidden="true" /></span><div><h2 id="account-details-title">Account Details</h2><p>Your account information and current access.</p></div></div>
            <dl className={styles.details}>
              <div><dt>Email Address</dt><dd>{context.user.email || 'Account'}</dd></div>
              <div><dt>Role</dt><dd className={styles.role}>{context.role}</dd></div>
              <div><dt>Current Library</dt><dd>{context.library?.name || 'No Library selected'}</dd></div>
            </dl>
          </section>
          <section className={styles.panel} aria-labelledby="appearance-title">
            <div className={styles.heading}><span className={styles.icon}><Palette aria-hidden="true" /></span><div><h2 id="appearance-title">Appearance</h2><p>Choose how Socrates looks to you.</p></div></div>
            <AppearanceSelector />
          </section>
          <section className={styles.panel} aria-labelledby="study-preferences-title">
            <div className={styles.heading}><span className={styles.icon}><BookOpen aria-hidden="true" /></span><div><h2 id="study-preferences-title">Study Preferences</h2><p>Manage your learning environment.</p></div></div>
            <div className={styles.libraries}>
              <div><h3 id="accessible-libraries-title">Accessible Libraries</h3><p>Libraries currently available to this account.</p></div>
              <div>
                {accessibleLibraries.length ? <ul>{accessibleLibraries.map((library) => <li key={library.id}>
                  <strong>{library.name}</strong><span>{context.library?.id === library.id ? 'Current' : library.isPrimary ? 'Primary' : 'Available'}</span>
                </li>)}</ul> : <p>No active Library is currently assigned to this account.</p>}
                <LibrarySwitcher context={context} returnTo="/account" />
              </div>
            </div>
          </section>
          <section className={`${styles.panel} ${styles.progress}`} aria-labelledby="progress-management-title">
            <div className={styles.heading}><span className={styles.icon}><RefreshCw aria-hidden="true" /></span><div><h2 id="progress-management-title">Progress Management</h2></div></div>
            <ResetStudyProgress
              concepts={resetConcepts}
              library={context.library ? { id: context.library.id, name: context.library.name } : null}
              topics={resetTopics}
            />
          </section>
          <section className={styles.panel} aria-labelledby="account-security-title">
            <div className={styles.heading}><span className={styles.icon}><LockKeyhole aria-hidden="true" /></span><div><h2 id="account-security-title">Account Security</h2><p>Manage your account security.</p></div></div>
            <div className={styles.security}><div><h3>Email &amp; Password</h3><p>Use your existing secure account controls in Profile.</p></div><Link href="/profile?section=security">Manage Security<ExternalLink size={15} aria-hidden="true" /></Link></div>
            <DeleteAccount />
          </section>
        </div>
      </main>
    </div>
  );
}
