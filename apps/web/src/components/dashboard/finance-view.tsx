'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { AnalyticsFilterBar, defaultAnalyticsFilter } from '@/components/dashboard/analytics-filter';
import { KpiCard, LineChart } from '@/components/dashboard/charts';
import { QueryError } from '@/components/dashboard/state-views';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { dashboardApi, dashboardKeys } from '@/lib/dashboard-api';
import { EmptyState, LoadingIndicator } from '@clycites/ui';

export function FinanceView({ organizationId }: { organizationId: string }) {
  const [filter, setFilter] = useState(defaultAnalyticsFilter);
  const finance = useQuery({
    queryKey: dashboardKeys.finance(organizationId, filter),
    queryFn: () => dashboardApi.finance(organizationId, filter),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Finance analytics</h1>
          <p className="text-sm text-muted-foreground">
            Settlement entitlements and financial trends.
          </p>
        </div>
        {finance.data && <Badge>{finance.data.currency}</Badge>}
      </div>

      <Card>
        <CardContent className="p-5">
          <AnalyticsFilterBar filter={filter} onChange={setFilter} />
        </CardContent>
      </Card>

      {finance.isLoading && <LoadingIndicator label="Loading finance analytics" />}
      {finance.error && <QueryError error={finance.error} />}

      {finance.data && (
        <>
          {finance.data.kpis.length === 0 ? (
            <EmptyState title="No finance data" description="No settlements for this range." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {finance.data.kpis.map((kpi) => (
                <KpiCard key={kpi.key} kpi={kpi} />
              ))}
            </div>
          )}
          <div className="grid gap-4 xl:grid-cols-2">
            {finance.data.settlementTimeSeries.map((series) => (
              <LineChart key={series.key} series={series} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
