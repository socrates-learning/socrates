import { CreatorStudioClient } from '@/components/CreatorStudioClient';
import { LibrarySwitcher } from '@/components/LibrarySwitcher';
import { resolveActiveLibraryContext } from '@/lib/library-context';

export default async function CreatorPage() {
  const activeLibraryContext = await resolveActiveLibraryContext();

  return (
    <CreatorStudioClient activeLibraryContext={activeLibraryContext}>
      <LibrarySwitcher context={activeLibraryContext} returnTo="/creator" />
    </CreatorStudioClient>
  );
}
