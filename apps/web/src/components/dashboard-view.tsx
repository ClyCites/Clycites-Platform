'use client';

import { Card } from '@clycites/ui';
import Link from 'next/link';

import { useAuth } from './auth-provider';
import { ProtectedPage } from './protected-page';

export function DashboardView() {
  const { user } = useAuth();
  return (
    <ProtectedPage>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <p className="text-sm font-bold text-leaf-700">OPERATIONS</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-leaf-900">
          Welcome, {user?.firstName}
        </h1>
        <p className="mt-2 text-stone-600">
          Choose an organization workspace to manage its identity records.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {user?.platformRole === 'PLATFORM_ADMIN' && (
            <Link href="/admin/organizations">
              <Card className="h-full transition hover:border-leaf-700">
                <h2 className="text-lg font-bold">Platform administration</h2>
                <p className="mt-2 text-stone-600">Create and review organizations.</p>
              </Card>
            </Link>
          )}
          {user?.organizations.map((organization) => (
            <Link
              key={organization.organizationId}
              href={`/organizations/${organization.organizationId}/overview`}
            >
              <Card className="h-full transition hover:border-leaf-700">
                <p className="text-xs font-bold text-leaf-700">
                  {organization.role.replaceAll('_', ' ')}
                </p>
                <h2 className="mt-2 text-lg font-bold">{organization.organizationName}</h2>
                <p className="mt-2 text-stone-600">
                  Farmers, farms, members, collection points, consent, and QR identities.
                </p>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </ProtectedPage>
  );
}
