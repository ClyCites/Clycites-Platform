'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, ErrorState, LoadingIndicator } from '@clycites/ui';
import type { z } from 'zod';
import type {
  deliveryDetailSchema,
  deliveryListItemSchema,
  receiptSchema,
} from '@clycites/contracts';
import { Check, FileText, Printer, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { apiRequest } from '@/lib/api-client';
import { PageHeader } from './ui/page-header';
import { RouteTabs } from './ui/tabs';
import { ProtectedPage } from './protected-page';

type DeliveryItem = z.infer<typeof deliveryListItemSchema>;
type DeliveryDetail = z.infer<typeof deliveryDetailSchema>;
type Receipt = z.infer<typeof receiptSchema>;

const fieldClass =
  'min-h-11 w-full rounded-md border border-border bg-card px-3 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20';

function Header({ organizationId, title }: { organizationId: string; title: string }) {
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Collection operations" title={title} />
      <RouteTabs
        label="Collection sections"
        items={[
          { href: `/organizations/${organizationId}/collection`, label: 'Field desk' },
          { href: `/organizations/${organizationId}/deliveries`, label: 'Deliveries' },
          { href: `/organizations/${organizationId}/devices`, label: 'Devices' },
          { href: `/organizations/${organizationId}/coffee-configuration`, label: 'Configuration' },
        ]}
      />
    </div>
  );
}

