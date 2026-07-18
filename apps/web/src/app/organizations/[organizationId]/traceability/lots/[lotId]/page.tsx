import { LotDetail } from '@/components/traceability/lot-detail';
export default async function Page({
  params,
}: {
  params: Promise<{ organizationId: string; lotId: string }>;
}) {
  const { organizationId, lotId } = await params;
  return <LotDetail organizationId={organizationId} lotId={lotId} />;
}
