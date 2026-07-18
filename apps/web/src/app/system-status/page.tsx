import { Card } from '@clycites/ui';

import { SystemStatus } from '@/components/system-status';

export const metadata = { title: 'System status' };

export default function SystemStatusPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-14">
      <p className="text-sm font-bold text-leaf-700">PLATFORM OPERATIONS</p>
      <h1 className="mt-2 font-display text-3xl font-bold text-leaf-900">System status</h1>
      <Card className="mt-8">
        <SystemStatus />
      </Card>
    </div>
  );
}
