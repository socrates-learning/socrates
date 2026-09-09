const INTERNAL_URL_BASE = 'https://socrates.invalid';

function hasUnsafeDecodedPath(pathname: string) {
  let decoded = pathname;

  for (let pass = 0; pass < 3; pass += 1) {
    let next: string;

    try {
      next = decodeURIComponent(decoded);
    } catch {
      return true;
    }

    if (
      !next.startsWith('/') ||
      next.startsWith('//') ||
      next.includes('\\') ||
      /[\u0000-\u001f\u007f]/.test(next)
    ) {
      return true;
    }

    if (next === decoded) break;
    decoded = next;
  }

  return false;
}

export function getSafeInternalPath(
  value: string | null | undefined,
  fallback = '/'
) {
  if (!value || value !== value.trim()) return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  if (value.includes('\\') || /[\u0000-\u001f\u007f]/.test(value)) return fallback;

  try {
    const parsed = new URL(value, INTERNAL_URL_BASE);

    if (parsed.origin !== INTERNAL_URL_BASE || hasUnsafeDecodedPath(parsed.pathname)) {
      return fallback;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
