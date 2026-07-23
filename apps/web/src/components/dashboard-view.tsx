'use client';

import { ArrowRight, Building2, LayoutGrid, ShieldCheck, Users } from 'lucide-react';
import Link from 'next/link';

import { cn } from '@/lib/utils';

import { useAuth } from './auth-provider';
import { ProtectedPage } from './protected-page';

export function DashboardView() {
  const { user } = useAuth();
  const isPlatformAdmin = user?.platformRole === 'PLATFORM_ADMIN';
  const organizations = user?.organizations ?? [];

  const stats = [
    {
      label: 'Workspaces',
      value: organizations.length,
      icon: Building2,
      description: 'Organizations you can access',
    },
    {
      label: 'Access level',
      value: isPlatformAdmin ? 'Platform admin' : 'Member',
      icon: ShieldCheck,
      description: isPlatformAdmin ? 'Full platform control' : 'Scoped to your organizations',
    },
    {
      label: 'Active roles',
      value: new Set(organizations.map((organization) => organization.role)).size,
      icon: Users,
      description: 'Distinct roles across workspaces',
    },
  ];

  return (
    <ProtectedPage>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
              Operations
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Welcome back, {user?.firstName ?? 'there'}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Choose an organization workspace to manage traceable identities, deliveries, and
              settlement.
            </p>
          </div>
        </header>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <stat.icon className="size-4.5" aria-hidden="true" />
                </span>
              </div>
              <p className="mt-3 font-display text-2xl font-semibold text-foreground">
                {stat.value}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{stat.description}</p>
            </div>
          ))}
        </section>

        <section className="mt-10">
          <div className="flex items-center gap-2">
            <LayoutGrid className="size-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="font-display text-lg font-semibold text-foreground">Your workspaces</h2>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {isPlatformAdmin && (
              <WorkspaceCard
                href="/admin/organizations"
                eyebrow="Platform administration"
                title="Manage organizations"
                description="Create, review, and govern every organization on the platform."
                icon={<ShieldCheck className="size-5" aria-hidden="true" />}
                accent
              />
            )}

            {organizations.map((organization) => (
              <WorkspaceCard
                key={organization.organizationId}
                href={`/organizations/${organization.organizationId}/overview`}
                eyebrow={organization.role.replaceAll('_', ' ')}
                title={organization.organizationName}
                description="Farmers, farms, members, collection points, consent, and QR identities."
                icon={<Building2 className="size-5" aria-hidden="true" />}
              />
            ))}

            {!isPlatformAdmin && organizations.length === 0 && (
              <div className="rounded-xl border border-dashed border-border bg-muted/40 p-8 text-center md:col-span-2 xl:col-span-3">
                <p className="font-display text-base font-semibold text-foreground">
                  No workspaces yet
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  You&apos;ll see organizations here once you&apos;re granted access.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </ProtectedPage>
  );
}

function WorkspaceCard({
  href,
  eyebrow,
  title,
  description,
  icon,
  accent = false,
}: {
  href: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group relative flex h-full flex-col rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
    >
      <div className="flex items-start justify-between">
        <span
          className={cn(
            'flex size-11 items-center justify-center rounded-lg',
            accent
              ? 'bg-primary text-primary-foreground'
              : 'bg-accent text-accent-foreground',
          )}
        >
          {icon}
        </span>
        <ArrowRight
          className="size-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary"
          aria-hidden="true"
        />
      </div>
      <p className="mt-4 text-xs font-semibold tracking-wide text-primary uppercase">{eyebrow}</p>
      <h3 className="mt-1 font-display text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </Link>
  );
}
