import { requireStaffCreatorRoute } from '@/lib/server-creator-route-access';

export default async function CreatorLibrariesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireStaffCreatorRoute();
  return children;
}
