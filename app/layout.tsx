import './globals.css';
import { SocratesShellProvider } from '@/components/application-shell/SocratesShell';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Socrates',
  description: 'Concept-network learning platform for pharmacology.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><SocratesShellProvider>{children}</SocratesShellProvider></body>
    </html>
  );
}
