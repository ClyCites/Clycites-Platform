import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

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
          <header className="border-b border-stone-200 bg-white">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4">
              <Link className="font-display text-xl font-bold text-leaf-900" href="/">
                ClyCites
              </Link>
              <nav aria-label="Primary navigation">
                <ul className="flex items-center gap-5 text-sm font-semibold text-stone-700">
                  <li>
                    <Link className="hover:text-leaf-700" href="/dashboard">
                      Workspace
                    </Link>
                  </li>
                  <li>
                    <Link className="hover:text-leaf-700" href="/system-status">
                      System status
                    </Link>
                  </li>
                  <li>
                    <Link className="hover:text-leaf-700" href="/login">
                      Sign in
                    </Link>
                  </li>
                </ul>
              </nav>
            </div>
          </header>
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
