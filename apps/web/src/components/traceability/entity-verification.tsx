'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { entityVerificationSummarySchema } from '@clycites/contracts';
import { apiRequest } from '@/lib/api-client';
import { useOrgPermission } from '@/components/ui/workflow-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState, LoadingIndicator } from '@clycites/ui';
const paths = { delivery: 'deliveries', batch: 'batches', lot: 'lots' } as const;
export function EntityVerification({
  organizationId,
  entityId,
  type,
}: {
  organizationId: string;
  entityId: string;
  type: keyof typeof paths;
}) {
  const [open, setOpen] = useState(false);
  const can = useOrgPermission(organizationId);
  const query = useQuery({
    queryKey: ['entity-verification', organizationId, type, entityId],
    queryFn: async () =>
      entityVerificationSummarySchema.parse(
        await apiRequest(
          `/organizations/${organizationId}/${paths[type]}/${entityId}/verification`,
        ),
      ),
    enabled: open && can('traceability.verification.read'),
  });
  if (!can('traceability.verification.read')) return null;
  return (
    <section className="mt-4 space-y-3">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {open ? 'Hide ledger verification' : 'Review ledger verification'}
      </Button>
      {open && (
        <>
          {query.isLoading && <LoadingIndicator label="Loading verification evidence" />}
          {query.error && <ErrorState message={query.error.message} />}
          {query.data && (
            <div className="ledger-surface space-y-2 p-4">
              <Badge>{query.data.status}</Badge>
              <p className="text-sm">
                {query.data.confirmedAnchorCount} confirmed · {query.data.pendingAnchorCount}{' '}
                pending · {query.data.mismatchCount} mismatches
              </p>
              <p className="text-xs text-muted-foreground">
                Chain: {query.data.chainStatus} · Last verified:{' '}
                {query.data.lastVerifiedAt ?? 'Not verified'}
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
