import { ReceiptView } from '@/components/delivery-operations';
export default async function Page({
  params,
}: {
  params: Promise<{ organizationId: string; deliveryId: string }>;
}) {
  const { organizationId, deliveryId } = await params;
  return <ReceiptView organizationId={organizationId} deliveryId={deliveryId} />;
}