export function DeliveryHistory({ organizationId }: { organizationId: string }) {
  const [status, setStatus] = useState('');
  const query = useQuery({
    queryKey: ['phase-two-deliveries', organizationId, status],
    queryFn: () =>
      apiRequest<{ items: DeliveryItem[] }>(
        `/organizations/${organizationId}/deliveries?pageSize=100${status ? `&status=${status}` : ''}`,
      ),
  });
  return (
    <ProtectedPage>
      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6">
        <Header organizationId={organizationId} title="Delivery history" />
        <div className="mt-5 flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Immutable versions remain visible after corrections.
          </p>
          <select
            aria-label="Delivery status"
            className="rounded-md border border-border px-3 py-2"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">All statuses</option>
            {[
              'DRAFT',
              'PENDING_CONFIRMATION',
              'ACCEPTED',
              'CORRECTION_PENDING',
              'CORRECTED',
              'REJECTED',
            ].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </div>
        {query.isLoading && (
          <div className="mt-8">
            <LoadingIndicator />
          </div>
        )}
        {query.error && (
          <div className="mt-8">
            <ErrorState message={query.error.message} />
          </div>
        )}
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-195 border-collapse text-left text-sm">
            <thead className="border-y border-border bg-muted text-muted-foreground">
              <tr>
                <th className="px-3 py-3">Delivery</th>
                <th className="px-3">Farmer</th>
                <th className="px-3">Coffee</th>
                <th className="px-3 text-right">Weight</th>
                <th className="px-3 text-right">Value</th>
                <th className="px-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {query.data?.items.map((delivery) => (
                <tr className="border-b border-border hover:bg-accent/40" key={delivery.id}>
                  <td className="px-3 py-4">
                    <Link
                      className="font-bold text-primary underline"
                      href={`/organizations/${organizationId}/deliveries/${delivery.id}`}
                    >
                      {delivery.deliveryNumber}
                    </Link>
                    <p className="text-xs text-muted-foreground">Version {delivery.version}</p>
                  </td>
                  <td className="px-3">
                    {delivery.farmerDisplayName}
                    <p className="text-xs text-muted-foreground">{delivery.farmerNumber}</p>
                  </td>
                  <td className="px-3">{delivery.commodityFormName}</td>
                  <td className="px-3 text-right font-semibold">{delivery.netQuantity} kg</td>
                  <td className="px-3 text-right font-semibold">UGX {delivery.netAmountMinor}</td>
                  <td className="px-3">
                    <span className="font-bold text-foreground">
                      {delivery.status.replaceAll('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ProtectedPage>
  );
}

export function DeliveryDetailView({
  organizationId,
  deliveryId,
}: {
  organizationId: string;
  deliveryId: string;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [newWeight, setNewWeight] = useState('');
  const [message, setMessage] = useState('');
  const query = useQuery({
    queryKey: ['phase-two-delivery', organizationId, deliveryId],
    queryFn: () =>
      apiRequest<DeliveryDetail>(`/organizations/${organizationId}/deliveries/${deliveryId}`),
  });
  const mutate = async (path: string, body: unknown) => {
    try {
      await apiRequest(path, { method: 'POST', body: JSON.stringify(body) });
      setMessage('Saved.');
      await queryClient.invalidateQueries({
        queryKey: ['phase-two-delivery', organizationId, deliveryId],
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save.');
    }
  };
  const delivery = query.data;
  return (
    <ProtectedPage>
      <div className="mx-auto max-w-5xl px-4 py-7 sm:px-6">
        <Header organizationId={organizationId} title={delivery?.deliveryNumber ?? 'Delivery'} />
        {query.isLoading && (
          <div className="mt-8">
            <LoadingIndicator />
          </div>
        )}
        {query.error && (
          <div className="mt-8">
            <ErrorState message={query.error.message} />
          </div>
        )}
        {delivery && (
          <>
            <div className="mt-7 grid gap-6 md:grid-cols-3">
              <section className="md:col-span-2">
                <h2 className="text-xl font-bold">Collection facts</h2>
                <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 border-y border-border py-5">
                  <div>
                    <dt className="text-sm text-muted-foreground">Farmer</dt>
                    <dd className="font-bold">{delivery.farmerDisplayName}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted-foreground">Status</dt>
                    <dd className="font-bold">{delivery.status.replaceAll('_', ' ')}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted-foreground">Coffee</dt>
                    <dd>{delivery.commodityFormName}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted-foreground">Weight</dt>
                    <dd>{delivery.netQuantity} kg</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted-foreground">Unit price</dt>
                    <dd>UGX {delivery.pricing.unitPriceMinor}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted-foreground">Collection value</dt>
                    <dd className="text-xl font-bold">UGX {delivery.netAmountMinor}</dd>
                  </div>
                </dl>
              </section>
              <aside className="border-l-4 border-amber-400 pl-5">
                <p className="text-sm font-semibold text-muted-foreground">Version lineage</p>
                <p className="mt-1 text-2xl font-bold">Version {delivery.version}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Lock {delivery.lockVersion}
                  {delivery.supersedesDeliveryId ? ' · Corrected record' : ''}
                </p>
                {delivery.status === 'ACCEPTED' && (
                  <Link
                    className="mt-5 inline-flex items-center gap-2 font-bold text-primary underline"
                    href={`/organizations/${organizationId}/deliveries/${deliveryId}/receipt`}
                  >
                    <FileText size={18} />
                    Receipt
                  </Link>
                )}
              </aside>
            </div>
            <section className="mt-8">
              <h2 className="text-xl font-bold">Quality</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {delivery.qualityMeasurements.map((quality) => (
                  <div
                    className="border-b border-border py-3"
                    key={quality.qualityAttributeDefinitionId}
                  >
                    <p className="text-sm text-muted-foreground">{quality.name}</p>
                    <p className="font-bold">
                      {String(quality.value)} {quality.unit}
                    </p>
                  </div>
                ))}
              </div>
            </section>
            {delivery.status === 'ACCEPTED' && (
              <section className="mt-9 border-t border-border pt-6">
                <h2 className="text-xl font-bold">Request correction</h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="font-semibold">
                    Reason
                    <input
                      className={`mt-1 ${fieldClass}`}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </label>
                  <label className="font-semibold">
                    Corrected net weight (kg)
                    <input
                      className={`mt-1 ${fieldClass}`}
                      value={newWeight}
                      onChange={(event) => setNewWeight(event.target.value)}
                    />
                  </label>
                </div>
                <Button
                  className="mt-3"
                  type="button"
                  onClick={() =>
                    void mutate(
                      `/organizations/${organizationId}/deliveries/${deliveryId}/corrections`,
                      {
                        reasonCode: 'WEIGHT_ENTRY_ERROR',
                        reason,
                        proposedChanges: {
                          weight: {
                            mode: 'DIRECT_NET',
                            netQuantity: newWeight,
                            unit: 'KG',
                            captureMethod: 'MANUAL',
                          },
                        },
                      },
                    )
                  }
                >
                  Request review
                </Button>
              </section>
            )}
            {delivery.correctionRequests.map((correction) => (
              <section
                className="mt-6 border-l-4 border-red-400 bg-red-50 dark:bg-red-950 p-5"
                key={correction.id}
              >
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <p className="font-bold">{correction.reasonCode.replaceAll('_', ' ')}</p>
                    <p className="mt-1 text-sm">{correction.reason}</p>
                  </div>
                  <span className="font-bold">{correction.status}</span>
                </div>
                {correction.status === 'PENDING' && (
                  <div className="mt-4 flex gap-3">
                    <Button
                      type="button"
                      onClick={() =>
                        void mutate(
                          `/organizations/${organizationId}/deliveries/${deliveryId}/corrections/${correction.id}/approve`,
                          { reviewNotes: 'Reviewed in delivery workspace' },
                        )
                      }
                    >
                      <Check className="mr-2 inline" size={18} />
                      Approve
                    </Button>
                    <Button
                      className="bg-red-700 hover:bg-red-800"
                      type="button"
                      onClick={() =>
                        void mutate(
                          `/organizations/${organizationId}/deliveries/${deliveryId}/corrections/${correction.id}/reject`,
                          { reviewNotes: 'Rejected in delivery workspace' },
                        )
                      }
                    >
                      <X className="mr-2 inline" size={18} />
                      Reject
                    </Button>
                  </div>
                )}
              </section>
            ))}
            {message && (
              <p className="mt-4 text-sm font-semibold" role="status">
                {message}
              </p>
            )}
          </>
        )}
      </div>
    </ProtectedPage>
  );
}

export function ReceiptView({
  organizationId,
  deliveryId,
}: {
  organizationId: string;
  deliveryId: string;
}) {
  const query = useQuery({
    queryKey: ['receipt', organizationId, deliveryId],
    queryFn: () =>
      apiRequest<Receipt>(`/organizations/${organizationId}/deliveries/${deliveryId}/receipt`),
  });
  return (
    <ProtectedPage>
      <div className="mx-auto max-w-md px-4 py-8 print:p-0">
        <div className="mb-4 flex justify-end print:hidden">
          <button
            aria-label="Print receipt"
            className="rounded-md border border-border p-3"
            title="Print receipt"
            type="button"
            onClick={() => window.print()}
          >
            <Printer size={20} />
          </button>
        </div>
        {query.isLoading && <LoadingIndicator />}
        {query.error && <ErrorState message={query.error.message} />}
        {query.data && (
          <article className="border border-border bg-card p-6 font-mono text-sm text-foreground">
            <header className="border-b border-dashed border-border pb-4 text-center">
              <h1 className="text-xl font-bold">{query.data.cooperativeName}</h1>
              <p>COFFEE COLLECTION RECEIPT</p>
              <p className="mt-2 font-bold">{query.data.receiptNumber}</p>
            </header>
            <dl className="space-y-2 border-b border-dashed border-border py-4">
              <div className="flex justify-between">
                <dt>Farmer</dt>
                <dd>{query.data.delivery.farmerDisplayName}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Coffee</dt>
                <dd>{query.data.delivery.commodityFormName}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Weight</dt>
                <dd>{query.data.delivery.netQuantity} kg</dd>
              </div>
              <div className="flex justify-between">
                <dt>Unit price</dt>
                <dd>UGX {query.data.delivery.pricing.unitPriceMinor}</dd>
              </div>
              <div className="flex justify-between text-base font-bold">
                <dt>Value</dt>
                <dd>UGX {query.data.delivery.netAmountMinor}</dd>
              </div>
            </dl>
            <p className="py-4 text-xs">{query.data.statement}</p>
            <footer className="border-t border-dashed border-border pt-4 text-center text-xs">
              <p>{query.data.issuedAt}</p>
              <p className="mt-2 font-bold">Verify: {query.data.shortVerificationCode}</p>
              <p className="mt-2 break-all">{query.data.verificationUrl}</p>
              {query.data.isReprint && <p className="mt-2 font-bold">REPRINT</p>}
            </footer>
          </article>
        )}
      </div>
    </ProtectedPage>
  );
}
