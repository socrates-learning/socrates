export function getAuthRedirectOrigin(browserOrigin?: string) {
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const origin = configuredOrigin || browserOrigin || '';

  return origin.replace(/\/$/, '');
}
