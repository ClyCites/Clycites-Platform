import { FarmersList } from '@/components/farmers-workspace';
export default async function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <FarmersList organizationId={organizationId} />;
}
