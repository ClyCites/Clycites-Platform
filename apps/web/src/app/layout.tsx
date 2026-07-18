import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { AppNavigation } from '@/components/app-navigation';

import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: { default: 'ClyCites Verifiable Agriculture Platform', template: '%s | ClyCites' },
  description: 'Traceable agricultural trade from farmer delivery to transparent settlement.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <Providers>
          <AppNavigation />
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
