import { LibraryOrganizerClient } from '@/components/LibraryOrganizerClient';
import { requireStaffCreatorRoute } from '@/lib/server-creator-route-access';

export default async function LibraryOrganizerPage() {
  await requireStaffCreatorRoute();
  return <LibraryOrganizerClient />;
}
