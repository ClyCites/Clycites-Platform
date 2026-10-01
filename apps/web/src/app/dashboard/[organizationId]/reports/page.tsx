import type { Metadata } from 'next';

import { ReportsView } from '@/components/dashboard/reports-view';

export const metadata: Metadata = { title: 'Reports' };

export default async function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <ReportsView organizationId={organizationId} />;
}
