'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { HederaSystemStatus } from '@clycites/contracts';
import { Activity, AlertTriangle, RefreshCw, Server } from 'lucide-react';

import { apiRequest } from '@/lib/api-client';
import { ProtectedPage } from '@/components/protected-page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState, LoadingIndicator } from '@clycites/ui';

type AnchorFailure = {
  id: string;
  organizationId: string;
  entityType: string;
  entityId: string;
  eventType: string;
  status: string;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  updatedAt: string;
};

export function HederaAdmin() {
  const client = useQueryClient();
  const status = useQuery({
    queryKey: ['admin-hedera-status'],
    queryFn: () => apiRequest<HederaSystemStatus>('/admin/hedera/status'),
  });
  const failures = useQuery({
    queryKey: ['admin-hedera-failures'],
    queryFn: () => apiRequest<AnchorFailure[]>('/admin/hedera/failures'),
  });
  const reconcile = useMutation({
    mutationFn: () =>
      apiRequest('/admin/hedera/reconcile', {
        method: 'POST',
        body: JSON.stringify({ limit: 100 }),
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['admin-hedera-status'] }),
  });
  return (
    <ProtectedPage>
      <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase text-emerald-800">Platform administration</p>
            <h1 className="mt-1 text-3xl font-bold">Hedera operations</h1>
            <p className="mt-2 text-sm text-stone-600">
              Configuration state, confirmation recency, and anchors requiring operator attention.
            </p>
          </div>
          <Button type="button" onClick={() => reconcile.mutate()} disabled={reconcile.isPending}>
            <RefreshCw size={16} /> Reconcile topic
          </Button>
        </header>
        {status.isLoading && <LoadingIndicator label="Loading Hedera status" />}
        {status.error && <ErrorState title="Status unavailable" message={status.error.message} />}
        {status.data && (
          <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatusCard
              label="Provider"
              value={`${status.data.provider} · ${status.data.network}`}
              icon={Server}
            />
            <StatusCard
              label="Submission"
              value={status.data.submissionEnabled ? 'Enabled' : 'Disabled'}
              icon={Activity}
            />
            <StatusCard
              label="Confirmation"
              value={status.data.confirmationEnabled ? 'Enabled' : 'Disabled'}
              icon={Activity}
            />
            <StatusCard
              label="System"
              value={status.data.degradedReasonCode ?? 'Operational'}
              icon={AlertTriangle}
            />
          </section>
        )}
        <section className="mt-7 border-t border-stone-200 pt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Failures and mismatches</h2>
            <Badge>{failures.data?.length ?? 0} OPEN</Badge>
          </div>
          {failures.isLoading && <LoadingIndicator label="Loading failures" />}
          {failures.error && (
            <ErrorState title="Failures unavailable" message={failures.error.message} />
          )}
          {failures.data?.length === 0 && (
            <p className="mt-4 text-sm text-stone-600">
              No failed or mismatching anchors require attention.
            </p>
          )}
          {failures.data && failures.data.length > 0 && (
            <div className="mt-4 overflow-x-auto border border-stone-200 bg-white">
              <table className="w-full min-w-225 text-left text-sm">
                <thead className="bg-stone-100">
                  <tr>
                    <th className="px-4 py-3">Organization</th>
                    <th className="px-4 py-3">Event</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Failure</th>
                    <th className="px-4 py-3">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {failures.data.map((failure) => (
                    <tr key={failure.id}>
                      <td className="px-4 py-3 font-mono text-xs">{failure.organizationId}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold">{failure.eventType.replaceAll('_', ' ')}</p>
                        <p className="text-xs text-stone-500">
                          {failure.entityType} · {failure.entityId.slice(0, 8)}…
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge>{failure.status}</Badge>
                      </td>
                      <td className="max-w-sm px-4 py-3">
                        <p className="font-semibold text-red-800">
                          {failure.lastErrorCode ?? 'Integrity mismatch'}
                        </p>
                        <p className="mt-1 text-xs text-stone-600">
                          {failure.lastErrorMessage ?? 'Review stored and ledger hashes.'}
                        </p>
                      </td>
                      <td className="px-4 py-3">{new Date(failure.updatedAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </ProtectedPage>
  );
}

function StatusCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Server;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-stone-600">{label}</p>
        <Icon className="text-emerald-700" size={18} />
      </div>
      <p className="mt-2 wrap-break-word font-bold">{value}</p>
    </Card>
  );
}
