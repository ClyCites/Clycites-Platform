import { SharedTraceability } from '@/components/marketplace-workspace';

export default async function Page({
  params,
}: {
  params: Promise<{ organizationId: string; shareId: string }>;
}) {
  const { organizationId, shareId } = await params;
  return <SharedTraceability organizationId={organizationId} shareId={shareId} />;
}
