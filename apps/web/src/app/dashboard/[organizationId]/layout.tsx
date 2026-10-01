import type { ReactNode } from 'react';

import { DashboardShell } from '@/components/dashboard/dashboard-shell';

export default async function DashboardLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  return <DashboardShell organizationId={organizationId}>{children}</DashboardShell>;
}
