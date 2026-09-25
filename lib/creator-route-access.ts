export type CreatorRouteRole = 'learner' | 'editor' | 'admin';

export const CREATOR_LEARNER_ALLOWLIST_ENV =
  'SOCRATES_CREATOR_LEARNER_USER_IDS';

export type CreatorRouteScope = 'outside' | 'shared' | 'staff';

export type HomeCreatorEntry = Readonly<{
  label: 'Creator Studio';
  href: '/creator';
}>;

type CreatorRouteAccessInput = {
  pathname: string;
  role: CreatorRouteRole;
  userId: string;
  learnerAllowlist: string | undefined;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function classifyCreatorRoute(pathname: string): CreatorRouteScope {
  const normalizedPathname =
    pathname.length > 1 && pathname.endsWith('/')
      ? pathname.slice(0, -1)
      : pathname;

  if (normalizedPathname === '/creator') return 'shared';

  if (
    normalizedPathname === '/creator/concepts' ||
    /^\/creator\/concepts\/(?:new|[^/]+)$/.test(normalizedPathname)
  ) {
    return 'shared';
  }

  if (
    normalizedPathname === '/creator' ||
    normalizedPathname.startsWith('/creator/')
  ) {
    // Article, Library Organizer, and any future Creator descendants are
    // staff-only unless they are deliberately added to the shared contract.
    return 'staff';
  }

  return 'outside';
}

export function parseCreatorLearnerAllowlist(value: string | undefined): {
  valid: boolean;
  userIds: ReadonlySet<string>;
} {
  if (value === undefined || value.trim() === '') {
    return { valid: true, userIds: new Set<string>() };
  }

  const entries = value.split(',').map((entry) => entry.trim().toLowerCase());

  if (entries.some((entry) => !entry || !UUID_PATTERN.test(entry))) {
    return { valid: false, userIds: new Set<string>() };
  }

  return { valid: true, userIds: new Set(entries) };
}

export function canAccessSharedCreator({
  learnerAllowlist,
  role,
  userId,
}: Omit<CreatorRouteAccessInput, 'pathname'>): boolean {
  if (role === 'editor' || role === 'admin') return true;
  if (role !== 'learner' || !UUID_PATTERN.test(userId)) return false;

  const parsed = parseCreatorLearnerAllowlist(learnerAllowlist);
  return parsed.valid && parsed.userIds.has(userId.toLowerCase());
}

export function resolveHomeCreatorEntry(
  input: Omit<CreatorRouteAccessInput, 'pathname'>
): HomeCreatorEntry {
  void input;
  // Creator route authorization remains centralized in canAccessCreatorRoute.
  // Home no longer advertises the legacy Study Creator compatibility route.
  return { label: 'Creator Studio', href: '/creator' };
}

export function canAccessCreatorRoute({
  learnerAllowlist,
  pathname,
  role,
  userId,
}: CreatorRouteAccessInput): boolean {
  const scope = classifyCreatorRoute(pathname);

  if (scope === 'outside') return true;
  if (role === 'editor' || role === 'admin') return true;
  if (scope === 'staff') return false;

  return canAccessSharedCreator({ learnerAllowlist, role, userId });
}
