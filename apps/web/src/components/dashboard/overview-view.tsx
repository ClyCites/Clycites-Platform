'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, RefreshCw, Sprout, Truck, Wallet, FileText, Activity } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import {
  AnalyticsFilterBar,
  defaultAnalyticsFilter,
} from '@/components/dashboard/analytics-filter';
import { BarChart, KpiCard, LineChart } from '@/components/dashboard/charts';
import { QueryError } from '@/components/dashboard/state-views';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { dashboardApi, dashboardKeys } from '@/lib/dashboard-api';
import { EmptyState, LoadingIndicator } from '@clycites/ui';

export function OverviewView({ organizationId }: { organizationId: string }) {
  const { user } = useAuth();
  const [filter, setFilter] = useState(defaultAnalyticsFilter);
  const membership = user?.organizations.find((item) => item.organizationId === organizationId);
  const can = (permission: string) =>
    user?.platformRole === 'PLATFORM_ADMIN' ||
    Boolean(membership?.permissions.includes(permission));
  const overview = useQuery({
    queryKey: dashboardKeys.overview(organizationId, filter),
    queryFn: () => dashboardApi.overview(organizationId, filter),
  });
  const finance = useQuery({
    queryKey: dashboardKeys.finance(organizationId, filter),
    queryFn: () => dashboardApi.finance(organizationId, filter),
    enabled: can('analytics.finance.read'),
  });
  const operations = useQuery({
    queryKey: dashboardKeys.operations(organizationId),
    queryFn: () => dashboardApi.operationsSummary(organizationId),
    enabled: can('operations.read'),
  });
  const activityFilter = { page: 1, pageSize: 5 };
  const activity = useQuery({
    queryKey: dashboardKeys.audit(organizationId, activityFilter),
    queryFn: () => dashboardApi.audit(organizationId, activityFilter),
    enabled: can('audit.read'),
  });
  const base = `/organizations/${organizationId}`;
  const metricLinks: Record<string, string> = {
    active_farmers: `${base}/farmers`,
    deliveries: `${base}/deliveries`,
    accepted_deliveries: `${base}/deliveries`,
    acceptance_rate: `${base}/deliveries`,
    collection_points: `${base}/collection-points`,
    settlements: `${base}/finance/settlements`,
    approved_settlements: `${base}/finance/settlements`,
    gross_entitlement: `${base}/finance/settlements`,
    net_entitlement: `${base}/finance/settlements`,
  };
  const refreshing =
    overview.isFetching || finance.isFetching || operations.isFetching || activity.isFetching;
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-[0.16em] text-primary uppercase">
            Agricultural intelligence
          </p>
          <h1 className="font-display text-3xl font-semibold text-foreground sm:text-4xl">
            Operations at a glance
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Track farmer participation, delivery performance, and financial outcomes.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={refreshing}
          onClick={() => {
            void overview.refetch();
            if (can('analytics.finance.read')) void finance.refetch();
            if (can('operations.read')) void operations.refetch();
            if (can('audit.read')) void activity.refetch();
          }}
        >
          <RefreshCw className={refreshing ? 'size-4 animate-spin' : 'size-4'} />
          Refresh
        </Button>
      </div>
      <Card>
        <CardContent className="flex flex-wrap items-end justify-between gap-4 p-5">
          <AnalyticsFilterBar filter={filter} onChange={setFilter} />
          {overview.data && (
            <p className="text-xs text-muted-foreground">
              Updated{' '}
              {new Date(overview.data.generatedAt).toLocaleTimeString('en-UG', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Africa/Kampala',
              })}{' '}
              EAT
            </p>
          )}
        </CardContent>
      </Card>
      {overview.isLoading && <LoadingIndicator label="Loading overview" />}
      {overview.error && <QueryError error={overview.error} />}
      {overview.data && (
        <>
          {overview.data.kpis.length === 0 ? (
            <EmptyState title="No metrics" description="No activity was recorded for this range." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {overview.data.kpis.map((kpi) => (
                <KpiCard key={kpi.key} kpi={kpi} href={metricLinks[kpi.key]} />
              ))}
            </div>
          )}
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
            {overview.data.timeSeries.map((series) => (
              <LineChart key={series.key} series={series} />
            ))}
            {overview.data.breakdowns.map((series) => (
              <BarChart key={series.key} series={series} />
            ))}
          </div>
        </>
      )}
      {can('analytics.finance.read') && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-semibold">Settlement performance</h2>
            <Link
              href={`/dashboard/${organizationId}/analytics`}
              className="flex items-center gap-2 text-sm font-medium text-primary"
            >
              Finance analytics
              <ArrowRight className="size-4" />
            </Link>
          </div>
          {finance.isLoading && <LoadingIndicator label="Loading settlement metrics" />}
          {finance.error && <QueryError error={finance.error} />}
          {finance.data && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {finance.data.kpis.map((kpi) => (
                <KpiCard key={kpi.key} kpi={kpi} href={metricLinks[kpi.key]} />
              ))}
            </div>
          )}
        </section>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Continue your work</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {[
              {
                title: 'Farmer directory',
                description: 'Identities, farms, and participation',
                href: `${base}/farmers`,
                icon: Sprout,
              },
              {
                title: 'Delivery operations',
                description: 'Review intake and delivery records',
                href: `${base}/deliveries`,
                icon: Truck,
              },
              {
                title: 'Finance workspace',
                description: 'Settlement and payment workflows',
                href: `${base}/finance`,
                icon: Wallet,
              },
              ...(can('report.read')
                ? [
                    {
                      title: 'Reports & exports',
                      description: 'Build and download operational reports',
                      href: `/dashboard/${organizationId}/reports`,
                      icon: FileText,
                    },
                  ]
                : []),
            ].map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="group flex items-center gap-3 rounded-xl border border-border p-4 hover:border-primary/40 hover:bg-accent/40"
              >
                <span className="rounded-lg bg-accent p-2.5 text-primary">
                  <action.icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{action.title}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {action.description}
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="size-4 text-primary" />
              Operational pulse
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!can('operations.read') ? (
              <p className="text-sm text-muted-foreground">
                Operational monitoring requires additional organization permissions.
              </p>
            ) : (
              <>
                {operations.isLoading && <LoadingIndicator label="Loading operational pulse" />}
                {operations.error && <QueryError error={operations.error} />}
                {operations.data && (
                  <dl className="divide-y divide-border">
                    {[
                      { label: 'Active users · 24 hours', value: operations.data.activeUsers24h },
                      {
                        label: 'Pending report exports',
                        value: operations.data.pendingReportExports,
                      },
                      {
                        label: 'Failed exports · 24 hours',
                        value: operations.data.failedReportExports24h,
                      },
                      { label: 'Audit events · 24 hours', value: operations.data.auditEvents24h },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="flex items-center justify-between gap-3 py-3"
                      >
                        <dt className="text-sm text-muted-foreground">{item.label}</dt>
                        <dd className="text-lg font-semibold tabular-nums">{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
      {can('audit.read') && (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-4">
            <CardTitle>Recent activity</CardTitle>
            <Link
              className="text-sm font-medium text-primary"
              href={`/dashboard/${organizationId}/audit`}
            >
              View audit trail
            </Link>
          </CardHeader>
          <CardContent>
            {activity.isLoading && <LoadingIndicator label="Loading recent activity" />}
            {activity.error && <QueryError error={activity.error} />}
            {activity.data &&
              (activity.data.items.length === 0 ? (
                <EmptyState
                  title="No recent activity"
                  description="Administrative actions will appear here once recorded."
                />
              ) : (
                <ol className="divide-y divide-border">
                  {activity.data.items.map((event) => (
                    <li
                      key={event.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-4"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="rounded-full bg-accent p-2 text-primary">
                          <Activity className="size-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <p className="break-words text-sm font-medium">{event.action}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{event.entityType}</p>
                        </div>
                      </div>
                      <time dateTime={event.createdAt} className="text-xs text-muted-foreground">
                        {new Date(event.createdAt).toLocaleString('en-UG', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                          timeZone: 'Africa/Kampala',
                        })}{' '}
                        EAT
                      </time>
                    </li>
                  ))}
                </ol>
              ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
