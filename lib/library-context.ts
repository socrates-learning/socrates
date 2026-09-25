import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getVerifiedRequestAuthContext } from '@/lib/server-auth-context';
import { getSoleAccessibleLibrary } from '@/lib/home-bootstrap';
import type { ServerTimingRecorder } from '@/lib/request-performance';
import { assertCreatorQuerySucceeded } from '@/lib/creator-data-access';

export const ACTIVE_LIBRARY_COOKIE = 'socrates_active_library';

export type ActiveLibraryRole = 'anonymous' | 'learner' | 'editor' | 'admin';
export type ActiveLibrarySource =
  | 'url'
  | 'cookie'
  | 'primary'
  | 'fallback'
  | 'none';

export type ActiveLibrary = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string | null;
};

export type ActiveLibraryContext = {
  library: ActiveLibrary | null;
  role: ActiveLibraryRole;
  user: { id: string; email: string | null; displayName: string } | null;
  source: ActiveLibrarySource;
  canSwitch: boolean;
  hasMembership: boolean;
  needsSelection: boolean;
  isUnauthorized: boolean;
};

const LIBRARY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isEditorRole(role: ActiveLibraryRole) {
  return role === 'editor' || role === 'admin';
}

export function isValidLibrarySlug(slug: string | null | undefined) {
  return Boolean(slug && LIBRARY_SLUG_PATTERN.test(slug));
}

function normalizeLibrary(library: ActiveLibrary | null): ActiveLibrary | null {
  if (!library?.id || !library.slug || library.status !== 'active') {
    return null;
  }

  return library;
}

