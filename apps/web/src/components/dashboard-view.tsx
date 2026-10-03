'use client';

import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  LayoutGrid,
  Route,
  ShieldCheck,
  Sprout,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useAuth } from './auth-provider';
import { ProtectedPage } from './protected-page';
import { PageHeader } from './ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

export function DashboardView() {
  const { user, activeOrganizationId } = useAuth();
  const isPlatformAdmin = user?.platformRole === 'PLATFORM_ADMIN';
  const organizations = user?.organizations ?? [];
  const organization =
    organizations.find((item) => item.organizationId === activeOrganizationId) ?? organizations[0];
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
      value: new Set(organizations.map((item) => item.role)).size,
      icon: Users,
      description: 'Distinct roles across workspaces',
    },
  ];
  return (
    <ProtectedPage>
      <div className="mx-auto max-w-[1600px] space-y-8 px-4 py-8 sm:px-8">
        <PageHeader
          eyebrow="Cooperative field ledger"
          title={`Welcome back, ${user?.firstName ?? 'there'}`}
          description="Choose a cooperative workspace to review intake, farmer records, and settlement balances."
        />
        {organization && (
          <section className="relative overflow-hidden rounded-md border-l-4 border-harvest bg-sidebar p-6 text-sidebar-foreground sm:p-8">
            <div className="relative flex flex-wrap items-center justify-between gap-6">
              <div>
                <p className="text-xs font-medium tracking-widest text-emerald-300 uppercase">
                  Active workspace
                </p>
                <h2 className="mt-3 font-display text-2xl font-semibold sm:text-3xl">
                  {organization.organizationName}
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-sidebar-foreground/65">
                  Open the ledger for this cooperative. Review collected coffee, delivery records,
                  and farmer entitlements.
                </p>
              </div>
              <Link
                href={
                  isPlatformAdmin || organization.permissions.includes('analytics.read')
                    ? `/dashboard/${organization.organizationId}`
                    : `/organizations/${organization.organizationId}/overview`
                }
                className="inline-flex items-center gap-3 rounded-md bg-emerald-300 px-5 py-3 text-sm font-semibold text-emerald-950 hover:bg-emerald-200"
              >
                Open workspace
                <ArrowRight className="size-4" />
              </Link>
            </div>
            <div className="relative mt-7 flex flex-wrap gap-x-6 gap-y-3 border-t border-white/10 pt-5">
              {[
                { label: 'Farmer directory', path: 'farmers', icon: Users },
                { label: 'Collection desk', path: 'collection', icon: Sprout },
                { label: 'Traceability', path: 'traceability', icon: Route },
              ].map((item) => (
                <Link
                  key={item.path}
                  href={`/organizations/${organization.organizationId}/${item.path}`}
                  className="inline-flex items-center gap-2 text-xs font-medium text-sidebar-foreground/80 hover:text-emerald-300"
                >
                  <item.icon className="size-4" />
                  {item.label}
                  <ArrowUpRight className="size-3" />
                </Link>
              ))}
            </div>
          </section>
        )}
        <section
          aria-label="Workspace access summary"
          className="grid divide-y divide-border overflow-hidden rounded-md border border-border bg-card sm:grid-cols-3 sm:divide-x sm:divide-y-0"
        >
          {stats.map((stat) => (
            <div key={stat.label} className="flex items-start gap-4 p-6">
              <span className="rounded-md bg-accent p-3 text-primary">
                <stat.icon className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
                <p className="mt-1 text-xl font-semibold">{stat.value}</p>
                <p className="mt-2 text-xs text-muted-foreground">{stat.description}</p>
              </div>
            </div>
          ))}
        </section>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LayoutGrid className="size-4 text-primary" />
                Your workspaces
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {organizations.length > 0 ? (
                <ul className="divide-y divide-border">
                  {organizations.map((item) => (
                    <li key={item.organizationId}>
                      <Link
                        href={`/organizations/${item.organizationId}/overview`}
                        className="group flex items-center gap-4 px-6 py-5 hover:bg-accent/40"
                      >
                        <span className="rounded-md bg-muted p-3 text-primary">
                          <Building2 className="size-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-semibold">{item.organizationName}</h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.role.replaceAll('_', ' ')}
                          </p>
                        </div>
                        <ArrowRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-8 text-center">
                  <h3 className="font-semibold">No workspaces yet</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    You&apos;ll see organizations here once you&apos;re granted access.
                    <Link href="/my-farm" className="mt-3 block text-primary underline">
                      Open my farmer records
                    </Link>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                {isPlatformAdmin ? 'Platform administration' : 'Your workspace access'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isPlatformAdmin ? (
                <>
                  <span className="inline-flex rounded-md bg-accent p-3 text-primary">
                    <ShieldCheck className="size-6" />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold">Manage organizations</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Create, review, and govern every organization on the platform.
                  </p>
                  <Link
                    href="/admin/organizations"
                    className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary"
                  >
                    Open administration
                    <ArrowRight className="size-4" />
                  </Link>
                </>
              ) : (
                <>
                  <ShieldCheck className="size-8 text-primary" />
                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                    Your assigned organization roles determine which records and actions you can
                    access. Switch workspaces from the navigation to work with another team.
                  </p>
                  <Link
                    href="/system-status"
                    className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary"
                  >
                    View system status
                    <ArrowUpRight className="size-4" />
                  </Link>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ProtectedPage>
  );
}
