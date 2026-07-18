'use client';

import { Boxes, GitMerge, PackageCheck } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { RouteTabs } from '@/components/ui/tabs';
import { ProtectedPage } from '@/components/protected-page';

export function TraceabilityShell({
  organizationId,
  active,
  children,
}: {
  organizationId: string;
  active: string;
  children: ReactNode;
}) {
  const root = `/organizations/${organizationId}/traceability`;
  return (
    <ProtectedPage>
      <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6">
        <header className="flex flex-wrap items-center justify-between gap-4 pb-5">
          <div>
            <p className="text-sm font-bold uppercase text-emerald-800">Physical traceability</p>
            <h1 className="mt-1 text-3xl font-bold text-stone-950">Coffee inventory</h1>
          </div>
          <Link
            className="text-sm font-bold text-emerald-800 underline"
            href={`/organizations/${organizationId}/deliveries`}
          >
            Accepted deliveries
          </Link>
        </header>
        <RouteTabs
          active={active}
          items={[
            { href: `${root}/batches`, label: 'Batches' },
            { href: `${root}/transformations`, label: 'Transformations' },
            { href: `${root}/lots`, label: 'Cooperative lots' },
          ]}
        />
        <div className="mt-6">{children}</div>
      </main>
    </ProtectedPage>
  );
}

export const phaseThreeIcons = { Batches: Boxes, Transformations: GitMerge, Lots: PackageCheck };
