import type { Metadata } from 'next';
import { requireAdminWebsitePreview } from '@/lib/server-website-preview-access';

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function WebsitePreviewLayout({ children }: { children: React.ReactNode }) {
  await requireAdminWebsitePreview();
  return children;
}
