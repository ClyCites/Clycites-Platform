import { MarketplaceOrderDetail } from '@/components/marketplace-workspace';

export default async function Page({
  params,
}: {
  params: Promise<{ organizationId: string; orderId: string }>;
}) {
  const { organizationId, orderId } = await params;
  return <MarketplaceOrderDetail organizationId={organizationId} orderId={orderId} />;
}
