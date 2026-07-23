import type { Metadata } from 'next';

import { FeaturesView } from '@/components/dashboard/features-view';

export const metadata: Metadata = { title: 'Features' };

export default async function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <FeaturesView organizationId={organizationId} />;
}
