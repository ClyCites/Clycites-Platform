'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createPaymentInstructionSchema } from '@clycites/contracts';
import { z } from 'zod';
import Link from 'next/link';
import { apiRequest } from '@/lib/api-client';
import { ProtectedPage } from './protected-page';
import { PageHeader } from './ui/page-header';
import { DataTable } from './ui/data-table';
import { Badge } from './ui/badge';
import { Select } from './ui/select';
import { Label } from './ui/label';
import { WorkflowForm, choices, useOrgPermission } from './ui/workflow-form';
import { recordText, type RegisterRow } from './ui/record-register';
import { EmptyState, ErrorState, LoadingIndicator } from '@clycites/ui';

type SettlementDetail = RegisterRow & {
  farmerSettlements: RegisterRow[];
  exceptions: RegisterRow[];
  statusEvents: RegisterRow[];
};
const money = (row: RegisterRow, field: string) => {
  const value = recordText(row, field);
  return value === '—'
    ? value
    : new Intl.NumberFormat('en-UG', {
        style: 'currency',
        currency: recordText(row, 'currency'),
      }).format(Number(value) / 100);
};

export function SettlementDetailView({
  organizationId,
  settlementId,
}: {
  organizationId: string;
  settlementId: string;
}) {
  const can = useOrgPermission(organizationId);
  const client = useQueryClient();
  const root = `/organizations/${organizationId}/finance`;
  const [farmerSettlementId, setFarmerSettlementId] = useState('');
  const query = useQuery({
    queryKey: ['settlement-detail', organizationId, settlementId],
    queryFn: () => apiRequest<SettlementDetail>(`${root}/settlements/${settlementId}`),
    enabled: can('settlement.read'),
  });
  const selected = query.data?.farmerSettlements.find((row) => row.id === farmerSettlementId);
  const farmerId = selected ? recordText(selected, 'farmerId') : '';
  const methods = useQuery({
    queryKey: ['register', `${root}/farmers/${farmerId}/payment-methods`],
    queryFn: () => apiRequest<RegisterRow[]>(`${root}/farmers/${farmerId}/payment-methods`),
    enabled: Boolean(farmerId) && can('payment-method.read'),
  });
  const refresh = () => {
    void client.invalidateQueries({
      queryKey: ['settlement-detail', organizationId, settlementId],
    });
    void client.invalidateQueries({ queryKey: ['finance-payments', organizationId] });
  };
  return (
    <ProtectedPage>
      <div className="mx-auto max-w-7xl space-y-7 px-4 py-8 sm:px-8">
        <PageHeader
          eyebrow="Settlement ledger"
          title={query.data ? recordText(query.data, 'settlementNumber') : 'Settlement detail'}
          description="Review farmer entitlements, deductions, statements, and outstanding exceptions."
          action={
            <Link
              href={`${root}/settlements`}
              className="text-sm font-semibold text-primary underline underline-offset-4"
            >
              All settlement runs
            </Link>
          }
        />
        {!can('settlement.read') && <p>Your role does not include settlement access.</p>}
        {query.isLoading && <LoadingIndicator label="Loading settlement" />}
        {query.error && <ErrorState message={query.error.message} />}
        {query.data && (
          <>
            <div className="flex flex-wrap items-center gap-6 border-y border-border py-4">
              <Badge>{recordText(query.data, 'status')}</Badge>
              <div>
                <p className="ledger-kicker">Source proceeds</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {money(query.data, 'sourceTotalMinor')}
                </p>
              </div>
              <div>
                <p className="ledger-kicker">Net farmer entitlement</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {money(query.data, 'netSettlementTotalMinor')}
                </p>
              </div>
            </div>
            <DataTable
              caption="Farmer entitlements"
              rows={query.data.farmerSettlements}
              columns={[
                {
                  key: 'farmer',
                  title: 'Farmer',
                  render: (row) =>
                    `${recordText(row, 'farmer.firstName')} ${recordText(row, 'farmer.lastName')}`,
                },
                {
                  key: 'number',
                  title: 'Settlement',
                  render: (row) => recordText(row, 'farmerSettlementNumber'),
                },
                {
                  key: 'gross',
                  title: 'Gross',
                  render: (row) => money(row, 'grossEntitlementMinor'),
                },
                {
                  key: 'deductions',
                  title: 'Deductions',
                  render: (row) => money(row, 'deductionsTotalMinor'),
                },
                {
                  key: 'net',
                  title: 'Net entitlement',
                  render: (row) => money(row, 'netEntitlementMinor'),
                },
                {
                  key: 'status',
                  title: 'Status',
                  render: (row) => <Badge>{recordText(row, 'status')}</Badge>,
                },
                {
                  key: 'statement',
                  title: 'Statement',
                  render: (row) =>
                    recordText(row, 'status') === 'APPROVED' ? (
                      <WorkflowForm
                        title="Issue statement"
                        path={`${root}/farmer-settlements/${row.id}/statements`}
                        schema={z.object({}).strict()}
                        fields={[]}
                        permission="farmer-statement.issue"
                        organizationId={organizationId}
                        submitLabel="Issue new statement version"
                        successMessage="Statement issued."
                        onSuccess={refresh}
                      />
                    ) : (
                      'Available after approval'
                    ),
                },
              ]}
            />
            <section className="space-y-3">
              <h2 className="font-display text-lg font-semibold">Operational exceptions</h2>
              {query.data.exceptions.length ? (
                <DataTable
                  caption="Settlement exceptions"
                  rows={query.data.exceptions}
                  columns={[
                    { key: 'code', title: 'Exception', render: (row) => recordText(row, 'code') },
                    {
                      key: 'message',
                      title: 'Detail',
                      render: (row) => recordText(row, 'message'),
                    },
                    {
                      key: 'status',
                      title: 'Status',
                      render: (row) => <Badge>{recordText(row, 'status')}</Badge>,
                    },
                  ]}
                />
              ) : (
                <EmptyState
                  title="No settlement exceptions"
                  description="No exceptions are recorded for this run."
                />
              )}
            </section>
            {can('payment-instruction.create') && (
              <section className="space-y-4 border-t border-border pt-6">
                <h2 className="font-display text-lg font-semibold">Prepare a farmer payment</h2>
                <Label>
                  Approved farmer entitlement
                  <Select
                    value={farmerSettlementId}
                    onChange={(event) => setFarmerSettlementId(event.target.value)}
                  >
                    <option value="">Select a farmer settlement…</option>
                    {query.data.farmerSettlements
                      .filter((row) => recordText(row, 'status') === 'APPROVED')
                      .map((row) => (
                        <option key={row.id} value={row.id}>
                          {recordText(row, 'farmerSettlementNumber')} ·{' '}
                          {recordText(row, 'farmer.firstName')} {recordText(row, 'farmer.lastName')}{' '}
                          · {money(row, 'netEntitlementMinor')}
                        </option>
                      ))}
                  </Select>
                </Label>
                {methods.error && <ErrorState message={methods.error.message} />}
                {selected && (
                  <WorkflowForm
                    key={selected.id}
                    title="Create payment instruction"
                    path={`${root}/payment-instructions`}
                    schema={createPaymentInstructionSchema}
                    values={{ farmerSettlementId: selected.id }}
                    fields={[
                      { name: 'instructionNumber', label: 'Instruction reference' },
                      {
                        name: 'paymentMethodId',
                        label: 'Verified payment destination',
                        type: 'select',
                        options:
                          methods.data
                            ?.filter((row) => recordText(row, 'status') === 'VERIFIED')
                            .map((row) => ({
                              value: row.id,
                              label: `${recordText(row, 'type')} · ${recordText(row, 'accountHolderName')} ···· ${recordText(row, 'accountIdentifierLast4')}`,
                            })) ?? [],
                      },
                      {
                        name: 'provider',
                        label: 'Payment provider',
                        type: 'select',
                        options: choices(['manual', 'mock']),
                      },
                      {
                        name: 'idempotencyKey',
                        label: 'Unique payment request reference',
                        description:
                          'Reuse this reference if you retry the same payment. Minimum 8 characters.',
                      },
                      {
                        name: 'scheduledFor',
                        label: 'Scheduled for',
                        type: 'datetime-local',
                        required: false,
                      },
                    ]}
                    onSuccess={refresh}
                    submitLabel="Prepare instruction"
                  />
                )}
              </section>
            )}
          </>
        )}
      </div>
    </ProtectedPage>
  );
}
