'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, EmptyState, ErrorState, LoadingIndicator, StatusBadge } from '@clycites/ui';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';

import { ProtectedPage } from '@/components/protected-page';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiRequest } from '@/lib/api-client';

type Listing = {
  id: string;
  title: string;
  listingNumber: string;
  status: string;
  listedQuantity: string;
  availableQuantity: string;
  quantityUnit: string;
  currency: string;
  askingUnitPriceMinor: string | null;
  version: number;
  sellerOrganization: { name: string };
  lot: { lotNumber: string; commodity: { name: string }; commodityForm: { name: string } };
};
type Offer = {
  id: string;
  offerNumber: string;
  status: string;
  quantity: string;
  currency: string;
  unitPriceMinor: string;
  totalAmountMinor: string;
  version: number;
  listing: { title: string };
  buyerOrganization: { name: string };
};
type Contract = {
  id: string;
  contractNumber: string;
  status: string;
  quantity: string;
  currency: string;
  totalAmountMinor: string;
  version: number;
  sellerOrganization: { name: string };
  buyerOrganization: { name: string };
  order: { id: string; orderNumber: string; status: string } | null;
};

const money = (minor: string | null, currency: string) =>
  minor === null
    ? 'Negotiable'
    : new Intl.NumberFormat('en-UG', { style: 'currency', currency }).format(Number(minor) / 100);

function Shell({
  organizationId,
  children,
}: {
  organizationId: string;
  children: React.ReactNode;
}) {
  return (
    <ProtectedPage>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-300 pb-5">
          <div>
            <p className="text-sm font-bold text-leaf-700">COMMERCIAL WORKSPACE</p>
            <h1 className="mt-2 font-display text-3xl font-bold text-leaf-950">Lot marketplace</h1>
          </div>
          <nav className="flex gap-4 text-sm font-bold text-stone-600">
            <Link href={`/organizations/${organizationId}/marketplace`}>Listings</Link>
            <Link href={`/organizations/${organizationId}/marketplace/offers`}>Offers</Link>
            <Link href={`/organizations/${organizationId}/marketplace/contracts`}>Contracts</Link>
          </nav>
        </div>
        <div className="mt-7">{children}</div>
      </main>
    </ProtectedPage>
  );
}

function QueryState({ loading, error }: { loading: boolean; error: Error | null }) {
  if (loading) return <LoadingIndicator />;
  if (error) return <ErrorState message={error.message} />;
  return null;
}

