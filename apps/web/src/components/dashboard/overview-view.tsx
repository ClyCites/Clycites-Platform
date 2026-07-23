'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { AnalyticsFilterBar, defaultAnalyticsFilter } from '@/components/dashboard/analytics-filter';
import { BarChart, KpiCard, LineChart } from '@/components/dashboard/charts';
import { QueryError } from '@/components/dashboard/state-views';
import { Card, CardContent } from '@/components/ui/card';
import { dashboardApi, dashboardKeys } from '@/lib/dashboard-api';
import { EmptyState, LoadingIndicator } from '@clycites/ui';

export function OverviewView({ organizationId }: { organizationId: string }) {
  const [filter, setFilter] = useState(defaultAnalyticsFilter);
  const overview = useQuery({
    queryKey: dashboardKeys.overview(organizationId, filter),
    queryFn: () => dashboardApi.overview(organizationId, filter),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Organization overview</h1>
        <p className="text-sm text-muted-foreground">
          Key performance indicators and trends for the selected period.
        </p>
      </div>

      <Card>
        <CardContent className="p-5">
          <AnalyticsFilterBar filter={filter} onChange={setFilter} />
        </CardContent>
      </Card>

      {overview.isLoading && <LoadingIndicator label="Loading overview" />}
      {overview.error && <QueryError error={overview.error} />}

      {overview.data && (
        <>
          {overview.data.kpis.length === 0 ? (
            <EmptyState title="No metrics" description="No activity was recorded for this range." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {overview.data.kpis.map((kpi) => (
                <KpiCard key={kpi.key} kpi={kpi} />
              ))}
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-2">
            {overview.data.timeSeries.map((series) => (
              <LineChart key={series.key} series={series} />
            ))}
            {overview.data.breakdowns.map((series) => (
              <BarChart key={series.key} series={series} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
