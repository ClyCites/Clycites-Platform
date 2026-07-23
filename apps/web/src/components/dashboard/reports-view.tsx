'use client';

import type {
  ReportDefinition,
  ReportExport,
  RequestReportExportInput,
} from '@clycites/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

type ReportType = ReportDefinition['reportType'];
type ReportFormat = ReportDefinition['format'];

import { QueryError } from '@/components/dashboard/state-views';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { dashboardApi, dashboardKeys } from '@/lib/dashboard-api';
import { EmptyState, LoadingIndicator } from '@clycites/ui';

const REPORT_TYPES: ReportType[] = [
  'FARMER_REGISTRY',
  'DELIVERY_SUMMARY',
  'SETTLEMENT_SUMMARY',
  'PAYMENT_RECONCILIATION',
  'AUDIT_ACTIVITY',
  'OPERATIONAL_HEALTH',
];

const FORMATS: ReportFormat[] = ['CSV', 'JSON'];

const humanize = (value: string): string =>
  value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

export function ReportsView({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient();
  const [reportType, setReportType] = useState<ReportType>('FARMER_REGISTRY');
  const [format, setFormat] = useState<ReportFormat>('CSV');
  const [error, setError] = useState<string>();

  const definitions = useQuery({
    queryKey: dashboardKeys.reportDefinitions(organizationId),
    queryFn: () => dashboardApi.reportDefinitions(organizationId),
  });

  const exports = useQuery({
    queryKey: dashboardKeys.reportExports(organizationId),
    queryFn: () => dashboardApi.reportExports(organizationId),
    refetchInterval: 5000,
  });

  const request = useMutation({
    mutationFn: (input: RequestReportExportInput) =>
      dashboardApi.requestReportExport(organizationId, input),
    onSuccess: () => {
      setError(undefined);
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.reportExports(organizationId) });
    },
    onError: (mutationError) =>
      setError(mutationError instanceof Error ? mutationError.message : 'Export request failed'),
  });

  const download = useMutation({
    mutationFn: (exportId: string) => dashboardApi.getReportExport(organizationId, exportId),
    onSuccess: (result) => {
      if (result.downloadUrl) window.open(result.downloadUrl, '_blank', 'noopener,noreferrer');
      else setError('Download is not ready yet.');
    },
    onError: (mutationError) =>
      setError(mutationError instanceof Error ? mutationError.message : 'Download failed'),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Generate and download exports of organization data.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Request an export</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <Label className="w-56">
            Report type
            <Select
              value={reportType}
              onChange={(event) => setReportType(event.target.value as ReportType)}
            >
              {REPORT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {humanize(type)}
                </option>
              ))}
            </Select>
          </Label>
          <Label className="w-32">
            Format
            <Select value={format} onChange={(event) => setFormat(event.target.value as ReportFormat)}>
              {FORMATS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </Label>
          <Button
            disabled={request.isPending}
            onClick={() => request.mutate({ reportType, format })}
          >
            {request.isPending ? 'Requesting…' : 'Request export'}
          </Button>
          {error && <span className="text-sm text-red-600">{error}</span>}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Saved report definitions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {definitions.isLoading && <LoadingIndicator label="Loading definitions" />}
            {definitions.error && <QueryError error={definitions.error} />}
            {definitions.data && definitions.data.length === 0 && (
              <EmptyState title="No definitions" description="No saved report definitions." />
            )}
            {definitions.data?.map((definition) => (
              <div
                key={definition.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
              >
                <div>
                  <p className="font-medium text-foreground">{definition.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {humanize(definition.reportType)} · {definition.format}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={request.isPending}
                  onClick={() =>
                    request.mutate({ reportDefinitionId: definition.id, format: definition.format })
                  }
                >
                  Export
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent exports</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {exports.isLoading && <LoadingIndicator label="Loading exports" />}
            {exports.error && <QueryError error={exports.error} />}
            {exports.data && exports.data.length === 0 && (
              <EmptyState title="No exports" description="Request an export to see it here." />
            )}
            {exports.data?.map((entry: ReportExport) => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge>{entry.status}</Badge>
                    <span className="text-xs text-muted-foreground">{entry.format}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleString()}
                    {entry.rowCount !== null && ` · ${entry.rowCount} rows`}
                    {entry.failureCode && ` · ${entry.failureCode}`}
                  </p>
                </div>
                {entry.status === 'COMPLETED' && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={download.isPending}
                    onClick={() => download.mutate(entry.id)}
                  >
                    Download
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
