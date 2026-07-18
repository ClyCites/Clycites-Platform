import { Card, StatusBadge } from '@clycites/ui';

export default async function VerificationPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  return (
    <div className="mx-auto max-w-3xl px-5 py-14">
      <p className="text-sm font-bold text-leaf-700">PUBLIC TRACEABILITY</p>
      <h1 className="mt-2 font-display text-3xl font-bold text-leaf-900">
        Verify an agricultural record
      </h1>
      <Card className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Record reference</h2>
          <StatusBadge tone="neutral">Foundation placeholder</StatusBadge>
        </div>
        <code className="mt-4 block overflow-wrap-anywhere rounded-md bg-stone-100 p-3 text-stone-800">
          {publicId}
        </code>
        <p className="mt-5 text-stone-600">
          Public evidence and event history will appear here when traceability modules are
          implemented.
        </p>
      </Card>
    </div>
  );
}
