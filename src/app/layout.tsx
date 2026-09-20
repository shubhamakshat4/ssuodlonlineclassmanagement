import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SSU ODL Classes',
  description: 'Sri Sri University — Open & Distance Learning online class portal',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
