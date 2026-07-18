import { DeliveryDetailView } from '@/components/delivery-operations';
export default async function Page({
  params,
}: {
  params: Promise<{ organizationId: string; deliveryId: string }>;
}) {
  const { organizationId, deliveryId } = await params;
  return <DeliveryDetailView organizationId={organizationId} deliveryId={deliveryId} />;
}
