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
  const router = useRouter();
  const pathname = usePathname();

  const base = `/dashboard/${organizationId}`;
  const activeSegment = pathname.startsWith(base)
    ? (pathname.slice(base.length).replace(/^\//, '').split('/')[0] ?? '')
    : '';

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-8 sm:py-8">
      <nav
        aria-label="Dashboard sections"
        className="mb-8 hidden overflow-x-auto border-b border-border sm:block"
      >
        <div className="flex min-w-max gap-1">
          {navItems.map((item) => (
            <Link
              key={item.segment}
              href={item.segment ? `${base}/${item.segment}` : base}
              aria-current={item.segment === activeSegment ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium',
                item.segment === activeSegment
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <item.icon className="size-4" aria-hidden="true" />
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
      <Select
        aria-label="Dashboard section"
        className="mb-6 sm:hidden"
        value={activeSegment}
        onChange={(event) =>
          router.push(event.target.value ? `${base}/${event.target.value}` : base)
        }
      >
        {navItems.map((item) => (
          <option key={item.segment} value={item.segment}>
            {item.label}
          </option>
        ))}
      </Select>
      {children}
    </div>
  );
}
