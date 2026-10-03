'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  recordExchangeRateSchema,
  issueFarmerAdvanceSchema,
  createManualReconciliationSchema,
  reviewReconciliationSchema,
  createFarmerPaymentMethodSchema,
  verifyFarmerPaymentMethodSchema,
} from '@clycites/contracts';
import { ProtectedPage } from './protected-page';
import { PageHeader } from './ui/page-header';
import { RouteTabs } from './ui/tabs';
import { WorkflowForm, choices, minorAmount, useOrgPermission } from './ui/workflow-form';
import { RecordRegister, recordText, recordValue, type RegisterRow } from './ui/record-register';
import { Label } from './ui/label';
import { Select } from './ui/select';
import { apiRequest } from '@/lib/api-client';
import { formatKampalaDateTime } from '@/lib/localization';

const currency = { name: 'currency', label: 'Currency', defaultValue: 'UGX' };
const amount = {
  name: 'amountMinor',
  label: 'Amount',
  transform: minorAmount,
  description: 'Enter the amount in the selected currency, with up to two decimal places.',
};
const money = (row: RegisterRow, key: string) =>
  new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency: recordText(row, 'currency'),
  }).format(Number(recordValue(row, key)) / 100);

export function FinanceRegisters({ organizationId }: { organizationId: string }) {
  const client = useQueryClient();
  const can = useOrgPermission(organizationId);
  const [farmerId, setFarmerId] = useState('');
  const [methodType, setMethodType] = useState('MOBILE_MONEY');
  const base = `/organizations/${organizationId}/finance`;
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['register'] });
  };
  const farmers = useQuery({
    queryKey: ['finance-farmer-options', organizationId],
    queryFn: () =>
      apiRequest<{ items: { id: string; displayName: string; farmerNumber: string }[] }>(
        `/organizations/${organizationId}/farmers?pageSize=100`,
      ),
    enabled: can('farmer.read'),
  });
  const payments = useQuery({
    queryKey: ['finance-payment-options', organizationId],
    queryFn: () =>
      apiRequest<{ id: string; instructionNumber: string }[]>(`${base}/payment-instructions`),
    enabled: can('payment-instruction.read'),
  });
  const farmerOptions =
    farmers.data?.items.map((item) => ({
      value: item.id,
      label: `${item.farmerNumber} · ${item.displayName}`,
    })) ?? [];
  return (
    <ProtectedPage>
      <div className="mx-auto max-w-[1600px] space-y-8 px-4 py-8 sm:px-8">
        <PageHeader
          eyebrow="Cooperative treasury"
          title="Finance registers"
          description="The supporting records behind farmer settlement: exchange rates, advances, reconciliation evidence, and payment destinations."
        />
        <RouteTabs
          label="Finance sections"
          items={[
            { href: `${base.replace('/finance', '')}/finance`, label: 'Proceeds' },
            { href: `${base}/settlements`, label: 'Settlements' },
            { href: `${base}/payments`, label: 'Payments' },
            { href: `${base}/registers`, label: 'Registers' },
          ]}
        />
        <div className="space-y-5">
          <RecordRegister
            title="Exchange rates"
            path={`${base}/exchange-rates`}
            organizationId={organizationId}
            permission="sale-proceeds.read"
            columns={[
              { key: 'baseCurrency', title: 'From' },
              { key: 'quoteCurrency', title: 'To' },
              { key: 'rate', title: 'Rate' },
              { key: 'source', title: 'Source' },
              {
                key: 'effectiveAt',
                title: 'Effective',
                format: (row) => formatKampalaDateTime(recordText(row, 'effectiveAt')),
              },
            ]}
          />
          <WorkflowForm
            title="Record an exchange rate"
            path={`${base}/exchange-rates`}
            schema={recordExchangeRateSchema}
            organizationId={organizationId}
            permission="sale-proceeds.record"
            onSuccess={refresh}
            fields={[
              { name: 'baseCurrency', label: 'From currency', defaultValue: 'USD' },
              { name: 'quoteCurrency', label: 'To currency', defaultValue: 'UGX' },
              { name: 'rate', label: 'Conversion rate' },
              {
                name: 'source',
                label: 'Rate source',
                type: 'select',
                options: choices(['CENTRAL_BANK', 'COMMERCIAL_BANK', 'CONTRACT_FIXED', 'MANUAL']),
              },
              { name: 'sourceReference', label: 'Source reference', required: false },
              { name: 'effectiveAt', label: 'Effective from', type: 'datetime-local' },
            ]}
          />
        </div>
        <div className="space-y-5">
          <RecordRegister
            title="Farmer advances"
            path={`${base}/farmer-advances`}
            organizationId={organizationId}
            permission="sale-proceeds.read"
            columns={[
              { key: 'reference', title: 'Reference' },
              { key: 'currency', title: 'Currency' },
              {
                key: 'issuedAmountMinor',
                title: 'Issued',
                format: (row) => money(row, 'issuedAmountMinor'),
              },
              {
                key: 'outstandingMinor',
                title: 'Outstanding',
                format: (row) => money(row, 'outstandingMinor'),
              },
              {
                key: 'issuedAt',
                title: 'Issued on',
                format: (row) => formatKampalaDateTime(recordText(row, 'issuedAt')),
              },
            ]}
          />
          <WorkflowForm
            title="Issue a farmer advance"
            path={`${base}/farmer-advances`}
            schema={issueFarmerAdvanceSchema}
            organizationId={organizationId}
            permission="sale-proceeds.record"
            onSuccess={refresh}
            fields={[
              { name: 'farmerId', label: 'Farmer', type: 'select', options: farmerOptions },
              { name: 'reference', label: 'Advance reference' },
              currency,
              { ...amount, name: 'issuedAmountMinor' },
              { name: 'issuedAt', label: 'Issue date and time', type: 'datetime-local' },
            ]}
          />
        </div>
        <div className="space-y-5">
          <RecordRegister
            title="Payment reconciliations"
            path={`${base}/reconciliations`}
            organizationId={organizationId}
            permission="payment-reconciliation.read"
            columns={[
              { key: 'externalReference', title: 'External reference' },
              { key: 'paymentInstruction.instructionNumber', title: 'Instruction' },
              { key: 'amountMinor', title: 'Amount', format: (row) => money(row, 'amountMinor') },
              { key: 'status', title: 'Status', status: true },
              { key: 'valueDate', title: 'Value date' },
            ]}
            actions={(row) => (
              <WorkflowForm
                title="Review reconciliation"
                path={`${base}/reconciliations/${row.id}/review`}
                schema={reviewReconciliationSchema}
                organizationId={organizationId}
                permission="payment-reconciliation.confirm"
                onSuccess={refresh}
                fields={[
                  {
                    name: 'status',
                    label: 'Decision',
                    type: 'select',
                    options: choices(['CONFIRMED', 'REJECTED']),
                  },
                  { name: 'notes', label: 'Review notes', type: 'textarea' },
                ]}
                submitLabel="Record review"
              />
            )}
          />
          <WorkflowForm
            title="Record reconciliation evidence"
            path={`${base}/reconciliations`}
            schema={createManualReconciliationSchema}
            values={{ evidenceMetadata: {} }}
            organizationId={organizationId}
            permission="payment-reconciliation.create"
            onSuccess={refresh}
            fields={[
              {
                name: 'paymentInstructionId',
                label: 'Payment instruction',
                type: 'select',
                options:
                  payments.data?.map((item) => ({
                    value: item.id,
                    label: item.instructionNumber,
                  })) ?? [],
              },
              { name: 'externalReference', label: 'Bank or provider reference' },
              currency,
              amount,
              { name: 'valueDate', label: 'Value date', type: 'date' },
              { name: 'notes', label: 'Evidence notes', type: 'textarea', required: false },
            ]}
          />
        </div>
        <section className="space-y-5">
          <div>
            <p className="ledger-kicker">Farmer record</p>
            <h2 className="mt-1 font-display text-lg font-semibold">Payment destinations</h2>
          </div>
          <Label className="max-w-md">
            Select a farmer
            <Select value={farmerId} onChange={(event) => setFarmerId(event.target.value)}>
              <option value="">Choose farmer…</option>
              {farmerOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Label>
          {farmerId && (
            <>
              <RecordRegister
                title="Verified payment destinations"
                path={`${base}/farmers/${farmerId}/payment-methods`}
                organizationId={organizationId}
                permission="payment-method.read"
                columns={[
                  { key: 'type', title: 'Type' },
                  { key: 'provider', title: 'Provider' },
                  { key: 'accountHolderName', title: 'Account holder' },
                  { key: 'accountIdentifierLast4', title: 'Last four digits' },
                  { key: 'status', title: 'Status', status: true },
                ]}
                actions={(row) =>
                  recordText(row, 'status') === 'PENDING_VERIFICATION' ? (
                    <WorkflowForm
                      title="Verify destination"
                      path={`${base}/payment-methods/${row.id}/verify`}
                      schema={verifyFarmerPaymentMethodSchema}
                      fields={[]}
                      organizationId={organizationId}
                      permission="payment-method.verify"
                      onSuccess={refresh}
                      submitLabel="Mark verified"
                    />
                  ) : null
                }
              />
              <Label className="max-w-md">
                New destination type
                <Select value={methodType} onChange={(event) => setMethodType(event.target.value)}>
                  {choices(['MOBILE_MONEY', 'BANK_ACCOUNT', 'OTHER', 'CASH']).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Label>
              <WorkflowForm
                key={`${farmerId}-${methodType}`}
                title="Add a payment destination"
                path={`${base}/farmers/${farmerId}/payment-methods`}
                schema={createFarmerPaymentMethodSchema}
                values={{
                  type: methodType,
                  ...(methodType === 'CASH' ? { provider: 'manual' } : {}),
                }}
                fields={[
                  ...(methodType !== 'CASH'
                    ? [
                        { name: 'provider', label: 'Provider' },
                        {
                          name: 'accountIdentifier',
                          label: 'Account number or mobile money number',
                          type: 'password' as const,
                        },
                      ]
                    : []),
                  { name: 'accountHolderName', label: 'Account holder name' },
                  { name: 'isDefault', label: 'Use as default', type: 'checkbox' },
                ]}
                organizationId={organizationId}
                permission="payment-method.manage"
                onSuccess={refresh}
              />
            </>
          )}
        </section>
      </div>
    </ProtectedPage>
  );
}
