'use client';

import {
  Activity,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Route,
  ServerCog,
  ShieldCheck,
  Sprout,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { useAuth } from './auth-provider';

type NavItem = { href: string; label: string; icon: ComponentType<{ className?: string }> };

export function AppNavigation() {
  const { user, loading, activeOrganizationId, selectOrganization, signOut } = useAuth();
  const pathname = usePathname();

  const orgItems: NavItem[] = activeOrganizationId
    ? [
        {
          href: `/organizations/${activeOrganizationId}/finance`,
          label: 'Finance',
          icon: Wallet,
        },
        {
          href: `/organizations/${activeOrganizationId}/traceability`,
          label: 'Traceability',
          icon: Route,
        },
        {
          href: `/organizations/${activeOrganizationId}/collection`,
          label: 'Collection',
          icon: Sprout,
        },
      ]
    : [];

  const adminItems: NavItem[] =
    user?.platformRole === 'PLATFORM_ADMIN'
      ? [
          { href: '/admin/organizations', label: 'Administration', icon: ShieldCheck },
          { href: '/admin/hedera', label: 'Hedera', icon: ServerCog },
          { href: '/admin/operations', label: 'Operations', icon: Activity },
          { href: '/admin/pilots', label: 'Pilots', icon: FlaskConical },
        ]
      : [];

  const items: NavItem[] = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ...orgItems,
    ...adminItems,
  ];

  const isActive = (href: string) => pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md supports-backdrop-filter:bg-background/60">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          className="flex items-center gap-2 font-display text-xl font-semibold tracking-tight text-foreground"
          href="/"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sprout className="size-4.5" aria-hidden="true" />
          </span>
          ClyCites
        </Link>
        {user ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
            {user.organizations.length > 0 && (
              <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                <span className="sr-only">Active organization</span>
                <select
                  className="h-9 max-w-52 rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
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
            <nav aria-label="Primary navigation" className="flex flex-wrap items-center gap-1">
              {items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive(item.href) ? 'page' : undefined}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
                    isActive(item.href)
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                  )}
                >
                  <item.icon className="size-4" />
                  {item.label}
                </Link>
              ))}
            </nav>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void signOut()}
              className="ml-1"
            >
              <LogOut className="size-4" />
              Sign out
            </Button>
          </div>
        ) : (
          <nav
            aria-label="Primary navigation"
            className="flex items-center gap-4 text-sm font-medium text-muted-foreground"
          >
            <Link className="transition-colors hover:text-foreground" href="/system-status">
              System status
            </Link>
            {!loading && (
              <Link href="/login">
                <Button size="sm">Sign in</Button>
              </Link>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}
