'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Route,
  ShieldCheck,
} from 'lucide-react';
import type { PublicLedgerVerificationSummary, PublicLotTraceability } from '@clycites/contracts';
import { apiRequest } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
type PublicTraceabilityWithLedger = PublicLotTraceability & {
  ledgerVerification: PublicLedgerVerificationSummary;
};

export function PublicLot({ publicId }: { publicId: string }) {
  const query = useQuery({
    queryKey: ['public-lot', publicId],
    queryFn: () => apiRequest<PublicTraceabilityWithLedger>(`/traceability/lots/${publicId}`),
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
      <LedgerVerification verification={lot.ledgerVerification} />
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

function LedgerVerification({ verification }: { verification: PublicLedgerVerificationSummary }) {
  const mismatch = verification.status === 'MISMATCH' || verification.status === 'CHAIN_BROKEN';
  const verified = verification.status === 'VERIFIED';
  const partial = verification.status === 'PARTIALLY_VERIFIED';
  const Icon = mismatch ? AlertTriangle : verified ? CheckCircle2 : partial ? ShieldCheck : Clock3;
  return (
    <section
      className={`border-b border-stone-300 py-7 ${mismatch ? 'bg-red-50 px-4' : ''}`}
      aria-labelledby="ledger-verification"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Icon
            className={mismatch ? 'text-red-700' : verified ? 'text-emerald-700' : 'text-amber-700'}
            size={22}
          />
          <div>
            <h2 id="ledger-verification" className="text-xl font-bold">
              Hedera integrity verification
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-stone-700">{verification.explanation}</p>
          </div>
        </div>
        <Badge>{verification.status}</Badge>
      </div>
      <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <PublicFact
          label="Lineage coverage"
          value={`${verification.confirmedLineageAnchorCount} of ${verification.eligibleLineageEventCount} confirmed`}
        />
        <PublicFact
          label="Network"
          value={
            verification.network
              ? `${verification.provider} · ${verification.network}`
              : 'Not submitted'
          }
        />
        <PublicFact label="Consensus time" value={verification.consensusTimestamp ?? 'Pending'} />
        <PublicFact
          label="Topic sequence"
          value={
            verification.topicSequenceNumber ? `#${verification.topicSequenceNumber}` : 'Pending'
          }
        />
      </dl>
      {verification.payloadHash && (
        <div className="mt-4 border-l-2 border-stone-300 pl-3">
          <p className="text-xs font-semibold uppercase text-stone-500">Confirmed payload hash</p>
          <code className="mt-1 block break-all text-xs text-stone-700">
            {verification.payloadHash}
          </code>
        </div>
      )}
      {verification.mirrorNodeUrl && (
        <a
          className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-emerald-800 underline"
          href={verification.mirrorNodeUrl}
          rel="noreferrer"
          target="_blank"
        >
          View Mirror Node evidence <ExternalLink size={14} />
        </a>
      )}
      <p className="mt-5 border-t border-stone-200 pt-4 text-xs leading-5 text-stone-600">
        {verification.limitation}
      </p>
    </section>
  );
}

function PublicFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-stone-500">{label}</dt>
      <dd className="mt-1 font-bold">{value}</dd>
    </div>
  );
}
