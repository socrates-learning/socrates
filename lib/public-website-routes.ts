// Shared website navigation. Access is independently restricted to active Admins.
export const publicWebsiteNavigation = [
  { label: 'Home', href: '/website' },
  { label: 'How It Works', href: '/website/how-it-works' },
  { label: 'Features', href: '/website/features' },
  { label: 'Pricing', href: '/website/pricing' },
  { label: 'About', href: '/website/about' },
  { label: 'Contact', href: '/website/contact' },
] as const;

export type PublicWebsitePath = typeof publicWebsiteNavigation[number]['href'];

export function isPublicWebsitePath(pathname: string) {
  return publicWebsiteNavigation.some(page => page.href === pathname);
}
