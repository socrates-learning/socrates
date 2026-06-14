import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Socrates',
  description: 'Concept-network learning platform for pharmacology.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
