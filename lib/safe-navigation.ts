'use client';

type NavigationEntryLike = {
  index: number;
  url: string | null;
};

type NavigationLike = {
  currentEntry: NavigationEntryLike | null;
  entries: () => NavigationEntryLike[];
};

type RouterLike = {
  back: () => void;
  replace: (href: string) => void;
};

function hasMeaningfulSameOriginPreviousEntry() {
  const navigation = (
    window as Window & { navigation?: NavigationLike }
  ).navigation;
  const currentEntry = navigation?.currentEntry;

  if (!navigation || !currentEntry) return false;

  const previousEntry = navigation
    .entries()
    .find((entry) => entry.index === currentEntry.index - 1);

  if (!previousEntry?.url) return false;

  const previousUrl = new URL(previousEntry.url);
  const currentUrl = new URL(window.location.href);

  return (
    previousUrl.origin === currentUrl.origin &&
    previousUrl.href !== currentUrl.href
  );
}

export function navigateBackOrFallback(
  router: RouterLike,
  fallbackHref = '/'
) {
  if (hasMeaningfulSameOriginPreviousEntry()) {
    router.back();
    return;
  }

  router.replace(fallbackHref);
}
