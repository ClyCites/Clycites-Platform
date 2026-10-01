import type { Metadata } from 'next';

import { OverviewView } from '@/components/dashboard/overview-view';

export const metadata: Metadata = { title: 'Overview' };

export default async function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <OverviewView organizationId={organizationId} />;
}
