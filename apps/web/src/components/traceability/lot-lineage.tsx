'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { apiRequest } from '@/lib/api-client';
import { DataTable } from '@/components/ui/data-table';
import { useOrgPermission } from '@/components/ui/workflow-form';
import { recordText, type RegisterRow } from '@/components/ui/record-register';
import { EmptyState, ErrorState, LoadingIndicator } from '@clycites/ui';
type Source = RegisterRow & {
  batch: RegisterRow & { farmerContributions: Array<RegisterRow & { delivery: RegisterRow }> };
};
export function LotLineage({ organizationId, lotId }: { organizationId: string; lotId: string }) {
  const can = useOrgPermission(organizationId);
  const query = useQuery({
    queryKey: ['lot-lineage', organizationId, lotId],
    queryFn: () =>
      apiRequest<RegisterRow & { contributions: Source[] }>(
        `/organizations/${organizationId}/lots/${lotId}/lineage`,
      ),
    enabled: can('lot.read'),
  });
  return (
    <section className="mt-8 space-y-4 border-t border-border pt-6">
      <p className="ledger-kicker">Source records</p>
      <h2 className="font-display text-xl font-semibold">Lot lineage</h2>
      {query.isLoading && <LoadingIndicator label="Loading source lineage" />}
      {query.error && <ErrorState message={query.error.message} />}
      {query.data?.contributions.map((source) => (
        <article key={source.id} className="space-y-3 border-l-2 border-coffee pl-4">
          <h3 className="font-semibold">
            Batch {recordText(source.batch, 'batchNumber')} · {recordText(source, 'quantity')} kg
          </h3>
          <DataTable
            caption={`Farmer deliveries contributing to batch ${recordText(source.batch, 'batchNumber')}`}
            rows={source.batch.farmerContributions}
            columns={[
              {
                key: 'delivery',
                title: 'Delivery',
                render: (row) => (
                  <Link
                    href={`/organizations/${organizationId}/deliveries/${row.delivery.id}`}
                    className="text-primary underline"
                  >
                    {recordText(row.delivery, 'deliveryNumber')}
                  </Link>
                ),
              },
              {
                key: 'farmer',
                title: 'Farmer',
                render: (row) =>
                  `${recordText(row.delivery, 'farmer.firstName')} ${recordText(row.delivery, 'farmer.lastName')}`,
              },
              {
                key: 'farm',
                title: 'Farm',
                render: (row) => recordText(row.delivery, 'farm.name'),
              },
              {
                key: 'quantity',
                title: 'Contribution (kg)',
                render: (row) => recordText(row, 'quantity'),
              },
            ]}
          />
        </article>
      ))}
      {query.data?.contributions.length === 0 && (
        <EmptyState
          title="No recorded sources"
          description="No batch contributions are recorded for this lot."
        />
      )}
    </section>
  );
}
