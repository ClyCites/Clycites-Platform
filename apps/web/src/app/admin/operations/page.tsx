import type { Metadata } from 'next';

import { OperationsWorkspace } from '@/components/operations-workspace';

export const metadata: Metadata = { title: 'Pilot operations' };

export default function Page() {
  return <OperationsWorkspace />;
}
