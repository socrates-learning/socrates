import type { RequestAuthRole } from '@/lib/request-auth-context';

export type CreatorLibraryAuthority = Readonly<{
  activeLibraryId: string | null;
  canAccessActiveLibrary: boolean;
  canManageActiveLibrary: boolean;
}>;

export type CreatorCapabilityManifest = Readonly<{
  version: 1;
  subject: Readonly<{
    userId: string;
    role: RequestAuthRole;
  }>;
  library: CreatorLibraryAuthority;
  official: Readonly<{
    browsePublished: boolean;
    readUnpublished: boolean;
    saveConcept: boolean;
    saveQuestion: boolean;
    publishContent: boolean;
    manageTopicTree: boolean;
    manageTags: boolean;
    managePrerequisites: boolean;
    manageFormalSources: boolean;
    manageLibraries: boolean;
    manageArticles: boolean;
  }>;
  personal: Readonly<{
    createTopic: boolean;
    createConcept: boolean;
    createCard: boolean;
    editOwnContent: boolean;
    deleteOwnContent: boolean;
    createOfficialContextOverlay: boolean;
    managePersonalDecks: boolean;
    manageFlags: boolean;
  }>;
  administration: Readonly<{
    manageUsersAndRoles: boolean;
    manageLibraryMemberships: boolean;
  }>;
}>;

export type DeriveCreatorCapabilitiesInput = Readonly<{
  userId: string;
  role: RequestAuthRole;
  library: CreatorLibraryAuthority;
}>;

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach((nested) => deepFreeze(nested));
  }

  return value;
}
export function deriveCreatorCapabilities({
  library,
  role,
  userId,
}: DeriveCreatorCapabilitiesInput): CreatorCapabilityManifest {
  if (!userId.trim()) {
    throw new Error('A verified user ID is required to derive Creator capabilities.');
  }

  if (role !== 'learner' && role !== 'editor' && role !== 'admin') {
    throw new Error('Creator capabilities require a canonical Socrates role.');
  }

  const isStaff = role === 'editor' || role === 'admin';
  const canAuthorInLibrary =
    isStaff &&
    Boolean(library.activeLibraryId) &&
    library.canAccessActiveLibrary &&
    library.canManageActiveLibrary;

  return deepFreeze({
    version: 1,
    subject: { userId, role },
    library: { ...library },
    official: {
      browsePublished: true,
      readUnpublished: isStaff && library.canAccessActiveLibrary,
      saveConcept: canAuthorInLibrary,
      saveQuestion: canAuthorInLibrary,
      publishContent: canAuthorInLibrary,
      manageTopicTree: canAuthorInLibrary,
      manageTags: isStaff,
      managePrerequisites: canAuthorInLibrary,
      manageFormalSources: canAuthorInLibrary,
      manageLibraries: isStaff,
      manageArticles: canAuthorInLibrary,
    },
    personal: {
      createTopic: true,
      createConcept: true,
      createCard: true,
      editOwnContent: true,
      deleteOwnContent: true,
      createOfficialContextOverlay: true,
      managePersonalDecks: true,
      manageFlags: true,
    },
    administration: {
      manageUsersAndRoles: role === 'admin',
      manageLibraryMemberships: role === 'admin',
    },
  });
}
