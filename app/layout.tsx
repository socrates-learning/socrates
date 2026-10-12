import './globals.css';
import './appearance.css';
import { AppearanceProvider } from '@/components/AppearanceProvider';
import { SocratesShellProvider } from '@/components/application-shell/SocratesShell';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Socrates',
  description: 'Concept-network learning platform for pharmacology.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body><AppearanceProvider><SocratesShellProvider>{children}</SocratesShellProvider></AppearanceProvider></body>
    </html>
  );
}
