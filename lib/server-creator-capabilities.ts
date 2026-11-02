import 'server-only';

import {
  deriveCreatorCapabilities,
  type CreatorCapabilityManifest,
  type CreatorLibraryAuthority,
} from '@/lib/creator-capabilities';
import {
  resolveActiveLibraryContext,
  type ActiveLibraryContext,
} from '@/lib/library-context';
import { getServerCreatorRouteActor } from '@/lib/server-creator-route-access';

export function deriveCreatorLibraryAuthority(
  context: ActiveLibraryContext,
  userId: string
): CreatorLibraryAuthority {
  if (context.user && context.user.id !== userId) {
    throw new Error('Active Library context belongs to a different user.');
  }

  const isStaff = context.role === 'admin';
  const canAccessActiveLibrary = Boolean(context.library) && !context.isUnauthorized;

  return Object.freeze({
    activeLibraryId: context.library?.id ?? null,
    canAccessActiveLibrary,
    canManageActiveLibrary: canAccessActiveLibrary && isStaff,
  });
}
export async function getServerCreatorCapabilityManifest({
  activeLibraryContext,
}: {
  activeLibraryContext?: ActiveLibraryContext;
} = {}): Promise<CreatorCapabilityManifest | null> {
  const auth = await getServerCreatorRouteActor();
  if (!auth?.role) return null;

  // Callers that already resolved Library context should pass it so capability
  // derivation adds no duplicate auth, membership, or Library reads.
  const libraryContext =
    activeLibraryContext ??
    (await resolveActiveLibraryContext({ failOnQueryError: true }));

  return deriveCreatorCapabilities({
    userId: auth.userId,
    role: auth.role,
    library: deriveCreatorLibraryAuthority(libraryContext, auth.userId),
  });
}
