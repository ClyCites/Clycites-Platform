'use client';
import * as contracts from '@clycites/contracts';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import Link from 'next/link';
import { apiRequest } from '@/lib/api-client';
import {
  WorkflowForm,
  choices,
  minorAmount,
  useOrgPermission,
  type WorkflowField,
} from './ui/workflow-form';
import { DataTable } from './ui/data-table';
import { Badge } from './ui/badge';
import { PageHeader } from './ui/page-header';
import { recordText, type RegisterRow } from './ui/record-register';
import { ProtectedPage } from './protected-page';
import { LoadingIndicator, ErrorState } from '@clycites/ui';
const reason: WorkflowField = { name: 'reason', label: 'Reason', type: 'textarea' };
const columns = (...fields: string[]) =>
  fields.map((key) => ({
    key,
    title: key.replace(/([A-Z])/g, ' $1'),
    render: (row: RegisterRow) =>
      key === 'status' ? <Badge>{recordText(row, key)}</Badge> : recordText(row, key),
  }));

export function ListingActions({
  organizationId,
  listing,
  onSuccess,
}: {
  organizationId: string;
  listing: { id: string; version: number; status: string };
  onSuccess: () => void;
}) {
  const root = `/organizations/${organizationId}/marketplace/listings/${listing.id}`;
  return (
    <div className="mt-5 space-y-3 border-t border-border pt-5">
      {['PUBLISHED', 'PARTIALLY_RESERVED'].includes(listing.status) && (
        <WorkflowForm
          title="Pause listing"
          path={`${root}/pause`}
          schema={contracts.versionedActionSchema}
          values={{ version: listing.version }}
          fields={[]}
          permission="marketplace-listing.manage"
          organizationId={organizationId}
          onSuccess={onSuccess}
          submitLabel="Pause buyer offers"
        />
      )}
      {['PUBLISHED', 'PAUSED', 'PARTIALLY_RESERVED'].includes(listing.status) && (
        <WorkflowForm
          title="Close listing"
          path={`${root}/close`}
          schema={contracts.reasonActionSchema}
          values={{ version: listing.version }}
          fields={[reason]}
          permission="marketplace-listing.manage"
          organizationId={organizationId}
          onSuccess={onSuccess}
          submitLabel="Close listing"
        />
      )}
      {['DRAFT', 'PUBLISHED', 'PAUSED'].includes(listing.status) && (
        <WorkflowForm
          title="Cancel listing"
          path={`${root}/cancel`}
          schema={contracts.reasonActionSchema}
          values={{ version: listing.version }}
          fields={[reason]}
          permission="marketplace-listing.manage"
          organizationId={organizationId}
          onSuccess={onSuccess}
          submitLabel="Cancel listing"
        />
      )}
      <WorkflowForm
        title="Invite buyer organization"
        path={`${root}/invitations`}
        schema={contracts.inviteBuyerSchema}
        fields={[
          { name: 'buyerOrganizationId', label: 'Buyer organization ID' },
          {
            name: 'expiresAt',
            label: 'Invitation expires',
            type: 'datetime-local',
            required: false,
          },
        ]}
        permission="marketplace-invitation.manage"
        organizationId={organizationId}
        onSuccess={onSuccess}
        submitLabel="Invite buyer"
      />
    </div>
  );
}
export function OfferDetailView({
  organizationId,
  offerId,
}: {
  organizationId: string;
  offerId: string;
}) {
  const can = useOrgPermission(organizationId);
  const root = `/organizations/${organizationId}/marketplace/offers/${offerId}`;
  const query = useQuery({
    queryKey: ['offer-detail', root],
    queryFn: () => apiRequest<RegisterRow>(root),
    enabled: can('offer.read'),
  });
  const refresh = () => void query.refetch();
  return (
    <ProtectedPage>
      <div className="mx-auto max-w-5xl space-y-5 px-4 py-8 sm:px-8">
        <PageHeader
          eyebrow="Coffee trade desk"
          title={query.data ? recordText(query.data, 'offerNumber') : 'Offer detail'}
          description="Review proposed quantities, price, delivery terms, and the offer response."
          action={
            <Link
              href={`/organizations/${organizationId}/marketplace/offers`}
              className="text-primary underline"
            >
              All offers
            </Link>
          }
        />
        {query.isLoading && <LoadingIndicator label="Loading offer" />}
        {query.error && <ErrorState message={query.error.message} />}
        {!can('offer.read') && <p>Your role does not include offer access.</p>}
        {query.data && (
          <>
            <dl className="grid gap-4 border-y border-border py-5 sm:grid-cols-3">
              {[
                'quantity',
                'currency',
                'unitPriceMinor',
                'deliveryTerm',
                'validUntil',
                'status',
              ].map((field) => (
                <div key={field}>
                  <dt className="ledger-kicker">{field.replace(/([A-Z])/g, ' $1')}</dt>
                  <dd className="mt-2 font-semibold">{recordText(query.data, field)}</dd>
                </div>
              ))}
            </dl>
            {['SUBMITTED', 'COUNTERED'].includes(recordText(query.data, 'status')) && (
              <div className="grid items-start gap-3 sm:grid-cols-2">
                <WorkflowForm
                  title="Counter offer"
                  path={`${root}/counter`}
                  schema={contracts.counterOfferSchema}
                  values={{ version: query.data.version }}
                  permission="offer.respond"
                  organizationId={organizationId}
                  fields={[
                    { name: 'quantity', label: 'Quantity (kg)' },
                    {
                      name: 'unitPriceMinor',
                      label: 'Unit price (major currency units)',
                      transform: minorAmount,
                    },
                    {
                      name: 'currency',
                      label: 'Currency',
                      defaultValue: recordText(query.data, 'currency'),
                    },
                    { name: 'deliveryTerm', label: 'Delivery terms' },
                    {
                      name: 'proposedDeliveryDate',
                      label: 'Proposed delivery date',
                      type: 'date',
                      required: false,
                    },
                    { name: 'validUntil', label: 'Valid until', type: 'datetime-local' },
                    { name: 'message', label: 'Message', type: 'textarea', required: false },
                  ]}
                  onSuccess={refresh}
                  submitLabel="Submit counter offer"
                />
                {(['reject', 'withdraw'] as const).map((action) => (
                  <WorkflowForm
                    key={action}
                    title={`${action === 'reject' ? 'Reject' : 'Withdraw'} offer`}
                    path={`${root}/${action}`}
                    schema={contracts.reasonActionSchema}
                    values={{ version: query.data.version }}
                    fields={[reason]}
                    permission="offer.respond"
                    organizationId={organizationId}
                    onSuccess={refresh}
                    submitLabel={action === 'reject' ? 'Reject offer' : 'Withdraw offer'}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </ProtectedPage>
  );
}
export function ContractDetailView({
  organizationId,
  contractId,
}: {
  organizationId: string;
  contractId: string;
}) {
  const can = useOrgPermission(organizationId);
  const root = `/organizations/${organizationId}/commerce`;
  const query = useQuery({
    queryKey: ['contract-detail', organizationId, contractId],
    queryFn: () =>
      apiRequest<
        RegisterRow & {
          amendments: RegisterRow[];
          reservation: RegisterRow;
          order: RegisterRow | null;
        }
      >(`${root}/contracts/${contractId}`),
    enabled: can('sales-contract.read'),
  });
  const refresh = () => void query.refetch();
  return (
    <ProtectedPage>
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-8">
        <PageHeader
          eyebrow="Trade agreement ledger"
          title={query.data ? recordText(query.data, 'contractNumber') : 'Contract detail'}
          description="Agreement terms, inventory reservations, amendments, and fulfillment."
          action={
            <Link
              href={`/organizations/${organizationId}/marketplace/contracts`}
              className="text-primary underline"
            >
              All contracts
            </Link>
          }
        />
        {query.isLoading && <LoadingIndicator label="Loading contract" />}
        {query.error && <ErrorState message={query.error.message} />}
        {!can('sales-contract.read') && <p>Your role does not include contract access.</p>}
        {query.data && (
          <>
            <dl className="grid gap-5 border-y border-border py-5 sm:grid-cols-3">
              {[
                'sellerOrganizationId',
                'buyerOrganizationId',
                'quantity',
                'currency',
                'deliveryTerm',
                'paymentTerms',
                'status',
              ].map((field) => (
                <div key={field}>
                  <dt className="ledger-kicker">
                    {field.replace(/([A-Z])/g, ' $1').replace('.name', '')}
                  </dt>
                  <dd className="mt-1 font-semibold">{recordText(query.data, field)}</dd>
                </div>
              ))}
            </dl>
            {query.data.order && (
              <Link
                href={`/organizations/${organizationId}/marketplace/orders/${query.data.order.id}`}
                className="block font-semibold text-primary underline"
              >
                Open order {recordText(query.data.order, 'orderNumber')}
              </Link>
            )}
            {!query.data.order &&
              ['DRAFT', 'PENDING_SELLER_APPROVAL', 'PENDING_BUYER_APPROVAL', 'ACTIVE'].includes(
                recordText(query.data, 'status'),
              ) && (
                <WorkflowForm
                  title="Cancel contract"
                  path={`${root}/contracts/${contractId}/cancel`}
                  schema={contracts.reasonActionSchema}
                  values={{ version: query.data.version }}
                  fields={[reason]}
                  permission="sales-contract.approve"
                  organizationId={organizationId}
                  onSuccess={refresh}
                  submitLabel="Cancel contract"
                />
              )}
            {recordText(query.data, 'status') === 'ACTIVE' && (
              <div className="grid items-start gap-4 md:grid-cols-2">
                {!query.data.order && (
                  <WorkflowForm
                    title="Create fulfillment order"
                    path={`${root}/contracts/${contractId}/orders`}
                    schema={contracts.createOrderSchema}
                    fields={[
                      { name: 'fulfillmentMethod', label: 'Fulfillment method' },
                      {
                        name: 'expectedDispatchAt',
                        label: 'Expected dispatch',
                        type: 'datetime-local',
                        required: false,
                      },
                    ]}
                    permission="sales-order.manage"
                    organizationId={organizationId}
                    onSuccess={refresh}
                    submitLabel="Create order"
                  />
                )}
                <WorkflowForm
                  title="Propose agreement amendment"
                  path={`${root}/contracts/${contractId}/amendments`}
                  schema={contracts.createContractAmendmentSchema}
                  fields={[
                    reason,
                    {
                      name: 'proposedChanges.deliveryTerm',
                      label: 'Revised delivery terms',
                      required: false,
                    },
                    {
                      name: 'proposedChanges.paymentTerms',
                      label: 'Revised payment terms',
                      required: false,
                    },
                    {
                      name: 'proposedChanges.expectedDeliveryDate',
                      label: 'Revised delivery date',
                      type: 'datetime-local',
                      required: false,
                    },
                    {
                      name: 'proposedChanges.additionalTerms',
                      label: 'Revised additional terms',
                      type: 'textarea',
                      required: false,
                    },
                  ]}
                  permission="sales-contract.amend"
                  organizationId={organizationId}
                  onSuccess={refresh}
                  submitLabel="Propose amendment"
                />
              </div>
            )}
            <DataTable
              caption="Contract amendment history"
              rows={query.data.amendments}
              columns={[
                ...columns('amendmentNumber', 'reason', 'status'),
                {
                  key: 'actions',
                  title: 'Review',
                  render: (row) =>
                    recordText(row, 'status') === 'PENDING_COUNTERPARTY' ? (
                      <div className="space-y-2">
                        {(['approve', 'reject', 'withdraw'] as const).map((action) => (
                          <WorkflowForm
                            key={action}
                            title={`${action} amendment`}
                            path={`${root}/amendments/${row.id}/${action}`}
                            schema={
                              action === 'approve' ? z.object({}).strict() : contracts.reasonSchema
                            }
                            fields={action === 'approve' ? [] : [reason]}
                            permission="sales-contract.amend"
                            organizationId={organizationId}
                            onSuccess={refresh}
                            submitLabel={`${action} amendment`}
                          />
                        ))}
                      </div>
                    ) : (
                      'Historical record'
                    ),
                },
              ]}
            />
            {query.data.reservation &&
              ['ACTIVE', 'CONTRACTED'].includes(recordText(query.data.reservation, 'status')) && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {(['release', 'cancel'] as const)
                    .filter(
                      (action) =>
                        action !== 'release' ||
                        recordText(query.data.reservation, 'status') === 'ACTIVE',
                    )
                    .map((action) => (
                      <WorkflowForm
                        key={action}
                        title={`${action} inventory reservation`}
                        path={`${root}/reservations/${query.data.reservation.id}/${action}`}
                        schema={contracts.reasonActionSchema}
                        values={{ version: query.data.reservation.version }}
                        fields={[reason]}
                        permission="sales-contract.approve"
                        organizationId={organizationId}
                        onSuccess={refresh}
                        submitLabel={`${action} reservation`}
                      />
                    ))}
                </div>
              )}
            <TraceabilityShareForm
              organizationId={organizationId}
              values={{
                contractId,
                lotId: query.data.lotId,
                buyerOrganizationId: query.data.buyerOrganizationId,
              }}
            />
          </>
        )}
      </div>
    </ProtectedPage>
  );
}
export function OrderActions({
  organizationId,
  order,
  onSuccess,
}: {
  organizationId: string;
  order: { id: string; version: number; status: string };
  onSuccess: () => void;
}) {
  const root = `/organizations/${organizationId}/commerce/orders/${order.id}`;
  return (
    <div className="mt-6 grid items-start gap-3 md:grid-cols-2">
      {!['COMPLETED', 'CANCELLED'].includes(order.status) && (
        <WorkflowForm
          title="Cancel fulfillment order"
          path={`${root}/cancel`}
          schema={contracts.reasonActionSchema}
          values={{ version: order.version }}
          fields={[reason]}
          permission="sales-order.manage"
          organizationId={organizationId}
          onSuccess={onSuccess}
          submitLabel="Cancel order"
        />
      )}
      {['PENDING_FULFILLMENT'].includes(order.status) && (
        <WorkflowForm
          title="Attach custody dispatch"
          path={`${root}/custody-transfer`}
          schema={contracts.attachCustodyTransferSchema}
          values={{ version: order.version }}
          fields={[{ name: 'custodyTransferId', label: 'Custody transfer ID' }]}
          permission="sales-order.manage"
          organizationId={organizationId}
          onSuccess={onSuccess}
          submitLabel="Attach transfer"
        />
      )}
      {['RECEIVED', 'PENDING_BUYER_INSPECTION'].includes(order.status) && (
        <WorkflowForm
          title="Record buyer inspection"
          path={`${root}/inspections`}
          schema={contracts.createBuyerInspectionSchema}
          fields={[
            { name: 'inspectionNumber', label: 'Inspection reference' },
            { name: 'sampledAt', label: 'Sampled at', type: 'datetime-local' },
            {
              name: 'status',
              label: 'Inspection result',
              type: 'select',
              options: choices(contracts.buyerInspectionStatusSchema.options),
            },
            { name: 'notes', label: 'Inspection notes', type: 'textarea', required: false },
          ]}
          permission="buyer-inspection.record"
          organizationId={organizationId}
          onSuccess={onSuccess}
          submitLabel="Record inspection"
        />
      )}
      {['ACCEPTED'].includes(order.status) && (
        <WorkflowForm
          title="Complete fulfillment"
          path={`${root}/complete`}
          schema={z.object({}).strict()}
          fields={[]}
          permission="sales-order.manage"
          organizationId={organizationId}
          onSuccess={onSuccess}
          submitLabel="Complete order"
        />
      )}
    </div>
  );
}
export function TraceabilityShareForm({
  organizationId,
  values,
}: {
  organizationId: string;
  values: Record<string, unknown>;
}) {
  const [share, setShare] = useState<RegisterRow>();
  return (
    <section className="space-y-3">
      <WorkflowForm
        title="Share traceability evidence with buyer"
        path={`/organizations/${organizationId}/commerce/traceability-shares`}
        schema={contracts.createTraceabilityShareSchema}
        values={values}
        fields={[
          {
            name: 'scopes',
            label: 'Evidence scope',
            type: 'select',
            options: choices(contracts.traceabilityShareScopeSchema.options),
            transform: (value) => [value],
          },
          { name: 'expiresAt', label: 'Access expires', type: 'datetime-local' },
        ]}
        permission="traceability-share.manage"
        organizationId={organizationId}
        submitLabel="Create evidence share"
        onSuccess={(data) => {
          if (data && typeof data === 'object' && 'id' in data) setShare(data as RegisterRow);
        }}
      />
      {share && (
        <div className="ledger-surface space-y-3 p-4">
          <p className="text-sm">
            Share reference: {recordText(share, 'publicId')} · expires{' '}
            {recordText(share, 'expiresAt')}
          </p>
          <WorkflowForm
            title="Revoke this evidence share"
            path={`/organizations/${organizationId}/commerce/traceability-shares/${share.id}/revoke`}
            schema={contracts.reasonSchema}
            fields={[reason]}
            permission="traceability-share.manage"
            organizationId={organizationId}
            submitLabel="Revoke evidence access"
          />
        </div>
      )}
    </section>
  );
}
