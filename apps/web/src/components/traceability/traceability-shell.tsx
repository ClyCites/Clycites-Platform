'use client';

import { Boxes, GitMerge, PackageCheck, ShieldCheck } from 'lucide-react';
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
      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6">
        <header className="flex flex-wrap items-center justify-between gap-4 pb-5">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.16em] uppercase text-primary">
              Physical traceability
            </p>
            <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-foreground">
              Coffee inventory
            </h1>
          </div>
          <Link
            className="text-sm font-semibold text-primary underline"
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
            { href: `${root}/verification`, label: 'Verification' },
            { href: `${root}/registers`, label: 'Registers' },
          ]}
        />
        <div className="mt-6">{children}</div>
      </div>
    </ProtectedPage>
  );
}

export const phaseThreeIcons = {
  Batches: Boxes,
  Transformations: GitMerge,
  Lots: PackageCheck,
  Verification: ShieldCheck,
};
