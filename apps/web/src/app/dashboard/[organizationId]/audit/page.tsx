import type { Metadata } from 'next';

import { AuditView } from '@/components/dashboard/audit-view';

export const metadata: Metadata = { title: 'Audit' };

export default async function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <AuditView organizationId={organizationId} />;
}
