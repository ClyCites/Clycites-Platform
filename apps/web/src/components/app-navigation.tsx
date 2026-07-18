'use client';

import { Button } from '@clycites/ui';
import Link from 'next/link';

import { useAuth } from './auth-provider';

export function AppNavigation() {
  const { user, loading, activeOrganizationId, selectOrganization, signOut } = useAuth();
  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link className="font-display text-xl font-bold text-leaf-900" href="/">
          ClyCites
        </Link>
        {user ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-3">
            {user.organizations.length > 0 && (
              <label className="flex items-center gap-2 text-sm font-semibold text-stone-700">
                <span className="sr-only">Active organization</span>
                <select
                  className="max-w-52 rounded-md border border-stone-300 bg-white px-3 py-2"
                  value={activeOrganizationId ?? ''}
                  onChange={(event) => selectOrganization(event.target.value)}
                >
                  {user.organizations.map((organization) => (
                    <option key={organization.organizationId} value={organization.organizationId}>
                      {organization.organizationName}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Link
              className="text-sm font-semibold text-stone-700 hover:text-leaf-700"
              href="/dashboard"
            >
              Dashboard
            </Link>
            {activeOrganizationId && (
              <Link
                className="text-sm font-semibold text-stone-700 hover:text-leaf-700"
                href={`/organizations/${activeOrganizationId}/collection`}
              >
                Collection
              </Link>
            )}
            {user.platformRole === 'PLATFORM_ADMIN' && (
              <Link
                className="text-sm font-semibold text-stone-700 hover:text-leaf-700"
                href="/admin/organizations"
              >
                Administration
              </Link>
            )}
            <Button
              className="bg-stone-700 hover:bg-stone-800"
              type="button"
              onClick={() => void signOut()}
            >
              Sign out
            </Button>
          </div>
        ) : (
          <nav
            aria-label="Primary navigation"
            className="flex items-center gap-5 text-sm font-semibold text-stone-700"
          >
            <Link href="/system-status">System status</Link>
            {!loading && <Link href="/login">Sign in</Link>}
          </nav>
        )}
      </div>
    </header>
  );
}
