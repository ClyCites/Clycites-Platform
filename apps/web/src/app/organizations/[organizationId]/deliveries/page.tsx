import { DeliveryHistory } from '@/components/delivery-operations';
export default async function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <DeliveryHistory organizationId={organizationId} />;
}
