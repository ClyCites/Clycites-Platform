'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Route } from 'lucide-react';
import type { PublicLotTraceability } from '@clycites/contracts';
import { apiRequest } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
export function PublicLot({ publicId }: { publicId: string }) {
  const query = useQuery({
    queryKey: ['public-lot', publicId],
    queryFn: () => apiRequest<PublicLotTraceability>(`/traceability/lots/${publicId}`),
  });
  if (query.isLoading)
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <p>Loading traceability record...</p>
      </main>
    );
  if (query.error || !query.data)
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-2xl font-bold">Traceability record unavailable</h1>
      </main>
    );
  const lot = query.data;
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <header className="border-b-4 border-emerald-800 pb-6">
        <div className="flex items-center gap-2 text-emerald-800">
          <CheckCircle2 size={20} />
          <span className="text-sm font-bold uppercase">Published cooperative record</span>
        </div>
        <h1 className="mt-3 text-4xl font-bold">{lot.lotNumber}</h1>
        <p className="mt-2 text-lg text-stone-600">{lot.organizationName}</p>
      </header>
      <dl className="grid grid-cols-2 gap-5 border-b border-stone-300 py-7 sm:grid-cols-4">
        <div>
          <dt className="text-sm text-stone-500">Coffee</dt>
          <dd className="font-bold">{lot.commodityForm}</dd>
        </div>
        <div>
          <dt className="text-sm text-stone-500">Quantity</dt>
          <dd className="font-bold">{lot.quantity} kg</dd>
        </div>
        <div>
          <dt className="text-sm text-stone-500">Origin</dt>
          <dd className="font-bold">{lot.originDistrict}</dd>
        </div>
        <div>
          <dt className="text-sm text-stone-500">Season</dt>
          <dd className="font-bold">{lot.harvestSeason}</dd>
        </div>
      </dl>
      <section className="py-7">
        <h2 className="text-xl font-bold">Processing</h2>
        <p className="mt-2 text-stone-700">{lot.processingSummary}</p>
      </section>
      <section className="border-t border-stone-300 py-7">
        <h2 className="text-xl font-bold">Quality</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {lot.quality.map((item) => (
            <div key={item.name} className="border-b border-stone-200 py-2">
              <p className="text-sm text-stone-500">{item.name}</p>
              <p className="font-bold">
                {item.value} {item.unit}
              </p>
            </div>
          ))}
        </div>
      </section>
      <section className="border-t border-stone-300 py-7">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <Route size={20} /> Custody
        </h2>
        <div className="mt-4 grid gap-3">
          {lot.custody.map((item, index) => (
            <div
              key={`${item.fromOrganization}-${index}`}
              className="flex flex-wrap items-center justify-between gap-3 border-l-4 border-emerald-700 bg-white p-4"
            >
              <span>
                {item.fromOrganization} → {item.toOrganization}
              </span>
              <Badge>{item.status}</Badge>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
