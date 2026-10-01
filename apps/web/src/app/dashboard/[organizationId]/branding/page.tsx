import type { Metadata } from 'next';

import { BrandingView } from '@/components/dashboard/branding-view';

export const metadata: Metadata = { title: 'Branding' };

export default async function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <BrandingView organizationId={organizationId} />;
}
