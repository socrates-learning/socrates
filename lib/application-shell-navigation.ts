export type WorkspaceId = 'home' | 'creator' | 'stats' | 'account';
export type ApplicationNavigationEntry =
  | { kind: 'link'; id: WorkspaceId; label: string; href: string; icon: string }
  | { kind: 'button'; id: 'menu'; label: string; icon: string };

export const applicationNavigation: readonly ApplicationNavigationEntry[] = [
  { kind: 'link', id: 'home', label: 'Home', href: '/', icon: '⌂' },
  { kind: 'link', id: 'creator', label: 'Creator Studio', href: '/creator', icon: '✎' },
  { kind: 'link', id: 'stats', label: 'Stats', href: '/#stats', icon: '▥' },
  { kind: 'link', id: 'account', label: 'Account Settings', href: '/account', icon: '⚙' },
  { kind: 'button', id: 'menu', label: 'Menu', icon: '☰' },
];

export function workspaceFromLocation(pathname: string, hash: string): WorkspaceId | null {
  if (pathname === '/') return ['#stats', '#stats-history', '#stats-algorithm'].includes(hash) ? 'stats' : 'home';
  if (pathname === '/creator' || pathname.startsWith('/creator/')) return 'creator';
  return pathname === '/account' ? 'account' : null;
}
