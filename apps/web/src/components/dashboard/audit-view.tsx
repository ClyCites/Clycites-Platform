'use client';

import type { AuditFilter } from '@clycites/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { QueryError } from '@/components/dashboard/state-views';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { dashboardApi, dashboardKeys } from '@/lib/dashboard-api';
import { EmptyState, LoadingIndicator } from '@clycites/ui';

const PAGE_SIZE = 25;

export function AuditView({ organizationId }: { organizationId: string }) {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');

  const filter: AuditFilter = {
    page,
    pageSize: PAGE_SIZE,
    ...(action.trim() ? { action: action.trim() } : {}),
    ...(entityType.trim() ? { entityType: entityType.trim() } : {}),
  };

  const audit = useQuery({
    queryKey: dashboardKeys.audit(organizationId, filter),
    queryFn: () => dashboardApi.audit(organizationId, filter),
    placeholderData: keepPreviousData,
  });

  const applyFilters = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(1);
  };

  const pagination = audit.data?.pagination;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Audit trail</h1>
        <p className="text-sm text-muted-foreground">
          Immutable record of administrative and system actions.
        </p>
      </div>

      <Card>
        <CardContent className="p-5">
          <form onSubmit={applyFilters} className="flex flex-wrap items-end gap-4">
            <Label className="w-56">
              Action
              <Input
                placeholder="branding.updated"
                value={action}
                onChange={(event) => setAction(event.target.value)}
              />
            </Label>
            <Label className="w-56">
              Entity type
              <Input
                placeholder="ReportExport"
                value={entityType}
                onChange={(event) => setEntityType(event.target.value)}
              />
            </Label>
            <Button type="submit">Apply</Button>
          </form>
        </CardContent>
      </Card>

      {audit.isLoading && <LoadingIndicator label="Loading audit events" />}
      {audit.error && <QueryError error={audit.error} />}

      {audit.data && audit.data.items.length === 0 && (
        <EmptyState title="No events" description="No audit events match these filters." />
      )}

      {audit.data && audit.data.items.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase">
                  <th className="p-3 font-semibold">Time</th>
                  <th className="p-3 font-semibold">Action</th>
                  <th className="p-3 font-semibold">Entity</th>
                  <th className="p-3 font-semibold">Actor</th>
                </tr>
              </thead>
              <tbody>
                {audit.data.items.map((event) => (
                  <tr key={event.id} className="border-b border-border/60 last:border-0">
                    <td className="p-3 whitespace-nowrap text-muted-foreground">
                      {new Date(event.createdAt).toLocaleString()}
                    </td>
                    <td className="p-3 font-medium text-foreground">{event.action}</td>
                    <td className="p-3 text-muted-foreground">
                      {event.entityType}
                      <span className="block text-xs opacity-70">{event.entityId}</span>
                    </td>
                    <td className="p-3 text-muted-foreground">{event.actorType}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages} · {pagination.totalItems} events
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
