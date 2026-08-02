import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase-server';

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
  user: { id: string; email: string | null } | null;
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
}: {
  requestedSlug?: string | null;
} = {}): Promise<ActiveLibraryContext> {
  const supabase = await createSupabaseServerClient();
  const cookieStore = await cookies();
  const requestedSlugIsValid =
    requestedSlug === undefined ||
    requestedSlug === null ||
    isValidLibrarySlug(requestedSlug);
  const cookieSlug = cookieStore.get(ACTIVE_LIBRARY_COOKIE)?.value || null;
  const cookieSlugIsValid = isValidLibrarySlug(cookieSlug);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  async function findActiveLibraryBySlug(slug: string | null | undefined) {
    if (!isValidLibrarySlug(slug)) return null;

    const { data } = await supabase
      .from('libraries')
      .select('id, name, slug, description, status')
      .eq('slug', slug)
      .eq('status', 'active')
      .maybeSingle();

    return normalizeLibrary(data as ActiveLibrary | null);
  }

  async function findPharmacologyFallback() {
    return findActiveLibraryBySlug('pharmacology');
  }

  if (!user) {
    const requestedLibrary = requestedSlugIsValid
      ? await findActiveLibraryBySlug(requestedSlug)
      : null;
    const fallbackLibrary = requestedSlug
      ? null
      : await findPharmacologyFallback();

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

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();
  const roleValue = roleData?.role;
  const role: ActiveLibraryRole =
    roleValue === 'admin' || roleValue === 'editor' ? roleValue : 'learner';

  const { data: membershipRows } = await supabase
    .from('user_libraries')
    .select('library_id, is_primary, libraries(id, name, slug, description, status)')
    .eq('user_id', user.id);

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
    const requestedLibrary = requestedSlugIsValid
      ? await findActiveLibraryBySlug(requestedSlug)
      : null;
    if (requestedLibrary) {
      return {
        library: requestedLibrary,
        role,
        user: { id: user.id, email: user.email ?? null },
        source: 'url',
        canSwitch: true,
        hasMembership,
        needsSelection: false,
        isUnauthorized: false,
      };
    }

    const cookieLibrary = cookieSlugIsValid
      ? await findActiveLibraryBySlug(cookieSlug)
      : null;
    if (cookieLibrary) {
      return {
        library: cookieLibrary,
        role,
        user: { id: user.id, email: user.email ?? null },
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
        user: { id: user.id, email: user.email ?? null },
        source: 'primary',
        canSwitch: true,
        hasMembership,
        needsSelection: false,
        isUnauthorized: false,
      };
    }

    const fallbackLibrary = await findPharmacologyFallback();

    return {
      library: fallbackLibrary,
      role,
      user: { id: user.id, email: user.email ?? null },
      source: fallbackLibrary ? 'fallback' : 'none',
      canSwitch: true,
      hasMembership,
      needsSelection: false,
      isUnauthorized: false,
    };
  }

  if (requestedSlug) {
    const requestedLibrary = requestedSlugIsValid
      ? await findActiveLibraryBySlug(requestedSlug)
      : null;
    const requestedMembership = requestedLibrary
      ? memberships.find(
          (membership) => membership.library.id === requestedLibrary.id
        )
      : null;

    return {
      library: requestedMembership?.library || null,
      role,
      user: { id: user.id, email: user.email ?? null },
      source: requestedMembership ? 'url' : 'none',
      canSwitch: false,
      hasMembership,
      needsSelection: !primaryMembership,
      isUnauthorized: Boolean(requestedLibrary && !requestedMembership),
    };
  }

  return {
    library: primaryMembership?.library || null,
    role,
    user: { id: user.id, email: user.email ?? null },
    source: primaryMembership ? 'primary' : 'none',
    canSwitch: false,
    hasMembership,
    needsSelection: !primaryMembership,
    isUnauthorized: false,
  };
}
