'use client';

import { useQuery } from '@tanstack/react-query';
import type {
  AnchorDetail,
  AnchorList,
  OrganizationVerificationDashboard,
} from '@clycites/contracts';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Search,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { apiRequest } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { EmptyState, ErrorState, LoadingIndicator } from '@clycites/ui';
import { TraceabilityShell } from './traceability-shell';

const statuses = [
  '',
  'PENDING',
  'QUEUED',
  'SUBMITTED',
  'CONFIRMED',
  'RETRYABLE_FAILURE',
  'PERMANENT_FAILURE',
  'MISMATCH',
  'SUPERSEDED',
];

export function VerificationWorkspace({ organizationId }: { organizationId: string }) {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const dashboard = useQuery({
    queryKey: ['verification-dashboard', organizationId],
    queryFn: () =>
      apiRequest<OrganizationVerificationDashboard>(
        `/organizations/${organizationId}/verification/dashboard`,
      ),
  });
  const anchors = useQuery({
    queryKey: ['anchors', organizationId, status, search],
    queryFn: () => {
      const query = new URLSearchParams({ pageSize: '50' });
      if (status) query.set('status', status);
      if (search.trim()) query.set('search', search.trim());
      return apiRequest<AnchorList>(`/organizations/${organizationId}/anchors?${query}`);
    },
  });
  return (
    <TraceabilityShell organizationId={organizationId} active="Verification">
      <div className="space-y-6">
        <section aria-labelledby="verification-summary">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="verification-summary" className="text-2xl font-bold text-stone-950">
                Hedera verification
              </h2>
              <p className="mt-1 max-w-3xl text-sm text-stone-600">
                PostgreSQL remains the authoritative record. Hedera confirmations provide
                independently timestamped integrity evidence for selected events.
              </p>
            </div>
            {dashboard.data && (
              <Badge>
                {dashboard.data.provider} · {dashboard.data.network}
              </Badge>
            )}
          </div>
          {dashboard.isLoading && <LoadingIndicator label="Loading verification status" />}
          {dashboard.error && (
            <ErrorState title="Verification status unavailable" message={dashboard.error.message} />
          )}
          {dashboard.data && <MetricGrid dashboard={dashboard.data} />}
        </section>
        <section aria-labelledby="anchor-events" className="border-t border-stone-200 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="anchor-events" className="text-xl font-bold">
              Anchor events
            </h2>
            <div className="flex flex-1 flex-wrap justify-end gap-2">
              <label className="relative min-w-56 max-w-sm flex-1">
                <span className="sr-only">Search anchors</span>
                <Search
                  className="pointer-events-none absolute left-3 top-2.5 text-stone-400"
                  size={18}
                />
                <Input
                  className="pl-10"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Event, entity or transaction ID"
                />
              </label>
              <Select
                aria-label="Filter by anchor status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                {statuses.map((item) => (
                  <option key={item || 'all'} value={item}>
                    {item ? item.replaceAll('_', ' ') : 'All statuses'}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {anchors.isLoading && <LoadingIndicator label="Loading anchors" />}
          {anchors.error && (
            <ErrorState title="Anchors unavailable" message={anchors.error.message} />
          )}
          {anchors.data?.items.length === 0 && (
            <EmptyState
              title="No matching anchors"
              description="Eligible traceability events will appear here after their business transaction commits."
            />
          )}
          {anchors.data && anchors.data.items.length > 0 && (
            <AnchorTable organizationId={organizationId} anchors={anchors.data.items} />
          )}
        </section>
      </div>
    </TraceabilityShell>
  );
}

function MetricGrid({ dashboard }: { dashboard: OrganizationVerificationDashboard }) {
  const metrics = [
    {
      label: 'Confirmed',
      value: dashboard.confirmedCount,
      icon: CheckCircle2,
      tone: 'text-emerald-700',
    },
    {
      label: 'Pending',
      value: dashboard.pendingCount + dashboard.submittedCount,
      icon: Clock3,
      tone: 'text-amber-700',
    },
    {
      label: 'Retryable',
      value: dashboard.retryableFailureCount,
      icon: AlertTriangle,
      tone: 'text-amber-700',
    },
    { label: 'Mismatch', value: dashboard.mismatchCount, icon: ShieldCheck, tone: 'text-red-700' },
  ];
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map(({ label, value, icon: Icon, tone }) => (
        <Card key={label} className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-stone-600">{label}</p>
            <Icon className={tone} size={19} />
          </div>
          <p className="mt-2 text-3xl font-bold tabular-nums">{value}</p>
        </Card>
      ))}
    </div>
  );
}

function AnchorTable({
  organizationId,
  anchors,
}: {
  organizationId: string;
  anchors: AnchorDetail[];
}) {
  return (
    <div className="mt-4 overflow-x-auto border border-stone-200 bg-white">
      <table className="w-full min-w-215 text-left text-sm">
        <thead className="bg-stone-100 text-stone-600">
          <tr>
            <th className="px-4 py-3">Event</th>
            <th className="px-4 py-3">Entity</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Ledger evidence</th>
            <th className="px-4 py-3">
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-200">
          {anchors.map((anchor) => (
            <tr key={anchor.id}>
              <td className="px-4 py-3">
                <p className="font-semibold">{anchor.eventType.replaceAll('_', ' ')}</p>
                <p className="mt-1 text-xs text-stone-500">
                  {new Date(anchor.createdAt).toLocaleString()}
                </p>
              </td>
              <td className="px-4 py-3">
                <p>{anchor.entityType}</p>
                <code className="text-xs text-stone-500">{anchor.entityId.slice(0, 8)}…</code>
              </td>
              <td className="px-4 py-3">
                <Badge>{anchor.status}</Badge>
              </td>
              <td className="px-4 py-3">
                {anchor.consensusTimestamp ? (
                  <span>
                    {anchor.network} · #{anchor.topicSequenceNumber}
                  </span>
                ) : (
                  <span className="text-stone-500">Not confirmed</span>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  className="inline-flex items-center gap-1 font-bold text-emerald-800"
                  href={`/organizations/${organizationId}/traceability/verification/${anchor.id}`}
                >
                  Evidence <ExternalLink size={14} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
