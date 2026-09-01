export const REQUEST_USER_ID_HEADER = 'x-socrates-user-id';
export const REQUEST_USER_EMAIL_HEADER = 'x-socrates-user-email';
export const REQUEST_USER_ROLE_HEADER = 'x-socrates-user-role';
export const REQUEST_USER_DISPLAY_NAME_HEADER = 'x-socrates-user-display-name';

export type RequestAuthRole = 'learner' | 'editor' | 'admin';

export type RequestAuthContext = {
  userId: string;
  email: string | null;
  displayName: string;
  role: RequestAuthRole;
};

type HeaderReader = {
  get(name: string): string | null;
};

function decodeHeaderValue(value: string | null) {
  if (!value) return null;

  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function readRequestAuthContext(
  headers: HeaderReader
): RequestAuthContext | null {
  const userId = headers.get(REQUEST_USER_ID_HEADER);
  const role = headers.get(REQUEST_USER_ROLE_HEADER);

  if (
    !userId ||
    (role !== 'learner' && role !== 'editor' && role !== 'admin')
  ) {
    return null;
  }

  return {
    userId,
    email: decodeHeaderValue(headers.get(REQUEST_USER_EMAIL_HEADER)),
    displayName:
      decodeHeaderValue(headers.get(REQUEST_USER_DISPLAY_NAME_HEADER)) || 'there',
    role,
  };
}
