'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { dataSubjectRequestTypeSchema } from '@clycites/contracts';
import { apiRequest } from '@/lib/api-client';
import { useAuth } from './auth-provider';
import { ProtectedPage } from './protected-page';
import { PageHeader } from './ui/page-header';
import {
  RecordRegister,
  recordText,
  type RegisterRow,
  type RegisterColumn,
} from './ui/record-register';
import { WorkflowForm, choices } from './ui/workflow-form';
import { Button } from './ui/button';
import { DataTable } from './ui/data-table';
import { EmptyState, ErrorState, LoadingIndicator } from '@clycites/ui';

const columns = (...keys: string[]): RegisterColumn[] =>
  keys.map((key) => ({
    key,
    title: key.replace(/([A-Z])/g, ' $1').replace('.name', ''),
    status: key === 'status',
  }));
const money = (row: RegisterRow, field: string) =>
  new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency: recordText(row, 'currency'),
  }).format(Number(recordText(row, field)) / 100);
const sections = [
  'Deliveries',
  'Settlements',
  'Statements',
  'Farms',
  'Identity',
  'Consent',
] as const;

export function FarmerPortal() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['farmer-self-profile'],
    queryFn: () => apiRequest<RegisterRow>('/me/profile'),
    enabled: Boolean(user),
  });
  return (
    <ProtectedPage>
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-8">
        <PageHeader
          eyebrow="My cooperative records"
          title={
            query.data
              ? `${recordText(query.data, 'firstName')} ${recordText(query.data, 'lastName')}`
              : 'My farm records'
          }
          description="Your deliveries, entitlements, land records, and consent history."
        />
        {query.isLoading && <LoadingIndicator label="Loading your farmer profile" />}
        {query.error && (
          <ErrorState title="Farmer account required" message={query.error.message} />
        )}
        {query.data && (
          <>
            <div className="flex flex-wrap gap-8 border-b border-border pb-4">
              <div>
                <p className="ledger-kicker">Farmer number</p>
                <p className="mt-1 font-mono">{recordText(query.data, 'farmerNumber')}</p>
              </div>
              <div>
                <p className="ledger-kicker">Location</p>
                <p className="mt-1">
                  {recordText(query.data, 'village')} · {recordText(query.data, 'district')}
                </p>
              </div>
            </div>
            <FarmerRecords />
          </>
        )}
      </div>
    </ProtectedPage>
  );
}
function FarmerRecords() {
  const [section, setSection] = useState<(typeof sections)[number]>('Deliveries');
  const [deliveryId, setDeliveryId] = useState('');
  const client = useQueryClient();
  const delivery = useQuery({
    queryKey: ['farmer-self-delivery', deliveryId],
    queryFn: () =>
      apiRequest<RegisterRow & { measurements: RegisterRow[] }>(`/me/deliveries/${deliveryId}`),
    enabled: Boolean(deliveryId) && section === 'Deliveries',
  });
  return (
    <div className="space-y-6">
      <nav
        aria-label="My record sections"
        className="flex flex-wrap gap-2 border-b border-border pb-4"
      >
        {sections.map((item) => (
          <Button
            key={item}
            variant={section === item ? 'default' : 'outline'}
            aria-pressed={section === item}
            onClick={() => setSection(item)}
          >
            {item}
          </Button>
        ))}
      </nav>
      {section === 'Deliveries' && (
        <>
          <RecordRegister
            title="My deliveries"
            path="/me/deliveries"
            columns={columns(
              'deliveryNumber',
              'organization.name',
              'commodityForm',
              'status',
              'clientCreatedAt',
            )}
            actions={(row) => (
              <Button variant="outline" size="sm" onClick={() => setDeliveryId(row.id)}>
                Review delivery
              </Button>
            )}
          />
          {delivery.isLoading && <LoadingIndicator label="Loading delivery detail" />}
          {delivery.error && <ErrorState message={delivery.error.message} />}
          {delivery.data && (
            <section className="ledger-surface space-y-4 p-5">
              <h2 className="font-display text-lg font-semibold">
                Delivery {recordText(delivery.data, 'deliveryNumber')}
              </h2>
              <p className="text-sm">
                {recordText(delivery.data, 'commodityForm')} ·{' '}
                {recordText(delivery.data, 'organization.name')}
              </p>
              <DataTable
                caption="Delivery weight records"
                rows={delivery.data.measurements.map((row, index) => ({
                  ...row,
                  id: String(index),
                }))}
                columns={columns(
                  'measurementType',
                  'grossQuantity',
                  'tareQuantity',
                  'netQuantity',
                  'unit',
                ).map((column) => ({
                  key: column.key,
                  title: column.title,
                  render: (row: RegisterRow) => recordText(row, column.key),
                }))}
              />
              <p className="text-sm">
                Net amount: {recordText(delivery.data, 'pricing.netAmountMinor')} minor units ·{' '}
                {recordText(delivery.data, 'pricing.currency')}
              </p>
            </section>
          )}
        </>
      )}
      {section === 'Settlements' && (
        <RecordRegister
          title="My entitlements"
          path="/me/settlements"
          columns={[
            ...columns('settlementNumber', 'organization.name', 'status', 'paymentStatus'),
            {
              key: 'net',
              title: 'Net entitlement',
              format: (row) => money(row, 'netEntitlementMinor'),
            },
          ]}
        />
      )}
      {section === 'Statements' && (
        <RecordRegister
          title="Statement records"
          path="/me/statements"
          description="Statement identifiers and checksums supplied by your cooperative. The API does not currently provide a downloadable statement document."
          columns={columns(
            'statementNumber',
            'organization.name',
            'version',
            'status',
            'issuedAt',
            'checksum',
          )}
        />
      )}
      {section === 'Farms' && (
        <RecordRegister
          title="My farms"
          path="/me/farms"
          columns={columns(
            'name',
            'organization.name',
            'district',
            'totalArea',
            'areaUnit',
            'ownershipType',
            'status',
          )}
        />
      )}
      {section === 'Identity' && (
        <RecordRegister
          title="Farmer QR identities"
          path="/me/qr-identities"
          description="Identity records only. Ask your cooperative for the signed QR credential."
          columns={columns('publicId', 'organization.name', 'status', 'issuedAt', 'expiresAt')}
        />
      )}
      {section === 'Consent' && (
        <>
          <RecordRegister
            title="Consent history"
            path="/me/consents"
            columns={columns(
              'consentType',
              'organization.name',
              'policyVersion',
              'status',
              'capturedAt',
              'withdrawnAt',
            )}
            actions={(row) =>
              ['TRACEABILITY', 'MARKETPLACE_VISIBILITY', 'SMS_NOTIFICATIONS'].includes(
                recordText(row, 'consentType'),
              ) &&
              recordText(row, 'status') === 'GRANTED' &&
              recordText(row, 'withdrawnAt') === '—' ? (
                <WorkflowForm
                  title="Withdraw consent"
                  path={`/me/consents/${row.id}/withdraw`}
                  schema={z.object({}).strict()}
                  fields={[]}
                  submitLabel="Withdraw this consent"
                  onSuccess={() =>
                    void client.invalidateQueries({ queryKey: ['register', '/me/consents'] })
                  }
                />
              ) : (
                <span className="text-xs text-muted-foreground">
                  {recordText(row, 'status') === 'GRANTED'
                    ? 'Contact your cooperative for changes'
                    : 'Historical record'}
                </span>
              )
            }
          />
          <WorkflowForm
            title="Request access, correction, or deletion of personal data"
            path="/me/privacy-requests"
            schema={z
              .object({
                requestType: dataSubjectRequestTypeSchema,
                notes: z.string().trim().max(2000).optional(),
              })
              .strict()}
            fields={[
              {
                name: 'requestType',
                label: 'Request type',
                type: 'select',
                options: choices(dataSubjectRequestTypeSchema.options),
              },
              { name: 'notes', label: 'Request details', type: 'textarea', required: false },
            ]}
            successMessage="Your privacy request was submitted to the cooperative."
            submitLabel="Submit request"
          />
        </>
      )}
      {!sections.includes(section) && (
        <EmptyState
          title="Select a record section"
          description="Choose the records you want to review."
        />
      )}
    </div>
  );
}
