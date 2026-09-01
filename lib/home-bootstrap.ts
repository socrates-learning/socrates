import type { ActiveLibrary, ActiveLibraryRole } from '@/lib/library-context';
import type { StudyPlannerInitialData } from '@/lib/study-planner-initial-data';

export type HomeBootstrapView =
  | 'loading'
  | 'error'
  | 'staff-library-chooser'
  | 'no-active-library'
  | 'deck-error'
  | 'ready';

export function hasAuthoritativeInitialDeckData(
  initialDeckData: StudyPlannerInitialData | undefined,
  activeLibrary: ActiveLibrary | null
) {
  return Boolean(
    initialDeckData &&
      activeLibrary?.id &&
      initialDeckData.libraryId === activeLibrary.id
  );
}

export function isStaffRole(role: ActiveLibraryRole | string | null) {
  return role === 'admin' || role === 'editor';
}

export function getHomeBootstrapView({
  activeLibraryId,
  availableLibraryCount,
  bootstrapError,
  hasDeck,
  isLoading,
  role,
}: {
  activeLibraryId: string | null | undefined;
  availableLibraryCount: number;
  bootstrapError: string;
  hasDeck: boolean;
  isLoading: boolean;
  role: ActiveLibraryRole | string | null;
}): HomeBootstrapView {
  if (isLoading) return 'loading';
  if (bootstrapError) return 'error';

  if (!activeLibraryId) {
    return isStaffRole(role) && availableLibraryCount > 0
      ? 'staff-library-chooser'
      : 'no-active-library';
  }

  return hasDeck ? 'ready' : 'deck-error';
}

export function getBootstrapErrorMessage(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);

  return detail && detail !== '[object Object]'
    ? `Home could not be loaded: ${detail}`
    : 'Home could not be loaded because of an unexpected error.';
}
