import PublicHomepage from '@/components/public-homepage/PublicHomepage';
import { requireAdminWebsitePreview } from '@/lib/server-website-preview-access';

export default async function Website() {
  // Check the page as well as the layout, including client navigation/RSC requests.
  await requireAdminWebsitePreview();
  return <PublicHomepage authenticated />;
}
