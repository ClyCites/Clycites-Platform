import type { Metadata } from 'next';

import { RolesView } from '@/components/dashboard/roles-view';

export const metadata: Metadata = { title: 'Roles' };

export default async function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <RolesView organizationId={organizationId} />;
}
