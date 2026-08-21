import { CreatorStudioClient } from '@/components/CreatorStudioClient';
import { LibrarySwitcher } from '@/components/LibrarySwitcher';
import { resolveActiveLibraryContext } from '@/lib/library-context';

export default async function CreatorPage({
  searchParams,
}: {
  searchParams?: Promise<{ concept?: string }>;
}) {
  const activeLibraryContext = await resolveActiveLibraryContext();
  const resolvedSearchParams = searchParams ? await searchParams : {};

  return (
    <CreatorStudioClient
      activeLibraryContext={activeLibraryContext}
      initialConceptId={resolvedSearchParams.concept}
    >
      <LibrarySwitcher context={activeLibraryContext} returnTo="/creator" />
    </CreatorStudioClient>
  );
}
