import { AnchorDetailView } from '@/components/traceability/anchor-detail';

export default async function Page({
  params,
}: {
  params: Promise<{ organizationId: string; anchorId: string }>;
}) {
  const { organizationId, anchorId } = await params;
  return <AnchorDetailView organizationId={organizationId} anchorId={anchorId} />;
}
