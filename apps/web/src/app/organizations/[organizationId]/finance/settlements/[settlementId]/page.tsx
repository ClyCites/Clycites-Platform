import { SettlementDetailView } from '@/components/settlement-detail';
export default async function Page({
  params,
}: {
  params: Promise<{ organizationId: string; settlementId: string }>;
}) {
  const { organizationId, settlementId } = await params;
  return <SettlementDetailView organizationId={organizationId} settlementId={settlementId} />;
}
