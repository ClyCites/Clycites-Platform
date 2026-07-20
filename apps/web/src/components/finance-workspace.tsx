'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Calculator, Landmark, ReceiptText, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';

import { ProtectedPage } from '@/components/protected-page';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiRequest } from '@/lib/api-client';

type Proceeds = {
  id: string;
  proceedsNumber: string;
  status: string;
  currency: string;
  expectedAmountMinor: string;
  recordedAmountMinor: string;
  version: number;
  order: { orderNumber: string };
};
type Settlement = {
  id: string;
  settlementNumber: string;
  status: string;
  currency: string;
  sourceTotalMinor: string;
  netSettlementTotalMinor: string;
  version: number;
  _count?: { orders: number; farmerSettlements: number; exceptions: number };
};
type Payment = {
  id: string;
  instructionNumber: string;
  status: string;
  currency: string;
  amountMinor: string;
  provider: string;
  version: number;
  farmer: { farmerNumber: string; firstName: string; lastName: string };
  paymentMethod: { type: string; accountIdentifierLast4: string | null };
};
type Policy = {
  id: string;
  code: string;
  name: string;
  status: string;
  type: string;
  value: string;
  policyVersion: number;
};

const money = (minor: string, currency: string) =>
  new Intl.NumberFormat('en-UG', { style: 'currency', currency }).format(Number(minor) / 100);

