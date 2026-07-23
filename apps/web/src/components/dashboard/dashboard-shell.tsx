'use client';

import {
  BarChart3,
  FileText,
  LayoutDashboard,
  Palette,
  ScrollText,
  ShieldCheck,
  ToggleRight,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ComponentType, ReactNode } from 'react';

import { useAuth } from '@/components/auth-provider';
import { ThemeToggle } from '@/components/dashboard/theme-toggle';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

type NavItem = { segment: string; label: string; icon: ComponentType<{ className?: string }> };

const navItems: NavItem[] = [
  { segment: '', label: 'Overview', icon: LayoutDashboard },
  { segment: 'analytics', label: 'Analytics', icon: BarChart3 },
  { segment: 'branding', label: 'Branding', icon: Palette },
  { segment: 'features', label: 'Features', icon: ToggleRight },
  { segment: 'roles', label: 'Roles', icon: ShieldCheck },
  { segment: 'reports', label: 'Reports', icon: FileText },
  { segment: 'audit', label: 'Audit', icon: ScrollText },
];

export function DashboardShell({
  organizationId,
  children,
}: {
  organizationId: string;
  children: ReactNode;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const base = `/dashboard/${organizationId}`;
  const activeSegment = pathname.startsWith(base)
    ? pathname.slice(base.length).replace(/^\//, '').split('/')[0] ?? ''
    : '';
  const activeLabel = navItems.find((item) => item.segment === activeSegment)?.label ?? 'Overview';
  const organizations = user?.organizations ?? [];

  return (
    <div className="grid min-h-[calc(100vh-4rem)] grid-cols-1 lg:grid-cols-[16rem_1fr]">
      <aside className="hidden border-r border-sidebar-border bg-sidebar lg:flex lg:flex-col">
        <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-6">
          <ShieldCheck className="size-5 text-sidebar-primary" />
          <span className="font-display text-sm font-bold text-sidebar-foreground">
            Administration
          </span>
        </div>
        <nav className="flex-1 space-y-1 p-4">
          {navItems.map((item) => {
            const href = item.segment ? `${base}/${item.segment}` : base;
            const isActive = item.segment === activeSegment;
            const Icon = item.icon;
            return (
              <Link
                key={item.segment || 'overview'}
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex h-16 items-center justify-between gap-4 border-b border-border px-6">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Dashboard</span>
            <span className="text-muted-foreground">/</span>
            <span className="font-semibold text-foreground">{activeLabel}</span>
          </nav>
          <div className="flex items-center gap-3">
            {organizations.length > 0 && (
              <Select
                aria-label="Switch organization"
                className="h-9 w-52"
                value={organizationId}
                onChange={(event) => router.push(`/dashboard/${event.target.value}`)}
              >
                {organizations.map((organization) => (
                  <option key={organization.organizationId} value={organization.organizationId}>
                    {organization.organizationName}
                  </option>
                ))}
              </Select>
            )}
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="lg:hidden">
            <Select
              aria-label="Dashboard section"
              className="mb-4"
              value={activeSegment}
              onChange={(event) =>
                router.push(event.target.value ? `${base}/${event.target.value}` : base)
              }
            >
              {navItems.map((item) => (
                <option key={item.segment || 'overview'} value={item.segment}>
                  {item.label}
                </option>
              ))}
            </Select>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