export async function resolveActiveLibraryContext({
  requestedSlug,
  timing,
  failOnQueryError = false,
}: {
  requestedSlug?: string | null;
  timing?: ServerTimingRecorder;
  failOnQueryError?: boolean;
} = {}): Promise<ActiveLibraryContext> {
  const supabase = await createSupabaseServerClient();
  const cookieStore = await cookies();
  const requestedSlugIsValid =
    requestedSlug === undefined ||
    requestedSlug === null ||
    isValidLibrarySlug(requestedSlug);
  const cookieSlug = cookieStore.get(ACTIVE_LIBRARY_COOKIE)?.value || null;
  const cookieSlugIsValid = isValidLibrarySlug(cookieSlug);
  const requestAuth = await getVerifiedRequestAuthContext();
  const authResult = requestAuth
    ? { data: { user: null }, error: null }
    : await supabase.auth.getUser();
  if (failOnQueryError) {
    assertCreatorQuerySucceeded(authResult.error, 'the authenticated user');
  }
  const {
    data: { user },
  } = authResult;

  async function findActiveLibraryBySlug(slug: string | null | undefined) {
    if (!isValidLibrarySlug(slug)) return null;

    const result = await supabase
      .from('libraries')
      .select('id, name, slug, description, status')
      .eq('slug', slug)
      .eq('status', 'active')
      .maybeSingle();
    if (failOnQueryError) {
      assertCreatorQuerySucceeded(result.error, 'the requested active Library');
    }

    return normalizeLibrary(result.data as ActiveLibrary | null);
  }

  async function findDefaultActiveLibrary() {
    const result = await supabase
      .from('libraries')
      .select('id, name, slug, description, status')
      .eq('status', 'active')
      .order('name')
      .limit(1)
      .maybeSingle();
    if (failOnQueryError) {
      assertCreatorQuerySucceeded(result.error, 'the default active Library');
    }

    return normalizeLibrary(result.data as ActiveLibrary | null);
  }

  if (!requestAuth && !user) {
    const requestedLibrary = requestedSlugIsValid
      ? await findActiveLibraryBySlug(requestedSlug)
      : null;
    const fallbackLibrary = requestedSlug
      ? null
      : await findDefaultActiveLibrary();

    return {
      library: requestedLibrary || fallbackLibrary,
      role: 'anonymous',
      user: null,
      source: requestedLibrary ? 'url' : fallbackLibrary ? 'fallback' : 'none',
      canSwitch: false,
      hasMembership: false,
      needsSelection: false,
      isUnauthorized: false,
    };
  }

  const authenticatedUserId = requestAuth?.userId || user?.id;

  if (!authenticatedUserId) {
    throw new Error('Authenticated request is missing a user identifier.');
  }

  const candidateSlugs = [requestedSlug, cookieSlug].filter(
    (slug, index, values): slug is string =>
      isValidLibrarySlug(slug) && values.indexOf(slug) === index
  );
  const loadAccessContext = () => Promise.all([
      requestAuth
        ? Promise.resolve({ data: { role: requestAuth.role }, error: null })
        : supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', authenticatedUserId)
            .maybeSingle(),
      supabase
        .from('user_libraries')
        .select('library_id, is_primary, libraries(id, name, slug, description, status)')
        .eq('user_id', authenticatedUserId),
      candidateSlugs.length
        ? supabase
            .from('libraries')
            .select('id, name, slug, description, status')
            .eq('status', 'active')
            .in('slug', candidateSlugs)
        : Promise.resolve({ data: [], error: null }),
    ]);
  const [roleResult, membershipResult, candidateLibraryResult] = timing
    ? await timing.measure('library_access', loadAccessContext)
    : await loadAccessContext();
  if (failOnQueryError) {
    assertCreatorQuerySucceeded(roleResult.error, 'the Creator role');
    assertCreatorQuerySucceeded(
      membershipResult.error,
      'the Creator Library memberships'
    );
    assertCreatorQuerySucceeded(
      candidateLibraryResult.error,
      'the selected Creator Library'
    );
  }
  const roleData = roleResult.data;
  const roleValue = roleData?.role;
  const role: ActiveLibraryRole =
    roleValue === 'admin' || roleValue === 'editor' ? roleValue : 'learner';
  const membershipRows = membershipResult.data;
  const resolvedUser = {
    id: authenticatedUserId,
    email: requestAuth?.email ?? user?.email ?? null,
    displayName: requestAuth
      ? requestAuth.displayName
      : (user?.user_metadata?.full_name as string | undefined) ||
        (user?.email ? user.email.split('@')[0] : 'there'),
  };
  const candidateLibraries = new Map(
    (candidateLibraryResult.data || []).flatMap((library) => {
      const normalized = normalizeLibrary(library as ActiveLibrary | null);
      return normalized ? [[normalized.slug, normalized] as const] : [];
    })
  );
  const requestedLibrary = requestedSlug
    ? candidateLibraries.get(requestedSlug) || null
    : null;
  const cookieLibrary = cookieSlugIsValid
    ? candidateLibraries.get(cookieSlug || '') || null
    : null;

  const memberships = (membershipRows || []).flatMap((membership) => {
    const libraryValue = Array.isArray(membership.libraries)
      ? membership.libraries[0]
      : membership.libraries;
    const library = normalizeLibrary(libraryValue as ActiveLibrary | null);

    return library
      ? [
          {
            library,
            isPrimary: Boolean(membership.is_primary),
          },
        ]
      : [];
  });
  const primaryMembership = memberships.find((membership) => membership.isPrimary);
  const hasMembership = memberships.length > 0;

  if (isEditorRole(role)) {
    if (requestedLibrary) {
      return {
        library: requestedLibrary,
        role,
        user: resolvedUser,
        source: 'url',
        canSwitch: true,
        hasMembership,
        needsSelection: false,
        isUnauthorized: false,
      };
    }

    if (requestedSlug !== undefined && requestedSlug !== null) {
      return {
        library: null,
        role,
        user: resolvedUser,
        source: 'none',
        canSwitch: true,
        hasMembership,
        needsSelection: false,
        isUnauthorized: false,
      };
    }

    if (cookieLibrary) {
      return {
        library: cookieLibrary,
        role,
        user: resolvedUser,
        source: 'cookie',
        canSwitch: true,
        hasMembership,
        needsSelection: false,
        isUnauthorized: false,
      };
    }

    if (primaryMembership?.library) {
      return {
        library: primaryMembership.library,
        role,
        user: resolvedUser,
        source: 'primary',
        canSwitch: true,
        hasMembership,
        needsSelection: false,
        isUnauthorized: false,
      };
    }

    const loadStaffFallback = () => supabase
        .from('libraries')
        .select('id, name, slug, description, status')
        .eq('status', 'active')
        .order('name')
        .limit(2);
    const activeLibraryResult = timing
      ? await timing.measure('library_staff_fallback', loadStaffFallback)
      : await loadStaffFallback();
    if (failOnQueryError) {
      assertCreatorQuerySucceeded(
        activeLibraryResult.error,
        'the staff Library choices'
      );
    }
    const activeLibraryRows = activeLibraryResult.data;
    const soleActiveLibrary = getSoleAccessibleLibrary(
      (activeLibraryRows || []).flatMap((library) => {
        const normalized = normalizeLibrary(library as ActiveLibrary | null);
        return normalized ? [normalized] : [];
      })
    );

    if (soleActiveLibrary) {
      return {
        library: soleActiveLibrary,
        role,
        user: resolvedUser,
        source: 'fallback',
        canSwitch: true,
        hasMembership,
        needsSelection: false,
        isUnauthorized: false,
      };
    }

    return {
      library: null,
      role,
      user: resolvedUser,
      source: 'none',
      canSwitch: true,
      hasMembership,
      needsSelection: false,
      isUnauthorized: false,
    };
  }

  const soleMembership = getSoleAccessibleLibrary(memberships);
  const canSwitch = memberships.length > 1;

  if (requestedSlug) {
    const requestedMembership = requestedLibrary
      ? memberships.find(
          (membership) => membership.library.id === requestedLibrary.id
        )
      : null;

    return {
      library: requestedMembership?.library || null,
      role,
      user: resolvedUser,
      source: requestedMembership ? 'url' : 'none',
      canSwitch,
      hasMembership,
      needsSelection: !requestedMembership && !primaryMembership && !soleMembership,
      isUnauthorized: Boolean(requestedLibrary && !requestedMembership),
    };
  }

  const cookieMembership = cookieLibrary
    ? memberships.find(
        (membership) => membership.library.id === cookieLibrary.id
      )
    : null;
  const resolvedMembership =
    cookieMembership || primaryMembership || soleMembership;

  return {
    library: resolvedMembership?.library || null,
    role,
    user: resolvedUser,
    source: cookieMembership
      ? 'cookie'
      : primaryMembership
        ? 'primary'
        : soleMembership
          ? 'fallback'
          : 'none',
    canSwitch,
    hasMembership,
    needsSelection: !resolvedMembership,
    isUnauthorized: false,
  };
}