function FinanceShell({
  organizationId,
  title,
  children,
}: {
  organizationId: string;
  title: string;
  children: React.ReactNode;
}) {
  const links = [
    ['finance', 'Proceeds'],
    ['finance/settlements', 'Settlements'],
    ['finance/payments', 'Payments'],
    ['finance/policies', 'Deductions'],
  ];
  return (
    <ProtectedPage>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-5 border-b border-stone-300 pb-5">
          <div>
            <p className="text-sm font-bold text-emerald-800">FINANCE WORKSPACE</p>
            <h1 className="mt-2 font-display text-3xl font-bold text-stone-950">{title}</h1>
          </div>
          <nav className="flex max-w-full gap-5 overflow-x-auto text-sm font-bold text-stone-600">
            {links.map(([path, label]) => (
              <Link key={path} href={`/organizations/${organizationId}/${path}`}>
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-7">{children}</div>
      </main>
    </ProtectedPage>
  );
}

function ErrorMessage({ error }: { error: Error | null }) {
  return error ? (
    <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      {error.message}
    </p>
  ) : null;
}

export function FinanceProceeds({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const query = useQuery({
    queryKey: ['finance-proceeds', organizationId],
    queryFn: () => apiRequest<Proceeds[]>(`/organizations/${organizationId}/finance/sale-proceeds`),
  });
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest(`/organizations/${organizationId}/finance/sale-proceeds`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setShowForm(false);
      return queryClient.invalidateQueries({ queryKey: ['finance-proceeds', organizationId] });
    },
  });
  const verify = useMutation({
    mutationFn: (record: Proceeds) =>
      apiRequest(`/organizations/${organizationId}/finance/sale-proceeds/${record.id}/verify`, {
        method: 'POST',
        body: JSON.stringify({ version: record.version }),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['finance-proceeds', organizationId] }),
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    create.mutate({
      orderId: data.get('orderId'),
      proceedsNumber: data.get('proceedsNumber'),
      currency: data.get('currency'),
      expectedAmountMinor: data.get('expectedAmountMinor'),
      recordedAmountMinor: data.get('recordedAmountMinor'),
      source: 'MANUAL_EXTERNAL_REFERENCE',
      externalReference: data.get('externalReference'),
      valueDate: data.get('valueDate'),
    });
  };
  return (
    <FinanceShell organizationId={organizationId} title="Sale proceeds">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-2xl text-sm text-stone-600">
          Record external receipts against completed, buyer-accepted orders.
        </p>
        <Button onClick={() => setShowForm((value) => !value)}>
          <ReceiptText className="size-4" /> {showForm ? 'Close' : 'Record proceeds'}
        </Button>
      </div>
      {showForm && (
        <Card className="mt-5">
          <CardHeader>
            <h2 className="font-bold">New proceeds record</h2>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={submit}>
              {[
                ['orderId', 'Order ID'],
                ['proceedsNumber', 'Proceeds number'],
                ['expectedAmountMinor', 'Expected amount (minor)'],
                ['recordedAmountMinor', 'Received amount (minor)'],
                ['externalReference', 'External reference'],
                ['valueDate', 'Value date'],
              ].map(([name, label]) => (
                <Label key={name}>
                  {label}
                  <Input
                    className="mt-1"
                    name={name}
                    required
                    type={name === 'valueDate' ? 'date' : 'text'}
                  />
                </Label>
              ))}
              <Label>
                Currency
                <Input className="mt-1" name="currency" defaultValue="UGX" required />
              </Label>
              <div className="flex items-end">
                <Button className="w-full" disabled={create.isPending} type="submit">
                  Save record
                </Button>
              </div>
            </form>
            <ErrorMessage error={create.error} />
          </CardContent>
        </Card>
      )}
      <div className="mt-6 grid gap-3">
        <ErrorMessage error={query.error} />
        {query.data?.map((record) => (
          <Card key={record.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-bold text-stone-950">{record.proceedsNumber}</p>
                <p className="text-sm text-stone-500">Order {record.order.orderNumber}</p>
              </div>
              <div className="text-right">
                <p className="font-bold">{money(record.recordedAmountMinor, record.currency)}</p>
                <p className="text-xs text-stone-500">
                  Expected {money(record.expectedAmountMinor, record.currency)}
                </p>
              </div>
              <Badge>{record.status}</Badge>
              {record.status === 'RECORDED' && (
                <Button disabled={verify.isPending} onClick={() => verify.mutate(record)}>
                  <Check className="size-4" /> Verify
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </FinanceShell>
  );
}

export function FinanceSettlements({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['finance-settlements', organizationId],
    queryFn: () => apiRequest<Settlement[]>(`/organizations/${organizationId}/finance/settlements`),
  });
  const action = useMutation({
    mutationFn: ({ settlement, name }: { settlement: Settlement; name: string }) =>
      apiRequest(`/organizations/${organizationId}/finance/settlements/${settlement.id}/${name}`, {
        method: 'POST',
        body: JSON.stringify({ version: settlement.version }),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['finance-settlements', organizationId] }),
  });
  return (
    <FinanceShell organizationId={organizationId} title="Settlement runs">
      <ErrorMessage error={query.error ?? action.error} />
      <div className="grid gap-4 lg:grid-cols-2">
        {query.data?.map((settlement) => (
          <Card key={settlement.id}>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <div>
                <p className="font-bold">{settlement.settlementNumber}</p>
                <p className="text-sm text-stone-500">
                  {settlement._count?.farmerSettlements ?? 0} farmer settlements
                </p>
              </div>
              <Badge>{settlement.status}</Badge>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {money(settlement.netSettlementTotalMinor, settlement.currency)}
              </p>
              <p className="mt-1 text-xs text-stone-500">
                Source {money(settlement.sourceTotalMinor, settlement.currency)}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {settlement.status === 'DRAFT' && (
                  <Button onClick={() => action.mutate({ settlement, name: 'calculate' })}>
                    <Calculator className="size-4" /> Calculate
                  </Button>
                )}
                {settlement.status === 'CALCULATED' && (
                  <Button onClick={() => action.mutate({ settlement, name: 'submit' })}>
                    Submit for approval
                  </Button>
                )}
                {settlement.status === 'PENDING_APPROVAL' && (
                  <Button onClick={() => action.mutate({ settlement, name: 'approve' })}>
                    <Check className="size-4" /> Approve
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </FinanceShell>
  );
}

export function FinancePayments({ organizationId }: { organizationId: string }) {
  const query = useQuery({
    queryKey: ['finance-payments', organizationId],
    queryFn: () =>
      apiRequest<Payment[]>(`/organizations/${organizationId}/finance/payment-instructions`),
  });
  return (
    <FinanceShell organizationId={organizationId} title="Payment instructions">
      <div className="mb-5 flex items-center justify-between">
        <p className="text-sm text-stone-600">
          Manual and mock submissions remain pending until reconciliation is confirmed.
        </p>
        <IconButton title="Refresh" onClick={() => void query.refetch()}>
          <RefreshCw className="size-4" />
        </IconButton>
      </div>
      <ErrorMessage error={query.error} />
      <div className="grid gap-3">
        {query.data?.map((payment) => (
          <Card key={payment.id}>
            <CardContent className="grid items-center gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
              <div>
                <p className="font-bold">
                  {payment.farmer.firstName} {payment.farmer.lastName}
                </p>
                <p className="text-xs text-stone-500">
                  {payment.instructionNumber} · {payment.farmer.farmerNumber}
                </p>
              </div>
              <p className="font-bold">{money(payment.amountMinor, payment.currency)}</p>
              <p className="text-sm text-stone-600">
                {payment.paymentMethod.type} ····{' '}
                {payment.paymentMethod.accountIdentifierLast4 ?? 'cash'}
              </p>
              <Badge>{payment.status}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </FinanceShell>
  );
}

export function FinancePolicies({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['finance-policies', organizationId],
    queryFn: () =>
      apiRequest<Policy[]>(`/organizations/${organizationId}/finance/deduction-policies`),
  });
  const approve = useMutation({
    mutationFn: (policy: Policy) =>
      apiRequest(
        `/organizations/${organizationId}/finance/deduction-policies/${policy.id}/approve`,
        { method: 'POST' },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['finance-policies', organizationId] }),
  });
  return (
    <FinanceShell organizationId={organizationId} title="Deduction policies">
      <div className="mb-5 flex items-center gap-3">
        <Landmark className="size-5 text-emerald-800" />
        <p className="text-sm text-stone-600">
          Only separately approved, effective policy versions are used in new calculations.
        </p>
      </div>
      <ErrorMessage error={query.error ?? approve.error} />
      <div className="grid gap-4 lg:grid-cols-2">
        {query.data?.map((policy) => (
          <Card key={policy.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-bold">{policy.name}</p>
                <p className="text-sm text-stone-500">
                  {policy.code} v{policy.policyVersion} · {policy.type} · {policy.value}
                </p>
              </div>
              <Badge>{policy.status}</Badge>
              {policy.status === 'DRAFT' && (
                <Button onClick={() => approve.mutate(policy)}>
                  <Check className="size-4" /> Approve
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </FinanceShell>
  );
}
