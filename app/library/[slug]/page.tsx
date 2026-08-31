import { notFound } from 'next/navigation';
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
    <StudyPlanner
      activeLibrary={context.library}
      initialSession={
        context.user
          ? {
              userId: context.user.id,
              email: context.user.email,
              displayName: context.user.displayName,
              role: context.role,
            }
          : null
      }
    />
  );
}
