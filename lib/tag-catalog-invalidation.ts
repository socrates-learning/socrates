export const TAG_CATALOG_USAGE_INVALIDATION_KEY =
  'socrates:tag-catalog-usage-invalidated';

export function broadcastTagCatalogUsageInvalidation() {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      TAG_CATALOG_USAGE_INVALIDATION_KEY,
      `${Date.now()}:${window.crypto.randomUUID()}`
    );
  } catch {
    // A same-tab catalog refresh still succeeds when storage is unavailable.
  }
}
