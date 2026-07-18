'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AnchorAttempt, AnchorDetail, VerificationResult } from '@clycites/contracts';
import { ArrowLeft, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

import { apiRequest } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState, LoadingIndicator } from '@clycites/ui';
import { TraceabilityShell } from './traceability-shell';

export function AnchorDetailView({
  organizationId,
  anchorId,
}: {
  organizationId: string;
  anchorId: string;
}) {
  const client = useQueryClient();
  const anchor = useQuery({
    queryKey: ['anchor', organizationId, anchorId],
    queryFn: () => apiRequest<AnchorDetail>(`/organizations/${organizationId}/anchors/${anchorId}`),
  });
  const attempts = useQuery({
    queryKey: ['anchor-attempts', organizationId, anchorId],
    queryFn: () =>
      apiRequest<AnchorAttempt[]>(`/organizations/${organizationId}/anchors/${anchorId}/attempts`),
  });
  const verify = useMutation({
    mutationFn: () =>
      apiRequest<VerificationResult>(
        `/organizations/${organizationId}/anchors/${anchorId}/verify`,
        { method: 'POST' },
      ),
    onSuccess: () =>
      void client.invalidateQueries({ queryKey: ['anchor', organizationId, anchorId] }),
  });
  const retry = useMutation({
    mutationFn: () =>
      apiRequest(`/organizations/${organizationId}/anchors/${anchorId}/retry`, { method: 'POST' }),
    onSuccess: () =>
      void client.invalidateQueries({ queryKey: ['anchor', organizationId, anchorId] }),
  });
  const reconcile = useMutation({
    mutationFn: () =>
      apiRequest(`/organizations/${organizationId}/anchors/${anchorId}/reconcile`, {
        method: 'POST',
      }),
  });
  return (
    <TraceabilityShell organizationId={organizationId} active="Verification">
      <Link
        className="inline-flex items-center gap-2 text-sm font-bold text-emerald-800"
        href={`/organizations/${organizationId}/traceability/verification`}
      >
        <ArrowLeft size={16} /> Back to verification
      </Link>
      {anchor.isLoading && <LoadingIndicator label="Loading anchor evidence" />}
      {anchor.error && <ErrorState title="Anchor unavailable" message={anchor.error.message} />}
      {anchor.data && (
        <div className="mt-5 space-y-5">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase text-emerald-800">
                {anchor.data.entityType} integrity event
              </p>
              <h2 className="mt-1 text-2xl font-bold">
                {anchor.data.eventType.replaceAll('_', ' ')}
              </h2>
              <p className="mt-1 font-mono text-xs text-stone-500">{anchor.data.anchorEventId}</p>
            </div>
            <Badge>{anchor.data.status}</Badge>
          </header>
          <div className="grid gap-4 lg:grid-cols-2">
            <EvidenceCard anchor={anchor.data} />
            <HashCard anchor={anchor.data} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => verify.mutate()} disabled={verify.isPending}>
              <ShieldCheck size={16} /> Recompute and verify
            </Button>
            {anchor.data.status === 'RETRYABLE_FAILURE' && (
              <Button
                className="border border-stone-300 bg-white text-stone-800 hover:bg-stone-100"
                type="button"
                onClick={() => retry.mutate()}
                disabled={retry.isPending}
              >
                <RotateCcw size={16} /> Retry submission
              </Button>
            )}
            <Button
              className="border border-stone-300 bg-white text-stone-800 hover:bg-stone-100"
              type="button"
              onClick={() => reconcile.mutate()}
              disabled={reconcile.isPending}
            >
              <RefreshCw size={16} /> Reconcile topic
            </Button>
          </div>
          {(verify.error || retry.error || reconcile.error) && (
            <ErrorState
              title="Action failed"
              message={
                (verify.error ?? retry.error ?? reconcile.error)?.message ??
                'The action could not be completed'
              }
            />
          )}
          <section className="border-t border-stone-200 pt-5">
            <h3 className="text-lg font-bold">Attempt history</h3>
            {attempts.isLoading && <LoadingIndicator />}
            {attempts.data?.length === 0 && (
              <p className="mt-2 text-sm text-stone-600">No worker attempts recorded.</p>
            )}
            {attempts.data && attempts.data.length > 0 && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-170 text-left text-sm">
                  <thead className="bg-stone-100">
                    <tr>
                      <th className="px-3 py-2">Operation</th>
                      <th className="px-3 py-2">Attempt</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Started</th>
                      <th className="px-3 py-2">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    {attempts.data.map((attempt) => (
                      <tr key={attempt.id}>
                        <td className="px-3 py-2">{attempt.operation}</td>
                        <td className="px-3 py-2">{attempt.attemptNumber}</td>
                        <td className="px-3 py-2">
                          <Badge>{attempt.status}</Badge>
                        </td>
                        <td className="px-3 py-2">
                          {new Date(attempt.startedAt).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-stone-600">
                          {attempt.errorCode ?? attempt.transactionId ?? 'Completed'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </TraceabilityShell>
  );
}

function EvidenceCard({ anchor }: { anchor: AnchorDetail }) {
  return (
    <Card className="p-5">
      <h3 className="font-bold">Consensus evidence</h3>
      <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <Fact label="Provider" value={`${anchor.provider} · ${anchor.network}`} />
        <Fact label="Topic" value={anchor.topicId ?? 'Not submitted'} />
        <Fact label="Sequence" value={anchor.topicSequenceNumber ?? 'Pending'} />
        <Fact label="Consensus time" value={anchor.consensusTimestamp ?? 'Pending'} />
        <Fact label="Transaction" value={anchor.submissionTransactionId ?? 'Pending'} />
        <Fact label="Chain" value={anchor.chainStatus} />
      </dl>
    </Card>
  );
}
function HashCard({ anchor }: { anchor: AnchorDetail }) {
  return (
    <Card className="p-5">
      <h3 className="font-bold">Hash comparison</h3>
      <dl className="mt-4 space-y-4 text-sm">
        <Fact label="Expected canonical hash" value={anchor.canonicalPayloadHash} mono />
        <Fact
          label="Recomputed hash"
          value={anchor.calculatedPayloadHash ?? 'Not recomputed'}
          mono
        />
        <Fact
          label="Mirror message hash"
          value={anchor.mirrorPayloadHash ?? 'Not confirmed'}
          mono
        />
        <Fact
          label="Previous event hash"
          value={anchor.previousEventHash ?? 'First event in chain'}
          mono
        />
      </dl>
    </Card>
  );
}
function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase text-stone-500">{label}</dt>
      <dd className={`mt-1 break-all ${mono ? 'font-mono text-xs' : 'font-semibold'}`}>{value}</dd>
    </div>
  );
}
