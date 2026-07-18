import { Card, StatusBadge } from '@clycites/ui';
import Link from 'next/link';

const workflow = [
  ['01', 'Capture at source', 'Record farmer deliveries and quality at rural collection points.'],
  ['02', 'Build traceable lots', 'Preserve provenance as deliveries become market-ready lots.'],
  ['03', 'Settle transparently', 'Calculate and reconcile clear, auditable farmer settlements.'],
];

export default function HomePage() {
  return (
    <>
      <section className="border-b border-stone-200 bg-[radial-gradient(circle_at_85%_20%,#d7e8c8_0,transparent_35%),linear-gradient(135deg,#f8f5e9,#e9f1e3)]">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-[1.3fr_0.7fr] md:py-24">
          <div>
            <StatusBadge tone="positive">Foundation release</StatusBadge>
            <h1 className="mt-6 max-w-4xl font-display text-4xl font-bold leading-tight text-leaf-900 sm:text-6xl">
              ClyCites Verifiable Agriculture Platform
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-stone-700">
              Infrastructure for trusted agricultural trade across Uganda and Africa, designed for
              offline collection, end-to-end traceability, and transparent farmer settlements.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                className="rounded-md bg-leaf-700 px-5 py-3 font-semibold text-white hover:bg-leaf-900"
                href="/dashboard"
              >
                Open workspace
              </Link>
              <Link
                className="rounded-md border border-stone-400 bg-white px-5 py-3 font-semibold text-stone-800 hover:bg-stone-50"
                href="/system-status"
              >
                View system status
              </Link>
            </div>
          </div>
          <div className="hidden items-end md:flex" aria-hidden="true">
            <div className="w-full border-l-4 border-amber-500 pl-6 text-leaf-900">
              <p className="font-display text-3xl font-bold">Field to market</p>
              <p className="mt-2 text-stone-600">Evidence carried through every handoff.</p>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-5 py-14" aria-labelledby="workflow-heading">
        <h2 id="workflow-heading" className="font-display text-3xl font-bold text-leaf-900">
          A trustworthy chain of record
        </h2>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {workflow.map(([number, title, description]) => (
            <Card key={number} className="border-t-4 border-t-amber-500">
              <p className="text-sm font-bold text-leaf-700">{number}</p>
              <h3 className="mt-4 text-xl font-bold text-stone-900">{title}</h3>
              <p className="mt-3 leading-7 text-stone-600">{description}</p>
            </Card>
          ))}
        </div>
      </section>
    </>
  );
}
