import { StudyPlanner } from '@/components/StudyPlanner';
import { resolveActiveLibraryContext } from '@/lib/library-context';

export default async function Home() {
  const activeLibraryContext = await resolveActiveLibraryContext();
  const activeLibrary = activeLibraryContext.library;

  return (
    activeLibraryContext.needsSelection ? (
      <main style={{ padding: 24 }}>
        <div className="panel">
          <h2>Library Selection Needed</h2>
          <p className="muted">
            Your account does not have a primary library membership yet.
            An admin can assign a library so you can build a study plan.
          </p>
        </div>
      </main>
    ) : (
      <StudyPlanner
        activeLibrary={activeLibrary}
        initialSession={
          activeLibraryContext.user
            ? {
                userId: activeLibraryContext.user.id,
                email: activeLibraryContext.user.email,
                displayName: activeLibraryContext.user.displayName,
                role: activeLibraryContext.role,
              }
            : null
        }
      />
    )
  );
}
