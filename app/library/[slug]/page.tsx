import { notFound } from 'next/navigation';
import { Header } from '@/components/Header';
import { LibrarySwitcher } from '@/components/LibrarySwitcher';
import { Sidebar } from '@/components/Sidebar';
import { StudyPlanner } from '@/components/StudyPlanner';
import { resolveActiveLibraryContext } from '@/lib/library-context';

export default async function LibraryLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const context = await resolveActiveLibraryContext({ requestedSlug: slug });

  if (!context.library || context.isUnauthorized) {
    notFound();
  }

  return (
    <>
      <Header />
      <main className="layout">
        <Sidebar activeLibrary={context.library} />

        <section className="stack">
          <LibrarySwitcher context={context} returnTo={`/library/${context.library.slug}`} />
          <StudyPlanner activeLibrary={context.library} />
        </section>
      </main>
    </>
  );
}
