import { StudyPlanner } from '@/components/StudyPlanner';
import './home.css';
import { resolveActiveLibraryContext } from '@/lib/library-context';
import { loadStudyPlannerInitialData } from '@/lib/study-planner-initial-data';
import { headers } from 'next/headers';
import { after } from 'next/server';
import {
  createServerTimingRecorder,
  readProxyTiming,
  REQUEST_ID_HEADER,
} from '@/lib/request-performance';

export default async function Home() {
  const requestHeaders = await headers();
  const requestId = requestHeaders.get(REQUEST_ID_HEADER) || crypto.randomUUID();
  const timing = createServerTimingRecorder({ requestId, route: '/' });
  const activeLibraryContext = await timing.measure(
    'active_library',
    () => resolveActiveLibraryContext({ timing })
  );
  const activeLibrary = activeLibraryContext.library;
  const initialDeckData =
    activeLibrary && activeLibraryContext.user
      ? await timing.measure('home_data', () =>
          loadStudyPlannerInitialData({
            activeLibrary,
            role: activeLibraryContext.role,
            timing,
          })
        )
      : undefined;
  const inheritedTiming = readProxyTiming(requestHeaders);
  const content = timing.measureSync('home_assembly', () => (
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
        initialDeckData={initialDeckData}
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
  ));

  after(() => timing.log(inheritedTiming));

  return content;
}
