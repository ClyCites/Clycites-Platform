import { Card, EmptyState, StatusBadge } from '@clycites/ui';

export const metadata = { title: 'Workspace' };

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-leaf-700">COOPERATIVE WORKSPACE</p>
          <h1 className="mt-2 font-display text-3xl font-bold text-leaf-900">
            Operations dashboard
          </h1>
        </div>
        <StatusBadge tone="warning">Authentication placeholder</StatusBadge>
      </div>
      <div className="mt-8 grid gap-5 md:grid-cols-3">
        {['Farmers and farms', 'Coffee deliveries', 'Traceable lots'].map((title) => (
          <Card key={title}>
            <EmptyState
              title={title}
              description="This module will be introduced in a future product increment."
            />
          </Card>
        ))}
      </div>
    </div>
  );
}
