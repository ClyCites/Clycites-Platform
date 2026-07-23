import type { Metadata, Viewport } from 'next';
import { Inter, Sora } from 'next/font/google';
import type { ReactNode } from 'react';

import { AppNavigation } from '@/components/app-navigation';
import { PwaRegistration } from '@/components/pwa-registration';
import { cn } from '@/lib/utils';

import './globals.css';
import { Providers } from './providers';

const fontSans = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

const fontDisplay = Sora({
  subsets: ['latin'],
  display: 'swap',
  weight: ['500', '600', '700'],
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: { default: 'ClyCites Verifiable Agriculture Platform', template: '%s | ClyCites' },
  description: 'Traceable agricultural trade from farmer delivery to transparent settlement.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'ClyCites' },
};

export const viewport: Viewport = {
  themeColor: '#153f2e',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en-UG" className={cn(fontSans.variable, fontDisplay.variable)}>
      <body className="min-h-screen font-sans antialiased">
        <Providers>
          <PwaRegistration />
          <AppNavigation />
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
