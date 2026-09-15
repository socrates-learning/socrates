import { requireStaffCreatorRoute } from '@/lib/server-creator-route-access';

export default async function CreatorArticlesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireStaffCreatorRoute();
  return children;
}
