import type { Metadata } from 'next';

import { FinanceView } from '@/components/dashboard/finance-view';

export const metadata: Metadata = { title: 'Analytics' };

export default async function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <FinanceView organizationId={organizationId} />;
}