export function MarketplaceListings({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const query = useQuery({
    queryKey: ['marketplace-listings', organizationId],
    queryFn: () => apiRequest<Listing[]>(`/organizations/${organizationId}/marketplace/listings`),
  });
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest(`/organizations/${organizationId}/marketplace/listings`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['marketplace-listings', organizationId] }),
  });
  const publish = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      apiRequest(`/organizations/${organizationId}/marketplace/listings/${id}/publish`, {
        method: 'POST',
        body: JSON.stringify({ version }),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['marketplace-listings', organizationId] }),
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    create.mutate({
      lotId: data.get('lotId'),
      listingNumber: data.get('listingNumber'),
      title: data.get('title'),
      listedQuantity: data.get('quantity'),
      currency: data.get('currency'),
      pricingMethod: data.get('pricingMethod'),
      askingUnitPriceMinor: data.get('askingUnitPriceMinor') || undefined,
      allowPartialQuantity: data.get('allowPartialQuantity') === 'on',
      visibility: 'PUBLIC_BUYERS',
    });
  };
  return (
    <Shell organizationId={organizationId}>
      <div>
        <div className="flex flex-wrap justify-between gap-4">
          <h2 className="text-lg font-bold text-stone-950">Available lots</h2>
          <Button type="button" onClick={() => setShowCreate((value) => !value)}>
            {showCreate ? 'Close form' : 'Create listing'}
          </Button>
        </div>
        <div className="mt-6">
          <QueryState loading={query.isLoading} error={query.error} />
          {query.data?.length === 0 && (
            <EmptyState
              title="No marketplace listings"
              description="Approved lots can be published here."
            />
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {query.data?.map((listing) => (
              <Card key={listing.id} className="border-l-4 border-l-leaf-700">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold text-stone-500">{listing.listingNumber}</p>
                    <h2 className="mt-1 text-lg font-bold text-stone-950">{listing.title}</h2>
                    <p className="text-sm text-stone-600">
                      {listing.sellerOrganization.name} · {listing.lot.commodity.name}{' '}
                      {listing.lot.commodityForm.name}
                    </p>
                  </div>
                  <StatusBadge tone={listing.status === 'PUBLISHED' ? 'positive' : 'warning'}>
                    {listing.status}
                  </StatusBadge>
                </div>
                <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-stone-200 pt-4 text-sm">
                  <div>
                    <dt className="text-stone-500">Available</dt>
                    <dd className="font-bold">
                      {listing.availableQuantity} {listing.quantityUnit}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-stone-500">Price</dt>
                    <dd className="font-bold">
                      {money(listing.askingUnitPriceMinor, listing.currency)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-stone-500">Lot</dt>
                    <dd className="font-bold">{listing.lot.lotNumber}</dd>
                  </div>
                </dl>
                <div className="mt-5 flex gap-3">
                  <Link
                    className="text-sm font-bold text-leaf-800 underline"
                    href={`/organizations/${organizationId}/marketplace/listings/${listing.id}`}
                  >
                    Open listing
                  </Link>
                  {['DRAFT', 'PAUSED'].includes(listing.status) && (
                    <Button
                      type="button"
                      onClick={() => publish.mutate({ id: listing.id, version: listing.version })}
                    >
                      Publish
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
        {showCreate && (
          <Card className="mt-6">
            <form className="grid gap-4 md:grid-cols-2" onSubmit={submit}>
              <div>
                <Label htmlFor="lotId">Approved lot ID</Label>
                <Input id="lotId" name="lotId" required />
              </div>
              <div>
                <Label htmlFor="listingNumber">Listing number</Label>
                <Input id="listingNumber" name="listingNumber" required />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="title">Title</Label>
                <Input id="title" name="title" required />
              </div>
              <div>
                <Label htmlFor="quantity">Quantity (kg)</Label>
                <Input id="quantity" name="quantity" placeholder="100.0000" required />
              </div>
              <div>
                <Label htmlFor="currency">Currency</Label>
                <Input id="currency" name="currency" defaultValue="UGX" maxLength={3} required />
              </div>
              <div>
                <Label htmlFor="pricingMethod">Pricing method</Label>
                <select
                  id="pricingMethod"
                  name="pricingMethod"
                  className="mt-1 min-h-10 w-full rounded-md border border-stone-300 bg-white px-3"
                >
                  <option value="NEGOTIABLE">Negotiable</option>
                  <option value="FIXED_PRICE">Fixed price</option>
                  <option value="REQUEST_FOR_OFFERS">Request for offers</option>
                </select>
              </div>
              <div>
                <Label htmlFor="askingUnitPriceMinor">Unit price (minor units)</Label>
                <Input id="askingUnitPriceMinor" name="askingUnitPriceMinor" inputMode="numeric" />
              </div>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" name="allowPartialQuantity" /> Allow partial quantities
              </label>
              <div className="md:col-span-2">
                <Button type="submit" disabled={create.isPending}>
                  Save draft
                </Button>
                {create.error && (
                  <p className="mt-2 text-sm text-red-700">{create.error.message}</p>
                )}
              </div>
            </form>
          </Card>
        )}
      </div>
    </Shell>
  );
}

export function MarketplaceOffers({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['marketplace-offers', organizationId],
    queryFn: () => apiRequest<Offer[]>(`/organizations/${organizationId}/marketplace/offers`),
  });
  const accept = useMutation({
    mutationFn: (offer: Offer) =>
      apiRequest(`/organizations/${organizationId}/marketplace/offers/${offer.id}/accept`, {
        method: 'POST',
        body: JSON.stringify({ version: offer.version }),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['marketplace-offers', organizationId] }),
  });
  return (
    <Shell organizationId={organizationId}>
      <QueryState loading={query.isLoading} error={query.error} />
      <div className="space-y-3">
        {query.data?.map((offer) => (
          <Card key={offer.id} className="grid items-center gap-4 md:grid-cols-[1fr_auto_auto]">
            <div>
              <p className="text-xs font-bold text-stone-500">{offer.offerNumber}</p>
              <h2 className="font-bold">{offer.listing.title}</h2>
              <p className="text-sm text-stone-600">{offer.buyerOrganization.name}</p>
            </div>
            <div>
              <p className="font-bold">{offer.quantity} kg</p>
              <p className="text-sm text-stone-600">
                {money(offer.totalAmountMinor, offer.currency)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge tone={offer.status === 'ACCEPTED' ? 'positive' : 'warning'}>
                {offer.status}
              </StatusBadge>
              {offer.status === 'SUBMITTED' && (
                <Button type="button" onClick={() => accept.mutate(offer)}>
                  Accept
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </Shell>
  );
}

export function MarketplaceContracts({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['marketplace-contracts', organizationId],
    queryFn: () => apiRequest<Contract[]>(`/organizations/${organizationId}/commerce/contracts`),
  });
  const approve = useMutation({
    mutationFn: (contract: Contract) =>
      apiRequest(`/organizations/${organizationId}/commerce/contracts/${contract.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ version: contract.version }),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['marketplace-contracts', organizationId] }),
  });
  return (
    <Shell organizationId={organizationId}>
      <QueryState loading={query.isLoading} error={query.error} />
      <div className="space-y-3">
        {query.data?.map((contract) => (
          <Card key={contract.id} className="grid items-center gap-4 md:grid-cols-[1fr_auto_auto]">
            <div>
              <p className="text-xs font-bold text-stone-500">{contract.contractNumber}</p>
              <h2 className="font-bold">
                {contract.sellerOrganization.name} → {contract.buyerOrganization.name}
              </h2>
              <p className="text-sm text-stone-600">
                {contract.quantity} kg · {money(contract.totalAmountMinor, contract.currency)}
              </p>
            </div>
            <StatusBadge
              tone={
                contract.status === 'ACTIVE' || contract.status === 'FULFILLED'
                  ? 'positive'
                  : 'warning'
              }
            >
              {contract.status}
            </StatusBadge>
            <div className="flex gap-3">
              {contract.status.startsWith('PENDING_') && (
                <Button type="button" onClick={() => approve.mutate(contract)}>
                  Approve
                </Button>
              )}
              {contract.order && (
                <Link
                  className="text-sm font-bold text-leaf-800 underline"
                  href={`/organizations/${organizationId}/marketplace/orders/${contract.order.id}`}
                >
                  {contract.order.orderNumber}
                </Link>
              )}
            </div>
          </Card>
        ))}
      </div>
    </Shell>
  );
}

export function SharedTraceability({
  organizationId,
  shareId,
}: {
  organizationId: string;
  shareId: string;
}) {
  const query = useQuery({
    queryKey: ['shared-trace', organizationId, shareId],
    queryFn: () =>
      apiRequest<Record<string, unknown>>(
        `/organizations/${organizationId}/commerce/traceability-shares/${shareId}`,
      ),
  });
  return (
    <Shell organizationId={organizationId}>
      <QueryState loading={query.isLoading} error={query.error} />
      {query.data && (
        <Card>
          <h2 className="text-lg font-bold">Shared evidence</h2>
          <pre className="mt-4 max-h-144 overflow-auto whitespace-pre-wrap rounded-md bg-stone-950 p-4 text-xs text-stone-100">
            {JSON.stringify(query.data, null, 2)}
          </pre>
        </Card>
      )}
    </Shell>
  );
}

export function MarketplaceListingDetail({
  organizationId,
  listingId,
}: {
  organizationId: string;
  listingId: string;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['marketplace-listing', organizationId, listingId],
    queryFn: () =>
      apiRequest<Listing>(`/organizations/${organizationId}/marketplace/listings/${listingId}`),
  });
  const offer = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest(`/organizations/${organizationId}/marketplace/listings/${listingId}/offers`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['marketplace-offers', organizationId] }),
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    offer.mutate({
      quantity: data.get('quantity'),
      unitPriceMinor: data.get('unitPriceMinor'),
      currency: query.data?.currency,
      deliveryTerm: data.get('deliveryTerm'),
      validUntil: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      message: data.get('message') || undefined,
    });
  };
  return (
    <Shell organizationId={organizationId}>
      <QueryState loading={query.isLoading} error={query.error} />
      {query.data && (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <div className="flex justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-stone-500">{query.data.listingNumber}</p>
                <h2 className="mt-1 text-2xl font-bold">{query.data.title}</h2>
                <p className="mt-2 text-stone-600">{query.data.sellerOrganization.name}</p>
              </div>
              <StatusBadge tone="positive">{query.data.status}</StatusBadge>
            </div>
            <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-stone-200 pt-5">
              <div>
                <dt className="text-sm text-stone-500">Available</dt>
                <dd className="font-bold">
                  {query.data.availableQuantity} {query.data.quantityUnit}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-stone-500">Asking price</dt>
                <dd className="font-bold">
                  {money(query.data.askingUnitPriceMinor, query.data.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-stone-500">Lot</dt>
                <dd className="font-bold">{query.data.lot.lotNumber}</dd>
              </div>
              <div>
                <dt className="text-sm text-stone-500">Product</dt>
                <dd className="font-bold">
                  {query.data.lot.commodity.name} {query.data.lot.commodityForm.name}
                </dd>
              </div>
            </dl>
          </Card>
          <Card>
            <h2 className="text-lg font-bold">Submit offer</h2>
            <form className="mt-4 space-y-4" onSubmit={submit}>
              <div>
                <Label htmlFor="offerQuantity">Quantity</Label>
                <Input id="offerQuantity" name="quantity" required />
              </div>
              <div>
                <Label htmlFor="unitPriceMinor">Unit price (minor units)</Label>
                <Input id="unitPriceMinor" name="unitPriceMinor" inputMode="numeric" required />
              </div>
              <div>
                <Label htmlFor="deliveryTerm">Delivery term</Label>
                <Input id="deliveryTerm" name="deliveryTerm" required />
              </div>
              <div>
                <Label htmlFor="message">Message</Label>
                <Input id="message" name="message" />
              </div>
              <Button type="submit" disabled={offer.isPending}>
                Submit offer
              </Button>
              {offer.error && <p className="text-sm text-red-700">{offer.error.message}</p>}
              {offer.isSuccess && (
                <p className="text-sm font-semibold text-leaf-800">Offer submitted.</p>
              )}
            </form>
          </Card>
        </div>
      )}
    </Shell>
  );
}

type OrderDetail = {
  id: string;
  orderNumber: string;
  status: string;
  quantity: string;
  quantityUnit: string;
  currency: string;
  totalAmountMinor: string;
  version: number;
  custodyTransfer: { transferNumber: string; status: string } | null;
  statusEvents: Array<{
    id: string;
    toStatus: string;
    occurredAt: string;
    reasonCode: string | null;
  }>;
};

export function MarketplaceOrderDetail({
  organizationId,
  orderId,
}: {
  organizationId: string;
  orderId: string;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['marketplace-order', organizationId, orderId],
    queryFn: () =>
      apiRequest<OrderDetail>(`/organizations/${organizationId}/commerce/orders/${orderId}`),
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['marketplace-order', organizationId, orderId] });
  const sync = useMutation({
    mutationFn: () =>
      apiRequest(`/organizations/${organizationId}/commerce/orders/${orderId}/sync-custody`, {
        method: 'POST',
      }),
    onSuccess: refresh,
  });
  const acceptance = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest(`/organizations/${organizationId}/commerce/orders/${orderId}/acceptance`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: refresh,
  });
  const accept = () => {
    if (!query.data) return;
    acceptance.mutate({
      decision: 'ACCEPTED',
      acceptedQuantity: query.data.quantity,
      rejectedQuantity: '0.0000',
    });
  };
  return (
    <Shell organizationId={organizationId}>
      <QueryState loading={query.isLoading} error={query.error} />
      {query.data && (
        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <Card>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold text-stone-500">{query.data.orderNumber}</p>
                <h2 className="mt-1 text-2xl font-bold">Fulfillment</h2>
              </div>
              <StatusBadge tone={query.data.status === 'COMPLETED' ? 'positive' : 'warning'}>
                {query.data.status}
              </StatusBadge>
            </div>
            <p className="mt-5 font-bold">
              {query.data.quantity} {query.data.quantityUnit} ·{' '}
              {money(query.data.totalAmountMinor, query.data.currency)}
            </p>
            <p className="mt-2 text-sm text-stone-600">
              Custody:{' '}
              {query.data.custodyTransfer
                ? `${query.data.custodyTransfer.transferNumber} · ${query.data.custodyTransfer.status}`
                : 'Not attached'}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button
                type="button"
                onClick={() => sync.mutate()}
                disabled={!query.data.custodyTransfer || sync.isPending}
              >
                Sync custody
              </Button>
              {['RECEIVED', 'PENDING_BUYER_INSPECTION'].includes(query.data.status) && (
                <Button type="button" onClick={accept} disabled={acceptance.isPending}>
                  Accept full order
                </Button>
              )}
            </div>
          </Card>
          <Card>
            <h2 className="text-lg font-bold">Status history</h2>
            <ol className="mt-4 space-y-4 border-l border-stone-300 pl-4">
              {query.data.statusEvents.map((event) => (
                <li key={event.id}>
                  <p className="font-bold">{event.toStatus}</p>
                  <p className="text-xs text-stone-500">
                    {new Date(event.occurredAt).toLocaleString()} ·{' '}
                    {event.reasonCode ?? 'Status updated'}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      )}
    </Shell>
  );
}
